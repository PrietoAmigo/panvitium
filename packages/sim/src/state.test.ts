import { describe, it, expect } from 'vitest';
import { createInitialState, totalReprobates, SINS } from './state.js';
import { isZero } from './bignum.js';

describe('createInitialState', () => {
  it('starts with zero souls, zero Devotion for every Sin, and no sigil bindings', () => {
    const s = createInitialState('seed', 0);
    expect(isZero(s.souls)).toBe(true);
    for (const sin of SINS) expect(isZero(s.devotion[sin])).toBe(true);
    expect(Object.keys(s.sigilBindings)).toHaveLength(0);
  });

  it('starts with an empty reprobate pool', () => {
    const s = createInitialState('seed', 0);
    expect(s.lifetime.reprobates).toBe(0);
    expect(totalReprobates(s)).toBe(0);
  });

  it('starts with all three reprobate-dynamics pools at zero', () => {
    const s = createInitialState('seed', 0);
    expect(s.lifetime.generationPool).toBe(0);
    expect(s.lifetime.suicidePool).toBe(0);
    expect(s.lifetime.murderPool).toBe(0);
  });

  it('keys the RNG from the seed (same seed -> same rngState)', () => {
    expect(createInitialState('x', 0).rngState).toBe(createInitialState('x', 0).rngState);
    expect(createInitialState('x', 0).rngState).not.toBe(createInitialState('y', 0).rngState);
  });
});
