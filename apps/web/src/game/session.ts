/**
 * Session lifecycle helpers — pure, framework-free, unit-testable.
 *
 * A new game seeds a fresh GameState; resuming a saved game does NOT advance it. The game FREEZES
 * while offline (ADR-032, superseding ADR-004's offline catch-up and ADR-026's offline efficiency):
 * there is no offline progression. `resumeGame` only reconciles the logical clock to wall-clock so
 * the live loop does not then process a huge delta, and the player is restored exactly where they
 * left off (`inKatabasis` and everything else untouched — a save written mid-descent reopens the
 * Katabasis menu).
 *
 * The time the player spent away is still knowable to callers as `now - saved.lastTickAt` (a plain
 * subtraction, taken before the clock is reconciled); the forthcoming "stagnation" resource will be
 * granted from it. Nothing consumes it yet.
 */
import { createInitialState, type GameState } from '@panvitium/sim';

/** A random seed for a brand-new game; keys the deterministic RNG (ADR-011). */
export function randomSeed(): string {
  return crypto.randomUUID();
}

/** Begin a fresh game. */
export function startNewGame(now: number = Date.now()): GameState {
  return createInitialState(randomSeed(), now);
}

/**
 * Resume a loaded game. The world froze while away, so no simulation runs: the state is returned
 * unchanged apart from advancing the logical clock to `now` (never backwards, guarding clock skew),
 * so the live 10 Hz loop picks up from here rather than replaying the absence. The player is left
 * exactly where they were when they saved.
 */
export function resumeGame(saved: GameState, now: number = Date.now()): GameState {
  return { ...saved, lastTickAt: Math.max(saved.lastTickAt, now) };
}
