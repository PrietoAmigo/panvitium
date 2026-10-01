/**
 * Shared runner-engine tests (02 §3). Pins:
 *   - delegated runners carry out actions for FREE — no per-cycle gold/influence cost
 *   - cost-outcome channels (Suasio) resolve at eff and never stall on an empty treasury
 *   - a large delta resolves every cycle the budget covers
 *   - time-mode channels (Indagatio) never stall and always hold an active cycle
 *   - a forced outcome tier is honoured (Good-only Suggestion: pure gain, no flock-loss tier)
 */
import { describe, expect, it } from 'vitest';
import { advanceRunnerCycles, bn, createInitialState, makeRng, type GameState } from './index.js';

function withInfluence(s: GameState, influence: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, influence: bn(influence) } };
}

function withReprobates(s: GameState, n: number): GameState {
  return {
    ...s,
    lifetime: { ...s.lifetime, reprobates: n },
  };
}

const fresh = (seed = 'runner'): GameState => createInitialState(seed, 0);
const influenceOf = (s: GameState): number => s.lifetime.influence.toNumber();

describe('advanceRunnerCycles — cost-outcome (Suasio)', () => {
  it('resolves a cycle per base duration with no per-cycle resource cost', () => {
    // eff 1 → 1 s/cycle. 3 s of budget resolves exactly 3 cycles. Forced Good isolates the
    // accounting from outcome-driven flock changes.
    const s = withReprobates(withInfluence(fresh(), 50), 1000);
    const r = advanceRunnerCycles(s, 'suggestion', 1, null, 3, makeRng(1), 'good');
    expect(r.events).toHaveLength(3);
    expect(influenceOf(r.state)).toBe(50); // free — influence untouched by the cycles
  });

  it('never stalls on an empty purse — runs the full budget for free', () => {
    // 0 influence at the start; with no per-cycle cost the channel still resolves every cycle the
    // budget covers. 5.5 s / 1 s-per-cycle → 5 forced-Good cycles plus an in-flight 6th, influence
    // stays 0 (a resource stall would have produced no events and a null timer).
    const s = withReprobates(withInfluence(fresh(), 0), 1000);
    const r = advanceRunnerCycles(s, 'suggestion', 1, null, 5.5, makeRng(2), 'good');
    expect(r.events).toHaveLength(5);
    expect(r.remaining).toBeCloseTo(0.5, 6); // an in-flight next cycle, never a resource stall
    expect(influenceOf(r.state)).toBe(0); // nothing spent
  });

  it('a broke channel makes progress immediately (no funding required)', () => {
    const broke = withReprobates(withInfluence(fresh(), 0), 1000);
    const r = advanceRunnerCycles(broke, 'suggestion', 1, null, 1, makeRng(3), 'good');
    expect(r.events).toHaveLength(1);
    expect(influenceOf(r.state)).toBe(0); // resolved for free
  });

  it('a fractional-efficiency channel still produces ≥1 unit at no cost', () => {
    // eff 0.05: units max(1, floor(0.05)) = 1, and the cycle is free.
    const s = withReprobates(withInfluence(fresh(), 10), 1000);
    const r = advanceRunnerCycles(s, 'suggestion', 0.05, null, 10, makeRng(4), 'good');
    expect(influenceOf(r.state)).toBe(10); // unchanged — no cost
    expect(r.state.lifetime.reprobates).toBeGreaterThan(1000); // corrupted ≥1
  });
});

describe('advanceRunnerCycles — forced tier', () => {
  it('Good-only Suggestion is pure gain — free, and never a flock-loss tier', () => {
    // 5 cycles forced Good: each corrupts exactly 1 reprobate; influence is untouched.
    const s = withReprobates(withInfluence(fresh(), 50), 1000);
    const r = advanceRunnerCycles(s, 'suggestion', 1, null, 5, makeRng(5), 'good');
    expect(r.events).toHaveLength(5);
    expect(influenceOf(r.state)).toBe(50); // free — no cost, no Bad/Terrible bite
    expect(r.state.lifetime.reprobates).toBe(1005); // 5 Good temptations → 5 reprobates
  });
});

describe('advanceRunnerCycles — time-mode (Indagatio)', () => {
  it('never stalls and always carries an active cycle after advancing', () => {
    // Forced Good keeps Indagatio off its gold-loss tiers, so the gold-unchanged check is exact.
    const r = advanceRunnerCycles(fresh(), 'indagatio', 1, null, 1000, makeRng(6), 'good');
    expect(r.remaining).not.toBeNull();
    expect(r.remaining!).toBeGreaterThan(0);
    // No gold was spent (time-mode has no per-cycle cost).
    expect(r.state.lifetime.gold.toNumber()).toBe(fresh().lifetime.gold.toNumber());
  });

  it('delta 0 lazily starts the first cycle without resolving it', () => {
    const r = advanceRunnerCycles(fresh(), 'indagatio', 1, null, 0, makeRng(7));
    expect(r.events).toHaveLength(0);
    expect(r.remaining).toBe(150); // baseTime / eff(1)
    expect(r.completed).toBe(false);
  });
});

describe('advanceRunnerCycles — oneShot (acolyte tasks)', () => {
  it('resolves exactly one cycle then reports completed, even with budget to spare', () => {
    // 100 s of budget could fit a hundred 1 s Suggestion cycles, but oneShot stops after the first.
    const s = withReprobates(withInfluence(fresh(), 50), 1000);
    const r = advanceRunnerCycles(s, 'suggestion', 1, null, 100, makeRng(8), 'good', true);
    expect(r.events).toHaveLength(1);
    expect(r.completed).toBe(true);
    expect(influenceOf(r.state)).toBe(50); // free — influence untouched
  });

  it('does not report completed while the single cycle is still in flight', () => {
    const s = withReprobates(withInfluence(fresh(), 50), 1000);
    const r = advanceRunnerCycles(s, 'suggestion', 1, null, 0.4, makeRng(9), 'good', true);
    expect(r.events).toHaveLength(0);
    expect(r.completed).toBe(false);
    expect(r.remaining).toBeCloseTo(0.6, 6); // 1 s cycle, 0.4 s elapsed
  });
});
