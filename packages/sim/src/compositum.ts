/**
 * Vitium Compositum (03 §2.3) — the toggle engine, now serving PANVITIUM ALONE. The eight lesser
 * ceremonies were retired (ADR-031): their income, rate-boost, and percentage-of-income machinery
 * (ADR-027) went with them, and old saves carrying a retired id self-heal on the first tick
 * (`advanceToggles`' unknown-id path drops it, unbilled). What remains is the shape Panvitium
 * needs: a Sin-gated toggle with a per-second cost, an exponential cost ramp tracked in
 * `toggleDurations`, the Foedus upkeep discount, and auto-deactivation the moment the full cost
 * cannot be paid (02 §3) — there is no refund and no partial application.
 *
 * Active toggles are tracked by membership in `LifetimeState.activeToggles`. A toggle is either
 * on or off — no per-toggle payload. Panvitium's duration is tracked in `toggleDurations`.
 */
import { floor, gte, sub } from './bignum.js';
import { foedusTier, foedusUpkeepMul } from './faeneratio.js';
import { sinLevel } from './progression.js';
import { type GameState, type Sin } from './state.js';
// The ceremony catalog lives in `compositum.data.ts` (the editable economy knobs); imported for the
// engine here and re-exported so `import { COMPOSITA } from './compositum.js'` keeps working.
import { COMPOSITA } from './compositum.data.js';
export { COMPOSITA };

export interface CompositumDef {
  readonly id: string;
  /** Cardinal Sins required, each at >= `minLevel`. */
  readonly sins: readonly Sin[];
  /** Minimum level required in EACH listed Sin (sheet "Min sin lvl": 3 for Panvitium). */
  readonly minLevel: number;
  /** Per-second upkeep. A toggle auto-deactivates if it can't pay this in full (02 §3). */
  readonly costPerSecond: { readonly gold?: number; readonly influence?: number };
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
  /**
   * Panvitium only: the rate base R₀ for its surviving coupled effects. R(t) = R₀ ×
   * `costGrowthPerSecond ** secondsActive` (the same eᵗ ramp as the cost) drives the soul harvest
   * (∝ current souls, in the tick) and a flat reprobate-generation increase (in dynamics). Default:
   * none (no Panvitium rate).
   */
  readonly panvitiumRateBase?: number;
  /**
   * Foedus opt-out: when true, this ceremony forms NO Foedus with the hoard — no upkeep discount
   * (the revenue side retired with the Mercatūs; Depraedatio gold rework §4.4). A per-VC tuning
   * flag mirrored from the spreadsheet; default absent (all-on).
   */
  readonly foedusOptOut?: boolean;
}

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
    const foedusMul = compositumFoedusUpkeepMul(state, def);
    const goldCost = (def.costPerSecond.gold ?? 0) * growth * foedusMul * deltaSeconds;
    const inflCost = (def.costPerSecond.influence ?? 0) * growth * foedusMul * deltaSeconds;
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

/**
 * Foedus upkeep discount (Depraedatio gold rework §4.4): the pact between the hoard and the
 * rituals multiplies a ceremony's per-second cost by `1 − 0.125 × tier` (tier 4 → ×0.5) — one
 * GLOBAL tier for all ceremonies, stepped per decade of hoard above T0 (the per-Sin member
 * dependency retired with the Mercatūs). Applied to the COMPUTED per-second cost in
 * `advanceToggles`, so ramped upkeeps (Panvitium's eᵗ) take the same multiplier — the intended
 * late-game payoff is that a fat vault discounts the exponential ramp itself. An opted-out
 * ceremony (`foedusOptOut`) always pays full price.
 */
export function compositumFoedusUpkeepMul(state: GameState, def: CompositumDef): number {
  if (def.foedusOptOut === true) return 1;
  return foedusUpkeepMul(foedusTier(state));
}

/**
 * Panvitium's instantaneous rate R(t) = R₀·eᵗ (0 if inactive), where the eᵗ ramp shares Panvitium's
 * cost growth base and t is its tracked active duration. With conversion removed, this single rate
 * now feeds two coupled effects: the soul harvest (× current souls, in the tick) and a flat
 * reprobate-generation increase (in dynamics).
 */
export function panvitiumRate(state: GameState): number {
  if (!state.lifetime.activeToggles.includes('panvitium')) return 0;
  const def = COMPOSITA.panvitium!;
  const base = def.panvitiumRateBase ?? 0;
  const growth = def.costGrowthPerSecond ?? 1;
  const dur = state.lifetime.toggleDurations[def.id] ?? 0;
  return base * Math.pow(growth, dur);
}
