/**
 * Apex per-tick invocation effect tests (03 §2.4). Pins:
 *   - Aurevora drain/efficiency curves: base at t=0, rising, finite-guarded
 *   - Astiwihad trigger chance: exact geometric integration, bounded, monotone in delta
 *   - applyInvocationTickEffects: Aurevora drains gold + accrues duration, dispels at gold 0
 *     (clearing count + duration); Astiwihad wipes the whole population and mints one soul each
 *   - no apex active → state untouched, no notices, no RNG perturbation
 *   - computeModifiers folds Aurevora's duration-scaled efficiency into playerEfficiencyMul
 *   - the tick surfaces the effects; enter/commit Katabasis clear the duration counter
 */
import { describe, expect, it } from 'vitest';
import {
  applyInvocationTickEffects,
  astiwihadTriggerChance,
  aurevoraDrainPerSecond,
  aurevoraEfficiencyMul,
  AUREVORA_BASE_GOLD_DRAIN_PER_SECOND,
  bn,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  enterKatabasis,
  floor,
  makeRng,
  tick,
  totalReprobates,
  type GameState,
} from './index.js';

function fresh(seed = 'apex', t = 0): GameState {
  return createInitialState(seed, t);
}
const goldOf = (s: GameState): number => floor(s.lifetime.gold).toNumber();
const soulsOf = (s: GameState): number => floor(s.souls).toNumber();

/** A state with `id` active (count 1) and the given gold / reprobate population. */
function withApex(
  id: 'astiwihad' | 'aurevora',
  opts: { gold?: number; reprobates?: number; duration?: number } = {},
): GameState {
  const s = fresh();
  const reprobates = opts.reprobates ?? 0;
  return {
    ...s,
    souls: bn(0),
    lifetime: {
      ...s.lifetime,
      gold: bn(opts.gold ?? 0),
      reprobates,
      invocations: { [id]: 1 },
      ...(opts.duration !== undefined ? { invocationDurations: { [id]: opts.duration } } : {}),
    },
  };
}

describe('Aurevora curves', () => {
  it('drain starts at the base and rises with active duration', () => {
    expect(aurevoraDrainPerSecond(0)).toBeCloseTo(AUREVORA_BASE_GOLD_DRAIN_PER_SECOND, 6);
    expect(aurevoraDrainPerSecond(10)).toBeGreaterThan(aurevoraDrainPerSecond(0));
    expect(aurevoraDrainPerSecond(100)).toBeGreaterThan(aurevoraDrainPerSecond(10));
  });

  it('efficiency is 1 at t=0, rises after, and is finite-guarded for huge durations', () => {
    expect(aurevoraEfficiencyMul(0)).toBe(1);
    expect(aurevoraEfficiencyMul(10)).toBeGreaterThan(1);
    expect(aurevoraEfficiencyMul(100)).toBeGreaterThan(aurevoraEfficiencyMul(10));
    expect(Number.isFinite(aurevoraEfficiencyMul(1e9))).toBe(true);
  });
});

describe('Astiwihad trigger chance', () => {
  it('is 0 for a non-positive delta and tiny for one tick', () => {
    expect(astiwihadTriggerChance(0)).toBe(0);
    expect(astiwihadTriggerChance(0.1)).toBeGreaterThan(0);
    expect(astiwihadTriggerChance(0.1)).toBeLessThan(0.001);
  });

  it('is monotone in delta and saturates toward (but stays within) certainty', () => {
    expect(astiwihadTriggerChance(100)).toBeGreaterThan(astiwihadTriggerChance(1));
    // A large but realistic offline window: near-certain, yet still strictly below 1.
    const big = astiwihadTriggerChance(1e5);
    expect(big).toBeGreaterThan(0.999);
    expect(big).toBeLessThan(1);
    // An extreme span saturates to exactly 1 in floating point — never exceeds it.
    expect(astiwihadTriggerChance(1e7)).toBeLessThanOrEqual(1);
  });
});

describe('applyInvocationTickEffects — no apex active', () => {
  it('returns the input untouched with no notices', () => {
    const s = { ...fresh(), lifetime: { ...fresh().lifetime, gold: bn(5000) } };
    const r = applyInvocationTickEffects(s, 0.1, makeRng(s.rngState));
    expect(r.state).toBe(s);
    expect(r.notices).toEqual([]);
  });
});

describe('applyInvocationTickEffects — Aurevora', () => {
  it('drains gold and accrues active duration while gold remains', () => {
    const s = withApex('aurevora', { gold: 1_000_000 });
    const r = applyInvocationTickEffects(s, 1, makeRng(s.rngState));
    expect(goldOf(r.state)).toBeLessThan(1_000_000);
    expect(goldOf(r.state)).toBe(1_000_000 - AUREVORA_BASE_GOLD_DRAIN_PER_SECOND);
    expect(r.state.lifetime.invocationDurations.aurevora).toBeCloseTo(1, 6);
    expect(r.state.lifetime.invocations.aurevora).toBe(1); // still active
    expect(r.notices).toEqual([]);
  });

  it('dispels at gold 0 when the drain meets or exceeds the pool, clearing count + duration', () => {
    // Gold below one second of base drain → the drain takes it to 0 this tick.
    const s = withApex('aurevora', { gold: 50, duration: 0 });
    const r = applyInvocationTickEffects(s, 1, makeRng(s.rngState));
    expect(goldOf(r.state)).toBe(0);
    expect(r.state.lifetime.invocations.aurevora).toBeUndefined();
    expect(r.state.lifetime.invocationDurations.aurevora).toBeUndefined();
    expect(r.notices.length).toBe(1);
  });
});

describe('applyInvocationTickEffects — Astiwihad', () => {
  it('wipes the whole population and mints one soul per reprobate on a (forced) trigger', () => {
    // A huge delta makes the trigger chance ≈ 1, so the roll fires regardless of seed.
    const s = withApex('astiwihad', { reprobates: 250 });
    expect(totalReprobates(s)).toBe(250);
    const r = applyInvocationTickEffects(s, 1e7, makeRng(s.rngState));
    expect(totalReprobates(r.state)).toBe(0);
    expect(soulsOf(r.state)).toBe(250);
    expect(r.notices.length).toBe(1);
  });

  it('does nothing (no souls, no notice) when there is no population to take', () => {
    const s = withApex('astiwihad', { reprobates: 0 });
    const r = applyInvocationTickEffects(s, 1e7, makeRng(s.rngState));
    expect(soulsOf(r.state)).toBe(0);
    expect(r.notices).toEqual([]);
  });
});

describe('computeModifiers — Aurevora efficiency', () => {
  it('multiplies playerEfficiencyMul by the duration-scaled factor', () => {
    const base = computeModifiers(fresh()).playerEfficiencyMul;
    const s = withApex('aurevora', { duration: 20 });
    const expected = base * aurevoraEfficiencyMul(20);
    expect(computeModifiers(s).playerEfficiencyMul).toBeCloseTo(expected, 6);
  });

  it('is neutral the instant Aurevora is summoned (duration 0 → ×1)', () => {
    const base = computeModifiers(fresh()).playerEfficiencyMul;
    const s = withApex('aurevora', { duration: 0 });
    expect(computeModifiers(s).playerEfficiencyMul).toBeCloseTo(base, 6);
  });
});

describe('Katabasis clears the apex duration counter', () => {
  it('enterKatabasis and commitKatabasis both drop invocationDurations', () => {
    const s = withApex('aurevora', { gold: 1000, duration: 12 });
    expect(enterKatabasis(s).lifetime.invocationDurations.aurevora).toBeUndefined();
    expect(commitKatabasis(s).state.lifetime.invocationDurations.aurevora).toBeUndefined();
  });
});

describe('tick integration', () => {
  it('runs Aurevora\u2019s drain and accrues its duration through a live tick', () => {
    const s = withApex('aurevora', { gold: 1_000_000 });
    const r = tick(s, 1);
    expect(goldOf(r.state)).toBeLessThan(1_000_000);
    expect(r.state.lifetime.invocationDurations.aurevora).toBeCloseTo(1, 6);
  });

  it('surfaces an Astiwihad wipe as a notice and banks the souls', () => {
    const s = withApex('astiwihad', { reprobates: 40 });
    const r = tick(s, 1e7);
    expect(totalReprobates(r.state)).toBe(0);
    expect(soulsOf(r.state)).toBeGreaterThanOrEqual(40);
    expect(r.notices.some((n) => n.includes('Astiwihad'))).toBe(true);
  });
});
