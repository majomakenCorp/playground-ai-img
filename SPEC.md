# SPEC.md — Spec-Driven Development Plan

Derived from [`ARQUITECTURE.md`](./ARQUITECTURE.md). Every feature below must trace back to a section there.

This is a **build order**, not a backlog. Specs are sequenced so that earlier features unblock later ones with the smallest possible review surface per step. Each spec has: **Why**, **Scope**, **Out of scope**, **Public API/contract**, **Acceptance criteria**, **Verification**, and **Files**.

Status legend: `[ ] todo`, `[~] in progress`, `[x] done`.

---

## Milestones

| # | Milestone | Specs |
|---|---|---|
| M0 | Foundation | F-01, F-02 |
| M1 | Auth | A-01, A-02 |
| M2 | Provider abstraction | P-01, P-02, P-03 |
| M3 | Generate + persistence | G-01, S-01, S-02 |
| M4 | Image streaming | I-01 |
| M5 | UI shell | U-01, U-02, U-03 |
| M6 | History feed | H-01 |
| M7 | Hardening | X-01, X-02 |
| M8 | Docker + deploy | D-01 |

Each milestone is a logical PR boundary.

---

## M0 — Foundation

### F-01 — Env loader & config
- **Why** ARQUITECTURE.md §5.1, §6: every secret/config flows through one validated module; app must refuse to start without them.
- **Scope** `src/lib/env.ts` exports a frozen `env` object validated by Zod. Supported keys: `APP_PASSWORD`, `AUTH_SECRET` (≥32 chars), `GEMINI_API_KEY`, `RECRAFT_API_KEY`, `APP_ORIGIN`, `MONGODB_URI` (validated with `z.string().url()` plus `mongodb` scheme check), `NODE_ENV`, optional `PORT`, optional `IMAGES_DIR` (default `./generate-images`).
- **Out of scope** Provider client construction; only string parsing and existence checks.
- **Contract** `import { env } from "@/lib/env"`. Add `import "server-only"` at the top.
- **Acceptance**
  1. Missing/short `AUTH_SECRET` → process throws on first import with a readable message.
  2. `env` is `Readonly<…>`; mutation triggers TS error.
  3. No env access anywhere else in `src/**` (lint or convention enforced via review).
- **Verification** Run `npm run dev` with `.env` empty → app fails to boot. Restore `.env` → app boots.
- **Files** `src/lib/env.ts`.

### F-02 — Project scaffolding
- **Why** ARQUITECTURE.md §4 folder layout adapted to `src/` convention.
- **Scope** Create empty `generate-images/` (already exists) with `.gitkeep`. Create folder skeletons under `src/lib/{auth,providers,storage,validation}`, `src/lib/storage/models/`, and `src/components/{auth,sidebar,playground}`.
- **Out of scope** Implementation files.
- **Acceptance** `tree src` matches the layout in `AGENTS.md` §4. `.gitignore` excludes `generate-images/*` but keeps `.gitkeep`.
- **Files** `.gitignore`, `data/.gitkeep`, etc.

---

## M1 — Auth

### A-01 — JWT helpers + session reader
- **Why** ARQUITECTURE.md §5.2, §5.3.
- **Scope**
  - `src/lib/auth/jwt.ts`: `signSession(payload)` and `verifySession(token)` using HS256 with `env.AUTH_SECRET`. 7-day expiry. Implement with Node `crypto` (no extra deps).
  - `src/lib/auth/session.ts`: `readSession()` reads the `pg_session` cookie via `await cookies()` (Next 16 async — see AGENTS.md §3.2) and returns `{ sub } | null`.
- **Contract** `signSession({ sub: "playground" }) → string`; `verifySession(token) → Payload | null` (never throws on bad signature).
- **Acceptance**
  1. Round-trip sign/verify succeeds.
  2. Tampered token → `verifySession` returns `null`.
  3. Expired token → `verifySession` returns `null`.
  4. `readSession()` returns `null` when cookie absent.
- **Verification** Unit-style scratch script under `scripts/` is fine; remove before merge.
- **Files** `src/lib/auth/jwt.ts`, `src/lib/auth/session.ts`.

### A-02 — Login / Logout routes + `proxy.ts` guard
- **Why** ARQUITECTURE.md §5.2–§5.5; AGENTS.md §3.1 (`proxy.ts`, not `middleware.ts`).
- **Scope**
  - `POST /api/auth/login`: Zod-validate `{ password: string }`; constant-time compare against `env.APP_PASSWORD`; on match, set `pg_session` cookie (`httpOnly`, `Secure`, `SameSite=Lax`, 7-day Max-Age). On mismatch: `401`.
  - `POST /api/auth/logout`: clear cookie with `Max-Age=0`.
  - `proxy.ts` at repo root with matcher excluding `/login`, `/api/auth/*`, `_next`, static assets, `/api/health`. On invalid/missing session: redirect to `/login` for HTML; `401` JSON for `/api/*`.
  - In-memory IP token bucket (5 attempts / 15 min) on `/api/auth/login`.
  - Origin/Referer check helper used by all mutating routes.
- **Out of scope** Login UI (M5).
- **Acceptance**
  1. With no cookie, `GET /` → 307 to `/login`.
  2. Wrong password 6× from one IP → 6th returns `429` regardless of correctness.
  3. Right password → `Set-Cookie: pg_session=…; HttpOnly; Secure; SameSite=Lax`.
  4. After login, `GET /` → 200.
  5. `POST /api/auth/login` from disallowed Origin → `403`.
- **Verification** `curl` against `npm run dev` (note: `Secure` cookie won't stick on plain HTTP — test with `APP_ORIGIN=http://localhost:3000` and a dev override flag, or via the UI once M5 lands).
- **Files** `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`, `proxy.ts`, `src/lib/auth/rateLimit.ts`, `src/lib/auth/origin.ts`.

---

## M2 — Provider abstraction

### P-01 — `ImageProvider` interface + registry skeleton
- **Why** ARQUITECTURE.md §6.1–§6.2.
- **Scope** `src/lib/providers/types.ts` with `ProviderId`, `GenerateInput`, `TokenUsage`, `GenerateOutput`, `ImageProvider`. `src/lib/providers/registry.ts` exports `providers` keyed by `ProviderId`. `src/lib/providers/errors.ts` with `ProviderError` (discriminated `kind`).
- **Acceptance** TypeScript compiles. Adding a new key to `ProviderId` triggers a `noImplicitAny`/exhaustive-switch error in registry until a provider is supplied.
- **Files** as listed.

### P-02 — Gemini provider (Nano Banana 2 / Flash Image)
- **Why** ARQUITECTURE.md §6.3 (Gemini mapping).
- **Scope** `src/lib/providers/gemini.ts` implements `ImageProvider`. Uses `@google/generative-ai`. Maps `usageMetadata.{promptTokenCount, candidatesTokenCount, totalTokenCount}` to `TokenUsage`. Throws `ProviderError` on auth/timeout/upstream failure.
- **Out of scope** Streaming. Single-shot generate only (per ARQUITECTURE.md non-goals).
- **Acceptance** Live call with valid `GEMINI_API_KEY` returns a `Buffer`, valid `mimeType`, populated `usage`. Invalid key throws `ProviderError({ kind: "auth" })`.
- **Verification** `scripts/probe-gemini.ts` (delete before merge).
- **Files** `src/lib/providers/gemini.ts`.

### P-03 — Recraft provider
- **Why** ARQUITECTURE.md §6.3 — credits-not-tokens normalization.
- **Scope** `src/lib/providers/recraft.ts`. Direct `fetch` against Recraft API. Map credits to `outputTokens`; preserve raw payload on `TokenUsage.raw`.
- **Acceptance** Same shape as Gemini; UI cannot tell them apart at the type level.
- **Files** `src/lib/providers/recraft.ts`. Register in `registry.ts`.

---

## M3 — Generate + persistence

### G-01 — `POST /api/generate`
- **Why** ARQUITECTURE.md §6, §7.1.
- **Scope**
  - Zod-validate `{ providerId: ProviderId, prompt: string (1–4000) }`.
  - Origin check; auth via `proxy.ts` already guarantees a session.
  - Dispatch to `providers[providerId].generate()`.
  - Generate UUID v7 for the row id.
  - Whitelist mime → ext (`png|jpg|jpeg|webp`).
  - Write image atomically: write to `<id>.<ext>.tmp` then `rename`.
  - Insert history row.
  - Respond with `{ id, providerId, prompt, imageUrl, usage, mimeType, createdAt }`.
- **Out of scope** Streaming response, retries.
- **Acceptance**
  1. Happy path: file exists at `generate-images/<id>.<ext>`, row exists in `history`, response shape matches.
  2. Provider 401 → response 502 with `{ error: "upstream_auth" }`; nothing written to disk or DB.
  3. Mime not in whitelist → `502`, nothing persisted.
  4. Two concurrent requests do not corrupt the DB (WAL mode).
- **Files** `src/app/api/generate/route.ts`, `src/lib/validation/schemas.ts`.

### S-01 — Image filesystem writer
- **Why** ARQUITECTURE.md §7.1.
- **Scope** `src/lib/storage/images.ts`: `writeImage({ id, ext, bytes }) → Promise<void>`, `resolveImagePath(id) → { full, ext, mime } | null` with path-traversal containment check.
- **Acceptance**
  1. `writeImage` mode `0o640`.
  2. `resolveImagePath("../etc/passwd")` returns `null`.
  3. `resolveImagePath` for an unknown id returns `null`.
- **Files** `src/lib/storage/images.ts`.

### S-02 — MongoDB history layer (Mongoose)
- **Why** ARQUITECTURE.md §7.2.
- **Scope**
  - `src/lib/storage/mongo.ts`: HMR-safe singleton (`connectMongo()` caches `mongoose.connect` on `globalThis`). 5s server-selection timeout. `import "server-only"`.
  - `src/lib/storage/models/History.ts`: Mongoose schema per ARQUITECTURE.md §7.2 (string `_id` = uuid v7, `providerId` indexed, `rawUsage` Mixed, `timestamps: { createdAt: true, updatedAt: false }`, descending index on `createdAt`).
  - `src/lib/storage/history.ts`: `insertHistory(row)`, `listHistory({ limit, before })`, `getHistory(id)`. Each function awaits `connectMongo()` once.
  - Dependency `mongoose@^8` is **already installed**; no further `npm install` required.
- **Acceptance**
  1. App boots and creates the `histories` collection on first insert.
  2. Repeated boots reuse the cached connection — no "MongooseWarning: Duplicate schema index" or socket leak warnings under HMR.
  3. `listHistory({ limit: 50 })` returns newest-first.
  4. Cursor pagination via `before` (a `Date` or ISO string) strictly excludes the cursor row.
  5. `Mongo down` at boot → `connectMongo()` rejects with a clear error within 5s; `/api/health` still returns `200` (health is independent of DB) but `/api/generate` returns `503`.
- **Files** `src/lib/storage/mongo.ts`, `src/lib/storage/models/History.ts`, `src/lib/storage/history.ts`.

---

## M4 — Image streaming

### I-01 — `GET /api/images/[id]`
- **Why** ARQUITECTURE.md §7.1, §10 (path traversal defense, never serve from `public/`).
- **Scope**
  - Auth via `proxy.ts`.
  - Validate `id` as UUID v7 with Zod.
  - `resolveImagePath(id)` — return `404` on `null`.
  - Stream the file with `Content-Type: <mime>`, `Cache-Control: private, max-age=31536000, immutable`.
  - **Async `params`** per AGENTS.md §3.2.
- **Acceptance**
  1. Bad UUID → `400`.
  2. Path traversal attempt → `400`/`404`, never serves outside `IMAGES_DIR`.
  3. Without session cookie → `401`.
  4. Valid id → 200 with correct mime + bytes.
- **Files** `src/app/api/images/[id]/route.ts`.

---

## M5 — UI shell

### U-01 — Login page
- **Why** ARQUITECTURE.md §5.2.
- **Scope** `src/app/(auth)/login/page.tsx` Server Component shell + `src/components/auth/LoginForm.tsx` Client Component. shadcn `Input` + `Button` + `Label`. Submit → `POST /api/auth/login` → on 200 push `/`. Show inline error on 401/429.
- **Acceptance** Empty submit blocked client-side; wrong password shows error; right password redirects to `/`.
- **Files** as listed.

### U-02 — Protected layout (sidebar + main shell)
- **Why** ARQUITECTURE.md §8.
- **Scope** `src/app/(protected)/layout.tsx` renders `<HistorySidebar />` (Client) on the left, children on the right. Top-right has "Logout" button posting to `/api/auth/logout`. Uses semantic Tailwind tokens.
- **Acceptance** Resizes responsively (sidebar collapses below `md`); keyboard focus visible; passes basic a11y check (labels + landmarks).
- **Files** `src/app/(protected)/layout.tsx`, `src/components/sidebar/HistorySidebar.tsx`.

### U-03 — Playground page
- **Why** ARQUITECTURE.md §8.
- **Scope** `src/app/(protected)/page.tsx` composes `<ProviderSelect />`, `<PromptForm />`, `<ResultPanel />`, `<TokenUsageBadge />`. State lives in a single Client Component parent. On submit, `POST /api/generate`, render image + usage. Loading state uses `Skeleton`; error uses `Alert`.
- **Acceptance**
  1. Provider list is populated from `/api/providers` (or a server-rendered initial prop sourced from `registry.ts`) — single source of truth.
  2. Token usage badge shows input/output/total + a "Raw usage" disclosure with the raw object.
  3. After generation, history sidebar updates (optimistic prepend or refetch).
- **Files** `src/app/(protected)/page.tsx`, `src/components/playground/{ProviderSelect,PromptForm,ResultPanel,TokenUsageBadge}.tsx`.

---

## M6 — History feed

### H-01 — `GET /api/history` + sidebar binding
- **Why** ARQUITECTURE.md §7.3.
- **Scope** Cursor-paginated endpoint `?limit=50&before=<createdAt>` returning `{ id, createdAt, providerId, prompt, imageUrl }[]`. Sidebar fetches on mount, paginates on scroll, prepends new items after generation.
- **Acceptance**
  1. Newest first.
  2. Click → rehydrates prompt + result panel as a read-only view.
  3. Empty state ("No history yet") rendered when zero rows.
- **Files** `src/app/api/history/route.ts`, sidebar components.

---

## M7 — Hardening

### X-01 — Rate limit + Origin/Referer hardening
- **Why** ARQUITECTURE.md §5.5, §10.
- **Scope** Apply Origin check helper to `/api/generate` and `/api/auth/logout`. Confirm rate limiter on `/api/auth/login`. Add `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` via `proxy.ts` response.
- **Acceptance** `curl` with mismatched Origin → 403; with no Origin (script-style) → 403.

### X-02 — Health endpoint
- **Why** ARQUITECTURE.md §9.4.
- **Scope** `GET /api/health` (public, unauthenticated) returns `{ ok: true }` with `200`. Excluded from `proxy.ts` matcher.
- **Acceptance** Reachable without cookie. Used by Docker `HEALTHCHECK`.

---

## M8 — Docker & deploy

### D-01 — Dockerfile + `.dockerignore` + `docker-compose.yml`
- **Why** ARQUITECTURE.md §9.
- **Scope**
  - Implement the multi-stage Dockerfile from §9.2 with `node:22-alpine` base; only one volume (`/app/generate-images`).
  - Set `next.config.ts` `output: "standalone"`.
  - `.dockerignore` excludes `node_modules`, `.next`, `.git`, `.env*`, `generate-images/*`.
  - **Do not** add a `webpack` config (Turbopack default — see AGENTS.md §3.4).
  - `docker-compose.yml` per ARQUITECTURE.md §9.4: `mongo` service (image `mongo:7`, named volume `mongo_data`, healthcheck via `mongosh ping`, **no host port**) + `app` service (build from this repo, `env_file: .env`, depends_on `mongo` healthy, `./generate-images` bind mount, `/api/health` healthcheck).
- **Acceptance**
  1. `docker compose build` succeeds.
  2. `docker compose up -d` brings both services healthy within 60s.
  3. `MONGODB_URI=mongodb://app:<pw>@mongo:27017/playground?authSource=admin` resolves from the app container — verified by an end-to-end login + generate.
  4. `docker compose down` followed by `docker compose up -d` preserves history (named volume) and previously generated images (bind mount).
  5. Mongo is **not** reachable from the host (no `27017` published).
- **Files** `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `next.config.ts`.

---

## Cross-cutting acceptance (every spec)

Before marking a spec done:
- `npm run lint` clean.
- `npx tsc --noEmit` clean.
- `npm run build` succeeds.
- For UI specs: manually drive the feature in a browser through golden + 1 edge path.
- No new runtime dep added beyond `mongoose` (already installed for S-02) without explicit user approval.
- ARQUITECTURE.md was not modified to fit the implementation; if you needed to change it, that was a separate, surfaced decision.

---

## Out of scope (do not build, even if tempting)

From ARQUITECTURE.md §1 / §11 (post-MVP roadmap):
- Multi-tenant accounts, RBAC.
- Cloud object storage.
- Background job queues.
- Image variations / seed reuse.
- Side-by-side multi-provider comparison.
- FTS5 search over prompts.
- Per-provider parameter panels.
- Bundle export.

Surface a request that touches these as a roadmap item; do not implement.
