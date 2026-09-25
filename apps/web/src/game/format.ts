/**
 * Display formatting for resource values. Resources are natural numbers (02 §1), so values are
 * floored before display. Below a million they read as grouped integers; from a million up they take
 * short-scale suffixes (M, B, T, …, Dc) for legibility; beyond the suffix ladder (≈1e36) they fall
 * back to compact scientific (e.g. "1.00e50"), which scales cleanly into the astronomically large
 * endgame numbers.
 */
import { type BigNum, floor, lt } from '@panvitium/sim';

const MILLION = 1_000_000;

/** Short-scale suffixes starting at 1e6 (index 0 = M = 10^6, …, index 9 = Dc = 10^33). */
const SUFFIXES = ['M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Two decimals with trailing zeros (and a bare dot) trimmed: 1.50→"1.5", 150.00→"150". */
function trimDecimals(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function formatBigNum(value: BigNum): string {
  const floored = floor(value);
  if (lt(floored, MILLION)) {
    return floored.toNumber().toLocaleString('en-US');
  }
  // Parse a high-precision exponential to get mantissa + exponent without depending on Decimal
  // internals (toExponential is already part of the BigNum surface used here).
  const [mantissaStr, expStr] = floored.toExponential(6).split('e');
  const exp = parseInt(expStr ?? '0', 10);
  const group = Math.floor(exp / 3); // 1e6→2 (M), 1e9→3 (B), …
  const idx = group - 2;
  const suffix = idx >= 0 && idx < SUFFIXES.length ? SUFFIXES[idx] : undefined;
  if (suffix !== undefined) {
    const scaled = parseFloat(mantissaStr ?? '0') * Math.pow(10, exp - group * 3); // [1, 1000)
    return `${trimDecimals(scaled)}${suffix}`;
  }
  // Astronomical tail: break_infinity's toExponential gives e.g. "1.23e+50"; tidy the "+".
  return floored.toExponential(2).replace('e+', 'e');
}

/**
 * Format a millisecond duration as the Eternal-Sin runtime score (03 §8) — the total time taken
 * to ascend. Reads as "Dd Hh Mm Ss", dropping leading zero units, always keeping seconds.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

const ROMAN_UNITS: readonly [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];
/** Integer → Roman numeral (1..3999). Used for the Sin-level gate, the Ars Goetia index numerals (so
 *  every seal reads as a numeral; the old lookup table stopped at XVIII and fell back to Arabic) and
 *  the Loculi's relic counter. Anything that is not a positive integer falls back to Arabic. */
export function roman(n: number): string {
  if (!Number.isInteger(n) || n < 1) return String(n);
  let out = '';
  let rem = n;
  for (const [value, sym] of ROMAN_UNITS) {
    while (rem >= value) {
      out += sym;
      rem -= value;
    }
  }
  return out;
}
