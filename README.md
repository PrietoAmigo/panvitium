# Panvitium

A dark-themed incremental / idle game. The player — a human already damned — corrupts and culls
human souls to climb Hell's hierarchy across many descents (_Katabasis_).

Design documents and architecture decisions live alongside this repo in the project knowledge base
(`01`–`04`). This repository is the implementation, structured per **ADR-015** (pnpm monorepo).

## Repository layout

```
panvitium/
├── apps/
│   ├── web/          # React SPA — the game itself (ADR-001/002/003)
│   └── api/          # Fastify backend — accounts, save sync (ADR-007/008/009)
├── packages/
│   ├── shared/       # Wire-format types, save schema, migrations (ADR-010)
│   └── sim/          # Pure-functional game math, framework-free (ADR-004/005)
├── eslint.config.js
├── tsconfig.base.json
├── package.json
└── pnpm-workspace.yaml
```

## Prerequisites

- **Node.js 22 LTS** — `.nvmrc` pins the major version (`nvm use` to switch)
- **pnpm 9.x** — enable via `corepack enable && corepack prepare pnpm@9.15.0 --activate`
- **Git**

## Setup

```bash
git clone <your-repo-url> panvitium
cd panvitium
pnpm install        # installs deps and wires the Husky pre-commit hook
```

## Common scripts

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `pnpm dev`          | Run all packages in watch mode (parallel) |
| `pnpm build`        | Build all packages (`tsc`)                |
| `pnpm typecheck`    | `tsc --noEmit` across all packages        |
| `pnpm test`         | Run all tests                             |
| `pnpm lint`         | ESLint over the repo                      |
| `pnpm lint:fix`     | ESLint with auto-fix                      |
| `pnpm format`       | Format with Prettier                      |
| `pnpm format:check` | Verify formatting without writing         |

## TypeScript strictness

`tsconfig.base.json` enables `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` on top of
`strict`. These are deliberately stricter than most React projects ship with — they catch real bugs
in the modifier-stacking math (ADR-001). If a third-party type definition becomes unbearably noisy,
loosen one of those two flags rather than `strict` as a whole.

## Phase-2 roadmap

This is **step 1 of 8** — the monorepo bootstrap. Remaining steps:

2. `packages/sim` foundations — `BigNum`, seeded RNG, tick-function signature, `GameState` type
3. `packages/shared` foundations — save schema v1 (Zod), auth + save-sync wire contracts
4. `apps/web` skeleton — Vite + React + Zustand, three rooms with click regions
5. `apps/api` skeleton — Fastify + Drizzle, auth + save-sync endpoints
6. Dev Docker environment — `docker-compose.yml` for Postgres + API + web
7. GitHub Actions CI — lint, typecheck, unit tests on every push
8. Smoke test — Playwright confirms the whole stack boots end-to-end

## License

Proprietary. All rights reserved.
