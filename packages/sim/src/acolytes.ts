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
 * This slice supports delegation of **Indagatio only**. Suasio / Decimatio (cost-outcome mode)
 * need per-cycle cost payment and fractional-outcome semantics — they land in a follow-up. The
 * `isDelegatable` predicate is the gate.
 */
import { ACTIONS, resolveAction } from './actions.js';
import { computeModifiers, type Modifiers } from './modifiers.js';
import { mul } from './bignum.js';
import { BASE_MAX_INFLUENCE } from './constants.js';
import { type Rng } from './rng.js';
import type { Acolyte, GameState } from './state.js';
import type { OutcomeEvent } from './events.js';

/**
 * Maximum acolytes given the current state, using the EFFECTIVE max influence (post-modifier).
 * `max(1, 1 + floor(log10(effectiveMax / BASE_MAX_INFLUENCE)))` per 02 §10. Single acolyte at
 * base; +1 per 10× of effective cap. Always at least 1 (the player has someone).
 */
export function maxAcolytes(state: GameState, mods: Modifiers = computeModifiers(state)): number {
  const effective = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul).toNumber();
  if (effective <= 0) return 1;
  const ratio = effective / BASE_MAX_INFLUENCE;
  return Math.max(1, 1 + Math.floor(Math.log10(Math.max(ratio, 1))));
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

/** Which actions can currently be delegated to acolytes (this slice: Indagatio only). */
export function isDelegatable(actionId: string): boolean {
  return actionId === 'indagatio';
}

export type AssignmentResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Assign ONE idle acolyte (the lowest-id idle one) to `actionId`. Sets the acolyte's
 * `assignedAction` and initialises `remainingSeconds` to the action's duration scaled by the
 * acolyte's efficiency (time-mode: longer than the player's at 33%). The acolyte begins
 * ticking the next time the tick runs. Returns a failure if no acolyte is idle or the action
 * isn't delegatable.
 */
export function assignAcolyteToAction(state: GameState, actionId: string): AssignmentResult {
  if (!isDelegatable(actionId)) {
    return { ok: false, reason: `${actionId} cannot be delegated yet` };
  }
  const def = ACTIONS[actionId];
  if (!def) return { ok: false, reason: `unknown action: ${actionId}` };

  const acolytes = state.lifetime.acolytes;
  const idx = acolytes.findIndex((a) => a.assignedAction === null);
  if (idx === -1) return { ok: false, reason: 'no idle acolyte available' };

  const mods = computeModifiers(state);
  const duration = startDurationFor(def.efficiencyMode, def.baseTimeSeconds, mods);

  const updated: Acolyte = {
    ...acolytes[idx]!,
    assignedAction: actionId,
    remainingSeconds: duration,
  };
  const next = [...acolytes];
  next[idx] = updated;
  return { ok: true, state: { ...state, lifetime: { ...state.lifetime, acolytes: next } } };
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
 * Advance every assigned acolyte's timer by `deltaSeconds`. Each timer that reaches 0 resolves
 * its action and immediately starts the next cycle. The resolver uses the acolyte's efficiency
 * for cost/outcome (cost-outcome mode) or just runs the resolution (time mode). Events from
 * acolyte resolutions are returned in the same shape as player events.
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
    if (a.assignedAction === null || a.remainingSeconds === null) continue;
    const def = ACTIONS[a.assignedAction];
    if (!def) continue;

    let remaining = a.remainingSeconds - deltaSeconds;

    // The acolyte may complete one or more cycles within a single delta (offline catch-up).
    // Each completion: resolve at acolyte efficiency, then start the next cycle's duration.
    while (remaining <= 0) {
      const mods = computeModifiers(working);
      const eff = mods.acolyteEfficiencyMul;
      const { state: afterResolve, event } = resolveAction(working, a.assignedAction, rng, {
        efficiency: eff,
      });
      working = afterResolve;
      if (event) events.push(event);

      // Re-assert that the acolyte is still ours after resolveAction (it doesn't touch acolytes
      // today, but defensively re-fetch to absorb any future cross-effects).
      const refreshed = working.lifetime.acolytes[i];
      if (!refreshed || refreshed.assignedAction === null) break;

      // Next cycle: re-derive duration from the current modifier bundle (efficiency may shift
      // mid-loop if a source attaches in the future).
      const nextDuration = startDurationFor(
        def.efficiencyMode,
        def.baseTimeSeconds,
        computeModifiers(working),
      );
      remaining += nextDuration;
    }

    // Write the updated timer back to the acolyte; preserve assignment.
    const updated: Acolyte = {
      ...working.lifetime.acolytes[i]!,
      remainingSeconds: remaining,
    };
    const nextAcolytes = [...working.lifetime.acolytes];
    nextAcolytes[i] = updated;
    working = {
      ...working,
      lifetime: { ...working.lifetime, acolytes: nextAcolytes },
    };
  }

  return { state: working, events };
}

/**
 * Duration of a fresh acolyte cycle, given the action's efficiency mode. Time-mode actions
 * (Indagatio/Emptio) have their duration divided by efficiency at start time — so a 0.33-eff
 * acolyte's Indagatio cycle is ~3× longer than the player's. Cost-outcome mode (Suasio/Decimatio)
 * doesn't touch duration here — the catalog `baseTimeSeconds` is used as-is.
 */
function startDurationFor(
  mode: 'time' | 'cost-outcome',
  baseSeconds: number,
  mods: Modifiers,
): number {
  const eff = Math.max(mods.acolyteEfficiencyMul, 1e-9);
  return mode === 'time' ? Math.max(1, baseSeconds / eff) : baseSeconds;
}
