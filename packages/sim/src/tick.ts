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
 * Returns the new state plus the outcome events generated this tick (02 §2) — transient, not
 * persisted; the caller surfaces them in the log / pop-ups.
 */
import { add, min, mul } from './bignum.js';
import { resolveAction } from './actions.js';
import { BASE_GOLD_PER_SECOND, BASE_INFLUENCE_RATE } from './constants.js';
import { type OutcomeEvent } from './events.js';
import { makeRng } from './rng.js';
import { type ActionTimer, type GameState } from './state.js';

/** Injected dependencies for a tick (tuning tables that aren't part of the state). Empty for now. */
export interface TickDeps {
  readonly _reserved?: never;
}

/** The result of advancing the game: the new state and any outcomes that resolved this tick. */
export interface TickResult {
  readonly state: GameState;
  readonly events: OutcomeEvent[];
}

/** Advance `state` by `deltaSeconds`. Returns a new state; never mutates the input. */
export function tick(state: GameState, deltaSeconds: number, _deps: TickDeps = {}): TickResult {
  if (deltaSeconds <= 0) return { state, events: [] };

  const rng = makeRng(state.rngState);

  // 1. Passive generation (02 §1). Gold accrues at a flat base rate; influence accrues as a
  //    fraction of maxInfluence per second (Globals: BASE_INFLUENCE_RATE × maxInfluence) and is
  //    capped at the maximum. Resources are natural numbers (02 §1), but a 100 ms tick yields
  //    fractions — so values accumulate with full precision here and are floored only at the
  //    display/spend/comparison boundary (the bignum gotcha), never per tick.
  const lifetime = {
    ...state.lifetime,
    gold: add(state.lifetime.gold, mul(BASE_GOLD_PER_SECOND, deltaSeconds)),
    influence: min(
      add(
        state.lifetime.influence,
        mul(state.lifetime.maxInfluence, BASE_INFLUENCE_RATE * deltaSeconds),
      ),
      state.lifetime.maxInfluence,
    ),
  };
  let working: GameState = { ...state, lifetime };
  const events: OutcomeEvent[] = [];

  // 2. Resolve in-flight Opera timers. A timer whose remaining time falls to <= 0 this tick
  //    completes: its outcome is drawn from `rng` and applied. A large (offline) delta resolves
  //    every queued action at once.
  if (working.lifetime.actionQueue.length > 0) {
    const remaining: ActionTimer[] = [];
    const completed: string[] = [];
    for (const timer of working.lifetime.actionQueue) {
      const left = timer.remainingSeconds - deltaSeconds;
      if (left > 0) remaining.push({ actionId: timer.actionId, remainingSeconds: left });
      else completed.push(timer.actionId);
    }
    working = { ...working, lifetime: { ...working.lifetime, actionQueue: remaining } };
    for (const actionId of completed) {
      const resolved = resolveAction(working, actionId, rng);
      working = resolved.state;
      if (resolved.event) events.push(resolved.event);
    }
  }

  // 3. toggles per-second effects & costs (incl. Panvitium)     [step: toggles]
  // 4. reprobate suicide / murder population effects            [step: reprobates]

  return {
    state: {
      ...working,
      lastTickAt: state.lastTickAt + Math.round(deltaSeconds * 1000),
      rngState: rng.state,
    },
    events,
  };
}
