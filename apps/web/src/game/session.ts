/**
 * Session lifecycle helpers — pure, framework-free, unit-testable.
 *
 * A new game seeds a fresh GameState; resuming a saved game applies offline progression as a
 * single capped tick (ADR-004: offline uses the same tick function as online, with a sane cap).
 */
import { createInitialState, tick, type GameState } from '@panvitium/sim';

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
 * last tick is clamped to [0, MAX_OFFLINE_SECONDS] and run through `tick` once.
 */
export function resumeGame(saved: GameState, now: number = Date.now()): GameState {
  const elapsedSeconds = Math.max(0, (now - saved.lastTickAt) / 1000);
  const capped = Math.min(elapsedSeconds, MAX_OFFLINE_SECONDS);
  return tick(saved, capped);
}
