import { describe, it, expect } from 'vitest';
import { hashSeed, makeRng } from './rng.js';

function draw(state: number, n: number): number[] {
  const rng = makeRng(state);
  return Array.from({ length: n }, () => rng.float());
}

describe('seeded RNG', () => {
  it('is deterministic: same seed yields the same sequence', () => {
    const s = hashSeed('panvitium');
    expect(draw(s, 10)).toEqual(draw(s, 10));
  });

  it('different seeds yield different sequences', () => {
    const a = draw(hashSeed('alpha'), 10);
    const b = draw(hashSeed('beta'), 10);
    expect(a).not.toEqual(b);
  });

  it('produces floats in [0, 1)', () => {
    const rng = makeRng(hashSeed('range-check'));
    for (let i = 0; i < 1000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) stays within [0, n)', () => {
    const rng = makeRng(hashSeed('int-check'));
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('resumes identically from a saved state', () => {
    // Draw some values, snapshot the state, then prove a fresh Rng from that
    // snapshot continues the exact same sequence — the property a replay validator needs.
    const rng = makeRng(hashSeed('resume'));
    rng.float();
    rng.float();
    const snapshot = rng.state;
    const continued = [rng.float(), rng.float(), rng.float()];

    const resumed = makeRng(snapshot);
    const replayed = [resumed.float(), resumed.float(), resumed.float()];

    expect(replayed).toEqual(continued);
  });
});
