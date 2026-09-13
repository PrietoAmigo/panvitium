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
 * The one thing the resume path DOES compute from the time away is Desidia (ADR-033): the
 * player banks `DESIDIA_PER_SECOND × secondsAway` (clamped to the cap) on return. That is the
 * whole of "offline progression" now — a single resource grant, not a simulation.
 */
import { createInitialState, grantDesidiaForOffline, type GameState } from '@panvitium/sim';

/** A random seed for a brand-new game; keys the deterministic RNG (ADR-011). */
export function randomSeed(): string {
  return crypto.randomUUID();
}

/** Begin a fresh game. */
export function startNewGame(now: number = Date.now()): GameState {
  return createInitialState(randomSeed(), now);
}

/**
 * Resume a loaded game. The world froze while away, so no simulation runs: the only change is the
 * Desidia grant for the time away (ADR-033) and advancing the logical clock to `now` (never
 * backwards, guarding clock skew), so the live 10 Hz loop picks up from here rather than replaying
 * the absence. The player is left exactly where they were when they saved.
 */
export function resumeGame(saved: GameState, now: number = Date.now()): GameState {
  const offlineSeconds = Math.max(0, (now - saved.lastTickAt) / 1000);
  const withDesidia = grantDesidiaForOffline(saved, offlineSeconds);
  return { ...withDesidia, lastTickAt: Math.max(saved.lastTickAt, now) };
}
