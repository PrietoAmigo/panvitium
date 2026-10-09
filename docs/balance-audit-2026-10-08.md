# Panvitium: Playability and Balance Audit (2026-10-08)

**Scope.** A sweep for playability bugs and balance outliers in the live sim (`packages/sim`), with
the sigils as the starting point. Every number below was measured against the code at the time
(post ADR-038), either directly from the modifier bundle or from a one-hour scripted run of a fresh
first lifetime: Suggestion cast whenever affordable, nothing else.

**Baseline** (that one-hour run, nothing bound): **252 souls**, a standing flock of ~290, and
**1,314 reprobates taken back by the Church** (Suggestion's Terrible/Apocalyptic tiers). This
baseline matters for reading everything below: early soul income is limited by how fast the flock
dies, not by how fast it is corrupted.

---

## Fixed in this change

| # | Finding | Before | After |
|---|---|---|---|
| F1 | **The five flat seals were wildly front-loaded** (Haagenti #48, Decarabia #69, Ose #57, Sabnock #43, Glasya-Labolas #25). They ran on the sheet's `coeff × ln(1 + N)`, so the FIRST soul paid the most. | 1 soul: Haagenti +69% base gold, Decarabia +69% influence regen, Sabnock ×7.9 suicide rate, Glasya ×4.5 murder rate. 20 souls in each of the five: **×17 souls** in the hour (their % twins Valefor/Belial/Aamon/Ronove/Aim: ×1.05). A % seal needs ~10¹⁰ souls to match one soul in Haagenti. | All five ride the default `pct` curve (nothing below ~7 souls) with `coefficient = FLAT_SEAL_SPLASH (10) × the base rate they add to`: each adds ten times what its % twin adds to that base. 20 souls in each: **×1.7 souls**. Still the best early pick, falling behind the % seals late. Ose (no base rate) takes 10× its sheet coefficient. One knob: `FLAT_SEAL_SPLASH` in `sigils.data.ts`. |
| F2 | **Fractional efficiency doubled the Suasio price for nothing.** The cost read `ceil(base × (1 + ln eff))` on the raw efficiency, while the yield is `floor(eff)` whole units. | Offering the first 180 souls to Gula (Insatiability ×1.31) or summoning the Familiar (×1.33) raised Suggestion from 1 to **2 influence** (Logismoi 25 → 32/33) with no extra yield: on the influence-bound opening loop that halves the cast rate. | The cost reads the same whole units (`1 + ln(floor(eff))`): eff 1.99 costs 1, eff 2 costs 2. (`costOutcomeCostMultiplier`) |
| F3 | **Erinyes was a free, repeatable harvest.** The grimoire offers Dispel on every bound invocation; each re-summon re-ran the "kill every reprobate, one soul each" wipe. | Dispel + Summon, at will, converted the whole flock to souls instantly, at no further cost (the descent penalty was already paid). | The wipe fires once per lifetime, on the summon that sets `pendingErinyes`. Copy says "once per lifetime". |
| F4 | **Rate seals read "+0" in the Goetia.** `fmtFlat` used two fixed decimals. | Sabnock / Glasya-Labolas (per-capita rates ~10⁻⁴ to 10⁻²) showed `+0 suicides/reprobate·s` at almost every binding. | Two significant digits below 0.01 (`+0.00016 suicides/reprobate·s`). |
| F5 | **The seal panel and the Ledger understated every seal.** `effectDisplay` showed the bare strength, without the sigil-effect stack (Solomon's Ring / Picatrix / Teraphim, Gaap, Semet) the sim applies. | With Solomon's Ring a +38.2% Valefor read +38.2% (applied: +63.4%). | New `sigilEffectMulFor(state, def)` mirrors `sigilEffectStack`'s order (Semet reads the relics, Gaap the relics × Semet, every other seal the full multiplier); both call sites pass it. |

Also corrected: stale comments describing Arachne as +1 influence/s (it is +0.25, as the player copy
says) and the flat generators as log-curve seals.

---

## Open findings (not changed: each is a design call)

Ranked by how much they bend the game. Suggested directions are options, not decisions.

### High

1. **Panvitium ends the game in one long burn.** Upkeep `100 × 1.01ᵗ` gold/s against a harvest of
   `0.001 × 1.01ᵗ × souls` per second integrates to **souls × e^(gold burned / 100,000)** at full
   upkeep. About 1.2M gold of burn multiplies the held soul pool ~160,000× (10⁵ souls → 1.6 × 10¹⁰,
   past the Eternal Sin threshold). The anathema relics are priced at 0.6M to 1.3M, so that gold is
   on hand by the time all eight Sins reach III. *Options:* harvest a fixed rate (not ∝ souls); cap
   R(t); or tie the harvest to the burn linearly.
2. **Reserve interest compounds by hand, multiplied by every gold multiplier.** Interest is
   `0.0005/s × fenusRateMul × faenerationOutputMul × goldRateMul`, paid as liquid gold, and deposits
   are free. With Midas (×10), the reserve earns 0.5%/s; re-depositing doubles it every ~2.3 minutes.
   Midas is an invocation and Panvitium a ceremony, so they stack: Midas, compound, then light
   Panvitium. *Options:* keep interest off `goldRateMul`; a deposit fee; or interest that only
   compounds through the Compounding contract.
3. **Erinyes stacks ×2 player efficiency per descent, uncapped.** k Erinyes descents give ×2ᵏ
   (×1,024 after ten), permanently. The Suasio price grows only `1 + ln(eff)` (the log curve was
   introduced precisely because "a few Erinyes descents bricked even the 1-influence Suggestion").
   Once stacking starts, Erinyes is the right apex every lifetime and the other apexes stop
   competing. *Options:* additive stacks (×(1 + k)); a cap; or decay.
4. **Imperium / Logismoi grow the flock by a percentage × efficiency, so it compounds.** Imperium
   Stellar adds 25% × eff of the population, Excellent 7% × eff; Logismoi Stellar 5% × eff. At
   efficiency 21 (Luxuria III, an early Gula skill, the Familiar) the expected log-growth per
   Imperium cast is ≈ +0.22 (×1.24 per cast, doubling every ~3 casts), limited only by the influence
   price. Aurevora sells efficiency at a flat rate (reaching ×E costs ≈ 2,050 × E gold) and Erinyes
   doubles it, so both feed this loop. *Options:* cap the % tiers; or make them scale with
   `1 + ln(eff)` like the cost.
5. **The Church takes ~84% of the early flock.** In the baseline hour, Suggestion's Terrible (−5% of
   the WHOLE flock, 4.9%) and Apocalyptic (−25%, 0.1%) remove ~0.27% of the population per cast
   against natural deaths of 0.03%/s, so the flock caps near ~300 and only about one corrupted reprobate
   in six ever dies into a soul. This is why any death-rate source feels enormous early (and why F1's
   Sabnock was so dominant). *Options:* make Terrible a fixed count like Bad; lower the % culls; or
   raise the base death rates.

### Medium

6. **Acolytes cast Suasio for free and better than the player.** Runners pay no cost, and
   `units = max(1, floor(eff))` hands a 0.33-efficiency acolyte a full unit of every gain while its
   losses scale ×0.33 (Bad removes `floor(0.33) = 0`). Per Suggestion cast: acolyte ≈ +1.06 −
   0.0009 × flock; player ≈ +0.86 − 0.0027 × flock, and the player pays 1 influence. An acolyte on
   Imperium (Good: 100–1,000 reprobates per 10 s) is a free engine. *Options:* stochastic rounding
   of `units` (an RNG draw; gate it per ADR-011), or scale delegated gains by efficiency.
7. **Efficiency below ×2 does nothing for Suggestion's yield.** Whole units only: the Familiar's
   +33%, up to +20% from ten Wendigos, The Dadu's +5% and the first Gula skill tier add nothing until
   the total reaches 2. F2 stops them costing extra; they are still dead weight for Suggestion (they
   do lift Logismoi/Imperium's % tiers and the Indagatio/Emptio timers). Same remedy as 6.
8. **Sin-1 invocation upkeep outruns base influence regeneration.** Wendigo/Kobold/Banshee cost
   1 influence/s and Blob/Empusa 2/s, against 0.5/s base regen (0.5% of the 100 cap). Before F1,
   ~2–33 souls in Decarabia quietly paid for them; now the influence relics (Black Robe +0.4,
   Sulfur Censer +0.6, Blood Chalk and Blackthorn Wand +2), Vanagloria and Belial do. Watch this in
   play: if early invocations keep dispelling, raise Decarabia's splash or lower the Sin-1 upkeeps.
9. **Behemoth is a trap.** +0.025 percentage points of Stellar per copy (+0.25 pp at the cap of 10)
   for 0.625% of gold AND influence gain each. Against Suggestion's 0.1% Stellar it is worth ~0.004
   reprobates per cast.
10. **Arachne is a trap.** +0.25 influence/s for 50 reprobates/s of upkeep (no souls minted). One
    Black Robe (a 500-gold common) gives +0.4/s for nothing.
11. **Halphas #38 and Stolas #36 read as boons but raise the gold-loss tiers.** Lowering Indagatio's
    Neutral/Good weights renormalizes mass onto Bad/Terrible/Apocalyptic too: Halphas at 10⁹ souls
    takes Terrible (−15% gold) from 4.9% to 6.8% and Bad (false lead) from 15% to 21%; Stolas
    Terrible to 6.0%. If intended as tradeoffs, the ledger line should say so; otherwise lift
    Stellar/Excellent instead.

### Low

12. **Gusion #11 is pure downside** (influence gain ↓, no upside): nobody should ever bind it.
13. **Duplicate seals**: Bael #1 = Balam #51, Naberius #24 = Bifrons #46, Vine #45 = Furcas #50;
    Dantalion #71 is Zagan #61 at 3× strength since ADR-038 removed its cost; Amy #58 is Bifrons +
    Seere in one seal.
14. **Aamon #7 does nothing early**: it multiplies passive generation, which is 0 until a flat source
    (Ose, Empusa, Lamia, Succubus, relics) exists. Its 33-soul run was identical to the baseline.
15. **Astiwihad's freeze never costs anything**: invoking it the moment before descending (or
    invoking and dispelling) yields the 100% gold/maleficia carry-over for free; its only price is
    the lifetime's apex slot.
16. **Forneus #30 rounds generously**: 3 souls give 1 invoking power (the Familiar's gate); with
    Solomon's Ring, Picatrix and Teraphim (×1.81) ~36k souls reach 10 (every apex's IP gate). The
    Sin III gates still bind first, so this is cosmetic for now.
17. **Ira's levels do nothing** (the known ADR-038 gap), so Ira devotion buys only the Retribution
    skill and the Erinyes gate.

---

## How to reproduce

The numbers come from throwaway harnesses (not committed): `computeModifiers` / `reprobateRates` /
`perSecondRates` over each sigil at 1, 2, 10, 33, 10³, 10⁶ and 10⁹ bound souls, and a 36,000-tick
(one hour, 0.1 s) loop of `startAction('suggestion')` + `tick` from `createInitialState`, with and
without bindings. Each fix is pinned in the regular suite: `sigils.test.ts` (flat seals,
`sigilEffectMulFor`), `actions.test.ts` (the Suasio price at fractional efficiency),
`apex-katabasis.test.ts` (Erinyes once per lifetime), `AetherSigils.test.ts` (display).
