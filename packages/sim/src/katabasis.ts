/**
 * Katabasis — the prestige loop (01, 02 §6). On Katabasis the player allocates the unspent soul
 * pool along two axes that are deliberately in tension:
 *   - Devotion offering (permanent, irreversible): raises a Sin's total → Sin levels/skills.
 *   - Sigil binding (recoverable): souls bound to a sigil grant a passive effect. Bindings PERSIST
 *     across descents; souls return to the pool only when the player unbinds a seal (or "unbind
 *     all") — `unbindAllSigils`/`bindSigil` are the manual levers (02 §5).
 * Whatever is left over carries into the next lifetime. Committing resets the lifetime, keeping a
 * fraction of gold / unconverted reprobates / maleficia per the carry-over rolls.
 *
 * This module is the pure core; the menu UI and store orchestrate it. All randomness comes from the injected save RNG (ADR-011).
 */
import { add, clamp, floor, isZero, mul, sub, ZERO, bn, type BigNum } from './bignum.js';
import { liquidateMercatus } from './mercatus.js';
import { sigilKatabasisBonus } from './sigils.js';
import { sigilEffectMultiplier } from './maleficia.js';
import {
  BASE_MAX_INFLUENCE,
  BASE_REMAINING_GOLD,
  BASE_REMAINING_MALEFICIA,
  BASE_REMAINING_REPROBATE,
  REMAINING_GOLD_PER_AVARITIA_LEVEL,
  REMAINING_MALEFICIA_PER_SUPERBIA_LEVEL,
  REMAINING_REPROBATE_PER_TRISTITIA_LEVEL,
} from './constants.js';
import { sinLevel } from './progression.js';
import { makeRng } from './rng.js';
import { type GameState, type LifetimeState, type Sin, type SigilId } from './state.js';

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

// ── Carry-over fractions (02 §6) ─────────────────────────────────────────────
// Base (Globals) + the offering Sin's per-level effect (Sins & Devotion). The `sigilBonus`
// parameter is the hook for sigil contributions, folded in once the modifier engine exists.

export function remainingGoldFraction(state: GameState, sigilBonus = 0): number {
  return clamp01(
    BASE_REMAINING_GOLD +
      REMAINING_GOLD_PER_AVARITIA_LEVEL * sinLevel(state.devotion.avaritia) +
      sigilBonus,
  );
}

export function remainingReprobateFraction(state: GameState, sigilBonus = 0): number {
  return clamp01(
    BASE_REMAINING_REPROBATE +
      REMAINING_REPROBATE_PER_TRISTITIA_LEVEL * sinLevel(state.devotion.tristitia) +
      sigilBonus,
  );
}

export function remainingMaleficiaChance(state: GameState, sigilBonus = 0): number {
  return clamp01(
    BASE_REMAINING_MALEFICIA +
      REMAINING_MALEFICIA_PER_SUPERBIA_LEVEL * sinLevel(state.devotion.superbia) +
      sigilBonus,
  );
}

// ── Soul-pool allocation in the Katabasis menu ───────────────────────────────

/** Total souls currently bound across all sigils. */
export function totalBound(state: GameState): BigNum {
  let sum = ZERO;
  for (const value of Object.values(state.sigilBindings)) {
    if (value) sum = add(sum, value);
  }
  return sum;
}

/** Return every bound soul to the unspent pool and clear bindings (02 §5: recoverable). */
export function unbindAllSigils(state: GameState): GameState {
  if (Object.keys(state.sigilBindings).length === 0) return state;
  return { ...state, souls: add(state.souls, totalBound(state)), sigilBindings: {} };
}

/**
 * Offer souls to a Prince — permanent, irreversible (02 §6). Moves up to the available unspent
 * pool from `souls` into `devotion[sin]`. The amount is floored (souls are natural numbers) and
 * clamped to what's available.
 */
export function offerDevotion(state: GameState, sin: Sin, amount: BigNum | number): GameState {
  const give = clamp(floor(amount), ZERO, floor(state.souls));
  if (isZero(give)) return state;
  return {
    ...state,
    souls: sub(state.souls, give),
    devotion: { ...state.devotion, [sin]: add(state.devotion[sin], give) },
  };
}

/**
 * Bind a sigil to exactly `targetAmount` souls (recoverable). The sigil's currently-bound souls
 * count as available, so this re-binds rather than stacks: the delta moves to/from the unspent
 * pool. Floored and clamped to (current binding + unspent pool). Binding 0 clears the sigil.
 */
export function bindSigil(
  state: GameState,
  sigilId: SigilId,
  targetAmount: BigNum | number,
): GameState {
  const current = state.sigilBindings[sigilId] ?? ZERO;
  const available = add(state.souls, current);
  const target = clamp(floor(targetAmount), ZERO, floor(available));
  const sigilBindings = { ...state.sigilBindings };
  if (isZero(target)) delete sigilBindings[sigilId];
  else sigilBindings[sigilId] = target;
  return { ...state, souls: sub(available, target), sigilBindings };
}

// ── Enter (teardown on descent) ──────────────────────────────────────────────

/**
 * Begin the descent (02 §6): the moment the player commits to Katabasis, the lifetime's *productive*
 * systems are torn down — NOT later when they rise. Every Mercatus auto-divests at the divest
 * fraction into gold (so the refund rides the later carry-over roll — spec §1.4), toggles stop,
 * the action queue clears, invocations are dispelled and their autonomous channels stop, and
 * acolytes drop their assignments. What the commit will roll for carry-over (gold, reprobates,
 * maleficia) is left intact and frozen; the store suspends ticking while the menu is open, so
 * nothing accrues during allocation. `commitKatabasis` finishes the descent (the carry-over rolls
 * + lifetime reset) when the player confirms.
 */
export function enterKatabasis(state: GameState): GameState {
  // Mercatus liquidation (spec §1.4): all trades sell off into gold and depths reset, BEFORE the
  // remaining-gold roll at commit — the same ordering the old auto-shutdown had, preserving the
  // Avaritia carry-over interplay (the refund is real risk capital subject to the same loss).
  const liquidated = liquidateMercatus(state);
  const acolytes = liquidated.lifetime.acolytes.map((a) => ({
    ...a,
    assignedAction: null,
    remainingSeconds: null,
  }));
  return {
    ...liquidated,
    inKatabasis: true, // freeze the lifetime in `tick` (online + offline) until commit
    lifetime: {
      ...liquidated.lifetime,
      activeToggles: [], // toggles stop
      toggleDurations: {},
      actionQueue: [], // uncompleted player actions fizzle
      autoRepeat: [], // auto-repeating rites stop with the slot
      invocations: {}, // all invocations dispelled (02 §7)
      invocationRunners: {}, // …and their autonomous channels stop
      invocationDurations: {}, // …and any apex duration counters (Aurevora) clear
      acolytes, // followers drop their tasks (the list itself clears at commit)
    },
  };
}

// ── Commit ───────────────────────────────────────────────────────────────────

/** What the player comes back with, for the recap screen (01 "The Katabasis recap", 02 §6). */
export interface KatabasisRecap {
  readonly goldKept: BigNum;
  readonly reprobatesKept: number;
  readonly maleficiaKept: string[];
  readonly maleficiaLost: string[];
  readonly soulsCarried: BigNum;
}

/**
 * Commit the Katabasis: reset the lifetime, keeping a fraction of gold and reprobates
 * and rolling each maleficium against its remaining chance. Souls (the leftover pool), Devotion,
 * and current sigil bindings carry through untouched. Invocations are dispelled, Mercatus depths /
 * Emptio cleared, influence reset to 0. Returns the resumed state and the recap of what was kept.
 *
 * Call AFTER the player has finished allocating (offer/bind). `now` defaults to the current clock.
 */
export function commitKatabasis(
  state: GameState,
  now: number = state.lastTickAt,
): { state: GameState; recap: KatabasisRecap } {
  const rng = makeRng(state.rngState);

  // Apex Katabasis overrides (03 §2.4). Erinyes invoke clears any prior pendingMorpheus, so at
  // most ONE flag is set at commit time. Erinyes zeros gold + maleficia and stacks a permanent
  // ×2 player-efficiency multiplier; Morpheus maxes both rolls and preserves the Emptio list.
  const pendingErinyes = state.lifetime.pendingErinyes === true;
  const pendingMorpheus = !pendingErinyes && state.lifetime.pendingMorpheus === true;

  // Mercatus liquidation (spec §1.4): every trade auto-divests into gold BEFORE the carry-over
  // roll, so the refund participates in the remaining-gold % and not at face value — the trades
  // are real risk capital subject to the same loss as cash on hand at descent. `enterKatabasis`
  // already liquidated; this defensive repeat is a no-op when depths are 0.
  state = liquidateMercatus(state);
  const goldAtDescent = state.lifetime.gold;

  // Remaining gold: a fraction of the gold held at this Katabasis (02 §6) — now inclusive of the
  // Mercatus liquidation refunds folded in above. Sigils (Purson #20, Semet #32) lift the fraction;
  // Erinyes/Morpheus override it outright. Sigil-enhancer maleficia (Solomon's Ring, Iron Nails)
  // scale every sigil's carry-over strength.
  const sigilEffectMul = sigilEffectMultiplier(state.lifetime.maleficia);
  const goldFraction = pendingErinyes
    ? 0
    : pendingMorpheus
      ? 1
      : remainingGoldFraction(state, sigilKatabasisBonus(state, 'gold', sigilEffectMul));
  const goldKept = floor(mul(floor(goldAtDescent), goldFraction));

  // Remaining maleficia: each rolls independently against the remaining chance (02 §6/§8). Sigils
  // (Halphas #38, Semet #32) lift the chance; Erinyes zeros it, Morpheus maxes it.
  const chance = pendingErinyes
    ? 0
    : pendingMorpheus
      ? 1
      : remainingMaleficiaChance(state, sigilKatabasisBonus(state, 'maleficia', sigilEffectMul));
  const maleficiaKept: string[] = [];
  const maleficiaLost: string[] = [];
  for (const m of state.lifetime.maleficia) {
    if (rng.chance(chance)) maleficiaKept.push(m);
    else maleficiaLost.push(m);
  }

  // Remaining reprobates: a fraction of the pool survives the descent. Sigils (Semet #32) lift it.
  const reprobates = Math.floor(
    state.lifetime.reprobates *
      remainingReprobateFraction(state, sigilKatabasisBonus(state, 'reprobate', sigilEffectMul)),
  );

  const lifetime: LifetimeState = {
    gold: goldKept,
    influence: ZERO,
    maxInfluence: bn(BASE_MAX_INFLUENCE), // sin/sigil/maleficia modifiers raise this once they exist
    reprobates,
    acolytes: [], // re-grow from influence
    invocations: {}, // all invocations dispelled (02 §7)
    invocationRunners: {}, // …and their autonomous channels stop
    invocationDurations: {}, // …and any apex duration counters (Aurevora) clear
    maleficia: maleficiaKept,
    // Morpheus's mercy (03 §2.4): the Emptio list survives the descent so the maleficia surfaced
    // in this lifetime are not lost. Otherwise the list clears (02 §6).
    emptioList: pendingMorpheus ? [...state.lifetime.emptioList] : [],
    maleficiaPrices: pendingMorpheus ? { ...state.lifetime.maleficiaPrices } : {},
    handOfGloryRemaining: 0,
    activeToggles: [], // toggles stop
    toggleDurations: {}, // and their duration counters clear
    actionQueue: [], // uncompleted actions fizzle
    autoRepeat: [], // and nothing carries an auto-repeat into the new lifetime
    mercatusDepths: {}, // all trades liquidated at descent (refund folded into goldAtDescent)
    generationPool: 0, // pools reset with the fresh lifetime
    suicidePool: 0,
    murderPool: 0,
    // The inbox is mail history: it persists across descents (it is never wiped). Carrying it over
    // also keeps `deliverEmails`' once-per-id dedup intact between lifetimes, so a story beat gated on
    // a monotonic tally (a soul-threshold bulletin, Fausto #5's door-knock) is delivered once and
    // never replays on the next return. The arm timers ride along so a mid-arming timed/random email
    // keeps its schedule across the descent instead of re-arming from scratch.
    inbox: state.lifetime.inbox,
    emailArmedAt: state.lifetime.emailArmedAt,
    // The Fausto flags travel with the inbox they describe: the threat-reply branch stays closed once
    // sent, and the curse stays in force for as long as its letter remains undeleted ("quamdiu haec
    // verba manent") rather than silently lifting on the descent.
    ...(state.lifetime.flagFCThreatSent === true ? { flagFCThreatSent: true } : {}),
    ...(state.lifetime.flagFaustoCurse === true ? { flagFaustoCurse: true } : {}),
    // flagFatherMad / flagReubenDead are top-level and carry across. pendingErinyes / pendingMorpheus
    // / morpheusLockedOut are intentionally omitted — the new lifetime starts clean.
  };

  return {
    state: {
      ...state,
      lifetime,
      inKatabasis: false, // descent complete — the new lifetime ticks again
      rngState: rng.state,
      lastTickAt: now,
      katabasisCount: state.katabasisCount + 1,
      // Erinyes stacks a permanent ×2 player-efficiency multiplier on every Katabasis it was
      // pending for. Read by computeModifiers as 2 ** stacks.
      ...(pendingErinyes
        ? { erinyesEfficiencyStacks: (state.erinyesEfficiencyStacks ?? 0) + 1 }
        : {}),
    },
    recap: {
      goldKept,
      reprobatesKept: reprobates,
      maleficiaKept,
      maleficiaLost,
      soulsCarried: floor(state.souls),
    },
  };
}
