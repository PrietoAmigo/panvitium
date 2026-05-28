/**
 * Reprobate subtype effects (03 §3). Pins each subtype's TWO effects:
 *   - a Sin-themed Vitium Mercatura gold boost (per-count, applied per-business)
 *   - a secondary global-rate effect
 *
 * All "increase X" effects compose as `X × (1 + pct × n)`; all "decrease X" as `X / (1 + pct × n)`.
 * Magnitudes are placeholders (constants.ts); the shapes are what's pinned here.
 *
 * Effects:
 *   Glutton     (Gula)      → Gula VM gold↑     | offline catchup slowed
 *   Degenerate  (Luxuria)   → Luxuria VM gold↑  | suicide rate↓, murder rate↓
 *   Gambler     (Avaritia)  → Avaritia VM gold↑ | generation rate↓
 *   Nihilist    (Tristitia) → Tristitia VM gold↑| suicide rate↑
 *   Choleric    (Ira)       → Ira VM gold↑      | murder rate compounded on the linear term
 *   Husk        (Acedia)    → Acedia VM gold↑   | player efficiency↓
 *   Celebrity   (Vanagloria)→ Vanagloria VM↑    | gold rate↓
 *   Sigma       (Superbia)  → Superbia VM↑      | influence rate↓
 */
import { describe, expect, it } from 'vitest';
import {
  bn,
  businessGoldPerSecond,
  CELEBRITY_GOLD_REDUCTION_PER_COUNT,
  CHOLERIC_MURDER_INCREASE_PER_COUNT,
  computeModifiers,
  createInitialState,
  DEGENERATE_MURDER_REDUCTION_PER_COUNT,
  DEGENERATE_SUICIDE_REDUCTION_PER_COUNT,
  GAMBLER_GENERATION_REDUCTION_PER_COUNT,
  GLUTTON_OFFLINE_PENALTY_PER_COUNT,
  HUSK_EFFICIENCY_REDUCTION_PER_COUNT,
  NIHILIST_SUICIDE_INCREASE_PER_COUNT,
  SIGMA_INFLUENCE_REDUCTION_PER_COUNT,
  SINS,
  SUBTYPE_OF_SIN,
  SUBTYPE_VM_GOLD_BOOST_PER_COUNT,
  type GameState,
  type ReprobateSubtype,
} from './index.js';

function fresh(seed = 'subtype-effects', t = 0): GameState {
  return createInitialState(seed, t);
}

function withSubtype(s: GameState, subtype: ReprobateSubtype, n: number): GameState {
  return {
    ...s,
    lifetime: {
      ...s.lifetime,
      reprobates: { ...s.lifetime.reprobates, [subtype]: n },
    },
  };
}

function withBusinesses(s: GameState, businesses: Record<string, number>): GameState {
  return { ...s, lifetime: { ...s.lifetime, businesses } };
}

describe('subtypeVitiumGoldMulBySin — the Sin-themed VM gold boost (03 §3)', () => {
  it('NEUTRAL bundle: every Sin gets a 1× boost (no subtypes present)', () => {
    const m = computeModifiers(fresh());
    for (const sin of SINS) {
      expect(m.subtypeVitiumGoldMulBySin[sin]).toBe(1);
    }
  });

  it('a Glutton lifts ONLY Gula\u2019s boost, leaving the other seven Sins at 1×', () => {
    const s = withSubtype(fresh(), 'glutton', 100);
    const m = computeModifiers(s);
    expect(m.subtypeVitiumGoldMulBySin.gula).toBeCloseTo(
      1 + SUBTYPE_VM_GOLD_BOOST_PER_COUNT * 100,
      9,
    );
    for (const sin of SINS) {
      if (sin === 'gula') continue;
      expect(m.subtypeVitiumGoldMulBySin[sin]).toBe(1);
    }
  });

  it('each Sin\u2019s themed subtype lifts its own boost only', () => {
    // Round-trip the full mapping: put 50 of each themed subtype and verify each Sin's mul shifts.
    let s = fresh();
    for (const sin of SINS) {
      s = withSubtype(s, SUBTYPE_OF_SIN[sin], 50);
    }
    const m = computeModifiers(s);
    const expected = 1 + SUBTYPE_VM_GOLD_BOOST_PER_COUNT * 50;
    for (const sin of SINS) {
      expect(m.subtypeVitiumGoldMulBySin[sin]).toBeCloseTo(expected, 9);
    }
  });

  it('businessGoldPerSecond applies the per-Sin boost per-business', () => {
    // One gula-mercatura-1 (1 g/s) and one ira-mercatura-1 (1 g/s). 100 Gluttons should boost
    // ONLY the gula business; the ira business stays at 1 g/s base.
    const base = withBusinesses(fresh(), {
      'gula-mercatura-1': 1,
      'ira-mercatura-1': 1,
    });
    const live = withSubtype(base, 'glutton', 100);
    const mBase = computeModifiers(base);
    const mLive = computeModifiers(live);
    const baseGold = businessGoldPerSecond(base, mBase);
    const liveGold = businessGoldPerSecond(live, mLive);
    // Base: 1 + 1 = 2. Live: (1 × (1 + 0.01 × 100)) + 1 = 2 + 1 = 3.
    expect(baseGold).toBeCloseTo(2, 6);
    expect(liveGold).toBeCloseTo(2 + 1 * SUBTYPE_VM_GOLD_BOOST_PER_COUNT * 100, 6);
  });
});

describe('Secondary effects on rate muls (03 §3)', () => {
  it('Glutton slows offline catchup (offlineTimeMul < 1; only consumed by resumeGame)', () => {
    const m0 = computeModifiers(fresh());
    expect(m0.offlineTimeMul).toBe(1);
    const m1 = computeModifiers(withSubtype(fresh(), 'glutton', 1000));
    expect(m1.offlineTimeMul).toBeCloseTo(1 / (1 + GLUTTON_OFFLINE_PENALTY_PER_COUNT * 1000), 9);
    expect(m1.offlineTimeMul).toBeLessThan(1);
  });

  it('Degenerate lowers suicide rate AND Choleric murder rate', () => {
    const s = withSubtype(fresh(), 'degenerate', 500);
    const m = computeModifiers(s);
    const baseSuicide = computeModifiers(fresh()).reprobateSuicideRateMul;
    const baseMurder = computeModifiers(fresh()).cholericMurderRateMul;
    expect(m.reprobateSuicideRateMul).toBeCloseTo(
      baseSuicide / (1 + DEGENERATE_SUICIDE_REDUCTION_PER_COUNT * 500),
      6,
    );
    expect(m.cholericMurderRateMul).toBeCloseTo(
      baseMurder / (1 + DEGENERATE_MURDER_REDUCTION_PER_COUNT * 500),
      6,
    );
  });

  it('Gambler lowers reprobate generation rate', () => {
    const s = withSubtype(fresh(), 'gambler', 300);
    const m = computeModifiers(s);
    const base = computeModifiers(fresh()).reprobateGenerationRateMul;
    expect(m.reprobateGenerationRateMul).toBeCloseTo(
      base / (1 + GAMBLER_GENERATION_REDUCTION_PER_COUNT * 300),
      6,
    );
  });

  it('Nihilist raises suicide rate', () => {
    const s = withSubtype(fresh(), 'nihilist', 200);
    const m = computeModifiers(s);
    const base = computeModifiers(fresh()).reprobateSuicideRateMul;
    expect(m.reprobateSuicideRateMul).toBeCloseTo(
      base * (1 + NIHILIST_SUICIDE_INCREASE_PER_COUNT * 200),
      6,
    );
  });

  it('Choleric compounds its own murder rate on top of the linear count\u00d7base term', () => {
    const s = withSubtype(fresh(), 'choleric', 100);
    const m = computeModifiers(s);
    const base = computeModifiers(fresh()).cholericMurderRateMul;
    expect(m.cholericMurderRateMul).toBeCloseTo(
      base * (1 + CHOLERIC_MURDER_INCREASE_PER_COUNT * 100),
      6,
    );
  });

  it('Husk lowers player efficiency', () => {
    const s = withSubtype(fresh(), 'husk', 1000);
    const m = computeModifiers(s);
    const base = computeModifiers(fresh()).playerEfficiencyMul;
    expect(m.playerEfficiencyMul).toBeCloseTo(
      base / (1 + HUSK_EFFICIENCY_REDUCTION_PER_COUNT * 1000),
      6,
    );
  });

  it('Celebrity lowers gold rate', () => {
    const s = withSubtype(fresh(), 'celebrity', 500);
    const m = computeModifiers(s);
    const base = computeModifiers(fresh()).goldRateMul;
    expect(m.goldRateMul).toBeCloseTo(base / (1 + CELEBRITY_GOLD_REDUCTION_PER_COUNT * 500), 6);
  });

  it('Sigma lowers influence rate', () => {
    const s = withSubtype(fresh(), 'sigma', 500);
    const m = computeModifiers(s);
    const base = computeModifiers(fresh()).influenceRateMul;
    expect(m.influenceRateMul).toBeCloseTo(
      base / (1 + SIGMA_INFLUENCE_REDUCTION_PER_COUNT * 500),
      6,
    );
  });
});

describe('Composition with existing modifiers', () => {
  it('subtype effects stack multiplicatively with Sin skills (e.g. Avaritia\u2019s Golden Hand)', () => {
    // Avaritia Devotion lifts gold rate; Celebrity drags it down. Confirm both apply.
    const s: GameState = {
      ...fresh(),
      devotion: { ...fresh().devotion, avaritia: bn(180 ** 2) },
      lifetime: {
        ...fresh().lifetime,
        reprobates: { ...fresh().lifetime.reprobates, celebrity: 100 },
      },
    };
    const m = computeModifiers(s);
    // Just sanity-check: it's neither plain Avaritia-only nor plain Celebrity-only.
    const avaritiaOnly: GameState = {
      ...fresh(),
      devotion: { ...fresh().devotion, avaritia: bn(180 ** 2) },
    };
    const celebrityOnly = withSubtype(fresh(), 'celebrity', 100);
    expect(m.goldRateMul).not.toBe(computeModifiers(avaritiaOnly).goldRateMul);
    expect(m.goldRateMul).not.toBe(computeModifiers(celebrityOnly).goldRateMul);
    // Composition is multiplicative — within float tolerance.
    const product =
      computeModifiers(avaritiaOnly).goldRateMul *
      (1 / (1 + CELEBRITY_GOLD_REDUCTION_PER_COUNT * 100));
    expect(m.goldRateMul).toBeCloseTo(product, 6);
  });
});
