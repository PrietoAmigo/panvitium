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
import { PANVITIUM_RATE_BASE } from './constants.js';
import { sinLevel } from './progression.js';
import { type GameState, type Sin, totalReprobates } from './state.js';

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
   * Flat additive contribution to the per-second reprobate GENERATION rate while active (folded
   * into the generation term alongside business/Compositum generation, before the generation
   * multiplier; the total is clamped at ≥ 0). Negative for ceremonies that suppress births
   * (No-babies Movement). Default 0.
   */
  readonly flatGenerationPerSecond?: number;
  /**
   * Flat additive increase to the BASE per-capita suicide rate while active (added to
   * `BASE_SUICIDE_RATE_PER_SECOND` before the ×population×mul). Doom Gathering. Default 0.
   */
  readonly flatBaseSuicideRatePerSecond?: number;
  /**
   * Flat additive increase to the BASE per-capita murder rate while active (added to
   * `BASE_MURDER_RATE_PER_SECOND` before the ×population×mul). Ethnocentric Revolt. Default 0.
   */
  readonly flatBaseMurderRatePerSecond?: number;
  /**
   * Population-proportional generation while active: adds `fraction × total reprobate population`
   * reprobates per second to the generation term (Bacchanal — 10% of the population). Folded in
   * alongside the other generation contributions, before the generation multiplier. Default: none.
   */
  readonly populationGeneration?: {
    readonly fraction: number;
  };
  /**
   * Per-second fraction of the TOTAL reprobate population that dies while active (Enraging
   * Broadcast — "percentage death of total reprobates"). Routed through the suicide pool (one soul
   * per death) but NOT scaled by the suicide-rate multiplier — it is a flat percentage cull.
   * Default 0.
   */
  readonly deathFractionPerSecond?: number;
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
}

/** The wired subset of the Vitium Compositum catalog (03 §2.3). Keyed by id. */
export const COMPOSITA: Readonly<Record<string, CompositumDef>> = {
  bacchanal: {
    id: 'bacchanal',
    sins: ['gula', 'luxuria'],
    minLevel: 1,
    costPerSecond: { gold: 100, influence: 10 },
    // Generates 10% of the total reprobate population as new reprobates per second.
    populationGeneration: { fraction: 0.1 },
  },
  'loan-shark-op': {
    id: 'loan-shark-op',
    sins: ['avaritia', 'ira'],
    minLevel: 1,
    costPerSecond: { influence: 10 },
    goldPerSecond: 100,
    // Conversion effect removed with subtypes; kept as a gold-income toggle pending Slice 3 rework.
  },
  charity: {
    id: 'charity',
    sins: ['avaritia', 'vanagloria'],
    minLevel: 1,
    costPerSecond: { influence: 25 },
    goldPerSecond: 200,
    // Conversion effect removed with subtypes; kept as a gold-income toggle pending Slice 3 rework.
  },
  gala: {
    id: 'gala',
    sins: ['superbia', 'vanagloria'],
    minLevel: 1,
    costPerSecond: { gold: 250 },
    influencePerSecond: 20,
    // Conversion effect removed with subtypes; kept as an influence-income toggle pending Slice 3.
  },
  'outrage-cycle': {
    id: 'outrage-cycle',
    sins: ['ira', 'vanagloria'],
    minLevel: 1,
    costPerSecond: { gold: 50, influence: 5 },
    // Conversion-only effect removed with subtypes; no income to fall back on. EFFECTLESS STUB —
    // flagged for redesign in the Vitium Compositum rework (Slice 3).
  },
  'no-babies-movement': {
    id: 'no-babies-movement',
    sins: ['luxuria', 'acedia'],
    minLevel: 1,
    costPerSecond: {},
    goldPerSecond: 100,
    influencePerSecond: 10,
    // Sheet: "conversion rate instead applies as a flat decrease to unconverted reprobate generation."
    flatGenerationPerSecond: -0.01,
  },
  'doom-gathering': {
    id: 'doom-gathering',
    sins: ['tristitia', 'acedia'],
    minLevel: 1,
    costPerSecond: { gold: 100, influence: 10 },
    // Sheet: "conversion rate instead applies as a flat increase to base reprobate suicide rate."
    flatBaseSuicideRatePerSecond: 0.001,
  },
  'ethnocentric-revolt': {
    id: 'ethnocentric-revolt',
    sins: ['superbia', 'ira'],
    minLevel: 1,
    costPerSecond: { gold: 100, influence: 10 },
    // Flat increase to the base reprobate murder rate while active.
    flatBaseMurderRatePerSecond: 0.001,
  },
  'enraging-broadcast': {
    id: 'enraging-broadcast',
    sins: ['ira', 'tristitia'],
    minLevel: 1,
    costPerSecond: { influence: 25 },
    // Sheet: "conversion rate instead applies as percentage death of total reprobates" — 0.1% of
    // the whole population self-destructs each second, taking random reprobates with them.
    deathFractionPerSecond: 0.001,
  },
  'dolce-far-niente': {
    id: 'dolce-far-niente',
    sins: ['gula', 'acedia'],
    minLevel: 1,
    costPerSecond: {},
    // Sheet: "the conversion rate instead applies to offline gain rate" — +1% offline gain while active.
    offlineGainBoost: 0.01,
  },
  vegas: {
    id: 'vegas',
    sins: ['luxuria', 'avaritia', 'gula', 'acedia'],
    minLevel: 2,
    costPerSecond: { gold: 1000 },
    influencePerSecond: 100,
    // Subtype-penalty effect removed with subtypes; kept as an influence-income toggle (Slice 3).
  },
  crusade: {
    id: 'crusade',
    sins: ['superbia', 'ira', 'vanagloria', 'tristitia'],
    minLevel: 2,
    costPerSecond: { influence: 100 },
    goldPerSecond: 1000,
    // Subtype-penalty effect removed with subtypes; kept as a gold-income toggle (Slice 3).
  },
  // The endgame ritual (03 §2.3). Gated on ALL eight Sins at level 3. Cannot be turned off by
  // hand; its cost ramps exponentially with active duration so it can't become a steady state —
  // "flipped on for a glorious, expensive minute or two." With conversion removed, R(t) = 0.01·eᵗ
  // still drives the soul harvest (∝ current souls, in the tick) and a flat generation increase
  // (in dynamics); suicide/murder are amplified via the modifier bundle (see modifiers.ts).
  panvitium: {
    id: 'panvitium',
    sins: ['gula', 'luxuria', 'avaritia', 'tristitia', 'ira', 'acedia', 'vanagloria', 'superbia'],
    minLevel: 3,
    // Sheet: gold 10×(Base VC gold cost 100)=1000, influence 10×(Base VC influence cost 10)=100,
    // each × eᵗ; rate base 1×(Base VC rate 0.01)=0.01 × eᵗ. t = seconds active.
    costPerSecond: { gold: 1000, influence: 100 },
    panvitiumRateBase: PANVITIUM_RATE_BASE,
    manualDeactivateForbidden: true,
    costGrowthPerSecond: Math.E,
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

/** Sum of `flatGenerationPerSecond` across active toggles (may be negative; caller clamps total). */
export function compositumFlatGenerationPerSecond(state: GameState): number {
  let s = 0;
  for (const id of state.lifetime.activeToggles)
    s += compositumById(id)?.flatGenerationPerSecond ?? 0;
  return s;
}

/** Sum of flat additive increases to the BASE suicide rate across active toggles. */
export function compositumFlatBaseSuicideRatePerSecond(state: GameState): number {
  let s = 0;
  for (const id of state.lifetime.activeToggles)
    s += compositumById(id)?.flatBaseSuicideRatePerSecond ?? 0;
  return s;
}

/** Sum of flat additive increases to the BASE murder rate across active toggles. */
export function compositumFlatBaseMurderRatePerSecond(state: GameState): number {
  let s = 0;
  for (const id of state.lifetime.activeToggles)
    s += compositumById(id)?.flatBaseMurderRatePerSecond ?? 0;
  return s;
}

/** Population-proportional generation across active toggles: Σ fraction × total population. */
export function compositumPopulationGenerationPerSecond(state: GameState): number {
  let s = 0;
  const pop = totalReprobates(state);
  for (const id of state.lifetime.activeToggles) {
    const def = compositumById(id);
    if (!def?.populationGeneration) continue;
    s += def.populationGeneration.fraction * pop;
  }
  return s;
}

/** Sum of per-second total-population death fractions across active toggles (Enraging Broadcast). */
export function compositumDeathFractionPerSecond(state: GameState): number {
  let s = 0;
  for (const id of state.lifetime.activeToggles)
    s += compositumById(id)?.deathFractionPerSecond ?? 0;
  return s;
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
