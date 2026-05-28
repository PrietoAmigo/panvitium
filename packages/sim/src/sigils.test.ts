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
  computeModifiers,
  createInitialState,
  NEUTRAL_MODIFIERS,
  remainingGoldFraction,
  sigilById,
  sigilKatabasisBonus,
  sigilModifierContributions,
  sigilStrength,
  sigilVisible,
  SIGIL_IDS,
  SINS,
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
    expect(bindingMagnitude('log', bn(1000))).toBeCloseTo(3, 6);
    expect(bindingMagnitude('log', bn(0))).toBe(0);
    expect(bindingMagnitude('log', bn(1))).toBe(0);
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
