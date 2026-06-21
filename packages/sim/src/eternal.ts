/**
 * The Eternal Sin (03 §8, 01 "After the Eternal Sin") — the endgame capstone. Once every Cardinal
 * Sin sits at MAX_SIN_LEVEL, a blacked-out ninth Sin appears above the eight. Souls offered to it
 * accumulate in `eternalDevotion`; reaching ETERNAL_SIN_THRESHOLD reveals its name — **Semet**,
 * "oneself" — and rolls the credits. The score is the total game runtime to that moment; the
 * reveal is terminal but the game continues in its post-reveal state (the achievement just lights).
 *
 * Lore: Semet is also sigil #32, available far earlier — a player who bound it never knew they
 * were already worshipping themselves. This module owns only the offering + gate logic; the reveal
 * screen and the Semet naming live in the UI.
 */
import { add, clamp, floor, gte, isZero, lte, ONE, sub, ZERO, type BigNum } from './bignum.js';
import { ETERNAL_SIN_THRESHOLD, MAX_SIN_LEVEL } from './constants.js';
import { sinLevel } from './progression.js';
import { SINS, type GameState } from './state.js';

/** True once every Cardinal Sin is at the cap (MAX_SIN_LEVEL). Gates the Eternal Sin's existence. */
export function allSinsMaxed(state: GameState): boolean {
  for (const s of SINS) {
    if (sinLevel(state.devotion[s]) < MAX_SIN_LEVEL) return false;
  }
  return true;
}

/**
 * The Eternal Sin is visible (and offerable) once all eight Cardinal Sins are maxed. Before that
 * it does not exist for the player.
 */
export function eternalSinVisible(state: GameState): boolean {
  return allSinsMaxed(state);
}

/** True once cumulative Eternal devotion has reached the reveal threshold — Semet is named. */
export function eternalSinRevealed(state: GameState): boolean {
  return gte(floor(state.eternalDevotion), ETERNAL_SIN_THRESHOLD);
}

/**
 * Progress toward the reveal in [0, 1], log-scaled — for the offering bar. The threshold is ~8.4e9
 * souls, so a linear bar reads as empty for almost the entire climb. log(devotion)/log(threshold)
 * keeps early offerings visible (the geometric midpoint, √threshold, sits at 50%). Display-only; the
 * reveal gate itself is the exact `eternalSinRevealed` comparison.
 */
export function eternalProgress(state: GameState): number {
  const cur = floor(state.eternalDevotion);
  if (gte(cur, ETERNAL_SIN_THRESHOLD)) return 1; // full at the reveal gate (avoids ln round-off)
  if (lte(cur, ONE)) return 0;
  return Math.min(1, cur.ln() / Math.log(ETERNAL_SIN_THRESHOLD));
}

/**
 * Offer souls to the Eternal Sin — permanent, irreversible, like Cardinal devotion (02 §6).
 * No-op unless every Cardinal Sin is maxed (the Eternal Sin doesn't exist before then). Floors
 * the amount and clamps to the unspent soul pool. Returns the new state.
 */
export function offerEternal(state: GameState, amount: BigNum | number): GameState {
  if (!allSinsMaxed(state)) return state;
  const give = clamp(floor(amount), ZERO, floor(state.souls));
  if (isZero(give)) return state;
  return {
    ...state,
    souls: sub(state.souls, give),
    eternalDevotion: add(state.eternalDevotion, give),
  };
}

/** Total game runtime in milliseconds (the reveal score): `lastTickAt - startedAt`. */
export function gameRuntimeMs(state: GameState): number {
  return Math.max(0, state.lastTickAt - state.startedAt);
}
