/**
 * Cross-cutting economy constants. These mirror the `Globals` sheet of the economy spreadsheet,
 * which is the source of truth for numbers (the per-action tables arrive with their systems). Where
 * a design-doc prose value disagreed with the spreadsheet, the spreadsheet wins — noted inline.
 */

/** Base passive gold gain per second (Globals: 10 gold/s). */
export const BASE_GOLD_PER_SECOND = 10;

/**
 * Base passive influence gain, as a fraction of maxInfluence per second (Globals: 0.025, unit
 * "% of max infl / s"). Influence is generated as a percentage of the maximum and capped there
 * (02 §1) — so gain/s = BASE_INFLUENCE_RATE × maxInfluence. (Supersedes the doc's flat "5/s".)
 */
export const BASE_INFLUENCE_RATE = 0.025;

/** Base maximum influence for a fresh lifetime; sin/sigil/maleficia modifiers raise it later. */
export const BASE_MAX_INFLUENCE = 100;

/** Base reprobate suicide chance per second, applied to the whole population (Globals: 0.00023). */
export const BASE_SUICIDE_RATE_PER_SECOND = 0.00023;

/**
 * Base reprobate generation per second, before *Vitium*-driven contributions (Globals).
 * Currently 0: no passive reprobate generation happens until a business is producing one (02 §9).
 * The `generationPool` mechanism is in place so a future Vitium slice can simply add to the rate.
 */
export const BASE_REPROBATE_GENERATION_PER_SECOND = 0;

/**
 * Base per-Choleric murder rate (kills / Choleric / second), before sigil/maleficium modifiers
 * (Reprobates sheet placeholder). Cholerics don't exist until Vitium-driven conversion lands, so
 * the pool stays at 0 for now and this value is a hold-the-shape placeholder, not authoritative
 * tuning. The spreadsheet will pin the real number when Cholerics arrive.
 */
export const BASE_CHOLERIC_MURDER_RATE_PER_SECOND = 0.001;

/** Cumulative Devotion to reach Sin level X is DEVOTION_LEVEL_BASE^X souls (Globals: 180). */
export const DEVOTION_LEVEL_BASE = 180;

/** Cardinal Sins run level 0..4 (03 §1). */
export const MAX_SIN_LEVEL = 4;

/** Skill intensity = ln(devotion)² / SKILL_INTENSITY_DIVISOR (Sins & Devotion sheet: 6.537). */
export const SKILL_INTENSITY_DIVISOR = 6.537;

/**
 * Katabasis carry-over base fractions (Globals). Each is raised additively by a Sin's per-level
 * effect (Sins & Devotion sheet) and, later, by sigils:
 *   - remaining gold %:          +6.25%/level Avaritia (Mammon)
 *   - remaining unconverted %:   +6.25%/level Luxuria (Asmodeus)
 *   - remaining maleficia chance: +12.5%/level Superbia (Lucifer)
 */
export const BASE_REMAINING_GOLD = 0.05; // Globals: 0.05 (5%)
export const BASE_REMAINING_MALEFICIA = 0.05; // Globals value 0.05 (the "(25%)" note is superseded)
export const BASE_REMAINING_UNCONVERTED_REPROBATE = 0.05; // Globals: 0.05
export const REMAINING_GOLD_PER_AVARITIA_LEVEL = 0.0625;
export const REMAINING_UNCONVERTED_PER_LUXURIA_LEVEL = 0.0625;
export const REMAINING_MALEFICIA_PER_SUPERBIA_LEVEL = 0.125;

/** Souls offered to the Eternal Sin to end the game (Globals: 8 × 180^4). */
export const ETERNAL_SIN_THRESHOLD = 8398080000;
