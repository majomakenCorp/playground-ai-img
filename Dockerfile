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
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# wget is used by the Compose healthcheck.
RUN apk add --no-cache wget

# Non-root user.
RUN addgroup -S app && adduser -S app -G app

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
