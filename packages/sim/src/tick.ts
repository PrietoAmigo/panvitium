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
import { advanceAcolytes, autoRecruitAcolytes } from './acolytes.js';
import { advanceBuilds, businessGoldPerSecond } from './builds.js';
import { BASE_GOLD_PER_SECOND, BASE_INFLUENCE_RATE } from './constants.js';
import { applyReprobateDynamics } from './dynamics.js';
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
  //    Gold/s = (base + Σ business goldPerSecond × count) × goldRateMul. Business income obeys
  //    the same multiplier so Avaritia / Silver / etc. scale shop output as well as base.
  //    Influence is gain = effectiveMax × BASE_INFLUENCE_RATE × `influenceRateMul`, capped at
  //    `effectiveMax = base × maxInfluenceMul` (Vanagloria skill raises the cap; level its rate).
  //    Resources are natural numbers (02 §1) but accumulate fractionally per 100 ms tick — floored
  //    only at display/spend/comparison boundary.
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const goldPerSecond = (BASE_GOLD_PER_SECOND + businessGoldPerSecond(state)) * mods.goldRateMul;
  const lifetime = {
    ...state.lifetime,
    gold: add(state.lifetime.gold, mul(goldPerSecond, deltaSeconds)),
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
  //    A large (offline) delta resolves every queued action at once. Emptio carries its target
  //    maleficium id on the timer so the resolver knows which item was being bought.
  if (working.lifetime.actionQueue.length > 0) {
    const remaining: ActionTimer[] = [];
    const completed: ActionTimer[] = [];
    for (const timer of working.lifetime.actionQueue) {
      const left = timer.remainingSeconds - deltaSeconds;
      if (left > 0) {
        remaining.push(
          timer.target === undefined
            ? { actionId: timer.actionId, remainingSeconds: left }
            : { actionId: timer.actionId, remainingSeconds: left, target: timer.target },
        );
      } else {
        completed.push(timer);
      }
    }
    working = { ...working, lifetime: { ...working.lifetime, actionQueue: remaining } };
    for (const timer of completed) {
      const resolved = resolveAction(
        working,
        timer.actionId,
        rng,
        timer.target === undefined ? {} : { target: timer.target },
      );
      working = resolved.state;
      if (resolved.event) events.push(resolved.event);
    }
  }

  // 3. Vitium Mercatura build queue (03 §2.3 / 02 §3): builds advance independently of the
  //    player action slot. Completed builds increment the businesses map; new owned counts
  //    contribute to subsequent ticks' gold/generation/conversion rates.
  working = advanceBuilds(working, deltaSeconds);

  // 4. Reprobate dynamics: fractional pools accrue per tick and drain into integer
  //    births / suicides / murders / conversions (02 §9). Each death mints 1 soul. The pools
  //    live on the lifetime state and persist across save/load (ADR-023 additive optional).
  working = applyReprobateDynamics(working, deltaSeconds, rng);

  // 5. Acolytes (02 §10). Auto-recruit up to maxAcolytes(state) (free, immediate, log10-scaled
  //    on effective maxInfluence). Then advance each assigned acolyte's timer; completed cycles
  //    resolve at the acolyte's efficiency and immediately start the next cycle. Acolyte events
  //    fold into the same outcome stream as player events.
  working = autoRecruitAcolytes(working);
  const acoResult = advanceAcolytes(working, deltaSeconds, rng);
  working = acoResult.state;
  for (const ev of acoResult.events) events.push(ev);

  return {
    state: {
      ...working,
      lastTickAt: state.lastTickAt + Math.round(deltaSeconds * 1000),
      rngState: rng.state,
    },
    events,
  };
}
