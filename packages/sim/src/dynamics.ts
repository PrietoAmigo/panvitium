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
import {
  compositumGenerationPerSecond,
  compositumFlatGenerationPerSecond,
  compositumFlatBaseSuicideRatePerSecond,
  compositumFlatBaseMurderRatePerSecond,
  compositumPopulationGenerationPerSecond,
  compositumDeathFractionPerSecond,
  panvitiumRate,
} from './compositum.js';
import { computeModifiers, type Modifiers } from './modifiers.js';
import { addReprobates, mintSouls, removeReprobates } from './population.js';
import { sigilMurderGoldPerKill } from './sigils.js';
import { add } from './bignum.js';
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
  // Vitium Mercatura output multiplier (Plutus, Vapula #60) scales the MERCATUS contribution to
  // generation — not the base or Vitium Compositum terms.
  const vmMul = mods.vitiumMercaturaOutputMul;
  const baseGen =
    BASE_REPROBATE_GENERATION_PER_SECOND +
    mercatusGenerationPerSecond(state) * vmMul +
    compositumGenerationPerSecond(state) +
    compositumFlatGenerationPerSecond(state) + // toggle flat add/decrease (No-babies); clamped below
    compositumPopulationGenerationPerSecond(state) + // population-proportional (Bacchanal)
    panvitiumRate(state); // Panvitium: R(t) = 0.01·eᵗ is also a flat generation increase
  // Toggle flat additions to the BASE per-capita rates (Doom → suicide, Ethnocentric → murder),
  // applied before the ×population and the rate multipliers, so the ceremony raises the floor and
  // the multipliers still scale it.
  const suicideBase =
    BASE_SUICIDE_RATE_PER_SECOND +
    compositumFlatBaseSuicideRatePerSecond(state) +
    mods.flatBaseSuicideRatePerSecond;
  const murderBase = BASE_MURDER_RATE_PER_SECOND + compositumFlatBaseMurderRatePerSecond(state);
  // Enraging Broadcast culls a flat fraction of the WHOLE population each second (not scaled by the
  // suicide-rate multiplier) — added on top of the rate-driven suicides, routed through the same pool.
  const enragingDeaths = compositumDeathFractionPerSecond(state) * population;
  return {
    generationPerSecond: Math.max(0, baseGen) * mods.reprobateGenerationRateMul,
    suicidePerSecond: suicideBase * population * mods.reprobateSuicideRateMul + enragingDeaths,
    murderPerSecond: murderBase * population * mods.murderRateMul,
  };
}

/**
 * Advance the three pools by `deltaSeconds` and apply any integer events that fall out.
 * Pure with respect to `state`. Returns the new state.
 */
export function applyReprobateDynamics(state: GameState, deltaSeconds: number): GameState {
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

  // 1. Births. Each whole unit produces one reprobate. No RNG needed.
  while (working.lifetime.generationPool >= 1) {
    const withBirth = addReprobates(working, 1);
    working = {
      ...withBirth,
      lifetime: { ...withBirth.lifetime, generationPool: working.lifetime.generationPool - 1 },
    };
  }

  // 2. Suicides. Each whole unit kills one reprobate; the death yields 1 soul (03 §3).
  while (working.lifetime.suicidePool >= 1 && totalReprobates(working) > 0) {
    const r = removeReprobates(working, 1);
    if (r.removed === 0) break;
    const withSoul = mintSouls(r.state, 1);
    working = {
      ...withSoul,
      lifetime: { ...withSoul.lifetime, suicidePool: working.lifetime.suicidePool - 1 },
    };
  }

  // 3. Murders. Each whole unit kills one reprobate; each kill yields 1 soul. If no reprobates
  //    exist, the pool is left intact so progress isn't lost. Leraie #14: each murder also yields
  //    gold (0 when unbound, so the gold ledger is untouched without the sigil).
  const murderGoldPerKill = sigilMurderGoldPerKill(working);
  while (working.lifetime.murderPool >= 1 && totalReprobates(working) > 0) {
    const r = removeReprobates(working, 1);
    if (r.removed === 0) break;
    const withSoul = mintSouls(r.state, 1);
    working = {
      ...withSoul,
      lifetime: {
        ...withSoul.lifetime,
        gold:
          murderGoldPerKill > 0
            ? add(withSoul.lifetime.gold, murderGoldPerKill)
            : withSoul.lifetime.gold,
        murderPool: working.lifetime.murderPool - 1,
      },
    };
  }

  return working;
}
