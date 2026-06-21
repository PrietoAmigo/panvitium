/**
 * Sin progression from Devotion (02 §4). Levels and Skill intensities are DERIVED from the stored
 * Devotion totals, never stored, so they can't drift (ADR-005 / skill convention). break_infinity's
 * `pow` drifts at the last bit (180^4 = 1049760000.0000002), so every threshold is floored and
 * Devotion is floored before comparison — the documented bignum gotcha.
 */
import { type BigNum, floor, pow, gte, lte, ONE, ZERO } from './bignum.js';
import { DEVOTION_LEVEL_BASE, MAX_SIN_LEVEL, SKILL_INTENSITY_DIVISOR } from './constants.js';

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
 * Skill intensity for a Sin from its total Devotion x (Sins & Devotion sheet):
 *   intensity = ln(x)² / SKILL_INTENSITY_DIVISOR  (divisor = 65.37; see constants.ts)
 * Verified against the sheet's sampled table (x=180 → 0.4125, x=1e9 → 6.60). The sheet's
 * formula-text "/0.6537" is a typo; the sampled values are authoritative (constants.ts).
 * x ≤ 1 grants no skill (ln(1) = 0; a fresh Sin has 0 Devotion). Per-Sin scaling arrives later.
 */
export function skillIntensity(devotion: BigNum): number {
  const x = floor(devotion);
  if (lte(x, ONE)) return 0;
  const ln = x.ln();
  return (ln * ln) / SKILL_INTENSITY_DIVISOR;
}

/**
 * Visible progress through the *current* Sin rank, log-scaled to [0, 1] — for the offering bar.
 * Each rank costs DEVOTION_LEVEL_BASE× the previous (thresholds are BASE^level, 02 §4), so a linear
 * within-rank fraction sits at near-zero for almost the whole rank and reads as a frozen bar.
 * Mapping log_BASE(devotion) − level instead spreads the bar evenly across the rank's multiplicative
 * span, so even small offerings move it. Returns 1 at the cap. Display-only: rank-ups themselves are
 * still decided by `sinLevel` crossing the exact thresholds.
 */
export function sinLevelProgress(devotion: BigNum): number {
  const level = sinLevel(devotion);
  if (level >= MAX_SIN_LEVEL) return 1;
  const d = floor(devotion);
  if (lte(d, ONE)) return 0;
  const frac = d.ln() / Math.log(DEVOTION_LEVEL_BASE) - level;
  return Math.max(0, Math.min(1, frac));
}
