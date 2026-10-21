# Panvitium

A dark-themed incremental / idle game. The player — a human already damned — corrupts and culls
human souls to climb Hell's hierarchy across many descents (_Katabasis_).

Design documents and architecture decisions live in `docs/` (`00`–`06`, plus the `frontend/` design
handoffs). This repository is the implementation, structured per **ADR-015** (pnpm monorepo). When
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
cloud save (sign-in, magic-link, automatic sync on persist, and the ADR-010 conflict chooser).

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

**Current test count: 1444** (sim 646 · shared 100 · api 20 · web 678). Save schema: **v14**.

The game is mechanically complete and playable end-to-end. Phases 2 (infrastructure), 3 (gameplay)
and 4 (content depth), the economy-parity pass, and the Phase 5 tracks that surfaced the sim, rebuilt
the Katabasis and finalized the economy are done. The record of what shipped is the git history and
the merged pull requests; this README lists only what is still open.

> **Keeping this current.** When you finish an item below, delete it (and update the test count).
> Do not add a changelog entry here.

## Open work

### Design and balance decisions

Each needs a design or spreadsheet decision before it becomes a coding slice.

**Balance audit 2026-10-08.** Seventeen open findings, ranked and quantified in
`docs/balance-audit-2026-10-08.md` (its numbers predate the 2026-10-20 Suggestion retune):

- _High:_ Panvitium's harvest (`souls × e^(gold burned / 100,000)`, one long burn ends the game);
  reserve interest multiplied by `goldRateMul` and compounded by hand (free deposits; Midas ×10
  doubles the reserve every ~2.3 min); Erinyes's uncapped ×2 player efficiency per descent; the
  Imperium / Logismoi %-of-flock × efficiency tiers compounding the flock (fed by Aurevora's
  gold-for-efficiency and Erinyes); the Church culls (Suggestion's Terrible −5% / Apocalyptic −25% of
  the whole flock) capping the early flock. The audit measured them taking ~84% of it; since the
  retune a one-hour Suggestion-only run loses ~30% to them (Good's suicides are now the main exit)
  with the flock near ~130, so this one wants re-ranking.
- _Medium:_ acolytes casting Logos for free at a full unit of gain; efficiency below ×2 doing nothing
  for Suggestion's yield; Sin-1 invocation upkeep outrunning the 0.5/s base influence regen without
  Decarabia; Behemoth and Arachne as trap invocations; Halphas #38 / Stolas #36 raising Indagatio's
  gold-loss tiers.
- _Low:_ Gusion #11 is pure downside; the duplicate seals (Bael = Balam, Naberius = Bifrons,
  Vine = Furcas, Dantalion ⊃ Zagan, Amy = Bifrons + Seere); Aamon #7 does nothing early; Astiwihad's
  freeze costs nothing; Forneus #30 rounds generously; Ira's levels do nothing (below).

**Gaps left by the Decimatio removal (ADR-038).**

- **Soul economy.** The three rites were the only player-driven reprobate → soul conversion. Since
  the 2026-10-20 retune, Suggestion's Good tier drives 1 to 3 reprobates to suicide and is the main
  early source (~86% of the ~830 souls in a one-hour Suggestion-only run). Otherwise souls come only
  from deaths: the ambient suicide/murder rates (~1 soul per 33 s at 100 reprobates), the death-rate
  invocations (Imp, Harpy, Banshee, Nightmare), maleficia, the death seals, Panvitium, Erinyes and
  two incoming-call answers (10% / 15% of the flock). Early Devotion, sigil and invocation pacing all
  read souls and need re-checking.
- **Gold sinks.** Caedes / Pogrom / Purgatio were the main repeatable sinks; gold now goes only to
  Emptio, the Indagatio investment, the Depraedatio reserve, Panvitium upkeep, Aurevora, invocation
  gold upkeep (Imp's 10 gold/s; Behemoth, Fama, Succubus and Specunitas take a share of gold gain)
  and a few incoming-call answers.
- **Ira (Satan).** The per-level effect is empty (the ledger reads "Its levels carry no effect.");
  Retribution lifts invocation efficiency only.
- **Dormant seals** (`inert`, souls still bindable and recoverable) awaiting a re-home: Beleth #13,
  Marax #21, Ipos #22, Raum #40, Focalor #41, Haures #64.
- **Dantalion #71** lost its −Decimatio cost: a free +Logos efficiency boon duplicating Zagan #61.
- **Acolytes** delegate only Suggestion / Logismoi / Imperium and Indagatio; no gold-cost rite remains.
- **Gold-loss tails.** Only Indagatio and Emptio still bite gold.
- **Title About copy** (`strings.menu.aboutBody`) still says "cull them for their souls", which now
  describes an indirect cull (deaths), not a rite.

**Gaps left by the loan-book removal (ADR-037).**

- **Plutus** and **Vapula #60** now reach the reserve interest only, so they do nothing without a
  reserve.
- **Early gold pacing.** Without the population-coupled loan income, passive gold before a reserve is
  the base rate plus Haagenti #48, Kobold and maleficia; the gold prices (Emptio, the 100-gold
  Tier I deposit) and the Indagatio investment curve (now a share of gold held) need re-checking on
  the sheet.
- **Culling has no economic cost** any more (every reprobate used to be a debtor, 03 §1), and no
  death mints gold.
- **Katabasis gold carry-over** is only the 5% base, the Avaritia level (+12.5% each) and Purson #20
  (plus Astiwihad's 100%).
- **Panvitium upkeep** has no Foedus rebate, so the burn is shorter at full price.
- **Vine #45 / Furcas #50** only cut the surrender charge, a small value: candidates to re-home.

### Features

- **Phone codes and outgoing calls.** The first outgoing call ships: the rectory (982079, the code
  plates), on `CALL_OUTS` / `dialNumber` (`packages/sim/src/phone.ts`), the permanent `callsPlaced`
  record and the call stage. Still open: the rest of `docs/PANVITIUM-CALLS-OUT.md` (Gideon's line,
  `noise`), effects on outgoing-call choices, and plain boon/info codes (`PHONE_CODES` holds only the
  joke `666`).
- **Emails polish.** New mail shows only as the unread badge on the PC's Emails tile (Fausto's fifth
  letter also knocks): there is no delivery toast and no indicator on the PC prop in the room.
  Content and trigger tuning remain.

### Onboarding and game feel (5.4)

Confirm scope before coding. **Done when** a player starting from a cold save reaches their first
_Katabasis_ unaided in playtest.

- **First-run ramp.** Gentle prompts (not a modal tutorial) for the first _Logos_, the first Devotion
  threshold and the first _Katabasis_. The only first-run guard so far is the empty-handed warning,
  which stops a soulless first descent.
- **Help & glossary.** Tooltips on resources, the seven outcome tiers and the modifier readouts; a
  short glossary that explains the Latin without anglicizing it (ADR-020).
- **Settings panel.** Audio controls (after the audio track below) and the `DegradePass` knobs (the
  engine already exposes them).

### Audio (5.3, ADR-014)

Sound plays today through plain HTML5 `<audio>`: the title music, the descent's ambient score, the
incoming-call recordings and vibration, the jumpscare, and two cues (Fausto's knock, the Banshee's
scream) through the `apps/web/src/audio/audio.ts` facade, whose other events are still silent.
Remaining: settle the event taxonomy, supply the rest of the asset set, move to Howler when richer
mixing is needed, and add mute/volume to Settings. **Done when** the core events have sound.

### Testing

- **E2E for the rest of the descent.** `e2e/altar.spec.ts` covers the altar → descent entry; the
  offering, binding and the rise still want an e2e step.

### Production readiness and launch (5.6)

Gates on the tracks above being substantially done. **Done when** the game runs on the VPS, survives a
restore test, monitoring is green, and a beta cohort is playing.

- **Deploy path.** CI already publishes GHCR images on `main` (ADR-017); the `release` deploy gate and
  the webhook deploy onto the single VPS behind Caddy auto-HTTPS (ADR-016) are still to build and
  exercise. No auto-deploy from `main`.
- **Backups.** Nightly `age`-encrypted `pg_dump` to B2/R2 with the weekly restore test running
  (ADR-018), including a migrated save through a production dump → restore.
- **Observability.** Dozzle + UptimeRobot first; self-hosted PostHog later (ADR-019).
- **Performance & accessibility.** The `DegradePass` canvas cost, and keyboard / assistive-tech reach
  across the diegetic panels.
- **Beta → launch.** A closed beta cohort, then launch.

### Docs to sync

- `docs/02-systems-and-mechanics.md` and `docs/03-content-catalog.md` still describe the loan book
  (§1 population tension, §2.3 Faeneratio loop, Mutuum, Foedus, the Syngraphae table, Plutus and
  Vapula); ADR-037 governs until they are synced.
- The project-knowledge copies of the design docs and ADRs (outside this repo) lag `docs/`.

## License

Proprietary. All rights reserved.
