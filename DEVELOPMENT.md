# Development

Two ways to run Panvitium locally: the full Docker stack, or Postgres-in-Docker with the apps on
your host. Both give you a real database so the auth and save-sync flows work end-to-end.

## Prerequisites

- Docker (with the Compose v2 plugin: `docker compose`, not the legacy `docker-compose`)
- For the host workflow: Node 22 + pnpm 9 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)

## Option A — full Docker stack (one command)

```bash
cp .env.example .env        # optional; compose has dev defaults baked in
docker compose up --build
```

This brings up, in order: **postgres** → **migrate** (applies Drizzle migrations, then exits) →
**api** (Fastify on :3000, `tsx watch`) → **web** (Vite dev on :5173). Source is bind-mounted, so
edits hot-reload. Stop with Ctrl+C; `docker compose down` to remove containers (the `pgdata` volume
persists your database).

- Web: http://localhost:5173
- API health: http://localhost:5173 → `curl http://localhost:3000/health` → `{"status":"ok"}`
- Postgres: `localhost:5432` (user/pass/db all `panvitium` by default)

## Option B — Postgres in Docker, apps on host

Fastest hot-reload; avoids container/host node_modules differences.

```bash
docker compose up -d postgres          # just the database
pnpm -C apps/api db:migrate            # apply migrations from the host
pnpm -C apps/api dev                   # Fastify on :3000
pnpm -C apps/web dev                   # Vite on :5173 (separate terminal)
```

The host needs `DATABASE_URL=postgres://panvitium:panvitium@localhost:5432/panvitium` (note
`localhost`, not `postgres`). Put it in `apps/api/.env` or export it. The API's other config has
safe dev defaults (see `apps/api/.env.example`).

## Verifying end-to-end

The web app does not call the API yet (that wiring is a later step), so exercise the backend
directly:

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/auth/magic-link \
  -H 'content-type: application/json' -d '{"email":"you@example.com"}'
# -> {"ok":true}; the magic link is printed in the api logs (docker compose logs api).
```

Inspect the database:

```bash
docker compose exec postgres psql -U panvitium -d panvitium -c '\dt'
```

## Database migrations

Schema lives in `apps/api/src/db/schema.ts`. After changing it:

```bash
pnpm -C apps/api db:generate    # writes SQL to apps/api/drizzle/
pnpm -C apps/api db:migrate     # applies pending migrations
```

The `migrate` compose service runs `db:migrate` automatically on `docker compose up`.
