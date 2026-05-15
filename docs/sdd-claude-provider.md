# SDD — Claude como "provider" (logo-prompt extractor vía Claude Code CLI)

> **Status:** Draft for review. No production code has been written.
> **Author:** Claude (asistido, supervisado por Miguel Jiménez).
> **Date:** 2026-05-13.
> **Scope:** Añadir Claude al pipeline como **extractor/refinador de prompts para logos**, ejecutando el binario `claude` del host vía bind-mount y autenticando con la suscripción del usuario. El texto resultante alimenta luego a un provider de imagen (Gemini por defecto).

---

## 0. Reconciliación del brief (leer primero)

El pedido fue *"add claude like one of your providers"*. Tomado literal no encaja:

- Los providers de este repo implementan `ImageProvider` (`src/lib/providers/types.ts:101`) y devuelven `imageBytes: Buffer`. Claude **no genera imágenes**.
- En la sesión de aclaración el usuario refinó la intención: Claude debe **recibir un brief y devolver un prompt de logo** que después se manda a Gemini ("Nano Banana 2") para generar la imagen.

Por tanto, **Claude no se inscribe en `registry.ts` como `ImageProvider`**. Se modela como un **componente de prompt-shaping** (similar al `gemini-text.ts` ya existente, no al `gemini.ts` de imagen) que se inserta entre el formulario de brief y la llamada a `/api/generate`. La etiqueta "Claude provider" se mantiene en la UI por familiaridad, pero técnicamente es un *prompt enhancer* específico para logos.

El usuario también pidió que se ejecute el `claude` CLI del PC ("execute command on this PC"). Eso fuerza dos decisiones que conviven en tensión con `AGENTS.md §7` y con la guideline organizacional de "todo corre en Docker":

1. **Bind mount del binario y credenciales del host** dentro del contenedor `app`. Justificado en CLAUDE.md como una desviación explícita y documentada aquí.
2. **Sin herramientas** habilitadas en el CLI invocado (`--disallowedTools "*"`), para que el prompt del usuario no pueda mover al CLI a leer/escribir nada del FS ni ejecutar Bash.

---

## 1. Executive summary

Añadir un nuevo paso opcional al flujo de generación de imágenes:

1. Usuario escribe un **brand brief** libre (ya existe la UI de brief — ver `src/app/api/briefs`).
2. Si se activa el toggle **"Refinar con Claude"** (default: off), el backend spawnea el CLI de Claude del host vía `child_process.spawn`, con un *system prompt* que lo restringe a devolver **solo el texto del prompt de logo** en JSON (`{ "logo_prompt": "..." }`).
3. La respuesta se muestra al usuario en un panel editable. El usuario puede aceptar, editar o descartar.
4. Al confirmar, el `logo_prompt` se envía al provider de imagen seleccionado (Gemini por defecto) usando el camino actual de `/api/generate` — sin cambios en `ImageProvider`.

El binario `claude` y `~/.claude` (credenciales de suscripción) se montan **read-write** desde el host. El contenedor se ejecuta con el UID del host (vía variable en `docker-compose.yml`) para que la rotación de tokens de Claude funcione sin error de permisos. **No se introduce `ANTHROPIC_API_KEY`** — la auth es por suscripción, como pidió el usuario.

---

## 2. Contexto y motivación

El flujo actual de brand brief (commit `01267a0`) usa `gemini-text.ts` para generar texto desde un brief. Funciona pero tiene tres limitaciones:

- **Gemini-text y Gemini-imagen comparten cuota.** Cada brief consume tokens del mismo `GEMINI_API_KEY` que después genera la imagen.
- **El usuario ya tiene suscripción a Claude Code** (`/usr/bin/claude` 2.1.131 está instalado en el host). El coste marginal de pasar el brief por Claude es cero si se usa la sesión existente.
- **Claude rinde mejor que Gemini en redacción descriptiva de prompts visuales** según el criterio del usuario; vale la pena tenerlo como alternativa seleccionable.

Esto no reemplaza a `gemini-text`: lo complementa. El selector de provider de texto pasa a ser `gemini-text | claude-cli`.

---

## 3. Functional requirements

| # | Requirement |
|---|---|
| FR-1 | Existe un nuevo módulo `src/lib/providers/claude-cli.ts` que expone `extractLogoPrompt({ brief, systemPrompt }): Promise<{ logoPrompt: string; raw: string; durationMs: number }>`. |
| FR-2 | El módulo spawnea `claude -p <stdin> --output-format json --disallowedTools "*" --append-system-prompt "<sp>"`. El brief llega al CLI por **stdin** (no por argv), para eliminar ventanas de inyección de argumentos. |
| FR-3 | El CLI corre dentro del contenedor `app` usando el binario montado del host. La auth viene del bind-mount de `~/.claude` (suscripción), nunca de una API key. |
| FR-4 | El system prompt para Claude está versionado en `src/lib/prompts/logo-extractor.txt` (file) y le instruye a devolver **únicamente** `{ "logo_prompt": "<string>" }` — sin comentarios, sin prólogo. |
| FR-5 | El backend parsea la salida JSON del CLI (`{ result: "...", ...stats }`), extrae el campo `result`, intenta `JSON.parse(result)` para sacar `logo_prompt`. Si el parse falla, devuelve `{ kind: "invalid_response" }` con el `raw` truncado a 500 chars en el log de error. |
| FR-6 | Nuevo endpoint `POST /api/briefs/[id]/refine`: valida el `id` (uuid v7), carga el brief de Mongo, llama a `extractLogoPrompt`, devuelve `{ logoPrompt, durationMs }`. Auth-guarded por `proxy.ts`; valida `Origin`. |
| FR-7 | El toggle **"Refinar con Claude"** aparece en la UI del brief (en el componente que ya muestra el brief generado). Al activarlo, llama al endpoint y muestra el `logoPrompt` resultante en un `<Textarea>` editable, con dos botones: **Usar este prompt** (lo envía a `/api/generate`) y **Descartar**. |
| FR-8 | El historial (`History`) guarda el `logoPrompt` final usado para generar la imagen, además del brief original, con un nuevo campo `refinedBy: "claude-cli" | "gemini-text" | null`. |
| FR-9 | Timeout duro de 60 s en el spawn (`AbortController` + `child.kill("SIGKILL")` al disparar). Errores se mapean a `ProviderError` con `kind: "timeout" | "upstream" | "auth" | "invalid_request"`. |
| FR-10 | Si la respuesta de Claude excede 10 KB se rechaza con `invalid_response` — un logo prompt razonable cabe en 2 KB. |

Out of scope esta iteración (ver §9):

- Streaming token-a-token de la respuesta al cliente.
- Soporte multi-modelo de Claude (Opus vs Sonnet vs Haiku) — usa el default del CLI.
- Encadenamiento automático brief → refine → generate sin pasar por la UI. El usuario revisa siempre.
- Uso de Claude para otros pasos del pipeline (descripción de imagen, alt-text, etc.).

---

## 4. Non-functional requirements

- **Latencia.** Presupuesto: P50 < 8 s, P95 < 20 s para un brief típico (~500 palabras → ~200 palabras de logo prompt). No hay SLO; es un playground.
- **Aislamiento.** El CLI corre **sin herramientas** (`--disallowedTools "*"`). Aun si el brief contiene "lee `/etc/passwd`", el CLI no puede ejecutarlo.
- **Sin filtración de credenciales.** `~/.claude/credentials.json` está montado pero nunca se lee/loguea desde la app. La app solo invoca `claude` y lee su stdout.
- **Sin command injection.** El brief jamás se concatena en la línea de comandos. Va por **stdin** a un proceso spawneado con `argv` estático.
- **Reproducibilidad.** El binario y los settings vienen del host, no del build del contenedor. **Esto es deliberadamente menos reproducible que el resto del stack** y se documenta como excepción en `CLAUDE.md`. El SDD lo recoge para que la decisión no se litigue en cada commit.
- **No se rompe el modelo de auth.** Todas las rutas siguen pasando por `proxy.ts` con la cookie `pg_session`. El endpoint `/api/briefs/[id]/refine` no expone nada del CLI al cliente fuera del texto extraído.
- **Observabilidad.** Log estructurado: `{ briefId, durationMs, outputBytes, exitCode }`. Nunca loguear el brief ni el logo prompt.

---

## 5. Arquitectura

### 5.1 Diagrama de flujo

```
┌─────────────┐       POST /api/briefs/:id/refine        ┌──────────────────────┐
│  Browser    │ ────────────────────────────────────────►│ Next route handler   │
│  (Brief UI) │ ◄──────── { logoPrompt, durationMs } ────│ (src/app/api/briefs/ │
└─────────────┘                                          │  [id]/refine/route)  │
                                                         └──────────┬───────────┘
                                                                    │ extractLogoPrompt()
                                                                    ▼
                                                  ┌─────────────────────────────────┐
                                                  │ src/lib/providers/claude-cli.ts │
                                                  │  spawn("claude", [             │
                                                  │    "-p",                       │
                                                  │    "--output-format", "json",  │
                                                  │    "--disallowedTools", "*",   │
                                                  │    "--append-system-prompt",   │
                                                  │      <logo-extractor.txt>,     │
                                                  │  ], { stdin: brief })          │
                                                  └────────────┬────────────────────┘
                                                               │ child_process
                                                               ▼
                              ┌────────────────────────────────────────────────────┐
                              │ /usr/bin/claude  (bind-mounted from host)          │
                              │ reads creds from ~/.claude (bind-mounted r/w)      │
                              │ talks to api.anthropic.com using subscription      │
                              └────────────────────────────────────────────────────┘
```

### 5.2 Bind mounts y permisos

Cambios en `docker-compose.yml` (sección `app.volumes` / `app.user`):

```yaml
services:
  app:
    user: "${HOST_UID}:${HOST_GID}"        # leído de .env; default 1000:1000
    volumes:
      - ./generate-images:/app/generate-images
      - /usr/bin/claude:/usr/local/bin/claude:ro
      - /usr/lib/node_modules/@anthropic-ai/claude-code:/opt/claude-code:ro
      - ${HOME}/.claude:/home/app/.claude        # rw para refresh de token
      - ${HOME}/.claude.json:/home/app/.claude.json   # config principal (sibling de .claude/)
    environment:
      - HOME=/home/app                      # claude busca ~/.claude
      - CLAUDE_REFINE_ENABLED=true
```

Notas:

- El binario del host (`/usr/bin/claude`) es un shebang Node, así que la incompatibilidad glibc/musl no aplica al lanzador. Pero **sus `node_modules` pueden tener bindings nativos** (p.ej. `better-sqlite3`). Por eso montamos el árbol entero como `:ro` y dependemos de que el `node` del contenedor (Node 22 Alpine) sea ABI-compatible con el del host. **Si falla**, el plan B es: instalar `@anthropic-ai/claude-code` en el Dockerfile y solo bind-montar `~/.claude`. Esto se decide al primer `docker compose up` post-merge; ambos caminos están contemplados.
- `HOST_UID` / `HOST_GID` se leen del `.env` (ya validado por `src/lib/env.ts` con Zod). En el README/AGENTS.md hay que decir cómo poblarlos (`echo "HOST_UID=$(id -u)" >> .env`).
- El bind-mount de `~/.claude` es **rw** a propósito: el CLI necesita escribir tokens refrescados, mtime de sesión, etc. Esto significa que un compromiso del contenedor puede pisar las credenciales del host — aceptable para un playground single-tenant, pero **explícitamente documentado** en §6.

### 5.3 Punto de extensión en código

Archivos nuevos:

```
src/lib/providers/claude-cli.ts          # extractLogoPrompt(), spawn + parse
src/lib/prompts/logo-extractor.txt       # system prompt (versionado)
src/app/api/briefs/[id]/refine/route.ts  # POST handler
src/components/brief/RefineWithClaude.tsx # toggle + textarea + acciones
tests/lib/providers/claude-cli.test.ts   # unit, con CLI mock
```

Archivos tocados:

```
src/lib/env.ts                  # + HOST_UID, HOST_GID, CLAUDE_REFINE_ENABLED
src/lib/storage/models/History.ts  # + refinedBy?: "claude-cli" | "gemini-text"
src/components/brief/BriefView.tsx # monta <RefineWithClaude/> bajo el brief generado
docker-compose.yml              # bind mounts + user
.env.example                    # HOST_UID, HOST_GID
CLAUDE.md                       # nota de excepción "Docker-everywhere"
AGENTS.md                       # mismo, sección §7 "Bind-mount permission gotcha"
```

**No tocar** `src/lib/providers/registry.ts` ni `types.ts`. Claude **no es** un `ImageProvider`.

### 5.4 Contrato del system prompt

`src/lib/prompts/logo-extractor.txt` (borrador, sujeto a iteración):

```
You convert brand briefs into single-line image-generation prompts suitable for a
text-to-image model (Gemini Nano Banana 2).

Rules:
- Output ONLY a JSON object, no prose, no markdown fences: {"logo_prompt": "..."}
- The logo_prompt must be in English, <= 400 characters.
- Describe: subject, style, palette, composition, mood. Omit brand names verbatim
  unless the brief explicitly asks for typography of that exact word.
- Never include URLs, file paths, or instructions to the image model — only
  visual description.
- If the brief is empty or non-sensical, return {"logo_prompt": ""}.
```

Validación post-parse:

- `typeof logo_prompt === "string"`.
- `logo_prompt.length <= 400` (alineado con la regla del prompt).
- Si la regla se viola, error `invalid_response`. **No** se "auto-corrige" la salida.

---

## 6. Análisis de seguridad

Esta sección es de revisión obligatoria con `/security-review` antes de mergear (ver CLAUDE.md → "Skills you should use here").

| Riesgo | Mitigación |
|---|---|
| **Command injection en el spawn.** | Brief va por stdin, nunca argv. `argv` es array literal. No `shell: true`. |
| **Prompt injection en el brief.** | El CLI corre con `--disallowedTools "*"`, así que aunque el brief diga "ejecuta `rm -rf /`", el CLI no tiene herramienta `Bash` disponible. Verificar empíricamente que el flag está soportado por la versión 2.1.x del CLI; si no, usar `--allowedTools ""`. |
| **Exfiltración de archivos del contenedor.** | Sin Read/Glob/Grep habilitados. Aunque los tuviera, los bind mounts del contenedor no exponen el resto del host. |
| **Pisado de `~/.claude` del host.** | Aceptado conscientemente. El contenedor corre como uid del host, así que escrituras son indistinguibles de las del usuario logueado. Mitigación parcial: backup periódico de `~/.claude` (responsabilidad del usuario, fuera de scope). |
| **Filtración de credenciales en logs.** | El CLI nunca recibe `ANTHROPIC_API_KEY`. Stdout/stderr del CLI se loguean **con tamaño truncado a 500 chars** y solo el campo `result`. `credentials.json` jamás se lee desde la app. |
| **Token JWT del playground reused para llamar al refine.** | `proxy.ts` ya cubre `/api/briefs/[id]/refine` por matcher. Mutating → check `Origin` con `isAllowedOrigin()` (helper existente; ver `src/lib/auth/origin.ts` si existe, si no crearlo). |
| **DoS por brief gigante.** | Validar `brief.length <= 8000` en Zod (`src/lib/validation/schemas.ts`). Rechazar con 400. |
| **DoS por loop de refines.** | Sin rate limit dedicado en MVP — single user. Si se observa abuso, añadir IP-based limit como `/api/auth/login` (ver `ARQUITECTURE.md §10`). Anotado en post-MVP. |
| **Versión del CLI cambia bajo los pies (host upgrade).** | Loguear `claude --version` al boot del contenedor. Si la versión cambia y la prueba "smoke" falla, refine se deshabilita con `CLAUDE_REFINE_ENABLED=false` automáticamente. |
| **Containment del path en `~/.claude`.** | No aplica — la app no lee archivos por path-builder desde claude. Solo invoca el binario. |

**Recordar:** El bind-mount de `~/.claude` **rompe el aislamiento Docker** que `AGENTS.md §7` establece. Esto es una excepción explícita autorizada por el usuario en la sesión de aclaración (registrada en CLAUDE.md tras merge). El SDD la enmarca; no se introduce silenciosamente.

---

## 7. UI/UX

### 7.1 Componente nuevo: `RefineWithClaude.tsx`

Montado bajo el bloque del brief generado en `BriefView`. Estados:

- **Idle**: botón `Refinar con Claude` (icon `Sparkles` de lucide-react).
- **Loading**: spinner + texto "Claude está pensando…", botón `Cancelar` (aborta el fetch, el backend `kill`ea el child).
- **Result**: `<Textarea>` con el `logoPrompt`, dos acciones: `Usar este prompt` (chain al pipeline de generación con el provider de imagen actualmente seleccionado) y `Descartar`.
- **Error**: mensaje plano ("Claude no pudo procesar este brief. Intenta de nuevo."), no se exponen detalles internos.

### 7.2 Toggle de visibilidad

`CLAUDE_REFINE_ENABLED=false` en env oculta el botón completo. Útil para entornos sin el bind-mount (CI, despliegues que no tienen el CLI del host).

---

## 8. Rollout — milestones con acceptance

### C-01 — Sondeo del CLI dentro del contenedor

- **Why** Confirmar que el bind-mount funciona antes de escribir UI.
- **Scope** Añadir bind mounts a `docker-compose.yml`. Script `scripts/check-claude.sh` que corre `docker compose exec app claude --version` y `claude -p "ping" --output-format json` y reporta status.
- **Acceptance** Output JSON parseable; exit code 0; sin warnings de credenciales faltantes.

### C-02 — Módulo `claude-cli.ts` con tests

- **Why** Aislar la lógica de spawn antes de exponerla por HTTP.
- **Scope** `extractLogoPrompt()` con timeout, AbortController, parser, error mapping. Tests con un script `claude` mock (`tests/fixtures/claude-mock.sh`) que devuelve JSON fijo.
- **Acceptance** `npx vitest run claude-cli` verde. Cubre: happy path, timeout, JSON malformado, `logo_prompt` ausente, brief vacío.

### C-03 — Endpoint `POST /api/briefs/[id]/refine`

- **Why** Wire HTTP layer.
- **Scope** Route handler + Zod schema + Origin check + log estructurado.
- **Acceptance** `curl` con cookie válida + brief existente → 200 con `{logoPrompt}`. Sin cookie → 401. Origen mismatch → 403. ID inválido → 400.

### C-04 — Componente UI `RefineWithClaude`

- **Why** Que el usuario pueda usar la feature.
- **Scope** Botón, estados, acciones, integración con el flujo de "Usar este prompt".
- **Acceptance** Manual: brief → click → texto aparece editable → click "Usar este prompt" → llega a `/api/generate` con el provider de imagen actual → imagen aparece en historial con `refinedBy: "claude-cli"`.

### C-05 — Documentación y excepción

- **Why** Que el equipo entienda por qué hay bind-mounts no convencionales.
- **Scope** Actualizar `CLAUDE.md` (sección "Operational guardrails") y `AGENTS.md §7` con la excepción documentada. Actualizar `.env.example`.
- **Acceptance** `/security-review` no flagga el bind-mount como "undocumented". README explica `echo "HOST_UID=$(id -u)" >> .env` en setup.

Cross-cutting (cada milestone):

- `npm run lint` clean.
- `npx tsc --noEmit` clean.
- `npm run build` succeeds.
- Para C-04: golden + 1 edge path en navegador.
- `ARQUITECTURE.md` **no** se modifica para encajar — esta feature vive en SDD aparte y en una nota explícita en `CLAUDE.md`.

---

## 9. Out of scope (no construir aunque sea tentador)

- Streaming de la respuesta de Claude al browser (SSE / WebSocket). Aceptable esperar 5–20 s con un spinner.
- Multi-modelo selector (Opus 4.7 vs Sonnet 4.6 vs Haiku 4.5). Usar default del CLI.
- Auto-chain (brief → refine → generate) sin revisión humana. La UX exige confirmación.
- Provider Claude para otras tareas (alt-text, descripción de imagen, prompt-to-prompt). Cada una necesita su propio SDD.
- Sustituir `gemini-text.ts`. Convive.
- Convertir Claude en `ImageProvider`. No genera imágenes.
- Caching de respuestas. Briefs cambian; vale más invocar de nuevo.
- API key (`ANTHROPIC_API_KEY`) como alternativa de auth. La decisión explícita fue suscripción.

---

## 10. Decisiones abiertas (para revisión humana)

1. **¿Qué pasa si `~/.claude` no existe en el host?** Propuesto: detectar al boot y deshabilitar la feature con un warning en stdout. ¿Conforme?
2. **¿Versión del CLI fija o flotante?** Propuesto: flotante (lo que esté en `/usr/bin/claude`), con smoke-test al boot. Alternativa: pinear vía un `package.json` del proyecto + reinstalar en cada build. Pinear rompe el "usar la suscripción del host" si el upgrade del CLI rompe el formato del token. Recomendación: flotante.
3. **¿Refine es POST a `/api/briefs/[id]/refine` o a un endpoint genérico `/api/refine` que toma el brief en el body?** Propuesto: ligado al brief porque la auditoría queda más limpia (qué brief refinaste, cuándo). Alternativa más simple si el brief aún no se ha persistido.
4. **¿Guardar el `logoPrompt` en el documento del brief o solo en el `History`?** Propuesto: ambos (en `brief.refinements: [{ provider, prompt, at }]` para auditoría; en `history.logoPrompt` para reproducibilidad de la generación).

Cualquiera de estas se cierra antes de empezar C-01.
