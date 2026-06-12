/**
 * Foedera (Vitium Mercatura rework spec §2) — pinned behaviours:
 *   - foedusTier boundaries on the SHALLOWEST member depth (9/10/19/20/40), capped at 4
 *   - the VC upkeep discount 1 − 0.125 × tier at the step-0 upkeep site, incl. a ramped
 *     (percentage-style) upkeep — Panvitium's eᵗ takes the same multiplier on its computed cost
 *   - the Mercatus revenue bonus 1 + 0.05 × tier applies only while the ceremony is ACTIVE
 *   - several active ceremonies sharing a Sin stack multiplicatively on that trade
 *   - the per-VC foedusOptOut flag suppresses both sides
 */
import { describe, expect, it } from 'vitest';
import {
  advanceToggles,
  bn,
  compositumFoedusUpkeepMul,
  createInitialState,
  foedusRevenueContribution,
  foedusRevenueMul,
  foedusTier,
  foedusUpkeepMul,
  highestFoedusTierForSin,
  mercatusGoldPerSecond,
  mercatusRevenuePerSecond,
  COMPOSITA,
  SINS,
  type CompositumDef,
  type GameState,
  type Sin,
} from './index.js';

function fresh(seed = 'foedera', t = 0): GameState {
  return createInitialState(seed, t);
}
function withDepths(s: GameState, depths: Partial<Record<Sin, number>>): GameState {
  return { ...s, lifetime: { ...s.lifetime, mercatusDepths: depths } };
}
function withActive(s: GameState, ...ids: string[]): GameState {
  return { ...s, lifetime: { ...s.lifetime, activeToggles: ids } };
}
function funded(s: GameState, gold: number, influence: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, gold: bn(gold), influence: bn(influence) } };
}

const PAIR: readonly Sin[] = ['gula', 'luxuria']; // Bacchanal's member set

describe('foedusTier — boundaries on the shallowest member depth (§2)', () => {
  it('steps at multiples of 10 and caps at tier 4', () => {
    const t = (gula: number, luxuria: number): number =>
      foedusTier(withDepths(fresh(), { gula, luxuria }), PAIR);
    expect(t(9, 40)).toBe(0); // min 9 → below the first step
    expect(t(10, 40)).toBe(1);
    expect(t(19, 40)).toBe(1);
    expect(t(20, 40)).toBe(2);
    expect(t(40, 40)).toBe(4);
    expect(t(55, 55)).toBe(4); // capped at MAX_FOEDUS_TIER
    expect(t(40, 0)).toBe(0); // one missing trade breaks the whole Foedus
  });

  it('Panvitium spans all eight Sins: its tier follows the shallowest of the eight', () => {
    const all40 = Object.fromEntries(SINS.map((s) => [s, 40])) as Partial<Record<Sin, number>>;
    const panv = COMPOSITA.panvitium!;
    expect(foedusTier(withDepths(fresh(), all40), panv.sins)).toBe(4);
    expect(foedusTier(withDepths(fresh(), { ...all40, acedia: 9 }), panv.sins)).toBe(0);
  });
});

describe('Foedus — VC upkeep discount at the step-0 site (§2)', () => {
  it('a tier-4 Foedus halves Bacchanal\u2019s per-second cost', () => {
    expect(foedusUpkeepMul(4)).toBeCloseTo(0.5, 9);
    let s = withDepths(fresh(), { gula: 40, luxuria: 40 });
    s = funded(withActive(s, 'bacchanal'), 1000, 100);
    const { state: after, deactivated } = advanceToggles(s, 1);
    expect(deactivated).toHaveLength(0);
    // Base 100 gold + 10 influence per second, × 0.5.
    expect(1000 - after.lifetime.gold.toNumber()).toBeCloseTo(50, 6);
    expect(100 - after.lifetime.influence.toNumber()).toBeCloseTo(5, 6);
  });

  it('a ramped upkeep (Panvitium\u2019s eᵗ) takes the same multiplier on its computed cost', () => {
    const all40 = Object.fromEntries(SINS.map((s) => [s, 40])) as Partial<Record<Sin, number>>;
    let s = withDepths(fresh(), all40);
    s = funded(withActive(s, 'panvitium'), 1e9, 1e9);
    s = { ...s, lifetime: { ...s.lifetime, toggleDurations: { panvitium: 1 } } };
    const { state: after } = advanceToggles(s, 1);
    // cost = base × e¹ (duration BEFORE the increment) × 0.5 (tier-4 Foedus) × 1 s.
    expect(1e9 - after.lifetime.gold.toNumber()).toBeCloseTo(1000 * Math.E * 0.5, 3);
    expect(1e9 - after.lifetime.influence.toNumber()).toBeCloseTo(100 * Math.E * 0.5, 4);
  });

  it('tier 0 (shallow roots) leaves the upkeep untouched', () => {
    let s = withDepths(fresh(), { gula: 5, luxuria: 5 });
    s = funded(withActive(s, 'bacchanal'), 1000, 100);
    const { state: after } = advanceToggles(s, 1);
    expect(1000 - after.lifetime.gold.toNumber()).toBeCloseTo(100, 6);
    expect(100 - after.lifetime.influence.toNumber()).toBeCloseTo(10, 6);
  });
});

describe('Foedus — Mercatus revenue bonus, active-only and stacking (§2)', () => {
  it('applies only while the ceremony is active', () => {
    const depths = { gula: 40, luxuria: 40 } as Partial<Record<Sin, number>>;
    const idle = withDepths(
      { ...fresh(), lifetime: { ...fresh().lifetime, reprobates: 100 } },
      depths,
    );
    expect(foedusRevenueMul(idle, 'gula')).toBeCloseTo(1, 9);
    const active = withActive(idle, 'bacchanal');
    expect(foedusRevenueMul(active, 'gula')).toBeCloseTo(1.2, 9); // tier 4 → 1 + 0.05×4
    expect(foedusRevenueMul(active, 'luxuria')).toBeCloseTo(1.2, 9);
    expect(foedusRevenueMul(active, 'ira')).toBeCloseTo(1, 9); // not a member Sin
    expect(highestFoedusTierForSin(active, 'gula')).toBe(4);
    expect(highestFoedusTierForSin(idle, 'gula')).toBe(0);
    // The total feeds the tick exactly as raw × mul.
    expect(mercatusGoldPerSecond(active)).toBeCloseTo(
      mercatusRevenuePerSecond(active, 'gula') * 1.2 +
        mercatusRevenuePerSecond(active, 'luxuria') * 1.2,
      9,
    );
  });

  it('several active ceremonies sharing a Sin stack multiplicatively on that trade', () => {
    // Bacchanal (gula+luxuria) at tier 4 and Dolce Far Niente (gula+acedia) at tier 1 share gula.
    const depths = { gula: 40, luxuria: 40, acedia: 10 } as Partial<Record<Sin, number>>;
    let s = withDepths(fresh(), depths);
    s = { ...s, lifetime: { ...s.lifetime, reprobates: 100 } };
    s = withActive(s, 'bacchanal', 'dolce-far-niente');
    expect(foedusRevenueMul(s, 'gula')).toBeCloseTo(1.2 * 1.05, 9);
    expect(foedusRevenueMul(s, 'luxuria')).toBeCloseTo(1.2, 9);
    expect(foedusRevenueMul(s, 'acedia')).toBeCloseTo(1.05, 9);
    expect(highestFoedusTierForSin(s, 'gula')).toBe(4);
  });

  it('foedusOptOut suppresses both the revenue bonus and the upkeep discount', () => {
    const s = withActive(withDepths(fresh(), { gula: 40, luxuria: 40 }), 'bacchanal');
    const base = COMPOSITA.bacchanal!;
    const optOut: CompositumDef = { ...base, foedusOptOut: true };
    // Revenue side: an opted-out ceremony contributes ×1; the live (all-on) def contributes ×1.2.
    expect(foedusRevenueContribution(s, base, 'gula')).toBeCloseTo(1.2, 9);
    expect(foedusRevenueContribution(s, optOut, 'gula')).toBeCloseTo(1, 9);
    // Upkeep side: an opted-out ceremony pays full price regardless of depth.
    expect(compositumFoedusUpkeepMul(s, base)).toBeCloseTo(0.5, 9);
    expect(compositumFoedusUpkeepMul(s, optOut)).toBeCloseTo(1, 9);
  });
});
