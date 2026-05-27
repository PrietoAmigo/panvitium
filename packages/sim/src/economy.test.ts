import { describe, it, expect } from 'vitest';
import { bn, eq, floor } from './bignum.js';
import { createInitialState, type GameState } from './state.js';
import { tick } from './tick.js';

const goldOf = (s: GameState): number => floor(s.lifetime.gold).toNumber();
const influenceOf = (s: GameState): number => floor(s.lifetime.influence).toNumber();

describe('tick — passive generation', () => {
  it('generates base gold and influence over one second', () => {
    const { state } = tick(createInitialState('seed', 0), 1);
    expect(eq(state.lifetime.gold, bn(10))).toBe(true); // 10/s
    expect(eq(state.lifetime.influence, bn(2.5))).toBe(true); // 0.025 × maxInfluence(100) = 2.5/s
  });

  it('accumulates sub-unit gains across 100 ms ticks (online == offline)', () => {
    let online = createInitialState('seed', 0);
    for (let i = 0; i < 10; i++) online = tick(online, 0.1).state;
    const offline = tick(createInitialState('seed', 0), 1).state;
    expect(goldOf(online)).toBe(goldOf(offline));
    expect(influenceOf(online)).toBe(influenceOf(offline));
    expect(goldOf(online)).toBe(10);
    expect(influenceOf(online)).toBe(2); // floor(2.5)
  });

  it('caps influence at maxInfluence but lets gold run free', () => {
    const { state } = tick(createInitialState('seed', 0), 100); // 500 influence uncapped
    expect(eq(state.lifetime.influence, state.lifetime.maxInfluence)).toBe(true);
    expect(influenceOf(state)).toBe(100);
    expect(goldOf(state)).toBe(1000);
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
