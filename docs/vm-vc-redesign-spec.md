# Spec — Vitium Mercatura replacement + Vitium Compositum coupling (Foedera)

**Audience:** the Claude session executing this slice on the Panvitium repo. Follow the
`panvitium` skill (verification gate, overlay-tarball delivery, ADR conventions) as usual. This
document is the authoritative design; where it touches numbers, it is also the source for the
`Vitium Mercatura` sheet of the economy spreadsheet (currently blank).

**Scope:** remove the legacy business system (32-business catalog, build queue, flat emitters)
and replace it with the **Mercatus** system below; add the **Foedera** coupling between Mercatūs
and Vitium Compositum. No reprobate subtypes exist anywhere (ADR-024). The core is fully
deterministic: no RNG, no timers, no pools.

---

## 1. The Mercatus system (replaces businesses entirely)

Eight trades, exactly one per Cardinal Sin: *Mercatus Gulae, Luxuriae, Avaritiae, Tristitiae,
Irae, Acediae, Vanagloriae, Superbiae*. Each has a single integer **depth** `d ≥ 0`. No build
times, no build queue, no copies: deepening is an instant gold purchase.

### 1.1 Unlock, cap, invest, divest

- **Unlock:** a Mercatus becomes available at its Sin's level 1.
- **Depth cap:** `10 × sinLevel` (Sin level 4 → depth 40).
- **Invest:** cost to go from depth `d` to `d+1`:
  `investCost(d) = floor(C0 × r^d)` with `C0 = 50` gold, `r = 1.6`.
  Cumulative cost to depth `d` is the closed form `C0 × (r^d − 1)/(r − 1)` — derive, never store.
- **Divest:** wind down one depth at a time or fully. Refund =
  `divestFraction × cumulative cost of the divested depths`, floored.
  `divestFraction` = the existing Globals constant "Business shutdown gold recovery" (**0.25**).
  The Vine #45 sigil keeps modifying this same fraction.

### 1.2 Revenue (demand-driven)

```
revenue/s (per trade) = spendPerCapita × reprobates × penetration(d)
penetration(d)        = 1 − e^(−a·d)        a = 0.15
spendPerCapita        = 0.1 gold/s          (per trade, at full penetration)
```

`reprobates` = current living population. Total Mercatus revenue replaces
`businessGoldPerSecond` at tick step 1, composed exactly as before:
`(... + mercatusGoldPerSecond × vitiumMercaturaOutputMul + ...) × goldRateMul`.
Plutus and Vapula #60 keep their existing hook (`vitiumMercaturaOutputMul`).

### 1.3 Corruption (generation)

```
generation/s (per trade) = genPerDepth × d        genPerDepth = 0.02 /s
```

Folds into `reprobateRates` through the existing generation pool, also scaled by
`vitiumMercaturaOutputMul`.

### 1.4 Katabasis liquidation

On entering Katabasis, all Mercatūs auto-divest at `divestFraction` into gold **before** the
remaining-gold carry-over roll (same ordering the old auto-shutdown had, preserving the Avaritia
carry-over interplay). Depths reset to 0 with the lifetime.

### 1.5 Per-Sin signature clauses — slice 2, OPTIONAL (confirm with user before implementing)

| Mercatus | Clause |
|---|---|
| Gulae | `spendPerCapita` ×1.25 for this trade |
| Luxuriae | Its generation counts double |
| Avaritiae | +0.5% divest/liquidation fraction per depth (additive on the 0.25) |
| Tristitiae | +5% suicide-rate mul per 10 depths |
| Irae | +5% murder-rate mul per 10 depths |
| Acediae | Its revenue exempt from the ×0.5 offline efficiency factor |
| Vanagloriae | +1 flat influence/s per 10 depths (`flatInfluencePerSecond`) |
| Superbiae | Depth cap `12 × sinLevel` instead of 10 |

Each is one line in `computeModifiers` or a parameter override. Do **not** ship these in the
core slice without confirmation.

---

## 2. Foedera — Mercatus ↔ Vitium Compositum coupling

A *Foedus* forms between a Vitium Compositum ceremony and the Mercatūs of its member Sins, and
**scales with depth**:

```
foedusTier(vc) = min( floor( min(depth of each member Sin) / foedusDepthStep ), maxFoedusTier )
foedusDepthStep = 10        maxFoedusTier = 4
```

Effects (tier 0 = no Foedus, no effect):

- **VC upkeep multiplier** = `1 − 0.125 × foedusTier` (tier 4 → ×0.5), applied to that VC's
  per-second gold and influence costs at the existing step-0 upkeep site.
- **Mercatus revenue bonus:** while the VC is active, each member Sin's Mercatus revenue is
  multiplied by `1 + 0.05 × foedusTier` (tier 4 → ×1.2). If several active VCs share a Sin, the
  bonuses stack multiplicatively on that Mercatus.

Applicability: every VC, by its member-Sin set as defined in the spreadsheet — the six pairs,
the four-Sin Vegas and Crusade, and Panvitium (all eight Sins; its Foedus discounts the
exponential upkeep ramp, which is the intended late-game payoff). Percentage-based upkeeps
(Vegas, Crusade, Panvitium) take the same multiplier on their computed per-second cost. A
per-VC opt-out flag lives in the spreadsheet for future tuning; default all-on.

---

## 3. Tuning sanity (against existing sheets — keep these magnitudes)

| Stage | Pop | Depths | Cumulative invested | VM gold/s |
|---|---|---|---|---|
| First hour | ~10² | Gula 5 | ~0.8 k | ~5/s |
| Early-mid | ~10³ | 2 trades ~10 | ~22 k | ~160/s |
| Mid | ~10⁴ | 3 trades ~20 | ~10⁶ | ~2.8 k/s |
| Late | ~10⁶ | 8 trades 30–40 | ~10⁹–10¹⁰ | ~8×10⁵/s |

Spreadsheet constants block (write into the blank `Vitium Mercatura` sheet): `C0 = 50`,
`r = 1.6`, `a = 0.15`, `spendPerCapita = 0.1`, `genPerDepth = 0.02`,
`divestFraction = =Globals!<shutdown-recovery cell>`, `depthCapPerSinLevel = 10`,
`foedusDepthStep = 10`, `maxFoedusTier = 4`, `upkeepDiscountPerTier = 0.125`,
`revenueBonusPerTier = 0.05`, plus the per-VC Foedus opt-out flags and (if slice 2 is approved)
the clause table from §1.5.

---

## 4. Engineering plan

- **State (lifetime, reset on Katabasis):** `mercatusDepths: Record<Sin, number>`. Nothing else.
- **Save schema: bump to v3 with migration (ADR-023).** `businesses` and `buildQueue` are
  removals. `v2-to-v3.ts`: credit gold = 25% of each owned business's old build cost × count,
  fizzle the build queue (no refund of in-flight costs — match old cancel semantics if they
  differ, check code), drop both fields, seed `mercatusDepths` empty/omitted. Pure, registered
  in `SAVE_MIGRATIONS`, round-trip tested.
- **Delete:** the 32-business catalog, `startBuild` / `advanceBuilds` / `shutdownBusiness` and
  their tick step, the in-flight builds UI tab, the 32 business name strings.
- **Add:** `mercatus.ts` (invest/divest/cost/penetration/revenue/generation/foedusTier),
  tick wiring per §1.2–1.4 and §2, `MercaturaList` rebuilt as eight data-driven rows iterating
  `SINS` (depth meter, revenue/s, next invest cost, invest/divest buttons, Foedus tier badge
  when ≥ 1), strings for the eight trades and notices.
- **Modifiers:** no new bundle fields for the core; Foedera computes at the VC-upkeep and
  Mercatus-revenue call sites (it depends on per-VC active state, so it is not a global bundle
  value).
- **Strings/UI constraints:** display names are the Latin *Mercatus <genitive>* forms above;
  Latin untranslated (ADR-020); copy in the established register — a trade has *roots* and
  *reach*, it is *deepened*, *cut back*, *sold off*; never analytics vocabulary (market share,
  demand curve, penetration rate, customer base). **Gideon Reyes must not appear in any UI,
  mechanic, string, or tooltip of this system** — he exists only in the email content system.
- **Tests to pin:** invest cost curve and cap-by-Sin-level; penetration math; revenue × pop
  coupling in `tick` (incl. `vitiumMercaturaOutputMul` and `goldRateMul` composition);
  generation-pool contribution; divest refund (incl. Vine #45 still applying); Katabasis
  liquidation ordering before the remaining-gold roll; Foedus tier function (boundaries at
  depths 9/10/19/20/40), VC upkeep discount incl. a percentage-upkeep VC, revenue bonus only
  while VC active, multiplicative stacking on a shared Sin; offline catch-up equivalence;
  v2→v3 migration (a/b/c round-trip per ADR-023).
- **Gate & delivery:** full verification gate green before packaging; overlay tarball +
  apply script per the skill convention.
