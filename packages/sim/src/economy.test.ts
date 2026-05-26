import { describe, it, expect } from 'vitest';
import { bn, eq, floor } from './bignum.js';
import { createInitialState } from './state.js';
import { tick } from './tick.js';

const goldOf = (s: ReturnType<typeof createInitialState>): number =>
  floor(s.lifetime.gold).toNumber();
const influenceOf = (s: ReturnType<typeof createInitialState>): number =>
  floor(s.lifetime.influence).toNumber();

describe('tick — passive generation', () => {
  it('generates base gold and influence over one second', () => {
    const s = tick(createInitialState('seed', 0), 1);
    expect(eq(s.lifetime.gold, bn(10))).toBe(true); // 10/s
    expect(eq(s.lifetime.influence, bn(5))).toBe(true); // 5/s
  });

  it('accumulates sub-unit gains across 100 ms ticks (online == offline)', () => {
    let online = createInitialState('seed', 0);
    for (let i = 0; i < 10; i++) online = tick(online, 0.1);
    const offline = tick(createInitialState('seed', 0), 1);
    // The floored (player-facing) values agree regardless of tick granularity.
    expect(goldOf(online)).toBe(goldOf(offline));
    expect(influenceOf(online)).toBe(influenceOf(offline));
    expect(goldOf(online)).toBe(10);
    expect(influenceOf(online)).toBe(5);
  });

  it('caps influence at maxInfluence but lets gold run free', () => {
    const s = tick(createInitialState('seed', 0), 100); // would be 500 influence uncapped
    expect(eq(s.lifetime.influence, s.lifetime.maxInfluence)).toBe(true);
    expect(influenceOf(s)).toBe(100);
    expect(goldOf(s)).toBe(1000);
  });

  it('advances the logical clock and is a no-op for non-positive deltas', () => {
    const start = createInitialState('seed', 0);
    expect(tick(start, 1).lastTickAt).toBe(1000);
    expect(tick(start, 0.1).lastTickAt).toBe(100);
    expect(tick(start, 0)).toBe(start);
    expect(tick(start, -5)).toBe(start);
  });

  it('does not draw from the RNG yet and never mutates the input', () => {
    const start = createInitialState('seed', 0);
    const next = tick(start, 1);
    expect(next.rngState).toBe(start.rngState); // no random draws this slice
    expect(eq(start.lifetime.gold, bn(0))).toBe(true); // input untouched
  });
});
