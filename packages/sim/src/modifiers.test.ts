import { describe, it, expect } from 'vitest';
import { bn } from './bignum.js';
import { createInitialState, type GameState } from './state.js';
import { computeModifiers, playerEfficiency, NEUTRAL_MODIFIERS } from './modifiers.js';

const fresh = (): GameState => createInitialState('modifier-seed', 0);

/** Patch a single Sin's Devotion onto a fresh state. */
function withDevotion(updates: Partial<GameState['devotion']>): GameState {
  const s = fresh();
  return { ...s, devotion: { ...s.devotion, ...updates } };
}

describe('computeModifiers — Sin level effects', () => {
  it('returns the neutral bundle for an undeveloped lair', () => {
    expect(computeModifiers(fresh())).toEqual(NEUTRAL_MODIFIERS);
  });

  it('Gula levels scale player efficiency 2× per level (multiplicative, 03 §1)', () => {
    // 180^X thresholds: L1 = 180, L2 = 32 400, L4 = 1 049 760 000.
    expect(playerEfficiency(withDevotion({ gula: bn(0) }))).toBe(1); // L0
    expect(playerEfficiency(withDevotion({ gula: bn(180) }))).toBe(2); // L1
    expect(playerEfficiency(withDevotion({ gula: bn(32400) }))).toBe(4); // L2
    expect(playerEfficiency(withDevotion({ gula: bn(1049760000) }))).toBe(16); // L4
  });

  it('Vanagloria levels scale influence rate 1.5× per level (multiplicative)', () => {
    expect(computeModifiers(withDevotion({ vanagloria: bn(0) })).influenceRateMul).toBe(1);
    expect(computeModifiers(withDevotion({ vanagloria: bn(180) })).influenceRateMul).toBeCloseTo(
      1.5,
      6,
    );
    expect(computeModifiers(withDevotion({ vanagloria: bn(32400) })).influenceRateMul).toBeCloseTo(
      2.25,
      6,
    );
  });
});

describe('computeModifiers — Sin skill effects (continuous)', () => {
  it('Avaritia (Golden Hand) bumps goldRateMul by 1 + intensity', () => {
    // skillIntensity(180) = ln(180)² / 6.537 ≈ 4.1253 → goldRateMul ≈ 5.1253.
    expect(computeModifiers(withDevotion({ avaritia: bn(180) })).goldRateMul).toBeCloseTo(
      5.1253,
      3,
    );
  });

  it('Vanagloria (Acclaim) bumps maxInfluenceMul by 1 + intensity', () => {
    expect(computeModifiers(withDevotion({ vanagloria: bn(180) })).maxInfluenceMul).toBeCloseTo(
      5.1253,
      3,
    );
  });

  it('skill bonus is continuous below the first level (a single Devotion still nudges intensity)', () => {
    // skillIntensity(1) = ln(1)² / 6.537 = 0 → bonus = 1; but skillIntensity(2) > 0.
    expect(computeModifiers(withDevotion({ avaritia: bn(1) })).goldRateMul).toBe(1);
    expect(computeModifiers(withDevotion({ avaritia: bn(2) })).goldRateMul).toBeGreaterThan(1);
  });
});
