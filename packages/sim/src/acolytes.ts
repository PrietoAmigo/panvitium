/**
 * Acolyte system (02 §10). Acolytes are your followers — they run delegated actions in an
 * autonomous channel that does not occupy the player's action slot. Each tick:
 *   - `autoRecruitAcolytes` brings the acolyte count up to `maxAcolytes(state)` based on the
 *     effective `maxInfluence` cap. Recruitment is automatic, free, immediate.
 *   - `advanceAcolytes` decrements each assigned acolyte's timer; on completion, the action
 *     resolves at the acolyte's efficiency and the timer is reset for the next cycle.
 *
 * Acolytes are not lost to outcomes (per the user's correction: no Bad-tier loss). They are
 * lost only at Katabasis, where the lifetime acolyte list is reset to empty (see `katabasis.ts`).
 *
 * Delegation covers Indagatio (time-mode, free) plus Suasio and Decimatio (cost-outcome): a
 * cost-outcome channel pays `ceil(cost × efficiency)` each cycle and stalls when it can't afford
 * one. The per-channel cycle logic lives in `runner.ts` (shared with invocation runners); the
 * `isDelegatable` predicate is the gate on which actions may be assigned.
 */
import {
  ACTIONS,
  actionCycleCost,
  canAffordCycle,
  isAutoRepeatable,
  payCycle,
  runnerCycleDuration,
} from './actions.js';
import { computeModifiers, type Modifiers } from './modifiers.js';
import { advanceRunnerCycles } from './runner.js';
import { mul, floor } from './bignum.js';
import { ACOLYTE_THRESHOLD_BASE, ACOLYTE_THRESHOLD_GROWTH } from './constants.js';
import { type Rng } from './rng.js';
import type { Acolyte, GameState } from './state.js';
import type { OutcomeEvent } from './events.js';

/**
 * Maximum acolytes given the current state, using the EFFECTIVE max influence (post-modifier).
 * Per the Acolytes sheet, the Nth acolyte unlocks once effective max influence reaches the Nth
 * threshold, where thresholds form a ×1.5 geometric series anchored at `ACOLYTE_THRESHOLD_BASE`
 * and each step is rounded to the nearest integer, compounding off the rounded previous value
 * (110 → 165 → 248 → 371 → …). A fresh lifetime (base 100 influence) has 0 acolytes; the
 * first unlocks at 110. Influence is floored before the integer comparison (resources are natural
 * numbers; `break_infinity` is a float bignum — ADR-005). The loop self-terminates: each threshold
 * grows ×2.2, so it exits as soon as one exceeds the (finite) influence, and a non-finite influence
 * exits when the threshold itself overflows to Infinity.
 */
export function maxAcolytes(state: GameState, mods: Modifiers = computeModifiers(state)): number {
  const effective = Math.floor(
    floor(mul(state.lifetime.maxInfluence, mods.maxInfluenceMul)).toNumber(),
  );
  if (!(effective > 0)) return 0;
  // Sheet rev 2026-06-12: acolyte N unlocks at round(BASE × GROWTH^(N−1)) — the FIRST at the base
  // itself (110), then ×1.5 per acolyte (110 → 165 → 248 → 371 → …), rounded to the nearest
  // integer per the sheet's continuation note.
  let count = 0;
  let threshold = ACOLYTE_THRESHOLD_BASE;
  while (Number.isFinite(threshold)) {
    if (effective >= Math.round(threshold)) count++;
    else break;
    threshold = threshold * ACOLYTE_THRESHOLD_GROWTH;
  }
  return count;
}

/**
 * Bring the acolyte list up to `maxAcolytes(state)`. Pure: returns the input unchanged if the
 * current count already meets the target. New acolytes start idle (no assignment) with
 * sequential ids that are unique per lifetime — ids never repeat within a lifetime because the
 * list is append-only until Katabasis clears it.
 */
export function autoRecruitAcolytes(state: GameState): GameState {
  const target = maxAcolytes(state);
  const current = state.lifetime.acolytes.length;
  if (current >= target) return state;
  const additions: Acolyte[] = [];
  for (let i = current; i < target; i++) {
    additions.push({ id: i + 1, assignedAction: null, remainingSeconds: null });
  }
  return {
    ...state,
    lifetime: {
      ...state.lifetime,
      acolytes: [...state.lifetime.acolytes, ...additions],
    },
  };
}

/**
 * Which actions can currently be delegated to acolytes. Indagatio (time-mode) is always available;
 * Emptio never (it needs a per-target maleficium). The Suasio/Decimatio rites become delegatable
 * only once their Sin reaches the sheet's "toggle" level (`def.delegateUnlock`), e.g. Suggestion at
 * Luxuria 1, Purgatio at Ira 4 — automating a rite is gated above merely being able to cast it.
 */
export function isDelegatable(state: GameState, actionId: string): boolean {
  // Indagatio is always delegatable; every other action shares the auto-repeat "toggle" gate
  // (`isAutoRepeatable` — the sheet's delegateUnlock level), so the two unlock in lockstep.
  if (actionId === 'indagatio') return true;
  return isAutoRepeatable(state, actionId);
}

export type AssignmentResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Assign ONE idle acolyte (the lowest-id idle one) to `actionId`, starting its first cycle. For a
 * cost-outcome action this pays `ceil(cost × efficiency)` up front; if the lifetime can't afford it
 * the acolyte is assigned **stalled** (`remainingSeconds = null`) and the tick starts+pays it once
 * resources allow — mirroring the runner's mid-run stall semantics. Time-mode (Indagatio) is free,
 * so the first cycle always starts at `baseTimeSeconds / efficiency`. Fails if no acolyte is idle
 * or the action isn't delegatable.
 */
export function assignAcolyteToAction(state: GameState, actionId: string): AssignmentResult {
  if (!isDelegatable(state, actionId)) {
    return { ok: false, reason: `${actionId} cannot be delegated yet` };
  }
  const def = ACTIONS[actionId];
  if (!def) return { ok: false, reason: `unknown action: ${actionId}` };

  const acolytes = state.lifetime.acolytes;
  const idx = acolytes.findIndex((a) => a.assignedAction === null);
  if (idx === -1) return { ok: false, reason: 'no idle acolyte available' };

  const eff = computeModifiers(state).acolyteEfficiencyMul;
  const cost = actionCycleCost(actionId, eff);

  // Start the first cycle if affordable; otherwise assign stalled and let the tick pay it later.
  let working = state;
  let remaining: number | null = null;
  if (canAffordCycle(working, cost)) {
    working = payCycle(working, cost);
    remaining = runnerCycleDuration(actionId, eff);
  }

  const updated: Acolyte = {
    ...working.lifetime.acolytes[idx]!,
    assignedAction: actionId,
    remainingSeconds: remaining,
  };
  const next = [...working.lifetime.acolytes];
  next[idx] = updated;
  return { ok: true, state: { ...working, lifetime: { ...working.lifetime, acolytes: next } } };
}

/**
 * Unassign ONE acolyte currently working on `actionId` (the highest-id assigned one — LIFO so
 * the most-recently-assigned is the first to be removed). Progress on the current cycle is
 * discarded; re-assigning starts a fresh timer.
 */
export function unassignAcolyteFromAction(state: GameState, actionId: string): AssignmentResult {
  const acolytes = state.lifetime.acolytes;
  // LIFO: scan from the end to find the most recently assigned one.
  for (let i = acolytes.length - 1; i >= 0; i--) {
    if (acolytes[i]!.assignedAction === actionId) {
      const next = [...acolytes];
      next[i] = { ...acolytes[i]!, assignedAction: null, remainingSeconds: null };
      return { ok: true, state: { ...state, lifetime: { ...state.lifetime, acolytes: next } } };
    }
  }
  return { ok: false, reason: `no acolyte assigned to ${actionId}` };
}

/** How many acolytes are currently assigned to `actionId`. */
export function assignedCount(state: GameState, actionId: string): number {
  let n = 0;
  for (const a of state.lifetime.acolytes) if (a.assignedAction === actionId) n++;
  return n;
}

/**
 * Advance every assigned acolyte by `deltaSeconds` through the shared runner engine. Each acolyte
 * runs its own channel at the acolyte efficiency: time-mode (Indagatio) just counts down; cost-
 * outcome (Suasio/Decimatio) pays `ceil(cost × efficiency)` per cycle and stalls when broke. A
 * stalled acolyte carries `remainingSeconds = null` and is retried here each tick.
 *
 * Delegation LOOPS: an assigned acolyte runs its action cycle after cycle — resolving one, paying for
 * and starting the next, catching up multiple cycles within one (possibly offline) delta — and stays
 * assigned until the player recalls it (or Katabasis clears the retinue). It is set-and-forget
 * automation, not a single errand. (Acolytes can instead be assigned to help run a Vitium Compositum
 * ceremony — a different path.) Events from acolyte resolutions are returned in the same shape as
 * player events.
 */
export function advanceAcolytes(
  state: GameState,
  deltaSeconds: number,
  rng: Rng,
): { state: GameState; events: OutcomeEvent[] } {
  if (deltaSeconds <= 0 || state.lifetime.acolytes.length === 0) {
    return { state, events: [] };
  }

  const events: OutcomeEvent[] = [];
  let working: GameState = state;

  for (let i = 0; i < working.lifetime.acolytes.length; i++) {
    const a = working.lifetime.acolytes[i]!;
    if (a.assignedAction === null) continue; // idle — nothing to run

    const eff = computeModifiers(working).acolyteEfficiencyMul;
    const r = advanceRunnerCycles(
      working,
      a.assignedAction,
      eff,
      a.remainingSeconds,
      deltaSeconds,
      rng,
      undefined, // acolytes roll their own tier (no forced outcome)
      // oneShot is left false: the channel loops cycle after cycle until the player recalls it.
    );
    working = r.state;
    for (const e of r.events) events.push(e);

    // The acolyte keeps its assignment and loops; `remaining` is the in-flight cycle (or null when
    // stalled on resources, retried next tick).
    const nextAcolytes = [...working.lifetime.acolytes];
    nextAcolytes[i] = { ...working.lifetime.acolytes[i]!, remainingSeconds: r.remaining };
    working = { ...working, lifetime: { ...working.lifetime, acolytes: nextAcolytes } };
  }

  return { state: working, events };
}
