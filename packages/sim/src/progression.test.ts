import { describe, it, expect } from 'vitest';
import { bn, eq } from './bignum.js';
import { devotionForLevel, sinLevel, skillIntensity } from './progression.js';

describe('devotionForLevel', () => {
  it('is 0 for level 0 and 180^level for 1..4, floored exactly', () => {
    expect(eq(devotionForLevel(0), bn(0))).toBe(true);
    expect(eq(devotionForLevel(1), bn(180))).toBe(true);
    expect(eq(devotionForLevel(2), bn(32400))).toBe(true);
    expect(eq(devotionForLevel(3), bn(5832000))).toBe(true);
    // 180^4 computes to 1049760000.0000002 in floating point; the threshold must floor it.
    expect(eq(devotionForLevel(4), bn(1049760000))).toBe(true);
  });
});

describe('sinLevel', () => {
  it('maps Devotion totals to the level reached', () => {
    expect(sinLevel(bn(0))).toBe(0);
    expect(sinLevel(bn(179))).toBe(0);
    expect(sinLevel(bn(180))).toBe(1);
    expect(sinLevel(bn(32399))).toBe(1);
    expect(sinLevel(bn(32400))).toBe(2);
    expect(sinLevel(bn(5832000))).toBe(3);
    expect(sinLevel(bn(1049759999))).toBe(3);
    expect(sinLevel(bn('1e12'))).toBe(4);
  });

  it('reaches level 4 at exactly 1049760000 (the floored 180^4 boundary)', () => {
    // Without flooring, 180^4 > 1049760000 and this would wrongly read as level 3.
    expect(sinLevel(bn(1049760000))).toBe(4);
  });
});

describe('skillIntensity', () => {
  it('is 0 with no Devotion and follows the default shape', () => {
    expect(skillIntensity(bn(0))).toBe(0);
    expect(skillIntensity(bn(1))).toBeCloseTo(0.105, 3);
    expect(skillIntensity(bn(180))).toBeCloseTo(0.3926, 3);
  });

  it('increases monotonically with Devotion', () => {
    const a = skillIntensity(bn(1));
    const b = skillIntensity(bn(180));
    const c = skillIntensity(bn(1_000_000));
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
