/**
 * Population helpers — the mutations Opera outcomes apply to souls, reprobates, and gold. Pure;
 * reprobate losses are spread randomly across subtypes via the seeded RNG (03 §3). Reprobate counts
 * are plain integers (1 person = 1 soul); souls and gold are BigNum.
 */
import { add, mul } from './bignum.js';
import { type Rng } from './rng.js';
import {
  type GameState,
  type ReprobateSubtype,
  REPROBATE_SUBTYPES,
  totalReprobates,
} from './state.js';

/** Mint `n` souls (1 soul per corrupted death; 03 §3). */
export function mintSouls(state: GameState, n: number): GameState {
  if (n <= 0) return state;
  return { ...state, souls: add(state.souls, Math.floor(n)) };
}

/** Add `n` reprobates of a subtype. */
export function addReprobates(state: GameState, subtype: ReprobateSubtype, n: number): GameState {
  if (n <= 0) return state;
  const reprobates = { ...state.lifetime.reprobates };
  reprobates[subtype] += Math.floor(n);
  return { ...state, lifetime: { ...state.lifetime, reprobates } };
}

/** Lose a fraction of current gold (clamped to [0,1]); gold stays a BigNum. */
export function loseGoldFraction(state: GameState, fraction: number): GameState {
  if (fraction <= 0) return state;
  const keep = 1 - Math.min(1, fraction);
  return { ...state, lifetime: { ...state.lifetime, gold: mul(state.lifetime.gold, keep) } };
}

/**
 * Remove up to `n` reprobates, each pick weighted by current subtype counts (03 §3: loss falls
 * across any subtype at random). Returns the new state and the number actually removed.
 */
export function removeReprobatesRandom(
  state: GameState,
  n: number,
  rng: Rng,
): { state: GameState; removed: number } {
  const counts = { ...state.lifetime.reprobates };
  let total = 0;
  for (const t of REPROBATE_SUBTYPES) total += counts[t];
  const toRemove = Math.min(Math.max(0, Math.floor(n)), total);
  if (toRemove === 0) return { state, removed: 0 };

  for (let i = 0; i < toRemove; i++) {
    let r = rng.int(total);
    for (const t of REPROBATE_SUBTYPES) {
      if (r < counts[t]) {
        counts[t] -= 1;
        total -= 1;
        break;
      }
      r -= counts[t];
    }
  }
  return {
    state: { ...state, lifetime: { ...state.lifetime, reprobates: counts } },
    removed: toRemove,
  };
}

/** Remove a fraction of the whole reprobate population (floored), spread at random. */
export function loseReprobatesFraction(
  state: GameState,
  fraction: number,
  rng: Rng,
): { state: GameState; removed: number } {
  const total = totalReprobates(state);
  const n = Math.floor(total * Math.min(1, Math.max(0, fraction)));
  return removeReprobatesRandom(state, n, rng);
}
