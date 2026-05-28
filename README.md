# Panvitium

A dark-themed incremental / idle game. The player — a human already damned — corrupts and culls
human souls to climb Hell's hierarchy across many descents (_Katabasis_).

Design documents and architecture decisions live alongside this repo in the project knowledge base
(`01`–`04`). This repository is the implementation, structured per **ADR-015** (pnpm monorepo). When
a number and a doc disagree, `Panvitium_Economy_Template.xlsx` wins; when a behaviour and a doc
disagree, the relevant ADR wins.

## Repository layout

```
panvitium/
├── apps/
│   ├── web/          # React SPA — the game itself (ADR-001/002/003)
│   └── api/          # Fastify backend — accounts, save sync (ADR-007/008/009)
├── packages/
│   ├── shared/       # Wire-format types, save schema, migrations (ADR-010/023)
│   └── sim/          # Pure-functional game math, framework-free (ADR-004/005/022)
├── compose.yaml          # Base dev stack: postgres + migrate + api + web
├── compose.override.yaml # Dev overrides: bind mounts, host ports, watch mode
├── Dockerfile
├── eslint.config.js
├── tsconfig.base.json
├── package.json
└── pnpm-workspace.yaml
```

`packages/sim` and `packages/shared` are **internal source packages** (ADR-015): their
`package.json` points `main`/`types` at `src/index.ts` and they emit no build output. The apps bundle
their source directly (`apps/web` via Vite, `apps/api` via tsup), and tests run against source. There
are no per-package `dist/` directories to keep in sync.

## Prerequisites

- **Node.js 22 LTS** — `.nvmrc` pins the major version (`nvm use` to switch)
- **pnpm 9.x** — enable via `corepack enable && corepack prepare pnpm@9.15.0 --activate`
- **Git**
- **Docker** (optional) — only needed for the full-stack dev environment and the API/database

## Setup

```bash
git clone <your-repo-url> panvitium
cd panvitium
pnpm install                       # installs deps and wires the Husky pre-commit hook
pnpm --filter @panvitium/web dev   # the game alone, at http://localhost:5173
```

The web app is fully playable on its own — it persists to `localStorage` and runs offline as a
first-class case (ADR-006). The API and database are only required for accounts and cross-device
cloud save, which the client now wires through end-to-end (sign-in, magic-link, automatic sync on
persist, and the ADR-010 conflict chooser).

## Common scripts

| Command             | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `pnpm dev`          | Run all packages in watch mode (parallel)                  |
| `pnpm build`        | Build the apps (`sim`/`shared` are typechecked, not built) |
| `pnpm typecheck`    | `tsc --noEmit` across all packages                         |
| `pnpm test`         | Run the full Vitest suite                                  |
| `pnpm lint`         | ESLint over the repo                                       |
| `pnpm lint:fix`     | ESLint with auto-fix                                       |
| `pnpm format`       | Format with Prettier                                       |
| `pnpm format:check` | Verify formatting without writing                          |

Per-app scripts of note: `pnpm --filter @panvitium/web e2e` (Playwright, against a preview build;
run `e2e:install` first to fetch the browser), and `pnpm --filter @panvitium/api db:generate` /
`db:migrate` (Drizzle migrations).

### Verification gate

Before every commit, the whole chain must be green — CI enforces the same set:

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
```

### Full-stack dev with Docker (optional)

```bash
docker compose up        # postgres + one-shot migrate + api (watch) + web (Vite dev)
```

Uses Compose v2 (`docker compose`, no `version:` key). Migrations run as a one-shot service that the
API waits on. On Debian/Ubuntu install Docker from the official apt repo — the distro package lacks
the v2 compose plugin.

## TypeScript strictness

`tsconfig.base.json` enables `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` on top of
`strict`. These are deliberately stricter than most React projects ship with — they catch real bugs
in the modifier-stacking math (ADR-001). Indexing an array or record yields `T | undefined`; handle
it. A leading underscore marks an intentionally unused binding. If a third-party type definition
becomes unbearably noisy, loosen one of those two flags rather than `strict` as a whole.

## Status

**Phases 2 (infrastructure), 3 (gameplay), and 4 (content depth) are complete for code.** The
skeleton builds, tests, containerizes, and is CI-gated; the full core loop is implemented, tested,
and surfaced in the three-room UI. The suite stands at **~505 unit tests** across sim / shared /
api / web.

Implemented gameplay (each slice pinned with Vitest):

- **Resources & probability** — gold/influence generation, the seven-tier outcome resolver (02 §2).
- **Opera** — _Suasio_, _Decimatio_, the action engine (`cost-outcome` / `time` efficiency modes).
- **Devotion & the modifier engine** — Cardinal Sin levels (`180^X`) and skill intensities, composed
  through a single `computeModifiers` point (ADR-022).
- **Katabasis** — the descent flow, offering menu, recap, and unspent-soul carry-over.
- **Reprobate dynamics** — fractional generation / suicide / murder / conversion pools (02 §9).
- **_Depraedatio_** — _Vitium Mercatura_ businesses and _Vitium Compositum_ ceremony toggles.
- **Acolytes**, **invocations** (all 18 wired — autonomous-runner channel for the Familiar / Imp /
  Upir, static modifier-bundle contributions for the demonic court, per-tick or per-invoke
  side-effects for the apex entities), and **maleficia** (_Indagatio_ / _Emptio_).
- **Apex entities** — Astiwihad + Aurevora (per-tick effects in `apex.ts`), Erinyes + Morpheus
  (mutually-exclusive Katabasis-carryover apexes; Morpheus freezes the lifetime, Erinyes kills
  every reprobate at invoke), Specunitas (conversion-bias hook).
- **Sigils** — the 72-sigil recoverable prestige axis, with binding curves, Katabasis carry-over
  bonuses (gold / maleficia / unconverted), and the _Semet_ gate.
- **Achievements** — a static catalog evaluated each tick, with an unlock toast and a ledger panel.
- **Panvitium** — the namesake endgame ritual: exponential upkeep, enormous churn, red Studio window.
- **The Eternal Sin** — the ninth-Sin reveal (_Semet_), with the total runtime as the score.
- **Cloud save sync** — magic-link auth, automatic push on persist, ADR-010 conflict chooser (the
  web client now talks to the API end-to-end).

Remaining (content, not code):

- **Art & audio** — rooms are placeholder scenes pending the ADR-021 degraded-photoreal pipeline and
  Howler audio content.
- **Economy tuning** — placeholder magnitudes live throughout the catalogs, flagged inline; the
  numbers will be loaded from `Panvitium_Economy_Template.xlsx` (spreadsheet always wins).

## License

Proprietary. All rights reserved.
