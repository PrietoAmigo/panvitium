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
import { advanceInvocationRunners } from './invocations.js';
import { applyInvocationTickEffects } from './apex.js';
import { advanceBuilds, businessGoldPerSecond } from './builds.js';
import {
  advanceToggles,
  compositumGoldPerSecond,
  compositumInfluencePerSecond,
} from './compositum.js';
import { BASE_GOLD_PER_SECOND, BASE_INFLUENCE_RATE } from './constants.js';
import { applyReprobateDynamics } from './dynamics.js';
import { type OutcomeEvent } from './events.js';
import { computeModifiers } from './modifiers.js';
import { makeRng } from './rng.js';
import { type ActionTimer, type GameState } from './state.js';
import { evaluateAchievements } from './achievements.js';

/** Injected dependencies for a tick (tuning tables that aren't part of the state). Empty for now. */
export interface TickDeps {
  readonly _reserved?: never;
}

/** The result of advancing the game: the new state, outcome events, and transient notices. */
export interface TickResult {
  readonly state: GameState;
  readonly events: OutcomeEvent[];
  /**
   * Transient one-line system messages produced this tick (not part of the outcome log yet).
   * Used for Vitium Compositum auto-deactivation ("X ended — upkeep unpaid"). The store surfaces
   * the most recent. A future slice promotes these to proper log entries alongside Panvitium's
   * "ended" message via a discriminated log union.
   */
  readonly notices: string[];
  /**
   * Ids of achievements newly unlocked on this tick (03 §7), in catalog order. Folded into
   * `state.achievements` already; returned so the UI can raise a toast. Empty on most ticks.
   */
  readonly achievementsUnlocked: string[];
}

/** Advance `state` by `deltaSeconds`. Returns a new state; never mutates the input. */
export function tick(state: GameState, deltaSeconds: number, _deps: TickDeps = {}): TickResult {
  if (deltaSeconds <= 0) return { state, events: [], notices: [], achievementsUnlocked: [] };

  // Frozen during the descent (02 §6): while the Katabasis menu is open the lifetime is in trance.
  // Absorb the elapsed time (advance the clock) but run NO simulation — no income, no reprobate
  // dynamics, no soul minting — for online ticks and offline catch-up alike. Cleared at commit, so a
  // reload mid-descent resumes the allocation menu instead of fast-forwarding a torn-down lifetime.
  if (state.inKatabasis === true) {
    return {
      state: { ...state, lastTickAt: state.lastTickAt + Math.round(deltaSeconds * 1000) },
      events: [],
      notices: [],
      achievementsUnlocked: [],
    };
  }

  // Morpheus freeze (03 §2.4): while the apex Acedia is active, the lifetime is held in stillness —
  // no income, no Opera/build progress, no dynamics, no apex per-tick effects, no Vitium toggle
  // upkeep. Only the clock and the achievement evaluator advance (the latter so an unlock that
  // depends on PRE-Morpheus state can still surface; nothing new can be earned mid-freeze because
  // the underlying state isn't changing). The player can still summon other invocations from the
  // UI — Erinyes will dispel Morpheus, restoring the normal tick.
  if ((state.lifetime.invocations.morpheus ?? 0) > 0) {
    const finalState: GameState = {
      ...state,
      lastTickAt: state.lastTickAt + Math.round(deltaSeconds * 1000),
    };
    const ach = evaluateAchievements(finalState);
    return { state: ach.state, events: [], notices: [], achievementsUnlocked: ach.unlocked };
  }

  const rng = makeRng(state.rngState);

  // 0. Vitium Compositum upkeep (02 §3). Deduct each active toggle's per-second cost BEFORE any
  //    income is applied, so a toggle never earns on a tick it couldn't afford. Toggles that
  //    cannot pay auto-deactivate; collect a notice per deactivation. We reassign `state` here so
  //    the rest of the tick (modifiers, income, dynamics) sees the post-upkeep toggle set.
  const notices: string[] = [];
  {
    const toggled = advanceToggles(state, deltaSeconds);
    state = toggled.state;
    for (const id of toggled.deactivated) {
      notices.push(`${id} ended \u2014 upkeep unpaid.`);
    }
  }

  const mods = computeModifiers(state);

  // 1. Passive generation (02 §1) with modifier bundle applied.
  //    Gold/s = (base + Σ business goldPerSecond + Σ active-VC goldPerSecond) × goldRateMul.
  //    Influence gain = (proportional base + Σ active-VC influencePerSecond) × influenceRateMul,
  //    capped at effectiveMax = base × maxInfluenceMul. Business / VC income obeys the same
  //    multipliers as base so Avaritia / Silver / Acclaim scale them too.
  //    Resources are natural numbers (02 §1) but accumulate fractionally per 100 ms tick — floored
  //    only at display/spend/comparison boundary.
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const goldPerSecond =
    (BASE_GOLD_PER_SECOND +
      businessGoldPerSecond(state) * mods.vitiumMercaturaOutputMul +
      compositumGoldPerSecond(state)) *
    mods.goldRateMul;
  const proportionalInfluence = mul(
    effectiveMax,
    BASE_INFLUENCE_RATE * mods.influenceRateMul * deltaSeconds,
  );
  const vcInfluence = mul(
    compositumInfluencePerSecond(state) * mods.influenceRateMul,
    deltaSeconds,
  );
  // Flat influence/s from invocations (Lemure). Additive, scaled by the influence-rate multiplier
  // like the Vitium Compositum term, and folded under the same maxInfluence cap below.
  const flatInfluence = mul(mods.flatInfluencePerSecond * mods.influenceRateMul, deltaSeconds);
  const lifetime = {
    ...state.lifetime,
    gold: add(state.lifetime.gold, mul(goldPerSecond, deltaSeconds)),
    influence: min(
      add(add(add(state.lifetime.influence, proportionalInfluence), vcInfluence), flatInfluence),
      effectiveMax,
    ),
  };
  let working: GameState = { ...state, lifetime };
  const events: OutcomeEvent[] = [];

  // 1b. Apex invocation per-tick effects (03 §2.4): Aurevora's exponentially-rising gold drain paid
  //     against its rising efficiency boost (dispels at gold 0), and Astiwihad's per-second chance
  //     to wipe the whole reprobate population. Runs net of this tick's income; the efficiency half
  //     of Aurevora is read from the advanced duration by computeModifiers below.
  {
    const apex = applyInvocationTickEffects(working, deltaSeconds, rng);
    working = apex.state;
    for (const n of apex.notices) notices.push(n);
  }

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

  // 5b. Autonomous invocation runners (02 §3). The Familiar runs Indagatio in its own channel at a
  //     fraction of the player's efficiency — separate from the player slot and the acolytes.
  const runResult = advanceInvocationRunners(working, deltaSeconds, rng);
  working = runResult.state;
  for (const ev of runResult.events) events.push(ev);

  // 6. Achievements (03 §7). Evaluate the catalog against the fully-advanced state; fold any newly-
  //    earned ids into state.achievements and surface them for a toast. Last step, so every change
  //    this tick (and offline progression run as one big tick) is reflected.
  const finalState: GameState = {
    ...working,
    lastTickAt: state.lastTickAt + Math.round(deltaSeconds * 1000),
    rngState: rng.state,
  };
  const ach = evaluateAchievements(finalState);

  return {
    state: ach.state,
    events,
    notices,
    achievementsUnlocked: ach.unlocked,
  };
}
