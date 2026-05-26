import { describe, it, expect } from 'vitest';
import {
  bn,
  add,
  mul,
  div,
  pow,
  floor,
  clamp,
  gt,
  lt,
  eq,
  isZero,
  serializeBigNum,
  deserializeBigNum,
  ZERO,
  ONE,
} from './bignum.js';

describe('BigNum', () => {
  it('constructs from number, string, and BigNum', () => {
    expect(eq(bn(5), bn('5'))).toBe(true);
    expect(eq(bn(bn(5)), bn(5))).toBe(true);
  });

  it('does basic arithmetic', () => {
    expect(eq(add(2, 3), bn(5))).toBe(true);
    expect(eq(mul(4, 5), bn(20))).toBe(true);
    expect(eq(div(10, 4), bn(2.5))).toBe(true);
  });

  it('represents values far beyond Number.MAX_SAFE_INTEGER', () => {
    const huge = pow(10, 40); // 10^40, well past 2^53
    expect(gt(huge, bn(Number.MAX_SAFE_INTEGER))).toBe(true);
  });

  it('is a floating-point bignum: computed integers need flooring for exact comparison', () => {
    // ADR-005 trades exactness for range. 180^4 — the cumulative Devotion cost to reach
    // Sin level 4 (02 §4) — computes to 1049760000.0000002, NOT the exact integer.
    // Resources are natural numbers (02 §1), so the resource layer floors before comparing.
    const cost = pow(180, 4);
    expect(eq(cost, bn('1049760000'))).toBe(false); // not exactly equal
    expect(eq(floor(cost), bn('1049760000'))).toBe(true); // floored, it matches exactly
  });

  it('floors toward negative infinity', () => {
    expect(eq(floor(2.9), bn(2))).toBe(true);
    expect(eq(floor(2.0), bn(2))).toBe(true);
  });

  it('clamps into a range', () => {
    expect(eq(clamp(15, 0, 10), bn(10))).toBe(true);
    expect(eq(clamp(-3, 0, 10), bn(0))).toBe(true);
    expect(eq(clamp(5, 0, 10), bn(5))).toBe(true);
  });

  it('compares correctly', () => {
    expect(gt(3, 2)).toBe(true);
    expect(lt(2, 3)).toBe(true);
    expect(isZero(ZERO)).toBe(true);
    expect(isZero(ONE)).toBe(false);
  });

  it('round-trips through serialization, including huge values', () => {
    const original = pow(10, 100);
    const restored = deserializeBigNum(serializeBigNum(original));
    expect(eq(restored, original)).toBe(true);
  });
});
