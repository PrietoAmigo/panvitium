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
  applyReprobateDynamics,
  bindingMagnitude,
  bindSigil,
  bn,
  categoryEfficiency,
  categoryTierModifiers,
  computeModifiers,
  createInitialState,
  currentInvokingPower,
  invocationById,
  invocationSoulCost,
  makeRng,
  NEUTRAL_MODIFIERS,
  remainingGoldFraction,
  resolveIndagatio,
  shutdownRefundFraction,
  sigilById,
  sigilCategoryTierContributions,
  sigilMurderGoldPerKill,
  sigilCostReductionByChannel,
  sigilIndagatioDoubleFindChance,
  sigilInvocationEffectContributions,
  sigilInvokingPower,
  sigilKatabasisBonus,
  sigilModifierContributions,
  sigilOfflineResourceMul,
  sigilShutdownRefundMul,
  sigilStrength,
  sigilVisible,
  SIGIL_IDS,
  SINS,
  startAction,
  tick,
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

  it('Semet (#32) is named and gated on all Sins ≥ 2', () => {
    const semet = sigilById(32)!;
    expect(semet.name).toBe('Semet');
    expect(semet.gateAllSinsLevel).toBe(2);
    expect(semet.effect.kind).toBe('katabasis');
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

  it('Zepar #16 (decrease) divides reprobate generation by (1 + strength)', () => {
    const s = bound(16, 1_000_000);
    const strength = sigilStrength(sigilById(16)!, bn(1_000_000));
    const mul = computeModifiers(s).reprobateGenerationRateMul;
    expect(mul).toBeCloseTo(1 / (1 + strength), 6);
    expect(mul).toBeLessThan(1);
  });

  it('Foras #31 (tier decrease) damps the Apocalyptic weight', () => {
    const s = bound(31, 1_000_000);
    const strength = sigilStrength(sigilById(31)!, bn(1_000_000));
    expect(computeModifiers(s).tierWeightMul.apocalyptic).toBeCloseTo(1 / (1 + strength), 6);
  });

  it('two sigils on the same field compose multiplicatively', () => {
    // Valefor #6 and Aim #23 hit different fields; use two gold-rate-ish: bind Valefor twice is not
    // possible (one binding per sigil), so compose Valefor (gold) with Marbas (influence) and check
    // each field independently, plus a same-field pair via Aamon up vs Zepar down on generation.
    let s = fresh();
    s = { ...s, souls: bn(2_000_000) };
    s = bindSigil(s, 7, 10_000); // Aamon: generation up
    s = bindSigil(s, 16, 1_000_000); // Zepar: generation down
    const up = sigilStrength(sigilById(7)!, bn(10_000));
    const down = sigilStrength(sigilById(16)!, bn(1_000_000));
    const expected = (1 + up) * (1 / (1 + down));
    expect(computeModifiers(s).reprobateGenerationRateMul).toBeCloseTo(expected, 5);
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

  it('Marax #21 lifts the offline time multiplier', () => {
    const strength = sigilStrength(sigilById(21)!, bn(10_000));
    expect(computeModifiers(bound(21, 10_000)).offlineTimeMul).toBeCloseTo(1 + strength, 6);
  });

  it('Murmur #54 lifts the overall invocation-effect multiplier', () => {
    const strength = sigilStrength(sigilById(54)!, bn(10_000));
    expect(computeModifiers(bound(54, 10_000)).invocationEfficiencyMul).toBeCloseTo(
      1 + strength,
      6,
    );
  });

  it('Balam #51 damps the Terrible tier weight', () => {
    const strength = sigilStrength(sigilById(51)!, bn(10_000));
    expect(computeModifiers(bound(51, 10_000)).tierWeightMul.terrible).toBeCloseTo(
      1 / (1 + strength),
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

  it('Semet #32 feeds all three rolls', () => {
    const s = bound(32, 10_000, maxSinsTo(fresh(), 4)); // unlocked
    expect(sigilKatabasisBonus(s, 'gold')).toBeGreaterThan(0);
    expect(sigilKatabasisBonus(s, 'maleficia')).toBeGreaterThan(0);
    expect(sigilKatabasisBonus(s, 'reprobate')).toBeGreaterThan(0);
  });

  it('Halphas #38 feeds only the maleficia roll', () => {
    const s = bound(38, 10_000);
    expect(sigilKatabasisBonus(s, 'maleficia')).toBeGreaterThan(0);
    expect(sigilKatabasisBonus(s, 'gold')).toBe(0);
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
  it('Agares #2 lifts Indagatio success tiers and does not leak to other categories', () => {
    const s = bound(2, 10_000);
    const strength = sigilStrength(sigilById(2)!, bn(10_000));
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

  it('Naberius #24 composes onto the Suasio success shift', () => {
    const base = bound(24, 10_000);
    const strength = sigilStrength(sigilById(24)!, bn(10_000));
    // No Devotion here, so the success multiplier is Naberius alone.
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
    // Harpy (Ira) is unaffected by a Vanagloria sigil.
    const harpy = withInv('harpy', 2);
    const harpyBase = computeModifiers(harpy).decimatioEfficiencyMul;
    expect(computeModifiers(bound(26, 100_000, harpy)).decimatioEfficiencyMul).toBeCloseTo(
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

  it('Furfur #34 (Luxuria) amplifies the Succubus Suasio effect', () => {
    const succ = withInv('succubus', 1);
    const base = computeModifiers(succ).suasioEfficiencyMul;
    const boosted = computeModifiers(bound(34, 100_000, succ)).suasioEfficiencyMul;
    expect(boosted).toBeGreaterThan(base);
  });
});

describe('Flat-generator sigils (S6)', () => {
  it('Haagenti #48 generates gold/s on a log curve matching the sheet', () => {
    // Sheet: base coeff 10, N=100 → 10 × ln(101) ≈ 46.151 gold/s.
    const strength = sigilStrength(sigilById(48)!, bn(100));
    expect(strength).toBeCloseTo(10 * Math.log(101), 6);
    const m = computeModifiers(bound(48, 100));
    expect(m.flatGoldPerSecond).toBeCloseTo(10 * Math.log(101), 6);
    expect(m.flatInfluencePerSecond).toBe(0);
  });

  it('Decarabia #69 generates influence/s on a log curve matching the sheet', () => {
    // Sheet: base coeff 1, N=100000 → ln(100001) ≈ 11.513 influence/s.
    const strength = sigilStrength(sigilById(69)!, bn(100_000));
    expect(strength).toBeCloseTo(Math.log(100_001), 6);
    const m = computeModifiers(bound(69, 100_000));
    expect(m.flatInfluencePerSecond).toBeCloseTo(Math.log(100_001), 6);
    expect(m.flatGoldPerSecond).toBe(0);
  });

  it('Haagenti gold flows into the tick (scaled by goldRateMul)', () => {
    const s = bound(48, 100);
    const before = fresh().lifetime.gold.toNumber();
    const after = tick(s, 1).state.lifetime.gold.toNumber();
    // One second of base gold + Haagenti's ~46.15/s (both × goldRateMul = 1 at baseline).
    expect(after - before).toBeGreaterThan(40);
  });
});

describe('Flat invoking-power sigil (S7)', () => {
  it('Andrealphus #65 adds rounded invoking power, counting toward the invocation gates', () => {
    expect(sigilInvokingPower(fresh())).toBe(0);
    // 0.001 × sqrt(1e6) = 1 → +1 invoking power.
    expect(sigilInvokingPower(bound(65, 1_000_000))).toBe(1);
    // 0.001 × sqrt(4e6) = 2 → +2.
    expect(sigilInvokingPower(bound(65, 4_000_000))).toBe(2);
    // Small bindings round down to 0.
    expect(sigilInvokingPower(bound(65, 100))).toBe(0);
    // Folds into the gate total (no maleficia here, so it is the whole of it).
    expect(currentInvokingPower(bound(65, 1_000_000))).toBe(1);
  });
});

describe('Cost-reduction sigils (S8)', () => {
  it('sigilCostReductionByChannel yields per-channel (1 + strength) divisors', () => {
    expect(sigilCostReductionByChannel(fresh())).toEqual({});
    // 0.001 × sqrt(1e6) = 1 → factor 2 on each channel.
    expect(sigilCostReductionByChannel(bound(9, 1_000_000)).influence).toBeCloseTo(2, 6);
    expect(sigilCostReductionByChannel(bound(55, 1_000_000)).invocationSoul).toBeCloseTo(2, 6);
    expect(sigilCostReductionByChannel(bound(58, 1_000_000)).emptioGold).toBeCloseTo(2, 6);
  });

  it('Paimon #9 softens action influence costs (never increasing them)', () => {
    const seed = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, influence: bn(100) },
    });
    const base = startAction(seed(fresh()), 'suggestion', { efficiency: 1 });
    const paimon = startAction(seed(bound(9, 1_000_000)), 'suggestion', { efficiency: 1 });
    if (!base.ok || !paimon.ok) throw new Error('start failed');
    expect(100 - base.state.lifetime.influence.toNumber()).toBe(5); // ceil(5 × 1)
    expect(100 - paimon.state.lifetime.influence.toNumber()).toBe(3); // ceil(5 / 2)
  });

  it('Amy #58 softens Emptio gold cost', () => {
    const seed = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, gold: bn(5000), emptioList: ['ars_serpens'] },
    });
    const base = startAction(seed(fresh()), 'emptio', { target: 'ars_serpens' });
    const amy = startAction(seed(bound(58, 1_000_000)), 'emptio', { target: 'ars_serpens' });
    if (!base.ok || !amy.ok) throw new Error('start failed');
    expect(5000 - base.state.lifetime.gold.toNumber()).toBe(2000); // full cost
    expect(5000 - amy.state.lifetime.gold.toNumber()).toBe(1000); // ceil(2000 / 2)
  });

  it('Orobas #55 softens invocation soul cost (piercing the nominal minimum)', () => {
    const imp = invocationById('imp');
    expect(imp).toBeDefined();
    expect(invocationSoulCost(fresh(), imp!).toNumber()).toBe(100); // minimum
    expect(invocationSoulCost(bound(55, 1_000_000), imp!).toNumber()).toBe(50); // halved
  });
});

describe('Murder-rate sigils (S10)', () => {
  it('Amdusias #67 lifts the overall murder rate; the old murder-bias sigils are now inert', () => {
    expect(sigilById(67)!.effect).toEqual({
      kind: 'modifier',
      field: 'murderRateMul',
      direction: 'increase',
    });
    // Subtype murder-bias sigils were neutralized with subtypes (entries kept, effect inert).
    for (const id of [25, 43, 53, 64]) {
      expect(sigilById(id)!.effect).toEqual({ kind: 'inert' });
    }
    expect(sigilById(25)!.name).toBe('Glasya-Labolas');
    expect(sigilById(64)!.name).toBe('Haures');
  });

  it('Amdusias #67 lifts the murder-rate modifier', () => {
    const { scalar } = sigilModifierContributions(bound(67, 1_000_000));
    expect(scalar.murderRateMul).toBeCloseTo(2, 6);
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
      tiers: ['good'],
      direction: 'increase',
    });
    // Vassago lifts the profane/anathema entry tiers, and only on Indagatio.
    const v = sigilCategoryTierContributions(bound(3, 1_000_000), 'indagatio');
    expect(v.stellar).toBeGreaterThan(1);
    expect(v.excellent).toBeGreaterThan(1);
    expect(v.good).toBeUndefined();
    expect(sigilCategoryTierContributions(bound(3, 1_000_000), 'decimatio')).toEqual({});
    // Stolas lifts the Good (rare) entry.
    expect(sigilCategoryTierContributions(bound(36, 1_000_000), 'indagatio').good).toBeGreaterThan(
      1,
    );
  });

  it('Furcas #50 gives a clamped second-find probability', () => {
    expect(sigilById(50)!.effect).toEqual({ kind: 'indagatioDoubleFind' });
    expect(sigilIndagatioDoubleFindChance(fresh())).toBe(0);
    expect(sigilIndagatioDoubleFindChance(bound(50, 1_000_000))).toBe(1); // 0.001×sqrt(1e6)=1, clamped
    expect(sigilIndagatioDoubleFindChance(bound(50, 250_000))).toBeCloseTo(0.5, 6); // 0.001×500
  });

  it('a bound Furcas surfaces two maleficia where one would be found', () => {
    expect(resolveIndagatio(fresh(), 'stellar', makeRng(3)).surfaced).toHaveLength(1);
    expect(resolveIndagatio(bound(50, 1_000_000), 'stellar', makeRng(3)).surfaced).toHaveLength(2);
  });
});

describe('Offline resource-rate sigils (S13)', () => {
  it('Sallos #19 (gold) and Forneus #30 (influence) give offline-only income multipliers', () => {
    expect(sigilById(19)!.effect).toEqual({ kind: 'offlineResource', resource: 'gold' });
    expect(sigilById(30)!.effect).toEqual({ kind: 'offlineResource', resource: 'influence' });
    expect(sigilOfflineResourceMul(fresh())).toEqual({ gold: 1, influence: 1 });
    // 0.001 × sqrt(1e6) = 1 → ×2 on the matching resource only.
    const g = sigilOfflineResourceMul(bound(19, 1_000_000));
    expect(g.gold).toBeCloseTo(2, 6);
    expect(g.influence).toBe(1);
    const i = sigilOfflineResourceMul(bound(30, 1_000_000));
    expect(i.influence).toBeCloseTo(2, 6);
    expect(i.gold).toBe(1);
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
    // 0.001 × sqrt(1e6) = 1 → ×2 on the field.
    expect(computeModifiers(bound(61, 1_000_000)).vitiumCompositumOutputMul).toBeCloseTo(2, 6);
    expect(computeModifiers(fresh()).vitiumCompositumOutputMul).toBe(1);
  });

  it('scales gold income from an active Compositum toggle', () => {
    // loan-shark-op produces 100 gold/s but needs 10 influence/s upkeep; stock influence so it
    // stays active, and force it on without going through activateToggle for the test.
    const withToggle = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, activeToggles: ['loan-shark-op'], influence: bn(100) },
    });
    const gain = (s: GameState): number => {
      const after = tick(s, 1).state;
      return after.lifetime.gold.toNumber() - s.lifetime.gold.toNumber();
    };
    const base = gain(withToggle(fresh()));
    const zagan = gain(withToggle(bound(61, 1_000_000)));
    // Compositum's 100 gold/s doubles; the BASE_GOLD_PER_SECOND term is unaffected.
    expect(zagan).toBeCloseTo(base + 100, 6);
  });
});

describe('Per-invocation effectiveness sigils (S15)', () => {
  const withInv = (s: GameState, id: string, n = 1): GameState => ({
    ...s,
    lifetime: { ...s.lifetime, invocations: { ...s.lifetime.invocations, [id]: n } },
  });

  it('Buer #10 (familiar) and Sitri #12 (succubus) scale a named invocation by id', () => {
    expect(sigilById(10)!.effect).toEqual({ kind: 'invocationEffect', invocation: 'familiar' });
    expect(sigilById(12)!.effect).toEqual({ kind: 'invocationEffect', invocation: 'succubus' });
    const c = sigilInvocationEffectContributions(bound(10, 1_000_000));
    expect(c.familiar).toBeCloseTo(2, 6); // 0.001 × sqrt(1e6) = 1 → ×2
    expect(Object.keys(c)).toEqual(['familiar']);
  });

  it('Buer lifts player efficiency only when a familiar is present', () => {
    const base = computeModifiers(withInv(fresh(), 'familiar')).playerEfficiencyMul;
    const buer = computeModifiers(withInv(bound(10, 1_000_000), 'familiar')).playerEfficiencyMul;
    expect(buer).toBeGreaterThan(base);
    expect(computeModifiers(bound(10, 1_000_000)).playerEfficiencyMul).toBeCloseTo(
      computeModifiers(fresh()).playerEfficiencyMul,
      9,
    );
  });

  it('Sitri lifts Suasio efficiency only when a succubus is present', () => {
    const base = computeModifiers(withInv(fresh(), 'succubus')).suasioEfficiencyMul;
    const sitri = computeModifiers(withInv(bound(12, 1_000_000), 'succubus')).suasioEfficiencyMul;
    expect(sitri).toBeGreaterThan(base);
    expect(computeModifiers(bound(12, 1_000_000)).suasioEfficiencyMul).toBeCloseTo(
      computeModifiers(fresh()).suasioEfficiencyMul,
      9,
    );
  });
});

describe('Sigil one-offs (S16): murder gold, shutdown refund', () => {
  it('Bael #1 is now inert (its overall-conversion effect was removed with subtypes)', () => {
    expect(sigilById(1)!.effect).toEqual({ kind: 'inert' });
    expect(sigilById(1)!.name).toBe('Bael');
  });

  it('Leraie #14 yields gold on each murder, inert when unbound', () => {
    expect(sigilById(14)!.effect).toEqual({ kind: 'murderGold' });
    expect(sigilMurderGoldPerKill(bound(14, 1_000_000))).toBeCloseTo(1, 6); // 0.001×sqrt(1e6)
    expect(sigilMurderGoldPerKill(fresh())).toBe(0);
    // Seed 5 pending murders against the pool; a tiny step drains only those.
    const seed = (s: GameState): GameState => ({
      ...s,
      lifetime: {
        ...s.lifetime,
        reprobates: 10,
        murderPool: 5,
      },
    });
    const goldAfter = (s: GameState): number =>
      applyReprobateDynamics(seed(s), 1e-6).lifetime.gold.toNumber();
    const base = goldAfter(fresh());
    const leraie = goldAfter(bound(14, 1_000_000));
    expect(leraie - base).toBeCloseTo(5, 6); // 5 murders × 1 gold each
  });

  it('Vine #45 raises the shutdown refund fraction, clamped to ≤ 1', () => {
    expect(sigilById(45)!.effect).toEqual({ kind: 'shutdownRefund' });
    expect(sigilShutdownRefundMul(bound(45, 1_000_000))).toBeCloseTo(2, 6);
    expect(shutdownRefundFraction(fresh())).toBeCloseTo(0.25, 6); // base fraction
    expect(shutdownRefundFraction(bound(45, 1_000_000))).toBeCloseTo(0.5, 6); // 0.25 × 2
    expect(shutdownRefundFraction(bound(45, 1e18))).toBe(1); // clamp: never more than build cost
  });
});
