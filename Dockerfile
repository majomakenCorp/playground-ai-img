# syntax=docker/dockerfile:1.7
# Multi-stage build for Next.js 16 (App Router, Turbopack, output: "standalone").

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
ENV NODE_ENV=production
# Turbopack is the default bundler in Next 16.
RUN npm run build

# ---------- 3. runner ----------
# Debian (glibc) base. The host's Claude Code CLI (`/usr/bin/claude`) is a
# Node SEA dynamically linked against glibc, so it cannot run on Alpine/musl
# when bind-mounted from the host. Builder stays on Alpine for speed.
# See docs/sdd-claude-provider.md §5.2 for the reasoning.
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# wget is used by the Compose healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Non-root user. UID/GID match the host user at runtime via Compose
# (`user: "${HOST_UID}:${HOST_GID}"`); the in-image uid/gid only matters for
# files that are baked into the image.
RUN groupadd --system app && useradd --system --gid app --home-dir /home/app --create-home app

# Standalone server bundle + static assets only.
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public

# Persistent dir for generated images. Mongo data lives in its own service.
RUN mkdir -p /app/generate-images && chown -R app:app /app/generate-images
VOLUME ["/app/generate-images"]

USER app
EXPOSE 3000
CMD ["node", "server.js"]
