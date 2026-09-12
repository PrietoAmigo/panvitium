/**
 * Apex per-tick invocation effect tests (03 §2.4). Pins:
 *   - Aurevora drain/efficiency curves: base at t=0, rising, finite-guarded
 *   - applyInvocationTickEffects: Aurevora drains gold + accrues duration, dispels at gold 0
 *     (clearing count + duration)
 *   - no apex active → state untouched, no notices
 *   - computeModifiers folds Aurevora's duration-scaled efficiency into playerEfficiencyMul
 *   - the tick surfaces the effects; enter/commit Katabasis clear the duration counter
 *
 * (Astiwihad's per-tick mass-suicide was retired: Astiwihad is now the world-still apex, tested in
 * the tick/Katabasis suites, so it no longer appears here.)
 */
import { describe, expect, it } from 'vitest';
import {
  applyInvocationTickEffects,
  aurevoraDrainPerSecond,
  aurevoraEfficiencyMul,
  AUREVORA_BASE_GOLD_DRAIN_PER_SECOND,
  bn,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  enterKatabasis,
  floor,
  tick,
  type GameState,
} from './index.js';

function fresh(seed = 'apex', t = 0): GameState {
  return createInitialState(seed, t);
}
const goldOf = (s: GameState): number => floor(s.lifetime.gold).toNumber();

/** A state with Aurevora active (count 1) and the given gold / active duration. */
function withAurevora(opts: { gold?: number; duration?: number } = {}): GameState {
  const s = fresh();
  return {
    ...s,
    souls: bn(0),
    lifetime: {
      ...s.lifetime,
      gold: bn(opts.gold ?? 0),
      invocations: { aurevora: 1 },
      ...(opts.duration !== undefined ? { invocationDurations: { aurevora: opts.duration } } : {}),
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

describe('applyInvocationTickEffects — no apex active', () => {
  it('returns the input untouched with no notices', () => {
    const s = { ...fresh(), lifetime: { ...fresh().lifetime, gold: bn(5000) } };
    const r = applyInvocationTickEffects(s, 0.1);
    expect(r.state).toBe(s);
    expect(r.notices).toEqual([]);
  });
});

describe('applyInvocationTickEffects — Aurevora', () => {
  it('drains gold and accrues active duration while gold remains', () => {
    const s = withAurevora({ gold: 1_000_000 });
    const r = applyInvocationTickEffects(s, 1);
    expect(goldOf(r.state)).toBeLessThan(1_000_000);
    expect(goldOf(r.state)).toBe(1_000_000 - AUREVORA_BASE_GOLD_DRAIN_PER_SECOND);
    expect(r.state.lifetime.invocationDurations.aurevora).toBeCloseTo(1, 6);
    expect(r.state.lifetime.invocations.aurevora).toBe(1); // still active
    expect(r.notices).toEqual([]);
  });

  it('dispels at gold 0 when the drain meets or exceeds the pool, clearing count + duration', () => {
    // Gold below one second of base drain → the drain takes it to 0 this tick.
    const s = withAurevora({ gold: 50, duration: 0 });
    const r = applyInvocationTickEffects(s, 1);
    expect(goldOf(r.state)).toBe(0);
    expect(r.state.lifetime.invocations.aurevora).toBeUndefined();
    expect(r.state.lifetime.invocationDurations.aurevora).toBeUndefined();
    expect(r.notices.length).toBe(1);
  });
});

describe('computeModifiers — Aurevora efficiency', () => {
  it('multiplies playerEfficiencyMul by the duration-scaled factor', () => {
    const base = computeModifiers(fresh()).playerEfficiencyMul;
    const s = withAurevora({ duration: 20 });
    const expected = base * aurevoraEfficiencyMul(20);
    expect(computeModifiers(s).playerEfficiencyMul).toBeCloseTo(expected, 6);
  });

  it('is neutral the instant Aurevora is summoned (duration 0 → ×1)', () => {
    const base = computeModifiers(fresh()).playerEfficiencyMul;
    const s = withAurevora({ duration: 0 });
    expect(computeModifiers(s).playerEfficiencyMul).toBeCloseTo(base, 6);
  });
});

describe('Katabasis clears the apex duration counter', () => {
  it('enterKatabasis and commitKatabasis both drop invocationDurations', () => {
    const s = withAurevora({ gold: 1000, duration: 12 });
    expect(enterKatabasis(s).lifetime.invocationDurations.aurevora).toBeUndefined();
    expect(commitKatabasis(s).state.lifetime.invocationDurations.aurevora).toBeUndefined();
  });
});

describe('tick integration', () => {
  it('runs Aurevora’s drain and accrues its duration through a live tick', () => {
    const s = withAurevora({ gold: 1_000_000 });
    const r = tick(s, 1);
    expect(goldOf(r.state)).toBeLessThan(1_000_000);
    expect(r.state.lifetime.invocationDurations.aurevora).toBeCloseTo(1, 6);
  });
});
