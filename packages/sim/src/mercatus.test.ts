/**
 * The Mercatus system (Vitium Mercatura rework spec §1) — pinned behaviours:
 *   - invest cost curve floor(C0·r^d) and the closed-form cumulative cost
 *   - unlock at Sin level 1; depth cap 10 × sinLevel
 *   - penetration math 1 − e^(−a·d)
 *   - revenue × population coupling in `tick`, incl. vitiumMercaturaOutputMul and goldRateMul
 *     composition at the same site the legacy businessGoldPerSecond occupied
 *   - generation-pool contribution genPerDepth × d
 *   - divest refund against the closed form, incl. the Vine #45 sigil lifting the fraction
 *   - Katabasis liquidation ordering: refund folds into gold BEFORE the remaining-gold roll
 *   - offline catch-up equivalence: one big tick accrues at the same per-second rate
 */
import { describe, expect, it } from 'vitest';
import {
  bindSigil,
  bn,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  cumulativeInvestCost,
  divestFraction,
  divestMercatus,
  enterKatabasis,
  floor,
  investCost,
  investMercatus,
  liquidateMercatus,
  mercatusDepth,
  mercatusDepthCap,
  mercatusGenerationPerSecond,
  mercatusRevenuePerSecond,
  mercatusUnlocked,
  penetration,
  perSecondRates,
  reprobateRates,
  tick,
  totalMercatusDepth,
  BASE_GOLD_PER_SECOND,
  BASE_REMAINING_GOLD,
  MERCATUS_C0,
  MERCATUS_COST_RATIO,
  type GameState,
  type Sin,
} from './index.js';

function fresh(seed = 'mercatus', t = 0): GameState {
  return createInitialState(seed, t);
}
const goldOf = (s: GameState): number => floor(s.lifetime.gold).toNumber();

function withDevotion(s: GameState, sin: Sin, level: number): GameState {
  return { ...s, devotion: { ...s.devotion, [sin]: bn(180 ** level) } };
}
function withGold(s: GameState, v: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, gold: bn(v) } };
}
function withDepths(s: GameState, depths: Partial<Record<Sin, number>>): GameState {
  return { ...s, lifetime: { ...s.lifetime, mercatusDepths: depths } };
}
function withReprobates(s: GameState, n: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, reprobates: n } };
}

describe('Mercatus — invest cost curve and cumulative closed form (§1.1)', () => {
  it('investCost(d) = floor(C0 × r^d)', () => {
    expect(investCost(0)).toBe(50);
    expect(investCost(1)).toBe(80);
    expect(investCost(2)).toBe(128);
    expect(investCost(5)).toBe(Math.floor(50 * 1.6 ** 5)); // 524
  });

  it('cumulativeInvestCost is the closed form C0 × (r^d − 1)/(r − 1)', () => {
    expect(cumulativeInvestCost(0)).toBe(0);
    expect(cumulativeInvestCost(1)).toBeCloseTo(50, 9);
    expect(cumulativeInvestCost(2)).toBeCloseTo(130, 9); // 50 + 80
    const d = 7;
    expect(cumulativeInvestCost(d)).toBeCloseTo(
      (MERCATUS_C0 * (MERCATUS_COST_RATIO ** d - 1)) / (MERCATUS_COST_RATIO - 1),
      9,
    );
  });
});

describe('Mercatus — unlock at Sin level 1, depth cap 10 × sinLevel (§1.1)', () => {
  it('refuses to invest while the Sin is below level 1', () => {
    const s = withGold(fresh(), 1_000_000);
    expect(mercatusUnlocked(s, 'gula')).toBe(false);
    const r = investMercatus(s, 'gula');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/level 1/);
  });

  it('caps depth at 10 × sinLevel and lifts the cap with the next level', () => {
    let s = withGold(withDevotion(fresh(), 'gula', 1), 1e12);
    expect(mercatusDepthCap(s, 'gula')).toBe(10);
    for (let i = 0; i < 10; i++) {
      const r = investMercatus(s, 'gula');
      if (!r.ok) throw new Error(`invest ${i} failed: ${r.reason}`);
      s = r.state;
    }
    expect(mercatusDepth(s, 'gula')).toBe(10);
    const refused = investMercatus(s, 'gula');
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toMatch(/no deeper/);
    // Sin level 2 → cap 20: the same trade deepens again.
    s = withDevotion(s, 'gula', 2);
    expect(mercatusDepthCap(s, 'gula')).toBe(20);
    expect(investMercatus(s, 'gula').ok).toBe(true);
  });

  it('invest pays floor(C0·r^d) and refuses when the gold is short', () => {
    const s = withGold(withDevotion(fresh(), 'gula', 1), 49);
    expect(investMercatus(s, 'gula').ok).toBe(false);
    const funded = withGold(s, 130);
    const r1 = investMercatus(funded, 'gula');
    if (!r1.ok) throw new Error(r1.reason);
    expect(goldOf(r1.state)).toBe(80); // paid 50
    const r2 = investMercatus(r1.state, 'gula');
    if (!r2.ok) throw new Error(r2.reason);
    expect(goldOf(r2.state)).toBe(0); // paid 80
    expect(mercatusDepth(r2.state, 'gula')).toBe(2);
  });
});

describe('Mercatus — penetration and revenue (§1.2)', () => {
  it('penetration(d) = 1 − e^(−0.15·d): 0 at depth 0, rising, asymptotic to 1', () => {
    expect(penetration(0)).toBe(0);
    expect(penetration(10)).toBeCloseTo(1 - Math.exp(-1.5), 9);
    expect(penetration(20)).toBeGreaterThan(penetration(10));
    expect(penetration(1000)).toBeLessThanOrEqual(1);
  });

  it('revenue/s = spendPerCapita × reprobates × penetration(d)', () => {
    const s = withReprobates(withDepths(fresh(), { gula: 5 }), 1000);
    expect(mercatusRevenuePerSecond(s, 'gula')).toBeCloseTo(0.1 * 1000 * (1 - Math.exp(-0.75)), 9);
    expect(mercatusRevenuePerSecond(s, 'ira')).toBe(0); // depth 0 ⇒ no reach, no take
  });
});

describe('Mercatus — revenue × population coupling in tick (§1.2)', () => {
  it('gold accrues as (base + mercatus × vmMul) × goldRateMul, like the old business site', () => {
    // Avaritia devotion lifts goldRateMul; a Plutus invocation lifts vitiumMercaturaOutputMul.
    let s = withReprobates(withDepths(fresh(), { gula: 10 }), 500);
    s = withDevotion(s, 'avaritia', 2);
    s = { ...s, lifetime: { ...s.lifetime, invocations: { plutus: 1 } } };
    const mods = computeModifiers(s);
    expect(mods.vitiumMercaturaOutputMul).toBeGreaterThan(1);
    expect(mods.goldRateMul).toBeGreaterThan(1);
    const revenue = mercatusRevenuePerSecond(s, 'gula'); // no active VC ⇒ no Foedus bonus
    const expected =
      (BASE_GOLD_PER_SECOND + revenue * mods.vitiumMercaturaOutputMul) * mods.goldRateMul;
    const before = s.lifetime.gold.toNumber();
    const after = tick(s, 1).state.lifetime.gold.toNumber();
    expect(after - before).toBeCloseTo(expected, 6);
    // The HUD readout mirrors the same block.
    expect(perSecondRates(s).gold).toBeCloseTo(expected, 9);
  });
});

describe('Mercatus — generation contribution (§1.3)', () => {
  it('generation/s = genPerDepth × depth per trade, summed, × vmMul into the pool rates', () => {
    const s = withDepths(fresh(), { gula: 5, ira: 10 });
    expect(mercatusGenerationPerSecond(s)).toBeCloseTo(0.02 * 15, 9);
    const mods = computeModifiers(s);
    const rates = reprobateRates(s, mods);
    expect(rates.generationPerSecond).toBeCloseTo(
      0.02 * 15 * mods.vitiumMercaturaOutputMul * mods.reprobateGenerationRateMul,
      9,
    );
    expect(totalMercatusDepth(s)).toBe(15);
  });
});

describe('Mercatus — divest refund, incl. Vine #45 (§1.1)', () => {
  it('refunds floor(divestFraction × closed-form cost of the divested depths)', () => {
    const s = withDepths(withGold(fresh(), 0), { gula: 3 });
    const one = divestMercatus(s, 'gula', 1);
    if (!one.ok) throw new Error(one.reason);
    // cumulative(3) − cumulative(2) = 50·1.6² = 128; × 0.25 = 32.
    expect(one.refund).toBe(32);
    expect(mercatusDepth(one.state, 'gula')).toBe(2);
    const all = divestMercatus(one.state, 'gula', 99); // clamped to the remaining 2
    if (!all.ok) throw new Error(all.reason);
    expect(all.refund).toBe(Math.floor(0.25 * cumulativeInvestCost(2)));
    expect(mercatusDepth(all.state, 'gula')).toBe(0);
    expect('gula' in all.state.lifetime.mercatusDepths).toBe(false); // key dropped at 0
    expect(divestMercatus(all.state, 'gula').ok).toBe(false); // nothing left to cut
  });

  it('a bound Vine #45 lifts the fraction the refund uses', () => {
    let s = withDepths(withGold(fresh(), 0), { gula: 3 });
    s = bindSigil({ ...s, souls: bn(1_000_000) }, 45, 1_000_000);
    expect(divestFraction(s)).toBeCloseTo(0.5, 6);
    const r = divestMercatus(s, 'gula', 1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.refund).toBe(64); // 128 × 0.5
  });
});

describe('Mercatus — Katabasis liquidation ordering (§1.4)', () => {
  it('the liquidation refund participates in the remaining-gold roll, not at face value', () => {
    const s = withDepths(withGold(fresh(), 1000), { gula: 4 });
    const { recap } = commitKatabasis(s);
    // refund = floor(0.25 × cumulative(4)) = 115; kept = floor((1000 + 115) × 0.05) = 55 —
    // NOT floor(1000 × 0.05) + 115 = 165, which face-value ordering would give.
    const refund = Math.floor(0.25 * cumulativeInvestCost(4));
    expect(refund).toBe(115);
    expect(recap.goldKept.toNumber()).toBe(Math.floor((1000 + refund) * BASE_REMAINING_GOLD));
  });

  it('enterKatabasis liquidates immediately; depths reset with the lifetime', () => {
    const s = withDepths(withGold(fresh(), 1000), { gula: 4, superbia: 2 });
    const entered = enterKatabasis(s);
    expect(Object.keys(entered.lifetime.mercatusDepths)).toHaveLength(0);
    expect(goldOf(entered)).toBe(1000 + 115 + Math.floor(0.25 * cumulativeInvestCost(2)));
    // The defensive repeat at commit is a no-op on the already-liquidated state.
    const { state: risen } = commitKatabasis(entered);
    expect(Object.keys(risen.lifetime.mercatusDepths)).toHaveLength(0);
    expect(liquidateMercatus(risen)).toBe(risen); // idempotent: same reference when empty
  });
});

describe('Mercatus — offline catch-up equivalence (ADR-004)', () => {
  it('one big tick accrues mercatus gold at the same per-second rate as a live tick', () => {
    const s = withReprobates(withDepths(fresh(), { gula: 8 }), 200);
    const rate = perSecondRates(s).gold;
    const small = tick(s, 0.1).state.lifetime.gold.toNumber();
    expect(small - s.lifetime.gold.toNumber()).toBeCloseTo(rate * 0.1, 9);
    const big = tick(s, 100).state.lifetime.gold.toNumber();
    expect(big - s.lifetime.gold.toNumber()).toBeCloseTo(rate * 100, 6);
  });
});
