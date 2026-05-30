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
  NEUTRAL_MODIFIERS,
  remainingGoldFraction,
  sigilById,
  sigilInvokingPower,
  sigilKatabasisBonus,
  sigilModifierContributions,
  sigilStrength,
  sigilVisible,
  SIGIL_IDS,
  SINS,
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
    expect(sigilKatabasisBonus(s, 'unconverted')).toBeGreaterThan(0);
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

describe('Subtype penalty-reduction sigils (S5)', () => {
  const withSubtype = (subtype: 'sigma' | 'celebrity' | 'degenerate' | 'gambler', n: number) => {
    const s = fresh();
    return {
      ...s,
      lifetime: { ...s.lifetime, reprobates: { ...s.lifetime.reprobates, [subtype]: n } },
    };
  };

  it('Gaap #33 softens the Sigma influence penalty (never into a bonus)', () => {
    const s = withSubtype('sigma', 1000);
    const base = computeModifiers(s).influenceRateMul;
    const softened = computeModifiers(bound(33, 1_000_000, s)).influenceRateMul;
    expect(base).toBeLessThan(1); // penalty present
    expect(softened).toBeGreaterThan(base); // softened toward 1
    expect(softened).toBeLessThanOrEqual(1); // but never an outright bonus
  });

  it('Malphas #39 softens the Celebrity gold penalty', () => {
    const s = withSubtype('celebrity', 1000);
    const base = computeModifiers(s).goldRateMul;
    const softened = computeModifiers(bound(39, 1_000_000, s)).goldRateMul;
    expect(softened).toBeGreaterThan(base);
    expect(softened).toBeLessThanOrEqual(1);
  });

  it('Gremory #56 softens the Degenerate suicide penalty (and only suicide)', () => {
    const s = withSubtype('degenerate', 1000);
    const base = computeModifiers(s).reprobateSuicideRateMul;
    const m = computeModifiers(bound(56, 1_000_000, s));
    expect(m.reprobateSuicideRateMul).toBeGreaterThan(base); // suicide penalty eased
    // The Degenerate murder penalty is a different channel — untouched by Gremory.
    expect(m.cholericMurderRateMul).toBeCloseTo(computeModifiers(s).cholericMurderRateMul, 6);
  });

  it('Volac #62 softens the Gambler generation penalty', () => {
    const s = withSubtype('gambler', 1000);
    const base = computeModifiers(s).reprobateGenerationRateMul;
    const softened = computeModifiers(bound(62, 1_000_000, s)).reprobateGenerationRateMul;
    expect(softened).toBeGreaterThan(base);
    expect(softened).toBeLessThanOrEqual(1);
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
