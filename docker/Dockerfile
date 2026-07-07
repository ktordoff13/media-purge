# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /build

# Install workspace deps (better-sqlite3 needs a toolchain to compile)
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3

COPY apps ./apps
RUN npm run build --workspace apps/api \
 && npm run build --workspace apps/web

# Prune to production deps for the api only
RUN npm prune --omit=dev --workspace apps/api

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:24-alpine
LABEL org.opencontainers.image.title="Media Purge" \
      org.opencontainers.image.description="Rule-based media cleanup for Plex & Jellyfin — scan, recommend, reclaim storage safely." \
      org.opencontainers.image.source="https://github.com/ktordoff/media-purge"

ENV NODE_ENV=production \
    CONFIG_DIR=/config \
    RECYCLE_BIN_DIR=/recycle-bin \
    WEB_DIST=/app/web \
    PORT=8484

WORKDIR /app
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/apps/api/dist ./api
COPY --from=build /build/apps/web/dist/web/browser ./web

VOLUME ["/config"]
EXPOSE 8484

HEALTHCHECK --interval=60s --timeout=10s --start-period=20s \
  CMD wget -qO- http://localhost:8484/api/v1/health || exit 1

CMD ["node", "api/main.js"]
