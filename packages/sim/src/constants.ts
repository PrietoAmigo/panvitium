/**
 * Cross-cutting economy constants from the design docs (02 §1/§4, 03 §1/§3/§9). The per-action
 * numbers — probabilities, costs, business outputs, sigil coefficients — live in the economy
 * spreadsheet and arrive with their systems; these are the baselines the engines need now.
 */

/** Base passive gold gain per second (02 §1). */
export const BASE_GOLD_PER_SECOND = 10;

/** Base passive influence gain per second, capped at maxInfluence (02 §1). */
export const BASE_INFLUENCE_PER_SECOND = 5;

/** Base reprobate suicide chance per second, applied to the whole population (03 §3). */
export const BASE_SUICIDE_RATE_PER_SECOND = 0.00023;

/** Cumulative Devotion to reach Sin level X is DEVOTION_LEVEL_BASE^X souls (02 §4, 03 §1). */
export const DEVOTION_LEVEL_BASE = 180;

/** Cardinal Sins run level 0..4 (03 §1). */
export const MAX_SIN_LEVEL = 4;

/** Default carry-over rolls on Katabasis (02 §1/§8). */
export const BASE_REMAINING_GOLD = 0.05; // 5%
export const BASE_REMAINING_MALEFICIA = 0.25; // 25%

/** Souls offered to the Eternal Sin to end the game (03 §9). */
export const ETERNAL_SIN_THRESHOLD = 8398080000;
