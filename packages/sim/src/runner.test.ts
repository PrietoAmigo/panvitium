/**
 * Shared runner-engine tests (02 §3). Pins:
 *   - cost-outcome channels pay ceil(cost × eff) PER cycle and resolve at eff
 *   - a channel stalls (remaining → null) the moment it can't afford the next cycle; gold stops
 *     draining and no further outcomes resolve
 *   - offline catch-up pays every cycle it resolves, not just the first
 *   - time-mode channels (Indagatio) are free, never stall, and always hold an active cycle
 *   - a forced outcome tier is honoured (Imp's Good-only Caedis: pure cost + mint, no gold-loss tier)
 */
import { describe, expect, it } from 'vitest';
import { advanceRunnerCycles, bn, createInitialState, makeRng, type GameState } from './index.js';

function withGold(s: GameState, gold: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, gold: bn(gold) } };
}

function withReprobates(s: GameState, n: number): GameState {
  return {
    ...s,
    lifetime: { ...s.lifetime, reprobates: { ...s.lifetime.reprobates, reprobate: n } },
  };
}

const fresh = (seed = 'runner'): GameState => createInitialState(seed, 0);

describe('advanceRunnerCycles — cost-outcome (Decimatio)', () => {
  it('pays ceil(cost × eff) for each resolved cycle', () => {
    // eff 1 → 100 gold/cycle, 10 s/cycle. 30 s of budget resolves exactly 3 cycles. Forced Good
    // isolates the COST accounting from outcome-driven gold changes (Bad/Terrible lose gold too).
    const s = withReprobates(withGold(fresh(), 1000), 1000);
    const r = advanceRunnerCycles(s, 'caedis', 1, null, 30, makeRng(1), 'good');
    expect(r.events).toHaveLength(3);
    expect(r.state.lifetime.gold.toNumber()).toBe(700); // 1000 − 3×100
  });

  it('stalls (remaining null) once it can no longer afford a cycle', () => {
    // 250 gold at 100/cycle affords exactly two; the third can't start. Forced Good so the only
    // gold drain is the cost — otherwise an outcome bite would shift the stall point.
    const s = withReprobates(withGold(fresh(), 250), 1000);
    const r = advanceRunnerCycles(s, 'caedis', 1, null, 1000, makeRng(2), 'good');
    expect(r.events).toHaveLength(2);
    expect(r.remaining).toBeNull();
    expect(r.state.lifetime.gold.toNumber()).toBe(50); // can't afford the 3rd (needs 100)
  });

  it('a stalled channel makes no progress but resumes when funded', () => {
    const broke = withReprobates(withGold(fresh(), 0), 1000);
    const stalled = advanceRunnerCycles(broke, 'caedis', 1, null, 100, makeRng(3), 'good');
    expect(stalled.events).toHaveLength(0);
    expect(stalled.remaining).toBeNull();
    // Fund it and tick again: now it runs.
    const funded = withGold(stalled.state, 300);
    const r = advanceRunnerCycles(funded, 'caedis', 1, stalled.remaining, 10, makeRng(3), 'good');
    expect(r.events).toHaveLength(1);
    expect(r.state.lifetime.gold.toNumber()).toBe(200);
  });

  it('a fractional-efficiency channel still produces ≥1 unit at a scaled-down cost', () => {
    // eff 0.05 (the Imp): cost ceil(100 × 0.05) = 5 gold, units max(1, floor(0.05)) = 1.
    const s = withReprobates(withGold(fresh(), 100), 1000);
    const before = s.souls.toNumber();
    const r = advanceRunnerCycles(s, 'caedis', 0.05, null, 10, makeRng(4), 'good');
    expect(r.state.lifetime.gold.toNumber()).toBe(95); // paid 5
    expect(r.state.souls.toNumber()).toBeGreaterThan(before); // minted ≥1
  });
});

describe('advanceRunnerCycles — forced tier', () => {
  it('Good-only Caedis is pure cost + mint — never a gold-loss tier', () => {
    // 5 cycles forced Good: each removes 1 reprobate and mints 1 soul; gold drops only by cost.
    const s = withReprobates(withGold(fresh(), 1000), 1000);
    const before = s.souls.toNumber();
    const r = advanceRunnerCycles(s, 'caedis', 1, null, 50, makeRng(5), 'good');
    expect(r.events).toHaveLength(5);
    expect(r.state.lifetime.gold.toNumber()).toBe(500); // exactly 5×100, no Bad/Terrible bite
    expect(r.state.souls.toNumber()).toBe(before + 5); // 5 Good kills → 5 souls
    expect(r.state.lifetime.reprobates.reprobate).toBe(995);
  });
});

describe('advanceRunnerCycles — time-mode (Indagatio)', () => {
  it('is free, never stalls, and always carries an active cycle after advancing', () => {
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
    expect(r.remaining).toBe(300); // baseTime / eff(1)
    expect(r.completed).toBe(false);
  });
});

describe('advanceRunnerCycles — oneShot (acolyte tasks)', () => {
  it('resolves exactly one cycle then reports completed, even with budget to spare', () => {
    // 100 s of budget could fit ten 10 s Caedis cycles, but oneShot stops after the first.
    const s = withReprobates(withGold(fresh(), 1000), 1000);
    const r = advanceRunnerCycles(s, 'caedis', 1, null, 100, makeRng(8), 'good', true);
    expect(r.events).toHaveLength(1);
    expect(r.completed).toBe(true);
    expect(r.state.lifetime.gold.toNumber()).toBe(900); // paid one cycle only
  });

  it('does not report completed while the single cycle is still in flight', () => {
    const s = withReprobates(withGold(fresh(), 1000), 1000);
    const r = advanceRunnerCycles(s, 'caedis', 1, null, 4, makeRng(9), 'good', true);
    expect(r.events).toHaveLength(0);
    expect(r.completed).toBe(false);
    expect(r.remaining).toBe(6); // 10 s cycle, 4 s elapsed
  });
});
