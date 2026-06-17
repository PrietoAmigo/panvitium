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
import { add, bn, lt, max, min, mul, sub, ZERO, type BigNum } from './bignum.js';
import { ensureAutoRepeatStarted, resolveAction } from './actions.js';
import { advanceAcolytes, autoRecruitAcolytes } from './acolytes.js';
import { advanceInvocationRunners, invocationUpkeep } from './invocations.js';
import { applyInvocationTickEffects } from './apex.js';
import { mercatusGoldPerSecond, mercatusRevenueWithFoedus } from './foedera.js';
import {
  advanceToggles,
  compositumGoldPerSecond,
  compositumInfluencePerSecond,
  compositumPercentGoldPerSecond,
  compositumPercentInfluencePerSecond,
  type GainRates,
  panvitiumRate,
} from './compositum.js';
import { BASE_GOLD_PER_SECOND, BASE_INFLUENCE_RATE } from './constants.js';
import { applyReprobateDynamics } from './dynamics.js';
import { type OutcomeEvent } from './events.js';
import { computeModifiers, type Modifiers } from './modifiers.js';
import { removeReprobates, mintSouls } from './population.js';
import { makeRng } from './rng.js';
import { type ActionTimer, type GameState } from './state.js';
import { evaluateAchievements } from './achievements.js';
import { deliverEmails } from './emails.js';

/** Injected dependencies for a tick (tuning tables / per-call flags not part of the state). */
export interface TickDeps {
  /**
   * Offline-only income multipliers, applied to this tick's gold / influence income (Sallos #19 /
   * Forneus #30). Default 1 (online ticks pass nothing, so behaviour is unchanged); `resumeGame`
   * passes the sigil-derived values for the single offline catch-up tick.
   */
  readonly offlineGoldMul?: number;
  readonly offlineInfluenceMul?: number;
  /**
   * The base offline efficiency the CALLER already applied to `deltaSeconds` (resumeGame passes
   * PLAYER_OFFLINE_EFFICIENCY = 0.5; online ticks pass nothing → 1). Used only to restore the
   * Mercatus Acediae trade's revenue to full rate — its signature clause exempts that take from
   * the ×0.5 factor, so its term is divided back by this value.
   */
  readonly offlineEfficiency?: number;
  /**
   * Offline-only multiplier on the reprobate-generation pool accrual (Zepar #16). Default 1;
   * `resumeGame` passes the sigil-derived value for the catch-up tick.
   */
  readonly offlineGenerationMul?: number;
  /**
   * Offline-only multiplier on ACTION-TIMER advancement (Marax #21 — "+offline action
   * efficiency"): the in-flight Opera timers advance by `deltaSeconds × this` during the catch-up
   * tick. Default 1.
   */
  readonly offlineActionTimeMul?: number;
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

/** Drop the optional Defixio curse from a state's lifetime (EOPT-safe: omits, never sets undefined). */
function clearDefixio(state: GameState): GameState {
  if (!state.lifetime.defixio) return state;
  const { defixio: _drop, ...rest } = state.lifetime;
  return { ...state, lifetime: rest };
}

/** Instantaneous passive income, read-only (for the HUD's per-second readouts). */
export interface PerSecondRates {
  /** Gold per second — uncapped, monotonic income. */
  gold: number;
  /** Influence per second — gross generation toward the cap (adds nothing once influence is maxed). */
  influence: BigNum;
}

/**
 * The current passive income rates, mirroring this file's income block without advancing the state.
 * Zero while frozen (mid-descent or under Morpheus), since nothing accrues then. Influence is the
 * gross generation rate — it represents economy throughput, not the net change once the cap is hit.
 */
/**
 * The base gain rates the percentage-VC semantics (Vegas/Crusade) measure against: the full income
 * lines WITHOUT any percentage-VC contributions, so the two ceremonies can never feed each other
 * (sheet rev 2026-06-12 / ADR-027). Gold mirrors the tick's gold line; influence is the
 * proportional base + flat VC/sigil influence, all × influenceRateMul.
 */
function baseGainRates(state: GameState, mods: Modifiers): GainRates {
  const goldGainPerSecond =
    (BASE_GOLD_PER_SECOND +
      mercatusGoldPerSecond(state) * mods.vitiumMercaturaOutputMul +
      compositumGoldPerSecond(state) * mods.vitiumCompositumOutputMul +
      mods.flatGoldPerSecond) *
    mods.goldRateMul;
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const influenceGainPerSecond =
    effectiveMax.toNumber() * BASE_INFLUENCE_RATE * mods.influenceRateMul +
    (compositumInfluencePerSecond(state) * mods.vitiumCompositumInfluenceOutputMul +
      mods.flatInfluencePerSecond) *
      mods.influenceRateMul;
  return { goldGainPerSecond, influenceGainPerSecond };
}

export function perSecondRates(state: GameState): PerSecondRates {
  if (state.inKatabasis === true || (state.lifetime.invocations.morpheus ?? 0) > 0) {
    return { gold: 0, influence: ZERO };
  }
  const mods = computeModifiers(state);
  const rates = baseGainRates(state, mods);
  const grossGold =
    rates.goldGainPerSecond +
    compositumPercentGoldPerSecond(state, rates) *
      mods.vitiumCompositumOutputMul *
      mods.goldRateMul;
  const grossInfluence = add(
    bn(rates.influenceGainPerSecond),
    bn(
      compositumPercentInfluencePerSecond(state, rates) *
        mods.vitiumCompositumInfluenceOutputMul *
        mods.influenceRateMul,
    ),
  );
  // Net of invocation upkeep (Invocatio sheet): %-of-gain costs cut the gain, flat costs subtract
  // an absolute amount — mirroring the tick's step 1a, so the readout matches realised net income.
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const up = invocationUpkeep(state, effectiveMax.toNumber());
  const gold = Math.max(0, grossGold * (1 - up.goldGainFraction) - up.flatGoldPerSecond);
  const influence = max(
    ZERO,
    sub(mul(grossInfluence, 1 - up.influenceGainFraction), bn(up.flatInfluencePerSecond)),
  );
  return { gold, influence };
}

/** Advance `state` by `deltaSeconds`. Returns a new state; never mutates the input. */
export function tick(state: GameState, deltaSeconds: number, deps: TickDeps = {}): TickResult {
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
  // no income, no Opera progress, no dynamics, no apex per-tick effects, no Vitium toggle
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
    // Percentage-VC upkeep (Vegas/Crusade) measures the pre-toggle income rates (ADR-027).
    const preMods = computeModifiers(state);
    const toggled = advanceToggles(state, deltaSeconds, baseGainRates(state, preMods));
    state = toggled.state;
    for (const id of toggled.deactivated) {
      notices.push(`${id} ended \u2014 upkeep unpaid.`);
    }
  }

  const mods = computeModifiers(state);

  // 1. Passive generation (02 §1) with modifier bundle applied.
  //    Gold/s = (base + Σ Mercatus revenue [Foedus-scaled] + Σ active-VC goldPerSecond) × goldRateMul.
  //    Influence gain = (proportional base + Σ active-VC influencePerSecond) × influenceRateMul,
  //    capped at effectiveMax = base × maxInfluenceMul. Mercatus / VC income obeys the same
  //    multipliers as base so Avaritia / Silver / Acclaim scale them too.
  //    Resources are natural numbers (02 §1) but accumulate fractionally per 100 ms tick — floored
  //    only at display/spend/comparison boundary.
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  // Offline-only income multipliers (Sallos #19 gold, Forneus #30 influence). 1× online.
  const offlineGoldMul = deps.offlineGoldMul ?? 1;
  const offlineInfluenceMul = deps.offlineInfluenceMul ?? 1;
  // Mercatus Acediae signature clause (§1.5 amended): its revenue is exempt from the ×0.5 offline
  // efficiency factor. `deltaSeconds` was already scaled by that factor in `resumeGame`, so the
  // Acediae trade's term is divided back by it here — accruing at full wall-clock rate while every
  // other source runs at the slowed clock. 1× online (no-op).
  const offlineEfficiency = deps.offlineEfficiency ?? 1;
  const acediaOfflineRestore =
    offlineEfficiency < 1
      ? mercatusRevenueWithFoedus(state, 'acedia') * (1 / offlineEfficiency - 1)
      : 0;
  // The percentage-VC outputs (Vegas → influence, Crusade → gold) measure the base gain rates
  // (no percentage terms inside, by construction) and ride the VC output multiplier like any
  // ceremony income (ADR-027).
  const gainRates = baseGainRates(state, mods);
  const goldPerSecond =
    ((BASE_GOLD_PER_SECOND +
      (mercatusGoldPerSecond(state) + acediaOfflineRestore) * mods.vitiumMercaturaOutputMul +
      compositumGoldPerSecond(state) * mods.vitiumCompositumOutputMul +
      mods.flatGoldPerSecond) *
      mods.goldRateMul +
      compositumPercentGoldPerSecond(state, gainRates) *
        mods.vitiumCompositumOutputMul *
        mods.goldRateMul) *
    offlineGoldMul;
  const proportionalInfluence = mul(
    effectiveMax,
    BASE_INFLUENCE_RATE * mods.influenceRateMul * offlineInfluenceMul * deltaSeconds,
  );
  // VC influence output (flat ceremony influence + Vegas' percentage conversion) takes the
  // dedicated Orias #59 multiplier; the gold side keeps `vitiumCompositumOutputMul` (Zagan #61).
  const vcInfluence = mul(
    (compositumInfluencePerSecond(state) + compositumPercentInfluencePerSecond(state, gainRates)) *
      mods.vitiumCompositumInfluenceOutputMul *
      mods.influenceRateMul *
      offlineInfluenceMul,
    deltaSeconds,
  );
  // Flat influence/s from invocations (Lemure). Additive, scaled by the influence-rate multiplier
  // like the Vitium Compositum term, and folded under the same maxInfluence cap below.
  const flatInfluence = mul(
    mods.flatInfluencePerSecond * mods.influenceRateMul * offlineInfluenceMul,
    deltaSeconds,
  );
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

  // 1a. Invocation upkeep (Invocatio sheet): each active invocation pays its per-second cost out of
  //     this tick's income. %-of-gain costs consume a fraction of what was just gained; flat costs
  //     subtract an absolute amount. A flat drain the pool can't cover dispels its invocation(s)
  //     (generalising Aurevora's "dispel at gold 0"); the %-of-gain part alone can only zero a gain,
  //     never bankrupt, so it never triggers a dispel.
  {
    const up = invocationUpkeep(state, effectiveMax.toNumber());
    const goldGain = sub(working.lifetime.gold, state.lifetime.gold);
    const inflGain = sub(working.lifetime.influence, state.lifetime.influence);
    const goldFracCost = mul(goldGain, up.goldGainFraction);
    const inflFracCost = mul(inflGain, up.influenceGainFraction);
    const goldFlat = mul(bn(up.flatGoldPerSecond), deltaSeconds);
    const inflFlat = mul(bn(up.flatInfluencePerSecond), deltaSeconds);
    let gold = sub(sub(working.lifetime.gold, goldFracCost), goldFlat);
    let influence = sub(sub(working.lifetime.influence, inflFracCost), inflFlat);
    const dispelled: string[] = [];
    if (lt(gold, ZERO)) {
      gold = max(ZERO, sub(working.lifetime.gold, goldFracCost)); // pay the fraction, not the flat
      dispelled.push(...up.flatGoldDrainers);
    }
    if (lt(influence, ZERO)) {
      influence = max(ZERO, sub(working.lifetime.influence, inflFracCost));
      dispelled.push(...up.flatInfluenceDrainers);
    }
    let invocations = working.lifetime.invocations;
    if (dispelled.length > 0) {
      invocations = { ...invocations };
      for (const id of dispelled) {
        delete invocations[id];
        notices.push(`${id} dispelled — upkeep unpaid.`);
      }
    }
    working = { ...working, lifetime: { ...working.lifetime, gold, influence, invocations } };
  }

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
    // Marax #21: during the offline catch-up tick, the in-flight timers advance faster.
    const actionDelta = deltaSeconds * (deps.offlineActionTimeMul ?? 1);
    const remaining: ActionTimer[] = [];
    const completed: ActionTimer[] = [];
    for (const timer of working.lifetime.actionQueue) {
      const left = timer.remainingSeconds - actionDelta;
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

  // 2b. Auto-repeat (02 §3): re-queue any player rite the player has toggled to loop and that isn't
  //     currently in flight — both a just-completed cycle and one that stalled on a prior tick. Free
  //     and harmless when nothing is set to auto-repeat.
  if (working.lifetime.autoRepeat.length > 0) {
    working = ensureAutoRepeatStarted(working);
  }

  // 4. Reprobate dynamics: fractional pools accrue per tick and drain into integer
  //    births / suicides / murders (02 §9). Each death mints 1 soul. The pools live on the
  //    lifetime state and persist across save/load (ADR-023 additive optional).
  working = applyReprobateDynamics(working, deltaSeconds, {
    generationMul: deps.offlineGenerationMul ?? 1,
  });

  // 4b. Panvitium soul harvest (03 §2.3): while the ritual burns, it mints souls each second in
  //     proportion to the current soul total — R(t) × souls — compounding the hoard for as long as
  //     the exponential upkeep can be sustained. Accrued fractionally on `souls` (BigNum), floored
  //     only at display/spend per ADR-005. R(t) reads the post-upkeep duration set at step 0.
  {
    const panvRate = panvitiumRate(working);
    if (panvRate > 0) {
      working = {
        ...working,
        souls: add(working.souls, mul(working.souls, panvRate * deltaSeconds)),
      };
    }
  }

  // 4c. Hand of Glory buff decays in real time (it lifted this tick's generation via the modifier,
  //     evaluated at the start of the interval like the apex durations); expires at 0.
  if (working.lifetime.handOfGloryRemaining > 0) {
    working = {
      ...working,
      lifetime: {
        ...working.lifetime,
        handOfGloryRemaining: Math.max(0, working.lifetime.handOfGloryRemaining - deltaSeconds),
      },
    };
  }

  // 4d. Defixio curse (Maleficia): a single-use hex on the reprobate pool. It culls the pool at
  //     eᵗ per second (t = seconds the curse has run, read at the start of the interval), minting a
  //     soul per death, until the pool is empty — then the curse lifts. No RNG draw (single pool).
  if (working.lifetime.defixio) {
    const curse = working.lifetime.defixio;
    const culled = removeReprobates(working, Math.exp(curse.elapsed) * deltaSeconds);
    working = mintSouls(culled.state, culled.removed);
    working =
      working.lifetime.reprobates <= 0
        ? clearDefixio(working) // pool exterminated — the curse lifts
        : {
            ...working,
            lifetime: {
              ...working.lifetime,
              defixio: { elapsed: curse.elapsed + deltaSeconds },
            },
          };
  }

  // 5. Acolytes (02 §10). Auto-recruit up to maxAcolytes(state) (free, immediate; unlocks on a
  //    ×1.5 effective-maxInfluence threshold series — 0 at base, first at 110). Then advance each
  //    assigned acolyte's timer; completed cycles
  //    resolve at the acolyte's efficiency and immediately start the next cycle. Acolyte events
  //    fold into the same outcome stream as player events.
  working = autoRecruitAcolytes(working);
  const acoResult = advanceAcolytes(working, deltaSeconds, rng);
  working = acoResult.state;
  for (const ev of acoResult.events) events.push({ ...ev, source: 'acolyte' });

  // 5b. Autonomous invocation runners (02 §3). The Familiar runs Indagatio in its own channel at a
  //     fraction of the player's efficiency — separate from the player slot and the acolytes.
  const runResult = advanceInvocationRunners(working, deltaSeconds, rng);
  working = runResult.state;
  for (const ev of runResult.events) events.push({ ...ev, source: 'invocation' });

  // 6. Achievements (03 §7). Evaluate the catalog against the fully-advanced state; fold any newly-
  //    earned ids into state.achievements and surface them for a toast. Last step, so every change
  //    this tick (and offline progression run as one big tick) is reflected.
  const finalState: GameState = {
    ...working,
    lastTickAt: state.lastTickAt + Math.round(deltaSeconds * 1000),
    rngState: rng.state,
  };
  const ach = evaluateAchievements(finalState);

  // 7. Impact-feedback mail (5.2). Deliver any newly-triggered emails against the fully-advanced
  //    state — last, like achievements, so one big offline tick also catches up the inbox.
  const mailed = deliverEmails(ach.state, finalState.lastTickAt);

  return {
    state: mailed,
    events,
    notices,
    achievementsUnlocked: ach.unlocked,
  };
}
