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
