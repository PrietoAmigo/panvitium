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
