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

> **This section is the authoritative progress log** — what has shipped, the current test count,
> and what remains. It is updated with **every release tarball** (the README ships in the overlay
> whenever progress moves). The engineering skill intentionally does **not** track progress, to
> avoid drift; this is the single source of truth for "what's done / what's next."

**Current test count: 562** (sim 424 · shared 48 · api 11 · web 79).

**Phases 2 (infrastructure), 3 (gameplay), and 4 (content depth) are complete for code.** The
skeleton builds, tests, containerizes, and is CI-gated; the full core loop is implemented, tested,
and surfaced in the three-room UI.

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
- **Panvitium** — the namesake endgame ritual.
- **The Eternal Sin** — the ninth-Sin reveal (_Semet_), with the total runtime as the score.
- **Cloud save sync** — magic-link auth, automatic push on persist, ADR-010 conflict chooser.

### Economy-parity pass — `Panvitium_Economy_Template.xlsx`

Bringing each system's placeholder magnitudes and mechanics into exact agreement with the
spreadsheet, one gate-green slice per tarball. **Vitium Compositum is complete** (every named
ceremony plus the apex now matches the sheet):

| #   | Slice                      | Summary                                                                                               |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Globals base rates         | `BASE_GOLD_PER_SECOND` 10→2, `BASE_INFLUENCE_RATE` 0.025→0.01.                                        |
| 2   | Acolyte curve              | `maxAcolytes` ×2.2 threshold series anchored at 110; fresh game starts at 0 acolytes.                 |
| 3   | Emptio outcomes            | Neutral merged with Good (purchase at listed price); Apocalyptic bite 0.3→0.5.                        |
| 4   | Caedis Apocalyptic         | No-op → lose 66% gold + 50% reprobates.                                                               |
| 5   | Suggestion effects         | Stellar mints reprobates; Excellent mints souls.                                                      |
| 6   | Indagatio ladder           | Good→rare+common, Neutral→common; Terrible loss 0.05→0.15, Apocalyptic 0.2→0.8.                       |
| 7   | Vitium Mercatura           | Full 32-business catalog (8 sins × 4 tiers) generated from tier specs + sheet costs/rates.            |
| 8   | Compositum base            | Outrage Cycle added; Loan Shark / Charity / Gala retuned to gold-income + conversion.                 |
| 9   | Compositum flat-rate       | No-babies (flat −generation), Doom (flat +suicide), Ethnocentric (flat +Choleric-murder).             |
| 10  | Compositum population      | Bacchanal → 10% of (Glutton+Degenerate)/s generation; Enraging Broadcast → % cull of population.      |
| 11  | Compositum penalty/offline | Vegas / Crusade flatly raise the opposite faction's subtype penalties; Dolce ×1.01 offline gain.      |
| 12  | Panvitium ritual           | Exponential `eᵗ` cost/conversion; conversion across all subtypes + soul harvest (∝ souls) + flat gen. |

**Maleficia** — in progress (roster + gating done; effects pending):

| #   | Slice            | Summary                                                                                                                                                                                                                             |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Maleficia roster | Full 25-item catalog with sheet rarity / invoking power / stack caps (∞ where unbounded); costs normalized into per-rarity price bands (`MALEFICIUM_PRICE_RANGE`, exported for the later rolled-pricing slice).                     |
| M2  | Opera enhancers  | Ars Serpens (+33% Suasio), The Voynich Manuscript (+66% Suasio), Ritual Dagger (+33% Decimatio) folded into the efficiency muls as multiplicative `(1 + bonus)` factors.                                                            |
| M3  | Sigil enhancers  | Solomon's Ring (+50%) and Iron Nails (+1%/copy) scale every sigil's effect strength via `sigilEffectMultiplier`, threaded into `sigilModifierContributions` (modifier + tier sigils) and `sigilKatabasisBonus` (carry-over sigils). |

### Remaining

Economy-parity tracks still to reconcile against the spreadsheet:

- **Invocation effects** — Succubus / Harpy / Lamia / Lemure / Behemoth and the apex set vs. the sheet.
- **Sigils** — most of the 72 are still inert; wiring their modifier / tier / katabasis contributions.
- **Maleficia effects** — roster, invoking power, stack caps, the Opera-efficiency enhancers
  (Ars Serpens / Voynich / Ritual Dagger), and the sigil-effect amplifiers (Solomon's Ring / Iron
  Nails) are done. Still to wire: the invocation-effect multiplier (Black Candles — needs an
  invocation effect-magnitude scalar), the oracular reveals, the targeted single-use items
  (Defixio / Hand of Glory), and the rolled-at-purchase pricing.
- **Missing Opera actions** — _logismoi_, _imperium_, _pogrom_, _purgatio_.

Blocked on inputs that don't live in a coding session (independent of the above):

- **Art & audio** — rooms are placeholder scenes pending the ADR-021 degraded-photoreal pipeline and
  Howler audio content (needs the `assets/` directory).
- **Final economy tuning** — any magnitudes not yet pinned to the sheet remain placeholders, flagged
  inline; the numbers are loaded from `Panvitium_Economy_Template.xlsx` (spreadsheet always wins).

## License

Proprietary. All rights reserved.
