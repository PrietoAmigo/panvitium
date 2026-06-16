/**
 * Sigil tests (02 §5, 03 §5). Pins:
 *   - binding curves (sqrt default, linear, log) and zero/negative handling
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
  invocationById,
  invocationRunnerEfficiency,
  invocationSoulCost,
  invocationUpkeep,
  makeRng,
  NEUTRAL_MODIFIERS,
  remainingGoldFraction,
  reprobateRates,
  resolveAction,
  resolveIndagatio,
  divestFraction,
  sigilById,
  sigilCategoryTierContributions,
  sigilCostReductionByChannel,
  sigilIndagatioDoubleFindChance,
  sigilInvocationEffectContributions,
  sigilInvokingPower,
  sigilKatabasisBonus,
  sigilModifierContributions,
  sigilMurderTriggersSuicideChance,
  sigilOfflineAccrualWindowMul,
  sigilOfflineActionEfficiencyMul,
  sigilOfflineResourceMul,
  sigilShutdownRefundMul,
  sigilStrength,
  sigilVisible,
  SIGIL_IDS,
  SINS,
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
  it('sqrt is the default and grows gently', () => {
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
  it('lists the wired subset in ascending id order', () => {
    expect(SIGIL_IDS).toEqual([...SIGIL_IDS].sort((a, b) => a - b));
    expect(SIGIL_IDS).toContain(32); // Semet
    expect(SIGIL_IDS).toContain(6); // Valefor
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
    expect(sigilStrength(valefor, bn(10_000))).toBeCloseTo(valefor.coefficient * 100, 6);
  });
});

describe('In-lifetime modifier contributions', () => {
  it('Valefor #6 lifts gold rate by (1 + strength)', () => {
    const base = computeModifiers(fresh()).goldRateMul;
    const s = bound(6, 10_000);
    const strength = sigilStrength(sigilById(6)!, bn(10_000));
    expect(computeModifiers(s).goldRateMul).toBeCloseTo(base * (1 + strength), 6);
  });

  it('Amy #58 (the cursed sigil) divides Indagatio AND Emptio efficiency by (1 + strength)', () => {
    const s = bound(58, 1_000_000);
    const strength = sigilStrength(sigilById(58)!, bn(1_000_000));
    const m = computeModifiers(s);
    expect(m.indagatioEfficiencyMul).toBeCloseTo(1 / (1 + strength), 6);
    expect(m.emptioEfficiencyMul).toBeCloseTo(1 / (1 + strength), 6);
    expect(m.indagatioEfficiencyMul).toBeLessThan(1);
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
    // Aamon #7 lifts generation; the cursed Amy #58 has no generation leg, so compose Aamon with
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

  it('Marax #21 lifts offline ACTION-timer advancement, not the offline time multiplier', () => {
    const s = bound(21, 10_000);
    const strength = sigilStrength(sigilById(21)!, bn(10_000));
    expect(sigilOfflineActionEfficiencyMul(s)).toBeCloseTo(1 + strength, 6);
    expect(computeModifiers(s).offlineTimeMul).toBe(1);
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
    expect(m.vitiumMercaturaOutputMul).toBe(NEUTRAL_MODIFIERS.vitiumMercaturaOutputMul);
    expect(m.acolyteEfficiencyMul).toBeCloseTo(NEUTRAL_MODIFIERS.acolyteEfficiencyMul, 6);
  });
});

describe('Katabasis carry-over bonuses', () => {
  it('Purson #20 adds to the remaining-gold fraction', () => {
    const baseFrac = remainingGoldFraction(fresh());
    const s = bound(20, 10_000);
    const bonus = sigilKatabasisBonus(s, 'gold');
    expect(bonus).toBeCloseTo(sigilStrength(sigilById(20)!, bn(10_000)), 6);
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
  it('Andrealphus #65 adds rounded invoking power, counting toward the invocation gates', () => {
    expect(sigilInvokingPower(fresh())).toBe(0);
    // Sheet rev: 0.0001 × sqrt(1e8) = 1 → +1 invoking power.
    expect(sigilInvokingPower(bound(65, 100_000_000))).toBe(1);
    // 0.0001 × sqrt(4e8) = 2 → +2.
    expect(sigilInvokingPower(bound(65, 400_000_000))).toBe(2);
    // Small bindings round down to 0.
    expect(sigilInvokingPower(bound(65, 100))).toBe(0);
    // Folds into the gate total (no maleficia here, so it is the whole of it).
    expect(currentInvokingPower(bound(65, 100_000_000))).toBe(1);
  });

  it('Forneus #30 joins the invoking-power channel on a log curve (sheet rev 2026-06-12)', () => {
    // 0.5 × ln(1e8 + 1) ≈ 9.21 → rounds to 9.
    expect(sigilInvokingPower(bound(30, 100_000_000))).toBe(9);
  });
});

describe('Cost-reduction sigils (S8)', () => {
  it('sigilCostReductionByChannel yields per-channel (1 + strength) divisors', () => {
    expect(sigilCostReductionByChannel(fresh())).toEqual({});
    // Paimon 5e-05 × sqrt(4e8) = 1 → factor 2; Orobas 0.0001 × sqrt(1e8) = 1 → factor 2.
    expect(sigilCostReductionByChannel(bound(9, 400_000_000)).influence).toBeCloseTo(2, 6);
    expect(sigilCostReductionByChannel(bound(55, 100_000_000)).invocationSoul).toBeCloseTo(2, 6);
    // Amy #58 is no longer a cost-reduction sigil (sheet rev: a cursed efficiency penalty).
    expect(sigilCostReductionByChannel(bound(58, 1_000_000)).emptioGold).toBeUndefined();
  });

  it('Paimon #9 softens action influence costs (never increasing them)', () => {
    const seed = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, influence: bn(100) },
    });
    const base = startAction(seed(fresh()), 'suggestion', { efficiency: 1 });
    const paimon = startAction(seed(bound(9, 400_000_000)), 'suggestion', { efficiency: 1 });
    if (!base.ok || !paimon.ok) throw new Error('start failed');
    expect(100 - base.state.lifetime.influence.toNumber()).toBe(5); // ceil(5 × 1)
    expect(100 - paimon.state.lifetime.influence.toNumber()).toBe(3); // ceil(5 / 2)
  });

  it('Orobas #55 softens the one-time invocation soul cost (Morpheus 90% of pool)', () => {
    // Normals no longer carry a soul cost (per-second upkeep instead); Morpheus is the only
    // soul-cost invocation. Its cost is 90% of the current pool; Orobas #55 halves it.
    const morpheus = invocationById('morpheus')!;
    const withPool = (s: GameState): GameState => ({ ...s, souls: bn(1000) });
    expect(invocationSoulCost(withPool(fresh()), morpheus).toNumber()).toBe(900); // 90% of 1000
    expect(invocationSoulCost(withPool(bound(55, 100_000_000)), morpheus).toNumber()).toBe(450); // halved
  });

  it('Orobas #55 also softens flat invocation upkeep (cost of all invocations)', () => {
    // An active Imp drains 10 gold/s flat; Orobas halves it. %-of-gain apex costs stay untouched.
    const withImp = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, invocations: { imp: 1 } },
    });
    expect(invocationUpkeep(withImp(fresh()), 0).flatGoldPerSecond).toBe(10);
    expect(invocationUpkeep(withImp(bound(55, 100_000_000)), 0).flatGoldPerSecond).toBeCloseTo(
      5,
      6,
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
    // 0.0001 × sqrt(1e8) = 1 → ×2.
    const { scalar } = sigilModifierContributions(bound(23, 100_000_000));
    expect(scalar.murderRateMul).toBeCloseTo(2, 6);
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
    // 0.0001 × sqrt(1e8) = 1, clamped; 0.0001 × sqrt(2.5e7) = 0.5.
    expect(sigilIndagatioDoubleFindChance(bound(49, 100_000_000))).toBe(1);
    expect(sigilIndagatioDoubleFindChance(bound(49, 25_000_000))).toBeCloseTo(0.5, 6);
  });

  it('a bound Crocell surfaces two maleficia where one would be found', () => {
    expect(resolveIndagatio(fresh(), 'stellar', makeRng(3)).surfaced).toHaveLength(1);
    expect(resolveIndagatio(bound(49, 100_000_000), 'stellar', makeRng(3)).surfaced).toHaveLength(
      2,
    );
  });
});

describe('Offline resource-rate sigils (S13)', () => {
  it('Sallos #19 (gold), Eligos #15 (influence), Zepar #16 (generation) are offline-only', () => {
    expect(sigilById(19)!.effect).toEqual({ kind: 'offlineResource', resource: 'gold' });
    expect(sigilById(15)!.effect).toEqual({ kind: 'offlineResource', resource: 'influence' });
    expect(sigilById(16)!.effect).toEqual({ kind: 'offlineResource', resource: 'generation' });
    expect(sigilOfflineResourceMul(fresh())).toEqual({ gold: 1, influence: 1, generation: 1 });
    // 0.0001 × sqrt(1e8) = 1 → ×2 on the matching resource only.
    const g = sigilOfflineResourceMul(bound(19, 100_000_000));
    expect(g.gold).toBeCloseTo(2, 6);
    expect(g.influence).toBe(1);
    const i = sigilOfflineResourceMul(bound(15, 100_000_000));
    expect(i.influence).toBeCloseTo(2, 6);
    expect(i.gold).toBe(1);
    const z = sigilOfflineResourceMul(bound(16, 100_000_000));
    expect(z.generation).toBeCloseTo(2, 6);
    expect(z.gold).toBe(1);
  });

  it('the tick honours the offline income multipliers (online ticks pass nothing)', () => {
    const s = fresh();
    const baseGoldGain = (dt: number, mul?: number): number => {
      const after = tick(s, dt, mul === undefined ? {} : { offlineGoldMul: mul }).state;
      return after.lifetime.gold.toNumber() - s.lifetime.gold.toNumber();
    };
    expect(baseGoldGain(10, 2)).toBeCloseTo(baseGoldGain(10) * 2, 6);

    // Influence: a short span so the maxInfluence cap isn't reached; the boost doubles the gain.
    const infGain = (mul?: number): number =>
      tick(
        s,
        0.001,
        mul === undefined ? {} : { offlineInfluenceMul: mul },
      ).state.lifetime.influence.toNumber() - s.lifetime.influence.toNumber();
    expect(infGain()).toBeGreaterThan(0);
    expect(infGain(2)).toBeCloseTo(infGain() * 2, 6);
  });
});

describe('Vitium Compositum output sigil (S14)', () => {
  it('Zagan #61 lifts Compositum gold output', () => {
    expect(sigilById(61)!.effect).toEqual({
      kind: 'modifier',
      field: 'vitiumCompositumOutputMul',
      direction: 'increase',
    });
    expect(sigilById(61)!.name).toBe('Zagan');
    // 0.0001 × sqrt(1e8) = 1 → ×2 on the field.
    expect(computeModifiers(bound(61, 100_000_000)).vitiumCompositumOutputMul).toBeCloseTo(2, 6);
    expect(computeModifiers(fresh()).vitiumCompositumOutputMul).toBe(1);
  });

  it('scales gold income from an active Compositum toggle', () => {
    // charity produces 200 gold/s but needs 100 gold + 25 influence/s upkeep; stock both so it
    // stays active, and force it on without going through activateToggle for the test.
    const withToggle = (s: GameState): GameState => ({
      ...s,
      lifetime: {
        ...s.lifetime,
        activeToggles: ['charity'],
        gold: bn(10_000),
        influence: bn(100),
      },
    });
    const gain = (s: GameState): number => {
      const after = tick(s, 1).state;
      return after.lifetime.gold.toNumber() - s.lifetime.gold.toNumber();
    };
    const base = gain(withToggle(fresh()));
    const zagan = gain(withToggle(bound(61, 100_000_000)));
    // Compositum's 200 gold/s doubles; base income and the upkeep leg are unaffected.
    expect(zagan).toBeCloseTo(base + 200, 6);
  });

  it('Orias #59 lifts the VC INFLUENCE line; Zagan leaves it alone (sheet rev 2026-06-12)', () => {
    // gala: 250 gold/s upkeep → 20 influence/s. Orias at strength 1 doubles the 20.
    const withGala = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, activeToggles: ['gala'], gold: bn(100_000) },
    });
    const inflGain = (s: GameState): number =>
      tick(s, 1).state.lifetime.influence.toNumber() - s.lifetime.influence.toNumber();
    const base = inflGain(withGala(fresh()));
    const orias = inflGain(withGala(bound(59, 100_000_000)));
    const zagan = inflGain(withGala(bound(61, 100_000_000)));
    expect(orias).toBeCloseTo(base + 20, 4); // the 20/s VC line doubles
    expect(zagan).toBeCloseTo(base, 4); // the gold-output sigil leaves influence alone
  });

  it('Sitri #12 scales Mercatus GENERATION; Vapula #60 scales revenue only', () => {
    const withTrade = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, mercatusDepths: { gula: 5 } },
    });
    const genOf = (s: GameState): number =>
      reprobateRates(s, computeModifiers(s)).generationPerSecond;
    const base = genOf(withTrade(fresh()));
    const sitri = genOf(withTrade(bound(12, 100_000_000))); // strength 1 → ×2
    const vapula = genOf(withTrade(bound(60, 100_000_000)));
    expect(sitri).toBeCloseTo(base * 2, 6);
    expect(vapula).toBeCloseTo(base, 6); // revenue sigil no longer leaks into breeding
  });
});

describe('Per-invocation effectiveness sigils (S15)', () => {
  const withInv = (s: GameState, id: string, n = 1): GameState => ({
    ...s,
    lifetime: { ...s.lifetime, invocations: { ...s.lifetime.invocations, [id]: n } },
  });

  it('Buer #10 (familiar) scales a named invocation by id; Sitri left the channel', () => {
    expect(sigilById(10)!.effect).toEqual({ kind: 'invocationEffect', invocation: 'familiar' });
    expect(sigilById(12)!.effect.kind).toBe('modifier'); // Sitri → VM generation (sheet rev)
    const c = sigilInvocationEffectContributions(bound(10, 100_000_000));
    expect(c.familiar).toBeCloseTo(2, 6); // 0.0001 × sqrt(1e8) = 1 → ×2
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
    // 0.0001 × sqrt(2.5e7) = 0.5 → suicides/s gain half the murder rate.
    const s = {
      ...bound(14, 25_000_000),
      lifetime: { ...bound(14, 25_000_000).lifetime, reprobates: 1000 },
    };
    const mods = computeModifiers(s);
    expect(mods.murderTriggersSuicideChance).toBeCloseTo(0.5, 6);
    const rates = reprobateRates(s, mods);
    const baseState = { ...fresh(), lifetime: { ...fresh().lifetime, reprobates: 1000 } };
    const baseRates = reprobateRates(baseState, computeModifiers(baseState));
    expect(rates.murderPerSecond).toBeCloseTo(baseRates.murderPerSecond, 9);
    expect(rates.suicidePerSecond).toBeCloseTo(
      baseRates.suicidePerSecond + 0.5 * rates.murderPerSecond,
      9,
    );
  });

  it('Vine #45 raises the Mercatus divest fraction, clamped to ≤ 1; Furcas composes', () => {
    expect(sigilById(45)!.effect).toEqual({ kind: 'shutdownRefund' });
    // 0.0001 × sqrt(1e8) = 1 → ×2.
    expect(sigilShutdownRefundMul(bound(45, 100_000_000))).toBeCloseTo(2, 6);
    expect(divestFraction(fresh())).toBeCloseTo(0.25, 6); // base fraction
    expect(divestFraction(bound(45, 100_000_000))).toBeCloseTo(0.5, 6); // 0.25 × 2
    expect(divestFraction(bound(45, 1e18))).toBe(1); // clamp: never refund more than was invested
    // Vine + Furcas on the same channel compose multiplicatively.
    let both = fresh();
    both = { ...both, souls: bn(200_000_000) };
    both = bindSigil(both, 45, 100_000_000);
    both = bindSigil(both, 50, 100_000_000);
    expect(sigilShutdownRefundMul(both)).toBeCloseTo(4, 6);
  });

  it('Semet #32 scales the other sigils; Gaap #33 inflates the maleficia enhancer stack', () => {
    // Valefor at 1e8 has strength 1 (gold ×2). With Semet bound at 5 832 000 souls
    // (ln(5 832 001) × 0.01 ≈ 0.1561), the Valefor strength reads ×(1 + semet).
    let s = fresh();
    s = { ...s, souls: bn(200_000_000) };
    s = maxSinsTo(s, 2); // Semet gate (this also wakes the Sin skills, e.g. the Golden Hand)
    const skillBase = computeModifiers(s).goldRateMul; // skills only, no sigils
    s = bindSigil(s, 6, 100_000_000);
    const without = computeModifiers(s).goldRateMul;
    const withSemet = computeModifiers(bindSigil(s, 32, 5_832_000)).goldRateMul;
    const semetBonus = 0.01 * Math.log(5_832_001);
    expect(without / skillBase).toBeCloseTo(2, 6); // Valefor strength 1 → ×2
    expect(withSemet / skillBase).toBeCloseTo(1 + 1 * (1 + semetBonus), 4);
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
    // Malphas at 1e8 → chance 1 (clamped). A Good Suggestion adds 1 reprobate per pass → 2 total.
    const s = bound(39, 100_000_000);
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

  it('Foras #31 extends the offline accrual window; Marax #21 speeds offline action timers', () => {
    expect(sigilOfflineAccrualWindowMul(fresh())).toBe(1);
    // 2.5e-05 × sqrt(1e8) = 0.25 → ×1.25 on the seven-day cap.
    expect(sigilOfflineAccrualWindowMul(bound(31, 100_000_000))).toBeCloseTo(1.25, 6);
    // Marax: the tick advances action timers faster when the dep is passed.
    const queued: GameState = {
      ...bound(21, 100_000_000),
      lifetime: {
        ...bound(21, 100_000_000).lifetime,
        actionQueue: [{ actionId: 'indagatio', remainingSeconds: 100 }],
      },
    };
    const mul = sigilOfflineActionEfficiencyMul(queued); // 1 + 1 = 2
    expect(mul).toBeCloseTo(2, 6);
    const after = tick(queued, 10, { offlineActionTimeMul: mul }).state;
    expect(after.lifetime.actionQueue[0]!.remainingSeconds).toBeCloseTo(80, 6); // 100 − 10×2
    const online = tick(queued, 10).state;
    expect(online.lifetime.actionQueue[0]!.remainingSeconds).toBeCloseTo(90, 6); // dep absent
  });
});
