import { describe, it, expect } from 'vitest';
import { bn, eq, floor } from './bignum.js';
import { createInitialState, type GameState } from './state.js';
import { tick } from './tick.js';

const goldOf = (s: GameState): number => floor(s.lifetime.gold).toNumber();
const influenceOf = (s: GameState): number => floor(s.lifetime.influence).toNumber();

describe('tick — passive generation', () => {
  it('generates base gold and influence over one second', () => {
    const { state } = tick(createInitialState('seed', 0), 1);
    expect(eq(state.lifetime.gold, bn(2))).toBe(true); // 2/s
    expect(eq(state.lifetime.influence, bn(1))).toBe(true); // 0.01 × maxInfluence(100) = 1/s
  });

  it('accumulates sub-unit gains across 100 ms ticks (online == offline)', () => {
    let online = createInitialState('seed', 0);
    for (let i = 0; i < 10; i++) online = tick(online, 0.1).state;
    const offline = tick(createInitialState('seed', 0), 1).state;
    expect(goldOf(online)).toBe(goldOf(offline));
    expect(influenceOf(online)).toBe(influenceOf(offline));
    expect(goldOf(online)).toBe(2);
    expect(influenceOf(online)).toBe(1); // floor(1.0)
  });

  it('caps influence at maxInfluence but lets gold run free', () => {
    const { state } = tick(createInitialState('seed', 0), 100); // 100 influence (reaches the cap)
    expect(eq(state.lifetime.influence, state.lifetime.maxInfluence)).toBe(true);
    expect(influenceOf(state)).toBe(100);
    expect(goldOf(state)).toBe(200);
  });

  it('advances the logical clock and is a no-op for non-positive deltas', () => {
    const start = createInitialState('seed', 0);
    expect(tick(start, 1).state.lastTickAt).toBe(1000);
    expect(tick(start, 0.1).state.lastTickAt).toBe(100);
    expect(tick(start, 0).state).toBe(start);
    expect(tick(start, -5).state).toBe(start);
  });

  it('does not draw from the RNG yet and never mutates the input', () => {
    const start = createInitialState('seed', 0);
    const { state, events } = tick(start, 1);
    expect(state.rngState).toBe(start.rngState); // no random draws without actions
    expect(events).toHaveLength(0);
    expect(eq(start.lifetime.gold, bn(0))).toBe(true); // input untouched
  });
});

describe('tick — modifiers (Sin level / Sin skill)', () => {
  it('Avaritia skill scales the passive gold rate (Golden Hand)', () => {
    // Devotion 180 → intensity ≈ 0.41253 → goldRateMul ≈ 1.4125 → gold/s ≈ 2.825.
    const base = createInitialState('seed', 0);
    const state: GameState = { ...base, devotion: { ...base.devotion, avaritia: bn(180) } };
    const { state: after } = tick(state, 1);
    expect(floor(after.lifetime.gold).toNumber()).toBe(2);
  });

  it('Vanagloria scales both influence rate (level) and the effective cap (Acclaim)', () => {
    // L1 → influenceRateMul = 1.5. Skill intensity ≈ 0.41253 → maxInfluenceMul ≈ 1.4125.
    // effectiveMax = 100 × 1.4125 = 141.25; influence/s = 141.25 × 0.01 × 1.5 ≈ 2.12.
    const base = createInitialState('seed', 0);
    const state: GameState = { ...base, devotion: { ...base.devotion, vanagloria: bn(180) } };
    const { state: after } = tick(state, 1);
    expect(floor(after.lifetime.influence).toNumber()).toBe(2);
  });
});

describe('tick — Lemure flat influence (per-Husk)', () => {
  /** Fresh state with Husks, a raised maxInfluence (headroom), and `n` Lemures active. */
  function withLemure(huskCount: number, lemures: number): GameState {
    const s = createInitialState('lemure', 0);
    return {
      ...s,
      lifetime: {
        ...s.lifetime,
        maxInfluence: bn(1_000_000), // generous headroom so we measure the gain, not the cap
        reprobates: { ...s.lifetime.reprobates, husk: huskCount },
        invocations: { ...s.lifetime.invocations, lemure: lemures },
      },
    };
  }

  it('adds a per-Husk flat amount per Lemure on top of the proportional base', () => {
    const base = tick(withLemure(50, 0), 1).state; // no Lemure: proportional gain only
    const withOne = tick(withLemure(50, 1), 1).state; // +0.1 × 50 Husks = +5 influence/s
    const gain = withOne.lifetime.influence.toNumber() - base.lifetime.influence.toNumber();
    expect(gain).toBeCloseTo(5, 6);
  });

  it('scales with both Husk count and Lemure count', () => {
    const base = tick(withLemure(100, 0), 1).state.lifetime.influence.toNumber();
    const two = tick(withLemure(100, 2), 1).state.lifetime.influence.toNumber();
    expect(two - base).toBeCloseTo(0.1 * 100 * 2, 6); // 20/s
  });

  it('is still capped at maxInfluence', () => {
    const s = createInitialState('lemure-cap', 0);
    const capped: GameState = {
      ...s,
      lifetime: {
        ...s.lifetime,
        reprobates: { ...s.lifetime.reprobates, husk: 10_000 },
        invocations: { ...s.lifetime.invocations, lemure: 5 },
      },
    };
    const out = tick(capped, 100).state;
    expect(eq(out.lifetime.influence, out.lifetime.maxInfluence)).toBe(true);
  });
});
