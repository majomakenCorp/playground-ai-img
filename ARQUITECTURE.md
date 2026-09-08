# AI Playground — Image Generation

Architectural roadmap for a Next.js application that centralizes access to multiple AI image-generation providers (Google Gemini "Nano Banana 2" / Gemini 3 Flash Image, Recraft, and any future providers) behind a single authenticated playground UI.

---

## 1. Goals & Scope

- **Single-purpose internal tool**: a private playground for generating, previewing, and comparing images across providers.
- **Multi-provider by design**: provider selection via UI; adding a new provider should be a contained, well-defined task (one new file in a providers folder + one registry entry).
- **Transparent cost & usage**: every response surfaces input/output tokens (or the provider's closest equivalent metric) directly on the UI.
- **Local-first persistence**: generated images are written to disk on the server; prompt history feeds the sidebar from a local store.
- **Single-environment, direct-to-production deployment**: one Dockerized artifact, no dev/staging branching, no CI/CD pipeline complexity.

### Non-goals

- Multi-tenant accounts, RBAC, or organizations.
- Cloud object storage (S3, GCS) — out of scope by design.
- Background job queues — image generation is synchronous request/response.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 15+ (App Router)** | Server Components, Route Handlers for API, built-in streaming, single-process deploy. |
| Language | **TypeScript (strict)** | Provider abstraction relies on shared interfaces; strict mode catches drift between providers. |
| Styling | **Tailwind CSS** (only) | Per project constraints. No other CSS frameworks. |
| UI components | **shadcn/ui** | Copy-in components, fully Tailwind-styled, no runtime CSS dep. |
| Auth | **Static password + signed JWT cookie** | Single shared password from env, no user store needed. |
| History store | **MongoDB 7 via `mongoose` 8** | Document store fits the variable `raw_usage` payload per provider; runs as a sidecar via Docker Compose. |
| Image storage | **Local filesystem** (`generate-images/`) | Required by spec; mounted as Docker volume. |
| Validation | **Zod** | Runtime validation of request bodies and provider response shapes. |
| Runtime | **Node.js 22 LTS** | Native `fs/promises`, stable `crypto` for JWT signing, supported by Next.js. |
| Container | **Docker + Docker Compose** (multi-stage app + Mongo sidecar) | Single `docker compose up` brings the full stack up; Mongo data persists in a named volume. |

---

## 3. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Browser (Next.js client)                      │
│   /login   /  /  (Sidebar + Playground + Image Viewer)           │
└─────────────────────────────┬────────────────────────────────────┘
                              │ httpOnly JWT cookie
┌─────────────────────────────▼────────────────────────────────────┐
│                    Next.js Server (App Router)                   │
│                                                                  │
│  middleware.ts  ── auth guard for protected routes               │
│                                                                  │
│  Route Handlers (app/api/*)                                      │
│   • POST /api/auth/login         password → JWT cookie           │
│   • POST /api/auth/logout        clear cookie                    │
│   • POST /api/generate           provider dispatch + persist     │
│   • GET  /api/history            list past prompts               │
│   • GET  /api/images/[id]        stream image from disk          │
│                                                                  │
│  Provider Abstraction (lib/providers/*)                          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  ImageProvider interface                                 │   │
│   │   ├─ GeminiProvider   (Nano Banana 2 / Flash Image)      │   │
│   │   └─ RecraftProvider                                     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Persistence Layer (lib/storage/*)                               │
│   • Mongoose repo (history)      • FS writer (images)            │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
         ./generate-images/        mongodb://mongo:27017/playground
         (host bind mount)         (Docker Compose service "mongo")
```

---

## 4. Folder Structure

```
playground-gen-img-ai/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx                # Single-input login form
│   ├── (protected)/
│   │   ├── layout.tsx                  # Sidebar + main shell, requires auth
│   │   └── page.tsx                    # Playground (prompt + provider select + result)
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts          # POST: validate password, set JWT cookie
│   │   │   └── logout/route.ts         # POST: clear cookie
│   │   ├── generate/route.ts           # POST: dispatch to provider, save, persist history
│   │   ├── history/route.ts            # GET:  list of HistoryItem
│   │   └── images/[id]/route.ts        # GET:  stream binary from generate-images/
│   ├── layout.tsx                      # Root html/body, font, providers
│   └── globals.css                     # Tailwind directives only
│
├── components/
│   ├── ui/                             # shadcn/ui generated components
│   ├── playground/
│   │   ├── PromptForm.tsx
│   │   ├── ProviderSelect.tsx
│   │   ├── ResultPanel.tsx             # Image + token usage
│   │   └── TokenUsageBadge.tsx
│   ├── sidebar/
│   │   ├── HistorySidebar.tsx
│   │   └── HistoryItem.tsx
│   └── auth/
│       └── LoginForm.tsx
│
├── lib/
│   ├── auth/
│   │   ├── jwt.ts                      # sign/verify helpers
│   │   └── session.ts                  # readSession() server util
│   ├── providers/
│   │   ├── types.ts                    # ImageProvider interface, shared DTOs
│   │   ├── registry.ts                 # id → provider map (single source of truth)
│   │   ├── gemini.ts                   # Nano Banana 2 implementation
│   │   ├── recraft.ts                  # Recraft implementation
│   │   └── errors.ts                   # ProviderError taxonomy
│   ├── storage/
│   │   ├── images.ts                   # writeImage(), resolveImagePath()
│   │   ├── mongo.ts                    # mongoose connection singleton (HMR-safe)
│   │   ├── models/
│   │   │   └── History.ts              # Mongoose schema + model
│   │   └── history.ts                  # insertHistory(), listHistory()
│   ├── validation/
│   │   └── schemas.ts                  # Zod: GenerateRequest, etc.
│   └── env.ts                          # Validated env loader (Zod)
│
├── middleware.ts                       # Route-level auth guard
│
├── generate-images/                    # ← Generated images live here
│   └── .gitkeep                        # Tracked empty; real files mounted as volume
│
├── docker-compose.yml                  # app + mongo services
│

├── public/
│   └── (static assets only — never user-generated content)
│
├── Dockerfile
├── .dockerignore
├── .env.example
├── next.config.ts                      # output: 'standalone'
├── tailwind.config.ts
├── components.json                     # shadcn/ui config
├── tsconfig.json
└── package.json
```

### Filesystem layout — important rules

- `generate-images/` is **outside** `public/`. We never let Next.js serve it statically. All access goes through `/api/images/[id]`, which enforces auth and prevents path-traversal.
- `generate-images/` is bind-mounted into the app container so generated files survive redeploys.
- MongoDB data lives in a named Docker volume (`playground_mongo_data`) attached to the `mongo` service, **not** in this repo's working tree.

---

## 5. Authentication Flow

A deliberately minimal design: one shared password, one signed cookie, one middleware guard.

### 5.1 Environment

```
APP_PASSWORD=<shared secret used to log in>
AUTH_SECRET=<32+ byte random secret, used to sign JWTs>
APP_ORIGIN=<public URL, used for Origin/Referer checks>
GEMINI_API_KEY=...
RECRAFT_API_KEY=...
MONGODB_URI=mongodb://app:<pw>@mongo:27017/playground?authSource=playground
# Compose-only — used by the mongo service to bootstrap its root user
MONGO_INITDB_ROOT_USERNAME=root
MONGO_INITDB_ROOT_PASSWORD=<strong>
MONGO_APP_USERNAME=app
MONGO_APP_PASSWORD=<strong>
```

`lib/env.ts` validates these at boot with Zod and **throws on missing values** — the app will not start with a misconfigured secret.

### 5.2 Login

1. User submits the login form to `POST /api/auth/login` with `{ password }`.
2. The handler does a **constant-time comparison** (`crypto.timingSafeEqual`) between the submitted password and `APP_PASSWORD`.
3. On match, the server signs a JWT (`{ sub: "playground", iat, exp }`) using `AUTH_SECRET` (HS256, ~7-day expiry) and sets it as an `httpOnly`, `Secure`, `SameSite=Lax` cookie named `pg_session`.
4. The client redirects to `/`.

### 5.3 Session enforcement

- **`middleware.ts`** runs on every request matching the protected matcher (everything except `/login`, `/api/auth/*`, and Next.js internals).
- It verifies the JWT signature and expiration. On failure → redirect to `/login` (for HTML) or `401` (for `/api/*`).
- A small server util `readSession()` is reused by Route Handlers that need extra checks.

### 5.4 Logout

`POST /api/auth/logout` clears the cookie with `Max-Age=0`. No server-side state to revoke (stateless JWT).

### 5.5 Threat model notes

- Brute-force: rate-limit the login endpoint by IP using an in-memory token bucket (acceptable for single-instance deploy).
- CSRF on `/api/generate`: cookie is `SameSite=Lax`; mutating endpoints additionally check `Origin`/`Referer` against the configured `APP_ORIGIN`.
- The password is never written to logs or DB.

---

## 6. API Integration Strategy

The core abstraction is an **`ImageProvider` interface** that every backend implements identically. The route handler talks only to the interface; provider-specific quirks are isolated.

### 6.1 The interface

```ts
// lib/providers/types.ts
export type ProviderId = "gemini-nano-banana-2" | "recraft";

export interface GenerateInput {
  prompt: string;
  // future: size, style, seed, negativePrompt — added uniformly across providers
}

export interface TokenUsage {
  inputTokens: number;     // normalized — see §6.3
  outputTokens: number;
  totalTokens: number;     // inputTokens + outputTokens
  raw: unknown;            // original provider usage block, kept verbatim
}

export interface GenerateOutput {
  imageBytes: Buffer;      // raw binary written to disk by the route handler
  mimeType: string;        // e.g. "image/png"
  usage: TokenUsage;
  providerMetadata: Record<string, unknown>; // model id, finish reason, etc.
}

export interface ImageProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  generate(input: GenerateInput): Promise<GenerateOutput>;
}
```

### 6.2 The registry

```ts
// lib/providers/registry.ts
export const providers: Record<ProviderId, ImageProvider> = {
  "gemini-nano-banana-2": new GeminiProvider(env.GEMINI_API_KEY),
  "recraft":              new RecraftProvider(env.RECRAFT_API_KEY),
};
```

The UI's provider selector is populated from `Object.values(providers).map(p => ({ id, displayName }))` — **one source of truth** for "which providers exist."

### 6.3 Token usage normalization

Different APIs report usage differently. The provider implementation is responsible for mapping into `TokenUsage`:

| Provider | Source field(s) | Mapping |
|---|---|---|
| Gemini Nano Banana 2 | `usageMetadata.promptTokenCount`, `usageMetadata.candidatesTokenCount`, `usageMetadata.totalTokenCount` | direct |
| Recraft | image-generation cost is reported as **credits**, not tokens | `inputTokens = 0`, `outputTokens = credits`, `raw` retains the original payload |

The UI labels the metric as "Tokens / Units" and renders the `raw` object behind a "Details" disclosure so nothing is hidden.

### 6.4 Errors

A single `ProviderError` class with discriminated `kind` (`"auth"`, `"rate_limit"`, `"invalid_request"`, `"upstream"`, `"timeout"`). The route handler maps it to consistent HTTP responses regardless of which provider failed.

### 6.5 Adding a new provider

1. Create `lib/providers/<name>.ts` implementing `ImageProvider`.
2. Add an entry to `registry.ts`.
3. Add the API key to `lib/env.ts` and `.env.example`.

No UI changes. No other code changes.

---

## 7. Storage & History Strategy

### 7.1 Image persistence

- On a successful generation, the route handler:
  1. Generates a UUID v7 (`id`).
  2. Determines extension from `mimeType` (whitelist: `png`, `jpg`, `webp`).
  3. Writes `generate-images/<id>.<ext>` via `fs/promises.writeFile`, with mode `0o640`.
  4. Inserts a row in `history` with the relative filename.
- Reads go through `GET /api/images/[id]`:
  - Auth guard via middleware.
  - `id` validated as UUID — no other characters allowed.
  - Path is rebuilt server-side as `path.join(IMAGES_DIR, id + ext)` and confirmed to be a child of `IMAGES_DIR` (`path.relative` check) — defends against path traversal even if validation is bypassed.
  - File is streamed back with the stored `mimeType` and `Cache-Control: private, max-age=31536000, immutable`.

### 7.2 History persistence (MongoDB + Mongoose)

MongoDB is chosen because:
- The `raw_usage` payload differs per provider; a document store stores it natively without `JSON.stringify`/`JSON.parse` ceremony.
- Mongoose gives us schema validation at the app boundary while leaving the underlying field flexible.
- Runs as a sidecar via Docker Compose — one `docker compose up` brings the full stack up.

#### Schema (Mongoose)

```ts
// lib/storage/models/History.ts
import { Schema, model, models } from "mongoose";

const HistorySchema = new Schema(
  {
    _id:           { type: String, required: true },          // uuid v7
    providerId:    { type: String, required: true, index: true },
    prompt:        { type: String, required: true },
    imageFilename: { type: String, required: true },          // "<id>.png", relative to generate-images/
    mimeType:      { type: String, required: true },
    inputTokens:   { type: Number, required: true, min: 0 },
    outputTokens:  { type: Number, required: true, min: 0 },
    totalTokens:   { type: Number, required: true, min: 0 },
    rawUsage:      { type: Schema.Types.Mixed, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },        // Mongo manages createdAt
    versionKey: false,
    _id: false,                                               // we supply our own
  },
);

HistorySchema.index({ createdAt: -1 });

export const History = models.History ?? model("History", HistorySchema);
```

#### Connection (HMR-safe singleton)

`lib/storage/mongo.ts` caches the `mongoose.connect` promise on `globalThis` so Next.js's dev hot-reload does not open a new connection per file change. Production runs a single connection per container.

```ts
// lib/storage/mongo.ts (sketch)
import "server-only";
import mongoose from "mongoose";
import { env } from "@/lib/env";

const g = globalThis as unknown as { _mongoose?: Promise<typeof mongoose> };

export function connectMongo() {
  return (g._mongoose ??= mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5_000,
  }));
}
```

Repository helpers in `lib/storage/history.ts` await `connectMongo()` once at module load, then use `History.create(...)` / `History.find(...).sort({ createdAt: -1 }).limit(n)` for inserts and cursor-paginated reads.

No migration runner is warranted today — Mongoose validates documents at write time and the schema is single-source.

### 7.3 Sidebar history feed

- `GET /api/history?limit=50&before=<created_at>` returns recent items, newest first, with cursor pagination.
- Items are kept lean: `{ id, createdAt, providerId, prompt, imageUrl }` where `imageUrl = /api/images/<id>`.
- The sidebar fetches on mount and refetches (or optimistically prepends) after each successful generation.
- Clicking an item rehydrates the prompt + result panel (read-only view of a past run).

### 7.4 Why not browser storage?

The history must be **shared across browsers** and survive cache clears for a single-user internal tool. localStorage was rejected for that reason.

### 7.5 Why MongoDB over SQLite?

An earlier draft used SQLite. We switched because:
- Provider `raw_usage` payloads have wildly different shapes (Gemini's `usageMetadata`, Recraft's credit object, future providers). Storing them as `JSON` in SQL forced a parse/serialize seam in every read; in Mongo it's just a document field.
- The deploy story is already containerized — adding a `mongo` service to Compose is one more service definition, not an architectural shift.
- Future post-MVP needs (full-text search on prompts, side-by-side comparison queries) map cleanly to Mongo's text indexes and aggregation pipeline.

The tradeoff: one more running process and a small operational footprint (Mongo's named volume must be backed up). Acceptable for an internal tool.

---

## 8. UI Composition

- The protected layout (`app/(protected)/layout.tsx`) renders a two-pane shell: a fixed-width left **`HistorySidebar`** and a right-hand main area.
- The main area on `/` contains:
  - `ProviderSelect` (shadcn `Select` or `Tabs`, populated from the registry).
  - `PromptForm` (shadcn `Textarea` + `Button`).
  - `ResultPanel` showing the image, the prompt, and a `TokenUsageBadge` with input/output/total + a "Raw usage" disclosure.
- Loading and error states use shadcn primitives (`Skeleton`, `Alert`).
- All styling is Tailwind utility classes; **no other CSS framework, no inline `<style>`, no CSS Modules**.

---

## 9. Docker Deployment Strategy

A multi-stage `Dockerfile` produces a lean app image; `docker-compose.yml` wires that image together with a `mongo` sidecar. Direct-to-production: the same artifact you build is the one you run.

### 9.1 Build configuration

`next.config.ts` sets `output: 'standalone'` so the production stage only needs the standalone server bundle and the static assets.

### 9.2 Multi-stage Dockerfile (outline)

```dockerfile
# ---------- 1. deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. builder ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build         # produces .next/standalone + .next/static

# ---------- 3. runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Non-root user
RUN addgroup -S app && adduser -S app -G app

# Standalone server + static assets only
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public

# Persistent dir for generated images (Mongo data lives in its own service)
RUN mkdir -p /app/generate-images && chown -R app:app /app/generate-images
VOLUME ["/app/generate-images"]

USER app
EXPOSE 3000
CMD ["node", "server.js"]
```

### 9.3 Image hardening

- `node:22-alpine` base — small surface area.
- Non-root `app` user; only the two writable directories (`generate-images/`, `data/`) are owned by it.
- No build toolchain, no `npm` in the runner stage.
- `.dockerignore` excludes `node_modules`, `.next`, `.git`, `.env*`, `generate-images/*`.

### 9.4 Runtime — `docker-compose.yml`

Two services share a private `playground` network. Mongo is **not** published to the host (only reachable from `app`).

```yaml
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_INITDB_ROOT_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_INITDB_ROOT_PASSWORD}
    volumes:
      - mongo_data:/data/db
    networks: [playground]
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 10s
      timeout: 3s
      retries: 5

  app:
    build: .
    restart: unless-stopped
    env_file: .env
    depends_on:
      mongo:
        condition: service_healthy
    ports: ["3000:3000"]
    volumes:
      - ./generate-images:/app/generate-images
    networks: [playground]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  mongo_data:

networks:
  playground:
```

Operational notes:
- All secrets injected via `.env` (read by Compose); no `.env` is baked into the image.
- A reverse proxy (nginx/Caddy/Traefik) terminates TLS in front of port 3000. `Secure` cookies require this.
- `docker compose up -d --build` brings the stack up; `docker compose logs -f app` tails the application.
- For backups, snapshot the named volume `mongo_data` (e.g. `docker run --rm -v playground_mongo_data:/src -v $(pwd):/dest alpine tar -czf /dest/mongo-$(date +%F).tgz -C /src .`) and the `generate-images/` host directory together.

### 9.5 Resource sizing

Image generation is I/O-bound (waiting on upstream APIs); a single `app` container instance is sufficient. Mongo handles the concurrency we'll see well below its defaults. If the workload ever justifies horizontal scaling, the local-FS image dir is the bottleneck (multiple `app` replicas would all need to share it via NFS or move to object storage) — explicitly out of scope today.

---


### 9.6 Vercel target (documented deviation, September 2026)

The single-container, direct-to-production model above remains the reference
architecture. A second target was added so the team can test logo edit prompts
without a local stack: the Vercel project `glyph-playground` (team
`molt-solutions`), deployed with the Vercel CLI from the repository folder.

| Concern | Compose (reference) | Vercel (deviation) |
|---|---|---|
| Process model | one long-lived Node container | Fluid Compute functions, `maxDuration = 300` on `/api/edit` |
| MongoDB | `mongo:7` sidecar on a private network | MongoDB Atlas via the `mongodbatlas` Marketplace integration (`MONGODB_URI`) |
| Image storage | bind mount `./generate-images` (or R2) | Cloudflare R2 only (read-only, ephemeral filesystem) |
| Claude CLI bridge | host bind mount, `CLAUDE_REFINE_ENABLED=true` | absent, `CLAUDE_REFINE_ENABLED=false` |
| Login rate limit | in-memory, effective | in-memory per instance, backstop only |
| TLS / `Secure` cookie | reverse proxy | platform (`NODE_ENV=production`) |
| Node | 22 (`.nvmrc`, Dockerfile) | 22.x via `package.json` `engines` |

The application code is identical; only environment differs. `.vercelignore`
keeps `.claude/`, `.agents/`, `.env*`, tests and Docker files out of the upload.

## 10. Security Checklist

- [x] Static password compared in constant time.
- [x] JWT signed with a strong `AUTH_SECRET`, rotated by redeploy.
- [x] `httpOnly` + `Secure` + `SameSite=Lax` cookies.
- [x] Origin/Referer check on mutating routes.
- [x] Rate limit on `/api/auth/login`.
- [x] All user-supplied IDs validated (UUID-only) before filesystem access.
- [x] Path traversal defense via `path.relative` containment check.
- [x] Generated images never served from `public/`; only via authenticated API.
- [x] Provider API keys read from env, never returned to the client.
- [x] Zod validation on every request body.
- [x] Container runs as non-root.

---

## 11. Roadmap (post-MVP, non-binding)

- Image variations / seed reuse.
- Side-by-side comparison of the same prompt across providers.
- FTS5 search over prompt history.
- Per-provider parameter panels (style, size, negative prompt) driven by a schema declared on each provider.
- Export a history item (image + prompt + usage) as a single JSON+image bundle.
