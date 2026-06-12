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
  mercatusCostMul,
  mercatusGenerationClauseMul,
  mercatusRevenueClauseMul,
  MERCATUS_ACEDIA_OFFLINE_PER_DEPTH,
  MERCATUS_IRA_MURDER_PER_DEPTH,
  MERCATUS_TRISTITIA_SUICIDE_PER_DEPTH,
  MERCATUS_VANAGLORIA_INFLUENCE_FRACTION_PER_10_DEPTHS,
  mercatusRevenueWithFoedus,
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
  it('investCost(sin, d) = floor(C0 × r^d × costMul) — ×1 for an unclaused trade', () => {
    expect(investCost('gula', 0)).toBe(50);
    expect(investCost('gula', 1)).toBe(80);
    expect(investCost('gula', 2)).toBe(128);
    expect(investCost('gula', 5)).toBe(Math.floor(50 * 1.6 ** 5)); // 524
  });

  it('cumulativeInvestCost is the closed form C0 × (r^d − 1)/(r − 1) × costMul', () => {
    expect(cumulativeInvestCost('gula', 0)).toBe(0);
    expect(cumulativeInvestCost('gula', 1)).toBeCloseTo(50, 9);
    expect(cumulativeInvestCost('gula', 2)).toBeCloseTo(130, 9); // 50 + 80
    const d = 7;
    expect(cumulativeInvestCost('gula', d)).toBeCloseTo(
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

  it('revenue/s = spendPerCapita × reprobates × penetration(d) for an unclaused trade', () => {
    const s = withReprobates(withDepths(fresh(), { tristitia: 5 }), 1000);
    expect(mercatusRevenuePerSecond(s, 'tristitia')).toBeCloseTo(
      0.1 * 1000 * (1 - Math.exp(-0.75)),
      9,
    );
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
    expect(all.refund).toBe(Math.floor(0.25 * cumulativeInvestCost('gula', 2)));
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
    const refund = Math.floor(0.25 * cumulativeInvestCost('gula', 4));
    expect(refund).toBe(115);
    expect(recap.goldKept.toNumber()).toBe(Math.floor((1000 + refund) * BASE_REMAINING_GOLD));
  });

  it('enterKatabasis liquidates immediately; depths reset with the lifetime', () => {
    const s = withDepths(withGold(fresh(), 1000), { gula: 4, superbia: 2 });
    const entered = enterKatabasis(s);
    expect(Object.keys(entered.lifetime.mercatusDepths)).toHaveLength(0);
    expect(goldOf(entered)).toBe(
      1000 + 115 + Math.floor(0.25 * cumulativeInvestCost('superbia', 2) + 1e-9),
    );
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

describe('Mercatus — per-Sin signature clauses (§1.5, amended)', () => {
  it('Gulae: its patrons spend a quarter more (revenue ×1.25)', () => {
    const s = withReprobates(withDepths(fresh(), { gula: 5, tristitia: 5 }), 1000);
    expect(mercatusRevenueClauseMul('gula')).toBeCloseTo(1.25, 9);
    expect(mercatusRevenuePerSecond(s, 'gula')).toBeCloseTo(
      mercatusRevenuePerSecond(s, 'tristitia') * 1.25,
      9,
    );
  });

  it('Luxuriae: its corruption breeds a quarter richer (generation ×1.25)', () => {
    expect(mercatusGenerationClauseMul('luxuria')).toBeCloseTo(1.25, 9);
    const s = withDepths(fresh(), { luxuria: 10 });
    expect(mercatusGenerationPerSecond(s)).toBeCloseTo(0.02 * 10 * 1.25, 9);
  });

  it('Avaritiae: each depth bargains the next 0.5% cheaper — the discount compounds', () => {
    const rEff = 1.6 * 0.995; // the effective cost ratio of the Avaritiae curve
    expect(mercatusCostMul('avaritia', 1)).toBeCloseTo(0.995, 9);
    expect(mercatusCostMul('avaritia', 3)).toBeCloseTo(0.995 ** 3, 9);
    expect(investCost('avaritia', 0)).toBe(50); // depth 0 pays full — nothing to compound yet
    expect(investCost('avaritia', 1)).toBe(Math.floor(50 * rEff)); // 79 vs the unclaused 80
    expect(investCost('avaritia', 10)).toBe(Math.floor(50 * rEff ** 10));
    expect(investCost('avaritia', 10)).toBeLessThan(investCost('tristitia', 10)); // gap widens
    expect(cumulativeInvestCost('avaritia', 5)).toBeCloseTo((50 * (rEff ** 5 - 1)) / (rEff - 1), 6);
    // Refunds ride the same compounded basis: cumulative(3) − cumulative(2) = 50 × rEff².
    const s = withDepths(withGold(fresh(), 0), { avaritia: 3 });
    const r = divestMercatus(s, 'avaritia', 1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.refund).toBe(Math.floor(0.25 * 50 * rEff ** 2 + 1e-9)); // 31
  });

  it('Superbiae: depths ×1.25 dearer; its take and breeding ×1.33 richer', () => {
    expect(mercatusCostMul('superbia', 7)).toBeCloseTo(1.25, 9); // flat at any depth
    expect(investCost('superbia', 0)).toBe(62); // floor(50 × 1.25)
    expect(mercatusRevenueClauseMul('superbia')).toBeCloseTo(1.33, 9);
    expect(mercatusGenerationClauseMul('superbia')).toBeCloseTo(1.33, 9);
    const s = withReprobates(withDepths(fresh(), { superbia: 5, tristitia: 5 }), 1000);
    expect(mercatusRevenuePerSecond(s, 'superbia')).toBeCloseTo(
      mercatusRevenuePerSecond(s, 'tristitia') * 1.33,
      9,
    );
    expect(mercatusGenerationPerSecond(withDepths(fresh(), { superbia: 10 }))).toBeCloseTo(
      0.02 * 10 * 1.33,
      9,
    );
  });

  it('Tristitiae: +0.825% suicide-rate mul per depth', () => {
    const base = computeModifiers(fresh()).reprobateSuicideRateMul;
    const lifted = computeModifiers(withDepths(fresh(), { tristitia: 20 })).reprobateSuicideRateMul;
    expect(lifted / base).toBeCloseTo(1 + MERCATUS_TRISTITIA_SUICIDE_PER_DEPTH * 20, 9);
  });

  it('Irae: +0.825% murder-rate mul per depth', () => {
    const base = computeModifiers(fresh()).murderRateMul;
    const lifted = computeModifiers(withDepths(fresh(), { ira: 20 })).murderRateMul;
    expect(lifted / base).toBeCloseTo(1 + MERCATUS_IRA_MURDER_PER_DEPTH * 20, 9);
  });

  it('Acediae: +0.825% offline gain rate mul per depth', () => {
    const base = computeModifiers(fresh()).offlineTimeMul;
    const lifted = computeModifiers(withDepths(fresh(), { acedia: 30 })).offlineTimeMul;
    expect(lifted / base).toBeCloseTo(1 + MERCATUS_ACEDIA_OFFLINE_PER_DEPTH * 30, 9);
  });

  it('Acediae: its revenue is exempt from the ×0.5 offline efficiency factor', () => {
    // Half-rate offline tick: every trade's take accrues over the SCALED delta, except Acediae's,
    // which the tick restores to full wall-clock rate via the offlineEfficiency dep.
    const s = withReprobates(withDepths(fresh(), { acedia: 10, tristitia: 10 }), 1000);
    const mods = computeModifiers(s);
    const realSeconds = 100;
    const eff = 0.5;
    const scaled = realSeconds * eff;
    const after = tick(s, scaled, { offlineEfficiency: eff }).state.lifetime.gold.toNumber();
    const acedia = mercatusRevenueWithFoedus(s, 'acedia');
    const tristitia = mercatusRevenueWithFoedus(s, 'tristitia');
    const expected =
      (BASE_GOLD_PER_SECOND * scaled + // base income runs at the slowed clock…
        tristitia * mods.vitiumMercaturaOutputMul * scaled + // …as does every other trade…
        acedia * mods.vitiumMercaturaOutputMul * realSeconds) * // …but Acediae takes full time
      mods.goldRateMul;
    expect(after - s.lifetime.gold.toNumber()).toBeCloseTo(expected, 6);
  });

  it('Vanagloriae: +0.25% of effective max influence as flat influence/s per full 10 depths', () => {
    const base = computeModifiers(fresh()).flatInfluencePerSecond;
    const at9 = computeModifiers(withDepths(fresh(), { vanagloria: 9 })).flatInfluencePerSecond;
    expect(at9).toBeCloseTo(base, 9); // stepped: below the first full 10, nothing
    const s = withDepths(fresh(), { vanagloria: 25 });
    const mods = computeModifiers(s);
    const effectiveMax = s.lifetime.maxInfluence.toNumber() * mods.maxInfluenceMul;
    expect(mods.flatInfluencePerSecond - base).toBeCloseTo(
      MERCATUS_VANAGLORIA_INFLUENCE_FRACTION_PER_10_DEPTHS * 2 * effectiveMax, // floor(25/10) = 2
      9,
    );
  });
});
