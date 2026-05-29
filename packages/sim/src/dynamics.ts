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
  SPECUNITAS_CELEBRITY_BIAS_MUL,
} from './constants.js';
import {
  businessConversionPerSecond,
  businessConversionSources,
  businessGenerationPerSecond,
} from './builds.js';
import {
  compositumConversionPerSecond,
  compositumConversionSources,
  compositumGenerationPerSecond,
  compositumFlatGenerationPerSecond,
  compositumFlatBaseSuicideRatePerSecond,
  compositumFlatBaseCholericMurderRatePerSecond,
  compositumPopulationGenerationPerSecond,
  compositumDeathFractionPerSecond,
} from './compositum.js';
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
  // Vitium Mercatura output multiplier (Plutus, Vapula #60) scales the BUSINESS contributions to
  // generation and conversion — not the base or Vitium Compositum terms.
  const vmMul = mods.vitiumMercaturaOutputMul;
  const baseGen =
    BASE_REPROBATE_GENERATION_PER_SECOND +
    businessGenerationPerSecond(state) * vmMul +
    compositumGenerationPerSecond(state) +
    compositumFlatGenerationPerSecond(state) + // toggle flat add/decrease (No-babies); clamped below
    compositumPopulationGenerationPerSecond(state); // population-proportional (Bacchanal)
  // Toggle flat additions to the BASE per-capita rates (Doom → suicide, Ethnocentric → murder),
  // applied before the ×population/×cholerics and the subtype-penalty multipliers, so the ceremony
  // raises the floor and the subtype penalties still scale it.
  const suicideBase = BASE_SUICIDE_RATE_PER_SECOND + compositumFlatBaseSuicideRatePerSecond(state);
  const murderBase =
    BASE_CHOLERIC_MURDER_RATE_PER_SECOND + compositumFlatBaseCholericMurderRatePerSecond(state);
  // Enraging Broadcast culls a flat fraction of the WHOLE population each second (not scaled by the
  // suicide-rate multiplier) — added on top of the rate-driven suicides, routed through the same pool.
  const enragingDeaths = compositumDeathFractionPerSecond(state) * population;
  return {
    generationPerSecond: Math.max(0, baseGen) * mods.reprobateGenerationRateMul,
    suicidePerSecond: suicideBase * population * mods.reprobateSuicideRateMul + enragingDeaths,
    murderPerSecond: murderBase * cholerics * mods.cholericMurderRateMul,
    conversionPerSecond:
      businessConversionPerSecond(state) * vmMul + compositumConversionPerSecond(state),
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
 * Per-subtype multiplier on the conversion-bias weights composed by `biasedSubtype` (03 §2.4 /
 * 03 §5). The hook lets apex invocations and sigils tilt the conversion-pool draw toward a
 * specific subtype WITHOUT changing the underlying Vitium throughput — they reshape what a
 * conversion attempt becomes, not how many attempts there are.
 *
 * Wired sources:
 *   - Specunitas (apex Vanagloria, 03 §2.4): Celebrity weight × `SPECUNITAS_CELEBRITY_BIAS_MUL`.
 *
 * Future sources (sigils, ADR-022 composition is multiplicative):
 *   - Eligos #15: Celebrity ↑.
 *   - Phenex #37: Celebrity ↑ (separate magnitude).
 *
 * Returns only entries that differ from 1, so the consumer can fold them in cheaply.
 */
export function conversionBiasMul(state: GameState): Partial<Record<ReprobateSubtype, number>> {
  const out: Partial<Record<ReprobateSubtype, number>> = {};
  if ((state.lifetime.invocations.specunitas ?? 0) > 0) {
    out.celebrity = (out.celebrity ?? 1) * SPECUNITAS_CELEBRITY_BIAS_MUL;
  }
  return out;
}

/**
 * Pick a converted subtype, weighted by the aggregate subtype-biases of every active Vitium
 * source (currently: owned businesses; later: Vitium Compositum toggles). The weight of subtype
 * S = Σ over active sources of (sourceContribution × source.subtypeBias[S]). Per-subtype hooks
 * (Specunitas's ×100 Celebrity, future Eligos/Phenex sigils) are composed multiplicatively on
 * top of the raw weight via `conversionBiasMul`, and the result is renormalized at draw time
 * (02 §9: "if more than 100% it is renormalized"). With no active sources, falls back to
 * `'reprobate'` — conversion no-ops (also caught at the caller anyway).
 *
 * Each source's contribution is currently its per-second rate × count (i.e. its "throughput").
 * This means a Sin you have ten businesses of dominates the bias proportionally — matching the
 * user's correction that subtype is by Vitium weights, not Sin level.
 */
export function biasedSubtype(state: GameState, rng: Rng): ReprobateSubtype {
  const weights = {} as Record<ReprobateSubtype, number>;
  for (const t of REPROBATE_SUBTYPES) weights[t] = 0;
  let total = 0;

  // Per-subtype multipliers (Specunitas, future sigils). Composed BEFORE renormalisation so the
  // boosted subtype pulls probability off the others.
  const biasMul = conversionBiasMul(state);

  // Aggregate over every active Vitium source — businesses AND active Vitium Compositum toggles.
  // Each source contributes conversionPerSecond × subtypeBias[S] × biasMul[S] to subtype S's weight.
  const sources = [...businessConversionSources(state), ...compositumConversionSources(state)];
  for (const src of sources) {
    for (const [subtype, bias] of Object.entries(src.subtypeBias)) {
      if (bias === undefined) continue;
      const mul = biasMul[subtype as ReprobateSubtype] ?? 1;
      const w = src.conversionPerSecond * bias * mul;
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
