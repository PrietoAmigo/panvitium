/**
 * Vitium Compositum (03 §2.3) — multi-Sin themed TOGGLES. Each is gated behind two (or three)
 * Cardinal Sins at a minimum level, and while active it pays a per-second cost and contributes a
 * per-second effect bundle: gold income, influence income, reprobate generation, and conversion
 * biased toward 2–3 subtypes. A toggle that cannot pay its full per-second cost AUTO-DEACTIVATES
 * on the next tick (02 §3); there's no refund and no partial application.
 *
 * THIS SLICE wires the toggle infrastructure plus four representative two-Sin entries that
 * between them exercise every common effect type (gold cost, influence cost, gold income,
 * influence income, generation, multi-subtype conversion). The remaining catalog entries and the
 * exotic effects (offline-gain, Nihilist self-destruct, suicide/murder-rate shifts) land in
 * follow-ups; Panvitium — itself a Vitium Compositum with exponential duration-scaled cost — is
 * its own slice built on this foundation.
 *
 * Number convention: placeholders, structured for spreadsheet override. Shape authoritative,
 * magnitudes not.
 *
 * Active toggles are tracked by membership in `LifetimeState.activeToggles` (a string[] already
 * on the save schema). A VC is either on or off — no per-VC payload this slice, so no new
 * persisted state. Panvitium's duration tracking will add an additive-optional field when it lands.
 */
import { floor, gte, sub } from './bignum.js';
import { sinLevel } from './progression.js';
import {
  type GameState,
  type ReprobateSubtype,
  type Sin,
  type VitiumConversionSource,
} from './state.js';

export interface CompositumDef {
  readonly id: string;
  /** Cardinal Sins required, each at >= `minLevel`. */
  readonly sins: readonly Sin[];
  /** Minimum level required in EACH listed Sin (2 for two-Sin VCs, 3 for the apex three-Sin ones). */
  readonly minLevel: number;
  /** Per-second upkeep. A toggle auto-deactivates if it can't pay this in full (02 §3). */
  readonly costPerSecond: { readonly gold?: number; readonly influence?: number };
  /** Per-second gold income while active (added to base, scaled by goldRateMul at the tick). */
  readonly goldPerSecond?: number;
  /** Per-second influence income while active (subject to influenceRateMul, capped at maxInfluence). */
  readonly influencePerSecond?: number;
  /** Per-second reprobate generation contribution (fed into the generation pool). */
  readonly generationPerSecond?: number;
  /** Per-second conversion attempts (fed into the conversion pool / biasedSubtype). */
  readonly conversionPerSecond?: number;
  /** Per-subtype conversion bias; need not sum to 1 — renormalized at draw (02 §9). */
  readonly subtypeBias?: Partial<Record<ReprobateSubtype, number>>;
  /**
   * If true, the toggle cannot be turned off by hand — it ends only by auto-deactivation when it
   * can no longer pay upkeep (Panvitium, 03 §2.3). Default false (manually dispellable).
   */
  readonly manualDeactivateForbidden?: boolean;
  /**
   * If set, the per-second cost is multiplied by `costGrowthPerSecond ** secondsActive` — an
   * exponential ramp that makes sustained activation unaffordable (Panvitium). Duration is tracked
   * in `LifetimeState.toggleDurations`. Default: flat cost (no growth).
   */
  readonly costGrowthPerSecond?: number;
}

/** The wired subset of the Vitium Compositum catalog (03 §2.3). Keyed by id. */
export const COMPOSITA: Readonly<Record<string, CompositumDef>> = {
  bacchanal: {
    id: 'bacchanal',
    sins: ['gula', 'luxuria'],
    minLevel: 2,
    costPerSecond: { gold: 50 },
    generationPerSecond: 0.05,
    conversionPerSecond: 0.04,
    subtypeBias: { glutton: 0.5, degenerate: 0.5 },
  },
  'loan-shark-op': {
    id: 'loan-shark-op',
    sins: ['avaritia', 'ira'],
    minLevel: 2,
    costPerSecond: { influence: 20 },
    goldPerSecond: 8,
    conversionPerSecond: 0.04,
    subtypeBias: { gambler: 0.5, choleric: 0.5 },
  },
  charity: {
    id: 'charity',
    sins: ['avaritia', 'vanagloria'],
    minLevel: 2,
    costPerSecond: { influence: 30 },
    goldPerSecond: 15,
    conversionPerSecond: 0.04,
    subtypeBias: { gambler: 0.5, celebrity: 0.5 },
  },
  gala: {
    id: 'gala',
    sins: ['superbia', 'vanagloria'],
    minLevel: 2,
    costPerSecond: { gold: 100 },
    influencePerSecond: 5,
    conversionPerSecond: 0.04,
    subtypeBias: { sigma: 0.5, celebrity: 0.5 },
  },
  // The endgame ritual (03 §2.3). Gated on ALL eight Sins at level 3. Cannot be turned off by
  // hand; its cost ramps exponentially with active duration so it can't become a steady state —
  // "flipped on for a glorious, expensive minute or two." Enormous generation + conversion here,
  // with suicide/murder amplified via the modifier bundle (see modifiers.ts). Placeholders;
  // spreadsheet-overridable. Even subtype bias — Panvitium drives the whole population at once.
  panvitium: {
    id: 'panvitium',
    sins: ['gula', 'luxuria', 'avaritia', 'tristitia', 'ira', 'acedia', 'vanagloria', 'superbia'],
    minLevel: 3,
    costPerSecond: { gold: 10000, influence: 100 },
    generationPerSecond: 10,
    conversionPerSecond: 5,
    subtypeBias: {
      glutton: 1,
      degenerate: 1,
      gambler: 1,
      nihilist: 1,
      choleric: 1,
      husk: 1,
      celebrity: 1,
      sigma: 1,
    },
    manualDeactivateForbidden: true,
    costGrowthPerSecond: 1.03,
  },
} as const;

/** All wired Vitium Compositum ids in stable order. */
export const COMPOSITUM_IDS: readonly string[] = Object.freeze(Object.keys(COMPOSITA));

/** Lookup; undefined for unknown ids. */
export function compositumById(id: string): CompositumDef | undefined {
  return COMPOSITA[id];
}

/** Whether `vcId` is currently active. */
export function isToggleActive(state: GameState, vcId: string): boolean {
  return state.lifetime.activeToggles.includes(vcId);
}

/** Whether the player meets every Sin-level gate for `vcId`. */
export function compositumUnlocked(state: GameState, def: CompositumDef): boolean {
  for (const s of def.sins) {
    if (sinLevel(state.devotion[s]) < def.minLevel) return false;
  }
  return true;
}

export type ToggleResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Activate a Vitium Compositum toggle. Checks: known id, Sin-level gates met, not already active.
 * No up-front cost — the per-second upkeep is paid by the tick. Returns a failure otherwise.
 */
export function activateToggle(state: GameState, vcId: string): ToggleResult {
  const def = compositumById(vcId);
  if (!def) return { ok: false, reason: `unknown ceremony: ${vcId}` };
  if (isToggleActive(state, vcId)) return { ok: false, reason: 'already active' };
  if (!compositumUnlocked(state, def)) {
    const gate = def.sins.map((s) => `${s} ${def.minLevel}`).join(' + ');
    return { ok: false, reason: `requires ${gate}` };
  }
  return {
    ok: true,
    state: {
      ...state,
      lifetime: { ...state.lifetime, activeToggles: [...state.lifetime.activeToggles, vcId] },
    },
  };
}

/** Manually deactivate a toggle. Fails if it wasn't active, or if it forbids manual deactivation
 *  (Panvitium — it ends only by running out of upkeep). */
export function deactivateToggle(state: GameState, vcId: string): ToggleResult {
  if (!isToggleActive(state, vcId)) return { ok: false, reason: 'not active' };
  const def = compositumById(vcId);
  if (def?.manualDeactivateForbidden) {
    return {
      ok: false,
      reason: 'cannot be stopped by will \u2014 it ends when it can no longer be paid',
    };
  }
  return {
    ok: true,
    state: {
      ...state,
      lifetime: {
        ...state.lifetime,
        activeToggles: state.lifetime.activeToggles.filter((t) => t !== vcId),
      },
    },
  };
}

/**
 * Advance active toggles by `deltaSeconds`: deduct each one's per-second cost. A toggle that
 * cannot pay its FULL cost (gold AND influence) from current reserves auto-deactivates this tick
 * with no partial application and no refund (02 §3). Returns the new state and the list of ids
 * that deactivated, so the caller can surface a notice.
 *
 * Cost ramp: a toggle with `costGrowthPerSecond` (Panvitium) pays
 * `baseCost × growth ** secondsActive × deltaSeconds`, using its tracked duration BEFORE this
 * tick's increment. Durations live in `LifetimeState.toggleDurations`; survivors' durations grow
 * by `deltaSeconds`, deactivated ones are cleared. A non-finite cost (runaway exponential) counts
 * as unpayable, so Panvitium always ends rather than overflowing.
 *
 * Costs are deducted BEFORE income is applied in the tick, so a toggle never earns on a tick it
 * couldn't afford. Unknown ids in `activeToggles` (e.g. from a future-version save) are dropped.
 */
export function advanceToggles(
  state: GameState,
  deltaSeconds: number,
): { state: GameState; deactivated: string[] } {
  if (deltaSeconds <= 0 || state.lifetime.activeToggles.length === 0) {
    return { state, deactivated: [] };
  }

  let gold = state.lifetime.gold;
  let influence = state.lifetime.influence;
  const durations = { ...state.lifetime.toggleDurations };
  const stillActive: string[] = [];
  const deactivated: string[] = [];

  for (const vcId of state.lifetime.activeToggles) {
    const def = compositumById(vcId);
    if (!def) {
      // Unknown toggle id — drop it (don't carry it forward, don't bill it).
      deactivated.push(vcId);
      delete durations[vcId];
      continue;
    }
    const dur = durations[vcId] ?? 0;
    const growth = def.costGrowthPerSecond ? Math.pow(def.costGrowthPerSecond, dur) : 1;
    const goldCost = (def.costPerSecond.gold ?? 0) * growth * deltaSeconds;
    const inflCost = (def.costPerSecond.influence ?? 0) * growth * deltaSeconds;
    const canPay =
      Number.isFinite(goldCost) &&
      Number.isFinite(inflCost) &&
      gte(floor(gold), Math.ceil(goldCost)) &&
      gte(floor(influence), Math.ceil(inflCost));
    if (!canPay) {
      deactivated.push(vcId);
      delete durations[vcId];
      continue;
    }
    if (goldCost > 0) gold = sub(gold, goldCost);
    if (inflCost > 0) influence = sub(influence, inflCost);
    durations[vcId] = dur + deltaSeconds;
    stillActive.push(vcId);
  }

  if (deactivated.length === 0) {
    // Everyone paid; resource totals and durations changed, active set unchanged.
    return {
      state: {
        ...state,
        lifetime: { ...state.lifetime, gold, influence, toggleDurations: durations },
      },
      deactivated,
    };
  }
  return {
    state: {
      ...state,
      lifetime: {
        ...state.lifetime,
        gold,
        influence,
        activeToggles: stillActive,
        toggleDurations: durations,
      },
    },
    deactivated,
  };
}

// ── Aggregate effect helpers (consumed by tick / dynamics) ─────────────────────

/** Sum of `goldPerSecond` across active toggles. */
export function compositumGoldPerSecond(state: GameState): number {
  let s = 0;
  for (const id of state.lifetime.activeToggles) s += compositumById(id)?.goldPerSecond ?? 0;
  return s;
}

/** Sum of `influencePerSecond` across active toggles. */
export function compositumInfluencePerSecond(state: GameState): number {
  let s = 0;
  for (const id of state.lifetime.activeToggles) s += compositumById(id)?.influencePerSecond ?? 0;
  return s;
}

/** Sum of `generationPerSecond` across active toggles. */
export function compositumGenerationPerSecond(state: GameState): number {
  let s = 0;
  for (const id of state.lifetime.activeToggles) s += compositumById(id)?.generationPerSecond ?? 0;
  return s;
}

/** Sum of `conversionPerSecond` across active toggles. */
export function compositumConversionPerSecond(state: GameState): number {
  let s = 0;
  for (const id of state.lifetime.activeToggles) s += compositumById(id)?.conversionPerSecond ?? 0;
  return s;
}

/** Active toggles as Vitium conversion sources (for biasedSubtype / the conversion pool). */
export function compositumConversionSources(state: GameState): VitiumConversionSource[] {
  const out: VitiumConversionSource[] = [];
  for (const id of state.lifetime.activeToggles) {
    const def = compositumById(id);
    if (!def || !def.conversionPerSecond || !def.subtypeBias) continue;
    out.push({ conversionPerSecond: def.conversionPerSecond, subtypeBias: def.subtypeBias });
  }
  return out;
}
