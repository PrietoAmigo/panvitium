/**
 * Sin-effect parity tests (Sins & Devotion sheet rev 2026-06-12):
 *   - Luxuria's **Seduction** skill lifts `reprobateGenerationRateMul` by (1 + intensity).
 *   - Tristitia's **Resignation** skill lifts `acolyteEfficiencyMul` by (1 + intensity).
 *   - Ira's **Retribution** skill lifts `invocationEfficiencyMul` by (1 + intensity).
 *   - Acedia's **Procrastination** skill lifts the static `offlineTimeMul` by (1 + intensity).
 *   - Acedia's **per-level** applies the dynamic `1.0000002^(s · L²)` compound on the offline
 *     duration used by `resumeGame` (lives in session.ts, not the static bundle).
 *
 * Each effect is multiplicative on the prior NEUTRAL baseline.
 */
import { describe, expect, it } from 'vitest';
import {
  bn,
  computeModifiers,
  createInitialState,
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

  it('Ira LEVELS lift Decimatio efficiency ×2 per level (and not player efficiency)', () => {
    const s = withSinLevel(fresh(), 'ira', 3);
    expect(sinLevel(s.devotion.ira)).toBe(3);
    const m = computeModifiers(s);
    expect(m.decimatioEfficiencyMul / computeModifiers(fresh()).decimatioEfficiencyMul).toBeCloseTo(
      2 ** 3,
      6,
    );
    const base = computeModifiers(fresh()).playerEfficiencyMul;
    expect(m.playerEfficiencyMul).toBe(base);
  });

  it('Luxuria LEVELS lift Suasio efficiency ×2 per level', () => {
    const base = computeModifiers(fresh()).suasioEfficiencyMul;
    const lifted = computeModifiers(withSinLevel(fresh(), 'luxuria', 2)).suasioEfficiencyMul;
    expect(lifted / base).toBeCloseTo(4, 6);
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
