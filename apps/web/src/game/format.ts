/**
 * Display formatting for resource values. Resources are natural numbers (02 §1), so values are
 * floored before display. Below a million they read as grouped integers; above, as compact
 * scientific (e.g. "1.23e9"), which scales cleanly into the astronomically large endgame numbers.
 */
import { type BigNum, floor, lt } from '@panvitium/sim';

const MILLION = 1_000_000;

export function formatBigNum(value: BigNum): string {
  if (lt(value, MILLION)) {
    return floor(value).toNumber().toLocaleString('en-US');
  }
  // break_infinity's toExponential gives e.g. "1.23e+9"; tidy the "+".
  return value.toExponential(2).replace('e+', 'e');
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
