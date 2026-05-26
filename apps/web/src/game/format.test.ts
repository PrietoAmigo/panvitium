import { describe, it, expect } from 'vitest';
import { bn } from '@panvitium/sim';
import { formatBigNum } from './format.js';

describe('formatBigNum', () => {
  it('groups integers below a million', () => {
    expect(formatBigNum(bn(0))).toBe('0');
    expect(formatBigNum(bn(12345))).toBe('12,345');
  });

  it('floors fractional values below a million', () => {
    expect(formatBigNum(bn(999.9))).toBe('999');
  });

  it('uses compact scientific at or above a million', () => {
    expect(formatBigNum(bn('1234567'))).toBe('1.23e6');
    expect(formatBigNum(bn('1e50'))).toBe('1.00e50');
  });
});
