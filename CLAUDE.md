@AGENTS.md

---

## Claude-specific notes

These supplement (do not replace) `AGENTS.md`. Read AGENTS.md first.

### Skills you should use here

**Built-in (already available):**

| Skill | When |
|---|---|
| `security-review` | Before merging any change that touches `proxy.ts`, `src/lib/auth/**`, `/api/auth/**`, `/api/images/[id]`, `/api/generate`, env loading, or filesystem writes. |
| `simplify` | After finishing a feature, before declaring it done — checks for dead code, unused props, premature abstractions. |
| `find-skills` | When the user asks for a capability that you suspect ships as an installable skill. |
| `tailwind-design-system` | If the user asks to extend or rationalize the Tailwind tokens in `src/app/globals.css`. |
| `update-config` | For Claude Code harness changes (hooks, permissions, settings.json). Never hand-edit settings.json. |
| `loop` / `schedule` | Never use without an explicit user request — this is a single-developer playground, not a system that needs cron babysitting. |

**Installed for this project (`~/.agents/skills/…`):**

| Skill | When |
|---|---|
| `nextjs-app-router-patterns` | Touching anything under `src/app/**`, `proxy.ts`, route handlers, layouts. Cross-check against `node_modules/next/dist/docs/` for Next 16 specifics. |
| `mongodb-schema-design` | Authoring or evolving the Mongoose schema in `src/lib/storage/models/**`. |
| `mongodb-connection` | Any change to `src/lib/storage/mongo.ts` or anything that opens a Mongo connection. |
| `tailwind-v4-shadcn` | Adding shadcn components or extending `globals.css` design tokens. |
| `multi-stage-dockerfile` | Editing `Dockerfile`. |
| `docker-compose-orchestration` | Editing `docker-compose.yml`. |
| `zod` | Authoring schemas in `src/lib/validation/**` or `src/lib/env.ts`. |

Do **not** invoke `claude-api`, `php-*`, or `vue*` skills here — wrong stack.

Do **not** invoke `claude-api`, `php-*`, or `vue*` skills here — wrong stack.

### Slash commands worth knowing

- `/review` — review the current branch / PR.
- `/security-review` — security-focused diff review (use on auth + filesystem PRs).
- `/init` — only on a fresh repo; this repo is already initialized.

### Memory hints

The user is **Miguel Jiménez** (miguel.jimenez@molt.solutions). When in doubt about register, default to neutral Spanish ("tú", no regional markers) — see organization instructions.

When you discover a non-obvious project fact (deadlines, deploy targets, who runs the prod box, decisions that aren't in `ARQUITECTURE.md`), save it as a `project` memory. Do **not** save things derivable from the code.

### Operational guardrails

- **Do not run** `npm install <new-dep>` without confirming with the user. Stack is locked (AGENTS.md §2).
- **Do not edit** `ARQUITECTURE.md` to match your code. Edit code to match ARQUITECTURE.md, or propose an ARQUITECTURE.md change explicitly.
- **Do not commit** without explicit "commit" / "push" instruction.
- **Never** print the contents of `.env` or echo secrets back to the chat.

### Documented exception — host Claude Code CLI bridge

`docs/sdd-claude-provider.md` introduces a deliberate deviation from
AGENTS.md §7 ("everything runs in Docker, no host-installed runtimes"):

- The host's `/usr/bin/claude` binary, its `node_modules` tree, and
  `${HOME}/.claude` (credentials) are **bind-mounted** into the `app`
  container via `docker-compose.yml`. The container therefore runs the
  user's host CLI binary, using the host's subscription credentials.
- The runner stage of `Dockerfile` switched from `node:22-alpine` to
  `node:22-bookworm-slim` because the host CLI is a glibc ELF SEA and
  cannot run on musl.
- The container also runs as `${HOST_UID}:${HOST_GID}` (defaults
  `1000:1000`) so that `~/.claude` token refreshes don't leave files
  owned by uid 100.
- The whole bridge is gated by `CLAUDE_REFINE_ENABLED`. Set to `false`
  in any environment without the host CLI (CI, prod without subscription).

This exception is scoped to brief refinement. Do not invent additional
host bind-mounts without an updated SDD section.

### Documented exception — Vercel deployment (September 2026)

The playground has a second deployment target beside the Compose stack in
AGENTS.md §7: the Vercel project **`glyph-playground`** (team `molt-solutions`,
`https://glyph-playground-swart.vercel.app`), deployed from this folder with the
Vercel CLI (`vercel deploy --prod`), not from a Git integration. It exists so the
team can test logo edit prompts without a local stack. Deviations, all
deliberate:

- **Storage is Cloudflare R2, never the filesystem.** The function filesystem is
  read-only and ephemeral, so the four `R2_*` variables are required there.
  `src/lib/storage/images.ts` is unchanged: it already prefers R2 when
  configured.
- **MongoDB is Atlas**, provisioned through the Vercel Marketplace integration
  `mongodbatlas`, which injects `MONGODB_URI`. Keep a database name in the URI
  path; Mongoose otherwise writes to `test`.
- **`POST /api/edit` exports `maxDuration = 300`.** Worst case is 3 Gemini
  attempts x 60 s plus backoff, ingest, two R2 writes and the history insert.
- **The login rate limiter is per instance** (`src/lib/auth/rateLimit.ts` is an
  in-memory `Map`), so on Vercel it is a backstop, not a guarantee. Acceptable
  for a password-gated internal tool; do not present it as brute-force
  protection.
- **`CLAUDE_REFINE_ENABLED=false` there**: the host CLI bridge above cannot exist
  on Vercel.
- **Node is pinned to 22.x via `package.json` `engines`** so the Vercel build
  matches `.nvmrc` and the Dockerfile.
- **`.vercelignore` replaces `.gitignore` for CLI uploads**, so it lists the
  build noise again plus `.claude/`, `.agents/` and `.env*`. Keep it in sync
  when adding local-only folders.
- Tests, typecheck and lint still run in Docker (`docker run --rm -v "$PWD":/app
  -w /app node:22-bookworm-slim sh -c "npm test && npx tsc --noEmit && npx
  eslint"`). The Vercel CLI on the host is deploy tooling only.

Related feature: the `/edit` page and `POST /api/edit` (upload an existing logo
+ prompt, Gemini image-to-image). The provider lives in
`src/lib/providers/gemini-image-edit.ts`, OUTSIDE the upstream boundary of
AGENTS.md §6, and mirrors glyph's `src/lib/providers/edit/gemini-image-edit.ts`
request shape: image first as `inlineData`, prompt second, `responseModalities:
["IMAGE"]`, no `thinkingConfig`. The upload is re-encoded to PNG by
`src/lib/logo-edit/ingest.ts` (SVG rejected on purpose) and stored as the
`source` history variant under the same id as the result.

