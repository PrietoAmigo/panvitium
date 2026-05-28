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

/**
 * Skill intensity = ln(devotion)² / SKILL_INTENSITY_DIVISOR (Sins & Devotion sheet). The divisor is
 * 65.37, fixed against the sheet's sampled intensities (e.g. devotion 180 → 0.4125, 1e9 → 6.60).
 * (The sheet's formula-text "/0.6537" is a typo; the sampled values are authoritative.)
 */
export const SKILL_INTENSITY_DIVISOR = 65.37;

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

// ── Apex invocation per-tick effects (03 §2.4) ───────────────────────────────
// Placeholders, spreadsheet-overridable (the `Invocations` sheet wins on numbers); the SHAPE of
// each effect is authoritative.

/**
 * Astiwihad (apex Tristitia): per-second probability that the ENTIRE reprobate population commits
 * suicide at once (03 §2.4: "0.01% chance all reprobates commit suicide"). Integrated exactly over
 * a tick's span as `1 - (1 - p)^deltaSeconds`, so the online 10 Hz loop and one big offline catch-up
 * tick agree.
 */
export const ASTIWIHAD_WIPE_CHANCE_PER_SECOND = 0.0001;

/**
 * Aurevora (apex Gula): an exponentially-rising gold sink paid against a similarly-rising boost to
 * the player's action efficiency (03 §2.4). Both ramp with the seconds the invocation has been
 * active — `base × growth^secondsActive` — mirroring Panvitium's duration-scaled cost (and guarded
 * with `Number.isFinite` the same way, so a runaway ramp dispels rather than overflowing). Once the
 * drain takes gold to 0 the invocation is dispelled.
 */
export const AUREVORA_BASE_GOLD_DRAIN_PER_SECOND = 100;
export const AUREVORA_DRAIN_GROWTH_PER_SECOND = 1.05;
/** Efficiency multiplier base; `growth^secondsActive` (≥ 1 at t = 0, rising "similarly"). */
export const AUREVORA_EFFICIENCY_GROWTH_PER_SECOND = 1.05;

/**
 * Specunitas (apex Vanagloria): multiplier on the Celebrity subtype weight in the conversion-bias
 * draw (03 §2.4 "Celebrity conversion rate is multiplied hundredfold"). Applied by
 * `conversionBiasMul` in dynamics.ts, composed multiplicatively with future per-subtype bias
 * sources (the Eligos #15 / Phenex #37 sigils attach to the same hook).
 */
export const SPECUNITAS_CELEBRITY_BIAS_MUL = 100;

/**
 * Reprobate subtype effects (03 §3). Each subtype has TWO effects: a **Sin-themed Vitium Mercatura
 * gold output boost** (applies multiplicatively to that Sin's businesses, per-count) and a
 * **secondary effect** on some global rate. All "increase" effects compose as `X × (1 + pct × n)`;
 * all "decrease" effects compose as `X / (1 + pct × n)` (asymptotic to 0, never negative — same
 * shape the Sin skills use). Magnitudes here are placeholders, spreadsheet-overridable; the
 * SHAPES are authoritative (which subtype affects which dimension, in which direction).
 */
/** Per-count VM gold boost applied to the matching Sin's businesses (e.g. Gluttons → Gula VM). */
export const SUBTYPE_VM_GOLD_BOOST_PER_COUNT = 0.01; // +1% per matched subtype, per business
/** Glutton (Gula): per-count multiplicative slowdown on the offline catchup duration. */
export const GLUTTON_OFFLINE_PENALTY_PER_COUNT = 0.0001;
/** Degenerate (Luxuria): per-count multiplicative reduction in baseline suicide rate. */
export const DEGENERATE_SUICIDE_REDUCTION_PER_COUNT = 0.001;
/** Degenerate (Luxuria): per-count multiplicative reduction in Choleric murder rate. */
export const DEGENERATE_MURDER_REDUCTION_PER_COUNT = 0.001;
/** Gambler (Avaritia): per-count multiplicative reduction in reprobate generation rate. */
export const GAMBLER_GENERATION_REDUCTION_PER_COUNT = 0.001;
/** Nihilist (Tristitia): per-count multiplicative increase in suicide rate. */
export const NIHILIST_SUICIDE_INCREASE_PER_COUNT = 0.001;
/** Choleric (Ira): per-count multiplicative compounding on its OWN murder rate (in addition to
 *  the linear `BASE × cholerics` term already in `reprobateRates`). Doc text: "by a per-Choleric
 *  percentage", read as a second-order amplification. */
export const CHOLERIC_MURDER_INCREASE_PER_COUNT = 0.001;
/** Husk (Acedia): per-count multiplicative reduction on the PLAYER's action efficiency (online
 *  only — Acedia's offline boost is a separate, future channel). */
export const HUSK_EFFICIENCY_REDUCTION_PER_COUNT = 0.0001;
/** Celebrity (Vanagloria): per-count multiplicative reduction on overall gold rate. */
export const CELEBRITY_GOLD_REDUCTION_PER_COUNT = 0.0001;
/** Sigma (Superbia): per-count multiplicative reduction on influence rate. */
export const SIGMA_INFLUENCE_REDUCTION_PER_COUNT = 0.0001;
