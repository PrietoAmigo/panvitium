/**
 * Session lifecycle helpers — pure, framework-free, unit-testable.
 *
 * A new game seeds a fresh GameState; resuming a saved game applies offline progression as a
 * single capped tick (ADR-004: offline uses the same tick function as online, with a sane cap).
 */
import {
  ACEDIA_OFFLINE_COMPOUND_BASE,
  computeModifiers,
  createInitialState,
  sinLevel,
  tick,
  type GameState,
} from '@panvitium/sim';

/** Offline progression is capped so a long absence can't fast-forward unbounded time (ADR-004). */
export const MAX_OFFLINE_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** A random seed for a brand-new game; keys the deterministic RNG (ADR-011). */
export function randomSeed(): string {
  return crypto.randomUUID();
}

/** Begin a fresh game. */
export function startNewGame(now: number = Date.now()): GameState {
  return createInitialState(randomSeed(), now);
}

/**
 * Resume a loaded game, applying offline progression. The elapsed wall-clock since the save's
 * last tick is clamped to [0, MAX_OFFLINE_SECONDS], then scaled by two Acedia / 03 §3 factors:
 *
 *   - **static**:  `mods.offlineTimeMul` — Glutton drags down (03 §3), Procrastination skill lifts
 *     (03 §1, continuous, intensity-driven).
 *   - **dynamic**: `BASE ^ (offlineMinutes × acediaLevel²)` (03 §1, per-level, time-dependent —
 *     so it can't be a static scalar in the bundle). Rewards being away longer at higher levels.
 *
 * The modifiers are sampled from the saved state — Glutton-count + Procrastination intensity +
 * Acedia level at descent govern the catchup, not whatever they become mid-catchup.
 */
export function resumeGame(saved: GameState, now: number = Date.now()): GameState {
  const elapsedSeconds = Math.max(0, (now - saved.lastTickAt) / 1000);
  const capped = Math.min(elapsedSeconds, MAX_OFFLINE_SECONDS);
  const offlineMul = computeModifiers(saved).offlineTimeMul;
  const acediaLvl = sinLevel(saved.devotion.acedia);
  const offlineMinutes = capped / 60;
  const acediaCompound =
    acediaLvl > 0 ? ACEDIA_OFFLINE_COMPOUND_BASE ** (offlineMinutes * acediaLvl * acediaLvl) : 1;
  const scaled = capped * offlineMul * acediaCompound;
  return tick(saved, scaled).state;
}
