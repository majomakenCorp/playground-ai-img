<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project runs **Next.js 16.2.4 + React 19.2 + Tailwind v4 + shadcn/ui (radix-nova)**.
APIs, conventions, and file structure differ from older training data.
**Before writing or editing any framework-touching code, read the relevant guide in `node_modules/next/dist/docs/`** and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## 1. What this project is

A single-tenant internal **AI image-generation playground**: one shared password, multi-provider (Gemini "Nano Banana 2", Recraft, future), local-first persistence (SQLite + filesystem), shipped as a single Docker image.

Source of truth for architecture: [`ARQUITECTURE.md`](./ARQUITECTURE.md). Do not invent structure outside that doc — propose changes to the doc first.

Spec-driven development plan: [`SPEC.md`](./SPEC.md).

---

## 2. Stack — locked

| Concern | Choice | Locked |
|---|---|---|
| Framework | Next.js 16 (App Router) | yes |
| Runtime | Node.js 22 (Next 16 needs ≥20.9) | yes |
| Language | TypeScript strict | yes |
| Styling | Tailwind v4 only — `@import "tailwindcss"` | yes — **no other CSS framework, no CSS modules, no inline `<style>`** |
| UI primitives | shadcn/ui (style: `radix-nova`, base color `neutral`), Radix UI, lucide-react | yes |
| Auth | Static password + signed JWT in httpOnly cookie | yes |
| DB | MongoDB 7 via Mongoose 8 (sidecar via Docker Compose) | yes |
| Image storage | Local FS at `generate-images/` (mounted volume) | yes |
| Validation | Zod | yes |
| AI SDKs | `@google/generative-ai` for Gemini; raw `fetch` for Recraft | yes |
| Container | Multi-stage Docker, `output: "standalone"`, orchestrated via `docker-compose.yml` | yes |

**Do not add**: Redux, react-query, axios, any UI lib other than shadcn/Radix, any CSS-in-JS, ORMs, framework wrappers, or "BFF" layers. Keep deps lean.

---

## 3. Next.js 16 gotchas — read this before writing code

These diverge from older Next.js training data. Getting any of these wrong silently breaks the app.

### 3.1 `middleware.ts` is deprecated → use `proxy.ts`

ARQUITECTURE.md says `middleware.ts`; in this codebase we implement it as `proxy.ts` (Node.js runtime only).

```ts
// proxy.ts
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(req: NextRequest) {
  // auth check, return NextResponse.redirect / NextResponse.json(...)
}

export const config = {
  matcher: ["/((?!login|api/auth|_next|favicon.ico).*)"],
};
```

Codemod available: `npx @next/codemod@canary middleware-to-proxy .`.

### 3.2 `cookies()`, `headers()`, `params`, `searchParams` are **async**

Always `await` them. Type `params` as `Promise<…>`.

```ts
// app/api/images/[id]/route.ts
import { cookies } from "next/headers";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const jar = await cookies();
  // ...
}
```

Run `npx next typegen` to generate `PageProps`/`RouteContext` types.

### 3.3 Fetch caching is OFF by default; route handlers are dynamic by default

Bare `fetch()` is **not cached**. `GET` route handlers are dynamic. Provider calls do not need cache opt-out — that is already the default. If you ever need caching, opt in explicitly:

```ts
await fetch(url, { cache: "force-cache" });
// or, at module top:
export const fetchCache = "default-cache";
export const dynamic = "force-static";
```

### 3.4 Turbopack is the default bundler

`next dev` and `next build` use Turbopack. **Do not add `webpack` config** to `next.config.ts` — builds will fail. If you must use Webpack, opt out per-script: `next build --webpack`. Place Turbopack config under top-level `turbopack: { … }`, not `experimental.turbopack`.

### 3.5 `next/image` defaults tightened

- `qualities` defaults to `[75]` only — pass `quality={75}` or configure `images.qualities`.
- `imageSizes` no longer includes `16`.
- Local query-string sources must be allowlisted via `images.localPatterns`.
- We currently serve generated images via the `/api/images/[id]` route (not `next/image`), so this rarely hits us.

### 3.6 `cacheLife`/`cacheTag` no longer `unstable_`

```ts
import { cacheLife, cacheTag } from "next/cache"; // not unstable_…
```

`revalidateTag(tag, profile)` requires a second argument: `revalidateTag("history", "max")`.

### 3.7 Parallel routes need `default.js`

`(auth)` and `(protected)` here are **route groups** (parentheses), not parallel routes (`@slot`). No `default.js` is required for groups. Don't confuse the two.

### 3.8 Scroll behavior

If you set `scroll-behavior: smooth` in CSS, also add `data-scroll-behavior="smooth"` to `<html>` — Next 16 stopped force-overriding it.

### 3.9 ESLint flat config

`eslint.config.mjs` (already in repo) is the only supported format.

---

## 4. Folder layout (this repo)

The project uses the `src/` convention. Map ARQUITECTURE.md paths accordingly:

| ARQUITECTURE.md says | This repo |
|---|---|
| `app/…` | `src/app/…` |
| `components/…` | `src/components/…` |
| `lib/…` | `src/lib/…` |
| `middleware.ts` (root) | `proxy.ts` (root) — see §3.1 |
| `generate-images/` | `generate-images/` (host bind mount) |
| `data/` (SQLite) | **gone** — history lives in MongoDB now (see ARQUITECTURE.md §7.2) |

Path alias: `@/*` → `./src/*`.

shadcn aliases (from `components.json`):
- `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`

---

## 5. Conventions

### 5.1 Server vs client components

- **Default to Server Components.** Only mark `"use client"` when you need state, effects, browser APIs, or event handlers.
- Route handlers and server-only utilities go in `src/lib/**`. Add `import "server-only"` to anything that must never reach the client (DB, env, JWT signing).
- Client components live next to their server parents but never import server-only modules.

### 5.2 shadcn/ui

- Add components via `npx shadcn@latest add <name>` (style is already `radix-nova`).
- Edit generated components freely; do not vendor a parallel UI library.
- Tailwind tokens are defined in `src/app/globals.css` under `@theme inline`. Use semantic tokens (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `bg-sidebar`, `border-border`) instead of raw color shades.

### 5.3 Validation

Every API route validates its input with Zod (`src/lib/validation/schemas.ts`). On failure, return `400` with `{ error, issues }`.

### 5.4 Errors

Provider failures throw `ProviderError` (kind: `auth | rate_limit | invalid_request | upstream | timeout`). Route handler maps to HTTP. Never leak provider keys, raw stack traces, or upstream payloads to the client.

### 5.5 Filesystem & path safety

For any user-supplied id touching the filesystem:
1. Validate as UUID v7.
2. Rebuild the path server-side: `path.join(IMAGES_DIR, id + ext)`.
3. Confirm `path.relative(IMAGES_DIR, full)` does not start with `..` and is not absolute.

Never serve generated images from `public/`.

### 5.6 Secrets

`src/lib/env.ts` validates env at boot with Zod and **throws** on missing values. App must refuse to start with a misconfigured secret. No env access outside that module.

### 5.7 Logging

Use `console.error` for unexpected failures (captured by container stdout). Never log: passwords, JWTs, full prompts of failed auth attempts, raw API keys, full upstream response bodies. Tokens-usage logging is fine.

---

## 6. Run / Build / Lint

```bash
# install
npm ci

# dev (Turbopack, hot reload)
npm run dev

# typecheck (no emit)
npx tsc --noEmit

# lint
npm run lint

# build (Turbopack, produces .next/standalone)
npm run build
npm start
```

Before declaring a task done: `npm run lint && npx tsc --noEmit && npm run build`. UI changes additionally require manual browser verification of golden + edge paths.

---

## 7. Docker

Multi-stage `Dockerfile` (app) + `docker-compose.yml` (app + `mongo:7` sidecar) per ARQUITECTURE.md §9. The `deps` and `builder` stages use `node:22-alpine`; the `runner` stage uses `node:22-bookworm-slim` so it can execute the host's glibc-based Claude CLI when bind-mounted (see "Claude Code CLI bridge" below). App runs as the host user at runtime (`user: "${HOST_UID}:${HOST_GID}"`). Mongo data lives in a named Docker volume (`mongo_data`); generated images bind-mount from `./generate-images`. Reverse proxy terminates TLS — `Secure` cookies require it. Local stack: `docker compose up -d --build`.

**Mongoose connection rule:** always go through `connectMongo()` from `@/lib/storage/mongo.ts`. Never call `mongoose.connect()` directly elsewhere — the helper caches the connection on `globalThis` so Next.js HMR doesn't leak sockets.

**Bind-mount permission gotcha:** the container runs as the UID/GID specified in `.env` (default `1000:1000`). On a fresh checkout, populate them with `echo "HOST_UID=$(id -u)" >> .env && echo "HOST_GID=$(id -g)" >> .env` and ensure `./generate-images` is writable by that user, otherwise `/api/generate` returns 500 `storage_failed`.

**Claude Code CLI bridge (documented exception to "everything in Docker"):** when `CLAUDE_REFINE_ENABLED=true`, `docker-compose.yml` bind-mounts `/usr/bin/claude`, `/usr/lib/node_modules/@anthropic-ai/claude-code`, `${HOME}/.claude` (rw, for token refresh), and `${HOME}/.claude.json` (rw, the main CLI config — sibling of `.claude/`, not inside it; the CLI errors out "configuration file not found" if missing) into the `app` container so brief refinement can shell out to the host's subscription-authed CLI. The CLI runs with `--disallowedTools "*"` so no host FS/Bash access is reachable through it. See `docs/sdd-claude-provider.md` for the full design and threat model. Disable this feature (`CLAUDE_REFINE_ENABLED=false`) in any environment that doesn't have the host CLI installed.

---

## 8. Security non-negotiables

(Mirrors ARQUITECTURE.md §10 — keep both lists in sync.)

- Constant-time password compare (`crypto.timingSafeEqual`).
- JWT HS256 with `AUTH_SECRET` (≥32 bytes), 7-day expiry.
- Cookies: `httpOnly`, `Secure`, `SameSite=Lax`, name `pg_session`.
- Origin/Referer check on all mutating routes against `APP_ORIGIN`.
- In-memory IP rate limit on `/api/auth/login`.
- All ids validated as UUIDs before any FS read.
- `path.relative` containment check in `/api/images/[id]`.
- API keys server-only; never embedded in client bundles or responses.
- Container runs as non-root `app`.

If you propose work that conflicts with any item above, stop and surface the conflict to the human first.

---

## 9. Testing & verification

There is no test runner yet (out of scope for MVP). Verify changes manually:

1. Login with `APP_PASSWORD`, confirm cookie is set with the right flags.
2. Generate one image per provider; confirm file appears under `generate-images/` and a row appears in `data/history.db`.
3. Reload sidebar, confirm history is in newest-first order.
4. Click a history item, confirm prompt + image rehydrate.
5. Hit `/api/images/<bad-uuid>` and `/api/images/../etc/passwd` — both must `400`/`404`, never serve files.
6. Logout, confirm cookie cleared and `/` redirects to `/login`.

Report what was tested vs not tested in the final summary.

---

## 10. Adding a provider

Per ARQUITECTURE.md §6.5: one new file under `src/lib/providers/<name>.ts` implementing `ImageProvider`, one entry in `registry.ts`, one env var added to `lib/env.ts` and `.env.example`. **No UI changes** — the selector reads from the registry.

If a change requires the UI to know about provider specifics (e.g. per-provider parameter panels), it goes in the post-MVP roadmap, not the MVP.

---

## 11. Process

- **Don't add features the spec doesn't ask for.** Bug fixes don't get refactor side-orders. No "future-proof" abstractions.
- **Don't over-comment.** Code names should explain the *what*; comments only when *why* is non-obvious.
- **Read the relevant Next 16 doc** in `node_modules/next/dist/docs/` before touching framework surface area.
- **When unsure, ask.** Especially for: auth flow tweaks, schema changes, dependency additions, anything that creates external state.
