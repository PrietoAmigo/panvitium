# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Panvitium is a dark-themed incremental/idle game: the player corrupts and culls human souls to climb
Hell's hierarchy across repeated descents (_Katabasis_). It is a pnpm monorepo (ADR-015) with a
React SPA, a Fastify backend, and two framework-free internal packages that hold all game logic.

## Source of truth

When numbers/behaviour conflict with docs, the precedence is explicit:

- A **number** disagreement → `docs/Panvitium_Economy_Template.xlsx` wins.
- A **behaviour** disagreement → the relevant ADR (`docs/04-architecture-decisions.md`) wins.

Design docs live in `docs/` (`00`–`06`, plus `frontend/` design handoffs). `README.md` tracks only
the current test count ("Status") and what is still open ("Open work"); what has shipped is recorded
in commit messages and PRs, not in the README. When a change finishes an open item, delete it from
"Open work" and update the test count; never add a changelog entry to the README. Do not duplicate
progress tracking elsewhere.

## Commands

Run from the repo root (pnpm 9.x, Node 22; `corepack enable && corepack prepare pnpm@9.15.0 --activate`):

| Command                        | What it does                                              |
| ------------------------------ | --------------------------------------------------------- |
| `pnpm dev`                     | All packages in watch mode (parallel)                     |
| `pnpm build`                   | Build the apps; `sim`/`shared` are typechecked, not built |
| `pnpm typecheck`               | `tsc --noEmit` across all packages                        |
| `pnpm test`                    | Full Vitest suite                                         |
| `pnpm lint` / `lint:fix`       | ESLint over the repo                                      |
| `pnpm format` / `format:check` | Prettier                                                  |

**Verification gate** (CI enforces the identical chain — run before every commit):

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
```

Per-package work:

- The game alone: `pnpm --filter @panvitium/web dev` → http://localhost:5173 (fully playable offline)
- A single test file: `pnpm --filter @panvitium/sim test <pattern>` (Vitest passes the pattern through)
- Watch one package: `pnpm --filter @panvitium/sim test:watch`
- E2E: `pnpm --filter @panvitium/web e2e` (run `e2e:install` once first to fetch Chromium)
- DB migrations: `pnpm --filter @panvitium/api db:generate` / `db:migrate` (Drizzle)
- Full stack (optional): `docker compose up` → postgres + one-shot migrate + api (:3000) + web (:5173).
  See `DEVELOPMENT.md` for the host-side Postgres-only workflow and end-to-end auth verification.

## Architecture

The dependency direction is strict and one-way: **`sim` ← `shared` ← `apps`**. Game logic never
imports React, the DOM, or the network.

### `packages/sim` — pure-functional game math (framework-free)

Everything the game _does_ lives here as pure functions. Two contracts make the whole design work:

- **The tick (ADR-004, `tick.ts`).** One pure function advances the entire game by a span of
  seconds, called by the live 10 Hz loop (δ ≈ 0.1 s). There is no offline catch-up: offline is a
  freeze (ADR-032), so resuming runs no tick and only grants Desidia (clamped to its cap), whose
  toggle later speeds up the live tick by scaling its game-time span `simDelta` (ADR-033). Purity
  contract: no DOM, no `Math.random`, no mutation of the input state. It returns the new state plus
  transient `OutcomeEvent`s (not persisted).
- **Determinism (ADR-011, `rng.ts`).** All randomness draws from a seeded mulberry32 PRNG whose
  entire state is one integer living in `GameState`. A save therefore fully determines the sequence
  that follows it. **Consequence for edits:** when adding a randomized mechanic, gate the RNG draw so
  that an un-triggered feature leaves the stream byte-identical — the codebase relies on this to keep
  existing saves' sequences stable (see the Defixio/murder-bias slices for the pattern).

The other load-bearing convention is **`modifiers.ts` (ADR-022): the single composition point.**
Every derived multiplier (Sin levels, Sin skills, sigils, maleficia, invocations) is aggregated in
`computeModifiers` and consumed by tick/actions/probability. Adding a new modifier source is "one
more line per source" in this module — do not scatter multipliers across systems. The exception is
_per-category_ tier shifts (one category's success distribution), returned by
`categoryTierModifiers` and composed at resolution time in `resolveAction`. Two scalers reach
everything (ADR-036): every sigil channel must pass `sigilStrengthMul(state)` as its `effectMul`
(the sigil-effect relics, Gaap-boosted, × Semet), and every maleficium magnitude must be scaled by
Gaap's `maleficiaBoost` (via `boostMaleficiumFactor`); every invocation cost goes through
`invocationCostMul`.

`break_infinity.js` is the only runtime dependency (ADR-005); use the `bignum.ts` wrappers (`bn`,
`add`, `mul`, …) — souls/gold are `BigNum`, not `number`.

**Editable economy data is separated from logic** (see `DEVELOPMENT.md` "Tuning the economy"): the
`*.data.ts` files (`actions.data.ts`, `compositum.data.ts`, `invocations.data.ts`,
`maleficia.data.ts`, `sigils.data.ts`, `constants.ts`) are pure typed tables; the sibling `*.ts`
holds the behaviour. Tune numbers in the data file; the spreadsheet is the source of truth and inline
comments record each reconciliation.

### `packages/shared` — wire format & save evolution

Zod schemas for the API contracts (`contracts/`), the serialized save state (`save/state-schema.ts`),
and the save **envelope** (`save/schema.ts`: `schemaVersion`, monotonic `saveVersion`, `lastTickAt`,
`deviceId`). Also holds `strings.ts` (all user-facing English; Latin is left untranslated, ADR-020).

**Save migrations (ADR-023, `save/migrations/`).** When the persisted shape changes, bump
`CURRENT_SCHEMA_VERSION` and add a `vN-to-vN+1.ts` migration — never break old saves. Additive,
optional fields (`additive-optional`) do not require a bump; structural changes do. Current version
is **13** (`v1-to-v2`: subtype removal; `v2-to-v3`: Mercatus rework; `v3-to-v4`: Decimatio rite id
`caedis` → `caedes` rewritten in persisted action references; `v4-to-v5`: Mercatus → the
Faeneratio loop — divest-value gold credit, `mercatusDepths` drop; `v5-to-v6`: invocation roster
rework — clear active invocations, `pendingMorpheus` → `pendingAstiwihad`, drop `morpheusLockedOut`,
seed `apexInvoked`; `v6-to-v7`: the Stagnation resource renamed to Desidia, `state.stagnation` →
`state.desidia`; `v7-to-v8`: maleficia rework — Hand of Glory timer `handOfGloryRemaining` → the
unified `maleficiaBuffs` map, drop the old Defixio cull curse, strip the removed Iron Nails id;
`v8-to-v9`: the retired invocation-runner channel, drop `invocationRunners`; `v9-to-v10`: the
Depraedatio relationship-tier rework, strip the retired contract ids with a fee refund, drop
`hoardAtDescent`; `v10-to-v11`: Decimatio retired (ADR-038), strip `caedes` / `pogrom` / `purgatio`
from auto-repeat, the action queue (base-price refund) and acolyte delegations; `v11-to-v12`: the
Black Robe maleficium renamed the Red Robe, `black_robe` → `red_robe` in owned relics, the Emptio
listing, rolled prices, an in-flight Emptio target and the safe; `v12-to-v13`: the Indagatio
investment becomes a default percentage, drop the gold stake `indagatioInvestment` with a gold
refund).

### `apps/web` — the React SPA (the game)

- **State (ADR-003): Zustand, `store/gameStore.ts`.** Owns the authoritative `GameState` + save
  metadata and delegates _all_ logic to the sim's `tick`/`startAction`/etc. UI-only state (current
  room, open panel) lives in components, not the store. It also surfaces three transient,
  non-persisted channels from each tick: the rolling outcome `log`, the `unveilQueue` of
  maleficia Emptio has just brought home, and the `subliminalQueue` of plates to flash (Fausto's,
  queued from the tick's `emailsTriggered`; the random ones from `useRandomSubliminals`). Device-local player preferences (the Settings switches,
  e.g. the Unveiling on/off) are not game state: they live in `store/preferences.ts` under their
  own `localStorage` key, never in `GameState` or the save, and the store holds them as
  `preferences`.
- `game/` — thin **view-model adapters** (`buildGoetia`, `buildAltar`, `buildCabinet`, …) that map
  the sim catalogs + live state onto presentation shapes, plus formatting/labels. No game logic.
- `menus/` — the diegetic room/panel UI (the integrated design handoff): `RoomView`, `PanelShell`,
  the PC window, Katabasis, Magna Goetia, etc. Backdrops render through a framework-free degradation
  canvas engine (`DegradePass`, the "cursed CD-ROM" look — ADR-021). Anything diegetic that must
  pixelate with the room (bound figures) is drawn _into_ the pass, never laid over the canvas as
  DOM; the room's clickable spots are invisible DOM hotspots on top. The altar's Katabasis sigil is
  chrome, not diegetic: a crisp DOM layer over the canvas, outside the pass (see `AltarSigil`). The
  light it and its STATUS QUO label cast is the room's, though: `DegradePass.setGlows` paints it
  into the pass from hidden DOM anchors it samples every frame (`menus/altarGlow.ts`), so the CSS
  still times it while the pass pixelates it.
- `art/` — source for baked art, not imported by the app: the Magna Goetia invocation plates' brush
  and gesture tables. `pnpm --filter @panvitium/web bake:plates` (`scripts/`) rasterizes them to
  the PNGs the grimoire loads; re-bake after any edit (a digest test catches a stale bake), and
  never reorder the plate table (a plate's position seeds its strokes). See `DEVELOPMENT.md`.
- Persistence is local-first (`localStorage`) with optional cloud sync (magic-link auth, automatic
  push on persist, ADR-010 conflict chooser). The web app runs fully offline as a first-class case.

### `apps/api` — Fastify backend (ADR-007/008/009)

Accounts, magic-link/Discord auth, and save sync over Postgres via Drizzle. Schema lives in
`src/db/schema.ts`; `routes/` are thin handlers; sync is client-authoritative with monotonic-version
conflict resolution (ADR-010).

### Internal packages emit no build output (ADR-015)

`sim` and `shared` point `main`/`types` at `src/index.ts`. The apps bundle their source directly
(web via Vite, api via tsup), tests run against source, and there are **no per-package `dist/`** to
keep in sync. `pnpm build` only builds the apps.

## Conventions that will bite you

- **PC only: do not design or test for mobile.** The game is meant to be played on a PC. Do not add
  narrow-viewport / mobile layouts or breakpoints, and do not check UI changes at phone or tablet
  widths; verify at desktop resolutions (1280 × 720 and up).
- **Strict TS beyond the usual.** `tsconfig.base.json` enables `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess` on top of `strict`. Indexing an array/record yields `T | undefined` —
  handle it. A leading `_` marks an intentionally unused binding (ESLint is configured to match). If
  a third-party type is unbearable, loosen one of those two flags locally, not `strict` as a whole.
- **Explicit `.js` import extensions** in TS source (`moduleResolution: Bundler`, ESM,
  `verbatimModuleSyntax`). Use `import type` for type-only imports.
- **CSS cascade gotcha:** both `index.css` and `menus.css` define shared classes (`.opera-btn`,
  `.vitium-row`); `menus.css` is imported last and wins per-property. PC/menu overrides for those
  classes must live in `menus.css` — the same edit in `index.css` is silently overridden.
- **Zustand selector trap:** never build a fresh array/object inside a selector (e.g.
  `useStore(s => buildCabinet(s))`) — `useSyncExternalStore` sees an ever-changing snapshot and loops
  ("Maximum update depth exceeded"). Select the stable `state` and build in the render body.
- **Player-facing copy (`packages/shared/src/strings.ts`) has two hard rules.** (1) Effect
  descriptions ALWAYS include their numerical values — bake fixed magnitudes into the string from
  the sim's data/constants; effects whose magnitude scales live (sigil boons, Sin skills) must keep
  the quantity channel the UI composes (the sigil ↑/↓ terminal the ledger sets the live number
  beside; the "by 1 + intensity" coupling next to the displayed intensity). Never ship a bare
  qualitative effect line. (2) NO em dashes or en dashes (U+2014 / U+2013), ever, in strings or
  comments of that file — rewrite with a comma, colon, semicolon, period, or parentheses.
