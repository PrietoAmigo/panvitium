/**
 * Vitium Mercatura sim tests (03 §2.3 / 02 §3 / 02 §9). Pins:
 *   - catalog covers the eight Sins at Level 1
 *   - startBuild enforces Sin level + gold; appends to buildQueue; does NOT occupy the player slot
 *   - advanceBuilds promotes finished builds into the businesses map
 *   - shutdownBusiness refunds 50% (default) and removes one count; cleans up the key at 0
 *   - businessGoldPerSecond aggregates by owned count
 *   - tick folds business gold into the per-tick gain (goldRateMul applies to both base + biz)
 *   - business generation contributions feed the generation pool (an unconverted reprobate per
 *     accrued unit)
 *   - business conversion contributions drain the conversion pool and convert unconverted →
 *     biased subtype
 *   - biasedSubtype is dominated by the per-business bias × count × conversionRate
 *   - Katabasis auto-shuts-down owned businesses and folds the refund into goldAtDescent BEFORE
 *     the remaining-gold roll
 */
import { describe, expect, it } from 'vitest';
import {
  advanceBuilds,
  biasedSubtype,
  bn,
  BUSINESSES,
  BUSINESS_IDS,
  businessGenerationPerSecond,
  businessGoldPerSecond,
  businessConversionPerSecond,
  businessById,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  makeRng,
  reprobateRates,
  SHUTDOWN_REFUND_FRACTION,
  SINS,
  shutdownBusiness,
  startBuild,
  tick,
  type GameState,
  type ReprobateSubtype,
} from './index.js';

function fresh(seed = 'vitium', t = 0): GameState {
  return createInitialState(seed, t);
}

function withGold(s: GameState, gold: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, gold: bn(gold) } };
}

function withSinLevel(s: GameState, sin: 'gula' | 'luxuria', level: 1 | 2 | 3 | 4): GameState {
  // Devotion of 180^level → exactly level (sinLevel floors).
  const devotion = { ...s.devotion, [sin]: bn(180 ** level) };
  return { ...s, devotion };
}

describe('Vitium Mercatura — catalog', () => {
  it('carries exactly one entry-tier business per Sin, all at level 1', () => {
    expect(BUSINESS_IDS).toHaveLength(8);
    const sinsCovered = new Set<string>();
    for (const id of BUSINESS_IDS) {
      const def = BUSINESSES[id];
      expect(def).toBeDefined();
      expect(def!.level).toBe(1);
      sinsCovered.add(def!.sin);
    }
    for (const s of SINS) expect(sinsCovered.has(s)).toBe(true);
  });

  it('each business biases toward its matching subtype with a small reprobate leakage', () => {
    for (const id of BUSINESS_IDS) {
      const def = BUSINESSES[id]!;
      const matchingSubtype = expectedSubtypeForSin(def.sin);
      expect(def.subtypeBias[matchingSubtype]).toBeGreaterThan(0.5);
      // Some leakage into unconverted reprobates so early conversions don't all hit the bias.
      expect(def.subtypeBias.reprobate ?? 0).toBeGreaterThan(0);
    }
  });

  it('lookup helpers behave', () => {
    expect(businessById('gula-mercatura-1')?.sin).toBe('gula');
    expect(businessById('not-a-thing')).toBeUndefined();
  });
});

describe('startBuild', () => {
  it('rejects unknown business ids', () => {
    const r = startBuild(fresh(), 'not-a-business');
    expect(r.ok).toBe(false);
  });

  it('rejects when the player has not reached the gating Sin level', () => {
    const s = withGold(fresh(), 1000);
    const r = startBuild(s, 'gula-mercatura-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/gula level/);
  });

  it('rejects when the player has not got enough gold', () => {
    const s = withSinLevel(fresh(), 'gula', 1);
    const r = startBuild(s, 'gula-mercatura-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/gold/);
  });

  it('on success: deducts buildCost, appends a BuildTimer, leaves actionQueue untouched', () => {
    const s = withSinLevel(withGold(fresh(), 500), 'gula', 1);
    const r = startBuild(s, 'gula-mercatura-1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.lifetime.gold.toNumber()).toBe(400);
    expect(r.state.lifetime.buildQueue).toHaveLength(1);
    expect(r.state.lifetime.buildQueue[0]!.businessId).toBe('gula-mercatura-1');
    expect(r.state.lifetime.buildQueue[0]!.remainingSeconds).toBe(30);
    // Player slot is NOT occupied — startBuild does not append to actionQueue.
    expect(r.state.lifetime.actionQueue).toHaveLength(0);
  });

  it('allows multiple concurrent in-flight builds — any combination of ids', () => {
    let s = withSinLevel(withGold(fresh(), 1000), 'gula', 1);
    s = withSinLevel(s, 'luxuria', 1);
    const r1 = startBuild(s, 'gula-mercatura-1');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = startBuild(r1.state, 'gula-mercatura-1');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const r3 = startBuild(r2.state, 'luxuria-mercatura-1');
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.state.lifetime.buildQueue).toHaveLength(3);
    expect(r3.state.lifetime.gold.toNumber()).toBe(700); // 3 × 100
  });
});

describe('advanceBuilds', () => {
  it('a build completes when its remainingSeconds hits 0 and the count increments', () => {
    const s = withSinLevel(withGold(fresh(), 200), 'gula', 1);
    const r = startBuild(s, 'gula-mercatura-1');
    if (!r.ok) throw new Error('start should succeed');
    const after = advanceBuilds(r.state, 30);
    expect(after.lifetime.buildQueue).toHaveLength(0);
    expect(after.lifetime.businesses['gula-mercatura-1']).toBe(1);
  });

  it('multiple concurrent builds all complete in a single large (offline) delta', () => {
    let s = withSinLevel(withGold(fresh(), 1000), 'gula', 1);
    for (let i = 0; i < 4; i++) {
      const r = startBuild(s, 'gula-mercatura-1');
      if (!r.ok) throw new Error('start should succeed');
      s = r.state;
    }
    const after = advanceBuilds(s, 100);
    expect(after.lifetime.buildQueue).toHaveLength(0);
    expect(after.lifetime.businesses['gula-mercatura-1']).toBe(4);
  });

  it('partial advancement leaves the remaining timer in the queue with reduced time', () => {
    const s = withSinLevel(withGold(fresh(), 200), 'gula', 1);
    const r = startBuild(s, 'gula-mercatura-1');
    if (!r.ok) throw new Error('start should succeed');
    const after = advanceBuilds(r.state, 10);
    expect(after.lifetime.buildQueue).toHaveLength(1);
    expect(after.lifetime.buildQueue[0]!.remainingSeconds).toBe(20);
    expect(after.lifetime.businesses['gula-mercatura-1'] ?? 0).toBe(0);
  });

  it('is a no-op when queue is empty or delta is non-positive', () => {
    const s = fresh();
    expect(advanceBuilds(s, 30)).toBe(s);
    const built = (() => {
      const seed = withSinLevel(withGold(fresh(), 200), 'gula', 1);
      const r = startBuild(seed, 'gula-mercatura-1');
      if (!r.ok) throw new Error('start should succeed');
      return r.state;
    })();
    expect(advanceBuilds(built, 0)).toBe(built);
  });
});

describe('shutdownBusiness', () => {
  it('rejects when no copies are owned', () => {
    const r = shutdownBusiness(fresh(), 'gula-mercatura-1');
    expect(r.ok).toBe(false);
  });

  it('refunds 50% of buildCost, decrements count, removes key at 0', () => {
    let s = withSinLevel(withGold(fresh(), 200), 'gula', 1);
    const built = startBuild(s, 'gula-mercatura-1');
    if (!built.ok) throw new Error('start should succeed');
    s = advanceBuilds(built.state, 30); // 1 owned, gold = 100 (200 paid 100 to build)
    expect(s.lifetime.businesses['gula-mercatura-1']).toBe(1);

    const sh = shutdownBusiness(s, 'gula-mercatura-1');
    expect(sh.ok).toBe(true);
    if (!sh.ok) return;
    expect(sh.refund).toBe(50);
    // 200 starting - 100 build cost + 50 refund = 150.
    expect(sh.state.lifetime.gold.toNumber()).toBe(150);
    expect(sh.state.lifetime.businesses['gula-mercatura-1']).toBeUndefined();
  });

  it('SHUTDOWN_REFUND_FRACTION is the documented 50%', () => {
    expect(SHUTDOWN_REFUND_FRACTION).toBe(0.5);
  });
});

describe('tick — business gold income', () => {
  it('owned businesses contribute to per-tick gold gain (multiplied by goldRateMul)', () => {
    // Fresh: BASE_GOLD_PER_SECOND = 10. Add one gula-mercatura-1 (gpsec 1) → total 11 g/s.
    const s = withGold(fresh(), 0);
    const owned: GameState = {
      ...s,
      lifetime: { ...s.lifetime, businesses: { 'gula-mercatura-1': 1 } },
    };
    expect(businessGoldPerSecond(owned)).toBe(1);
    const after = tick(owned, 1).state;
    expect(after.lifetime.gold.toNumber()).toBeCloseTo(11, 5);
  });

  it('businessGoldPerSecond scales with count and ignores unknown ids', () => {
    const s = fresh();
    const owned: GameState = {
      ...s,
      lifetime: {
        ...s.lifetime,
        businesses: {
          'gula-mercatura-1': 3, // 1 g/s × 3 = 3
          'avaritia-mercatura-1': 2, // 2 g/s × 2 = 4
          ghost: 99, // unknown id — ignored
        },
      },
    };
    expect(businessGoldPerSecond(owned)).toBe(7);
  });
});

describe('tick — business reprobate generation', () => {
  it('owned business contributes to the generation pool and produces unconverted reprobates', () => {
    // 10 × gula-mercatura-1 → 0.10 reprobate gen/s. Over 12 s = 1.2 → 1 birth, pool 0.2 residual.
    const s = fresh();
    const owned: GameState = {
      ...s,
      lifetime: { ...s.lifetime, businesses: { 'gula-mercatura-1': 10 } },
    };
    expect(businessGenerationPerSecond(owned)).toBeCloseTo(0.1, 6);
    const after = tick(owned, 12).state;
    // Unconverted reprobate count goes up; possibly minus suicide / conversion, but with 1
    // population and 0.023% suicide rate over 12 s the suicide pool is tiny (1×0.00023×12 =
    // 0.00276) — far below 1. Conversion needs > 1 unconverted to fire and it consumes from
    // the same count, so the net produced count is what matters.
    expect(after.lifetime.reprobates.reprobate + after.lifetime.reprobates.glutton).toBe(1);
  });
});

describe('tick — Vitium-driven conversion via biasedSubtype', () => {
  it('owned business drains the conversion pool and biases the conversion toward its subtype', () => {
    // Set up: 100 unconverted reprobates AND 10 gula-mercatura-1 businesses (0.20 conv/s).
    // Over 50 s: pool = 10.0 → 10 conversions. With 0.85 glutton bias the bulk go to gluttons.
    const s = fresh();
    const seeded: GameState = {
      ...s,
      lifetime: {
        ...s.lifetime,
        reprobates: { ...s.lifetime.reprobates, reprobate: 100 },
        businesses: { 'gula-mercatura-1': 10 },
      },
    };
    expect(businessConversionPerSecond(seeded)).toBeCloseTo(0.2, 6);
    const after = tick(seeded, 50).state;
    // Across the 50 s some suicides happen (100 × 0.00023 × 50 = 1.15 → 1 suicide).
    // Net non-Glutton population: ~ 100 - 10 conversions - 1 suicide = ~89 unconverted.
    expect(after.lifetime.reprobates.glutton).toBeGreaterThanOrEqual(7);
    expect(after.lifetime.reprobates.glutton).toBeLessThanOrEqual(10);
    expect(after.lifetime.reprobates.reprobate).toBeLessThan(100);
  });

  it('biasedSubtype with no active business falls back to "reprobate" (no conversion)', () => {
    const rng = makeRng(0);
    expect(biasedSubtype(fresh(), rng)).toBe('reprobate');
  });

  it('biasedSubtype with only a gula business picks "glutton" most of the time', () => {
    const s = fresh();
    const owned: GameState = {
      ...s,
      lifetime: { ...s.lifetime, businesses: { 'gula-mercatura-1': 1 } },
    };
    let gluttons = 0;
    let totalNonReprobate = 0;
    const rng = makeRng(42);
    for (let i = 0; i < 200; i++) {
      const pick = biasedSubtype(owned, rng);
      if (pick === 'glutton') gluttons++;
      if (pick !== 'reprobate') totalNonReprobate++;
    }
    // With 85/15 weights, ~85% of non-reprobate picks should be glutton; allow wide tolerance.
    expect(totalNonReprobate).toBeGreaterThan(150);
    expect(gluttons / totalNonReprobate).toBeGreaterThan(0.7);
  });
});

describe('Katabasis — Vitium Mercatura auto-shutdown', () => {
  it('owned businesses auto-shutdown into the gold pool before the remaining-gold roll', () => {
    // Setup: 4 owned gula-mercatura-1 = 200 gold refund. Plus 100 gold on hand = 300 at descent.
    // No Avaritia → remaining-gold fraction is the base 0.05 → 15 gold kept.
    const s = withSinLevel(withGold(fresh(), 100), 'gula', 1);
    const state: GameState = {
      ...s,
      lifetime: { ...s.lifetime, businesses: { 'gula-mercatura-1': 4 } },
    };
    const { state: after, recap } = commitKatabasis(state);
    expect(recap.goldKept.toNumber()).toBe(15);
    expect(after.lifetime.gold.toNumber()).toBe(15);
    // All Vitium state cleared on rebirth.
    expect(Object.keys(after.lifetime.businesses)).toHaveLength(0);
    expect(after.lifetime.buildQueue).toHaveLength(0);
    expect(after.lifetime.conversionPool).toBe(0);
  });

  it('in-flight builds fizzle on Katabasis (no refund — they had not completed)', () => {
    const s = withSinLevel(withGold(fresh(), 200), 'gula', 1);
    const built = startBuild(s, 'gula-mercatura-1');
    if (!built.ok) throw new Error('start should succeed');
    // 100 gold paid; 100 gold left on hand. Build in flight (not yet completed).
    const { state: after, recap } = commitKatabasis(built.state);
    // Only the 100 on hand carries — the 100 paid for the unfinished build is forfeit.
    // Remaining-gold % is base 0.05 → 5 kept.
    expect(recap.goldKept.toNumber()).toBe(5);
    expect(after.lifetime.businesses).toEqual({});
    expect(after.lifetime.buildQueue).toEqual([]);
  });
});

describe('Modifiers — vitiumMercaturaOutputMul defaults to 1', () => {
  it('the new field appears in the bundle and is 1 by default', () => {
    expect(computeModifiers(fresh()).vitiumMercaturaOutputMul).toBe(1);
  });

  it('rates do not include the output mul yet (reserved for Plutus / Vapula slices)', () => {
    // For this slice we pin the SHAPE of the field, not its consumers.
    const s = fresh();
    const owned: GameState = {
      ...s,
      lifetime: { ...s.lifetime, businesses: { 'gula-mercatura-1': 1 } },
    };
    const mods = computeModifiers(owned);
    const rates = reprobateRates(owned, mods);
    // 1 × gula gen 0.01; conversion 0.02. Multiplier defaults to 1.
    expect(rates.generationPerSecond).toBeCloseTo(0.01, 6);
    expect(rates.conversionPerSecond).toBeCloseTo(0.02, 6);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

function expectedSubtypeForSin(sin: string): ReprobateSubtype {
  switch (sin) {
    case 'gula':
      return 'glutton';
    case 'luxuria':
      return 'degenerate';
    case 'avaritia':
      return 'gambler';
    case 'tristitia':
      return 'nihilist';
    case 'ira':
      return 'choleric';
    case 'acedia':
      return 'husk';
    case 'vanagloria':
      return 'celebrity';
    case 'superbia':
      return 'sigma';
    default:
      throw new Error(`unknown sin ${sin}`);
  }
}
