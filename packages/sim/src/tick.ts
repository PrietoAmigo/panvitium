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
import { applyInvocationTickEffects, aurevoraDrainPerSecond } from './apex.js';
import { anatocismusDepositPerSecond, faeneratioGoldPerSecond } from './faeneratio.js';
import { advanceToggles, panvitiumRate } from './compositum.js';
import { BASE_GOLD_PER_SECOND, BASE_INFLUENCE_RATE } from './constants.js';
import { applyReprobateDynamics } from './dynamics.js';
import { type OutcomeEvent } from './events.js';
import { computeModifiers } from './modifiers.js';
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
  /**
   * Set by `resumeGame` for the single offline catch-up tick. Panvitium and Aurevora ramp their
   * cost / drain exponentially with active duration and are *point-sampled* per tick — correct at
   * the live 10 Hz loop (δ ≈ 0.1 s) but not over one large offline δ, where the start-sampled cost
   * undercharges (so the ritual survives a burn that would have self-extinguished online) while the
   * harvest / efficiency is read at the end-of-span rate. That mismatch let "toggle Panvitium, then
   * reload" mint orders of magnitude more souls than playing it live (ADR-004: online and offline
   * must agree). Rather than integrate a compounding harvest exactly (impossible to match the 10 Hz
   * discrete product), the catch-up tick refuses to run these ramped systems at all: both are torn
   * down here before any simulation, so a burn left running when the tab closed simply lapses. They
   * still run normally online, where the live loop advances in fixed 100 ms steps (useGameLoop) even
   * after the tab is backgrounded, so no large online δ ever reaches them.
   */
  readonly offline?: boolean;
}

/** Tear down the duration-ramped systems (Panvitium, Aurevora) that must not run on an offline
 *  catch-up tick — see `TickDeps.offline`. Pure; a no-op when neither is active. */
function stripRampedForOffline(state: GameState): GameState {
  let lifetime = state.lifetime;
  if (lifetime.activeToggles.includes('panvitium')) {
    const { panvitium: _drop, ...toggleDurations } = lifetime.toggleDurations;
    lifetime = {
      ...lifetime,
      activeToggles: lifetime.activeToggles.filter((t) => t !== 'panvitium'),
      toggleDurations,
    };
  }
  if ((lifetime.invocations.aurevora ?? 0) > 0) {
    const { aurevora: _dropInv, ...invocations } = lifetime.invocations;
    const { aurevora: _dropDur, ...invocationDurations } = lifetime.invocationDurations;
    lifetime = { ...lifetime, invocations, invocationDurations };
  }
  return lifetime === state.lifetime ? state : { ...state, lifetime };
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
  /**
   * Ids of impact-feedback emails delivered on this tick (05), in catalog order. Already appended to
   * the inbox; surfaced so the UI can cue per-email SFX (the Fausto #5 door-knock). Empty on most ticks.
   */
  readonly emailsDelivered: string[];
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
 * (The percentage-VC base-rate machinery retired with the lesser ceremonies — ADR-031.)
 */
export function perSecondRates(state: GameState): PerSecondRates {
  if (state.inKatabasis === true || (state.lifetime.invocations.morpheus ?? 0) > 0) {
    return { gold: 0, influence: ZERO };
  }
  const mods = computeModifiers(state);
  // Anatocismus (usura-4): the auto-deposited half of the interest never reaches liquid gold, so
  // the HUD's gold/s shows the liquid half only (spec §6); the Thesaurus tab shows the deposit rate.
  const grossGold =
    (BASE_GOLD_PER_SECOND + faeneratioGoldPerSecond(state, mods) + mods.flatGoldPerSecond) *
      mods.goldRateMul -
    anatocismusDepositPerSecond(state, mods);
  const effMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const grossInfluence = bn(
    effMax.toNumber() * BASE_INFLUENCE_RATE * mods.influenceRateMul +
      mods.flatInfluencePerSecond * mods.influenceRateMul,
  );
  // Net of invocation upkeep (Invocatio sheet): %-of-gain costs cut the gain, flat costs subtract
  // an absolute amount — mirroring the tick's step 1a, so the readout matches realised net income.
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const up = invocationUpkeep(state, effectiveMax.toNumber());
  // Aurevora (apex Gula) drains gold at an exponentially-rising rate while active (apex.ts); the
  // HUD's gold/s must net it out or it reads positive while the vault visibly empties. Evaluated at
  // the current active-duration, matching the tick's per-second drain.
  const aurevoraDrain =
    (state.lifetime.invocations.aurevora ?? 0) > 0
      ? aurevoraDrainPerSecond(state.lifetime.invocationDurations.aurevora ?? 0)
      : 0;
  const finiteAurevoraDrain = Number.isFinite(aurevoraDrain) ? aurevoraDrain : 0;
  const gold = grossGold * (1 - up.goldGainFraction) - up.flatGoldPerSecond - finiteAurevoraDrain;
  const influence = max(
    ZERO,
    sub(mul(grossInfluence, 1 - up.influenceGainFraction), bn(up.flatInfluencePerSecond)),
  );
  return { gold, influence };
}

/** One resource's per-second flow: gross generation, the upkeep drawn against it, and the net. */
export interface ResourceFlow {
  /** Gross passive income per second, before upkeep. */
  readonly generation: number;
  /** Per-second cost drawn against this resource (invocation %-of-gain + flat upkeep, Aurevora drain). */
  readonly upkeep: number;
  /** generation − upkeep (can be negative when upkeep outruns income). */
  readonly net: number;
}

/** Per-second generation/upkeep/net for the two upkeep-bearing resources (gold, influence). */
export interface ResourceFlows {
  readonly gold: ResourceFlow;
  readonly influence: ResourceFlow;
}

/** Offline-only income multipliers for the flow breakdown (Sallos gold, Eligos influence); 1× online. */
export interface FlowDeps {
  readonly offlineGoldMul?: number;
  readonly offlineInfluenceMul?: number;
}

/**
 * The per-second gold and influence flows, split into gross generation, upkeep, and net — the same
 * income/upkeep math as `perSecondRates` and the tick's steps 1/1a, decomposed so the Analytics
 * panel can show each column instead of only the net. `net` here is uncapped (generation − upkeep),
 * so it can read negative and, unlike `perSecondRates.influence`, is not floored at 0. Pass the
 * offline income multipliers in `deps` for the offline projection (they scale generation and, through
 * it, the %-of-gain upkeep — exactly as the tick applies them). Zero while frozen (mid-descent or
 * under Morpheus).
 */
export function resourceFlows(state: GameState, deps: FlowDeps = {}): ResourceFlows {
  const zero: ResourceFlow = { generation: 0, upkeep: 0, net: 0 };
  if (state.inKatabasis === true || (state.lifetime.invocations.morpheus ?? 0) > 0) {
    return { gold: zero, influence: zero };
  }
  const mods = computeModifiers(state);
  const offlineGoldMul = deps.offlineGoldMul ?? 1;
  const offlineInfluenceMul = deps.offlineInfluenceMul ?? 1;
  const grossGold =
    ((BASE_GOLD_PER_SECOND + faeneratioGoldPerSecond(state, mods) + mods.flatGoldPerSecond) *
      mods.goldRateMul -
      anatocismusDepositPerSecond(state, mods)) *
    offlineGoldMul;
  const effMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const grossInfluence =
    (effMax.toNumber() * BASE_INFLUENCE_RATE * mods.influenceRateMul +
      mods.flatInfluencePerSecond * mods.influenceRateMul) *
    offlineInfluenceMul;
  const up = invocationUpkeep(state, effMax.toNumber());
  const aurevoraDrain =
    (state.lifetime.invocations.aurevora ?? 0) > 0
      ? aurevoraDrainPerSecond(state.lifetime.invocationDurations.aurevora ?? 0)
      : 0;
  const finiteAurevoraDrain = Number.isFinite(aurevoraDrain) ? aurevoraDrain : 0;
  const goldUpkeep = grossGold * up.goldGainFraction + up.flatGoldPerSecond + finiteAurevoraDrain;
  const inflUpkeep = grossInfluence * up.influenceGainFraction + up.flatInfluencePerSecond;
  return {
    gold: { generation: grossGold, upkeep: goldUpkeep, net: grossGold - goldUpkeep },
    influence: {
      generation: grossInfluence,
      upkeep: inflUpkeep,
      net: grossInfluence - inflUpkeep,
    },
  };
}

/** Advance `state` by `deltaSeconds`. Returns a new state; never mutates the input. */
export function tick(state: GameState, deltaSeconds: number, deps: TickDeps = {}): TickResult {
  if (deltaSeconds <= 0)
    return { state, events: [], notices: [], achievementsUnlocked: [], emailsDelivered: [] };

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
      emailsDelivered: [],
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
    // Mail does not arrive while the world is held in Morpheus's stillness (parallel to income/dynamics).
    return {
      state: ach.state,
      events: [],
      notices: [],
      achievementsUnlocked: ach.unlocked,
      emailsDelivered: [],
    };
  }

  // Offline catch-up (ADR-004): the duration-ramped systems (Panvitium, Aurevora) cannot be
  // point-sampled over one large δ without the reload exploit, so they lapse before the catch-up
  // runs — see `TickDeps.offline`. Online ticks pass nothing, so behaviour there is unchanged.
  if (deps.offline === true) state = stripRampedForOffline(state);

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
  //    Gold/s = (base + (Mutuum + Thesaurus interest) × faenerationOutputMul + flat) × goldRateMul.
  //    Influence gain = (proportional base + flat sources) × influenceRateMul, capped at
  //    effectiveMax = base × maxInfluenceMul. Faeneratio income obeys the same multipliers as base
  //    so Avaritia / Silver / Acclaim scale it too. The interest term rides the offline efficiency
  //    factor like everything else (ADR-026 — no Acediae-style exemption survives the Mercatus
  //    removal). The ceremony income and percentage-VC terms retired with the lesser ceremonies
  //    (ADR-031 — Panvitium yields souls, not gold or influence).
  //    Resources are natural numbers (02 §1) but accumulate fractionally per 100 ms tick — floored
  //    only at display/spend/comparison boundary.
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  // Offline-only income multipliers (Sallos #19 gold, Forneus #30 influence). 1× online.
  const offlineGoldMul = deps.offlineGoldMul ?? 1;
  const offlineInfluenceMul = deps.offlineInfluenceMul ?? 1;
  // Anatocismus (usura-4): half of each interest payment auto-deposits into the hoard instead of
  // paying out — split AFTER all multipliers (spec §6), so the liquid line is simply the full
  // composition minus the deposit rate, and the hoard gains the deposit under the same offline factor.
  const anatocismusPerSecond = anatocismusDepositPerSecond(state, mods) * offlineGoldMul;
  const goldPerSecond =
    (BASE_GOLD_PER_SECOND + faeneratioGoldPerSecond(state, mods) + mods.flatGoldPerSecond) *
      mods.goldRateMul *
      offlineGoldMul -
    anatocismusPerSecond;
  const proportionalInfluence = mul(
    effectiveMax,
    BASE_INFLUENCE_RATE * mods.influenceRateMul * offlineInfluenceMul * deltaSeconds,
  );
  // Flat influence/s from invocations (Fama) and sigils (Decarabia #69). Additive, scaled by the
  // influence-rate multiplier and folded under the same maxInfluence cap below.
  const flatInfluence = mul(
    mods.flatInfluencePerSecond * mods.influenceRateMul * offlineInfluenceMul,
    deltaSeconds,
  );
  const lifetime = {
    ...state.lifetime,
    gold: add(state.lifetime.gold, mul(goldPerSecond, deltaSeconds)),
    // The Anatocismus auto-deposit accrues on the hoard (compound interest by contract). Accrues
    // fractionally on the BigNum like gold; floored only at display/spend (ADR-005).
    hoard:
      anatocismusPerSecond > 0
        ? add(state.lifetime.hoard, mul(anatocismusPerSecond, deltaSeconds))
        : state.lifetime.hoard,
    influence: min(
      add(add(state.lifetime.influence, proportionalInfluence), flatInfluence),
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
        remaining.push({
          actionId: timer.actionId,
          remainingSeconds: left,
          ...(timer.target === undefined ? {} : { target: timer.target }),
          ...(timer.paidGold === undefined ? {} : { paidGold: timer.paidGold }),
        });
      } else {
        completed.push(timer);
      }
    }
    working = { ...working, lifetime: { ...working.lifetime, actionQueue: remaining } };
    for (const timer of completed) {
      const resolved = resolveAction(working, timer.actionId, rng, {
        ...(timer.target === undefined ? {} : { target: timer.target }),
        ...(timer.paidGold === undefined ? {} : { paidGold: timer.paidGold }),
      });
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
      // Souls minted this tick = souls × R(t) × δ; accrue them on the pool AND on the monotonic
      // totalSoulsObtained tally (05 soul-threshold emails), so the harvest counts like any mint.
      const harvested = mul(working.souls, panvRate * deltaSeconds);
      working = {
        ...working,
        souls: add(working.souls, harvested),
        totalSoulsObtained: add(working.totalSoulsObtained, harvested),
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
  //     eᵗ per second (t = seconds the curse has run), integrated exactly over the tick span:
  //     cumulative kills by time t are ⌊∫₀ᵗ eˢ ds⌋ = ⌊eᵗ − 1⌋ and this tick culls the difference —
  //     so the 10 Hz loop and one big offline catch-up tick agree (ADR-004) and no sub-1 fraction
  //     is lost between ticks. Mints a soul per death until the pool is empty — then the curse
  //     lifts. No RNG draw (single pool).
  if (working.lifetime.defixio) {
    const curse = working.lifetime.defixio;
    const before = Math.floor(Math.expm1(curse.elapsed));
    const after = Math.expm1(curse.elapsed + deltaSeconds);
    // A long-lived ramp overflows to Infinity; treat it as "cull everything" (removeReprobates
    // clamps to the living population, and an empty pool lifts the curse below).
    const due = Number.isFinite(after) ? Math.floor(after) - before : Number.POSITIVE_INFINITY;
    const culled = removeReprobates(working, due);
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

  // 7. Impact-feedback mail (5.2 / content 05). Arm and deliver any newly-triggered emails against
  //    the fully-advanced state — last, like achievements, so one big offline tick also catches up
  //    the inbox (and its arm timers). `delivered` surfaces this tick's new mail for SFX cues.
  const mailed = deliverEmails(ach.state, finalState.lastTickAt);

  return {
    state: mailed.state,
    events,
    notices,
    achievementsUnlocked: ach.unlocked,
    emailsDelivered: mailed.delivered,
  };
}
