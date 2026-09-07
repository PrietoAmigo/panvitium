/**
 * Stagnation + Desidia (ADR-033) — the offline-torpor resource and the time-acceleration toggle
 * that spends it.
 *
 * Stagnation is banked while the world is frozen offline (there is no offline progression since
 * ADR-032): on resume the web session grants `STAGNATION_PER_SECOND × secondsAway`, clamped to
 * `stagnationMax`. It is a bounded count, so a plain `number` (ADR-005), and top-level/permanent —
 * real-world time away is not a per-lifetime quantity, so it carries across Katabasis like Devotion.
 *
 * Desidia is a toggle (its button lives under the Stagnation HUD, not in the Opera queue): while
 * active the live tick advances the sim faster (`DESIDIA_BASE_SPEED`, lifted by Acedia's
 * Procrastination via `mods.desidiaSpeedMul`) and drains stagnation (`DESIDIA_BASE_COST_PER_SECOND`,
 * reduced by Lemure via `mods.desidiaDrainMul`). The drain and acceleration live in `tick.ts`; this
 * module owns the constants, the derived cap, the offline grant, and the toggle transform.
 */
import { sinLevel } from './progression.js';
import { type GameState } from './state.js';

/** Base stagnation cap before Acedia tiers double it (design: 120). */
export const STAGNATION_BASE_MAX = 120;

/** Stagnation gained per second offline: 0.2 per minute (design). */
export const STAGNATION_PER_SECOND = 0.2 / 60;

/** Base stagnation drained per second while Desidia is active (design: 1/s; modified by effects). */
export const DESIDIA_BASE_COST_PER_SECOND = 1;

/** Base time-speed multiplier while Desidia is active (design: 1.333×; modified by effects). */
export const DESIDIA_BASE_SPEED = 1.333;

/** Fractional stagnation-drain reduction per bound Lemure (design: 12.5% per copy, multiplicative). */
export const LEMURE_DRAIN_REDUCTION_PER_COPY = 0.125;

/**
 * The current stagnation cap: base 120, DOUBLED per Acedia tier (each Sin level ×2). Derived from
 * the persistent Acedia Devotion total, so it can never drift (recomputed on demand, never stored).
 */
export function stagnationMax(state: GameState): number {
  return STAGNATION_BASE_MAX * 2 ** sinLevel(state.devotion.acedia);
}

/**
 * Grant offline-accrued stagnation over `offlineSeconds`, clamped to the current cap. Pure; a no-op
 * for a non-positive span or when already at the cap. Called by the web `resumeGame` with the real
 * wall-clock time the player was away.
 */
export function grantStagnationForOffline(state: GameState, offlineSeconds: number): GameState {
  if (offlineSeconds <= 0) return state;
  const next = Math.min(
    stagnationMax(state),
    state.stagnation + offlineSeconds * STAGNATION_PER_SECOND,
  );
  return next === state.stagnation ? state : { ...state, stagnation: next };
}

/** Turn the Desidia toggle on or off. Pure; a no-op when already in the requested state. */
export function setDesidia(state: GameState, active: boolean): GameState {
  if ((state.desidiaActive ?? false) === active) return state;
  return { ...state, desidiaActive: active };
}
