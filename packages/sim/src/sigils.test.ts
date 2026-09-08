/**
 * Sigil tests (02 §5, 03 §5). Pins:
 *   - binding curves (pct percentage default, sqrt, linear, log) and zero/negative handling
 *   - catalog integrity; Semet (#32) carries the all-Sins-≥2 gate
 *   - sigilStrength = coefficient × magnitude
 *   - in-lifetime modifier contributions fold into computeModifiers (increase/decrease, tier)
 *   - multiple sigils on one field compose multiplicatively
 *   - Katabasis carry-over bonuses (Purson #20 gold, Halphas #38 maleficia, Semet all three)
 *   - Semet visibility gates on every Cardinal Sin ≥ 2
 *   - sigils survive nothing of their own — binding is recoverable (covered in katabasis.test)
 */
import { describe, expect, it } from 'vitest';
import {
  bindingMagnitude,
  bindSigil,
  bn,
  categoryEfficiency,
  categoryTierModifiers,
  computeModifiers,
  createInitialState,
  currentInvokingPower,
  effectParts,
  grantStagnationForOffline,
  invocationById,
  invocationGoldCost,
  invocationRunnerEfficiency,
  invocationSoulCost,
  invocationUpkeep,
  makeRng,
  NEUTRAL_MODIFIERS,
  remainingGoldFraction,
  remainingReprobateFraction,
  reprobateRates,
  resolveAction,
  resolveIndagatio,
  thesaurusRecoveryFraction,
  sigilById,
  sigilCategoryTierContributions,
  sigilCostReductionByChannel,
  sigilIndagatioDoubleFindChance,
  sigilInvocationEffectContributions,
  sigilInvokingPower,
  sigilKatabasisBonus,
  sigilModifierContributions,
  sigilMurderTriggersSuicideChance,
  sigilShutdownRefundMul,
  sigilStrength,
  sigilVisible,
  SIGIL_IDS,
  SINS,
  STAGNATION_BASE_MAX,
  STAGNATION_PER_SECOND,
  stagnationMax,
  startAction,
  tick,
  totalReprobates,
  type GameState,
} from './index.js';

function fresh(seed = 'sigils', t = 0): GameState {
  return createInitialState(seed, t);
}
/** Bind `amount` souls to sigil `id` (gives the pool first so the bind isn't clamped). */
function bound(id: number, amount: number, base: GameState = fresh()): GameState {
  const s = { ...base, souls: bn(amount) };
  return bindSigil(s, id, amount);
}
function maxSinsTo(s: GameState, level: number): GameState {
  const devotion = { ...s.devotion };
  for (const sin of SINS) devotion[sin] = bn(180 ** level);
  return { ...s, devotion };
}

describe('Binding curves (02 §5)', () => {
  it('pct is the default percentage curve (log base 33): ~5% @33, ~50% @33^5 souls, no cap', () => {
    expect(bindingMagnitude('pct', bn(0))).toBe(0);
    expect(bindingMagnitude('pct', bn(5))).toBe(0); // clamped: below ~7 souls the curve is 0
    expect(bindingMagnitude('pct', bn(33))).toBeCloseTo(0.05, 6); // 5% at the base
    expect(bindingMagnitude('pct', bn(1_000_000))).toBeCloseTo(0.382, 3);
    expect(bindingMagnitude('pct', bn(33 ** 5))).toBeCloseTo(0.5, 6); // 50% at base^5 (~39M)
    // No cap: keeps rising, tamer than the old √ and than the log10 curve it replaced.
    expect(bindingMagnitude('pct', bn(1e15))).toBeGreaterThan(bindingMagnitude('pct', bn(1e9)));
  });

  it('sqrt (Andrealphus, opt-in) grows gently', () => {
    expect(bindingMagnitude('sqrt', bn(0))).toBe(0);
    expect(bindingMagnitude('sqrt', bn(100))).toBeCloseTo(10, 6);
    expect(bindingMagnitude('sqrt', bn(10_000))).toBeCloseTo(100, 6);
  });

  it('linear returns the raw bound count (swingy)', () => {
    expect(bindingMagnitude('linear', bn(2500))).toBe(2500);
  });

  it('log is a splash curve, never negative', () => {
    expect(bindingMagnitude('log', bn(1000))).toBeCloseTo(Math.log(1001), 6);
    expect(bindingMagnitude('log', bn(0))).toBe(0);
    expect(bindingMagnitude('log', bn(1))).toBeCloseTo(Math.log(2), 6);
  });
});

describe('Sigil catalog', () => {
  it('is the full Goetia: 72 seals, each named, in ascending id order', () => {
    expect(SIGIL_IDS).toEqual([...SIGIL_IDS].sort((a, b) => a - b));
    expect(SIGIL_IDS).toEqual(Array.from({ length: 72 }, (_, i) => i + 1)); // no gaps: every id 1..72
    // Every seal now carries a demon name (the full-Goetia naming pass — ADR-034).
    for (const id of SIGIL_IDS) expect(sigilById(id)!.name).toMatch(/\S/);
    expect(sigilById(32)!.name).toBe('Semet'); // Semet
    expect(sigilById(6)!.name).toBe('Valefor'); // Valefor
  });

  it('Semet (#32) is named, gated on all Sins ≥ 2, and scales the other sigils', () => {
    const semet = sigilById(32)!;
    expect(semet.name).toBe('Semet');
    expect(semet.gateAllSinsLevel).toBe(2);
    expect(semet.effect.kind).toBe('sigilEffect');
    expect(semet.curve).toBe('log');
    expect(semet.coefficient).toBeCloseTo(0.01, 9);
  });

  it('sigilStrength = coefficient × magnitude', () => {
    const valefor = sigilById(6)!;
    // Valefor uses the default pct curve; its strength is coefficient × the pct magnitude.
    expect(sigilStrength(valefor, bn(10_000))).toBeCloseTo(
      valefor.coefficient * bindingMagnitude('pct', bn(10_000)),
      9,
    );
  });
});

describe('In-lifetime modifier contributions', () => {
  it('Valefor #6 lifts gold rate by (1 + strength)', () => {
    const base = computeModifiers(fresh()).goldRateMul;
    const s = bound(6, 10_000);
    const strength = sigilStrength(sigilById(6)!, bn(10_000));
    expect(computeModifiers(s).goldRateMul).toBeCloseTo(base * (1 + strength), 6);
  });

  it('Amy #58 (a boon, player tuning) lifts Indagatio AND Emptio efficiency by (1 + strength)', () => {
    const s = bound(58, 1_000_000);
    const strength = sigilStrength(sigilById(58)!, bn(1_000_000));
    const m = computeModifiers(s);
    expect(m.indagatioEfficiencyMul).toBeCloseTo(1 + strength, 6);
    expect(m.emptioEfficiencyMul).toBeCloseTo(1 + strength, 6);
    expect(m.indagatioEfficiencyMul).toBeGreaterThan(1); // faster searches, not slower
  });

  it('Bael #1 (tierGroup decrease) damps all three negative tiers at once', () => {
    const s = bound(1, 1_000_000);
    const strength = sigilStrength(sigilById(1)!, bn(1_000_000));
    const m = computeModifiers(s).tierWeightMul;
    expect(m.bad).toBeCloseTo(1 / (1 + strength), 6);
    expect(m.terrible).toBeCloseTo(1 / (1 + strength), 6);
    expect(m.apocalyptic).toBeCloseTo(1 / (1 + strength), 6);
    expect(m.stellar).toBeUndefined();
  });

  it('two sigils on the same field compose multiplicatively', () => {
    // Aamon #7 lifts generation; Amy #58 has no generation leg, so compose Aamon with
    // Bael #1 vs Balam #51 on the SAME tier group instead — both damp the negative tiers.
    let s = fresh();
    s = { ...s, souls: bn(2_000_000) };
    s = bindSigil(s, 1, 10_000); // Bael: negative tiers down
    s = bindSigil(s, 51, 1_000_000); // Balam: negative tiers down again
    const a = sigilStrength(sigilById(1)!, bn(10_000));
    const b = sigilStrength(sigilById(51)!, bn(1_000_000));
    const expected = (1 / (1 + a)) * (1 / (1 + b));
    expect(computeModifiers(s).tierWeightMul.terrible).toBeCloseTo(expected, 5);
  });

  it('the sigil-effect multiplier scales a contribution strength', () => {
    const s = bound(6, 10_000); // Valefor: gold up
    const strength = sigilStrength(sigilById(6)!, bn(10_000));
    const sig = sigilModifierContributions(s, 1.5);
    expect(sig.scalar.goldRateMul).toBeCloseTo(1 + 1.5 * strength, 6);
  });

  it("Solomon's Ring amplifies a bound sigil's effect through computeModifiers", () => {
    let s = bound(6, 10_000); // Valefor: gold up
    const without = computeModifiers(s).goldRateMul;
    s = { ...s, lifetime: { ...s.lifetime, maleficia: ['solomons_ring'] } };
    expect(computeModifiers(s).goldRateMul).toBeGreaterThan(without);
  });

  it('Belial #68 lifts the influence rate', () => {
    const strength = sigilStrength(sigilById(68)!, bn(100_000));
    expect(computeModifiers(bound(68, 100_000)).influenceRateMul).toBeCloseTo(1 + strength, 6);
  });

  it('Murmur #54 lifts the overall invocation-effect multiplier', () => {
    const strength = sigilStrength(sigilById(54)!, bn(10_000));
    expect(computeModifiers(bound(54, 10_000)).invocationEfficiencyMul).toBeCloseTo(
      1 + strength,
      6,
    );
  });

  it('Balam #51 damps the whole negative tier group', () => {
    const strength = sigilStrength(sigilById(51)!, bn(10_000));
    const m = computeModifiers(bound(51, 10_000)).tierWeightMul;
    expect(m.terrible).toBeCloseTo(1 / (1 + strength), 6);
    expect(m.bad).toBeCloseTo(1 / (1 + strength), 6);
  });

  it('Bifrons #46 lifts Indagatio efficiency (folds onto player efficiency)', () => {
    const s = bound(46, 10_000);
    const strength = sigilStrength(sigilById(46)!, bn(10_000));
    expect(computeModifiers(s).indagatioEfficiencyMul).toBeCloseTo(1 + strength, 6);
    expect(categoryEfficiency(s, 'indagatio')).toBeCloseTo(1 + strength, 6); // baseline playerEff = 1
  });

  it('Seere #70 lifts Emptio efficiency', () => {
    const s = bound(70, 10_000);
    const strength = sigilStrength(sigilById(70)!, bn(10_000));
    expect(computeModifiers(s).emptioEfficiencyMul).toBeCloseTo(1 + strength, 6);
    expect(categoryEfficiency(s, 'emptio')).toBeCloseTo(1 + strength, 6);
  });

  it('no bindings → the affected fields match the neutral baseline', () => {
    const m = computeModifiers(fresh());
    expect(m.goldRateMul).toBe(NEUTRAL_MODIFIERS.goldRateMul);
    expect(m.faenerationOutputMul).toBe(NEUTRAL_MODIFIERS.faenerationOutputMul);
    expect(m.acolyteEfficiencyMul).toBeCloseTo(NEUTRAL_MODIFIERS.acolyteEfficiencyMul, 6);
  });
});

describe('Katabasis carry-over bonuses', () => {
  it('Purson #20 adds to the remaining-gold fraction', () => {
    const baseFrac = remainingGoldFraction(fresh());
    const s = bound(20, 10_000);
    const bonus = sigilKatabasisBonus(s, 'gold');
    // The carry-over bonus is the sheet yield applied "as a percentage" (÷100), not the raw yield.
    expect(bonus).toBeCloseTo(sigilStrength(sigilById(20)!, bn(10_000)) / 100, 6);
    // The roll clamps to [0,1], so a large bonus saturates rather than overflows.
    expect(remainingGoldFraction(s, bonus)).toBeLessThanOrEqual(1);
    expect(remainingGoldFraction(s, bonus)).toBeGreaterThan(baseFrac);
  });

  it('Camio #53 feeds only the remaining-reprobate roll (sheet rev 2026-06-12)', () => {
    const s = bound(53, 10_000);
    expect(sigilKatabasisBonus(s, 'reprobate')).toBeGreaterThan(0);
    expect(sigilKatabasisBonus(s, 'gold')).toBe(0);
    expect(sigilKatabasisBonus(s, 'maleficia')).toBe(0);
  });

  it('Camio #53 adds a modest percentage-point bonus, not an instant 100% (the ÷100 fix)', () => {
    const s = bound(53, 100); // the Sigils sheet's own sample N for Camio
    const bonus = sigilKatabasisBonus(s, 'reprobate');
    // Yield ln(101) ≈ 4.6 applies "as a percentage" → +0.046 as a fraction, NOT +4.6 (which used to
    // saturate the reprobate carry-over to 100% at a trivial binding).
    expect(bonus).toBeCloseTo(Math.log(101) / 100, 6);
    expect(bonus).toBeLessThan(0.1);
    // The carry-over rises only a little and stays well below the 100% clamp.
    expect(remainingReprobateFraction(s, bonus)).toBeLessThan(0.2);
  });

  it('Cimejes #66 also feeds only the maleficia roll', () => {
    const s = bound(66, 10_000);
    expect(sigilKatabasisBonus(s, 'maleficia')).toBeGreaterThan(0);
    expect(sigilKatabasisBonus(s, 'gold')).toBe(0);
  });

  it('the sigil-effect multiplier scales the Katabasis bonus', () => {
    const s = bound(20, 10_000); // Purson: gold roll
    const base = sigilKatabasisBonus(s, 'gold');
    expect(sigilKatabasisBonus(s, 'gold', 1.5)).toBeCloseTo(base * 1.5, 6);
  });
});

describe('Semet visibility gate (03 §5/§8)', () => {
  it('is hidden until every Cardinal Sin is at level ≥ 2', () => {
    const semet = sigilById(32)!;
    expect(sigilVisible(fresh(), semet)).toBe(false);
    expect(sigilVisible(maxSinsTo(fresh(), 1), semet)).toBe(false);
    expect(sigilVisible(maxSinsTo(fresh(), 2), semet)).toBe(true);
  });

  it('ungated sigils are always visible', () => {
    expect(sigilVisible(fresh(), sigilById(6)!)).toBe(true);
  });
});

describe('Sigil contributions structure', () => {
  it('omits 1-valued entries so computeModifiers folds cleanly', () => {
    const { scalar, tier } = sigilModifierContributions(fresh());
    expect(Object.keys(scalar)).toHaveLength(0);
    expect(Object.keys(tier)).toHaveLength(0);
  });
});

describe('Per-category tier sigils (S2)', () => {
  it('Marbas #5 lifts Indagatio success tiers and does not leak to other categories', () => {
    const s = bound(5, 10_000);
    const strength = sigilStrength(sigilById(5)!, bn(10_000));
    const m = categoryTierModifiers(s, 'indagatio');
    expect(m.good).toBeCloseTo(1 + strength, 6);
    expect(m.stellar).toBeCloseTo(1 + strength, 6);
    expect(categoryTierModifiers(s, 'suasio')).toEqual({}); // category-scoped
  });

  it('Botis #17 damps only the Suasio bad-outcome tiers', () => {
    const s = bound(17, 10_000);
    const strength = sigilStrength(sigilById(17)!, bn(10_000));
    const m = categoryTierModifiers(s, 'suasio');
    expect(m.terrible).toBeCloseTo(1 / (1 + strength), 6);
    expect(m.bad).toBeCloseTo(1 / (1 + strength), 6);
    expect(m.good).toBeUndefined();
  });

  it('Astaroth #29 lifts only the Stellar weight for Indagatio', () => {
    const s = bound(29, 10_000);
    const strength = sigilStrength(sigilById(29)!, bn(10_000));
    const m = categoryTierModifiers(s, 'indagatio');
    expect(m.stellar).toBeCloseTo(1 + strength, 6);
    expect(m.good).toBeUndefined();
  });

  it('Andromalius #72 lifts the Emptio success tiers', () => {
    const s = bound(72, 10_000);
    const strength = sigilStrength(sigilById(72)!, bn(10_000));
    expect(categoryTierModifiers(s, 'emptio').good).toBeCloseTo(1 + strength, 6);
  });

  it('Gremory #56 composes onto the Suasio success shift', () => {
    const base = bound(56, 10_000);
    const strength = sigilStrength(sigilById(56)!, bn(10_000));
    // No Devotion here, so the success multiplier is Gremory alone.
    expect(categoryTierModifiers(base, 'suasio').good).toBeCloseTo(1 + strength, 6);
  });
});

describe('Per-Sin invocation-effectiveness sigils (S4)', () => {
  // Helper: a state with one invocation active and (optionally) a per-Sin sigil bound.
  const withInv = (id: string, n: number, base = fresh()): GameState => ({
    ...base,
    lifetime: { ...base.lifetime, invocations: { ...base.lifetime.invocations, [id]: n } },
  });

  it('Bune #26 (Vanagloria) amplifies Fama, leaving other-Sin invocations untouched', () => {
    const fama = withInv('fama', 2);
    const base = computeModifiers(fama).influenceRateMul;
    const boosted = computeModifiers(bound(26, 100_000, fama)).influenceRateMul;
    expect(boosted).toBeGreaterThan(base);
    // Harpy (Ira) is unaffected by a Vanagloria sigil — its Pogrom-runner efficiency is unchanged.
    const harpy = withInv('harpy', 2);
    const harpyDef = invocationById('harpy')!;
    const harpyBase = invocationRunnerEfficiency(harpy, harpyDef);
    expect(invocationRunnerEfficiency(bound(26, 100_000, harpy), harpyDef)).toBeCloseTo(
      harpyBase,
      6,
    );
  });

  it('exposes a per-Sin effectiveness map defaulting to 1', () => {
    const m = computeModifiers(fresh());
    expect(m.invocationSinEffectivenessMul.ira).toBe(1);
    const strength = sigilStrength(sigilById(42)!, bn(100_000)); // Vepar → Ira
    expect(computeModifiers(bound(42, 100_000)).invocationSinEffectivenessMul.ira).toBeCloseTo(
      1 + strength,
      6,
    );
  });

  it('Furfur #34 (Luxuria) amplifies the Succubus Imperium runner', () => {
    // Succubus' effect is now an autonomous Imperium runner; the Luxuria per-Sin term folds into its
    // runner efficiency (invocationRunnerEfficiency), so Furfur lifts it.
    const succ = withInv('succubus', 1);
    const def = invocationById('succubus')!;
    const base = invocationRunnerEfficiency(succ, def);
    const boosted = invocationRunnerEfficiency(bound(34, 100_000, succ), def);
    expect(boosted).toBeGreaterThan(base);
  });
});

describe('Flat-generator sigils (S6)', () => {
  it('Haagenti #48 generates gold/s on a log curve matching the sheet', () => {
    // Sheet rev 2026-06-12: base coeff 3, N=100 → 3 × ln(101) ≈ 13.845 gold/s.
    const strength = sigilStrength(sigilById(48)!, bn(100));
    expect(strength).toBeCloseTo(3 * Math.log(101), 6);
    const m = computeModifiers(bound(48, 100));
    expect(m.flatGoldPerSecond).toBeCloseTo(3 * Math.log(101), 6);
    expect(m.flatInfluencePerSecond).toBe(0);
  });

  it('Decarabia #69 generates influence/s on a log curve matching the sheet', () => {
    // Sheet rev 2026-06-12: base coeff 0.5, N=100000 → 0.5 × ln(100001) ≈ 5.756 influence/s.
    const strength = sigilStrength(sigilById(69)!, bn(100_000));
    expect(strength).toBeCloseTo(0.5 * Math.log(100_001), 6);
    const m = computeModifiers(bound(69, 100_000));
    expect(m.flatInfluencePerSecond).toBeCloseTo(0.5 * Math.log(100_001), 6);
    expect(m.flatGoldPerSecond).toBe(0);
  });

  it('Haagenti gold flows into the tick (scaled by goldRateMul)', () => {
    const s = bound(48, 100);
    const before = fresh().lifetime.gold.toNumber();
    const after = tick(s, 1).state.lifetime.gold.toNumber();
    // One second of base gold + Haagenti's ~13.85/s (both × goldRateMul = 1 at baseline).
    expect(after - before).toBeGreaterThan(12);
  });

  it('Ose #57, Sabnock #43, and Glasya-Labolas #25 feed the new flat dynamics channels', () => {
    // Ose: flat births/s (log 0.3); Sabnock: flat per-capita suicide (log 0.001); Glasya: flat
    // per-capita murder (log 0.001) — all per the sheet rev 2026-06-12.
    const ose = computeModifiers(bound(57, 100));
    expect(ose.flatGenerationPerSecond).toBeCloseTo(0.3 * Math.log(101), 6);
    const sabnock = computeModifiers(bound(43, 100));
    expect(sabnock.flatBaseSuicideRatePerSecond).toBeCloseTo(0.001 * Math.log(101), 6);
    const glasya = computeModifiers(bound(25, 100_000));
    expect(glasya.flatBaseMurderRatePerSecond).toBeCloseTo(0.001 * Math.log(100_001), 6);
  });
});

describe('Flat invoking-power sigil (S7)', () => {
  it('Forneus #30 adds rounded invoking power on a log curve, counting toward the gates', () => {
    expect(sigilInvokingPower(fresh())).toBe(0);
    // 0.5 × ln(1e8 + 1) ≈ 9.21 → rounds to 9.
    expect(sigilInvokingPower(bound(30, 100_000_000))).toBe(9);
    // 0.5 × ln(1001) ≈ 3.45 → rounds to 3.
    expect(sigilInvokingPower(bound(30, 1000))).toBe(3);
    // Folds into the gate total (no maleficia here, so it is the whole of it).
    expect(currentInvokingPower(bound(30, 100_000_000))).toBe(9);
    // Andrealphus #65 left the invoking-power channel for a composite (ADR-035): it contributes 0.
    expect(sigilInvokingPower(bound(65, 100_000_000))).toBe(0);
  });
});

describe('Cost-reduction sigils (S8)', () => {
  it('sigilCostReductionByChannel yields per-channel (1 + strength) divisors', () => {
    expect(sigilCostReductionByChannel(fresh())).toEqual({});
    // Each channel's divisor is 1 + the sigil's (pct-curve) strength on the bound souls.
    expect(sigilCostReductionByChannel(bound(9, 400_000_000)).influence).toBeCloseTo(
      1 + sigilStrength(sigilById(9)!, bn(400_000_000)),
      6,
    );
    expect(sigilCostReductionByChannel(bound(55, 100_000_000)).invocation).toBeCloseTo(
      1 + sigilStrength(sigilById(55)!, bn(100_000_000)),
      6,
    );
    // Andrealphus #65's composite carries a cost-reduction part on the same `invocation` channel.
    expect(sigilCostReductionByChannel(bound(65, 100_000_000)).invocation).toBeCloseTo(
      1 + sigilStrength(sigilById(65)!, bn(100_000_000)),
      6,
    );
    // Amy #58 is not a cost-reduction sigil (it lifts Indagatio & Emptio action efficiency instead).
    expect(sigilCostReductionByChannel(bound(58, 1_000_000)).emptioGold).toBeUndefined();
  });

  it('Paimon #9 softens action influence costs (never increasing them)', () => {
    // Logismoi (25 influence) shows the reduction clearly; Suggestion's 1-influence cast floors
    // out under any softening. Luxuria L2 unlocks Logismoi; efficiency is pinned to 1.
    const seed = (s: GameState): GameState => ({
      ...s,
      devotion: { ...s.devotion, luxuria: bn(32400) },
      lifetime: { ...s.lifetime, influence: bn(100) },
    });
    const base = startAction(seed(fresh()), 'logismoi', { efficiency: 1 });
    const paimon = startAction(seed(bound(9, 400_000_000)), 'logismoi', { efficiency: 1 });
    if (!base.ok || !paimon.ok) throw new Error('start failed');
    const paimonFactor = 1 + sigilStrength(sigilById(9)!, bn(400_000_000));
    expect(100 - base.state.lifetime.influence.toNumber()).toBe(25); // ceil(25 × 1)
    expect(100 - paimon.state.lifetime.influence.toNumber()).toBe(Math.ceil(25 / paimonFactor));
  });

  it('Orobas #55 softens the one-time invocation soul cost (Morpheus 90% of pool)', () => {
    // Normals no longer carry a soul cost (per-second upkeep instead); Morpheus is the only
    // soul-cost invocation. Its cost is 90% of the current pool; Orobas #55 halves it.
    const morpheus = invocationById('morpheus')!;
    const withPool = (s: GameState): GameState => ({ ...s, souls: bn(1000) });
    expect(invocationSoulCost(withPool(fresh()), morpheus).toNumber()).toBe(900); // 90% of 1000
    // Softened by 1 + Orobas's pct strength, then floored (souls are natural numbers).
    const orobasFactor = 1 + sigilStrength(sigilById(55)!, bn(100_000_000));
    expect(invocationSoulCost(withPool(bound(55, 100_000_000)), morpheus).toNumber()).toBe(
      Math.floor(900 / orobasFactor),
    );
  });

  it('Orobas #55 softens ALL invocation upkeep — flat drains and %-of-gain alike (ADR-035)', () => {
    const factor = 1 + sigilStrength(sigilById(55)!, bn(100_000_000));
    // An active Imp drains 10 gold/s flat; Orobas divides it.
    const withImp = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, invocations: { imp: 1 } },
    });
    expect(invocationUpkeep(withImp(fresh()), 0).flatGoldPerSecond).toBe(10);
    expect(invocationUpkeep(withImp(bound(55, 100_000_000)), 0).flatGoldPerSecond).toBeCloseTo(
      10 / factor,
      6,
    );
    // A bound Lemure drains 25% of influence gain; ADR-035 divides that %-of-gain cost too (it was
    // previously left untouched as an "apex tradeoff").
    const withLemure = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, invocations: { lemure: 1 } },
    });
    expect(invocationUpkeep(withLemure(fresh()), 0).influenceGainFraction).toBeCloseTo(0.25, 6);
    expect(
      invocationUpkeep(withLemure(bound(55, 100_000_000)), 0).influenceGainFraction,
    ).toBeCloseTo(0.25 / factor, 6);
  });

  it('the invocation channel now softens the one-time gold summon cost too (ADR-035, Morpheus)', () => {
    const morpheus = invocationById('morpheus')!;
    const withGold = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, gold: bn(1000) },
    });
    expect(invocationGoldCost(withGold(fresh()), morpheus).toNumber()).toBe(900); // 90% of 1000
    const factor = 1 + sigilStrength(sigilById(55)!, bn(100_000_000));
    expect(invocationGoldCost(withGold(bound(55, 100_000_000)), morpheus).toNumber()).toBe(
      Math.floor(900 / factor),
    );
  });
});

describe('Murder- and positive-tier sigils (S10)', () => {
  it('Aim #23 lifts the murder-rate modifier; no sigil is inert anymore (sheet rev)', () => {
    expect(sigilById(23)!.effect).toEqual({
      kind: 'modifier',
      field: 'murderRateMul',
      direction: 'increase',
    });
    // Murder rate lifts by 1 + Aim's pct strength on the bound souls.
    const { scalar } = sigilModifierContributions(bound(23, 100_000_000));
    expect(scalar.murderRateMul).toBeCloseTo(1 + sigilStrength(sigilById(23)!, bn(100_000_000)), 6);
    // The old subtype-era inerts all carry real effects now.
    expect(sigilById(25)!.effect.kind).toBe('flatGen'); // Glasya-Labolas → flat murder
    expect(sigilById(64)!.effect.kind).toBe('categoryTier'); // Haures → Decimatio Stellar
  });

  it('Amdusias #67 lifts the whole positive tier group (all Opera)', () => {
    const strength = sigilStrength(sigilById(67)!, bn(100_000_000)); // 1
    const m = computeModifiers(bound(67, 100_000_000)).tierWeightMul;
    expect(m.stellar).toBeCloseTo(1 + strength, 6);
    expect(m.excellent).toBeCloseTo(1 + strength, 6);
    expect(m.good).toBeCloseTo(1 + strength, 6);
    expect(m.bad).toBeUndefined();
  });
});

describe('Indagatio find-quality sigils (S12)', () => {
  it('Vassago #3 and Stolas #36 bias Indagatio rarity through the tier distribution', () => {
    expect(sigilById(3)!.effect).toEqual({
      kind: 'categoryTier',
      category: 'indagatio',
      tiers: ['stellar', 'excellent'],
      direction: 'increase',
    });
    expect(sigilById(36)!.effect).toEqual({
      kind: 'categoryTier',
      category: 'indagatio',
      tiers: ['neutral'],
      direction: 'decrease',
    });
    // Vassago lifts the profane/anathema entry tiers, and only on Indagatio.
    const v = sigilCategoryTierContributions(bound(3, 1_000_000), 'indagatio');
    expect(v.stellar).toBeGreaterThan(1);
    expect(v.excellent).toBeGreaterThan(1);
    expect(v.good).toBeUndefined();
    expect(sigilCategoryTierContributions(bound(3, 1_000_000), 'decimatio')).toEqual({});
    // Stolas DAMPS the Neutral (Common-find) entry per the sheet rev; Halphas #38 damps
    // Neutral + Good (common & rare) together.
    expect(sigilCategoryTierContributions(bound(36, 1_000_000), 'indagatio').neutral).toBeLessThan(
      1,
    );
    const h = sigilCategoryTierContributions(bound(38, 1_000_000), 'indagatio');
    expect(h.neutral).toBeLessThan(1);
    expect(h.good).toBeLessThan(1);
  });

  it('Crocell #49 gives a clamped second-find probability (Crocell ⇄ Furcas swap, sheet rev)', () => {
    expect(sigilById(49)!.effect).toEqual({ kind: 'indagatioDoubleFind' });
    expect(sigilById(50)!.effect).toEqual({ kind: 'shutdownRefund' }); // Furcas → divestment
    expect(sigilIndagatioDoubleFindChance(fresh())).toBe(0);
    // A very large binding drives the raw strength past 1, so the chance clamps to 1; a smaller
    // binding stays below the cap at its raw strength.
    expect(sigilIndagatioDoubleFindChance(bound(49, 1e50))).toBe(1);
    expect(sigilIndagatioDoubleFindChance(bound(49, 100_000_000))).toBeCloseTo(
      sigilStrength(sigilById(49)!, bn(100_000_000)),
      6,
    );
  });

  it('a bound Crocell surfaces two maleficia where one would be found', () => {
    expect(resolveIndagatio(fresh(), 'stellar', makeRng(3)).surfaced).toHaveLength(1);
    // A binding that clamps the double-find chance to 1 guarantees the second surface.
    expect(resolveIndagatio(bound(49, 1e50), 'stellar', makeRng(3)).surfaced).toHaveLength(2);
  });
});

describe('ADR-034: the ten reactivated seals (names + effects)', () => {
  // The offline-gain, lesser-ceremony and Depraedatio channels these seals once fed all retired.
  // ADR-034 re-homes them onto the Stagnation + Desidia system and the live economy, so every one
  // of the ten now carries a Goetia name and a real effect (no orphaned seals remain).
  it('names: every reactivated seal carries its Goetia name', () => {
    expect(sigilById(11)!.name).toBe('Gusion');
    expect(sigilById(12)!.name).toBe('Sitri');
    expect(sigilById(15)!.name).toBe('Eligos');
    expect(sigilById(16)!.name).toBe('Zepar');
    expect(sigilById(19)!.name).toBe('Sallos');
    expect(sigilById(21)!.name).toBe('Marax');
    expect(sigilById(24)!.name).toBe('Naberius');
    expect(sigilById(31)!.name).toBe('Foras');
    expect(sigilById(59)!.name).toBe('Orias');
    expect(sigilById(61)!.name).toBe('Zagan');
  });

  it("Gusion #11 softens the player's own influence generation (a cursed decrease)", () => {
    const strength = sigilStrength(sigilById(11)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(11, 100_000_000));
    expect(scalar.influenceRateMul).toBeCloseTo(1 / (1 + strength), 6);
  });

  it('Sitri #12 lifts the offline Stagnation-gain rate, banking more over the same span', () => {
    const strength = sigilStrength(sigilById(12)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(12, 100_000_000));
    expect(scalar.stagnationGainMul).toBeCloseTo(1 + strength, 6);
    // The lift flows through grantStagnationForOffline: more banked for the same seconds away (both
    // spans stay under the fresh cap of 120, so the Math.min never clamps).
    const hour = 3600;
    const base = grantStagnationForOffline(fresh(), hour).stagnation;
    const sitri = grantStagnationForOffline(bound(12, 100_000_000), hour).stagnation;
    expect(base).toBeCloseTo(hour * STAGNATION_PER_SECOND, 6);
    expect(sitri).toBeCloseTo(hour * STAGNATION_PER_SECOND * (1 + strength), 6);
  });

  it('Eligos #15 cuts Emptio gold costs; Zepar #16 cuts invocation costs at 1/3 strength', () => {
    expect(sigilCostReductionByChannel(bound(15, 100_000_000)).emptioGold).toBeCloseTo(
      1 + sigilStrength(sigilById(15)!, bn(100_000_000)),
      6,
    );
    expect(sigilCostReductionByChannel(bound(16, 100_000_000)).invocation).toBeCloseTo(
      1 + sigilStrength(sigilById(16)!, bn(100_000_000)),
      6,
    );
    // Zepar #16, Marax #21 and Zagan #61 each carry a third of the standard pct strength (ADR-034).
    expect(sigilById(16)!.coefficient).toBeCloseTo(1 / 3, 12);
    expect(sigilById(21)!.coefficient).toBeCloseTo(1 / 3, 12);
    expect(sigilById(61)!.coefficient).toBeCloseTo(1 / 3, 12);
  });

  it('Sallos #19 softens the Desidia Stagnation-drain rate (composes with Lemure)', () => {
    const strength = sigilStrength(sigilById(19)!, bn(100_000_000));
    // No Lemure bound, so the drain multiplier is exactly the sigil softening.
    expect(computeModifiers(bound(19, 100_000_000)).desidiaDrainMul).toBeCloseTo(
      1 / (1 + strength),
      6,
    );
  });

  it('Marax #21 lifts Decimatio efficiency at 1/3 strength', () => {
    const strength = sigilStrength(sigilById(21)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(21, 100_000_000));
    expect(scalar.decimatioEfficiencyMul).toBeCloseTo(1 + strength, 6);
  });

  it('Naberius #24 shortens Indagatio (a time-mode lift on indagatioEfficiencyMul)', () => {
    const strength = sigilStrength(sigilById(24)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(24, 100_000_000));
    expect(scalar.indagatioEfficiencyMul).toBeCloseTo(1 + strength, 6);
  });

  it('Foras #31 accelerates Desidia time (composes with Acedia Procrastination)', () => {
    const strength = sigilStrength(sigilById(31)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(31, 100_000_000));
    expect(scalar.desidiaSpeedMul).toBeCloseTo(1 + strength, 6);
    // On a fresh state (Acedia intensity 0) the bundle's desidiaSpeedMul is exactly the sigil lift.
    expect(computeModifiers(bound(31, 100_000_000)).desidiaSpeedMul).toBeCloseTo(1 + strength, 6);
  });

  it('Orias #59 lifts the maximum Stagnation cap on top of the Acedia doubling', () => {
    const strength = sigilStrength(sigilById(59)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(59, 100_000_000));
    expect(scalar.stagnationMaxMul).toBeCloseTo(1 + strength, 6);
    // Base cap is 120 at Acedia level 0; Orias scales it by (1 + strength).
    expect(stagnationMax(fresh())).toBeCloseTo(STAGNATION_BASE_MAX, 6);
    expect(stagnationMax(bound(59, 100_000_000))).toBeCloseTo(
      STAGNATION_BASE_MAX * (1 + strength),
      6,
    );
  });

  it('Zagan #61 lifts Suasio efficiency at 1/3 strength', () => {
    const strength = sigilStrength(sigilById(61)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(61, 100_000_000));
    expect(scalar.suasioEfficiencyMul).toBeCloseTo(1 + strength, 6);
  });
});

describe('Composite (multi-effect) seals (S17 — ADR-035)', () => {
  it('Raum #40 lifts Decimatio efficiency while it dampens Suasio, at one strength', () => {
    expect(sigilById(40)!.effect.kind).toBe('composite');
    const strength = sigilStrength(sigilById(40)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(40, 100_000_000));
    expect(scalar.decimatioEfficiencyMul).toBeCloseTo(1 + strength, 6);
    expect(scalar.suasioEfficiencyMul).toBeCloseTo(1 / (1 + strength), 6);
  });

  it('Dantalion #71 mirrors Raum: +Suasio, -Decimatio at one strength', () => {
    const strength = sigilStrength(sigilById(71)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(71, 100_000_000));
    expect(scalar.suasioEfficiencyMul).toBeCloseTo(1 + strength, 6);
    expect(scalar.decimatioEfficiencyMul).toBeCloseTo(1 / (1 + strength), 6);
  });

  it('Raum #40 and Dantalion #71 cancel to neutral when bound at equal strength', () => {
    // Same souls, same coefficient/curve: their opposite legs compose to ~1x on both efficiencies.
    let s = { ...fresh(), souls: bn(2_000_000) };
    s = bindSigil(s, 40, 1_000_000);
    s = bindSigil(s, 71, 1_000_000);
    const { scalar } = sigilModifierContributions(s);
    expect(scalar.decimatioEfficiencyMul).toBeCloseTo(1, 9);
    expect(scalar.suasioEfficiencyMul).toBeCloseTo(1, 9);
  });

  it('Andrealphus #65 is a dual seal: softens invocation costs AND quickens Desidia', () => {
    expect(sigilById(65)!.effect.kind).toBe('composite');
    const strength = sigilStrength(sigilById(65)!, bn(100_000_000));
    // Cost-reduction leg -> the invocation channel.
    expect(sigilCostReductionByChannel(bound(65, 100_000_000)).invocation).toBeCloseTo(
      1 + strength,
      6,
    );
    // Modifier leg -> desidiaSpeedMul (composes with Foras #31; alone it is exactly the lift).
    const { scalar } = sigilModifierContributions(bound(65, 100_000_000));
    expect(scalar.desidiaSpeedMul).toBeCloseTo(1 + strength, 6);
    expect(computeModifiers(bound(65, 100_000_000)).desidiaSpeedMul).toBeCloseTo(1 + strength, 6);
  });

  it('effectParts flattens a composite and passes a single effect through unchanged', () => {
    expect(effectParts(sigilById(40)!.effect)).toHaveLength(2); // Raum: two parts
    const valefor = sigilById(6)!; // a plain single-effect seal
    expect(effectParts(valefor.effect)).toEqual([valefor.effect]);
  });
});

describe('Faeneratio output sigil (S14)', () => {
  it('Vapula #60 scales the Faeneratio gold output, never generation', () => {
    const withBook = (s: GameState): GameState => ({
      ...s,
      // Avaritia level 1 opens the loan book; a populated world gives it a take.
      devotion: { ...s.devotion, avaritia: bn(180) },
      lifetime: { ...s.lifetime, reprobates: 1000 },
    });
    const goldGain = (s: GameState): number =>
      tick(s, 1).state.lifetime.gold.toNumber() - s.lifetime.gold.toNumber();
    const base = goldGain(withBook(fresh()));
    const vapula = goldGain(withBook(bound(60, 100_000_000))); // ×(1 + strength) on the term
    // Mutuum take 0.05 × 1000 = 50/s; Vapula scales that term by (1 + strength) and leaves the 2/s
    // base alone. Everything rides goldRateMul (the Avaritia-180 Golden Hand intensity is in play).
    const rateMul = computeModifiers(withBook(fresh())).goldRateMul;
    const vapulaMul = 1 + sigilStrength(sigilById(60)!, bn(100_000_000));
    expect(base).toBeCloseTo((2 + 50) * rateMul, 4);
    expect(vapula).toBeCloseTo((2 + 50 * vapulaMul) * rateMul, 4);
    const genOf = (s: GameState): number =>
      reprobateRates(s, computeModifiers(s)).generationPerSecond;
    expect(genOf(withBook(bound(60, 100_000_000)))).toBeCloseTo(genOf(withBook(fresh())), 9);
  });
});

describe('Per-invocation effectiveness sigils (S15)', () => {
  const withInv = (s: GameState, id: string, n = 1): GameState => ({
    ...s,
    lifetime: { ...s.lifetime, invocations: { ...s.lifetime.invocations, [id]: n } },
  });

  it('Buer #10 (familiar) scales a named invocation by id; Sitri is not on this channel', () => {
    expect(sigilById(10)!.effect).toEqual({ kind: 'invocationEffect', invocation: 'familiar' });
    // Sitri #12 is wired again (ADR-034), but to stagnationGainMul, not the invocation-effect channel.
    expect(sigilById(12)!.effect).toEqual({
      kind: 'modifier',
      field: 'stagnationGainMul',
      direction: 'increase',
    });
    expect(sigilInvocationEffectContributions(bound(12, 100_000_000))).toEqual({});
    const c = sigilInvocationEffectContributions(bound(10, 100_000_000));
    expect(c.familiar).toBeCloseTo(1 + sigilStrength(sigilById(10)!, bn(100_000_000)), 6);
    expect(Object.keys(c)).toEqual(['familiar']);
  });

  it('Buer lifts player efficiency only when a familiar is present', () => {
    const base = computeModifiers(withInv(fresh(), 'familiar')).playerEfficiencyMul;
    const buer = computeModifiers(withInv(bound(10, 100_000_000), 'familiar')).playerEfficiencyMul;
    expect(buer).toBeGreaterThan(base);
    expect(computeModifiers(bound(10, 100_000_000)).playerEfficiencyMul).toBeCloseTo(
      computeModifiers(fresh()).playerEfficiencyMul,
      9,
    );
  });
});

describe('Sigil one-offs (S16): the new mechanics (sheet rev 2026-06-12)', () => {
  it('Bael #1 carries the all-Opera negative-tier damp (no longer inert)', () => {
    expect(sigilById(1)!.effect).toEqual({
      kind: 'tierGroup',
      tiers: ['bad', 'terrible', 'apocalyptic'],
      direction: 'decrease',
    });
    expect(sigilById(1)!.name).toBe('Bael');
  });

  it('Leraie #14: each murder triggers a suicide with the bound chance', () => {
    expect(sigilById(14)!.effect).toEqual({ kind: 'murderTriggersSuicide' });
    expect(sigilMurderTriggersSuicideChance(fresh())).toBe(0);
    // The coupled-suicide chance is Leraie's pct strength on the bound souls.
    const s = {
      ...bound(14, 25_000_000),
      lifetime: { ...bound(14, 25_000_000).lifetime, reprobates: 1000 },
    };
    const mods = computeModifiers(s);
    const chance = mods.murderTriggersSuicideChance;
    expect(chance).toBeCloseTo(sigilStrength(sigilById(14)!, bn(25_000_000)), 6);
    const rates = reprobateRates(s, mods);
    const baseState = { ...fresh(), lifetime: { ...fresh().lifetime, reprobates: 1000 } };
    const baseRates = reprobateRates(baseState, computeModifiers(baseState));
    expect(rates.murderPerSecond).toBeCloseTo(baseRates.murderPerSecond, 9);
    expect(rates.suicidePerSecond).toBeCloseTo(
      baseRates.suicidePerSecond + chance * rates.murderPerSecond,
      9,
    );
  });

  it('Vine #45 raises the Thesaurus recovery, capped at 0.9 effective; Furcas composes', () => {
    // Re-pinned from the Mercatus divest fraction to `thesaurusRecoveryMul` — the same "recovery"
    // niche, unchanged in magnitude (Depraedatio rework §9).
    expect(sigilById(45)!.effect).toEqual({ kind: 'shutdownRefund' });
    // Recovery multiplier is 1 + Vine's pct strength; the base recovery fraction is 0.25.
    const vineMul = 1 + sigilStrength(sigilById(45)!, bn(100_000_000));
    expect(sigilShutdownRefundMul(bound(45, 100_000_000))).toBeCloseTo(vineMul, 6);
    expect(thesaurusRecoveryFraction(computeModifiers(fresh()))).toBeCloseTo(0.25, 6);
    expect(thesaurusRecoveryFraction(computeModifiers(bound(45, 100_000_000)))).toBeCloseTo(
      0.25 * vineMul,
      6,
    );
    expect(thesaurusRecoveryFraction(computeModifiers(bound(45, 1e50)))).toBe(0.9); // the cap
    // Vine + Furcas on the same channel compose multiplicatively (same strength at the same souls).
    let both = fresh();
    both = { ...both, souls: bn(200_000_000) };
    both = bindSigil(both, 45, 100_000_000);
    both = bindSigil(both, 50, 100_000_000);
    expect(sigilShutdownRefundMul(both)).toBeCloseTo(vineMul * vineMul, 6);
    expect(computeModifiers(both).thesaurusRecoveryMul).toBeCloseTo(vineMul * vineMul, 6);
  });

  it('Semet #32 scales the other sigils; Gaap #33 inflates the maleficia enhancer stack', () => {
    // Valefor at 1e8 has pct strength ≈ 0.53 (gold ×1.53). With Semet bound at 5 832 000 souls
    // (ln(5 832 001) × 0.01 ≈ 0.1561), the Valefor strength reads ×(1 + semet).
    let s = fresh();
    s = { ...s, souls: bn(200_000_000) };
    s = maxSinsTo(s, 2); // Semet gate (this also wakes the Sin skills, e.g. the Golden Hand)
    const skillBase = computeModifiers(s).goldRateMul; // skills only, no sigils
    s = bindSigil(s, 6, 100_000_000);
    const without = computeModifiers(s).goldRateMul;
    const withSemet = computeModifiers(bindSigil(s, 32, 5_832_000)).goldRateMul;
    const valeforStrength = sigilStrength(sigilById(6)!, bn(100_000_000));
    const semetBonus = 0.01 * Math.log(5_832_001);
    expect(without / skillBase).toBeCloseTo(1 + valeforStrength, 6);
    expect(withSemet / skillBase).toBeCloseTo(1 + valeforStrength * (1 + semetBonus), 4);
    // Gaap inflates the maleficia-driven bonus: with Solomon's Ring (raw ×1.66) and Gaap bound,
    // the effective enhancer exceeds the ring alone.
    const ring = (g: GameState): GameState => ({
      ...g,
      lifetime: { ...g.lifetime, maleficia: ['solomons_ring'] },
    });
    const ringOnly = computeModifiers(
      ring(bindSigil({ ...fresh(), souls: bn(2e8) }, 6, 100_000_000)),
    );
    let gaapState = { ...fresh(), souls: bn(400_000_000) };
    gaapState = bindSigil(gaapState, 6, 100_000_000);
    gaapState = bindSigil(gaapState, 33, 100_000_000);
    const withGaap = computeModifiers(ring(gaapState));
    expect(withGaap.goldRateMul).toBeGreaterThan(ringOnly.goldRateMul);
  });

  it('duplicate-output sigils double a positive resolution (Malphas #39 on Suggestion)', () => {
    // A very large Malphas binding clamps the dup chance to 1. A Good Suggestion adds 1 reprobate
    // per pass → 2 total.
    const s = bound(39, 1e50);
    const r = resolveAction(s, 'suggestion', makeRng(7), { forcedTier: 'good', efficiency: 1 });
    expect(totalReprobates(r.state) - totalReprobates(s)).toBe(2);
    // Negative tiers never duplicate: a Bad outcome removes exactly one.
    const seeded = { ...s, lifetime: { ...s.lifetime, reprobates: 10 } };
    const bad = resolveAction(seeded, 'suggestion', makeRng(7), {
      forcedTier: 'bad',
      efficiency: 1,
    });
    expect(totalReprobates(bad.state) - totalReprobates(seeded)).toBe(-1);
  });

  it('without a duplicate-output sigil the dup roll is NOT drawn (RNG stream stays byte-identical)', () => {
    // ADR-011: an un-triggered feature must leave the seeded stream untouched. A Good Suggestion
    // makes no internal RNG draw, so with no Malphas/Focalor/Agares bound resolveAction must consume
    // zero floats — the dup-chance draw is gated behind chance > 0. (Regression: it used to draw
    // unconditionally, shifting every downstream roll for saves without these sigils.)
    const rng = makeRng(fresh().rngState);
    const before = rng.state;
    resolveAction(fresh(), 'suggestion', rng, { forcedTier: 'good', efficiency: 1 });
    expect(rng.state).toBe(before);
  });
});
