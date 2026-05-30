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

**Current test count: 598** (sim 452 · shared 48 · api 11 · web 87).

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

**Invocation effects** — done (reconciled to the Invocatio sheet's Model: each invocation's
factor × the player's current action efficiency × the invocation-effect multiplier):

| #   | Slice                              | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Multiplier effects + Black Candles | Fama (influence), Harpy (→ Decimatio efficiency, retargeted off murder), Plutus (VM output) and Succubus (→ Suasio efficiency + gold cut, retargeted off generation) reworked to `factor × playerEff × invEff`. Black Candles (+5%/candle) folded into `invocationEfficiencyMul`, so it boosts every invocation that reads it (runners already; these passive effects now too).                                                        |
| I2  | Additive-to-base effects           | Nightmare → additive to base suicide rate (new `flatBaseSuicideRatePerSecond` bundle field, added in `dynamics` alongside the Doom toggle); Behemoth → additive Stellar weight (factor 0.0005, deferred past the tierAcc block for its `playerEff` dependency); Lemure → offline gain rate, retargeted off the wrong influence/Husk target (`flatInfluencePerSecond` now reserved for the Decarabia #69 sigil). All efficiency-scaled. |
| I3  | Lamia runner                       | Reclassified Lamia from a generation + Suasio-success modifier into an autonomous Suasio runner (`autonomous: { action: 'suggestion', efficiency: 0.05 }`), advanced by `runner.ts` like Familiar/Upir/Imp. Removed its `reprobateGenerationRateMul` and `categoryTierModifiers` contributions (and the dead `LAMIA_*` constants).                                                                                                     |

**Sigils** — in progress (completing the 72-Goetia catalog against the Sigils sheet; ~49 of 72 now
bindable, the rest pending their effect mechanics):

| #   | Slice                            | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Existing-field wiring            | Wired the sigils expressible via the existing modifier bundle with no new mechanic: Belial #68 (influence rate), Marax #21 (offline time mul), Murmur #54 (overall invocation effectiveness), Balam #51 (−Terrible weight), Cimejes #66 (maleficia Katabasis roll). Added `invocationEfficiencyMul` + `offlineTimeMul` to the sigil-targetable fields (both already in the bundle and consumed).                                                                                                          |
| S2  | Per-category tier/success        | New `categoryTier` SigilEffect variant (`{ category, tiers, direction }`) folded into `categoryTierModifiers` via `sigilCategoryTierContributions` (scaled by the Solomon's Ring / Iron Nails enhancers). Wired Agares #2 / Beleth #13 (Indagatio / Decimatio success), Botis #17 / Ipos #22 (−Suasio / −Decimatio bad outcomes), Astaroth #29 / Andras #63 (+Stellar for Indagatio / Emptio), Andromalius #72 (Emptio success) and Naberius #24 (Suasio success).                                        |
| S3  | Per-category action efficiency   | Added `indagatioEfficiencyMul` + `emptioEfficiencyMul` to the bundle and `categoryEfficiency`, completing the four-category Opera-efficiency surface (these are time-mode, so they scale action speed). Wired Bifrons #46 (Indagatio) and Seere #70 (Emptio).                                                                                                                                                                                                                                             |
| S4  | Per-Sin invocation effectiveness | New `invocationSin` SigilEffect variant + `sigilInvocationSinContributions` feeding a per-Sin `invocationSinEffectivenessMul` bundle map. `invEffFor(sin)` applies it to every efficiency-derived invocation effect (Fama/Harpy/Plutus/Succubus/Nightmare/Behemoth/Lemure) and the autonomous runners (via `def.sin`). Wired Samigina #4 (Tristitia), Barbatos #8 (Gula), Bune #26 (Vanagloria), Berith #28 (Superbia), Furfur #34 (Luxuria), Vepar #42 (Ira), Shax #44 (Avaritia), Alloces #52 (Acedia). |
| S5  | Subtype penalty reductions       | New `penaltyReduction` SigilEffect variant + `sigilPenaltyReductionByChannel`, dividing a penalty channel's per-count coefficient by `(1 + strength)` (never into a bonus). Wired Gaap #33 (Sigma influence), Malphas #39 (Celebrity gold), Gremory #56 (Degenerate suicide) and Volac #62 (Gambler generation). Vual #47 (−Degenerate gold) deferred — no such penalty in the model yet.                                                                                                                 |
| S6  | Flat generators                  | New `flatGen` SigilEffect variant + `sigilFlatGeneration`, feeding flat per-second resource into `flatGoldPerSecond` / `flatInfluencePerSecond` (accrued in the tick, scaled by the rate muls). Wired Haagenti #48 (gold/s) and Decarabia #69 (influence/s). Corrected the `log` binding curve from `log10` to `ln(1 + N)` to match the sheet yields exactly (only these two log sigils use it).                                                                                                          |
| S7  | Flat invoking power              | New `invokingPower` SigilEffect variant + `sigilInvokingPower` (rounded to int), added to `currentInvokingPower` on top of the maleficia total so it counts toward the invocation gates. Wired Andrealphus #65.                                                                                                                                                                                                                                                                                           |
| S8  | Cost reductions                  | New `costReduction` SigilEffect variant + `CostChannel` + `sigilCostReductionByChannel`, dividing a cost by `(1 + strength)` at its site (never an increase). Wired Paimon #9 (action influence costs), Amy #58 (Emptio gold), and Orobas #55 (invocation soul cost — discount may pierce the nominal minimum).                                                                                                                                                                                           |

**Frontend — room & menu layer (design handoff integrated).** The Claude Design handoff has been
folded in as a compiling foundation, aligned to repo conventions (strict TS, explicit `.js` import
extensions, `import type`, Prettier):

- `apps/web/src/menus/` — the ported TypeScript menu layer: `RoomView`, `SummonedCreatures`,
  `PanelShell`, `AltarPanel`, `MaleficiaCabinet`, `SuasioPanel`, `PcWindow`, `ArsGoetiaBook`,
  `Katabasis`, the `useHold` ramp hook, the `types.ts` presentation shapes, the `menus.data.ts`
  **mock** catalogs, and `menus.css`. Typechecks under the workspace gate.
- `apps/web/public/assets/panvitium/` — the designed backdrops, invocation / maleficia art and
  textures, served by Vite at the runtime URL `/assets/panvitium/...`.
- `docs/frontend/` — the handoff's `INTEGRATION.md` wiring map and `Playspace.example.tsx`
  orchestration reference (kept out of `src`, so neither is typechecked or linted).
- **Wiring (the handoff's "Step 4") — in progress, one slice at a time:**
  - _W1 — room layer live._ `menus.css` is imported (after `index.css`, which it cleanly
    supersedes for the shared shell classes); `App` now renders the designed `menus/RoomView`
    driven by the store — door navigation, hotspot → panel, the Studio `panvitium` red glow
    (`activeToggles`), and the summoned creatures in the Invocation circle (active `invocations`,
    selected via a stable key so the room re-renders only when the set changes). The placeholder
    `apps/web/src/rooms/` shell is retired; `PanelId` now comes from `menus/types`. The existing
    HUD, panels and modals are untouched.
  - _W2 — Ars Goetia live._ The designed full-screen `ArsGoetiaBook` is now the `ars-goetia` panel,
    fed by a real `buildGoetia` view-model (`apps/web/src/game/invocations.ts`) mapping the sim
    invocation catalog + live state onto the presentation shape: invoking power, per-entry gate,
    soul cost, unlocked and bound count are all real, and Summon/Dispel call the store's
    `summon`/`banish` (so the W1 Invocation circle reflects them). Names come from the canonical
    strings; the design's art/lore is reused for the six illustrated entries with a graceful
    fallback (the Ars Goetia plate + a computed rank, omitted effect/lore) for the rest — nothing
    fabricated. Pinned by an adapter unit test.
  - _W3 — the Altar live._ The designed Altar ledger is now the `altar-menu` panel, fed by a real
    `buildAltar` view-model (`apps/web/src/game/altar.ts`): per-Prince Devotion totals + Sin levels
    (via `sinLevel`) and — newly surfaced — the **bound-sigils** list read from `state.sigilBindings`
    and named from the sigil catalog. The two-tap descend calls the store's `beginKatabasis`, which
    still opens the existing `KatabasisModal` (the designed full-screen descent is W4). Pinned by an
    adapter unit test.
  - _Remaining._ The other diegetic **panels** still render from the `menus.data.ts` mock catalogs
    (each seam marked `TODO(wire)`): `Katabasis` (the full-screen descent commit — pour + bind);
    `MaleficiaCabinet` / `SuasioPanel` / `PcWindow` (owned maleficia / Suasio action / PC programs).
    Each later slice repoints one panel at real selectors and deletes its stand-in arrays. The old
    text `ArsGoetiaPanel` stays in `PANELS` but is no longer rendered (later cleanup).

### Remaining

Economy-parity tracks still to reconcile against the spreadsheet:

- **Sigils** — ~49 of 72 are wired. The rest are grouped by the mechanic each needs: subtype-targeted
  murder (Glasya-Labolas/Sabnock/Camio/Haures/Amdusias), per-resource offline (Sallos/Forneus),
  Indagatio discovery odds (Vassago/Stolas/Furcas), and conversion (Bael/Eligos/Phenex/Ose/Orias).
  Vual #47 (−Degenerate gold penalty) is deferred — the model has no Degenerate gold penalty; it
  needs the subtype-penalty assignment reconciled first.
- **Maleficia effects** — roster, invoking power, stack caps, the Opera-efficiency enhancers
  (Ars Serpens / Voynich / Ritual Dagger), the sigil-effect amplifiers (Solomon's Ring / Iron Nails),
  and the invocation-effect multiplier (Black Candles) are done. Still to wire: the oracular reveals,
  the targeted single-use items (Defixio / Hand of Glory), and the rolled-at-purchase pricing.
- **Missing Opera actions** — _logismoi_, _imperium_, _pogrom_, _purgatio_.

Blocked on inputs that don't live in a coding session (independent of the above):

- **Art & audio** — the designed room/menu layer and its plates have landed (`apps/web/src/menus/`
  - `public/assets/panvitium/`); what remains is wiring that layer to the store and any further art
    via the ADR-021 degraded-photoreal pipeline plus Howler audio content.
- **Final economy tuning** — any magnitudes not yet pinned to the sheet remain placeholders, flagged
  inline; the numbers are loaded from `Panvitium_Economy_Template.xlsx` (spreadsheet always wins).

## License

Proprietary. All rights reserved.
