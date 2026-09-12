/**
 * The tick function (ADR-004).
 *
 * One pure function advances the whole game by a span of seconds — the same math whatever the span,
 * so a run of small ticks and a single large one agree (fractional pools, exact integrals). The live
 * 10 Hz loop calls it at a fixed 100 ms step. The game does NOT advance while offline: a closed tab
 * freezes (see `resumeGame`), so no catch-up tick runs on load (ADR-032, superseding ADR-004's
 * offline catch-up).
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
import { advanceCallBuffs } from './callBuffs.js';
import { DESIDIA_BASE_COST_PER_SECOND, DESIDIA_BASE_SPEED, stagnationMax } from './stagnation.js';
import { BASE_GOLD_PER_SECOND, BASE_INFLUENCE_RATE } from './constants.js';
import { applyReprobateDynamics } from './dynamics.js';
import { type OutcomeEvent } from './events.js';
import { computeModifiers } from './modifiers.js';
import { removeReprobates, mintSouls } from './population.js';
import { makeRng } from './rng.js';
import { type ActionTimer, type GameState, totalReprobates } from './state.js';
import { evaluateAchievements } from './achievements.js';
import { deliverEmails } from './emails.js';

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
 * Zero while frozen (mid-descent or under Astiwihad), since nothing accrues then. Influence is the
 * gross generation rate — it represents economy throughput, not the net change once the cap is hit.
 * (The percentage-VC base-rate machinery retired with the lesser ceremonies — ADR-031.)
 */
export function perSecondRates(state: GameState): PerSecondRates {
  if (state.inKatabasis === true || (state.lifetime.invocations.astiwihad ?? 0) > 0) {
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

/**
 * The per-second gold and influence flows, split into gross generation, upkeep, and net — the same
 * income/upkeep math as `perSecondRates` and the tick's steps 1/1a, decomposed so the Analytics
 * panel can show each column instead of only the net. `net` here is uncapped (generation − upkeep),
 * so it can read negative and, unlike `perSecondRates.influence`, is not floored at 0. Zero while
 * frozen (mid-descent or under Astiwihad).
 */
export function resourceFlows(state: GameState): ResourceFlows {
  const zero: ResourceFlow = { generation: 0, upkeep: 0, net: 0 };
  if (state.inKatabasis === true || (state.lifetime.invocations.astiwihad ?? 0) > 0) {
    return { gold: zero, influence: zero };
  }
  const mods = computeModifiers(state);
  const grossGold =
    (BASE_GOLD_PER_SECOND + faeneratioGoldPerSecond(state, mods) + mods.flatGoldPerSecond) *
      mods.goldRateMul -
    anatocismusDepositPerSecond(state, mods);
  const effMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const grossInfluence =
    effMax.toNumber() * BASE_INFLUENCE_RATE * mods.influenceRateMul +
    mods.flatInfluencePerSecond * mods.influenceRateMul;
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
export function tick(state: GameState, deltaSeconds: number): TickResult {
  if (deltaSeconds <= 0)
    return { state, events: [], notices: [], achievementsUnlocked: [], emailsDelivered: [] };

  // Frozen during the descent (02 §6): while the Katabasis menu is open the lifetime is in trance.
  // Absorb the elapsed time (advance the clock) but run NO simulation — no income, no reprobate
  // dynamics, no soul minting. Cleared at commit, so a reload mid-descent resumes the allocation
  // menu instead of fast-forwarding a torn-down lifetime.
  if (state.inKatabasis === true) {
    return {
      state: { ...state, lastTickAt: state.lastTickAt + Math.round(deltaSeconds * 1000) },
      events: [],
      notices: [],
      achievementsUnlocked: [],
      emailsDelivered: [],
    };
  }

  // Astiwihad freeze (03 §2.4): while the apex Tristitia is active, the lifetime is held in stillness
  // — no income, no Opera progress, no dynamics, no apex per-tick effects, no Vitium toggle upkeep.
  // Only the clock and the achievement evaluator advance (the latter so an unlock that depends on
  // PRE-freeze state can still surface; nothing new can be earned mid-freeze because the underlying
  // state isn't changing). Only one apex kind may be invoked per lifetime, so no other apex coexists
  // with it; the freeze ends when Astiwihad is dispelled or at Katabasis.
  if ((state.lifetime.invocations.astiwihad ?? 0) > 0) {
    const finalState: GameState = {
      ...state,
      lastTickAt: state.lastTickAt + Math.round(deltaSeconds * 1000),
    };
    const ach = evaluateAchievements(finalState);
    // Mail does not arrive while the world is held in Astiwihad's stillness (parallel to income/dynamics).
    return {
      state: ach.state,
      events: [],
      notices: [],
      achievementsUnlocked: ach.unlocked,
      emailsDelivered: [],
    };
  }

  const rng = makeRng(state.rngState);

  // Desidia (ADR-033): the stagnation time-acceleration toggle. While active it drains stagnation
  // each REAL second and advances the whole sim by an accelerated `simDelta`; `lastTickAt` still
  // advances by the real delta (step 6) so the offline anchor stays wall-clock-honest. Charged like
  // a toggle: the tick it can no longer pay, it drains the remainder and switches off, running that
  // tick at normal speed (no partial, no refund — cf. Vitium Compositum). Desidia never runs offline
  // (resumeGame does not tick) or while frozen (handled by the early returns above), so `deltaSeconds`
  // here is always a live 100 ms step.
  let simDelta = deltaSeconds;
  if (state.desidiaActive === true) {
    const dmods = computeModifiers(state);
    const drainThisTick = DESIDIA_BASE_COST_PER_SECOND * dmods.desidiaDrainMul * deltaSeconds;
    if (drainThisTick > 0 && state.stagnation >= drainThisTick) {
      simDelta = deltaSeconds * DESIDIA_BASE_SPEED * dmods.desidiaSpeedMul;
      state = { ...state, stagnation: state.stagnation - drainThisTick };
    } else {
      state = { ...state, stagnation: 0, desidiaActive: false };
    }
  }

  // 0. Vitium Compositum upkeep (02 §3). Deduct each active toggle's per-second cost BEFORE any
  //    income is applied, so a toggle never earns on a tick it couldn't afford. Toggles that
  //    cannot pay auto-deactivate; collect a notice per deactivation. We reassign `state` here so
  //    the rest of the tick (modifiers, income, dynamics) sees the post-upkeep toggle set.
  const notices: string[] = [];
  {
    const toggled = advanceToggles(state, simDelta);
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
  //    so Avaritia / Silver / Acclaim scale it too. The ceremony income and percentage-VC terms
  //    retired with the lesser ceremonies (ADR-031 — Panvitium yields souls, not gold or influence).
  //    Resources are natural numbers (02 §1) but accumulate fractionally per 100 ms tick — floored
  //    only at display/spend/comparison boundary.
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  // Anatocismus (usura-4): half of each interest payment auto-deposits into the hoard instead of
  // paying out — split AFTER all multipliers (spec §6), so the liquid line is simply the full
  // composition minus the deposit rate, and the hoard gains the deposit.
  const anatocismusPerSecond = anatocismusDepositPerSecond(state, mods);
  const goldPerSecond =
    (BASE_GOLD_PER_SECOND + faeneratioGoldPerSecond(state, mods) + mods.flatGoldPerSecond) *
      mods.goldRateMul -
    anatocismusPerSecond;
  const proportionalInfluence = mul(
    effectiveMax,
    BASE_INFLUENCE_RATE * mods.influenceRateMul * simDelta,
  );
  // Flat influence/s from invocations (Fama) and sigils (Decarabia #69). Additive, scaled by the
  // influence-rate multiplier and folded under the same maxInfluence cap below.
  const flatInfluence = mul(mods.flatInfluencePerSecond * mods.influenceRateMul, simDelta);
  const lifetime = {
    ...state.lifetime,
    gold: add(state.lifetime.gold, mul(goldPerSecond, simDelta)),
    // The Anatocismus auto-deposit accrues on the hoard (compound interest by contract). Accrues
    // fractionally on the BigNum like gold; floored only at display/spend (ADR-005).
    hoard:
      anatocismusPerSecond > 0
        ? add(state.lifetime.hoard, mul(anatocismusPerSecond, simDelta))
        : state.lifetime.hoard,
    influence: min(
      add(add(state.lifetime.influence, proportionalInfluence), flatInfluence),
      effectiveMax,
    ),
  };
  let working: GameState = { ...state, lifetime };
  const events: OutcomeEvent[] = [];

  // 1a. Invocation upkeep (Invocatio sheet): each active invocation pays its per-second cost out of
  //     this tick's income and pools. %-of-gain costs consume a fraction of what was just gained;
  //     flat gold/influence/reprobate/stagnation costs subtract an absolute amount. A flat drain the
  //     pool can't cover dispels its invocation(s) (generalising Aurevora's "dispel at gold 0"); the
  //     %-of-gain / %-of-pool parts alone can only zero a gain (or shrink a pool), never bankrupt, so
  //     they never trigger a dispel. Reprobate upkeep is a PURE COST — whole units leave the pool
  //     WITHOUT minting souls (the 1-person-1-soul invariant covers only murder/suicide deaths).
  {
    const up = invocationUpkeep(state, effectiveMax.toNumber());
    const goldGain = sub(working.lifetime.gold, state.lifetime.gold);
    const inflGain = sub(working.lifetime.influence, state.lifetime.influence);
    const goldFracCost = mul(goldGain, up.goldGainFraction);
    const inflFracCost = mul(inflGain, up.influenceGainFraction);
    const goldFlat = mul(bn(up.flatGoldPerSecond), simDelta);
    const inflFlat = mul(bn(up.flatInfluencePerSecond), simDelta);
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

    // Reprobate upkeep (Arachne's flat drain + Morpheus's %-of-pool drain): accrued fractionally in
    // `reprobateCostPool` for exactness (ADR-004), then whole units leave the pool WITHOUT souls. A
    // flat demand the living population can't cover this tick dispels the flat drainer(s).
    const population = totalReprobates(working);
    let flatReproDemand = up.flatReprobatesPerSecond * simDelta;
    if (flatReproDemand > population) {
      dispelled.push(...up.flatReprobateDrainers);
      flatReproDemand = 0;
    }
    const reproPool =
      working.lifetime.reprobateCostPool +
      flatReproDemand +
      up.reprobateFraction * population * simDelta;

    // Stagnation upkeep (Upir): drained from the top-level stagnation pool; a demand it can't cover
    // dispels the drainer(s). Stagnation is a float, so no accrual pool is needed.
    const stagDemand = up.flatStagnationPerSecond * simDelta;
    let stagnation = state.stagnation;
    if (stagDemand > 0) {
      if (stagnation >= stagDemand) stagnation -= stagDemand;
      else dispelled.push(...up.flatStagnationDrainers);
    }

    let invocations = working.lifetime.invocations;
    if (dispelled.length > 0) {
      invocations = { ...invocations };
      for (const id of dispelled) {
        delete invocations[id];
        notices.push(`${id} dispelled — upkeep unpaid.`);
      }
    }
    working = {
      ...working,
      stagnation,
      lifetime: { ...working.lifetime, gold, influence, invocations },
    };
    // Drain whole reprobates from the accrued pool (clamped to the living population), no souls.
    const toRemove = Math.min(Math.floor(reproPool), totalReprobates(working));
    if (toRemove > 0) working = removeReprobates(working, toRemove).state;
    working = {
      ...working,
      lifetime: { ...working.lifetime, reprobateCostPool: reproPool - toRemove },
    };
  }

  // 1b. Apex invocation per-tick effects (03 §2.4): Aurevora's exponentially-rising gold drain paid
  //     against its rising efficiency boost (dispels at gold 0). Runs net of this tick's income; the
  //     efficiency half of Aurevora is read from the advanced duration by computeModifiers below.
  {
    const apex = applyInvocationTickEffects(working, simDelta);
    working = apex.state;
    for (const n of apex.notices) notices.push(n);
  }

  // 1c. Invocation stagnation generation (Blob's flat yield + Morpheus's per-consumed-reprobate
  //     yield, both efficiency-scaled — `mods.flatStagnationPerSecond`). Added to the top-level
  //     stagnation pool over `simDelta`, clamped to the current cap; never reduces a pool already at
  //     or above the cap. A no-op when no generator is active.
  if (mods.flatStagnationPerSecond > 0) {
    const cap = stagnationMax(working);
    const gained = mods.flatStagnationPerSecond * simDelta;
    working = {
      ...working,
      stagnation:
        working.stagnation >= cap ? working.stagnation : Math.min(cap, working.stagnation + gained),
    };
  }

  // 2. Resolve in-flight Opera timers. A timer whose remaining time falls to <= 0 this tick
  //    completes: its outcome is drawn from `rng` and applied, scaled by player efficiency.
  //    A large delta resolves every queued action at once. Emptio carries its target
  //    maleficium id on the timer so the resolver knows which item was being bought.
  if (working.lifetime.actionQueue.length > 0) {
    const remaining: ActionTimer[] = [];
    const completed: ActionTimer[] = [];
    for (const timer of working.lifetime.actionQueue) {
      const left = timer.remainingSeconds - simDelta;
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
  working = applyReprobateDynamics(working, simDelta);

  // 4b. Panvitium soul harvest (03 §2.3): while the ritual burns, it mints souls each second in
  //     proportion to the current soul total — R(t) × souls — compounding the hoard for as long as
  //     the exponential upkeep can be sustained. Accrued fractionally on `souls` (BigNum), floored
  //     only at display/spend per ADR-005. R(t) reads the post-upkeep duration set at step 0.
  {
    const panvRate = panvitiumRate(working);
    if (panvRate > 0) {
      // Souls minted this tick = souls × R(t) × δ; accrue them on the pool AND on the monotonic
      // totalSoulsObtained tally (05 soul-threshold emails), so the harvest counts like any mint.
      const harvested = mul(working.souls, panvRate * simDelta);
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
        handOfGloryRemaining: Math.max(0, working.lifetime.handOfGloryRemaining - simDelta),
      },
    };
  }

  // 4e. Incoming-call timed buffs (docs/PANVITIUM-CALLS-IN.md) decay the same way: they lifted this
  //     tick's income/dynamics via `mods` (computed at the start), so they are decremented now and
  //     dropped at expiry. Decays by `simDelta` like Hand of Glory (Desidia-invariant total benefit).
  working = advanceCallBuffs(working, simDelta);

  // 4d. Defixio curse (Maleficia): a single-use hex on the reprobate pool. It culls the pool at
  //     eᵗ per second (t = seconds the curse has run), integrated exactly over the tick span:
  //     cumulative kills by time t are ⌊∫₀ᵗ eˢ ds⌋ = ⌊eᵗ − 1⌋ and this tick culls the difference —
  //     so the 10 Hz loop and one big delta agree (ADR-004) and no sub-1 fraction
  //     is lost between ticks. Mints a soul per death until the pool is empty — then the curse
  //     lifts. No RNG draw (single pool).
  if (working.lifetime.defixio) {
    const curse = working.lifetime.defixio;
    const before = Math.floor(Math.expm1(curse.elapsed));
    const after = Math.expm1(curse.elapsed + simDelta);
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
              defixio: { elapsed: curse.elapsed + simDelta },
            },
          };
  }

  // 5. Acolytes (02 §10). Auto-recruit up to maxAcolytes(state) (free, immediate; unlocks on a
  //    ×1.5 effective-maxInfluence threshold series — 0 at base, first at 110). Then advance each
  //    assigned acolyte's timer; completed cycles
  //    resolve at the acolyte's efficiency and immediately start the next cycle. Acolyte events
  //    fold into the same outcome stream as player events.
  working = autoRecruitAcolytes(working);
  const acoResult = advanceAcolytes(working, simDelta, rng);
  working = acoResult.state;
  for (const ev of acoResult.events) events.push({ ...ev, source: 'acolyte' });

  // 5b. Autonomous invocation runners (02 §3). The Familiar runs Indagatio in its own channel at a
  //     fraction of the player's efficiency — separate from the player slot and the acolytes.
  const runResult = advanceInvocationRunners(working, simDelta, rng);
  working = runResult.state;
  for (const ev of runResult.events) events.push({ ...ev, source: 'invocation' });

  // 6. Achievements (03 §7). Evaluate the catalog against the fully-advanced state; fold any newly-
  //    earned ids into state.achievements and surface them for a toast. Last step, so every change
  //    this tick is reflected.
  // `lastTickAt` advances by the REAL delta, not `simDelta`: Desidia accelerates the sim but not the
  // wall clock, so the offline anchor (`now - lastTickAt`) and the runtime score stay honest (ADR-033).
  const finalState: GameState = {
    ...working,
    lastTickAt: state.lastTickAt + Math.round(deltaSeconds * 1000),
    rngState: rng.state,
  };
  const ach = evaluateAchievements(finalState);

  // 7. Impact-feedback mail (5.2 / content 05). Arm and deliver any newly-triggered emails against
  //    the fully-advanced state — last, like achievements, so one big delta also catches up
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
