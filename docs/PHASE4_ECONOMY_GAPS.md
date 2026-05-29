# Panvitium — Phase 4 economy integration gaps

**Audit:** `docs/Panvitium_Economy_Template.xlsx` (the authoritative economy) vs. the implemented game
(`packages/sim`, `packages/shared`, `apps/web`).
**Method:** every one of the 13 spreadsheet sheets was dumped and compared against the catalogs,
constants, and resolver code that should carry its topics.
**Scope:** *identification only — no fixes applied.* This is the "what's missing / wrong" map.

> **One framing note that explains most of the subtle gaps.** In several places the spreadsheet was
> revised after the code was written, and the code followed the prose in `docs/03-content-catalog.md`
> rather than the (newer) spreadsheet. Per the project's own rule — *"when a number and a doc disagree,
> the spreadsheet wins"* — those count as gaps even though the code matches the doc. They are flagged
> as **doc/sheet conflict** below so you can adjudicate them deliberately.

---

## Severity summary by sheet

| # | Sheet | Status | Headline gap |
|---|-------|--------|--------------|
| 1 | Globals | ⚠️ Mostly integrated | **Base gold = 1/s in sheet, hard-coded 10/s in `constants.ts`** |
| 2 | Sins & Devotion | ✅ Integrated | Per-level + skill effects all wired; Gula "online-only" caveat not enforced |
| 3 | Prob Tiers | ✅ Integrated | 7-tier multiplicative→renormalise engine matches exactly |
| 4 | Suasio | ❌ Major gap | **Only 1 of 3 actions** (Logismoi, Imperium absent); Suggestion outcomes mis-mapped |
| 5 | Decimatio | ❌ Major gap | **Only 1 of 3 actions** (Pogrom, Purgatio absent); Caedis Apocalyptic is a no-op |
| 6 | Vitium Mercatura | ❌ Major gap | **Only tier 1 of 4** wired (8 of 32 businesses); Gula tier-1 gen wrong |
| 7 | Vitium Compositum | ❌ Major gap | **Only 5 of 13 toggles**; wired ones have wrong numbers; special effects absent |
| 8 | Invocatio | ⚠️ Roster complete, effects drift | 18/18 gated correctly, but ~7 invocation **effects don't match** the sheet |
| 9 | Indagatio & Emptio | ⚠️ Wired, semantics wrong | **Emptio Neutral (90%) refunds instead of buying**; gold-loss % wrong |
| 10 | Reprobates | ✅ Integrated | All 8 subtypes + secondary effects wired (magnitudes placeholder) |
| 11 | Sigils | ❌ Major gap | **Only 16 of 72** wired; two "generate X/s" sigils have no mechanic |
| 12 | Maleficia | ❌ Major gap | **Only 10 of 25**; present items missing their effects; stack caps wrong |
| 13 | Acolytes | ⚠️ Wired, wrong curve | Count uses **log₁₀ (×10/step)** vs the sheet's **×2.2/step** — grossly too slow |

**Highest-impact, player-visible gaps** (these most plausibly explain "Phase 4 isn't there in reality"):

1. Emptio almost never completes a purchase (Neutral = 90% = refund, not buy). — Sheet §9
2. Two-thirds of the Opera action roster is missing (Logismoi, Imperium, Pogrom, Purgatio). — Sheets §4/§5
3. Three-quarters of Vitium Mercatura (tiers 2–4) and most Vitium Compositum toggles don't exist. — Sheets §6/§7
4. Acolytes scale ~10× too slowly, so the parallelism lever barely moves. — Sheet §13
5. 56 of 72 sigils do nothing when bound. — Sheet §11

---

## 1. Globals

Correctly integrated: base influence rate `0.025`, base suicide `0.00023`, devotion base `180`,
Eternal-Sin threshold `8398080000`, skill-intensity divisor `65.37`, the three carry-over base
fractions (`0.05` each), business-shutdown recovery `0.25`, base max influence `100`.

**Gaps:**

- **Base gold gain.** Sheet `Globals!B2 = 2 gold/s`. Code `constants.ts → BASE_GOLD_PER_SECOND = 10`
  (and its comment falsely says "Globals: 10 gold/s"). **5× too high.** High-confidence, easy to miss
  because the comment looks authoritative.
- **VC base cost/output constants not centralised.** The sheet defines `Base VC gold cost = 100`,
  `influence cost = 10`, `gold out = 100`, `influence out = 10`, `conversion = 0.01`, and every
  Compositum toggle is expressed as a multiple of these. The code has no such Globals-derived VC
  bases — each toggle hard-codes its own (wrong) numbers (see §7).
- **Indagatio/Emptio base-time internal conflict.** `Globals` says Indagatio `1800 s` / Emptio `600 s`,
  but the `Indagatio & Emptio` sheet says `300 s` / `60 s`. The code uses `300`/`60` (matches the
  per-action sheet). Not a code gap, but the **spreadsheet contradicts itself** — worth resolving so a
  future tuning pass doesn't reintroduce 1800/600.

## 2. Sins & Devotion

Fully integrated. The eight Princes, the skill-intensity formula `ln(x)²/65.37`, and the per-level
effects are all present in `modifiers.ts`/`constants.ts`: Gula `2^level` player-eff, Tristitia
`2^level` suicide, Ira `1.33^level` acolyte+invocation eff, Vanagloria `1.5^level` influence, Avaritia
/Luxuria/Superbia carry-over `+6.25%/+6.25%/+12.5%`, Acedia offline `1.00002^(X·L²)`.

**Minor gap:**
- Gula's level effect is documented as **online-only** ("does not apply when offline"). The code folds
  `2^gulaLvl` into `playerEfficiencyMul` unconditionally; whether the offline path strips it is not
  enforced at the modifier layer. Worth a check against the offline catch-up code.

## 3. Prob Tiers

Fully integrated. `probability.ts` implements the seven tiers, multiplicative per-tier weights, and
renormalisation-to-1.0 exactly as the sheet specifies. No gap.

## 4. Suasio

Sheet defines **three** actions. Code (`actions.ts → ACTIONS`) wires **one** (`suggestion`).

**Gaps:**

- **Logismoi — not implemented.** Sheet: one-shot 5 s, 25 influence; unlock Luxuria 2 / toggle
  Luxuria 3; full 6-tier outcome table (Stellar +randint(10,29) souls, etc.). Absent from `ACTIONS`.
- **Imperium — not implemented.** Sheet: one-shot, 100 influence; unlock Luxuria 3 / toggle Luxuria 4;
  single fixed Good outcome `+randint(360,1260)` unconverted. Absent.
- **Suggestion outcome mis-mapping (doc/sheet conflict).** Sheet effects vs `resolveSuggestion`:
  - Stellar — sheet: "major sin → +randint(4,8) **unconverted reprobates**". Code: `mintSouls(units)`
    (gives **souls**, count = floor(efficiency), no randint). Wrong resource and magnitude.
  - Excellent — sheet: "target suicides → **+1 soul**". Code: `addReprobates(biasedSubtype, units)`
    (gives a **converted reprobate**). Wrong resource.
  - Good/Bad/Terrible/Neutral match the sheet.
- **Suasio action-"toggle" mechanic absent.** The Asmodeus per-level effect ("unlocks Suasio actions
  **and toggles**") implies auto-repeating Suasio actions gated by Luxuria level. No such toggle exists
  (Vitium Compositum toggles are a separate system).

## 5. Decimatio

Sheet defines **three** actions. Code wires **one** (`caedis`).

**Gaps:**

- **Pogrom — not implemented.** Sheet: one-shot ~60 s, high gold; unlock Ira 2 / toggle Ira 3;
  single-subtype mass cull (Stellar 25% / Excellent 10% / Good 5% of chosen subtype). Absent.
- **Purgatio — not implemented.** Sheet: one-shot ~3600 s, very high gold; unlock Ira 3 / toggle Ira 4;
  all-subtype cull (Stellar 100% / Excellent 66% / Good 33% of all reprobates). Absent.
- **Caedis Apocalyptic is a no-op.** Sheet: "66% gold loss **and** 50% total reprobate loss". Code
  `resolveCaedis` falls through `case 'apocalyptic'` to `return state` — does nothing (there is even a
  stale `// TODO` describing a *different*, also-unimplemented behaviour). Caedis Stellar/Excellent/
  Good/Bad(5%)/Terrible(15%)/Neutral all match the sheet.
- **Decimatio action-"toggle" mechanic absent** (same shape as the Suasio toggle gap; Satan per-level
  "unlocks Decimatio actions and toggles").

## 6. Vitium Mercatura

Sheet defines **4 tiers × 8 Sins = 32 businesses**. Code (`businesses.ts → BUSINESSES`) wires the
**8 tier-1 entries only**.

**Gaps:**

- **Tiers 2–4 entirely missing (24 of 32 businesses).
- **Gula tier-1 rates wrong.**

## 7. Vitium Compositum

Sheet defines **13 toggles**. Code (`compositum.ts → COMPOSITA`) wires **5** (Bacchanal, Loan Shark Op,
Charity, Gala, Panvitium).

**Gaps:**

- **8 toggles missing:** Outrage Cycle (Ira+Vanagloria), Dolce Far Niente (Gula+Acedia), Enraging
  Broadcast (Ira+Tristitia), Ethnocentric Revolt (Superbia+Ira), No-babies Movement (Luxuria+Acedia),
  Doom Gathering (Tristitia+Acedia), Vegas (4-Sin, min L2), Crusade (4-Sin, min L2).
- **The 5 wired toggles have wrong numbers** (sheet values are multiples of the Globals VC bases of
  100/10/100/10/0.01):

  | Toggle | Sheet (gold cost / infl cost / gold out / infl out / conv) | Code |
  |---|---|---|
  | Bacchanal | 100 / 10 / 0 / 0 / 0 | 50 / 0 / 0 / 0 / 0.04 |
  | Loan Shark Op | 0 / 10 / 100 / 0 / 0.01 | 0 / 20 / 8 / 0 / 0.04 |
  | Charity | 0 / 25 / 200 / 0 / 0.01 | 0 / 30 / 15 / 0 / 0.04 |
  | Gala | 250 / 0 / 0 / 20 / 0.01 | 100 / 0 / 0 / 5 / 0.04 |

- **The "conversion rate instead applies as…" special effects are unimplemented.** Many toggles in the
  sheet repurpose the conversion-rate column into a distinct mechanic, none of which the code applies:
  Bacchanal "generates 10% of total Gluttons+Degenerates/s as unconverted" (code uses a flat
  `0.05/s`); Dolce Far Niente → offline-gain boost; Enraging Broadcast → % death of total reprobates;
  Ethnocentric Revolt → flat Choleric-murder-rate increase; No-babies Movement → flat generation
  decrease; Doom Gathering → flat suicide-rate increase; Vegas/Crusade → subtype-penalty modifiers.
  The `CompositumDef` shape has no field for any of these.
- **Panvitium tuning differs.** Sheet: costs and conversion grow as `e^t` (continuous, base ≈ 2.718)
  and "generated as souls/s based on current souls" + flat unconverted-gen increase. Code: growth base
  `costGrowthPerSecond = 1.03`, no soul-minting effect, no flat-gen effect. The exponential base (e vs
  1.03) changes the ramp dramatically; the soul-mint and gen effects are absent.

## 8. Invocatio

Roster is **complete (18/18)** and the gates match the sheet — every invoking-power threshold and Sin
level (Familiar ≥3; Upir ≥3/Gula1; Imp ≥4/Ira1; Behemoth ≥3/Superbia1; Nightmare ≥6/Tristitia1;
Lemure ≥7/Acedia1; Harpy ≥7/Ira2; Fama ≥7/Vanagloria1; Lamia ≥8/Luxuria2; Plutus ≥8/Avaritia2;
Aurevora ≥10/Gula3; Midas ≥11/Avaritia3; Doppelgänger ≥12/Superbia3; Succubus ≥12/Luxuria3;
Specunitas ≥13/Vanagloria3; Morpheus ≥14/Acedia3; Astiwihad ≥15/Tristitia3; Erinyes ≥17/Ira3) is
correct. Midas, Doppelgänger, Erinyes, Morpheus, Astiwihad, Specunitas, Upir, Imp, Familiar, Plutus
effects all match.

**Gaps — effect semantics drift (doc/sheet conflict).** The sheet recasts most *normal* invocations as
"action efficiency (column H) applies to <category/dimension>", and the code implemented the older
doc-03 bespoke effects instead:

- **Succubus** — sheet: efficiency (`19.8×base = 0.99`) applies to **Suasio efficiency** + a
  multiplicative **gold decrease**. Code: **generation ×10** + gold→1%. The generation boost is not in
  the sheet; the Suasio-efficiency boost is not in the code.
- **Harpy** — sheet: multiplicative **Decimatio-efficiency** increase. Code: **Choleric-murder ×1.1**.
  Different mechanic entirely.
- **Lamia** — sheet: efficiency applies to **Suasio** (an efficiency boost). Code: lifts **Suasio
  success-tier weights + reprobate generation**.
- **Lemure** — sheet: efficiency applies as additive **offline gain rate** (`0.5×base`). Code: flat
  **influence/s per Husk**.
- **Behemoth** — sheet: **additive** Stellar-chance increase (`0.01×base = 0.0005`, tiny). Code:
  **+50% Stellar weight** per copy (multiplicative, large). Mode and magnitude differ.
- **Fama** — sheet: **additive** influence-gain increase. Code: influence **×1.25** (multiplicative).
- **Nightmare** — sheet: additive base-suicide increase (scaled by `0.05`). Code: **+5%** additive.
  Closest of the set; still a magnitude/scaling question.
- **Aurevora** — sheet: drains **1% of current gold/s** rising exponentially, **1/10 of the exponential**
  applied as efficiency. Code: flat `100 gold/s` base, growth `1.05`, full exponential applied to
  efficiency. Proportional-vs-flat model mismatch + the 1/10 factor is absent.

Plutus (VM-output boost) and the apex set are aligned in shape; only their magnitudes are placeholders.

## 9. Indagatio & Emptio

The actions exist and run (`emptio`/`indagatio` in `ACTIONS`, base times `60`/`300` per the per-action
sheet). The outcome **semantics** diverge from the sheet:

**Indagatio (doc/sheet conflict):**

- **Rarity mapping shifted by one tier.** Sheet: Stellar→anathema, Excellent→profane, **Good→rare,
  Neutral→common**, Bad→false-lead. Code `resolveIndagatio`: Stellar→anathema, Excellent→profane,
  **Good→common, Neutral→nothing**. So the code surfaces nothing on Neutral (50% of rolls) and never
  surfaces a *rare*.
- **Gold-loss magnitudes wrong.** Sheet: Terrible **−15%**, Apocalyptic **−80%**. Code: Terrible
  **−5%**, Apocalyptic **−20%**.

**Emptio (doc/sheet conflict — high impact):**

- **Neutral is the 90% case and the sheet makes it a successful purchase** ("purchase at listed price").
  Code `resolveEmptio` Neutral = *deal falls through, full refund, item stays on the list* (no
  acquisition). Combined with Good having weight 0, the result is that **a normal Emptio almost never
  yields the item** — it just refunds. This is likely the single biggest reason the maleficia loop
  "isn't there." Stellar (acquire+full refund) and Excellent (acquire+half refund) match.
- **Apocalyptic gold bite wrong.** Sheet: lose **50%** total gold. Code: `loseGoldFraction(0.3)` (30%).

## 10. Reprobates

Fully integrated in shape. All eight subtypes exist (`state.ts`) and every secondary effect from the
sheet is consumed in `modifiers.ts`: Glutton −offline / +Gula VM gold; Degenerate −suicide / −Choleric
murder / +Luxuria VM gold; Gambler −generation / +Avaritia VM gold; Nihilist +suicide / +Tristitia VM
gold; Choleric +murder / +Ira VM gold; Husk −online eff / +Acedia VM gold; Celebrity −gold / +Vanagloria
VM gold; Sigma −influence / +Superbia VM gold. The shared "+Vitium gold" base uses the sheet's
`0.01` ("Base converted reprobate effect").

**Minor gaps:**
- Per-effect magnitudes are independent placeholders (`0.0001`–`0.001`) rather than the sheet's single
  `0.01` "applied additively" base — a tuning reconciliation, not a wiring gap.
- The Choleric murder base is modelled "per Choleric" (`BASE × cholericCount`) while the sheet labels
  `0.001` as "/s of total pop". Unit wording differs between sheet and doc; worth pinning which is
  intended.

## 11. Sigils

Sheet defines all **72** with curve (`sqrt` default; `#48`/`#69` are `log`) and base coefficient
(`0.001×` for most; `#48 = 10×`, `#69 = 1×`). Code (`sigils.ts → SIGILS`) wires **16**:
`5, 6, 7, 11, 16, 18, 20, 23, 31, 32, 35, 38, 40, 49, 60, 71`. All 16 wired ones map to the correct
sheet effect.

**Gaps:**

- **56 of 72 sigils are unwired** — binding souls to them does nothing. This includes whole effect
  families the engine has no hook for yet: per-Sin "invocation effectiveness" (#4, #8, #26, #28, #34,
  #42, #44, #52), per-subtype murder targeting (#25, #43, #53, #64, #67), subtype-penalty mitigations
  (#33, #39, #47, #56, #62), Indagatio/Emptio tier-success and rarity sigils (#2, #3, #29, #36, #50,
  #63, #72), VC re-roll sigils (#57 Ose, #59 Orias), and the Katabasis/economy sigils (#45 Vine
  shutdown-refund, #65 Andrealphus invoking power, #66/#3 maleficia chance, #9 Paimon influence cost).
- **"Generates X/s" sigils have no mechanic.** `#48 Haagenti` (generates gold/s) — there is **no
  `flatGoldPerSecond` field** in the modifier bundle (only `flatInfluencePerSecond`). `#69 Decarabia`
  (generates influence/s) has a hook (`flatInfluencePerSecond`) but isn't wired.
- **Linear-curve handling untested.** The sheet says linear sigils apply as a **flat** increase while
  sqrt/log apply as a **percentage**. The code applies all `modifier`/`tier` sigils as `(1+strength)`
  multiplicative regardless of curve. No wired sigil is linear today, so it isn't yet violated, but the
  distinction isn't implemented for when linear sigils land.

## 12. Maleficia

Sheet defines **25** items (with rarity, invoking power, stack cap, effect, magnitude). Code
(`maleficia.ts → MALEFICIA`) wires **10**: Black Robe, Black Salt Pouch, Sulfur Censer, Ritual Dagger,
Blackthorn Wand, Obsidian Mirror, Spear of Longinus, Codex Gigas, Thirty Pieces of Silver, Mark of Cain.

**Gaps:**

- **15 items missing:** Ars Serpens, The Voynich Manuscript, Blood Chalk, Black Candles, Defixio, Hand
  of Glory, The Dadu, Dybbuk Box, Hollow Effigy, Solomon's Ring, Iron Nails, Witch Bottle, Crossroads
  Dirt, Mandrake Root, Crow Feather.
- **Present items are missing their non-power effects.** Only the four anathema enhancers (Spear ×3
  max influence, Codex ×3 influence, Thirty Pieces ×3 gold, Mark of Cain Apocalyptic→0) feed the
  modifier engine. The sheet also gives **Ritual Dagger +33% Decimatio efficiency** — it's in the code
  catalog but only as an invoking-power item; its efficiency effect is not applied. (The missing items
  add: Ars Serpens/Voynich Suasio-eff, Black Candles +invocation effect, Solomon's Ring/Iron Nails
  sigil-effect boosts, the four "reveal distribution" oracular items, and the single-use targeted
  Defixio / Hand of Glory.)
- **Black Salt Pouch stack cap wrong.** Sheet: stack cap **∞**. Code: `stackMax: 5`.
- **Costs are fixed, not the sheet's per-rarity `randint` ranges.** Sheet: Anathema `randint(66666,
  93456)`, Profane `randint(6666, 23754)`, Rare `randint(1000, 3333)`, Common `randint(100, 1000)`.
  Code uses fixed costs, and the anathema items are priced `100000` — **above the sheet's max of
  93 456**. (Several others are inside the ranges; the model itself differs.)
- **Invoking-power values for present items match** the sheet where they overlap (Black Robe 1, Ritual
  Dagger 2, Sulfur Censer 2, Blackthorn Wand 4, Obsidian Mirror 8, Black Salt Pouch 1).

## 13. Acolytes

Wired (`acolytes.ts → maxAcolytes`, auto-recruit, 0.33 base efficiency), but the **count curve is
wrong**.

- Sheet thresholds (max-influence needed for the Nth acolyte): `100→1, 220→2, 464→3, 1021→4`, then
  `×2.2` per additional acolyte (the note: *"L × 2.2"*). That is geometric base ≈ **2.2**.
- Code: `maxAcolytes = max(1, 1 + floor(log₁₀(maxInfluence / 100)))` — geometric base **10**.
- Effect: code grants acolyte #2 only at influence **1000** (sheet: 220), #3 at **10 000** (sheet:
  ~464), #4 at **100 000** (sheet: ~1021). Acolytes — the main non-invocation parallelism lever —
  arrive roughly an order of magnitude too late across the whole game.
- Base per-acolyte efficiency `0.33` and the "4 shown in room" visual cap are correct.

---

## Cross-cutting observations

- **`packages/sim/src/economy.test.ts`, `subtype-effects.test.ts`, and `sin-effect-parity.test.ts`
  exist** — more was wired than the skill's "505 tests" snapshot implies. The subtype and Sin-level
  effects in particular are genuinely integrated. The gaps are concentrated in **content breadth**
  (actions, businesses, toggles, sigils, maleficia rosters) and a handful of **outcome/number
  mismatches** (base gold, acolyte curve, Emptio Neutral, Caedis Apocalyptic, Indagatio mapping).
- **Doc-vs-spreadsheet conflicts are a category of their own.** Indagatio rarity mapping, Emptio
  Neutral, and most normal-invocation effects are cases where the code faithfully implements
  `03-content-catalog.md` but the spreadsheet says something different. Before "fixing" these, decide
  per item whether the spreadsheet or the doc is now canonical (the stated rule is spreadsheet-wins).
- **The spreadsheet contradicts itself in one place** (Indagatio/Emptio base times: Globals 1800/600
  vs the per-action sheet 300/60). Resolve that in the sheet so it doesn't propagate.

*No code was modified. This document is the gap inventory only.*
