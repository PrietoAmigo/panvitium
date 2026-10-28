/**
 * Sin-effect parity tests (Sins & Devotion sheet rev 2026-06-12):
 *   - Luxuria's **Seduction** skill lifts `reprobateGenerationRateMul` by (1 + intensity).
 *   - Tristitia's **Resignation** skill lifts `acolyteEfficiencyMul` by (1 + intensity).
 *   - Ira's **Retribution** skill lifts `invocationEfficiencyMul` by (1 + intensity); its LEVELS
 *     each grant one acolyte (ADR-042) and leave the modifier bundle alone.
 *   (Acedia's Sloth effects modified offline gains and are dormant pending the desidia rework,
 *   ADR-032, so there is no Acedia parity case here.)
 *
 * Each effect is multiplicative on the prior NEUTRAL baseline.
 */
import { describe, expect, it } from 'vitest';
import {
  bn,
  computeModifiers,
  createInitialState,
  maxAcolytes,
  sinLevel,
  skillIntensity,
  type GameState,
  type Sin,
} from './index.js';

function fresh(seed = 'sin-effect-parity', t = 0): GameState {
  return createInitialState(seed, t);
}

/** Set a Sin's Devotion to exactly `180^level` souls (gives integer level). */
function withSinLevel(s: GameState, sin: Sin, level: number): GameState {
  return { ...s, devotion: { ...s.devotion, [sin]: bn(180 ** level) } };
}

/** Set a Sin's Devotion to an arbitrary number (for testing skill-intensity effects). */
function withDevotion(s: GameState, sin: Sin, devotion: number): GameState {
  return { ...s, devotion: { ...s.devotion, [sin]: bn(devotion) } };
}

describe('Luxuria — Seduction skill lifts reprobate generation rate', () => {
  it('NEUTRAL: 1× (no Devotion)', () => {
    expect(computeModifiers(fresh()).reprobateGenerationRateMul).toBe(1);
  });

  it('with Luxuria Devotion, gen rate ×(1 + Seduction intensity)', () => {
    const dev = 1_000_000; // arbitrary, well above 1 so ln(dev) > 0
    const s = withDevotion(fresh(), 'luxuria', dev);
    const intensity = skillIntensity(bn(dev));
    expect(intensity).toBeGreaterThan(0);
    expect(computeModifiers(s).reprobateGenerationRateMul).toBeCloseTo(1 + intensity, 9);
  });
});

describe('Tristitia / Ira SKILLS — acolyte and invocation efficiency (sheet rev 2026-06-12)', () => {
  it('NEUTRAL: acolyte 0.33×, invocation 1×', () => {
    const m = computeModifiers(fresh());
    expect(m.acolyteEfficiencyMul).toBeCloseTo(0.33, 9);
    expect(m.invocationEfficiencyMul).toBe(1);
  });

  it("Tristitia's Resignation lifts acolyte efficiency by (1 + intensity), and only that", () => {
    const dev = 1_000_000;
    const s = withDevotion(fresh(), 'tristitia', dev);
    const intensity = skillIntensity(bn(dev));
    const m = computeModifiers(s);
    expect(m.acolyteEfficiencyMul).toBeCloseTo(0.33 * (1 + intensity), 9);
    expect(m.invocationEfficiencyMul).toBe(1);
    expect(m.reprobateSuicideRateMul).toBe(1); // the old suicide coupling is retired
  });

  it("Ira's Retribution lifts invocation efficiency by (1 + intensity), and only that", () => {
    const dev = 1_000_000;
    const s = withDevotion(fresh(), 'ira', dev);
    const intensity = skillIntensity(bn(dev));
    const m = computeModifiers(s);
    expect(m.invocationEfficiencyMul).toBeCloseTo(1 + intensity, 9);
    expect(m.acolyteEfficiencyMul).toBeCloseTo(0.33, 9);
  });

  it('Ira LEVELS grant one acolyte each and touch no modifier (ADR-042)', () => {
    const s = withSinLevel(fresh(), 'ira', 3);
    expect(sinLevel(s.devotion.ira)).toBe(3);
    expect(maxAcolytes(s)).toBe(3);
    // Only the skill (Retribution → invocation efficiency) moves the bundle with Ira Devotion;
    // the levels act through the acolyte cap, not a modifier.
    const { invocationEfficiencyMul: _lifted, ...m } = computeModifiers(s);
    const { invocationEfficiencyMul: _base, ...base } = computeModifiers(fresh());
    expect(m).toEqual(base);
  });

  it('Luxuria LEVELS lift Logos efficiency ×2 per level', () => {
    const base = computeModifiers(fresh()).logosEfficiencyMul;
    const lifted = computeModifiers(withSinLevel(fresh(), 'luxuria', 2)).logosEfficiencyMul;
    expect(lifted / base).toBeCloseTo(4, 6);
  });
});
