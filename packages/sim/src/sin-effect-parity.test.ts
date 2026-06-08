/**
 * Sin-effect parity tests (03 §1). Pins the four effects that were missing per the Phase-5 audit:
 *   - Luxuria's **Seduction** skill lifts `reprobateGenerationRateMul` by (1 + intensity).
 *   - Ira's **per-level** lifts `acolyteEfficiencyMul` AND `invocationEfficiencyMul` ×1.33 per level.
 *   - Acedia's **Procrastination** skill lifts the static `offlineTimeMul` by (1 + intensity).
 *   - Acedia's **per-level** applies a dynamic `1.00002^(X · L²)` compound on the offline duration
 *     used by `resumeGame` (lives in session.ts, not the static bundle).
 *
 * Each effect is multiplicative on the prior NEUTRAL baseline. Magnitudes are placeholders.
 */
import { describe, expect, it } from 'vitest';
import {
  bn,
  computeModifiers,
  createInitialState,
  IRA_ACOLYTE_INVOCATION_PER_LEVEL,
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

describe('Ira — per-level lifts acolyte AND invocation efficiency by ×1.33/level', () => {
  it('NEUTRAL: acolyte 0.33×, invocation 1×', () => {
    const m = computeModifiers(fresh());
    expect(m.acolyteEfficiencyMul).toBeCloseTo(0.33, 9);
    expect(m.invocationEfficiencyMul).toBe(1);
  });

  it('Ira level 1: ×1.33 on both channels', () => {
    const s = withSinLevel(fresh(), 'ira', 1);
    expect(sinLevel(s.devotion.ira)).toBe(1);
    const m = computeModifiers(s);
    expect(m.acolyteEfficiencyMul).toBeCloseTo(0.33 * IRA_ACOLYTE_INVOCATION_PER_LEVEL, 9);
    expect(m.invocationEfficiencyMul).toBeCloseTo(IRA_ACOLYTE_INVOCATION_PER_LEVEL, 9);
  });

  it('Ira level 3: compounds to ×1.33^3 on both channels', () => {
    const s = withSinLevel(fresh(), 'ira', 3);
    expect(sinLevel(s.devotion.ira)).toBe(3);
    const m = computeModifiers(s);
    const factor = IRA_ACOLYTE_INVOCATION_PER_LEVEL ** 3;
    expect(m.acolyteEfficiencyMul).toBeCloseTo(0.33 * factor, 6);
    expect(m.invocationEfficiencyMul).toBeCloseTo(factor, 6);
  });

  it('Ira Devotion does NOT touch player efficiency (the boost is delegated-only)', () => {
    const base = computeModifiers(fresh()).playerEfficiencyMul;
    const lifted = computeModifiers(withSinLevel(fresh(), 'ira', 3)).playerEfficiencyMul;
    expect(lifted).toBe(base);
  });
});

describe('Acedia — Procrastination skill lifts the STATIC offlineTimeMul', () => {
  it('NEUTRAL: 1×', () => {
    expect(computeModifiers(fresh()).offlineTimeMul).toBe(1);
  });

  it('with Acedia Devotion, offlineTimeMul ×(1 + Procrastination intensity)', () => {
    const dev = 1_000_000;
    const s = withDevotion(fresh(), 'acedia', dev);
    const intensity = skillIntensity(bn(dev));
    expect(intensity).toBeGreaterThan(0);
    expect(computeModifiers(s).offlineTimeMul).toBeCloseTo(1 + intensity, 9);
  });
});
