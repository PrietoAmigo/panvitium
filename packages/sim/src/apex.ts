/**
 * Apex invocation per-tick effects (03 §2.4) — the apex whose effect is a per-second action on the
 * lifetime rather than a static entry in the modifier bundle:
 *
 *   - Aurevora (apex Gula): an exponentially-rising gold drain paid against a similarly-rising boost
 *     to player action efficiency (the efficiency half lives in `computeModifiers`, reading the
 *     active-duration tracked here). When the drain takes gold to 0 the invocation dispels.
 *
 * The rising halves both scale with the seconds Aurevora has been active, tracked in
 * `lifetime.invocationDurations` (mirrors `toggleDurations` for Panvitium). This module owns the
 * curves and the tick pass; the catalog gates/costs live in invocations.ts and the efficiency
 * multiplier is folded into the bundle by modifiers.ts.
 *
 * (Astiwihad's mass-suicide role was retired: Astiwihad is now the world-still apex — the freeze
 * lives in `tick.ts` and its Katabasis carry-over in `invoke`/`commitKatabasis` — so this module no
 * longer draws RNG. Morpheus's reprobate→desidia conversion is a modifier-bundle field
 * (`flatDesidiaPerSecond`) applied in the tick, and its reprobate upkeep is charged in tick 1a.)
 *
 * Pure with respect to `state`. No dependency on the modifier bundle — avoids a cycle, since
 * modifiers.ts reads the Aurevora efficiency curve from here.
 */
import { ZERO, bn, gte, mul, sub, type BigNum } from './bignum.js';
import {
  AUREVORA_BASE_GOLD_DRAIN_PER_SECOND,
  AUREVORA_DRAIN_GROWTH_PER_SECOND,
  AUREVORA_EFFICIENCY_GROWTH_PER_SECOND,
} from './constants.js';
import { type GameState } from './state.js';

/**
 * Aurevora gold drain per second at a given active-duration: `base × growth^secondsActive`. May
 * exceed Number range for a long-lived ramp; the caller guards with `Number.isFinite` and treats a
 * non-finite drain as "eats everything" (dispel). Returns 0 for a non-positive duration guard.
 */
export function aurevoraDrainPerSecond(secondsActive: number): number {
  if (secondsActive < 0) return AUREVORA_BASE_GOLD_DRAIN_PER_SECOND;
  return AUREVORA_BASE_GOLD_DRAIN_PER_SECOND * AUREVORA_DRAIN_GROWTH_PER_SECOND ** secondsActive;
}

/**
 * Aurevora player-efficiency multiplier at a given active-duration: `growth^secondsActive` — 1 at
 * t = 0, rising thereafter. Guarded so a runaway ramp caps at a large finite value instead of
 * Infinity (in practice the gold drain dispels Aurevora long before this matters).
 */
export function aurevoraEfficiencyMul(secondsActive: number): number {
  if (secondsActive <= 0) return 1;
  const m = AUREVORA_EFFICIENCY_GROWTH_PER_SECOND ** secondsActive;
  return Number.isFinite(m) ? m : Number.MAX_VALUE;
}

/**
 * Apply the apex per-tick effects: Aurevora's gold drain (dispelling at 0). Returns the new state
 * plus any system notices (an Aurevora dispel) for the tick to surface. Idempotent when Aurevora is
 * not active.
 */
export function applyInvocationTickEffects(
  state: GameState,
  deltaSeconds: number,
): { state: GameState; notices: string[] } {
  if (deltaSeconds <= 0) return { state, notices: [] };
  let working = state;
  const notices: string[] = [];

  // ── Aurevora: exponential gold drain ↔ rising efficiency; dispel at gold 0. ──────────────────
  if ((working.lifetime.invocations.aurevora ?? 0) > 0) {
    // Evaluate the ramp at the duration BEFORE this tick's increment, mirroring Panvitium's
    // duration-scaled cost (compositum.ts), then advance the counter by deltaSeconds.
    const prevDuration = working.lifetime.invocationDurations.aurevora ?? 0;
    const drainPerSecond = aurevoraDrainPerSecond(prevDuration);
    const gold = working.lifetime.gold;

    let dispel = false;
    let nextGold: BigNum = gold;
    if (!Number.isFinite(drainPerSecond)) {
      // Runaway ramp — it eats everything this tick (mirrors Panvitium's finite guard).
      dispel = true;
    } else {
      const drain = mul(bn(drainPerSecond), deltaSeconds);
      if (gte(drain, gold)) dispel = true;
      else nextGold = sub(gold, drain);
    }

    if (dispel) {
      // Gold reaches 0 → Aurevora departs (03 §2.4). Clear its count and duration.
      const invocations = { ...working.lifetime.invocations };
      delete invocations.aurevora;
      const invocationDurations = { ...working.lifetime.invocationDurations };
      delete invocationDurations.aurevora;
      working = {
        ...working,
        lifetime: { ...working.lifetime, gold: ZERO, invocations, invocationDurations },
      };
      notices.push('Aurevora consumed the last of your gold and departed.');
    } else {
      working = {
        ...working,
        lifetime: {
          ...working.lifetime,
          gold: nextGold,
          invocationDurations: {
            ...working.lifetime.invocationDurations,
            aurevora: prevDuration + deltaSeconds,
          },
        },
      };
    }
  }

  return { state: working, notices };
}
