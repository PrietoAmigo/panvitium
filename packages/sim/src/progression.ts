/**
 * Sin progression from Devotion (02 §4). Levels and Skill intensities are DERIVED from the stored
 * Devotion totals, never stored, so they can't drift (ADR-005 / skill convention). break_infinity's
 * `pow` drifts at the last bit (180^4 = 1049760000.0000002), so every threshold is floored and
 * Devotion is floored before comparison — the documented bignum gotcha.
 */
import { type BigNum, floor, pow, gte, lte, ZERO } from './bignum.js';
import { DEVOTION_LEVEL_BASE, MAX_SIN_LEVEL } from './constants.js';

/**
 * Cumulative Devotion needed to reach a Sin level (02 §4): DEVOTION_LEVEL_BASE^level for levels
 * 1..MAX_SIN_LEVEL, and 0 for level 0.
 */
export function devotionForLevel(level: number): BigNum {
  if (level <= 0) return ZERO;
  return floor(pow(DEVOTION_LEVEL_BASE, level));
}

/** The Sin level (0..MAX_SIN_LEVEL) granted by a Devotion total. */
export function sinLevel(devotion: BigNum): number {
  const d = floor(devotion);
  let level = 0;
  for (let l = 1; l <= MAX_SIN_LEVEL; l++) {
    if (gte(d, devotionForLevel(l))) level = l;
    else break;
  }
  return level;
}

/**
 * Skill intensity for a Sin from its total Devotion x, default shape (02 §4):
 *   (1 + log10(x) + sqrt(x) / 20) / 10
 * Zero Devotion grants no skill. Per-Sin coefficients (the spreadsheet) scale this later.
 */
export function skillIntensity(devotion: BigNum): number {
  const x = floor(devotion);
  if (lte(x, ZERO)) return 0;
  return (1 + x.log10() + x.sqrt().toNumber() / 20) / 10;
}
