/**
 * Katabasis — the prestige loop (01, 02 §6). On Katabasis the player allocates the unspent soul
 * pool along two axes that are deliberately in tension:
 *   - Devotion offering (permanent, irreversible): raises a Sin's total → Sin levels/skills.
 *   - Sigil binding (recoverable): souls bound to a sigil grant a passive effect, re-allocatable
 *     every Katabasis — so on entering the menu, bound souls return to the pool (02 §5).
 * Whatever is left over carries into the next lifetime. Committing resets the lifetime, keeping a
 * fraction of gold / unconverted reprobates / maleficia per the carry-over rolls.
 *
 * This module is the pure core; the menu UI and store orchestrate it. Systems not yet built
 * (invocations, businesses, Emptio, the sigil/sin *modifier* engine) are cleared or use base
 * fractions, with the hooks marked. All randomness comes from the injected save RNG (ADR-011).
 */
import { add, clamp, floor, isZero, mul, sub, ZERO, bn, type BigNum } from './bignum.js';
import { businessById, SHUTDOWN_REFUND_FRACTION } from './businesses.js';
import { sigilKatabasisBonus } from './sigils.js';
import {
  BASE_MAX_INFLUENCE,
  BASE_REMAINING_GOLD,
  BASE_REMAINING_MALEFICIA,
  BASE_REMAINING_UNCONVERTED_REPROBATE,
  REMAINING_GOLD_PER_AVARITIA_LEVEL,
  REMAINING_MALEFICIA_PER_SUPERBIA_LEVEL,
  REMAINING_UNCONVERTED_PER_LUXURIA_LEVEL,
} from './constants.js';
import { sinLevel } from './progression.js';
import { makeRng } from './rng.js';
import {
  type GameState,
  type LifetimeState,
  type ReprobateSubtype,
  type Sin,
  type SigilId,
  REPROBATE_SUBTYPES,
} from './state.js';

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

export function remainingUnconvertedFraction(state: GameState, sigilBonus = 0): number {
  return clamp01(
    BASE_REMAINING_UNCONVERTED_REPROBATE +
      REMAINING_UNCONVERTED_PER_LUXURIA_LEVEL * sinLevel(state.devotion.luxuria) +
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

// ── Commit ───────────────────────────────────────────────────────────────────

/** What the player comes back with, for the recap screen (01 "The Katabasis recap", 02 §6). */
export interface KatabasisRecap {
  readonly goldKept: BigNum;
  readonly reprobatesKept: number;
  readonly maleficiaKept: string[];
  readonly maleficiaLost: string[];
  readonly soulsCarried: BigNum;
}

function emptyReprobates(): Record<ReprobateSubtype, number> {
  const out = {} as Record<ReprobateSubtype, number>;
  for (const t of REPROBATE_SUBTYPES) out[t] = 0;
  return out;
}

/**
 * Commit the Katabasis: reset the lifetime, keeping a fraction of gold and unconverted reprobates
 * and rolling each maleficium against its remaining chance. Souls (the leftover pool), Devotion,
 * and current sigil bindings carry through untouched. Invocations are dispelled, businesses/Emptio
 * cleared, influence reset to 0. Returns the resumed state and the recap of what was kept.
 *
 * Call AFTER the player has finished allocating (offer/bind). `now` defaults to the current clock.
 */
export function commitKatabasis(
  state: GameState,
  now: number = state.lastTickAt,
): { state: GameState; recap: KatabasisRecap } {
  const rng = makeRng(state.rngState);

  // Vitium Mercatura auto-shutdown (02 §6): every owned business shuts down and refunds a
  // fraction of its buildCost into the gold pool BEFORE the carry-over roll. This means the
  // refund participates in the remaining-gold % and not at face value — the design intent is
  // that businesses are real risk capital subject to the same loss as cash on hand at descent.
  let goldAtDescent = state.lifetime.gold;
  for (const [bid, count] of Object.entries(state.lifetime.businesses)) {
    if (!count) continue;
    const def = businessById(bid);
    if (!def) continue;
    const refund = Math.floor(def.buildCost * SHUTDOWN_REFUND_FRACTION) * count;
    if (refund > 0) goldAtDescent = add(goldAtDescent, refund);
  }

  // Remaining gold: a fraction of the gold held at this Katabasis (02 §6) — now inclusive of the
  // business shutdown refunds folded in above. Sigils (Purson #20, Semet #32) lift the fraction.
  const goldKept = floor(
    mul(floor(goldAtDescent), remainingGoldFraction(state, sigilKatabasisBonus(state, 'gold'))),
  );

  // Remaining maleficia: each rolls independently against the remaining chance (02 §6/§8). Sigils
  // (Halphas #38, Semet #32) lift the chance.
  const chance = remainingMaleficiaChance(state, sigilKatabasisBonus(state, 'maleficia'));
  const maleficiaKept: string[] = [];
  const maleficiaLost: string[] = [];
  for (const m of state.lifetime.maleficia) {
    if (rng.chance(chance)) maleficiaKept.push(m);
    else maleficiaLost.push(m);
  }

  // Remaining reprobates: a fraction of the UNCONVERTED survive; converted subtypes are lost.
  // Sigils (Semet #32) lift the fraction.
  const reprobates = emptyReprobates();
  reprobates.reprobate = Math.floor(
    state.lifetime.reprobates.reprobate *
      remainingUnconvertedFraction(state, sigilKatabasisBonus(state, 'unconverted')),
  );

  const lifetime: LifetimeState = {
    gold: goldKept,
    influence: ZERO,
    maxInfluence: bn(BASE_MAX_INFLUENCE), // sin/sigil/maleficia modifiers raise this once they exist
    reprobates,
    acolytes: [], // re-grow from influence
    invocations: {}, // all invocations dispelled (02 §7)
    maleficia: maleficiaKept,
    emptioList: [], // lost track of them (02 §6)
    activeToggles: [], // toggles stop
    toggleDurations: {}, // and their duration counters clear
    actionQueue: [], // uncompleted actions fizzle
    businesses: {}, // all businesses auto-shut-down at descent (refund folded into goldAtDescent)
    buildQueue: [], // in-flight builds fizzle (no refund — they hadn't completed)
    generationPool: 0, // pools reset with the fresh lifetime
    suicidePool: 0,
    murderPool: 0,
    conversionPool: 0,
  };

  return {
    state: {
      ...state,
      lifetime,
      rngState: rng.state,
      lastTickAt: now,
      katabasisCount: state.katabasisCount + 1,
    },
    recap: {
      goldKept,
      reprobatesKept: reprobates.reprobate,
      maleficiaKept,
      maleficiaLost,
      soulsCarried: floor(state.souls),
    },
  };
}
