import { describe, it, expect } from 'vitest';
import { bn } from './bignum.js';
import { createInitialState, type GameState } from './state.js';
import {
  computeModifiers,
  playerEfficiency,
  categoryEfficiency,
  categoryTierModifiers,
  NEUTRAL_MODIFIERS,
} from './modifiers.js';
import { skillIntensity } from './progression.js';

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
    // skillIntensity(180) = ln(180)² / 65.37 ≈ 0.41253 → goldRateMul ≈ 1.4125.
    expect(computeModifiers(withDevotion({ avaritia: bn(180) })).goldRateMul).toBeCloseTo(
      1.4125,
      3,
    );
  });

  it('Vanagloria (Acclaim) bumps maxInfluenceMul by 1 + intensity', () => {
    expect(computeModifiers(withDevotion({ vanagloria: bn(180) })).maxInfluenceMul).toBeCloseTo(
      1.4125,
      3,
    );
  });

  it('skill bonus is continuous below the first level (a single Devotion still nudges intensity)', () => {
    // skillIntensity(1) = ln(1)² / 65.37 = 0 → bonus = 1; but skillIntensity(2) > 0.
    expect(computeModifiers(withDevotion({ avaritia: bn(1) })).goldRateMul).toBe(1);
    expect(computeModifiers(withDevotion({ avaritia: bn(2) })).goldRateMul).toBeGreaterThan(1);
  });
});

describe('computeModifiers — per-category efficiency', () => {
  it('Leviathan (Resignation) lifts suasioEfficiencyMul and only that', () => {
    const m = computeModifiers(withDevotion({ tristitia: bn(180) }));
    expect(m.suasioEfficiencyMul).toBeCloseTo(1.4125, 3);
    expect(m.decimatioEfficiencyMul).toBe(1);
  });

  it('Satan (Retribution) lifts decimatioEfficiencyMul and only that', () => {
    const m = computeModifiers(withDevotion({ ira: bn(180) }));
    expect(m.decimatioEfficiencyMul).toBeCloseTo(1.4125, 3);
    expect(m.suasioEfficiencyMul).toBe(1);
  });

  it('categoryEfficiency stacks player × category multiplicatively', () => {
    // Gula L1 → player 2×; Leviathan 180 → Suasio mul ≈ 1.4125. Total Suasio eff ≈ 2.825.
    // Decimatio receives no category boost → just the player 2×.
    const s = withDevotion({ gula: bn(180), tristitia: bn(180) });
    expect(categoryEfficiency(s, 'suasio')).toBeCloseTo(2 * 1.4125, 2);
    expect(categoryEfficiency(s, 'decimatio')).toBeCloseTo(2, 6);
  });
});

describe('computeModifiers — tier weight shifts', () => {
  it('Gula (Insatiability) damps Terrible and Apocalyptic toward zero (never negative)', () => {
    // intensity(180) ≈ 0.41253 → damp = 1 / 1.4125 ≈ 0.7079.
    const mul = computeModifiers(withDevotion({ gula: bn(180) })).tierWeightMul;
    expect(mul.terrible).toBeCloseTo(0.7079, 3);
    expect(mul.apocalyptic).toBeCloseTo(0.7079, 3);
    expect(mul.stellar).toBeUndefined();
  });

  it('Lucifer (Morning Star) lifts the Stellar tier weight by 1 + intensity', () => {
    const mul = computeModifiers(withDevotion({ superbia: bn(180) })).tierWeightMul;
    expect(mul.stellar).toBeCloseTo(1.4125, 3);
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
    // Avaritia 180 → goldRateMul ≈ 1.4125; + Silver triples it → ≈ 4.2376.
    const s = fresh();
    const state: GameState = {
      ...s,
      devotion: { ...s.devotion, avaritia: bn(180) },
      lifetime: { ...s.lifetime, maleficia: ['thirty_pieces_of_silver'] },
    };
    expect(computeModifiers(state).goldRateMul).toBeCloseTo(1.4125 * 3, 2);
  });
});

describe('computeModifiers — reprobate-dynamics rate multipliers (02 §9)', () => {
  it('NEUTRAL bundle carries all three reprobate-rate multipliers at 1', () => {
    expect(NEUTRAL_MODIFIERS.reprobateGenerationRateMul).toBe(1);
    expect(NEUTRAL_MODIFIERS.reprobateSuicideRateMul).toBe(1);
    expect(NEUTRAL_MODIFIERS.cholericMurderRateMul).toBe(1);
  });

  it('fresh state stays at 1× across all three rate multipliers', () => {
    const m = computeModifiers(fresh());
    expect(m.reprobateGenerationRateMul).toBe(1);
    expect(m.reprobateSuicideRateMul).toBe(1);
    expect(m.cholericMurderRateMul).toBe(1);
  });

  it('Tristitia 180 Devotion (level 1 + Resignation skill) lifts suicide rate ~2.825×', () => {
    // Level 1 contributes 2× outright; Resignation at devotion 180 has intensity ≈ 0.41253,
    // so skill contributes (1 + 0.41253) ≈ 1.4125. Combined: 2 × 1.4125 ≈ 2.82505.
    const s = fresh();
    const state: GameState = { ...s, devotion: { ...s.devotion, tristitia: bn(180) } };
    expect(computeModifiers(state).reprobateSuicideRateMul).toBeCloseTo(2.825, 1);
  });

  it('Tristitia skill alone (sub-level devotion) lifts suicide rate but not by 2×', () => {
    // Devotion 10 gives skill intensity ≈ 0.081; level still 0, so mul ≈ 1.081 (not doubled).
    const s = fresh();
    const state: GameState = { ...s, devotion: { ...s.devotion, tristitia: bn(10) } };
    const mul = computeModifiers(state).reprobateSuicideRateMul;
    expect(mul).toBeGreaterThan(1);
    expect(mul).toBeLessThan(1.2);
  });
});

describe('categoryTierModifiers — per-category success shift (02 §2)', () => {
  const withInvocation = (id: string, n: number): GameState => {
    const s = fresh();
    return {
      ...s,
      lifetime: { ...s.lifetime, invocations: { ...s.lifetime.invocations, [id]: n } },
    };
  };

  it('is empty with no source (no Tristitia/Ira Devotion, no Lamia)', () => {
    expect(categoryTierModifiers(fresh(), 'suasio')).toEqual({});
    expect(categoryTierModifiers(fresh(), 'decimatio')).toEqual({});
  });

  it('Resignation (Tristitia) lifts Suasio Stellar+Excellent+Good by (1 + intensity), equally', () => {
    const s = withDevotion({ tristitia: bn(180) });
    const expected = 1 + skillIntensity(s.devotion.tristitia);
    const m = categoryTierModifiers(s, 'suasio');
    expect(m.stellar).toBeCloseTo(expected, 6);
    expect(m.excellent).toBeCloseTo(expected, 6);
    expect(m.good).toBeCloseTo(expected, 6);
    // Failure tiers are untouched (renormalization redistributes against them).
    expect(m.neutral).toBeUndefined();
    expect(m.terrible).toBeUndefined();
    // Tristitia does NOT shift Decimatio.
    expect(categoryTierModifiers(s, 'decimatio')).toEqual({});
  });

  it('Retribution (Ira) lifts Decimatio success the same way, and not Suasio', () => {
    const s = withDevotion({ ira: bn(180) });
    const expected = 1 + skillIntensity(s.devotion.ira);
    const m = categoryTierModifiers(s, 'decimatio');
    expect(m.good).toBeCloseTo(expected, 6);
    expect(categoryTierModifiers(s, 'suasio')).toEqual({});
  });

  it('each Lamia lifts Suasio success multiplicatively on top of Resignation', () => {
    const base = categoryTierModifiers(withDevotion({ tristitia: bn(180) }), 'suasio').good!;
    const s = {
      ...withDevotion({ tristitia: bn(180) }),
      lifetime: { ...fresh().lifetime, invocations: { lamia: 2 } },
    };
    const withLamia = categoryTierModifiers(s, 'suasio').good!;
    expect(withLamia).toBeCloseTo(base * (1 + 0.25 * 2), 6);
  });

  it('Indagatio / Emptio have no success-shift source yet', () => {
    const s = withDevotion({ tristitia: bn(180), ira: bn(180) });
    expect(categoryTierModifiers(s, 'indagatio')).toEqual({});
    expect(categoryTierModifiers(s, 'emptio')).toEqual({});
  });

  it('each Lamia also lifts the reprobate generation multiplier', () => {
    expect(computeModifiers(fresh()).reprobateGenerationRateMul).toBe(1);
    expect(computeModifiers(withInvocation('lamia', 1)).reprobateGenerationRateMul).toBeCloseTo(
      1.5,
      6,
    );
    expect(computeModifiers(withInvocation('lamia', 3)).reprobateGenerationRateMul).toBeCloseTo(
      2.5,
      6,
    );
  });
});

describe('computeModifiers — production invocations (Plutus, Succubus)', () => {
  const withInvocation = (id: string, n: number): GameState => {
    const s = fresh();
    return {
      ...s,
      lifetime: { ...s.lifetime, invocations: { ...s.lifetime.invocations, [id]: n } },
    };
  };

  it('each Plutus lifts the Vitium Mercatura output multiplier (+100% per copy)', () => {
    expect(computeModifiers(fresh()).vitiumMercaturaOutputMul).toBe(1);
    expect(computeModifiers(withInvocation('plutus', 1)).vitiumMercaturaOutputMul).toBe(2);
    expect(computeModifiers(withInvocation('plutus', 3)).vitiumMercaturaOutputMul).toBe(4);
  });

  it('Succubus dramatically multiplies generation and cuts gold to 1%', () => {
    const m = computeModifiers(withInvocation('succubus', 1));
    expect(m.reprobateGenerationRateMul).toBe(10);
    expect(m.goldRateMul).toBeCloseTo(0.01, 6);
    // Apex: capped at one, so a stray second copy can't be summoned, but the flag is boolean anyway.
  });

  it('Succubus gold cut composes with other gold sources (Silver ×3 → ×0.03)', () => {
    const s = withInvocation('succubus', 1);
    const withSilver: GameState = {
      ...s,
      lifetime: { ...s.lifetime, maleficia: ['thirty_pieces_of_silver'] },
    };
    expect(computeModifiers(withSilver).goldRateMul).toBeCloseTo(0.03, 6);
  });

  it('Lemure contributes flat influence/s scaling with Husk count and Lemure count', () => {
    expect(computeModifiers(fresh()).flatInfluencePerSecond).toBe(0); // no Lemure
    const withHusks = (husks: number, lemures: number): GameState => {
      const s = fresh();
      return {
        ...s,
        lifetime: {
          ...s.lifetime,
          reprobates: { ...s.lifetime.reprobates, husk: husks },
          invocations: { lemure: lemures },
        },
      };
    };
    expect(computeModifiers(withHusks(50, 0)).flatInfluencePerSecond).toBe(0); // Husks but no Lemure
    expect(computeModifiers(withHusks(0, 2)).flatInfluencePerSecond).toBe(0); // Lemure but no Husks
    expect(computeModifiers(withHusks(50, 1)).flatInfluencePerSecond).toBeCloseTo(5, 6); // 0.1×50×1
    expect(computeModifiers(withHusks(50, 3)).flatInfluencePerSecond).toBeCloseTo(15, 6); // 0.1×50×3
  });
});
