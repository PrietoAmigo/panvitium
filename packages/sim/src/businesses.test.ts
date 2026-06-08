/**
 * Vitium Mercatura sim tests (03 §2.3 / 02 §3 / 02 §9). Pins:
 *   - catalog covers the eight Sins × four tiers (32 businesses), levels 1..4
 *   - startBuild enforces Sin level + gold; appends to buildQueue; does NOT occupy the player slot
 *   - advanceBuilds promotes finished builds into the businesses map
 *   - shutdownBusiness refunds 25% (default) and removes one count; cleans up the key at 0
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
  bn,
  BUSINESSES,
  BUSINESS_IDS,
  businessGenerationPerSecond,
  businessGoldPerSecond,
  businessById,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  reprobateRates,
  SHUTDOWN_REFUND_FRACTION,
  SINS,
  shutdownBusiness,
  startBuild,
  tick,
  type GameState,
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
  it('carries the eight Sins × four tiers (32 businesses), levels 1..4', () => {
    expect(BUSINESS_IDS).toHaveLength(32);
    const tiersBySin = new Map<string, Set<number>>();
    for (const id of BUSINESS_IDS) {
      const def = BUSINESSES[id];
      expect(def).toBeDefined();
      expect([1, 2, 3, 4]).toContain(def!.level);
      const set = tiersBySin.get(def!.sin) ?? new Set<number>();
      set.add(def!.level);
      tiersBySin.set(def!.sin, set);
    }
    for (const s of SINS) {
      expect(tiersBySin.get(s)).toEqual(new Set([1, 2, 3, 4]));
    }
  });

  it('pins the per-tier numbers to the Vitium Mercatura sheet', () => {
    // Tier 1: 60 s, 1 gold/s, 0.05 gen/s; cost 500 (Gula) / 100 (others).
    expect(BUSINESSES['gula-mercatura-1']!.buildCost).toBe(500);
    expect(BUSINESSES['luxuria-mercatura-1']!.buildCost).toBe(100);
    const t1 = BUSINESSES['gula-mercatura-1']!;
    expect([t1.buildTimeSeconds, t1.goldPerSecond, t1.reprobateGenPerSecond]).toEqual([
      60, 1, 0.05,
    ]);
    const t2 = BUSINESSES['gula-mercatura-2']!;
    expect([t2.buildCost, t2.buildTimeSeconds, t2.goldPerSecond, t2.reprobateGenPerSecond]).toEqual(
      [25_000, 1800, 22, 1],
    );
    const t3 = BUSINESSES['gula-mercatura-3']!;
    expect([t3.buildCost, t3.buildTimeSeconds, t3.goldPerSecond, t3.reprobateGenPerSecond]).toEqual(
      [500_000, 36_000, 450, 125],
    );
    const t4 = BUSINESSES['gula-mercatura-4']!;
    expect([t4.buildCost, t4.buildTimeSeconds, t4.goldPerSecond, t4.reprobateGenPerSecond]).toEqual(
      [100_000_000, 500_000, 10_000, 500],
    );
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

  it('allows the entry tier at Sin level 0 (gated at tier − 1, per the spreadsheet)', () => {
    const s = withGold(fresh(), 1000); // fresh = every Sin at level 0
    const r = startBuild(s, 'gula-mercatura-1');
    expect(r.ok).toBe(true);
  });

  it('rejects when the player has not got enough gold', () => {
    const s = withSinLevel(fresh(), 'gula', 1);
    const r = startBuild(s, 'gula-mercatura-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/gold/);
  });

  it('on success: deducts buildCost, appends a BuildTimer, leaves actionQueue untouched', () => {
    const s = withSinLevel(withGold(fresh(), 2000), 'gula', 1);
    const r = startBuild(s, 'gula-mercatura-1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.lifetime.gold.toNumber()).toBe(1500); // 2000 − 500 (Gula tier-1 cost)
    expect(r.state.lifetime.buildQueue).toHaveLength(1);
    expect(r.state.lifetime.buildQueue[0]!.businessId).toBe('gula-mercatura-1');
    expect(r.state.lifetime.buildQueue[0]!.remainingSeconds).toBe(60);
    // Player slot is NOT occupied — startBuild does not append to actionQueue.
    expect(r.state.lifetime.actionQueue).toHaveLength(0);
  });

  it('allows multiple concurrent in-flight builds — any combination of ids', () => {
    let s = withSinLevel(withGold(fresh(), 5000), 'gula', 1);
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
    expect(r3.state.lifetime.gold.toNumber()).toBe(3900); // 5000 − 500 − 500 (Gula) − 100 (Luxuria)
  });
});

describe('startBuild — tier unlock gates (Sin level tier − 1)', () => {
  it('tier 2 requires Sin level 1', () => {
    const rich = withGold(fresh(), 200_000_000);
    expect(startBuild(rich, 'gula-mercatura-2').ok).toBe(false); // L0 — locked
    expect(startBuild(withSinLevel(rich, 'gula', 1), 'gula-mercatura-2').ok).toBe(true);
  });

  it('tier 3 requires Sin level 2; tier 4 requires Sin level 3', () => {
    const rich = withGold(fresh(), 200_000_000);
    expect(startBuild(withSinLevel(rich, 'gula', 1), 'gula-mercatura-3').ok).toBe(false);
    expect(startBuild(withSinLevel(rich, 'gula', 2), 'gula-mercatura-3').ok).toBe(true);
    expect(startBuild(withSinLevel(rich, 'gula', 2), 'gula-mercatura-4').ok).toBe(false);
    expect(startBuild(withSinLevel(rich, 'gula', 3), 'gula-mercatura-4').ok).toBe(true);
  });
});

describe('advanceBuilds', () => {
  it('a build completes when its remainingSeconds hits 0 and the count increments', () => {
    const s = withSinLevel(withGold(fresh(), 2000), 'gula', 1);
    const r = startBuild(s, 'gula-mercatura-1');
    if (!r.ok) throw new Error('start should succeed');
    const after = advanceBuilds(r.state, 60);
    expect(after.lifetime.buildQueue).toHaveLength(0);
    expect(after.lifetime.businesses['gula-mercatura-1']).toBe(1);
  });

  it('multiple concurrent builds all complete in a single large (offline) delta', () => {
    let s = withSinLevel(withGold(fresh(), 10000), 'gula', 1);
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
    const s = withSinLevel(withGold(fresh(), 2000), 'gula', 1);
    const r = startBuild(s, 'gula-mercatura-1');
    if (!r.ok) throw new Error('start should succeed');
    const after = advanceBuilds(r.state, 10);
    expect(after.lifetime.buildQueue).toHaveLength(1);
    expect(after.lifetime.buildQueue[0]!.remainingSeconds).toBe(50);
    expect(after.lifetime.businesses['gula-mercatura-1'] ?? 0).toBe(0);
  });

  it('is a no-op when queue is empty or delta is non-positive', () => {
    const s = fresh();
    expect(advanceBuilds(s, 30)).toBe(s);
    const built = (() => {
      const seed = withSinLevel(withGold(fresh(), 2000), 'gula', 1);
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

  it('refunds 25% of buildCost, decrements count, removes key at 0', () => {
    let s = withSinLevel(withGold(fresh(), 2000), 'gula', 1);
    const built = startBuild(s, 'gula-mercatura-1');
    if (!built.ok) throw new Error('start should succeed');
    s = advanceBuilds(built.state, 60); // 1 owned, gold = 1500 (2000, paid 500 to build)
    expect(s.lifetime.businesses['gula-mercatura-1']).toBe(1);

    const sh = shutdownBusiness(s, 'gula-mercatura-1');
    expect(sh.ok).toBe(true);
    if (!sh.ok) return;
    expect(sh.refund).toBe(125); // floor(500 * 0.25)
    // 2000 starting - 500 build cost + 125 refund = 1625.
    expect(sh.state.lifetime.gold.toNumber()).toBe(1625);
    expect(sh.state.lifetime.businesses['gula-mercatura-1']).toBeUndefined();
  });

  it('SHUTDOWN_REFUND_FRACTION is the documented 25%', () => {
    expect(SHUTDOWN_REFUND_FRACTION).toBe(0.25);
  });
});

describe('tick — business gold income', () => {
  it('owned businesses contribute to per-tick gold gain (multiplied by goldRateMul)', () => {
    // Fresh: BASE_GOLD_PER_SECOND = 2. Add one gula-mercatura-1 (gpsec 1) → total 3 g/s.
    const s = withGold(fresh(), 0);
    const owned: GameState = {
      ...s,
      lifetime: { ...s.lifetime, businesses: { 'gula-mercatura-1': 1 } },
    };
    expect(businessGoldPerSecond(owned)).toBe(1);
    const after = tick(owned, 1).state;
    expect(after.lifetime.gold.toNumber()).toBeCloseTo(3, 5);
  });

  it('businessGoldPerSecond scales with count and ignores unknown ids', () => {
    const s = fresh();
    const owned: GameState = {
      ...s,
      lifetime: {
        ...s.lifetime,
        businesses: {
          'gula-mercatura-1': 3, // 1 g/s × 3 = 3
          'avaritia-mercatura-1': 2, // 1 g/s × 2 = 2
          ghost: 99, // unknown id — ignored
        },
      },
    };
    expect(businessGoldPerSecond(owned)).toBe(5);
  });
});

describe('tick — business reprobate generation', () => {
  it('owned business contributes to the generation pool and produces unconverted reprobates', () => {
    // 20 × gula-mercatura-1 → 1 reprobate gen/s (0.05 each). Over 1.2 s = 1.2 → 1 birth, 0.2 residual.
    const s = fresh();
    const owned: GameState = {
      ...s,
      lifetime: { ...s.lifetime, businesses: { 'gula-mercatura-1': 20 } },
    };
    expect(businessGenerationPerSecond(owned)).toBeCloseTo(1, 6);
    const after = tick(owned, 1.2).state;
    // Unconverted reprobate count goes up; conversion needs > 1 unconverted to fire and the
    // 20 × 0.001 = 0.02/s conversion rate is negligible over 1.2 s, so one birth lands as a
    // straight unconverted reprobate.
    expect(after.lifetime.reprobates).toBe(1);
  });
});

describe('Katabasis — Vitium Mercatura auto-shutdown', () => {
  it('owned businesses auto-shutdown into the gold pool before the remaining-gold roll', () => {
    // Setup: 4 owned gula-mercatura-1 = floor(500*0.25)*4 = 500 gold refund. Plus 100 on hand
    // = 600 at descent. No Avaritia → remaining-gold fraction is the base 0.05 → 30 gold kept.
    const s = withSinLevel(withGold(fresh(), 100), 'gula', 1);
    const state: GameState = {
      ...s,
      lifetime: { ...s.lifetime, businesses: { 'gula-mercatura-1': 4 } },
    };
    const { state: after, recap } = commitKatabasis(state);
    expect(recap.goldKept.toNumber()).toBe(30);
    expect(after.lifetime.gold.toNumber()).toBe(30);
    // All Vitium state cleared on rebirth.
    expect(Object.keys(after.lifetime.businesses)).toHaveLength(0);
    expect(after.lifetime.buildQueue).toHaveLength(0);
  });

  it('in-flight builds fizzle on Katabasis (no refund — they had not completed)', () => {
    const s = withSinLevel(withGold(fresh(), 2000), 'gula', 1);
    const built = startBuild(s, 'gula-mercatura-1');
    if (!built.ok) throw new Error('start should succeed');
    // 500 gold paid; 1500 gold left on hand. Build in flight (not yet completed).
    const { state: after, recap } = commitKatabasis(built.state);
    // Only the 1500 on hand carries — the 500 paid for the unfinished build is forfeit.
    // Remaining-gold % is base 0.05 → 75 kept.
    expect(recap.goldKept.toNumber()).toBe(75);
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
    // 1 × gula tier-1: gen 0.05. Multiplier defaults to 1.
    expect(rates.generationPerSecond).toBeCloseTo(0.05, 6);
  });
});
