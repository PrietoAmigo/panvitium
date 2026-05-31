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

/**
 * Cull a fraction (floored, clamped to [0,1]) of a single subtype — Pogrom's targeted purge
 * (Decimatio sheet). Returns the new state and how many were removed; the caller mints the souls.
 */
export function cullSubtypeFraction(
  state: GameState,
  subtype: ReprobateSubtype,
  fraction: number,
): { state: GameState; removed: number } {
  const count = state.lifetime.reprobates[subtype];
  const removed = Math.floor(count * Math.min(1, Math.max(0, fraction)));
  if (removed <= 0) return { state, removed: 0 };
  const reprobates = { ...state.lifetime.reprobates, [subtype]: count - removed };
  return { state: { ...state, lifetime: { ...state.lifetime, reprobates } }, removed };
}

/**
 * Cull up to `n` (floored) reprobates of a single subtype — Defixio's absolute-count hex. Clamped
 * to the subtype's current count; returns the new state and how many were removed (caller mints
 * the souls).
 */
export function cullSubtypeCount(
  state: GameState,
  subtype: ReprobateSubtype,
  n: number,
): { state: GameState; removed: number } {
  const count = state.lifetime.reprobates[subtype];
  const removed = Math.min(count, Math.max(0, Math.floor(n)));
  if (removed <= 0) return { state, removed: 0 };
  const reprobates = { ...state.lifetime.reprobates, [subtype]: count - removed };
  return { state: { ...state, lifetime: { ...state.lifetime, reprobates } }, removed };
}

/**
 * Lose a fraction (per-subtype, floored) of the *converted* reprobates only — every subtype except
 * the unconverted `reprobate` base. Used for the "Church seizes converts" Decimatio losses; no
 * souls are minted (they are taken from you, not harvested).
 */
export function loseConvertedReprobatesFraction(
  state: GameState,
  fraction: number,
): { state: GameState; removed: number } {
  const f = Math.min(1, Math.max(0, fraction));
  if (f <= 0) return { state, removed: 0 };
  const reprobates = { ...state.lifetime.reprobates };
  let removed = 0;
  for (const t of REPROBATE_SUBTYPES) {
    if (t === 'reprobate') continue;
    const lose = Math.floor(reprobates[t] * f);
    if (lose > 0) {
      reprobates[t] -= lose;
      removed += lose;
    }
  }
  if (removed === 0) return { state, removed: 0 };
  return { state: { ...state, lifetime: { ...state.lifetime, reprobates } }, removed };
}
