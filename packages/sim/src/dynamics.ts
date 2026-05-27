/**
 * Reprobate dynamics (02 §9) — the per-tick mechanics that turn fractional rates into integer
 * births / suicides / murders without losing sub-1 progress between ticks.
 *
 * Three accrual pools live on the lifetime state: `generationPool`, `suicidePool`, `murderPool`.
 * Each tick this module:
 *   1. Reads the per-second rate from the modifier bundle and the current population.
 *   2. Adds `rate × deltaSeconds` to the matching pool.
 *   3. While the pool ≥ 1, decrements by 1 and applies one integer event (a birth, a suicide, a
 *      murder), drawing from the seeded RNG when a choice across subtypes is needed.
 *
 * Pools persist across ticks and across save/load so a sub-1 contribution is never wasted. This
 * mirrors the BigNum-resource fractional-internal / floored-display convention from 02 §1.
 *
 * Events from this module do NOT generate per-death log entries — the HUD's population and souls
 * counters tell the story. A future slice can layer periodic summary logs ("23 reprobates died
 * in the last minute") on top if useful.
 *
 * Edge cases:
 *   - Suicide pool draws across ALL subtypes (including unconverted), weighted by counts. If the
 *     total population is 0 the pool can grow if a base rate is set but nothing happens until at
 *     least one reprobate exists; here `rate × population = 0`, so the pool stays at 0 too.
 *   - Murder pool draws only NON-Choleric reprobates by default. If population_non_choleric = 0,
 *     no murder is applied this iteration — the pool is left intact so progress is not lost.
 *   - Generation pool always adds one unconverted reprobate (type `'reprobate'`); subtype
 *     conversion happens elsewhere via Vitium / Vitium Compositum / Panvitium (02 §9 + user).
 */
import {
  BASE_REPROBATE_GENERATION_PER_SECOND,
  BASE_SUICIDE_RATE_PER_SECOND,
  BASE_CHOLERIC_MURDER_RATE_PER_SECOND,
} from './constants.js';
import { computeModifiers, type Modifiers } from './modifiers.js';
import { addReprobates, mintSouls, removeReprobatesRandom } from './population.js';
import { type Rng } from './rng.js';
import {
  type GameState,
  type ReprobateSubtype,
  REPROBATE_SUBTYPES,
  totalReprobates,
} from './state.js';

/**
 * Per-second rates derived from the current state and the modifier bundle. Exposed for tests; the
 * tick computes these once and feeds them into the pool drain.
 */
export interface ReprobateRates {
  /** Births per second (passive — Vitium is the only meaningful source right now, so 0 by default). */
  readonly generationPerSecond: number;
  /** Suicides per second across the whole population. */
  readonly suicidePerSecond: number;
  /** Murders per second by Cholerics against non-Choleric reprobates. */
  readonly murderPerSecond: number;
}

/** Compute the rates from the state, given a precomputed Modifiers bundle (tick already has it). */
export function reprobateRates(state: GameState, mods: Modifiers): ReprobateRates {
  const population = totalReprobates(state);
  const cholerics = state.lifetime.reprobates.choleric;
  return {
    generationPerSecond: BASE_REPROBATE_GENERATION_PER_SECOND * mods.reprobateGenerationRateMul,
    suicidePerSecond: BASE_SUICIDE_RATE_PER_SECOND * population * mods.reprobateSuicideRateMul,
    murderPerSecond: BASE_CHOLERIC_MURDER_RATE_PER_SECOND * cholerics * mods.cholericMurderRateMul,
  };
}

/** A non-Choleric reprobate count, used to gate murder application. */
function nonCholericCount(state: GameState): number {
  let n = 0;
  for (const t of REPROBATE_SUBTYPES) if (t !== 'choleric') n += state.lifetime.reprobates[t];
  return n;
}

/** Remove one non-Choleric reprobate at random, weighted by subtype counts. */
function removeOneNonCholeric(state: GameState, rng: Rng): GameState {
  const counts = { ...state.lifetime.reprobates };
  const total = nonCholericCount(state);
  if (total <= 0) return state;
  let r = rng.int(total);
  for (const t of REPROBATE_SUBTYPES) {
    if (t === 'choleric') continue;
    if (r < counts[t]) {
      counts[t] -= 1;
      return { ...state, lifetime: { ...state.lifetime, reprobates: counts } };
    }
    r -= counts[t];
  }
  return state;
}

/**
 * Advance the three pools by `deltaSeconds` and apply any integer events that fall out.
 * Pure with respect to `state`; consumes RNG draws when picking subtypes. Returns the new state.
 */
export function applyReprobateDynamics(
  state: GameState,
  deltaSeconds: number,
  rng: Rng,
): GameState {
  if (deltaSeconds <= 0) return state;

  const mods = computeModifiers(state);
  const rates = reprobateRates(state, mods);

  let working: GameState = {
    ...state,
    lifetime: {
      ...state.lifetime,
      generationPool: state.lifetime.generationPool + rates.generationPerSecond * deltaSeconds,
      suicidePool: state.lifetime.suicidePool + rates.suicidePerSecond * deltaSeconds,
      murderPool: state.lifetime.murderPool + rates.murderPerSecond * deltaSeconds,
    },
  };

  // 1. Births. Each whole unit produces one unconverted reprobate. No RNG needed.
  while (working.lifetime.generationPool >= 1) {
    const withBirth = addReprobates(working, 'reprobate', 1);
    working = {
      ...withBirth,
      lifetime: { ...withBirth.lifetime, generationPool: working.lifetime.generationPool - 1 },
    };
  }

  // 2. Suicides. Each whole unit kills one reprobate at random across all subtypes; the death
  //    yields 1 soul (03 §3).
  while (working.lifetime.suicidePool >= 1 && totalReprobates(working) > 0) {
    const r = removeReprobatesRandom(working, 1, rng);
    if (r.removed === 0) break; // safety: nothing to kill, leave the pool intact
    const withSoul = mintSouls(r.state, 1);
    working = {
      ...withSoul,
      lifetime: { ...withSoul.lifetime, suicidePool: working.lifetime.suicidePool - 1 },
    };
  }

  // 3. Murders. Cholerics kill non-Cholerics; each kill yields 1 soul. If no non-Cholerics exist,
  //    we leave the pool alone so progress isn't lost — they'll resolve once a target appears.
  while (working.lifetime.murderPool >= 1 && nonCholericCount(working) > 0) {
    const after = removeOneNonCholeric(working, rng);
    if (after === working) break; // safety
    const withSoul = mintSouls(after, 1);
    working = {
      ...withSoul,
      lifetime: { ...withSoul.lifetime, murderPool: working.lifetime.murderPool - 1 },
    };
  }

  return working;
}

/**
 * Pick a reprobate subtype for conversion, weighted by the active *Vitium* sources' specific
 * conversion rates (02 §9, user note: the bias is by Vitium/Vitium-Compositum weights, NOT by
 * Sin level). This is a stub for the upcoming Vitium slice — until that lands there are no
 * active sources, so this function always returns `'reprobate'` (no conversion happens).
 *
 * The signature is here now so future systems and tests can already wire against it.
 */
export function biasedSubtype(_state: GameState, _rng: Rng): ReprobateSubtype {
  return 'reprobate';
}
