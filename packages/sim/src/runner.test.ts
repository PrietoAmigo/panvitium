/**
 * Shared runner-engine tests (02 §3). Pins:
 *   - delegated runners carry out actions for FREE — no per-cycle gold/influence cost
 *   - cost-outcome channels resolve at eff and never stall on an empty treasury
 *   - offline catch-up resolves every cycle the budget covers
 *   - time-mode channels (Indagatio) never stall and always hold an active cycle
 *   - a forced outcome tier is honoured (Imp's Good-only Caedis: pure mint, no gold-loss tier)
 */
import { describe, expect, it } from 'vitest';
import { advanceRunnerCycles, bn, createInitialState, makeRng, type GameState } from './index.js';

function withGold(s: GameState, gold: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, gold: bn(gold) } };
}

function withReprobates(s: GameState, n: number): GameState {
  return {
    ...s,
    lifetime: { ...s.lifetime, reprobates: n },
  };
}

const fresh = (seed = 'runner'): GameState => createInitialState(seed, 0);

describe('advanceRunnerCycles — cost-outcome (Decimatio)', () => {
  it('resolves a cycle per base duration with no per-cycle resource cost', () => {
    // eff 1 → 10 s/cycle. 30 s of budget resolves exactly 3 cycles. Forced Good isolates the
    // accounting from outcome-driven gold changes (Bad/Terrible lose gold too).
    const s = withReprobates(withGold(fresh(), 1000), 1000);
    const r = advanceRunnerCycles(s, 'caedis', 1, null, 30, makeRng(1), 'good');
    expect(r.events).toHaveLength(3);
    expect(r.state.lifetime.gold.toNumber()).toBe(1000); // free — gold untouched by the cycles
  });

  it('never stalls on an empty treasury — runs the full budget for free', () => {
    // 0 gold at the start; with no per-cycle cost the channel still resolves every cycle the
    // budget covers. 55 s / 10 s-per-cycle → 5 forced-Good cycles plus an in-flight 6th, gold
    // stays 0 (a resource stall would have produced no events and a null timer).
    const s = withReprobates(withGold(fresh(), 0), 1000);
    const r = advanceRunnerCycles(s, 'caedis', 1, null, 55, makeRng(2), 'good');
    expect(r.events).toHaveLength(5);
    expect(r.remaining).toBe(5); // an in-flight next cycle, never a resource stall
    expect(r.state.lifetime.gold.toNumber()).toBe(0); // nothing spent
  });

  it('a broke channel makes progress immediately (no funding required)', () => {
    const broke = withReprobates(withGold(fresh(), 0), 1000);
    const r = advanceRunnerCycles(broke, 'caedis', 1, null, 10, makeRng(3), 'good');
    expect(r.events).toHaveLength(1);
    expect(r.state.lifetime.gold.toNumber()).toBe(0); // resolved for free
  });

  it('a fractional-efficiency channel still produces ≥1 unit at no cost', () => {
    // eff 0.05 (the Imp): units max(1, floor(0.05)) = 1, and the cycle is free.
    const s = withReprobates(withGold(fresh(), 100), 1000);
    const before = s.souls.toNumber();
    const r = advanceRunnerCycles(s, 'caedis', 0.05, null, 10, makeRng(4), 'good');
    expect(r.state.lifetime.gold.toNumber()).toBe(100); // unchanged — no cost
    expect(r.state.souls.toNumber()).toBeGreaterThan(before); // minted ≥1
  });
});

describe('advanceRunnerCycles — forced tier', () => {
  it('Good-only Caedis is pure mint — free, and never a gold-loss tier', () => {
    // 5 cycles forced Good: each removes 1 reprobate and mints 1 soul; gold is untouched.
    const s = withReprobates(withGold(fresh(), 1000), 1000);
    const before = s.souls.toNumber();
    const r = advanceRunnerCycles(s, 'caedis', 1, null, 50, makeRng(5), 'good');
    expect(r.events).toHaveLength(5);
    expect(r.state.lifetime.gold.toNumber()).toBe(1000); // free — no cost, no Bad/Terrible bite
    expect(r.state.souls.toNumber()).toBe(before + 5); // 5 Good kills → 5 souls
    expect(r.state.lifetime.reprobates).toBe(995);
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
    expect(r.state.lifetime.gold.toNumber()).toBe(1000); // free — gold untouched
  });

  it('does not report completed while the single cycle is still in flight', () => {
    const s = withReprobates(withGold(fresh(), 1000), 1000);
    const r = advanceRunnerCycles(s, 'caedis', 1, null, 4, makeRng(9), 'good', true);
    expect(r.events).toHaveLength(0);
    expect(r.completed).toBe(false);
    expect(r.remaining).toBe(6); // 10 s cycle, 4 s elapsed
  });
});
