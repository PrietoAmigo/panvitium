import { describe, it, expect } from 'vitest';
import { createInitialState, totalReprobates, SINS, REPROBATE_SUBTYPES } from './state.js';
import { isZero } from './bignum.js';
import { tick } from './tick.js';

describe('createInitialState', () => {
  it('starts with zero souls, zero Devotion for every Sin, and no sigil bindings', () => {
    const s = createInitialState('seed', 0);
    expect(isZero(s.souls)).toBe(true);
    for (const sin of SINS) expect(isZero(s.devotion[sin])).toBe(true);
    expect(Object.keys(s.sigilBindings)).toHaveLength(0);
  });

  it('starts with zero reprobates of every subtype', () => {
    const s = createInitialState('seed', 0);
    for (const t of REPROBATE_SUBTYPES) expect(s.lifetime.reprobates[t]).toBe(0);
    expect(totalReprobates(s)).toBe(0);
  });

  it('keys the RNG from the seed (same seed -> same rngState)', () => {
    expect(createInitialState('x', 0).rngState).toBe(createInitialState('x', 0).rngState);
    expect(createInitialState('x', 0).rngState).not.toBe(createInitialState('y', 0).rngState);
  });
});

describe('tick (skeleton)', () => {
  it('returns the same reference for non-positive deltas', () => {
    const s = createInitialState('seed', 1000);
    expect(tick(s, 0)).toBe(s);
    expect(tick(s, -5)).toBe(s);
  });

  it('advances the logical clock by delta seconds', () => {
    const s = createInitialState('seed', 1000);
    const next = tick(s, 0.1);
    expect(next.lastTickAt).toBe(1100);
  });

  it('does not mutate the input state (purity)', () => {
    const s = createInitialState('seed', 1000);
    tick(s, 10);
    expect(s.lastTickAt).toBe(1000);
  });

  it('leaves rngState unchanged while no system draws (skeleton)', () => {
    const s = createInitialState('seed', 1000);
    expect(tick(s, 0.1).rngState).toBe(s.rngState);
  });
});
