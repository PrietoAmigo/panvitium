# syntax=docker/dockerfile:1

# Base: Node 22 LTS (ADR-007) with pnpm via corepack. HUSKY=0 disables git hooks in containers/CI.
FROM node:22-slim AS base
ENV HUSKY=0
RUN corepack enable
WORKDIR /app

# deps: install the whole workspace from manifests + lockfile. Copying only the package.json files
# (not source) keeps this layer cached until a dependency actually changes.
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/sim/package.json ./packages/sim/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile

# dev: the runtime image for the dev environment. Source is bind-mounted by compose.override.yaml
# and node_modules come from this image (preserved over the mount via anonymous volumes). The
# per-service command (migrate / api / web) is set in compose.yaml.
FROM deps AS dev
CMD ["node", "--version"]

# --- Production: API ---
# Build the self-contained bundle (tsup inlines @panvitium/* ; fastify/drizzle/pg stay external),
# then prune to a production-only deployment with `pnpm deploy`. Source comes via COPY here (the dev
# target gets it from a bind-mount instead); node_modules are preserved from `deps` because
# .dockerignore keeps them out of the build context.
FROM deps AS api-build
COPY . .
RUN pnpm -C apps/api build \
  && pnpm --filter=@panvitium/api deploy --prod /prod/api

FROM node:22-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-build /prod/api ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

# --- Production: Web (static SPA served by nginx) ---
FROM deps AS web-build
COPY . .
RUN pnpm -C apps/web build

FROM nginx:alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
