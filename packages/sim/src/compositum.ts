/**
 * Vitium Compositum (03 §2.3) — multi-Sin themed TOGGLES. Each is gated behind two (or three)
 * Cardinal Sins at a minimum level, and while active it pays a per-second cost and contributes a
 * per-second effect bundle: gold income, influence income, and reprobate-rate shifts. A toggle that
 * cannot pay its full per-second cost AUTO-DEACTIVATES on the next tick (02 §3); there's no refund
 * and no partial application.
 *
 * NOTE: the conversion + subtype-bias mechanic was removed. Ceremonies whose ONLY effect was biased
 * conversion (Loan Shark Op, Charity, Gala) now keep their gold/influence income; ceremonies whose
 * effect was a subtype-penalty increase (Vegas, Crusade) keep their income too; Outrage Cycle —
 * which had no income, only conversion — is left as an income-less stub. All three of these are
 * flagged for redesign in the Vitium Compositum rework (Slice 3). The flat-rate ceremonies
 * (No-babies Movement, Doom Gathering, Ethnocentric Revolt, Enraging Broadcast, Dolce Far Niente)
 * and Bacchanal's population-proportional generation are unaffected in shape.
 *
 * Active toggles are tracked by membership in `LifetimeState.activeToggles`. A VC is either on or
 * off — no per-VC payload. Panvitium's duration is tracked in `toggleDurations`.
 */
import { floor, gte, sub } from './bignum.js';
import { foedusTier, foedusUpkeepMul } from './mercatus.js';
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
  /** Minimum level required in EACH listed Sin (sheet "Min sin lvl": 1 for two-Sin toggles, 2 for the four-Sin ones, 3 for Panvitium). */
  readonly minLevel: number;
  /** Per-second upkeep. A toggle auto-deactivates if it can't pay this in full (02 §3). */
  readonly costPerSecond: { readonly gold?: number; readonly influence?: number };
  /** Per-second gold income while active (added to base, scaled by goldRateMul at the tick). */
  readonly goldPerSecond?: number;
  /** Per-second influence income while active (subject to influenceRateMul, capped at maxInfluence). */
  readonly influencePerSecond?: number;
  /** Per-second reprobate generation contribution (fed into the generation pool). */
  readonly generationPerSecond?: number;
  /**
   * Multiplicative boost to the reprobate generation rate while active: the rate takes
   * ×(1 + boost) (Bacchanal — "+10% online reprobate generation"). Folded into the modifier
   * bundle's generation multiplier. Default 0.
   */
  readonly generationRateBoost?: number;
  /**
   * Multiplicative boost to the suicide-rate multiplier while active: ×(1 + boost)
   * (Doom Gathering — "+10% suicide rate"). Folded into `reprobateSuicideRateMul`. Default 0.
   */
  readonly suicideRateBoost?: number;
  /**
   * Multiplicative boost to the murder-rate multiplier while active: ×(1 + boost)
   * (Enraging Broadcast — "+10% murder rate"). Folded into `murderRateMul`. Default 0.
   */
  readonly murderRateBoost?: number;
  /**
   * Percentage-of-income upkeep (sheet rev 2026-06-12): each second the ceremony costs
   * `fraction × the current base gain rate` of the SAME resource the base measures — Vegas pays
   * 50% of the gold income in gold, Crusade 50% of the influence income in influence. The base
   * rates are computed by the tick WITHOUT any percentage-VC outputs (so the two can never feed
   * each other) and passed into `advanceToggles`. Composes with the Foedus upkeep discount and
   * (hypothetically) the eᵗ ramp like any flat cost. Default: none.
   */
  readonly percentCost?: {
    readonly base: 'goldGain' | 'influenceGain';
    readonly fraction: number;
  };
  /**
   * Percentage-of-income output (sheet rev 2026-06-12): while active, the ceremony yields
   * `fraction × the current base gain rate` per second AS the named resource — Vegas turns 1% of
   * the gold income into influence; Crusade turns 1000% (×10) of the influence income into gold.
   * Added to the income lines alongside the flat VC outputs (same `vitiumCompositumOutputMul`
   * and rate multipliers). Default: none.
   */
  readonly percentOutput?: {
    readonly base: 'goldGain' | 'influenceGain';
    readonly resource: 'gold' | 'influence';
    readonly fraction: number;
  };
  /**
   * While active, multiplies the offline-gain rate by `(1 + offlineGainBoost)` (Dolce Far Niente).
   * Folded into `offlineTimeMul`. Default 0.
   */
  readonly offlineGainBoost?: number;
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
   * Foedus opt-out (spec §2): when true, this ceremony forms NO Foedus with its member Sins'
   * Mercatūs — no upkeep discount, no revenue bonus. A per-VC tuning flag mirrored from the
   * spreadsheet; default absent (all-on).
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
/**
 * The base gain rates the percentage-VC semantics measure against (sheet rev 2026-06-12): the
 * tick computes these WITHOUT any percentage-VC outputs — Vegas and Crusade can never feed each
 * other — and passes them here for upkeep and into the income lines for output.
 */
export interface GainRates {
  readonly goldGainPerSecond: number;
  readonly influenceGainPerSecond: number;
}

const ZERO_GAIN_RATES: GainRates = { goldGainPerSecond: 0, influenceGainPerSecond: 0 };

function percentCostPerSecond(
  def: CompositumDef,
  rates: GainRates,
): { gold: number; influence: number } {
  if (!def.percentCost) return { gold: 0, influence: 0 };
  const base =
    def.percentCost.base === 'goldGain' ? rates.goldGainPerSecond : rates.influenceGainPerSecond;
  const amount = Math.max(0, base) * def.percentCost.fraction;
  // The cost is paid in the same currency the base measures (Vegas: gold; Crusade: influence).
  return def.percentCost.base === 'goldGain'
    ? { gold: amount, influence: 0 }
    : { gold: 0, influence: amount };
}

function percentOutputPerSecond(
  state: GameState,
  rates: GainRates,
  resource: 'gold' | 'influence',
): number {
  let sum = 0;
  for (const id of state.lifetime.activeToggles) {
    const def = COMPOSITA[id];
    if (!def?.percentOutput || def.percentOutput.resource !== resource) continue;
    const base =
      def.percentOutput.base === 'goldGain'
        ? rates.goldGainPerSecond
        : rates.influenceGainPerSecond;
    sum += Math.max(0, base) * def.percentOutput.fraction;
  }
  return sum;
}

/** Σ percentage-VC gold output/s over active toggles (Crusade), given the base gain rates. */
export function compositumPercentGoldPerSecond(state: GameState, rates: GainRates): number {
  return percentOutputPerSecond(state, rates, 'gold');
}

/** Σ percentage-VC influence output/s over active toggles (Vegas), given the base gain rates. */
export function compositumPercentInfluencePerSecond(state: GameState, rates: GainRates): number {
  return percentOutputPerSecond(state, rates, 'influence');
}

export function advanceToggles(
  state: GameState,
  deltaSeconds: number,
  rates: GainRates = ZERO_GAIN_RATES,
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
    const pct = percentCostPerSecond(def, rates);
    const goldCost = ((def.costPerSecond.gold ?? 0) + pct.gold) * growth * foedusMul * deltaSeconds;
    const inflCost =
      ((def.costPerSecond.influence ?? 0) + pct.influence) * growth * foedusMul * deltaSeconds;
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
 * Foedus upkeep discount (spec §2): the ceremony's Foedus with its member Sins' Mercatūs
 * multiplies its per-second cost by `1 − 0.125 × tier` (tier 4 → ×0.5). Applied to the COMPUTED
 * per-second cost in `advanceToggles`, so ramped upkeeps (Panvitium's eᵗ) take the same
 * multiplier — the intended late-game payoff is that a deep all-eight Foedus discounts the
 * exponential ramp itself. An opted-out ceremony (`foedusOptOut`) always pays full price.
 */
export function compositumFoedusUpkeepMul(state: GameState, def: CompositumDef): number {
  if (def.foedusOptOut === true) return 1;
  return foedusUpkeepMul(foedusTier(state, def.sins));
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

/**
 * Π(1 + generationRateBoost × effectMul) over active toggles (Bacchanal) — folds into the
 * generation mul. `effectMul` is the Gusion #11 / Naberius #24 ceremony-EFFECT channel (sheet rev
 * 2026-06-12); it scales the boost magnitudes, never the gold/influence outputs.
 */
export function compositumGenerationRateMul(state: GameState, effectMul = 1): number {
  let mul = 1;
  for (const id of state.lifetime.activeToggles) {
    const def = COMPOSITA[id];
    if (def?.generationRateBoost) mul *= 1 + def.generationRateBoost * effectMul;
  }
  return mul;
}

/** Π(1 + suicideRateBoost × effectMul) over active toggles (Doom Gathering). */
export function compositumSuicideRateMul(state: GameState, effectMul = 1): number {
  let mul = 1;
  for (const id of state.lifetime.activeToggles) {
    const def = COMPOSITA[id];
    if (def?.suicideRateBoost) mul *= 1 + def.suicideRateBoost * effectMul;
  }
  return mul;
}

/** Π(1 + murderRateBoost × effectMul) over active toggles (Enraging Broadcast). */
export function compositumMurderRateMul(state: GameState, effectMul = 1): number {
  let mul = 1;
  for (const id of state.lifetime.activeToggles) {
    const def = COMPOSITA[id];
    if (def?.murderRateBoost) mul *= 1 + def.murderRateBoost * effectMul;
  }
  return mul;
}

/** Sum of offline-gain boosts across active toggles (Dolce Far Niente). */
export function compositumOfflineGainBoost(state: GameState): number {
  let s = 0;
  for (const id of state.lifetime.activeToggles) s += compositumById(id)?.offlineGainBoost ?? 0;
  return s;
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
