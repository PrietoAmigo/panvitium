/**
 * Population helpers — the mutations Opera outcomes apply to souls, reprobates, and gold. Pure.
 * Reprobates are a single undifferentiated pool (subtypes removed): a plain integer count
 * (1 person = 1 soul); souls and gold are BigNum.
 */
import { add, mul } from './bignum.js';
import { type GameState, totalReprobates } from './state.js';

/** Mint `n` souls (1 soul per corrupted death; 03 §3). */
export function mintSouls(state: GameState, n: number): GameState {
  if (n <= 0) return state;
  return { ...state, souls: add(state.souls, Math.floor(n)) };
}

/** Add `n` reprobates to the pool. */
export function addReprobates(state: GameState, n: number): GameState {
  if (n <= 0) return state;
  return {
    ...state,
    lifetime: { ...state.lifetime, reprobates: state.lifetime.reprobates + Math.floor(n) },
  };
}

/** Lose a fraction of current gold (clamped to [0,1]); gold stays a BigNum. */
export function loseGoldFraction(state: GameState, fraction: number): GameState {
  if (fraction <= 0) return state;
  const keep = 1 - Math.min(1, fraction);
  return { ...state, lifetime: { ...state.lifetime, gold: mul(state.lifetime.gold, keep) } };
}

/**
 * Remove up to `n` reprobates from the pool. Returns the new state and the number actually
 * removed (clamped to the current population). Deterministic — with a single pool there is no
 * subtype to draw, so no RNG is consumed.
 */
export function removeReprobates(
  state: GameState,
  n: number,
): { state: GameState; removed: number } {
  const total = state.lifetime.reprobates;
  const removed = Math.min(Math.max(0, Math.floor(n)), total);
  if (removed === 0) return { state, removed: 0 };
  return {
    state: { ...state, lifetime: { ...state.lifetime, reprobates: total - removed } },
    removed,
  };
}

/** Remove a fraction (floored, clamped to [0,1]) of the reprobate pool. */
export function loseReprobatesFraction(
  state: GameState,
  fraction: number,
): { state: GameState; removed: number } {
  const total = totalReprobates(state);
  const n = Math.floor(total * Math.min(1, Math.max(0, fraction)));
  return removeReprobates(state, n);
}
