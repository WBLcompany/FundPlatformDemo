# One image definition, three targets (D-23). Build from the repository root:
#   docker build -f deploy/Dockerfile --target web    -t wbl-grants-web .
#   docker build -f deploy/Dockerfile --target worker -t wbl-grants-worker .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @wbl/web build

# Web: Next.js standalone server, no node_modules install at runtime.
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 STORAGE_ROOT=/data/storage
COPY --from=build /repo/apps/web/.next/standalone ./
RUN mkdir -p /data/storage && chown node /data/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]

# Worker and the migration job share the workspace with its dependencies.
FROM build AS worker
ENV NODE_ENV=production STORAGE_ROOT=/data/storage
RUN mkdir -p /data/storage && chown node /data/storage
USER node
WORKDIR /repo/apps/worker
CMD ["node_modules/.bin/tsx", "src/main.ts"]
