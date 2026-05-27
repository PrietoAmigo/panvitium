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
import { computeModifiers } from './modifiers.js';
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
  const mods = computeModifiers(state);

  // 1. Passive generation (02 §1) with modifier bundle applied.
  //    Gold/s scales with `goldRateMul` (Avaritia skill et al.).
  //    Influence is gain = effectiveMax × BASE_INFLUENCE_RATE × `influenceRateMul`, capped at
  //    `effectiveMax = base × maxInfluenceMul` (Vanagloria skill raises the cap; level its rate).
  //    Resources are natural numbers (02 §1) but accumulate fractionally per 100 ms tick — floored
  //    only at display/spend/comparison boundary.
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const lifetime = {
    ...state.lifetime,
    gold: add(state.lifetime.gold, mul(BASE_GOLD_PER_SECOND * mods.goldRateMul, deltaSeconds)),
    influence: min(
      add(
        state.lifetime.influence,
        mul(effectiveMax, BASE_INFLUENCE_RATE * mods.influenceRateMul * deltaSeconds),
      ),
      effectiveMax,
    ),
  };
  let working: GameState = { ...state, lifetime };
  const events: OutcomeEvent[] = [];

  // 2. Resolve in-flight Opera timers. A timer whose remaining time falls to <= 0 this tick
  //    completes: its outcome is drawn from `rng` and applied, scaled by player efficiency.
  //    A large (offline) delta resolves every queued action at once.
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
      const resolved = resolveAction(working, actionId, rng, mods.playerEfficiencyMul);
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
