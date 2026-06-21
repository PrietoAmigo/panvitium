import { describe, it, expect } from 'vitest';
import { bn, eq } from './bignum.js';
import { devotionForLevel, sinLevel, sinLevelProgress, skillIntensity } from './progression.js';

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
  it('is 0 for no Devotion and matches the spreadsheet sample table (ln(x)^2 / 65.37)', () => {
    expect(skillIntensity(bn(0))).toBe(0);
    expect(skillIntensity(bn(1))).toBe(0); // ln(1) = 0
    expect(skillIntensity(bn(10))).toBeCloseTo(0.08111, 4);
    expect(skillIntensity(bn(180))).toBeCloseTo(0.41253, 4);
    expect(skillIntensity(bn(1049760000))).toBeCloseTo(6.6004, 3);
  });

  it('increases monotonically with Devotion', () => {
    const a = skillIntensity(bn(10));
    const b = skillIntensity(bn(180));
    const c = skillIntensity(bn(1_000_000));
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe('sinLevelProgress', () => {
  it('is 0 at a rank floor and resets each rank', () => {
    expect(sinLevelProgress(bn(180))).toBeCloseTo(0, 6); // start of rank 1
    expect(sinLevelProgress(bn(32400))).toBeCloseTo(0, 6); // start of rank 2
    expect(sinLevelProgress(bn(5832000))).toBeCloseTo(0, 6); // start of rank 3
  });

  it('is log-scaled within a rank — the geometric midpoint (180^0.5×base) sits at 50%', () => {
    // Rank 1 spans [180, 32400); its log-midpoint is 180^1.5 = 180 × √180 ≈ 2415.
    expect(sinLevelProgress(bn(Math.round(180 * Math.sqrt(180))))).toBeCloseTo(0.5, 2);
    // Rank 2 spans [32400, 5832000); log-midpoint 180^2.5 ≈ 434,675.
    expect(sinLevelProgress(bn(Math.round(32400 * Math.sqrt(180))))).toBeCloseTo(0.5, 2);
  });

  it('clamps to [0, 1] and returns 1 at the cap', () => {
    expect(sinLevelProgress(bn(0))).toBe(0);
    expect(sinLevelProgress(bn(1))).toBe(0); // ln(1) = 0
    expect(sinLevelProgress(bn(1049760000))).toBe(1); // rank 4 = MAX_SIN_LEVEL
    expect(sinLevelProgress(bn('1e12'))).toBe(1);
  });

  it('increases monotonically within a rank', () => {
    const a = sinLevelProgress(bn(500));
    const b = sinLevelProgress(bn(5000));
    const c = sinLevelProgress(bn(20000));
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
