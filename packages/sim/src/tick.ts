/**
 * The tick function (ADR-004).
 *
 * One pure function advances the whole game by a span of seconds. The same function serves BOTH the
 * live 10 Hz loop (delta ≈ 0.1 s) and offline progression (one call, large capped delta), so online
 * and offline gains can never drift apart.
 *
 * Purity contract: no DOM access, no `Math.random`, no mutation of the input `state`. All randomness
 * comes from the injected seeded RNG (ADR-011); its advanced state is written back into the result.
 *
 * Systems land here in order; this slice implements passive generation (gold, influence). Action
 * timers, probability-tier outcomes, toggles, and reprobate population effects slot in where marked.
 */
import { add, min, mul } from './bignum.js';
import { BASE_GOLD_PER_SECOND, BASE_INFLUENCE_PER_SECOND } from './constants.js';
import { makeRng } from './rng.js';
import { type GameState } from './state.js';

/**
 * Injected dependencies for a tick (tuning tables that aren't part of the state). Empty for now;
 * systems that need data receive it here rather than importing it, to keep `tick` deterministic.
 */
export interface TickDeps {
  readonly _reserved?: never;
}

/** Advance `state` by `deltaSeconds`. Returns a new state; never mutates the input. */
export function tick(state: GameState, deltaSeconds: number, _deps: TickDeps = {}): GameState {
  if (deltaSeconds <= 0) return state;

  const rng = makeRng(state.rngState);
  const { lifetime } = state;

  // 1. Passive generation (02 §1). Gold accrues at a flat base rate; influence accrues toward the
  //    maximum and is capped there. Resources are natural numbers (02 §1), but a 100 ms tick of a
  //    5/s rate yields 0.5 — so values accumulate with full precision here and are floored only at
  //    the display/spend/comparison boundary (see format + the bignum gotcha), never per tick.
  const gold = add(lifetime.gold, mul(BASE_GOLD_PER_SECOND, deltaSeconds));
  const influence = min(
    add(lifetime.influence, mul(BASE_INFLUENCE_PER_SECOND, deltaSeconds)),
    lifetime.maxInfluence,
  );

  // 2. resolve in-flight action timers                          [step: Opera]
  // 3. probability-tier outcomes (Suasio / Decimatio / ...)     [step: outcomes]
  // 4. toggles per-second effects & costs (incl. Panvitium)     [step: toggles]
  // 5. reprobate suicide / murder population effects            [step: reprobates]
  // (no draws yet, so rng.state is unchanged this slice)

  return {
    ...state,
    lifetime: { ...lifetime, gold, influence },
    lastTickAt: state.lastTickAt + Math.round(deltaSeconds * 1000),
    rngState: rng.state,
  };
}
