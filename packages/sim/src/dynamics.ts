/**
 * Reprobate dynamics (02 §9) — the per-tick mechanics that turn fractional rates into integer
 * births / suicides / murders / conversions without losing sub-1 progress between ticks.
 *
 * Four accrual pools live on the lifetime state: `generationPool`, `suicidePool`, `murderPool`,
 * `conversionPool`. Each tick this module:
 *   1. Reads the per-second rate from the modifier bundle and the current population.
 *   2. Adds `rate × deltaSeconds` to the matching pool.
 *   3. While the pool ≥ 1, decrements by 1 and applies one integer event (a birth, a suicide, a
 *      murder, or a conversion), drawing from the seeded RNG when a choice across subtypes is
 *      needed.
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
 *     conversion is a SEPARATE mechanic via the conversion pool.
 *   - Conversion pool: while ≥ 1, picks a subtype via `biasedSubtype` (weighted by active Vitium
 *     sources' subtype biases) and converts ONE unconverted reprobate to it. If no unconverted
 *     exists, the pool is left intact — businesses queue future conversions.
 */
import {
  BASE_REPROBATE_GENERATION_PER_SECOND,
  BASE_SUICIDE_RATE_PER_SECOND,
  BASE_CHOLERIC_MURDER_RATE_PER_SECOND,
} from './constants.js';
import { businessConversionPerSecond, businessGenerationPerSecond } from './builds.js';
import { businessById } from './businesses.js';
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
  /** Births per second (passive base + per-business contributions × generation mul). */
  readonly generationPerSecond: number;
  /** Suicides per second across the whole population. */
  readonly suicidePerSecond: number;
  /** Murders per second by Cholerics against non-Choleric reprobates. */
  readonly murderPerSecond: number;
  /** Conversion attempts per second from active Vitium sources. */
  readonly conversionPerSecond: number;
}

/** Compute the rates from the state, given a precomputed Modifiers bundle (tick already has it). */
export function reprobateRates(state: GameState, mods: Modifiers): ReprobateRates {
  const population = totalReprobates(state);
  const cholerics = state.lifetime.reprobates.choleric;
  const baseGen = BASE_REPROBATE_GENERATION_PER_SECOND + businessGenerationPerSecond(state);
  return {
    generationPerSecond: baseGen * mods.reprobateGenerationRateMul,
    suicidePerSecond: BASE_SUICIDE_RATE_PER_SECOND * population * mods.reprobateSuicideRateMul,
    murderPerSecond: BASE_CHOLERIC_MURDER_RATE_PER_SECOND * cholerics * mods.cholericMurderRateMul,
    conversionPerSecond: businessConversionPerSecond(state),
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
 * Pick a converted subtype, weighted by the aggregate subtype-biases of every active Vitium
 * source (currently: owned businesses; later: Vitium Compositum toggles). The weight of subtype
 * S = Σ over active sources of (sourceContribution × source.subtypeBias[S]). The result is
 * renormalized at draw time (02 §9: "if more than 100% it is renormalized"). With no active
 * sources, falls back to `'reprobate'` — conversion no-ops (also caught at the caller anyway).
 *
 * Each source's contribution is currently its per-second rate × count (i.e. its "throughput").
 * This means a Sin you have ten businesses of dominates the bias proportionally — matching the
 * user's correction that subtype is by Vitium weights, not Sin level.
 */
export function biasedSubtype(state: GameState, rng: Rng): ReprobateSubtype {
  const weights = {} as Record<ReprobateSubtype, number>;
  for (const t of REPROBATE_SUBTYPES) weights[t] = 0;
  let total = 0;

  // Vitium Mercatura contributions: per-business conversionPerSecond × count × subtypeBias.
  for (const [bid, count] of Object.entries(state.lifetime.businesses)) {
    const def = businessById(bid);
    if (!def || !count) continue;
    const sourceContrib = def.conversionPerSecond * count;
    for (const [subtype, bias] of Object.entries(def.subtypeBias)) {
      if (bias === undefined) continue;
      const w = sourceContrib * bias;
      weights[subtype as ReprobateSubtype] += w;
      total += w;
    }
  }

  if (total <= 0) return 'reprobate';

  // Renormalize implicitly by drawing against the total.
  const draw = rng.float() * total;
  let acc = 0;
  for (const t of REPROBATE_SUBTYPES) {
    acc += weights[t];
    if (draw < acc) return t;
  }
  return 'reprobate';
}

/**
 * Try to apply one conversion attempt against the current population. Two outcomes are possible:
 *   - `null` — cannot proceed: no unconverted reprobate exists OR no Vitium source is active.
 *              The caller should NOT drain the pool; the attempt waits for a future target.
 *   - `{ state, converted }` — the attempt was spent. `converted: true` if a real subtype was
 *     picked AND applied; `converted: false` if `biasedSubtype` picked `'reprobate'` (the
 *     recruitment didn't take). Either way the pool drains.
 */
function applyOneConversion(
  state: GameState,
  rng: Rng,
): { readonly state: GameState; readonly converted: boolean } | null {
  if (state.lifetime.reprobates.reprobate <= 0) return null;
  const subtype = biasedSubtype(state, rng);
  if (subtype === 'reprobate') {
    // Recruitment didn't take; the attempt is spent. No population change.
    return { state, converted: false };
  }
  const reprobates = { ...state.lifetime.reprobates };
  reprobates.reprobate -= 1;
  reprobates[subtype] += 1;
  return {
    state: { ...state, lifetime: { ...state.lifetime, reprobates } },
    converted: true,
  };
}

/**
 * Advance the four pools by `deltaSeconds` and apply any integer events that fall out.
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
      conversionPool: state.lifetime.conversionPool + rates.conversionPerSecond * deltaSeconds,
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
    if (r.removed === 0) break;
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
    if (after === working) break;
    const withSoul = mintSouls(after, 1);
    working = {
      ...withSoul,
      lifetime: { ...withSoul.lifetime, murderPool: working.lifetime.murderPool - 1 },
    };
  }

  // 4. Conversions. Each whole unit is a conversion ATTEMPT. The attempt drains the pool if a
  //    subtype is picked (even if the bias picks `'reprobate'` and no real conversion happens);
  //    it does NOT drain if there's no unconverted target available (those attempts wait).
  while (working.lifetime.conversionPool >= 1 && working.lifetime.reprobates.reprobate > 0) {
    const r = applyOneConversion(working, rng);
    if (r === null) break;
    working = {
      ...r.state,
      lifetime: { ...r.state.lifetime, conversionPool: working.lifetime.conversionPool - 1 },
    };
  }

  return working;
}
