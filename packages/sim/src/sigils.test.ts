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
  activateMaleficium,
  applyCallEffects,
  BASE_GOLD_PER_SECOND,
  bindingMagnitude,
  bindSigil,
  bn,
  categoryEfficiency,
  categoryTierModifiers,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  currentInvokingPower,
  effectParts,
  enterKatabasis,
  grantDesidiaForOffline,
  indagatioInvestmentCost,
  invocationUpkeep,
  logosBadLoss,
  logosLossMul,
  MALEFICIA_BUFF_DURATION_SECONDS,
  maleficiaBuffDuration,
  makeRng,
  mintSouls,
  NEUTRAL_MODIFIERS,
  remainingGoldFraction,
  remainingReprobateFraction,
  reprobateRates,
  resolveAction,
  resolveEmptio,
  resolveIndagatio,
  resolveSuggestion,
  surrenderCharge,
  thesaurusRecoveryFraction,
  sigilById,
  sigilCategoryTierContributions,
  sigilCostReductionByChannel,
  sigilEffectMulFor,
  sigilEffectStack,
  sigilIndagatioDoubleFindChance,
  sigilInvocationEffectContributions,
  sigilInvokingPower,
  sigilKatabasisBonus,
  sigilLossMul,
  sigilModifierContributions,
  sigilMurderTriggersSuicideChance,
  sigilShutdownRefundMul,
  sigilStrength,
  sigilVisible,
  SIGIL_IDS,
  SINS,
  DESIDIA_BASE_MAX,
  DESIDIA_PER_SECOND,
  desidiaMax,
  startAction,
  tick,
  totalReprobates,
  type GameState,
  type Rng,
  type SigilEffect,
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

  it('sqrt (an opt-in curve, no seal currently uses it) grows gently', () => {
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

  it('Bael #1 (tierGroup decrease) damps all three negative tiers at once', () => {
    const s = bound(1, 1_000_000);
    const strength = sigilStrength(sigilById(1)!, bn(1_000_000));
    const m = computeModifiers(s).tierWeightMul;
    expect(m.bad).toBeCloseTo(1 / (1 + strength), 6);
    expect(m.terrible).toBeCloseTo(1 / (1 + strength), 6);
    expect(m.apocalyptic).toBeCloseTo(1 / (1 + strength), 6);
    expect(m.stellar).toBeUndefined();
  });

  it('two sigils on the same weight compose multiplicatively', () => {
    // No two seals share an effect (ADR-043), but distinct effects can still meet on one weight:
    // Vassago #3 (Stellar + Excellent) and Astaroth #29 (Stellar alone) both lift Indagatio Stellar.
    let s = fresh();
    s = { ...s, souls: bn(2_000_000) };
    s = bindSigil(s, 3, 10_000);
    s = bindSigil(s, 29, 1_000_000);
    const a = sigilStrength(sigilById(3)!, bn(10_000));
    const b = sigilStrength(sigilById(29)!, bn(1_000_000));
    const out = sigilCategoryTierContributions(s, 'indagatio');
    expect(out.stellar).toBeCloseTo((1 + a) * (1 + b), 5);
    expect(out.excellent).toBeCloseTo(1 + a, 5); // only Vassago reaches Excellent
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
    expect(categoryTierModifiers(s, 'logos')).toEqual({}); // category-scoped
  });

  it('Botis #17 damps only the Logos bad-outcome tiers', () => {
    const s = bound(17, 10_000);
    const strength = sigilStrength(sigilById(17)!, bn(10_000));
    const m = categoryTierModifiers(s, 'logos');
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

  it('Gremory #56 composes onto the Logos success shift', () => {
    const base = bound(56, 10_000);
    const strength = sigilStrength(sigilById(56)!, bn(10_000));
    // No Devotion here, so the success multiplier is Gremory alone.
    expect(categoryTierModifiers(base, 'logos').good).toBeCloseTo(1 + strength, 6);
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
    // Harpy (Ira) is unaffected by a Vanagloria sigil — its base-murder-rate contribution is unchanged.
    const harpy = withInv('harpy', 2);
    const harpyBase = computeModifiers(harpy).flatBaseMurderRatePerSecond;
    expect(computeModifiers(bound(26, 100_000, harpy)).flatBaseMurderRatePerSecond).toBeCloseTo(
      harpyBase,
      6,
    );
  });

  it('Vepar #42 (Ira) scales an Ira invocation effect by (1 + strength) (the Imp murders/s)', () => {
    const imp = withInv('imp', 1);
    const strength = sigilStrength(sigilById(42)!, bn(100_000)); // Vepar → Ira
    expect(computeModifiers(bound(42, 100_000, imp)).flatMurdersPerSecond).toBeCloseTo(
      computeModifiers(imp).flatMurdersPerSecond * (1 + strength),
      6,
    );
  });

  it('Furfur #34 (Luxuria) amplifies a Luxuria invocation effect (Succubus reprobate generation)', () => {
    // Succubus is a Luxuria reprobate generator (flatGenerationPerSecond); the Luxuria per-Sin term
    // scales its effect, so Furfur lifts it.
    const succ = withInv('succubus', 1);
    const base = computeModifiers(succ).flatGenerationPerSecond;
    const boosted = computeModifiers(bound(34, 100_000, succ)).flatGenerationPerSecond;
    expect(base).toBeGreaterThan(0);
    expect(boosted).toBeGreaterThan(base);
  });
});

describe('Flat-generator sigils (S6)', () => {
  it('Haagenti #48 generates gold/s on a log curve matching the sheet', () => {
    // Player tuning rev 2026-10-22: coeff 0.3 (a tenth of the sheet's 3), N=100 → 0.3 × ln(101)
    // ≈ 1.385 gold/s.
    const strength = sigilStrength(sigilById(48)!, bn(100));
    expect(strength).toBeCloseTo(0.3 * Math.log(101), 6);
    const m = computeModifiers(bound(48, 100));
    expect(m.flatGoldPerSecond).toBeCloseTo(0.3 * Math.log(101), 6);
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
    const before = tick(fresh(), 1).state.lifetime.gold.toNumber();
    const after = tick(bound(48, 100), 1).state.lifetime.gold.toNumber();
    // One second of Haagenti's ~1.385/s on top of the base gold (goldRateMul = 1 at baseline).
    expect(after - before).toBeCloseTo(0.3 * Math.log(101), 6);
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
    // Player tuning rev 2026-10-22: coeff 0.1 (a fifth of the sheet's 0.5).
    // 0.1 × ln(1e8 + 1) ≈ 1.84 → rounds to 2.
    expect(sigilInvokingPower(bound(30, 100_000_000))).toBe(2);
    // 0.1 × ln(1001) ≈ 0.69 → rounds to 1.
    expect(sigilInvokingPower(bound(30, 1000))).toBe(1);
    // 0.1 × ln(101) ≈ 0.46 → rounds to 0: a small binding no longer buys any power.
    expect(sigilInvokingPower(bound(30, 100))).toBe(0);
    // Folds into the gate total (no maleficia here, so it is the whole of it).
    expect(currentInvokingPower(bound(30, 100_000_000))).toBe(2);
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
    // Ipos #22 softens the Indagatio investment on its own channel (ADR-043).
    expect(sigilCostReductionByChannel(bound(22, 100_000_000)).indagatioInvestment).toBeCloseTo(
      1 + sigilStrength(sigilById(22)!, bn(100_000_000)),
      6,
    );
    // Since ADR-043 Orobas is the only seal on the invocation channel: Zepar #16 and Andrealphus
    // #65 left it, and Amy #58 is no cost-reduction seal.
    expect(sigilCostReductionByChannel(bound(16, 100_000_000)).invocation).toBeUndefined();
    expect(sigilCostReductionByChannel(bound(65, 100_000_000)).invocation).toBeUndefined();
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

  it('Orobas #55 softens ALL invocation upkeep — flat drains and %-of-gain alike (ADR-035)', () => {
    const factor = 1 + sigilStrength(sigilById(55)!, bn(100_000_000));
    // An active Imp drains 10 gold/s flat; Orobas divides it.
    const withImp = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, invocations: { imp: 1 } },
    });
    expect(invocationUpkeep(withImp(fresh())).flatGoldPerSecond).toBe(10);
    expect(invocationUpkeep(withImp(bound(55, 100_000_000))).flatGoldPerSecond).toBeCloseTo(
      10 / factor,
      6,
    );
    // A bound Lemure drains 25% of influence gain; ADR-035 divides that %-of-gain cost too (it was
    // previously left untouched as an "apex tradeoff").
    const withLemure = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, invocations: { lemure: 1 } },
    });
    expect(invocationUpkeep(withLemure(fresh())).influenceGainFraction).toBeCloseTo(0.25, 6);
    expect(invocationUpkeep(withLemure(bound(55, 100_000_000))).influenceGainFraction).toBeCloseTo(
      0.25 / factor,
      6,
    );

    // The reprobate fraction (Morpheus) and desidia (Upir) upkeep are softened too.
    const withMorpheus = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, invocations: { morpheus: 1 } },
    });
    expect(invocationUpkeep(withMorpheus(fresh())).reprobateFraction).toBeCloseTo(0.05, 6);
    expect(invocationUpkeep(withMorpheus(bound(55, 100_000_000))).reprobateFraction).toBeCloseTo(
      0.05 / factor,
      6,
    );
  });
});

describe('Murder- and positive-tier sigils (S10)', () => {
  it('Aim #23 lifts the murder-rate modifier; the subtype-era inerts carry real effects', () => {
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
    // (Haures #64, re-homed onto Decimatio Stellar, went dormant again with Decimatio: ADR-038.)
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
    expect(sigilCategoryTierContributions(bound(3, 1_000_000), 'logos')).toEqual({});
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
  // ADR-034 re-homes them onto the Desidia system and the live economy, so every one
  // of the ten carries a Goetia name and a real effect (Marax #21, re-homed onto Decimatio
  // efficiency, went dormant again with that category: ADR-038).
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

  it('Sitri #12 lifts the offline Desidia-gain rate, banking more over the same span', () => {
    const strength = sigilStrength(sigilById(12)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(12, 100_000_000));
    expect(scalar.desidiaGainMul).toBeCloseTo(1 + strength, 6);
    // The lift flows through grantDesidiaForOffline: more banked for the same seconds away (both
    // spans stay under the fresh cap of 120, so the Math.min never clamps).
    const hour = 3600;
    const base = grantDesidiaForOffline(fresh(), hour).desidia;
    const sitri = grantDesidiaForOffline(bound(12, 100_000_000), hour).desidia;
    expect(base).toBeCloseTo(hour * DESIDIA_PER_SECOND, 6);
    expect(sitri).toBeCloseTo(hour * DESIDIA_PER_SECOND * (1 + strength), 6);
  });

  it('Eligos #15 cuts Emptio gold costs; Zagan #61 keeps its third strength', () => {
    expect(sigilCostReductionByChannel(bound(15, 100_000_000)).emptioGold).toBeCloseTo(
      1 + sigilStrength(sigilById(15)!, bn(100_000_000)),
      6,
    );
    // Zagan #61 carries a third of the standard pct strength (ADR-034).
    expect(sigilById(61)!.coefficient).toBeCloseTo(1 / 3, 12);
  });

  it('Sallos #19 softens the Desidia-drain rate (composes with Lemure)', () => {
    const strength = sigilStrength(sigilById(19)!, bn(100_000_000));
    // No Lemure bound, so the drain multiplier is exactly the sigil softening.
    expect(computeModifiers(bound(19, 100_000_000)).desidiaDrainMul).toBeCloseTo(
      1 / (1 + strength),
      6,
    );
  });

  it('Foras #31 accelerates Desidia time (composes with Acedia Procrastination)', () => {
    const strength = sigilStrength(sigilById(31)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(31, 100_000_000));
    expect(scalar.desidiaSpeedMul).toBeCloseTo(1 + strength, 6);
    // On a fresh state (Acedia intensity 0) the bundle's desidiaSpeedMul is exactly the sigil lift.
    expect(computeModifiers(bound(31, 100_000_000)).desidiaSpeedMul).toBeCloseTo(1 + strength, 6);
  });

  it('Orias #59 lifts the maximum Desidia cap on top of the Acedia doubling', () => {
    const strength = sigilStrength(sigilById(59)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(59, 100_000_000));
    expect(scalar.desidiaMaxMul).toBeCloseTo(1 + strength, 6);
    // Base cap is 120 at Acedia level 0; Orias scales it by (1 + strength).
    expect(desidiaMax(fresh())).toBeCloseTo(DESIDIA_BASE_MAX, 6);
    expect(desidiaMax(bound(59, 100_000_000))).toBeCloseTo(DESIDIA_BASE_MAX * (1 + strength), 6);
  });

  it('Zagan #61 lifts Logos efficiency at 1/3 strength', () => {
    const strength = sigilStrength(sigilById(61)!, bn(100_000_000));
    const { scalar } = sigilModifierContributions(bound(61, 100_000_000));
    expect(scalar.logosEfficiencyMul).toBeCloseTo(1 + strength, 6);
  });
});

describe('Composite (multi-effect) seals (S17 — ADR-035)', () => {
  it('effectParts flattens a composite and passes a single effect through unchanged', () => {
    // No seal carries a composite since ADR-043 (Andrealphus #65, the last, duplicated Orobas #55
    // and Foras #31); the kind stays supported, so pin its flattening on a literal effect.
    const composite = {
      kind: 'composite',
      effects: [
        { kind: 'costReduction', channel: 'invocation' },
        { kind: 'modifier', field: 'desidiaSpeedMul', direction: 'increase' },
      ],
    } as const;
    expect(effectParts(composite)).toEqual(composite.effects);
    const valefor = sigilById(6)!; // a plain single-effect seal
    expect(effectParts(valefor.effect)).toEqual([valefor.effect]);
  });
});

describe('Account output sigil (S14)', () => {
  it('Vapula #60 scales the reserve interest, never generation', () => {
    const withReserve = (s: GameState): GameState => ({
      ...s,
      devotion: { ...s.devotion, avaritia: bn(180) },
      // 100,000 gold in reserve pays FENUS_RATE × 100,000 = 50 gold/s of interest.
      lifetime: { ...s.lifetime, reprobates: 1000, hoard: bn(100_000) },
    });
    const goldGain = (s: GameState): number =>
      tick(s, 1).state.lifetime.gold.toNumber() - s.lifetime.gold.toNumber();
    const base = goldGain(withReserve(fresh()));
    const vapula = goldGain(withReserve(bound(60, 100_000_000))); // ×(1 + strength) on the term
    // Interest 50/s; Vapula scales that term by (1 + strength) and leaves the base gold/s alone.
    // Everything rides goldRateMul (the Avaritia-180 Golden Hand intensity is in play).
    const rateMul = computeModifiers(withReserve(fresh())).goldRateMul;
    const vapulaMul = 1 + sigilStrength(sigilById(60)!, bn(100_000_000));
    expect(base).toBeCloseTo((BASE_GOLD_PER_SECOND + 50) * rateMul, 4);
    expect(vapula).toBeCloseTo((BASE_GOLD_PER_SECOND + 50 * vapulaMul) * rateMul, 4);
    const genOf = (s: GameState): number =>
      reprobateRates(s, computeModifiers(s)).generationPerSecond;
    expect(genOf(withReserve(bound(60, 100_000_000)))).toBeCloseTo(genOf(withReserve(fresh())), 9);
  });
});

describe('Per-invocation effectiveness sigils (S15)', () => {
  const withInv = (s: GameState, id: string, n = 1): GameState => ({
    ...s,
    lifetime: { ...s.lifetime, invocations: { ...s.lifetime.invocations, [id]: n } },
  });

  it('Buer #10 (familiar) scales a named invocation by id; Sitri is not on this channel', () => {
    expect(sigilById(10)!.effect).toEqual({ kind: 'invocationEffect', invocation: 'familiar' });
    // Sitri #12 is wired again (ADR-034), but to desidiaGainMul, not the invocation-effect channel.
    expect(sigilById(12)!.effect).toEqual({
      kind: 'modifier',
      field: 'desidiaGainMul',
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

  it('Furcas #50 softens the reserve surrender charge (asymptotic cut)', () => {
    // Re-pinned from the withdrawal recovery to the surrender charge (the relationship-tier rework):
    // the charge divides by 1 + Furcas's pct strength, so it softens toward zero but never inverts.
    // Furcas is the only seal on it since Vine #45 moved to Indagatio's gold losses (ADR-043).
    expect(sigilById(50)!.effect).toEqual({ kind: 'shutdownRefund' });
    const furcasMul = 1 + sigilStrength(sigilById(50)!, bn(100_000_000));
    expect(sigilShutdownRefundMul(bound(50, 100_000_000))).toBeCloseTo(furcasMul, 6);
    expect(sigilShutdownRefundMul(bound(45, 100_000_000))).toBe(1); // Vine no longer reaches it
    expect(surrenderCharge(computeModifiers(fresh()))).toBeCloseTo(0.15, 9);
    expect(surrenderCharge(computeModifiers(bound(50, 100_000_000)))).toBeCloseTo(
      0.15 / furcasMul,
      6,
    );
    expect(thesaurusRecoveryFraction(computeModifiers(bound(50, 100_000_000)))).toBeCloseTo(
      1 - 0.15 / furcasMul,
      6,
    );
    // A vast binding drives the charge toward zero, never below it.
    const huge = surrenderCharge(computeModifiers(bound(50, 1e50)));
    expect(huge).toBeGreaterThan(0);
    expect(huge).toBeLessThan(0.15);
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
    // A very large Malphas binding clamps the dup chance to 1. A Good Suggestion drives
    // randint(1,3) reprobates to suicide per pass; replaying the stream (the dup float, then one
    // randint per pass) gives the exact two-pass toll.
    const s = bound(39, 1e50);
    const seeded = { ...s, lifetime: { ...s.lifetime, reprobates: 10 } };
    const r = resolveAction(seeded, 'suggestion', makeRng(7), {
      forcedTier: 'good',
      efficiency: 1,
    });
    const ref = makeRng(7);
    ref.float();
    const deaths = 2 + ref.int(3) + ref.int(3);
    expect(totalReprobates(seeded) - totalReprobates(r.state)).toBe(deaths);
    // Negative tiers never duplicate: a Bad outcome removes exactly one.
    const bad = resolveAction(seeded, 'suggestion', makeRng(7), {
      forcedTier: 'bad',
      efficiency: 1,
    });
    expect(totalReprobates(bad.state) - totalReprobates(seeded)).toBe(-1);
  });

  it('without a duplicate-output sigil the dup roll is NOT drawn (RNG stream stays byte-identical)', () => {
    // ADR-011: an un-triggered feature must leave the seeded stream untouched. A Good Suggestion's
    // only internal draw is its suicide randint, so with no Malphas/Agares bound resolveAction must
    // consume exactly what the bare resolver does: the dup-chance draw is gated behind chance > 0.
    // (Regression: it used to draw unconditionally, shifting every downstream roll for saves
    // without these sigils.)
    const rng = makeRng(fresh().rngState);
    resolveAction(fresh(), 'suggestion', rng, { forcedTier: 'good', efficiency: 1 });
    const ref = makeRng(fresh().rngState);
    resolveSuggestion(fresh(), 'good', ref);
    expect(rng.state).toBe(ref.state);
  });
});

describe('Sigil-effect maleficia reach every sigil channel', () => {
  // Solomon's Ring (+66%), Picatrix (+11%) and Teraphim (+4%) read "+X% sigil effects". The
  // resolution-time channels (duplicate output, Crocell's double find) and the Vine / Furcas
  // Thesaurus recovery used to take NO enhancer at all, so the relics silently skipped those six
  // seals. Each channel now takes the RAW enhancer stack (the documented split in modifiers.ts).
  const ring = (g: GameState): GameState => ({
    ...g,
    lifetime: { ...g.lifetime, maleficia: [...g.lifetime.maleficia, 'solomons_ring'] },
  });
  /** A stub RNG pinned to one float, so a chance roll lands exactly where the test puts it. */
  const pinnedRng = (x: number): Rng => ({
    float: () => x,
    int: (n: number) => Math.floor(x * n),
    range: (lo: number, hi: number) => lo + x * (hi - lo),
    chance: (p: number) => x < p,
    state: 0,
  });
  // At 1e6 souls a standard pct seal reads ~0.382; the ring lifts it to ~0.634. A roll pinned at 0.5
  // misses the bare chance and hits the enhanced one.
  const SOULS = 1_000_000;
  const ROLL = 0.5;

  it('the ring lifts the duplicate-output chance (Malphas #39 on a Good Suggestion)', () => {
    const strength = sigilStrength(sigilById(39)!, bn(SOULS));
    expect(strength).toBeLessThan(ROLL);
    expect(strength * 1.66).toBeGreaterThan(ROLL);
    const opts = { forcedTier: 'good' as const, efficiency: 1 };
    // The pinned roll also fixes each pass's suicide randint(1,3).
    const perPass = 1 + Math.floor(ROLL * 3);
    const b = bound(39, SOULS);
    const bare = { ...b, lifetime: { ...b.lifetime, reprobates: 10 } };
    const r0 = resolveAction(bare, 'suggestion', pinnedRng(ROLL), opts);
    expect(totalReprobates(bare) - totalReprobates(r0.state)).toBe(perPass);
    const lifted = ring(bare);
    const r1 = resolveAction(lifted, 'suggestion', pinnedRng(ROLL), opts);
    expect(totalReprobates(lifted) - totalReprobates(r1.state)).toBe(2 * perPass);
  });

  it('the ring alone never draws the duplicate roll (RNG stream stays byte-identical)', () => {
    const s = ring(fresh());
    const rng = makeRng(s.rngState);
    resolveAction(s, 'suggestion', rng, { forcedTier: 'good', efficiency: 1 });
    const ref = makeRng(s.rngState);
    resolveSuggestion(s, 'good', ref);
    expect(rng.state).toBe(ref.state);
  });

  it("the ring lifts Crocell #49's double-find chance", () => {
    const strength = sigilStrength(sigilById(49)!, bn(SOULS));
    expect(strength).toBeLessThan(ROLL);
    expect(strength * 1.66).toBeGreaterThan(ROLL);
    expect(resolveIndagatio(bound(49, SOULS), 'stellar', pinnedRng(ROLL)).surfaced).toHaveLength(1);
    expect(
      resolveIndagatio(ring(bound(49, SOULS)), 'stellar', pinnedRng(ROLL)).surfaced,
    ).toHaveLength(2);
  });

  it('the ring lifts the Furcas #50 surrender-charge cut', () => {
    const strength = sigilStrength(sigilById(50)!, bn(SOULS));
    expect(computeModifiers(bound(50, SOULS)).surrenderChargeMul).toBeCloseTo(
      1 / (1 + strength),
      6,
    );
    expect(computeModifiers(ring(bound(50, SOULS))).surrenderChargeMul).toBeCloseTo(
      1 / (1 + 1.66 * strength),
      6,
    );
    expect(surrenderCharge(computeModifiers(ring(bound(50, SOULS))))).toBeCloseTo(
      0.15 / (1 + 1.66 * strength),
      6,
    );
  });

  it('the ring lifts the ADR-043 channels (a loss cut, a per-death bounty)', () => {
    const balam = sigilStrength(sigilById(51)!, bn(SOULS));
    expect(sigilLossMul(ring(bound(51, SOULS)), 'logos', 1.66)).toBeCloseTo(
      1 / (1 + 1.66 * balam),
      6,
    );
    const raum = sigilStrength(sigilById(40)!, bn(SOULS));
    const s = mintSouls(ring(bound(40, SOULS)), 10);
    expect(s.lifetime.gold.toNumber()).toBeCloseTo(10 * raum * 1.66, 6);
  });
});

describe('ADR-043: the re-homed seals (no two seals share an effect)', () => {
  /** One key per atomic lever a seal pulls; a composite / multi-field seal pulls several. */
  function levers(effect: SigilEffect): string[] {
    return effectParts(effect).flatMap((p): string[] => {
      if (p.kind === 'modifier') return [`modifier:${p.field}:${p.direction}`];
      if (p.kind === 'modifierMulti') return p.fields.map((f) => `modifier:${f}:${p.direction}`);
      if (p.kind === 'tierGroup')
        return [`tierGroup:${[...p.tiers].sort().join('+')}:${p.direction}`];
      if (p.kind === 'categoryTier') {
        return [`categoryTier:${p.category}:${[...p.tiers].sort().join('+')}:${p.direction}`];
      }
      if (p.kind === 'katabasis') return p.rolls.map((r) => `katabasis:${r}`);
      return [JSON.stringify(p)];
    });
  }

  it('no seal is dormant, and no lever is pulled by two seals', () => {
    expect(SIGIL_IDS).toHaveLength(72);
    expect(SIGIL_IDS.filter((id) => sigilById(id)!.effect.kind === 'inert')).toEqual([]);
    const owner = new Map<string, number>();
    for (const id of SIGIL_IDS) {
      for (const key of levers(sigilById(id)!.effect)) {
        expect(owner.get(key), `${key} is pulled by #${owner.get(key)} and #${id}`).toBeUndefined();
        owner.set(key, id);
      }
    }
  });

  it('keeps every re-homed seal its Goetia name', () => {
    const names: Readonly<Record<number, string>> = {
      11: 'Gusion',
      13: 'Beleth',
      16: 'Zepar',
      21: 'Marax',
      22: 'Ipos',
      24: 'Naberius',
      40: 'Raum',
      41: 'Focalor',
      45: 'Vine',
      51: 'Balam',
      58: 'Amy',
      64: 'Haures',
      65: 'Andrealphus',
      71: 'Dantalion',
    };
    for (const [id, name] of Object.entries(names)) expect(sigilById(Number(id))!.name).toBe(name);
  });

  it('Gusion #11 lengthens an incoming call’s boons, never its debuffs', () => {
    const strength = sigilStrength(sigilById(11)!, bn(1_000_000));
    const effects = [
      { kind: 'timedMul', field: 'goldGainMul', factor: 1.5, durationSec: 600 },
      { kind: 'timedMul', field: 'influenceGainMul', factor: 0.5, durationSec: 600 },
    ] as const;
    const plain = applyCallEffects(fresh(), effects).lifetime.callBuffs;
    expect(plain.map((b) => b.remainingSeconds)).toEqual([600, 600]);
    const [boon, debuff] = applyCallEffects(bound(11, 1_000_000), effects).lifetime.callBuffs;
    expect(boon!.remainingSeconds).toBeCloseTo(600 * (1 + strength), 6);
    expect(boon!.durationSec).toBeCloseTo(600 * (1 + strength), 6); // the HUD ring reads true
    expect(debuff!.remainingSeconds).toBe(600);
  });

  it('Beleth #13 draws a mourner into the flock for a share of the deaths (rate level, capped)', () => {
    const flock = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, reprobates: 1_000 },
    });
    const p = sigilStrength(sigilById(13)!, bn(1_000_000));
    const base = reprobateRates(flock(fresh()), computeModifiers(flock(fresh())));
    expect(base.generationPerSecond).toBe(0);
    const s = flock(bound(13, 1_000_000));
    const r = reprobateRates(s, computeModifiers(s));
    expect(r.generationPerSecond).toBeCloseTo(p * (r.suicidePerSecond + r.murderPerSecond), 12);
    // An empty flock mourns no one; a vast binding at most replaces the dead.
    const empty = bound(13, 1_000_000);
    expect(reprobateRates(empty, computeModifiers(empty)).generationPerSecond).toBe(0);
    expect(computeModifiers(bound(13, 1e300)).deathRecruitChance).toBe(1);
  });

  it('Zepar #16 accrues Desidia while the game runs (flat, log curve)', () => {
    const rate = 0.001 * Math.log(1 + 1_000_000);
    const s = bound(16, 1_000_000);
    expect(computeModifiers(s).flatDesidiaPerSecond).toBeCloseTo(rate, 9);
    expect(tick(s, 10).state.desidia).toBeCloseTo(10 * rate, 9);
    expect(tick(fresh(), 10).state.desidia).toBe(0);
  });

  it('Marax #21 lengthens each single-use maleficium activation', () => {
    const strength = sigilStrength(sigilById(21)!, bn(1_000_000));
    const withDirt = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, maleficia: ['crossroads_dirt'] },
    });
    expect(maleficiaBuffDuration(fresh())).toBe(MALEFICIA_BUFF_DURATION_SECONDS);
    const r = activateMaleficium(withDirt(bound(21, 1_000_000)), 'crossroads_dirt');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.lifetime.maleficiaBuffs.crossroads_dirt).toBeCloseTo(
      MALEFICIA_BUFF_DURATION_SECONDS * (1 + strength),
      6,
    );
  });

  it('Ipos #22 cuts the gold a Search pours, not the speed it buys', () => {
    const rich = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, gold: bn(10_000), indagatioInvestPercent: 50 },
    });
    const strength = sigilStrength(sigilById(22)!, bn(1_000_000));
    expect(indagatioInvestmentCost(rich(fresh())).toNumber()).toBe(5_000);
    const ipos = rich(bound(22, 1_000_000));
    expect(indagatioInvestmentCost(ipos).toNumber()).toBe(Math.ceil(5_000 / (1 + strength)));
    const plain = startAction(rich(fresh()), 'indagatio');
    const cut = startAction(ipos, 'indagatio');
    if (!plain.ok || !cut.ok) throw new Error('start failed');
    expect(plain.state.lifetime.gold.toNumber()).toBe(5_000);
    expect(cut.state.lifetime.gold.toNumber()).toBe(10_000 - Math.ceil(5_000 / (1 + strength)));
    // The efficiency bonus (and so the search time) still reads the whole 5,000-gold share.
    expect(cut.state.lifetime.actionQueue[0]!.remainingSeconds).toBeCloseTo(
      plain.state.lifetime.actionQueue[0]!.remainingSeconds,
      9,
    );
  });

  it('Naberius #24 and Dantalion #71 seed each new lifetime (flat, on top of the carry-over)', () => {
    let s = { ...fresh(), souls: bn(2_000_000) };
    s = bindSigil(s, 24, 1_000_000);
    s = bindSigil(s, 71, 1_000_000);
    s = { ...s, lifetime: { ...s.lifetime, gold: bn(1_000), reprobates: 1_000 } };
    const seedGold = Math.floor(100 * Math.log(1 + 1_000_000));
    const seedRepro = Math.floor(10 * Math.log(1 + 1_000_000));
    const { state, recap } = commitKatabasis(enterKatabasis(s));
    expect(state.lifetime.gold.toNumber()).toBe(Math.floor(1_000 * 0.05) + seedGold);
    expect(state.lifetime.reprobates).toBe(Math.floor(1_000 * 0.05) + seedRepro);
    expect(recap.goldKept.toNumber()).toBe(state.lifetime.gold.toNumber());
    expect(recap.reprobatesKept).toBe(state.lifetime.reprobates);
    // Erinyes's descent keeps no gold at all, the seed included.
    const erinyes = { ...s, lifetime: { ...s.lifetime, pendingErinyes: true } };
    expect(commitKatabasis(enterKatabasis(erinyes)).state.lifetime.gold.toNumber()).toBe(0);
  });

  it('Raum #40 mints gold with every soul a death yields', () => {
    const bounty = Math.log(1 + 1_000_000);
    expect(mintSouls(fresh(), 10).lifetime.gold.toNumber()).toBe(0);
    const s = mintSouls(bound(40, 1_000_000), 10);
    expect(s.souls.toNumber()).toBe(10);
    expect(s.lifetime.gold.toNumber()).toBeCloseTo(10 * bounty, 6);
    // A Good Suggestion's suicides pay it too (they mint through the same helper).
    const flock = { ...bound(40, 1_000_000), lifetime: { ...bound(40, 1_000_000).lifetime } };
    flock.lifetime.reprobates = 100;
    const good = resolveSuggestion(flock, 'good', makeRng(1));
    expect(good.lifetime.gold.toNumber()).toBeCloseTo(good.souls.toNumber() * bounty, 6);
  });

  it('Focalor #41 drowns a share of the flock the descent leaves behind, one soul each', () => {
    let s = bound(41, 1_000_000);
    s = { ...s, lifetime: { ...s.lifetime, reprobates: 1_000 } };
    const share = Math.log(1 + 1_000_000) / 100;
    const kept = Math.floor(1_000 * 0.05);
    const drowned = Math.floor((1_000 - kept) * share);
    const { state, recap } = commitKatabasis(enterKatabasis(s));
    expect(drowned).toBeGreaterThan(0);
    expect(state.lifetime.reprobates).toBe(kept); // the kept are spared
    expect(state.souls.toNumber()).toBe(drowned);
    expect(recap.soulsCarried.toNumber()).toBe(drowned);
    const plain = { ...fresh(), lifetime: { ...fresh().lifetime, reprobates: 1_000 } };
    expect(commitKatabasis(enterKatabasis(plain)).state.souls.toNumber()).toBe(0);
  });

  it('Vine #45 cuts the gold Indagatio’s failure tiers bite', () => {
    const rich = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, gold: bn(1_000) },
    });
    const cut = 1 / (1 + sigilStrength(sigilById(45)!, bn(1_000_000)));
    const rng = (): Rng => makeRng(7);
    const plain = resolveIndagatio(rich(fresh()), 'terrible', rng()).state.lifetime.gold;
    const vine = resolveIndagatio(rich(bound(45, 1_000_000)), 'terrible', rng()).state.lifetime
      .gold;
    expect(plain.toNumber()).toBeCloseTo(1_000 * (1 - 0.15), 6);
    expect(vine.toNumber()).toBeCloseTo(1_000 * (1 - 0.15 * cut), 6);
  });

  it('Balam #51 cuts the reprobates Logos’s failures take', () => {
    const flock = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, reprobates: 1_000 },
    });
    const cut = 1 / (1 + sigilStrength(sigilById(51)!, bn(1_000_000)));
    expect(logosLossMul(bound(51, 1_000_000))).toBeCloseTo(cut, 12);
    const rng = (): Rng => makeRng(7);
    expect(resolveSuggestion(flock(fresh()), 'terrible', rng()).lifetime.reprobates).toBe(950);
    expect(
      resolveSuggestion(flock(bound(51, 1_000_000)), 'terrible', rng()).lifetime.reprobates,
    ).toBe(1_000 - Math.floor(1_000 * 0.05 * cut));
    // A Bad rejection rounds after the cut, so a light binding keeps a one-unit loss, a runner's
    // floored zero stays zero, and an uncut loss is the old floor exactly.
    expect(logosBadLoss(1, 1, 1)).toBe(1);
    expect(logosBadLoss(1, 1, 0.8)).toBe(1);
    expect(logosBadLoss(4, 1, 0.8)).toBe(3);
    expect(logosBadLoss(1, 0.33, 1)).toBe(0);
  });

  it('Amy #58 returns part of a failed Emptio deal and softens the bait', () => {
    const listed = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, gold: bn(10_000), emptioList: ['red_robe'] },
    });
    const cut = 1 / (1 + sigilStrength(sigilById(58)!, bn(1_000_000)));
    const back = Math.floor(1_000 * (1 - cut));
    const gold = (s: GameState, tier: 'bad' | 'terrible' | 'apocalyptic'): number =>
      resolveEmptio(s, tier, 'red_robe', 1_000).state.lifetime.gold.toNumber();
    expect(gold(listed(fresh()), 'bad')).toBe(10_000);
    expect(gold(listed(bound(58, 1_000_000)), 'bad')).toBe(10_000 + back);
    expect(gold(listed(bound(58, 1_000_000)), 'terrible')).toBe(10_000 + back);
    expect(gold(listed(fresh()), 'apocalyptic')).toBeCloseTo(5_000, 6);
    expect(gold(listed(bound(58, 1_000_000)), 'apocalyptic')).toBeCloseTo(
      10_000 * (1 - 0.5 * cut) + back,
      6,
    );
  });

  it('Haures #64 burns a share of what Logos’s failures take into souls', () => {
    const flock = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, reprobates: 1_000 },
    });
    const p = sigilStrength(sigilById(64)!, bn(1_000_000));
    const rng = (): Rng => makeRng(7);
    expect(resolveSuggestion(flock(fresh()), 'terrible', rng()).souls.toNumber()).toBe(0);
    const burned = resolveSuggestion(flock(bound(64, 1_000_000)), 'apocalyptic', rng());
    expect(burned.lifetime.reprobates).toBe(750); // the loss itself is unchanged
    expect(burned.souls.toNumber()).toBe(Math.floor(250 * p));
  });

  it('Andrealphus #65 lifts the whole invoking power by a percentage', () => {
    const relics = ['crow_feather', 'the_dadu', 'hollow_effigy', 'red_robe', 'ars_serpens'];
    const armed = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, maleficia: relics },
    });
    const base = currentInvokingPower(armed(fresh()));
    expect(base).toBe(6);
    const strength = sigilStrength(sigilById(65)!, bn(1e9));
    expect(currentInvokingPower(armed(bound(65, 1e9)))).toBe(Math.round(6 * (1 + strength)));
    expect(currentInvokingPower(bound(65, 1e9))).toBe(0); // a percentage of nothing is nothing
  });

  it('the re-homed seals draw no RNG (ADR-011: the stream stays byte-identical)', () => {
    const ids = [11, 13, 16, 21, 22, 24, 40, 41, 45, 51, 58, 64, 65, 71];
    let s: GameState = { ...fresh(), souls: bn(14e9) };
    for (const id of ids) s = bindSigil(s, id, 1e9);
    const withFlock = (g: GameState): GameState => ({
      ...g,
      lifetime: { ...g.lifetime, reprobates: 1_000, influence: bn(100) },
    });
    for (const tier of ['good', 'bad', 'terrible', 'apocalyptic'] as const) {
      const a = makeRng(fresh().rngState);
      resolveAction(withFlock(s), 'suggestion', a, { forcedTier: tier, efficiency: 1 });
      const b = makeRng(fresh().rngState);
      resolveAction(withFlock(fresh()), 'suggestion', b, { forcedTier: tier, efficiency: 1 });
      expect(a.state).toBe(b.state);
    }
    expect(tick(withFlock(s), 1).state.rngState).toBe(tick(withFlock(fresh()), 1).state.rngState);
  });
});

describe('sigilEffectMulFor: one seal\u2019s live stack multiplier (balance audit 2026-10-08)', () => {
  it('mirrors sigilEffectStack: Semet reads the relics, Gaap the relics × Semet, the rest the full mul', () => {
    let s = maxSinsTo({ ...fresh(), souls: bn(3e9) }, 2); // Semet's gate
    s = bindSigil(s, 32, 1e9);
    s = bindSigil(s, 33, 1e9);
    s = bindSigil(s, 6, 1e9);
    s = { ...s, lifetime: { ...s.lifetime, maleficia: ['solomons_ring', 'picatrix'] } };
    const raw = 1 + 0.66 + 0.11;
    const semet = sigilStrength(sigilById(32)!, bn(1e9)) * raw;
    expect(sigilEffectMulFor(s, sigilById(32)!)).toBeCloseTo(raw, 9);
    expect(sigilEffectMulFor(s, sigilById(33)!)).toBeCloseTo(raw * (1 + semet), 9);
    expect(sigilEffectMulFor(s, sigilById(6)!)).toBeCloseTo(sigilEffectStack(s).sigilMul, 9);
    // The ledger number for Valefor is then exactly the lift the bundle applies.
    const shown = sigilStrength(sigilById(6)!, bn(1e9)) * sigilEffectMulFor(s, sigilById(6)!);
    const skillsOnly = computeModifiers({ ...s, sigilBindings: {} }).goldRateMul;
    expect(computeModifiers(s).goldRateMul / skillsOnly).toBeCloseTo(1 + shown, 6);
  });

  it('is 1 for every seal with no relic, Semet or Gaap in play', () => {
    const s = bound(6, 1_000);
    for (const id of [6, 32, 33, 48]) expect(sigilEffectMulFor(s, sigilById(id)!)).toBe(1);
  });
});
