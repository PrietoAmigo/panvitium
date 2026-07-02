/**
 * Reprobate dynamics (02 §9) — the per-tick mechanics that turn fractional rates into integer
 * births / suicides / murders without losing sub-1 progress between ticks.
 *
 * Three accrual pools live on the lifetime state: `generationPool`, `suicidePool`, `murderPool`
 * (the conversion pool and the whole subtype-conversion mechanic were removed — reprobates are a
 * single undifferentiated pool). Each tick this module:
 *   1. Reads the per-second rate from the modifier bundle and the current population.
 *   2. Adds `rate × deltaSeconds` to the matching pool.
 *   3. While the pool ≥ 1, decrements by 1 and applies one integer event (a birth, a suicide, or a
 *      murder).
 *
 * Pools persist across ticks and across save/load so a sub-1 contribution is never wasted. This
 * mirrors the BigNum-resource fractional-internal / floored-display convention from 02 §1.
 *
 * With a single pool there is no subtype to draw, so this module no longer consumes RNG: every
 * birth adds one reprobate, every suicide/murder removes one, and each death mints exactly 1 soul
 * (1 person, 1 soul — never changes).
 */
import {
  BASE_REPROBATE_GENERATION_PER_SECOND,
  BASE_SUICIDE_RATE_PER_SECOND,
  BASE_MURDER_RATE_PER_SECOND,
} from './constants.js';
import { mercatusGenerationPerSecond } from './mercatus.js';
import { compositumGenerationPerSecond, panvitiumRate } from './compositum.js';
import { computeModifiers, type Modifiers } from './modifiers.js';
import { addReprobates, mintSouls, removeReprobates } from './population.js';
import { type GameState, totalReprobates } from './state.js';

/**
 * Per-second rates derived from the current state and the modifier bundle. Exposed for tests; the
 * tick computes these once and feeds them into the pool drain.
 */
export interface ReprobateRates {
  /** Births per second (passive base + Mercatus depth contributions × generation mul). */
  readonly generationPerSecond: number;
  /** Suicides per second across the whole population. */
  readonly suicidePerSecond: number;
  /** Murders per second across the whole population (per-capita base × population × mul). */
  readonly murderPerSecond: number;
}

/** Compute the rates from the state, given a precomputed Modifiers bundle (tick already has it). */
export function reprobateRates(state: GameState, mods: Modifiers): ReprobateRates {
  const population = totalReprobates(state);
  // Sigils sheet rev 2026-06-12: the MERCATUS generation term takes the dedicated generation
  // multiplier (Sitri #12); `vitiumMercaturaOutputMul` (Plutus, Vapula #60) now scales REVENUE
  // only, at the tick's income line.
  const baseGen =
    BASE_REPROBATE_GENERATION_PER_SECOND +
    mercatusGenerationPerSecond(state) * mods.vitiumMercaturaGenerationMul +
    compositumGenerationPerSecond(state) +
    panvitiumRate(state) + // Panvitium: R(t) = 0.01·eᵗ is also a flat generation increase
    mods.flatGenerationPerSecond; // Ose #57 — flat births/s from the sigil channel
  // The ceremony rate BOOSTS (Bacchanal generation, Doom suicide, Enraging murder — sheet rev
  // 2026-06-12) live in the modifier bundle, so they arrive through the three multipliers below.
  // The flat per-capita additions: Nightmares + Sabnock #43 (suicide), Glasya-Labolas #25 (murder).
  const suicideBase = BASE_SUICIDE_RATE_PER_SECOND + mods.flatBaseSuicideRatePerSecond;
  const murderBase = BASE_MURDER_RATE_PER_SECOND + mods.flatBaseMurderRatePerSecond;
  const murderPerSecond = murderBase * population * mods.murderRateMul;
  // Leraie #14: each murder drives a witness to the rope with probability p — at the rate level,
  // suicides gain p × the murder rate.
  const suicidePerSecond =
    suicideBase * population * mods.reprobateSuicideRateMul +
    mods.murderTriggersSuicideChance * murderPerSecond;
  return {
    generationPerSecond: Math.max(0, baseGen) * mods.reprobateGenerationRateMul,
    suicidePerSecond,
    murderPerSecond,
  };
}

/** Offline-only scaling options for the pool accrual (Zepar #16 via `resumeGame`'s tick deps). */
export interface ReprobateDynamicsOptions {
  readonly generationMul?: number;
}

/**
 * Advance the three pools by `deltaSeconds` and apply any integer events that fall out.
 * Pure with respect to `state`. Returns the new state.
 */
export function applyReprobateDynamics(
  state: GameState,
  deltaSeconds: number,
  opts: ReprobateDynamicsOptions = {},
): GameState {
  if (deltaSeconds <= 0) return state;

  const mods = computeModifiers(state);
  const rates = reprobateRates(state, mods);
  const generationMul = opts.generationMul ?? 1;

  let working: GameState = {
    ...state,
    lifetime: {
      ...state.lifetime,
      generationPool:
        state.lifetime.generationPool + rates.generationPerSecond * generationMul * deltaSeconds,
      suicidePool: state.lifetime.suicidePool + rates.suicidePerSecond * deltaSeconds,
      murderPool: state.lifetime.murderPool + rates.murderPerSecond * deltaSeconds,
    },
  };

  // Every whole unit in a pool is identical (single undifferentiated pool, no RNG per event), so
  // each pool drains in ONE bulk application rather than a unit-at-a-time loop. This matters for
  // the uncapped offline catch-up tick (ADR-004 amended): a long absence can land millions of
  // accrued units in a pool at once, and a per-unit loop respreading the state each iteration
  // would hang the load for minutes.

  // 1. Births. Each whole unit produces one reprobate; unbounded by population.
  {
    const births = Math.floor(working.lifetime.generationPool);
    if (births >= 1) {
      const withBirths = addReprobates(working, births);
      working = {
        ...withBirths,
        lifetime: {
          ...withBirths.lifetime,
          generationPool: working.lifetime.generationPool - births,
        },
      };
    }
  }

  // 2. Suicides. Each whole unit kills one reprobate; every death yields 1 soul (03 §3). Bounded
  //    by the living population; the unspent remainder stays pooled so progress isn't lost.
  {
    const deaths = Math.min(Math.floor(working.lifetime.suicidePool), totalReprobates(working));
    if (deaths >= 1) {
      const r = removeReprobates(working, deaths);
      const withSouls = mintSouls(r.state, r.removed);
      working = {
        ...withSouls,
        lifetime: { ...withSouls.lifetime, suicidePool: working.lifetime.suicidePool - r.removed },
      };
    }
  }

  // 3. Murders. Each whole unit kills one reprobate; each kill yields 1 soul. If no reprobates
  //    remain, the pool is left intact so progress isn't lost. (Leraie #14's murder→suicide
  //    coupling is rate-level, in `reprobateRates`; the old murder-gold effect is retired per the
  //    Sigils sheet rev 2026-06-12.)
  {
    const deaths = Math.min(Math.floor(working.lifetime.murderPool), totalReprobates(working));
    if (deaths >= 1) {
      const r = removeReprobates(working, deaths);
      const withSouls = mintSouls(r.state, r.removed);
      working = {
        ...withSouls,
        lifetime: { ...withSouls.lifetime, murderPool: working.lifetime.murderPool - r.removed },
      };
    }
  }

  return working;
}
