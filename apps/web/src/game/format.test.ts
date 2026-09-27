import { describe, it, expect } from 'vitest';
import { bn } from '@panvitium/sim';
import { formatBigNum, formatShortDuration } from './format.js';

describe('formatBigNum', () => {
  it('groups integers below a million', () => {
    expect(formatBigNum(bn(0))).toBe('0');
    expect(formatBigNum(bn(12345))).toBe('12,345');
  });

  it('floors fractional values below a million', () => {
    expect(formatBigNum(bn(999.9))).toBe('999');
  });

  it('uses short-scale suffixes from a million up', () => {
    expect(formatBigNum(bn(5_000_000))).toBe('5M');
    expect(formatBigNum(bn('1234567'))).toBe('1.23M');
    expect(formatBigNum(bn('1.5e9'))).toBe('1.5B');
    expect(formatBigNum(bn('2.5e12'))).toBe('2.5T');
    expect(formatBigNum(bn('1e33'))).toBe('1Dc');
  });

  it('falls back to compact scientific beyond the suffix ladder', () => {
    expect(formatBigNum(bn('1e36'))).toBe('1.00e36');
    expect(formatBigNum(bn('1e50'))).toBe('1.00e50');
  });
});

describe('formatShortDuration (the buffs HUD countdown)', () => {
  it('shows hours and minutes from an hour up', () => {
    expect(formatShortDuration(3_600_000)).toBe('1h 0m');
    expect(formatShortDuration((3600 + 12 * 60 + 59) * 1000)).toBe('1h 12m');
    expect(formatShortDuration(26 * 3_600_000)).toBe('26h 0m'); // no day unit: it stays short
  });

  it('shows whole minutes from a minute up, then seconds', () => {
    expect(formatShortDuration(42 * 60_000 + 59_000)).toBe('42m');
    expect(formatShortDuration(60_000)).toBe('1m');
    expect(formatShortDuration(59_999)).toBe('59s');
    expect(formatShortDuration(37_400)).toBe('37s');
  });

  it('floors to zero, never below', () => {
    expect(formatShortDuration(400)).toBe('0s');
    expect(formatShortDuration(-5)).toBe('0s');
  });
});
