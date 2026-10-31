/**
 * Population helpers — the mutations Opera outcomes apply to souls, reprobates, and gold. Pure.
 * Reprobates are a single undifferentiated pool (subtypes removed): a plain integer count
 * (1 person = 1 soul); souls and gold are BigNum.
 */
import { add, mul } from './bignum.js';
import { sigilGoldPerDeath, sigilStrengthMul } from './sigils.js';
import { type GameState, totalReprobates } from './state.js';

/**
 * Mint `n` souls (1 soul per corrupted death; 03 §3). The minted amount also accrues into
 * `totalSoulsObtained` — the monotonic lifetime-spanning tally that drives the soul-threshold
 * emails (05) — so every mint site feeds it through this one helper. Every death passes through
 * here, so Raum #40's bounty is paid here too: each soul brings `sigilGoldPerDeath` gold (scaled by
 * the shared sigil-strength multiplier, ADR-036/043). No RNG is drawn.
 */
export function mintSouls(state: GameState, n: number): GameState {
  if (n <= 0) return state;
  const minted = Math.floor(n);
  // The bounty's sum is linear in the sigil multiplier, so the (costlier) stack is read only when a
  // Raum binding exists.
  const bounty = sigilGoldPerDeath(state);
  const gold =
    bounty > 0 && minted > 0
      ? add(state.lifetime.gold, minted * bounty * sigilStrengthMul(state))
      : state.lifetime.gold;
  return {
    ...state,
    souls: add(state.souls, minted),
    totalSoulsObtained: add(state.totalSoulsObtained, minted),
    ...(gold === state.lifetime.gold ? {} : { lifetime: { ...state.lifetime, gold } }),
  };
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
 * Lose a fraction of the Thesaurus reserve (`lifetime.hoard`, clamped to [0,1]); the reserve stays
 * a BigNum. No surrender charge applies: the fraction simply leaves the account.
 */
export function loseReserveFraction(state: GameState, fraction: number): GameState {
  if (fraction <= 0) return state;
  const keep = 1 - Math.min(1, fraction);
  return { ...state, lifetime: { ...state.lifetime, hoard: mul(state.lifetime.hoard, keep) } };
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
