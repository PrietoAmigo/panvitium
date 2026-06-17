/**
 * Cross-cutting economy constants. These mirror the `Globals` sheet of the economy spreadsheet,
 * which is the source of truth for numbers. Where a design-doc prose value disagreed with the
 * spreadsheet, the spreadsheet wins — noted inline.
 *
 * This file holds the cross-cutting SCALARS; the per-system tables (the other editable economy
 * knobs) live alongside their engines as pure data: `actions.data.ts`, `compositum.data.ts`,
 * `invocations.data.ts`, `maleficia.data.ts`, `sigils.data.ts`. See DEVELOPMENT.md "Tuning the
 * economy" for the full map.
 */

/** Base passive gold gain per second (Globals: 2 gold/s). */
export const BASE_GOLD_PER_SECOND = 2;

/**
 * Player base offline efficiency (Globals row 8: 0.5×). Offline catch-up advances the logical
 * clock at half rate — applied to the elapsed-time scaling in the web's `resumeGame`, alongside
 * `offlineTimeMul` (which Procrastination / Dolce / Lemure / Mercatus Acediae lift). Previously a
 * spreadsheet constant with no code counterpart; wired with the Mercatus signature clauses so the
 * Acediae revenue exemption has a factor to be exempt FROM.
 */
export const PLAYER_OFFLINE_EFFICIENCY = 0.5;

/**
 * Base passive influence gain, as a fraction of maxInfluence per second (Globals: 0.005, unit
 * "% of max infl / s"). Influence is generated as a percentage of the maximum and capped there
 * (02 §1) — so gain/s = BASE_INFLUENCE_RATE × maxInfluence. (Supersedes the doc's flat "5/s".)
 */
export const BASE_INFLUENCE_RATE = 0.005;

/** Base maximum influence for a fresh lifetime; sin/sigil/maleficia modifiers raise it later. */
export const BASE_MAX_INFLUENCE = 100;

/**
 * Acolyte count thresholds (Acolytes sheet rev 2026-06-12). The Nth acolyte unlocks once effective
 * max influence reaches the Nth threshold; the thresholds form a ×1.5 geometric series anchored at
 * the base, each step rounded to the nearest integer and compounding off the rounded previous value
 * (110 → 165 → 248 → 371 → …). A fresh lifetime (base 100 influence) therefore has 0 acolytes; the
 * first unlocks at 110.
 */
export const ACOLYTE_THRESHOLD_BASE = 110;
export const ACOLYTE_THRESHOLD_GROWTH = 1.5;

/** Base reprobate suicide chance per second, applied to the whole population (Globals: 0.0001). */
export const BASE_SUICIDE_RATE_PER_SECOND = 0.0001;

/**
 * Base reprobate generation per second, before *Vitium*-driven contributions (Globals).
 * Currently 0: no passive reprobate generation happens until a business is producing one (02 §9).
 * The `generationPool` mechanism is in place so a future Vitium slice can simply add to the rate.
 */
export const BASE_REPROBATE_GENERATION_PER_SECOND = 0;

/**
 * Panvitium's instantaneous rate base R₀ (Globals: 1 × Base VC conversion rate 0.01). With the
 * conversion mechanic removed, R(t) = R₀·eᵗ no longer drives conversion; it still drives the two
 * surviving coupled effects (soul harvest ∝ current souls, and a flat reprobate-generation
 * increase). t = seconds Panvitium has been active; the eᵗ growth base is shared with the cost ramp.
 */
export const PANVITIUM_RATE_BASE = 0.01;

/**
 * Base reprobate murder rate (kills / reprobate / second), applied to the whole population, before
 * sigil/maleficium/ceremony modifiers. With reprobate subtypes removed, murder is a per-capita cull
 * of the single pool (re-anchored from the old per-Choleric rate). Pinned to the Globals sheet
 * (0.0002/s); the SHAPE (per-capita on total population) is likewise authoritative.
 */
export const BASE_MURDER_RATE_PER_SECOND = 0.0002;

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
 * effect (Sins & Devotion sheet rev 2026-06-12 — all three at +12.5%/level):
 *   - remaining gold %:           +12.5%/level Avaritia (Mammon, "Golden Hand")
 *   - remaining reprobate %:      +12.5%/level Tristitia (Leviathan, "Resignation")
 *   - remaining maleficia chance: +12.5%/level Superbia (Lucifer, "Morning Star")
 */
export const BASE_REMAINING_GOLD = 0.05; // Globals: 0.05 (5%)
export const BASE_REMAINING_MALEFICIA = 0.05; // Globals value 0.05 (the "(25%)" note is superseded)
export const BASE_REMAINING_REPROBATE = 0.05; // Globals: 0.05
export const REMAINING_GOLD_PER_AVARITIA_LEVEL = 0.125;
export const REMAINING_REPROBATE_PER_TRISTITIA_LEVEL = 0.125;
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
 * Ira per-level effect (03 §1, "Retribution" / Satan): each level multiplies BOTH acolyte action
 * efficiency and invocation action efficiency by this factor. Doc text: "+33% per level". Folded
 * into `acolyteEfficiencyMul` and `invocationEfficiencyMul` by `computeModifiers`.
 */
/**
 * Sins & Devotion sheet (rev 2026-06-12), per-level effects:
 * - Gula: each level removes a quarter of the negative tiers' weight (Bad/Terrible/Apocalyptic
 *   ×(1 − 0.25·L), level 4 → no negative outcomes; freed mass renormalizes across the rest).
 * - Luxuria: ×2 overall Suasio efficiency per level. - Ira: ×2 overall Decimatio efficiency
 *   per level. The old ×1.33 Ira acolyte/invocation ladder is retired — those channels are now
 *   the Tristitia (acolytes) and Ira (invocations) SKILL intensities.
 */
export const GULA_NEGATIVE_TIER_REDUCTION_PER_LEVEL = 0.25;
export const LUXURIA_SUASIO_EFF_PER_LEVEL = 2;
export const IRA_DECIMATIO_EFF_PER_LEVEL = 2;

/**
 * Acedia per-level effect (03 §1, "Procrastination" / Belphegor): each level applies a
 * `1.0000002^(X · L²)` multiplier to the offline-time duration used by `resumeGame`, where X is the
 * offline SECONDS (sheet: "s is seconds offline in a row") and L is the Acedia level. Time-dependent — *not* a static modifier; applied at
 * session-resume time. The sheet pins no value for this base, so 1.00002 is a genuine tuning
 * constant (not awaiting a sheet number); the shape (an exponential in `X · L²`) is authoritative.
 */
export const ACEDIA_OFFLINE_COMPOUND_BASE = 1.0000002; // per SECOND offline (sheet rev 2026-06-12)

/**
 * Maleficia enhancer magnitudes (03 §4 / Maleficia sheet). Each is an Opera-efficiency multiplier
 * applied as a separate `(1 + bonus)` factor (multiplicative composition, ADR-022). Items are
 * non-stackable, so the count is 0 or 1.
 */
export const ARS_SERPENS_SUASIO_BONUS = 0.33;
export const VOYNICH_SUASIO_BONUS = 0.66;
export const RITUAL_DAGGER_DECIMATIO_BONUS = 0.33;
/** Solomon's Ring: +66% to all sigil effect strength (×1.66, Maleficia sheet). Iron Nails: +1% per copy. */
export const SOLOMON_RING_SIGIL_BONUS = 0.66;
export const IRON_NAILS_SIGIL_BONUS = 0.01;
