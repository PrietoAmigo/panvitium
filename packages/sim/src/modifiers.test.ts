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

  it("Gula's Insatiability SKILL scales player efficiency by (1 + intensity) — levels do not", () => {
    // Sheet rev 2026-06-12: the old ×2-per-level ladder is retired; intensity(180) ≈ 0.41253.
    expect(playerEfficiency(withDevotion({ gula: bn(0) }))).toBe(1);
    expect(playerEfficiency(withDevotion({ gula: bn(180) }))).toBeCloseTo(1.4125, 3);
    expect(playerEfficiency(withDevotion({ gula: bn(32400) }))).toBeCloseTo(
      1 + skillIntensity(bn(32400)),
      6,
    );
  });

  it('Vanagloria levels scale influence rate 1.33× per level (multiplicative)', () => {
    expect(computeModifiers(withDevotion({ vanagloria: bn(0) })).influenceRateMul).toBe(1);
    expect(computeModifiers(withDevotion({ vanagloria: bn(180) })).influenceRateMul).toBeCloseTo(
      1.33,
      6,
    );
    expect(computeModifiers(withDevotion({ vanagloria: bn(32400) })).influenceRateMul).toBeCloseTo(
      1.33 ** 2,
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
  it('Luxuria LEVELS lift suasioEfficiencyMul ×2 per level, and only that (sheet rev)', () => {
    const m = computeModifiers(withDevotion({ luxuria: bn(180) }));
    expect(m.suasioEfficiencyMul).toBeCloseTo(2, 6);
    expect(m.decimatioEfficiencyMul).toBe(1);
  });

  it('Ira LEVELS lift decimatioEfficiencyMul ×2 per level, and only that (sheet rev)', () => {
    const m = computeModifiers(withDevotion({ ira: bn(32400) })); // L2
    expect(m.decimatioEfficiencyMul).toBeCloseTo(4, 6);
    expect(m.suasioEfficiencyMul).toBe(1);
  });

  it('categoryEfficiency stacks player × category multiplicatively', () => {
    // Gula 180 → player ≈ 1.4125 (skill); Luxuria L1 → Suasio mul 2. Total Suasio eff ≈ 2.825.
    // Decimatio receives no category boost → just the player skill.
    const s = withDevotion({ gula: bn(180), luxuria: bn(180) });
    expect(categoryEfficiency(s, 'suasio')).toBeCloseTo(1.4125 * 2, 2);
    expect(categoryEfficiency(s, 'decimatio')).toBeCloseTo(1.4125, 3);
  });
});

describe('computeModifiers — tier weight shifts', () => {
  it('Gula LEVELS strip negative tier weight: ×(1 − 0.25·L), level 4 → zero (sheet rev)', () => {
    const l1 = computeModifiers(withDevotion({ gula: bn(180) })).tierWeightMul;
    expect(l1.bad).toBeCloseTo(0.75, 9);
    expect(l1.terrible).toBeCloseTo(0.75, 9);
    expect(l1.apocalyptic).toBeCloseTo(0.75, 9);
    expect(l1.stellar).toBeUndefined();
    const l4 = computeModifiers(withDevotion({ gula: bn(1049760000) })).tierWeightMul;
    expect(l4.bad).toBe(0);
    expect(l4.terrible).toBe(0);
    expect(l4.apocalyptic).toBe(0);
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

  it('Codex Gigas lifts influenceRateMul by 33%', () => {
    const m = computeModifiers(equipped(['codex_gigas']));
    expect(m.influenceRateMul).toBeCloseTo(1.33, 6);
  });

  it('Thirty Pieces of Silver adds 0.001% of current gold as flat gold/s (not a multiplier)', () => {
    const s = fresh();
    const state: GameState = {
      ...s,
      lifetime: { ...s.lifetime, gold: bn(1_000_000), maleficia: ['thirty_pieces_of_silver'] },
    };
    const m = computeModifiers(state);
    expect(m.goldRateMul).toBeCloseTo(1, 6); // no longer a gold multiplier
    expect(m.flatGoldPerSecond).toBeCloseTo(10, 6); // 0.001% of 1,000,000 = 10/s
  });

  it('Mark of Cain triples murder rate (no longer zeroes the Apocalyptic tier)', () => {
    const m = computeModifiers(equipped(['mark_of_cain']));
    expect(m.murderRateMul).toBeCloseTo(3, 6);
    expect(m.tierWeightMul.apocalyptic).toBeUndefined();
  });

  it('Ars Serpens lifts Suasio efficiency by 33%', () => {
    const base = computeModifiers(fresh()).suasioEfficiencyMul;
    const m = computeModifiers(equipped(['ars_serpens'])).suasioEfficiencyMul;
    expect(m).toBeCloseTo(base * 1.33, 6);
  });

  it('The Voynich Manuscript lifts Suasio efficiency by 66%', () => {
    const base = computeModifiers(fresh()).suasioEfficiencyMul;
    const m = computeModifiers(equipped(['voynich_manuscript'])).suasioEfficiencyMul;
    expect(m).toBeCloseTo(base * 1.66, 6);
  });

  it('Suasio enhancers compose multiplicatively when both are equipped', () => {
    const base = computeModifiers(fresh()).suasioEfficiencyMul;
    const m = computeModifiers(equipped(['ars_serpens', 'voynich_manuscript'])).suasioEfficiencyMul;
    expect(m).toBeCloseTo(base * 1.33 * 1.66, 6);
  });

  it('Ritual Dagger lifts Decimatio efficiency by 33% and leaves Suasio untouched', () => {
    const baseDec = computeModifiers(fresh()).decimatioEfficiencyMul;
    const baseSua = computeModifiers(fresh()).suasioEfficiencyMul;
    const m = computeModifiers(equipped(['ritual_dagger']));
    expect(m.decimatioEfficiencyMul).toBeCloseTo(baseDec * 1.33, 6);
    expect(m.suasioEfficiencyMul).toBeCloseTo(baseSua, 6); // Suasio enhancers are independent
  });

  it('Maleficia effects stack multiplicatively with Sin effects', () => {
    // Vanagloria L1 → influenceRateMul 1.33; + Codex Gigas ×1.33 → ≈ 1.77.
    const s = fresh();
    const state: GameState = {
      ...s,
      devotion: { ...s.devotion, vanagloria: bn(180) },
      lifetime: { ...s.lifetime, maleficia: ['codex_gigas'] },
    };
    expect(computeModifiers(state).influenceRateMul).toBeCloseTo(1.33 * 1.33, 2);
  });
});

describe('computeModifiers — reprobate-dynamics rate multipliers (02 §9)', () => {
  it('NEUTRAL bundle carries all three reprobate-rate multipliers at 1', () => {
    expect(NEUTRAL_MODIFIERS.reprobateGenerationRateMul).toBe(1);
    expect(NEUTRAL_MODIFIERS.reprobateSuicideRateMul).toBe(1);
    expect(NEUTRAL_MODIFIERS.murderRateMul).toBe(1);
  });

  it('fresh state stays at 1× across all three rate multipliers', () => {
    const m = computeModifiers(fresh());
    expect(m.reprobateGenerationRateMul).toBe(1);
    expect(m.reprobateSuicideRateMul).toBe(1);
    expect(m.murderRateMul).toBe(1);
  });

  it('Tristitia Devotion no longer touches the suicide rate (sheet rev 2026-06-12)', () => {
    // Resignation moved to acolyte efficiency; the per-level doubling is retired. The despair
    // channel is the Mercatus Tristitiae signature clause (pinned in mercatus.test.ts).
    const s = fresh();
    const state: GameState = { ...s, devotion: { ...s.devotion, tristitia: bn(180) } };
    expect(computeModifiers(state).reprobateSuicideRateMul).toBe(1);
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

  it('Lamia no longer shifts Suasio success (reclassified as a Suasio runner)', () => {
    const base = categoryTierModifiers(withDevotion({ tristitia: bn(180) }), 'suasio').good!;
    const s = {
      ...withDevotion({ tristitia: bn(180) }),
      lifetime: { ...fresh().lifetime, invocations: { lamia: 2 } },
    };
    // Only Resignation (Tristitia) shifts Suasio success now; Lamia acts through its runner instead.
    expect(categoryTierModifiers(s, 'suasio').good!).toBeCloseTo(base, 6);
  });

  it('Indagatio / Emptio have no success-shift source yet', () => {
    const s = withDevotion({ tristitia: bn(180), ira: bn(180) });
    expect(categoryTierModifiers(s, 'indagatio')).toEqual({});
    expect(categoryTierModifiers(s, 'emptio')).toEqual({});
  });

  it('Lamia no longer lifts the reprobate generation multiplier (reclassified as a runner)', () => {
    expect(computeModifiers(fresh()).reprobateGenerationRateMul).toBe(1);
    expect(computeModifiers(withInvocation('lamia', 3)).reprobateGenerationRateMul).toBe(
      NEUTRAL_MODIFIERS.reprobateGenerationRateMul,
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

  it('each Plutus lifts the Vitium Mercatura output multiplier (efficiency-scaled, 0.05/copy baseline)', () => {
    expect(computeModifiers(fresh()).vitiumMercaturaOutputMul).toBe(1);
    expect(computeModifiers(withInvocation('plutus', 1)).vitiumMercaturaOutputMul).toBeCloseTo(
      1.05,
      6,
    );
    expect(computeModifiers(withInvocation('plutus', 3)).vitiumMercaturaOutputMul).toBeCloseTo(
      1.15,
      6,
    );
  });

  it('Succubus no longer touches the rate modifiers — its effect is an Imperium runner, cost is upkeep', () => {
    const m = computeModifiers(withInvocation('succubus', 1));
    expect(m.suasioEfficiencyMul).toBeCloseTo(1, 6); // no longer a Suasio-efficiency source (#8 retarget)
    expect(m.goldRateMul).toBeCloseTo(1, 6); // the 99% gold gain is upkeep (tick 1a), not a rate cut
    expect(m.reprobateGenerationRateMul).toBe(NEUTRAL_MODIFIERS.reprobateGenerationRateMul);
  });

  it('Midas still triples goldRateMul independent of Succubus (whose cost is now upkeep)', () => {
    const s = fresh();
    const both: GameState = {
      ...s,
      lifetime: {
        ...s.lifetime,
        invocations: { ...s.lifetime.invocations, succubus: 1, midas: 1 },
      },
    };
    expect(computeModifiers(both).goldRateMul).toBeCloseTo(3, 6);
  });

  it('invocation effects scale with player efficiency (Model 1)', () => {
    const plain = computeModifiers(withInvocation('plutus', 1)).vitiumMercaturaOutputMul; // playerEff 1 → 1.05
    const s = fresh();
    const withDoppel = computeModifiers({
      ...s,
      lifetime: { ...s.lifetime, invocations: { plutus: 1, doppelgaenger: 1 } },
    }).vitiumMercaturaOutputMul;
    // Doppelgänger lifts playerEff to 1.5, so the Plutus bonus grows to 0.05 × 1.5.
    expect(withDoppel).toBeGreaterThan(plain);
    expect(withDoppel).toBeCloseTo(1 + 0.05 * 1.5, 6);
  });

  it('Black Candles raise the invocation-effect multiplier (+5% each) and amplify effects', () => {
    expect(computeModifiers(fresh()).invocationEfficiencyMul).toBe(1);
    const s = fresh();
    const two = computeModifiers({
      ...s,
      lifetime: {
        ...s.lifetime,
        maleficia: ['black_candles', 'black_candles'],
        invocations: { plutus: 1 },
      },
    });
    expect(two.invocationEfficiencyMul).toBeCloseTo(1.1, 6); // 1 + 0.05 × 2
    expect(two.vitiumMercaturaOutputMul).toBeCloseTo(1 + 0.05 * 1.1, 6); // Plutus bonus × invEff
  });

  it('Lemure lifts the offline gain rate (efficiency-scaled), not flat influence', () => {
    expect(computeModifiers(fresh()).flatInfluencePerSecond).toBe(0);
    const withLemure = (lemures: number): GameState => {
      const s = fresh();
      return { ...s, lifetime: { ...s.lifetime, invocations: { lemure: lemures } } };
    };
    // Retargeted off influence/Husk: no flat-influence contribution any more.
    expect(computeModifiers(withLemure(3)).flatInfluencePerSecond).toBe(0);
    // Baseline playerEff = invEff = 1, factor 0.025 per copy, multiplicative on the offline mul.
    expect(computeModifiers(withLemure(0)).offlineTimeMul).toBeCloseTo(1, 6);
    expect(computeModifiers(withLemure(2)).offlineTimeMul).toBeCloseTo(1 + 0.025 * 2, 6);
  });
});
