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

**Current test count: 601** (sim 452 · shared 48 · api 11 · web 90).

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

**Sigils** — in progress (completing the 72-Goetia catalog against the Sigils sheet; ~68 of 72 now
bindable, the rest pending their effect mechanics):

| #   | Slice                            | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Existing-field wiring            | Wired the sigils expressible via the existing modifier bundle with no new mechanic: Belial #68 (influence rate), Marax #21 (offline time mul), Murmur #54 (overall invocation effectiveness), Balam #51 (−Terrible weight), Cimejes #66 (maleficia Katabasis roll). Added `invocationEfficiencyMul` + `offlineTimeMul` to the sigil-targetable fields (both already in the bundle and consumed).                                                                                                                                                            |
| S2  | Per-category tier/success        | New `categoryTier` SigilEffect variant (`{ category, tiers, direction }`) folded into `categoryTierModifiers` via `sigilCategoryTierContributions` (scaled by the Solomon's Ring / Iron Nails enhancers). Wired Agares #2 / Beleth #13 (Indagatio / Decimatio success), Botis #17 / Ipos #22 (−Suasio / −Decimatio bad outcomes), Astaroth #29 / Andras #63 (+Stellar for Indagatio / Emptio), Andromalius #72 (Emptio success) and Naberius #24 (Suasio success).                                                                                          |
| S3  | Per-category action efficiency   | Added `indagatioEfficiencyMul` + `emptioEfficiencyMul` to the bundle and `categoryEfficiency`, completing the four-category Opera-efficiency surface (these are time-mode, so they scale action speed). Wired Bifrons #46 (Indagatio) and Seere #70 (Emptio).                                                                                                                                                                                                                                                                                               |
| S4  | Per-Sin invocation effectiveness | New `invocationSin` SigilEffect variant + `sigilInvocationSinContributions` feeding a per-Sin `invocationSinEffectivenessMul` bundle map. `invEffFor(sin)` applies it to every efficiency-derived invocation effect (Fama/Harpy/Plutus/Succubus/Nightmare/Behemoth/Lemure) and the autonomous runners (via `def.sin`). Wired Samigina #4 (Tristitia), Barbatos #8 (Gula), Bune #26 (Vanagloria), Berith #28 (Superbia), Furfur #34 (Luxuria), Vepar #42 (Ira), Shax #44 (Avaritia), Alloces #52 (Acedia).                                                   |
| S5  | Subtype penalty reductions       | New `penaltyReduction` SigilEffect variant + `sigilPenaltyReductionByChannel`, dividing a penalty channel's per-count coefficient by `(1 + strength)` (never into a bonus). Wired Gaap #33 (Sigma influence), Malphas #39 (Celebrity gold), Gremory #56 (Degenerate suicide) and Volac #62 (Gambler generation). Vual #47 (−Degenerate gold) deferred — no such penalty in the model yet.                                                                                                                                                                   |
| S6  | Flat generators                  | New `flatGen` SigilEffect variant + `sigilFlatGeneration`, feeding flat per-second resource into `flatGoldPerSecond` / `flatInfluencePerSecond` (accrued in the tick, scaled by the rate muls). Wired Haagenti #48 (gold/s) and Decarabia #69 (influence/s). Corrected the `log` binding curve from `log10` to `ln(1 + N)` to match the sheet yields exactly (only these two log sigils use it).                                                                                                                                                            |
| S7  | Flat invoking power              | New `invokingPower` SigilEffect variant + `sigilInvokingPower` (rounded to int), added to `currentInvokingPower` on top of the maleficia total so it counts toward the invocation gates. Wired Andrealphus #65.                                                                                                                                                                                                                                                                                                                                             |
| S8  | Cost reductions                  | New `costReduction` SigilEffect variant + `CostChannel` + `sigilCostReductionByChannel`, dividing a cost by `(1 + strength)` at its site (never an increase). Wired Paimon #9 (action influence costs), Amy #58 (Emptio gold), and Orobas #55 (invocation soul cost — discount may pierce the nominal minimum).                                                                                                                                                                                                                                             |
| S9  | Conversion-bias sigils           | New `conversionBias` SigilEffect variant (`{ subtype }`) + `sigilConversionBiasContributions`, composed into the `conversionBiasMul` draw seam on top of the apex Specunitas bias — strictly multiplicative on existing source weights (cannot manufacture a conversion from a zero-source subtype). Wired Eligos #15 and Phenex #37, both biasing Celebrity conversion.                                                                                                                                                                                    |
| S10 | Subtype-targeted murder rates    | New `murderBias` SigilEffect variant (`{ subtype }`) + `sigilMurderBiasContributions`, biasing the Choleric murder-victim draw in `removeOneNonCholeric` (weight = count × bias) — the weighted path engages only when such a sigil is bound, so the no-bias RNG stream stays byte-identical. Wired Glasya-Labolas #25 (Celebrity), Sabnock #43 (Glutton), Camio #53 (Degenerate). Amdusias #67 (non-Choleric types) lifts the overall `cholericMurderRateMul`. Haures #64 (Choleric victims) deferred — the model has Cholerics as murderers, not victims. |
| S11 | Nihilist suicide-rate sigils     | Added `nihilistSuicideMul` to the sigil-targetable fields and amplified the Nihilist-count suicide term in `computeModifiers` by `sc('nihilistSuicideMul')` (so it only lifts the rate when Nihilists are present, never from nothing). Wired Ronove #27 and Focalor #41, both increasing the Nihilist-driven suicide rate.                                                                                                                                                                                                                                 |

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

- **Sigils** — 68 of 72 are wired (see the per-slice S1–S16 table under Status). The last 4 are all
  blocked on a design/model decision rather than effort: Ose #57 / Orias #59 (per-second subtype
  rebalancing — needs sub-1/tick accrual pools + a sheet-pinned move-rate), Vual #47 (−Degenerate
  gold penalty — no such penalty exists in the model yet), and Haures #64 (Choleric-on-Choleric
  murder — Cholerics are murderers, not victims). Each needs a number or a mechanic settled on the
  spreadsheet before it can be wired without guessing.
- **Maleficia effects** — roster, invoking power, stack caps, the Opera-efficiency enhancers
  (Ars Serpens / Voynich / Ritual Dagger), the sigil-effect amplifiers (Solomon's Ring / Iron Nails),
  and the invocation-effect multiplier (Black Candles) are done. Still to wire: the oracular reveals,
  the targeted single-use items (Defixio / Hand of Glory), and the rolled-at-purchase pricing.
- **Missing Opera actions** — _logismoi_, _imperium_, _pogrom_, _purgatio_.
- **Emails (Opera menu) — impact-feedback system [pending design].** A new Opera-menu item that
  surfaces the in-world consequences of the player's actions as incoming correspondence: subscribed
  newsletter emails, messages from people affected by the player's businesses (e.g. class actions),
  and similar reactive mail. The intent is to let the player _feel_ the impact of what they are doing
  rather than read it only as numbers. Scope, triggers and presentation still to be specified.

Blocked on inputs that don't live in a coding session (independent of the above):

- **Art & audio** — the designed room/menu layer and its plates have landed (`apps/web/src/menus/`
  - `public/assets/panvitium/`); what remains is wiring that layer to the store and any further art
    via the ADR-021 degraded-photoreal pipeline plus Howler audio content.
- **Final economy tuning** — any magnitudes not yet pinned to the sheet remain placeholders, flagged
  inline; the numbers are loaded from `Panvitium_Economy_Template.xlsx` (spreadsheet always wins).

## License

Proprietary. All rights reserved.
