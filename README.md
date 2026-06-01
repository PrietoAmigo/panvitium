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

**Current test count: 706** (sim 516 · shared 52 · api 11 · web 127).

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

| #   | Slice                      | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Globals base rates         | `BASE_GOLD_PER_SECOND` 10→2, `BASE_INFLUENCE_RATE` 0.025→0.01.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2   | Acolyte curve              | `maxAcolytes` ×2.2 threshold series anchored at 110; fresh game starts at 0 acolytes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3   | Emptio outcomes            | Neutral merged with Good (purchase at listed price); Apocalyptic bite 0.3→0.5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | Caedis Apocalyptic         | No-op → lose 66% gold + 50% reprobates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 5   | Suggestion effects         | Stellar mints reprobates; Excellent mints souls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6   | Indagatio ladder           | Good→rare+common, Neutral→common; Terrible loss 0.05→0.15, Apocalyptic 0.2→0.8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | Vitium Mercatura           | Full 32-business catalog (8 sins × 4 tiers) generated from tier specs + sheet costs/rates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 8   | Compositum base            | Outrage Cycle added; Loan Shark / Charity / Gala retuned to gold-income + conversion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9   | Compositum flat-rate       | No-babies (flat −generation), Doom (flat +suicide), Ethnocentric (flat +Choleric-murder).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10  | Compositum population      | Bacchanal → 10% of (Glutton+Degenerate)/s generation; Enraging Broadcast → % cull of population.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11  | Compositum penalty/offline | Vegas / Crusade flatly raise the opposite faction's subtype penalties; Dolce ×1.01 offline gain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 12  | Panvitium ritual           | Exponential `eᵗ` cost/conversion; conversion across all subtypes + soul harvest (∝ souls) + flat gen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 13  | Suasio Opera actions       | Sheet-specified Logismoi (Luxuria 2) + Imperium (Luxuria 3) added to the action catalog with their tier distributions and a new optional `unlock { sin, level }` gate + `actionUnlocked` helper + `startAction` guard (Suggestion/Caedis stay ungated). The Suasio scroll now holds all three temptations: Suggestion is always open; Logismoi/Imperium show their Luxuria gate until reached. Imperium's duration is a flagged placeholder (the sheet defers it). The Decimatio pair (Pogrom/Purgatio) is a separate slice.                                                      |
| 14  | Decimatio Opera actions    | Sheet-specified Pogrom (Ira 2) + Purgatio (Ira 3) added with their tier effects. Pogrom culls a chosen subtype (5/10/25% by tier, soul per death) via the existing action-`target` plumbing + a `startAction` subtype guard; Purgatio culls all subtypes (33/66/100%). New `cullSubtypeFraction` and `loseConvertedReprobatesFraction` population helpers; positive culls scale with efficiency (clamped ≤100%), the Church/gold losses are fixed. Sim core only — UI surfacing is deferred (see Remaining). Costs are flagged placeholders (sheet says "high"/"very high gold"). |
| 15  | Action delegation gating   | New optional `delegateUnlock { sin, level }` on the six Opera actions (the sheet's "toggle" levels: Suggestion/Caedis at Luxuria/Ira 1, Logismoi/Pogrom at 3, Imperium/Purgatio at 4). `isDelegatable` is now state-aware; acolyte assignment and the `AcolyteControls` UI honour it, so a rite can be cast by hand before it can be automated. Autonomous invocation runners (Familiar/Imp/Upir) stay gated by invocation possession, not the toggle level; Indagatio is always delegatable, Emptio never.                                                                       |

**Maleficia** — in progress (roster + gating done; effects pending):

| #   | Slice                 | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Maleficia roster      | Full 25-item catalog with sheet rarity / invoking power / stack caps (∞ where unbounded); costs normalized into per-rarity price bands (`MALEFICIUM_PRICE_RANGE`, exported for the later rolled-pricing slice).                                                                                                                                                                                                                                                                                                                                                                                                                           |
| M2  | Opera enhancers       | Ars Serpens (+33% Suasio), The Voynich Manuscript (+66% Suasio), Ritual Dagger (+33% Decimatio) folded into the efficiency muls as multiplicative `(1 + bonus)` factors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| M3  | Sigil enhancers       | Solomon's Ring (+50%) and Iron Nails (+1%/copy) scale every sigil's effect strength via `sigilEffectMultiplier`, threaded into `sigilModifierContributions` (modifier + tier sigils) and `sigilKatabasisBonus` (carry-over sigils).                                                                                                                                                                                                                                                                                                                                                                                                       |
| M4  | Rolled Emptio pricing | Each maleficium's price is rolled within its rarity band (`MALEFICIUM_PRICE_RANGE`) the moment it is surfaced by Indagatio, and persisted in a new additive-optional `lifetime.maleficiaPrices`; the draws are appended after the find logic so which items surface stays byte-identical. Emptio (and its UI) charge the rolled price, falling back to the catalog cost for pre-pricing saves; the map resets with the emptio list on Katabasis (preserved under Morpheus).                                                                                                                                                               |
| M5  | Hand of Glory (sim)   | Single-use generation buff: a new `activateMaleficium` consumes one Hand of Glory and adds an hour to `lifetime.handOfGloryRemaining` (additive-optional save field; repeat uses stack the timer). While the timer is live, `reprobateGenerationRateMul` is ×2 (+100% base generation); the tick decays it in real time and it resets on Katabasis. Sim core only — the cabinet "Use" affordance is deferred (see Remaining).                                                                                                                                                                                                             |
| M6  | Defixio (sim)         | Single-use sustained curse: `activateMaleficium('defixio')` consumes one copy and marks a pending curse in a new additive-optional `lifetime.defixio`. The first tick rolls the target uniformly among present subtypes (the only Defixio RNG draw, gated so an uncast game leaves the stream byte-identical), then culls that subtype at eᵗ per second (t = seconds the curse has run), minting a soul per death, until the subtype is exterminated — then the curse lifts. One curse at a time; resets on Katabasis. New `cullSubtypeCount` population helper. Sim only — shares the deferred cabinet "Use" affordance (see Remaining). |

**Invocation effects** — done (reconciled to the Invocatio sheet's Model: each invocation's
factor × the player's current action efficiency × the invocation-effect multiplier):

| #   | Slice                              | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Multiplier effects + Black Candles | Fama (influence), Harpy (→ Decimatio efficiency, retargeted off murder), Plutus (VM output) and Succubus (→ Suasio efficiency + gold cut, retargeted off generation) reworked to `factor × playerEff × invEff`. Black Candles (+5%/candle) folded into `invocationEfficiencyMul`, so it boosts every invocation that reads it (runners already; these passive effects now too).                                                        |
| I2  | Additive-to-base effects           | Nightmare → additive to base suicide rate (new `flatBaseSuicideRatePerSecond` bundle field, added in `dynamics` alongside the Doom toggle); Behemoth → additive Stellar weight (factor 0.0005, deferred past the tierAcc block for its `playerEff` dependency); Lemure → offline gain rate, retargeted off the wrong influence/Husk target (`flatInfluencePerSecond` now reserved for the Decarabia #69 sigil). All efficiency-scaled. |
| I3  | Lamia runner                       | Reclassified Lamia from a generation + Suasio-success modifier into an autonomous Suasio runner (`autonomous: { action: 'suggestion', efficiency: 0.05 }`), advanced by `runner.ts` like Familiar/Upir/Imp. Removed its `reprobateGenerationRateMul` and `categoryTierModifiers` contributions (and the dead `LAMIA_*` constants).                                                                                                     |

**Sigils** — in progress (completing the 72-Goetia catalog against the Sigils sheet; ~68 of 72 now
bindable, the rest pending their effect mechanics):

| #   | Slice                            | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Existing-field wiring            | Wired the sigils expressible via the existing modifier bundle with no new mechanic: Belial #68 (influence rate), Marax #21 (offline time mul), Murmur #54 (overall invocation effectiveness), Balam #51 (−Terrible weight), Cimejes #66 (maleficia Katabasis roll). Added `invocationEfficiencyMul` + `offlineTimeMul` to the sigil-targetable fields (both already in the bundle and consumed).                                                                                                                                                                                                         |
| S2  | Per-category tier/success        | New `categoryTier` SigilEffect variant (`{ category, tiers, direction }`) folded into `categoryTierModifiers` via `sigilCategoryTierContributions` (scaled by the Solomon's Ring / Iron Nails enhancers). Wired Agares #2 / Beleth #13 (Indagatio / Decimatio success), Botis #17 / Ipos #22 (−Suasio / −Decimatio bad outcomes), Astaroth #29 / Andras #63 (+Stellar for Indagatio / Emptio), Andromalius #72 (Emptio success) and Naberius #24 (Suasio success).                                                                                                                                       |
| S3  | Per-category action efficiency   | Added `indagatioEfficiencyMul` + `emptioEfficiencyMul` to the bundle and `categoryEfficiency`, completing the four-category Opera-efficiency surface (these are time-mode, so they scale action speed). Wired Bifrons #46 (Indagatio) and Seere #70 (Emptio).                                                                                                                                                                                                                                                                                                                                            |
| S4  | Per-Sin invocation effectiveness | New `invocationSin` SigilEffect variant + `sigilInvocationSinContributions` feeding a per-Sin `invocationSinEffectivenessMul` bundle map. `invEffFor(sin)` applies it to every efficiency-derived invocation effect (Fama/Harpy/Plutus/Succubus/Nightmare/Behemoth/Lemure) and the autonomous runners (via `def.sin`). Wired Samigina #4 (Tristitia), Barbatos #8 (Gula), Bune #26 (Vanagloria), Berith #28 (Superbia), Furfur #34 (Luxuria), Vepar #42 (Ira), Shax #44 (Avaritia), Alloces #52 (Acedia).                                                                                                |
| S5  | Subtype penalty reductions       | New `penaltyReduction` SigilEffect variant + `sigilPenaltyReductionByChannel`, dividing a penalty channel's per-count coefficient by `(1 + strength)` (never into a bonus). Wired Gaap #33 (Sigma influence), Malphas #39 (Celebrity gold), Gremory #56 (Degenerate suicide) and Volac #62 (Gambler generation). Vual #47 softens BOTH the Degenerate suicide and Choleric-murder dampening via a shared `degenerateDeathRates` channel applied to both muls in `computeModifiers`.                                                                                                                      |
| S6  | Flat generators                  | New `flatGen` SigilEffect variant + `sigilFlatGeneration`, feeding flat per-second resource into `flatGoldPerSecond` / `flatInfluencePerSecond` (accrued in the tick, scaled by the rate muls). Wired Haagenti #48 (gold/s) and Decarabia #69 (influence/s). Corrected the `log` binding curve from `log10` to `ln(1 + N)` to match the sheet yields exactly (only these two log sigils use it).                                                                                                                                                                                                         |
| S7  | Flat invoking power              | New `invokingPower` SigilEffect variant + `sigilInvokingPower` (rounded to int), added to `currentInvokingPower` on top of the maleficia total so it counts toward the invocation gates. Wired Andrealphus #65.                                                                                                                                                                                                                                                                                                                                                                                          |
| S8  | Cost reductions                  | New `costReduction` SigilEffect variant + `CostChannel` + `sigilCostReductionByChannel`, dividing a cost by `(1 + strength)` at its site (never an increase). Wired Paimon #9 (action influence costs), Amy #58 (Emptio gold), and Orobas #55 (invocation soul cost — discount may pierce the nominal minimum).                                                                                                                                                                                                                                                                                          |
| S9  | Conversion-bias sigils           | New `conversionBias` SigilEffect variant (`{ subtype }`) + `sigilConversionBiasContributions`, composed into the `conversionBiasMul` draw seam on top of the apex Specunitas bias — strictly multiplicative on existing source weights (cannot manufacture a conversion from a zero-source subtype). Wired Eligos #15 and Phenex #37, both biasing Celebrity conversion.                                                                                                                                                                                                                                 |
| S10 | Subtype-targeted murder rates    | New `murderBias` SigilEffect variant (`{ subtype }`) + `sigilMurderBiasContributions`, biasing the murder-victim draw in `removeOneVictim` (weight = count × bias) — the weighted path engages only when such a sigil is bound, so the no-bias RNG stream stays byte-identical. Wired Glasya-Labolas #25 (Celebrity), Sabnock #43 (Glutton), Camio #53 (Degenerate). Amdusias #67 (non-Choleric types) lifts the overall `cholericMurderRateMul`. Haures #64 biases the draw toward Cholerics — murders now draw across **all** subtypes, Cholerics included, so Cholerics are valid victims by default. |
| S11 | Nihilist suicide-rate sigils     | Added `nihilistSuicideMul` to the sigil-targetable fields and amplified the Nihilist-count suicide term in `computeModifiers` by `sc('nihilistSuicideMul')` (so it only lifts the rate when Nihilists are present, never from nothing). Wired Ronove #27 and Focalor #41, both increasing the Nihilist-driven suicide rate.                                                                                                                                                                                                                                                                              |

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
  - _W4 — the descent live._ The designed full-screen two-page `menus/Katabasis` is now the descent
    `menu` phase (replacing the old `KatabasisMenu` markup), wired to the **real live model**:
    offering pours Devotion straight into `state.devotion` via `offer`, binding moves souls to seals
    via `bindMore`/`bindLess` (both recoverable until you rise), the Eternal-Sin card appears once
    every Cardinal Sin is maxed, and Ascend commits the lifetime via `confirmKatabasis`. The hold
    buttons ramp the per-step _amount_ (souls are BigNum, so a +1/tick hold can't scale). The recap
    and Eternal-Sin reveal remain their own views. `KatabasisModal` is slimmed to the phase
    orchestrator + those two views.
  - _W5 — Maleficia cabinet + Suasio scroll live._ `MaleficiaCabinet` now shows the player's **owned**
    maleficia (a `buildCabinet` view-model collapsing duplicate stackables into ×N), each merged from
    the sim catalog (name/rarity/description) with the design's specimen art + split flavour/effect;
    art-less items fall back to a text label. `SuasioPanel` fires the real **Suggestion** action via
    the store (`act`), with the live efficiency-scaled cost and a log of resolved Suggestion outcomes
    (filtered from the store log, described via `describeOutcome`); acolyte delegation to Suasio is
    preserved beneath it. Pinned by a cabinet adapter unit test.
  - _W6 — the PC live (menu-layer wiring complete)._ The designed `PcWindow` file-manager is now the
    full-screen `pc` overlay; each “executable” launches the **real** system body via the existing
    `PcGroupBody` (Depraedatio businesses + build queue, Decimatio / Indagatio actions, the Emptio
    market, the achievements ledger, and the global outcome log). The designed chrome wraps the
    real group components unchanged. With this, every diegetic panel and room is wired to real
    state; the `menus.data.ts` stand-ins survive only as design flavour (art/lore/rank) merged by
    the view-models, plus its now-unused PC/Sin/Sigil mock arrays and the superseded text panels
    (`PcPanel`, `ArsGoetiaPanel`, the old Suasio/Maleficia markup), which a later cleanup can drop.
  - _W7 — themed panel shells (fix)._ The three framed panels were rendering in the generic frame
    rather than the designed `PanelShell`, so they had lost their themed backgrounds. They now render
    via `PanelShell` with the right variant: the Altar in engraved **stone** (`altar-stone.png`,
    header-less), the Maleficia **cabinet** in wood, and the Suasio **scroll** in parchment. Ars
    Goetia, the PC and Katabasis keep their own full-screen shells.
  - _W8 — render-loop fix._ The Maleficia shelf selected `buildCabinet(state)` _inside_ a Zustand
    selector, returning a fresh array each call — which makes `useSyncExternalStore` see an
    ever-changing snapshot and loop (“Maximum update depth exceeded”) when the cabinet mounts. Now it
    selects the stable `state` and builds in the render body. Guarded by an e2e step that opens the
    cabinet. (Other inline selectors were already safe — they return the actual `state.lifetime.*`
    arrays, not fresh ones.)
  - _Degradation pass + Ars Goetia rework._ The defining visual constraint (01) is in: each room's
    backdrop is now a `<canvas>` (`DegradedScene` over the framework-free `DegradePass` engine) that
    composites the plate, its baked props, and any summoned creatures through one uniform degradation
    recipe — so the whole diegetic frame reads at a single fidelity, while the chrome (hotspots, HUD,
    panels) layers above it and stays crisp. `DEFAULT_DEGRADE` is dialled to the shipped “Cursed
    CD-ROM” recipe (block 3 · levels 6 · dither · grade 0.12 · contrast 1.2 · black 0.08 · vignette
    0.1 · grain 0.03 · flicker 0.06 · scanlines 0.25 · aberration 1 · 24fps · uniform · idle bob);
    pass `settings` to override any knob. Room changes play the engine's fade-to-black curtain;
    creature idle motion is composited before the pass. `RoomView` feeds it `ROOM_PLATES` (the
    `*_complete.png` plates, props baked in) and `spriteFor` (summoned ids → canvas sprites), which
    settles the earlier furnish question — every room degrades its complete plate. The DOM
    `SummonedCreatures` and the crisp `ars_goetia` prop are retired (composited / baked in); the
    `.scene` CSS backdrop is superseded by the canvas. The **Ars Goetia** grimoire is the reworked
    prop-driven `ArsGoetiaBook` (takes a pre-formatted `invokingPower`; the bound-count display was
    dropped by the new design); `buildGoetia` now yields `GoetiaEntry[]` + `invokingPower`, omitting
    `gate`/`effect`/`lore`/`illus` where absent so un-illustrated seals degrade to a text leaf.
    Orphaned by this pass (cleanup): `SummonedCreatures.tsx`.
  - _PC/Suasio polish._ Confirmed acolyte **delegation works inside the PC**: Decimatio (`caedis`)
    and Indagatio (`indagatio`) render the `+`/− `AcolyteControls` (shown once you hold ≥1 acolyte)
    via `ActionRow`'s delegation slot. Removed the outcome **log from the Suasio scroll** (outcomes
    live in the PC's Logs program). Split the PC's **Depraedatio** program into three tabs — Vitium
    Mercatura (the businesses), Vitium Compositum (the ceremonies), and In Flight (builds under
    construction); the in-flight tab collapses identical builds into one counted row (“6× Street
    food stand”) showing the soonest completion, and the tab carries a live count.
  - _Ars Goetia types decoupled (no visual change)._ Per the focused Ars-Goetia export, moved
    `GoetiaEntry` / `ArsGoetiaBookProps` into a self-contained `ars-goetia.types.ts` so the grimoire
    no longer depends on the degradation layer's `types.ts`; `ArsGoetiaBook` and `buildGoetia` import
    from there, and the dead `GOETIA_PREVIEW` fixture was removed. The component itself is byte-
    identical to the prior version (only the type-import path differs) and reuses the existing
    `.goetia-*` / `.gb-*` CSS — so this is a pure refactor with no visual/behavioral change.
  - _Ars Goetia copy + Familiar fixes._ The **Familiar** is the base creature, not a ranked seal,
    so it now carries no roman numeral (index and leaf). Removed the decorative “— turn the
    leaf —” line from the index. Rewrote the book's intro so it nods to the conceit that everyone
    can name the famous kings, princes and presidents, but it is the unsung lesser spirits — the
    foot-soldiers and familiars — who actually do the daily work.
  - _Ars Goetia retouch._ A pass over the dark grimoire: the overlay is **blacker** (less of the
    room bleeds through). On the **index**, effect copy is gone — unlocked seals show just their
    name, locked seals show their **requirement in red**, so available vs. blocked reads at a
    glance; the list **paginates** at 10 per leaf with ‹ / › page-turners (hidden when it all fits).
    On the **detail leaf**, illustrations now load from `public/assets/panvitium/invocations-ars-
goetia/<id>.png` (book drawings, not the photorealistic creature art) with a text-plate fallback
    for any seal not yet drawn; the Effect value is no longer red; the duplicate name caption under
    the picture is removed; and the back control is a visible gold-outline **‹ back to index** pill.
  - _Ars Goetia dark restyle._ Reworked the grimoire's look to match the design screenshots: it no
    longer renders as a bright parchment open-book — it floats **light-on-dark** over the degraded
    room. Dropped the `open-book.png` plate, lightened the `.goetia-overlay` so the degraded room
    shows through, and recoloured every `.goetia-*` / `.gb-*` rule onto the palette: titles / names /
    intro / lore in parchment, ranks / stat-labels / illustration caption in gold, and the effect
    hints, the Effect value, the back link and the Summon button in blood-red (Dispel an outline).
    Layout, sizes and the prop-driven component are unchanged — this is the visual change the
    component/CSS exports never actually carried.
  - _Done._ The menu-layer wiring is complete: all three rooms and every diegetic panel (Ars Goetia,
    Altar, Katabasis, Maleficia cabinet, Suasio scroll, PC) now run on real state in their designed
    shells. Backdrops: the **Studio** uses its `studio_complete.png` plate as its base so the desk PC
    and Suasio scroll are drawn under their hotspots; the Invocation room and Altar use their clean
    plates. The remaining `*_complete.png` furnished plates ship and are styled (`.furnished
.scene-*`) but there's no furnish trigger for those two yet — turning them on as the player
    progresses is a design call. Hotspots are boxless: hovering reveals the label (and door glyph)
    without a highlight box. Note runtime art is served from `apps/web/public/assets/panvitium/`; the
    repo-root `assets/` tree is source/staging and unused at runtime. Optional cleanup: the orphaned
    `useHold` export, the superseded text panels, and the unused `menus.data.ts` mock arrays. Plus
    the content backlog (art/lore for the un-illustrated invocations & maleficia, audio).

### Remaining

Economy-parity tracks still to reconcile against the spreadsheet:

- **Sigils** — **all 72 are wired** (see the per-slice S1–S16 table under Status). The final four
  landed in the economy-finalization pass: **Haures #64** (the murder model now draws victims across
  **all** subtypes, Cholerics included, and Haures biases that draw toward Cholerics), **Ose #57 /
  Orias #59** (Vitium Compositum conversion re-roll toward the currently smallest / largest converted
  subtype, via a `conversionRebalance` effect resolved in `conversionBiasMul`), and **Vual #47**
  (softens the Degenerate suicide/murder dampening through a shared `degenerateDeathRates`
  penalty-reduction channel). Nothing in the sigil catalog remains deferred.
- **Maleficia effects** — the enhancers (Opera-efficiency, sigil-amplifier, Black Candles, and the Anathema multipliers), invoking power, stack caps, **rolled Emptio pricing**, the **Hand of Glory generation buff**, and the **Defixio curse** (sim mechanics) are all done. The **single-use activation UI** (Phase 5 slice) has shipped: the Maleficia cabinet's detail view now carries a **Use** button + status readout (Hand of Glory's remaining buff time, Defixio's active target / "choosing its victim"), wired to a new `activateMaleficium` store action; selection is by id so consuming the last copy can't strand the detail view. The **oracular reveals** (Phase 5 slice) have also shipped: owning Obsidian Mirror / Hollow Effigy / The Dadu / Crossroads Dirt / Crow Feather surfaces a live Opera tier-distribution readout in that item's cabinet detail (a stacked odds bar per action, via a read-only `actionTierDistribution` sim helper that reuses the exact `resolveAction` composition). With this, Maleficia is complete — roster, gating, and every effect.
- **Opera actions** — all six are in the sim with sheet-accurate tiers, Sin-level **availability** gating, and Sin-level **delegation** gating (economy-parity 13–15). _Suasio_ (Suggestion / Logismoi / Imperium) is surfaced on the scroll, and the PC's _Decimatio_ program is now complete: _Caedis_ plus _Pogrom_ (with a present-subtype **picker** wiring `act('pogrom', subtype)`) and _Purgatio_, each gated by its Ira level, with delegation on Caedis/Purgatio but **not** Pogrom (a targetless delegated Pogrom would purge nothing yet still risk the bad-tier penalties — automating it awaits an acolyte target-selection design). Imperium's action time is now **decided at 10s** (the Suasio sheet had left it "Fill Time"; it was a flagged 60s placeholder). The Pogrom (1000) and Purgatio (10000) gold costs are sheet-pinned.
- **Emails (PC program) — impact-feedback system** _(✓ shipped, content provisional)_. An inbox that
  surfaces the in-world consequences of the player's actions as incoming correspondence (newsletters as
  the corruption spreads, complaints / a class-action from people harmed by their Vitium Mercatura
  businesses), so the player _feels_ the impact rather than reading it only as numbers. Engineering
  shape as planned: an additive-optional `inbox` save field (ADR-023; resets per lifetime, omitted from
  the wire when empty), a pure sim engine (`packages/sim/src/emails.ts`) with a trigger catalog +
  `deliverEmails(state, now)` run as the final tick step (so offline catch-up fills the inbox too), and
  `markEmailRead` / `markAllEmailsRead` helpers. Surfaced as the **Emails** PC program (inbox list with
  unread markers, click-to-read, mark-all-read); content lives in `strings.emails.catalog` keyed by id.
  Placed in the PC (the program list is effectively the Opera menu). **Provisional:** the trigger set
  (`welcome`, `first-reprobates`, `first-business`, `newsletter-influence`, `class-action`) and the copy
  are a first pass to be tuned in the 5.5 economy / Claude Design passes. New mail is surfaced by an
  unread-count **badge on the Emails tile** in the PC (via `unreadCount` + a generic `badges` prop on
  the PC window); there's no separate delivery toast yet, and no lair-level indicator on the PC prop.
- **Smartphone code terminal (studio desk) — [pending design].** A smartphone prop resting on the
  desk in the studio. Tapping it opens a dial-pad where the player enters codes formatted as
  telephone numbers; a recognised number triggers an effect — an easter egg, bonus/extra content, a
  snippet of additional game information or lore, or a gameplay **buff**. The code table and its
  effects are still to be specified. Engineering note: purely informational / easter-egg codes are
  UI-only, but any code that grants a buff or other gameplay effect needs a sim hook (and, if it
  should persist across ticks or sessions, an additive-optional save field per ADR-023).
- **Offline progression — uncap the catch-up** _(✓ shipped)_. The return recap shipped earlier (see
  the 5.4 track); the coupled **uncap** is now done too. `resumeGame` no longer clamps the elapsed
  wall-clock — offline progression accrues for the _full_ time away, however long. This reverses the
  original ADR-004 cap, which is **amended (2026-06-01)** to record the new intent: every offline term
  is safe under an unbounded delta (income / reprobate pools are linear, the apex `eᵗ` ramps self-dispel
  via their `Number.isFinite` guards, Astiwihad's mass-suicide geometric-integrates and saturates at 1)
  _except_ the **Acedia time-compound** `BASE^(offlineMinutes × L²)`, which is exponential in time. That
  one term is therefore the only thing still bounded — its `offlineMinutes` input saturates at the
  former seven-day point (`ACEDIA_COMPOUND_CAP_SECONDS`), so the sloth bonus holds at its prior maximum
  while real time accrues without limit beyond it. The recap's old `capped` flag (and the seven-day
  note) are removed. **Sync note:** the canonical ADR-004 in project knowledge should be updated to match
  the repo's amendment in `docs/04-architecture-decisions.md`.

**UI work — to be built with Claude Design.** Designed and built in Claude Design. The two items
below — Emails and the smartphone code terminal — are new in-world features whose scope is still being
specified (and may carry a small sim hook of their own). _(The Maleficia "Use" affordance, the PC's
Decimatio program, and the oracular reveals, formerly listed here, have shipped — see the
Maleficia-effects and Opera-actions bullets above. That clears all three of the surface-the-built-sim
items; the rest of this list is net-new features.)_

- **Emails (PC program).** _(✓ shipped — see the impact-feedback bullet above.)_ The inbox, sim
  triggers and save field are built; only content/trigger tuning and presentation polish remain (a
  Claude Design topic).
- **Smartphone code terminal.** The studio-desk dial-pad described above — its presentation and the
  telephone-number code-entry interaction are a Claude Design topic; buff-granting codes additionally
  need a small sim hook.

**Needs a spreadsheet / model decision (not a coding or design task).** Each item below is blocked
only on a number or mechanic being settled on the sheet; once it is, each is a straightforward slice:

- **The last 4 sigils** — _all resolved and shipped._ Haures #64 (Cholerics killable by default +
  Choleric-targeting murder bias), Ose #57 / Orias #59 (conversion re-roll toward the minority /
  majority subtype), and Vual #47 (softens the Degenerate suicide/murder penalties). See Status.
- **Imperium's action time** — _decided at 10s_ (the Suasio sheet had left it "Fill Time").
- **Placeholder sweep** — _audited and reconciled._ No value changes were needed (every flag was
  either stale or pointed to a magnitude the sheet doesn't pin); comments were corrected. See 5.5.

Blocked on inputs that don't live in a coding session (independent of the above):

- **Art & audio** — the designed room/menu layer and its plates have landed (`apps/web/src/menus/`
  - `public/assets/panvitium/`); what remains is wiring that layer to the store and any further art
    via the ADR-021 degraded-photoreal pipeline plus Howler audio content.
- **Final economy tuning** — any magnitudes not yet pinned to the sheet remain placeholders, flagged
  inline; the numbers are loaded from `Panvitium_Economy_Template.xlsx` (spreadsheet always wins).

## Phase 5 roadmap — surface, feel, and launch

> A **plan**, not a progress log. The `## Status` section above stays the authoritative record of what
> has shipped; this section sequences what comes next and reorganizes the `### Remaining` backlog into
> tracks. Each track ships the usual way — small, individually gate-green slices, one overlay tarball at
> a time (delivery convention in the `panvitium` skill, §4) — and as work lands it moves out of here and
> into `## Status`. Items that already carry a tested sim/mechanic are flagged _sim done_; items still
> waiting on a number, a model decision, or a design scope are flagged as such, because those gate _when_
> a slice can start, not how hard it is.

With Phases 2–4 and the bulk of the economy-parity pass closed, the game is mechanically complete and
playable end-to-end. Phase 5 turns that into a finished, launchable product: every built system gets a
player-facing surface, the world looks and sounds the way ADR-021 (degraded-photoreal art) and ADR-014
(Howler audio) intend, a cold-start player can find their footing, and the scaffolded stack
(ADR-016–019) actually runs in production. The six tracks below are ordered roughly by dependency and
risk — 5.1, 5.3, and 5.4 can run in parallel, 5.2 and 5.5 wait on decisions, and 5.6 gates on the others
being substantially done.

### 5.1 — Surface the built sim (Claude Design) — ✓ complete

_Three affordances whose mechanic was already implemented and tested, needing only their player
surface. All three have shipped (no new mechanic — the only sim addition was a read-only
`actionTierDistribution` helper for the reveals)._

- **The "Use" affordance** _(✓ shipped)_. A Use button plus a status readout in the
  Maleficia specimen-cabinet detail view, wired to the `activateMaleficium` store action, for the
  two consumables: **Hand of Glory** (remaining buff time) and **Defixio** (active curse's target,
  or "choosing its victim" before the roll). Selection is by id so consuming the last copy can't
  strand the detail view. Pinned by adapter + store unit tests; the Playwright e2e step is deferred to
  a machine with a browser (and would benefit from a localStorage save-seed helper).
- **Oracular reveals** _(✓ shipped)_. Owning an oracular item surfaces a live Opera tier-distribution
  readout in its cabinet detail — a stacked odds bar per action, computed by the read-only
  `actionTierDistribution` sim helper (so the odds always match an actual cast). Per the **catalog**
  (authoritative): Hollow Effigy → _Suasio_, The Dadu → _Decimatio_, Crossroads Dirt → _Emptio_, Crow
  Feather → _Indagatio_, Obsidian Mirror → all four. (The earlier README prose had Crossroads/Crow
  swapped — corrected here.) Pinned by `buildOracle` + `actionTierDistribution` unit tests.
- **Complete the PC's Decimatio program** _(✓ shipped)_. The PC's _Decimatio_ program now carries
  _Caedis_, _Pogrom_ (a present-subtype picker wiring `act('pogrom', subtype)`), and _Purgatio_, each
  gated by its Ira level; delegation is offered on Caedis/Purgatio but not Pogrom (targetless
  delegation would be a footgun). Decimatio lives entirely in the PC, never on the Suasio scroll.
  Pinned by a `pogromTargets` adapter test; the Playwright e2e step is deferred to a machine with a
  browser.

**Done** — all three surfaces drive live store/sim reads and are pinned by unit/adapter tests; the
Playwright e2e steps are deferred to a browser-capable machine (they'd want a localStorage save-seed
helper to reach the required state, a small task of its own).

### 5.2 — New diegetic features (Claude Design + a small sim hook)

_Net-new in-world systems already named in the backlog; **scope, triggers, and presentation are still to
be specified** — each needs a short design pass before it becomes a slice._

- **Emails (PC program) — impact-feedback** _(✓ shipped, content provisional)_. An inbox that surfaces
  the in-world consequences of the player's actions as incoming correspondence (newsletters, a
  class-action from people harmed by the player's _Vitium Mercatura_ businesses, and similar reactive
  mail), so the player _feels_ the impact rather than only reading numbers. Built as planned: an
  additive-optional inbox save field (ADR-023) plus a sim trigger catalog evaluated each tick. Triggers
  and copy are a provisional first pass.
- **Smartphone code terminal (studio desk).** A smartphone prop on the studio desk that opens a dial-pad;
  a recognised telephone-number code triggers an easter egg, bonus content, a lore snippet, or a gameplay
  **buff**. Informational/easter-egg codes are UI-only; any buff-granting code needs a sim hook (and, if it
  should persist, an additive-optional save field per ADR-023). The code table and its effects are still
  to be specified.

**Done when** the scope is agreed in design, any sim hook lands with focused Vitest pins, and the surface
ships behind an e2e step.

### 5.3 — Art & audio (ADR-021 + ADR-014)

_The track gated on the `assets/` tree (which lives in the repo but outside a coding session) and the
single GIMP degrade recipe. The room/menu degraded-photoreal pipeline is already in; what remains is
content._

- **Illustration.** Draw the un-illustrated invocations and maleficia — both the Ars Goetia _book_
  drawings (`public/assets/panvitium/invocations-ars-goetia/<id>.png`, currently a text-plate fallback for
  un-drawn seals) and the photoreal specimen art for the Maleficia cabinet — through the one ADR-021
  degrade recipe, so the whole diegetic frame reads at a single fidelity.
- **Audio.** Bring up the Howler layer over the existing `audio.play(event)` stub (ADR-014): settle the
  event taxonomy, supply the asset set, and add a mute/volume control (which folds into the settings panel
  in 5.4).

**Done when** every catalog entry has art (no text-plate fallbacks remain) and the core events have sound.

### 5.4 — Onboarding & game feel

_Forward-looking — not yet in the backlog; **confirm scope before coding**. None of this is new gameplay;
it is the UX an idle game needs to keep a cold-start player past the first minutes._

- **First-run ramp.** A light guided opening — the first _Suasio_, the first Devotion threshold, the first
  _Katabasis_ — surfaced as gentle prompts rather than a heavy modal tutorial.
- **Help & glossary.** Tooltips on resources, the seven outcome tiers, and the modifier readouts; a short
  glossary that explains (without anglicizing) the Latin — _Opera_, _Suasio_, _Decimatio_, _Katabasis_,
  _Vitium Compositum_, and the rest.
- **Readability** _(✓ shipped)_. BigNum displays use **consistent short-scale suffixing**:
  `formatBigNum` reads as grouped integers below a million, then M / B / T / … / Dc suffixes, then
  compact scientific beyond the ladder for the astronomical endgame — so values stay legible deep into
  a run. **Per-second rate readouts** exist too: a read-only `perSecondRates(state)` sim helper mirrors
  the tick's income terms (zeroing while frozen mid-descent or under Morpheus), pinned by parity tests
  (the readout equals the gold the tick actually accrues over one second). These now surface in the
  **Analytics** program rather than the HUD (see below).
- **Analytics PC program** _(✓ shipped)_. The always-on readouts were pulled off the HUD entirely, and
  the HUD itself is gone — the PANVITIUM wordmark was removed from the screen too (its gold-leaf
  display-caps treatment is preserved, unmounted, in `Hud.tsx` / the `.game-name` rule for reuse).
  Everything moved into this on-demand PC program (between Emptio and Achievements). Four tabs: **Main** (default — the ambient status that
  used to sit on the HUD: the in-flight rite with progress, the vigil clock, and player efficiency),
  **Resources** (souls / gold / influence with `perSecondRates` and the influence cap), **Reprobates**
  (unconverted vs converted counts by subtype, plus `reprobateRates` generation / conversion / death
  rates — this also subsumes the old HUD reprobate count), and **Acolytes** (a per-acolyte board showing
  each one's current action, remaining cycle time, and a progress bar). Reuses the existing `kat-tab` tab
  styling; the data all comes from already-tested sim helpers.
- **Settings / options panel** _(partly shipped)_. A gear in the top-right opens a settings overlay.
  **Shipped:** local-first save tools — **export** (serialize the current game to a portable string via
  `serializeSaveBlob`), **import** (replace the game from a pasted save, validated through `parseSaveBlob`
  → `migrateSave`, written and re-loaded like the conflict chooser's adopt path), and a **guarded hard
  reset** (two-step confirm). Backed by `exportSave` / `importSave` store actions and round-trip +
  rejection tests. **Still to do in this panel:** audio controls (wait on the 5.3 art/audio track) and
  the `DegradePass` knobs (the engine already exposes them).
- **Return-from-away recap** _(✓ shipped)_. A welcome-back screen on resume showing the time away and
  the net souls / gold / influence / reprobates that accrued, replacing the old silent catch-up. Driven
  by a pure `offlineRecap(saved, resumed, now)` diff (separate from `resumeGame`, so its tests stay
  intact), threaded through `loadGame` into a store `offlineRecap` + `dismissOfflineRecap`, and mounted
  as `WelcomeBackModal`. Suppressed for absences under a minute and while frozen mid-descent; it carries
  a `capped` flag (pairs with the still-pending **uncap** decision in `### Remaining`). Pinned by
  `offlineRecap` unit tests.
- **Notifications.** A single toast/notice surface that folds together what already exists piecemeal: the
  achievement unlock toast, toggle auto-deactivation notices (`TickResult.notices`), and sync status.

**Done when** a player starting from a cold save reaches their first _Katabasis_ unaided in playtest.

### 5.5 — Economy finalization

_Blocked on a number or a model decision on `Panvitium_Economy_Template.xlsx`, not on effort — once each
is settled it is a straightforward slice (the spreadsheet always wins on numbers and on a system's
composition)._

- **The last 4 sigils** _(✓ shipped)_. **Haures #64** (the murder model now draws victims across all
  subtypes — Cholerics killable by default — and Haures biases the draw toward Cholerics), **Ose #57 /
  Orias #59** (conversion re-roll toward the minority / majority subtype via a `conversionRebalance`
  effect that multiplies the current argmin / argmax converted subtype's weight in `conversionBiasMul`
  by the sheet's sqrt%), and **Vual #47** (softens the Degenerate suicide/murder dampening through a
  shared `degenerateDeathRates` penalty-reduction channel applied to both muls). All 72 sigils now bind.
- **Imperium's action time** _(✓ shipped)_. Decided at 10s (the _Suasio_ sheet had left it "Fill Time";
  was a flagged 60s placeholder).
- **Placeholder sweep** _(✓ shipped)_. Audited every inline-flagged magnitude against the sheet. The
  verdict: **no value changes were needed** — each flag was either stale (the value is already
  sheet-accurate, just mis-commented) or pointed to a magnitude the sheet doesn't pin. Reconciled the
  comments: the Choleric-murder base (0.001) is sheet-pinned (Globals); Bacchanal's 10% and Panvitium's
  costs / 0.01 conversion / eᵗ growth all derive from Globals; the invocation effect factors are the
  Invocatio sheet's Efficiency column. The genuinely unpinned tuning values (no sheet number, so they
  stay as-is) are the Acedia offline-compound base `1.00002`, the Panvitium churn multipliers
  (gen/suicide/murder while active, in `modifiers.ts`), and the subtype **secondary**-effect magnitudes
  (the sheet's per-unit 0.01 is the Vitium-gold boost, which matches `SUBTYPE_VM_GOLD_BOOST_PER_COUNT`;
  the −suicide/−murder/−generation magnitudes have no separate sheet number). See "Open question" below.

**Done when** no placeholder magnitudes remain flagged. **✓ Done** — the sweep above reconciled them;
all 72 sigils bind.

> **Open question for the economy owner (not blocking):** the Reprobates sheet lists one "Effect per
> unit = 0.01" per subtype. The code reads that as the **primary** Vitium-gold boost (0.01, matched) and
> uses smaller tuning magnitudes (0.001 / 0.0001) for each subtype's **secondary** rate effect. If the
> intent is that the secondary effects should _also_ be 0.01 per unit, that's a deliberate balance change
> (e.g. 100 Degenerates would then halve suicide) — say the word and it's a one-line-per-constant edit
> plus a test refresh.

### 5.6 — Production readiness & launch

_The scaffolded infrastructure (Phase 2) becomes a live service. Touches ADR-010/011/016–019/023; gates on
the other tracks being substantially done._

- **Deploy path.** Exercise it end-to-end: `main` builds/tests/publishes GHCR images, `release` is the
  deploy gate, and a webhook deploys onto the single VPS behind Caddy auto-HTTPS (ADR-016/017). No
  auto-deploy from `main`.
- **Backups.** Nightly `age`-encrypted `pg_dump` to B2/R2, with the weekly restore test actually running
  (ADR-018).
- **Observability.** Dozzle + UptimeRobot live now; self-hosted PostHog later (ADR-019).
- **Hardening before it bites.** Turn on HMAC-signed saves (ADR-011) and dry-run the first real save
  migration (`migrations/v1→v2`, ADR-023) so the path is proven before a schema change forces it — none
  exists yet (the dir holds a `_noop` placeholder + harness).
- **Performance & accessibility.** Offline catch-up at large capped deltas, the `DegradePass` canvas cost,
  and keyboard / assistive-tech reach across the diegetic panels.
- **Beta → launch.** A closed beta cohort, then launch.

**Done when** the game runs on the VPS, survives a restore test, monitoring is green, and a beta cohort is
playing.

## License

Proprietary. All rights reserved.
