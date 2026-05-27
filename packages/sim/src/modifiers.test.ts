import { describe, it, expect } from 'vitest';
import { bn } from './bignum.js';
import { createInitialState, type GameState } from './state.js';
import {
  computeModifiers,
  playerEfficiency,
  categoryEfficiency,
  NEUTRAL_MODIFIERS,
} from './modifiers.js';

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

describe('computeModifiers — per-category efficiency', () => {
  it('Leviathan (Resignation) lifts suasioEfficiencyMul and only that', () => {
    const m = computeModifiers(withDevotion({ tristitia: bn(180) }));
    expect(m.suasioEfficiencyMul).toBeCloseTo(5.1253, 3);
    expect(m.decimatioEfficiencyMul).toBe(1);
  });

  it('Satan (Retribution) lifts decimatioEfficiencyMul and only that', () => {
    const m = computeModifiers(withDevotion({ ira: bn(180) }));
    expect(m.decimatioEfficiencyMul).toBeCloseTo(5.1253, 3);
    expect(m.suasioEfficiencyMul).toBe(1);
  });

  it('categoryEfficiency stacks player × category multiplicatively', () => {
    // Gula L1 → player 2×; Leviathan 180 → Suasio mul ≈ 5.1253. Total Suasio eff ≈ 10.25.
    // Decimatio receives no category boost → just the player 2×.
    const s = withDevotion({ gula: bn(180), tristitia: bn(180) });
    expect(categoryEfficiency(s, 'suasio')).toBeCloseTo(2 * 5.1253, 2);
    expect(categoryEfficiency(s, 'decimatio')).toBeCloseTo(2, 6);
  });
});

describe('computeModifiers — tier weight shifts', () => {
  it('Gula (Insatiability) damps Terrible and Apocalyptic toward zero (never negative)', () => {
    // intensity(180) ≈ 4.1253 → damp = 1 / 5.1253 ≈ 0.1951.
    const mul = computeModifiers(withDevotion({ gula: bn(180) })).tierWeightMul;
    expect(mul.terrible).toBeCloseTo(0.1951, 3);
    expect(mul.apocalyptic).toBeCloseTo(0.1951, 3);
    expect(mul.stellar).toBeUndefined();
  });

  it('Lucifer (Morning Star) lifts the Stellar tier weight by 1 + intensity', () => {
    const mul = computeModifiers(withDevotion({ superbia: bn(180) })).tierWeightMul;
    expect(mul.stellar).toBeCloseTo(5.1253, 3);
    expect(mul.terrible).toBeUndefined();
  });

  it('returns an empty tierWeightMul (all-1 by default) on a fresh state', () => {
    expect(computeModifiers(fresh()).tierWeightMul).toEqual({});
  });

  it('NEUTRAL_MODIFIERS carries an empty tierWeightMul (every tier defaults to 1)', () => {
    expect(NEUTRAL_MODIFIERS.tierWeightMul).toEqual({});
  });
});

describe('computeModifiers — maleficia effects (anathema)', () => {
  function equipped(ids: string[]): GameState {
    const s = fresh();
    return { ...s, lifetime: { ...s.lifetime, maleficia: ids } };
  }

  it('Spear of Longinus triples maxInfluenceMul', () => {
    const m = computeModifiers(equipped(['spear_of_longinus']));
    expect(m.maxInfluenceMul).toBeCloseTo(3, 6); // base 1 × 3
  });

  it('Codex Gigas triples influenceRateMul', () => {
    const m = computeModifiers(equipped(['codex_gigas']));
    expect(m.influenceRateMul).toBeCloseTo(3, 6);
  });

  it('Thirty Pieces of Silver triples goldRateMul', () => {
    const m = computeModifiers(equipped(['thirty_pieces_of_silver']));
    expect(m.goldRateMul).toBeCloseTo(3, 6);
  });

  it('Mark of Cain zeroes the Apocalyptic tier outright (overrides Insatiability damping)', () => {
    const s = fresh();
    const state: GameState = {
      ...s,
      devotion: { ...s.devotion, gula: bn(180) }, // Insatiability would damp to ≈ 0.195
      lifetime: { ...s.lifetime, maleficia: ['mark_of_cain'] },
    };
    expect(computeModifiers(state).tierWeightMul.apocalyptic).toBe(0);
  });

  it('Maleficia effects stack multiplicatively with Sin skills', () => {
    // Avaritia 180 → goldRateMul ≈ 5.1253; + Silver triples it → ≈ 15.376.
    const s = fresh();
    const state: GameState = {
      ...s,
      devotion: { ...s.devotion, avaritia: bn(180) },
      lifetime: { ...s.lifetime, maleficia: ['thirty_pieces_of_silver'] },
    };
    expect(computeModifiers(state).goldRateMul).toBeCloseTo(5.1253 * 3, 2);
  });
});
