/**
 * Vitium Compositum (03 §2.3) — multi-Sin themed TOGGLES. Each is gated behind two (or three)
 * Cardinal Sins at a minimum level, and while active it pays a per-second cost and contributes a
 * per-second effect bundle: gold income, influence income, reprobate generation, and conversion
 * biased toward 2–3 subtypes. A toggle that cannot pay its full per-second cost AUTO-DEACTIVATES
 * on the next tick (02 §3); there's no refund and no partial application.
 *
 * The base toggle economics — per-second gold/influence cost, gold/influence income, and standard
 * (optionally single-subtype-restricted) conversion — are wired here and tuned to the Vitium
 * Compositum sheet for the toggles that need only those mechanics: Outrage Cycle, Loan Shark Op,
 * Charity, and Gala. The remaining sheet toggles each hinge on a bespoke effect not yet in the
 * engine — population-proportional generation (Bacchanal), offline-gain scaling (Dolce Far Niente),
 * percentage-death (Enraging Broadcast), flat murder/suicide/generation-rate shifts (Ethnocentric
 * Revolt, Doom Gathering, No-babies Movement), and the four-Sin "subtype penalty" ceremonies
 * (Vegas, Crusade) — and land in dedicated effect slices; Panvitium's exponential retune rides with
 * its own slice on this foundation. Bacchanal and Panvitium below keep placeholder magnitudes until
 * those slices.
 *
 * Number convention: the four sheet-tuned toggles carry authoritative magnitudes; entries awaiting
 * their effect slice keep placeholders (shape authoritative, magnitudes not).
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
  /** Per-second conversion attempts (fed into the conversion pool / biasedSubtype). */
  readonly conversionPerSecond?: number;
  /** Per-subtype conversion bias; need not sum to 1 — renormalized at draw (02 §9). */
  readonly subtypeBias?: Partial<Record<ReprobateSubtype, number>>;
  /**
   * Flat additive contribution to the per-second reprobate GENERATION rate while active (folded
   * into the generation term alongside business/Compositum generation, before the generation
   * multiplier; the total is clamped at ≥ 0). Negative for ceremonies that suppress births
   * (No-babies Movement). Default 0.
   */
  readonly flatGenerationPerSecond?: number;
  /**
   * Flat additive increase to the BASE per-capita suicide rate while active (added to
   * `BASE_SUICIDE_RATE_PER_SECOND` before the ×population×mul, so it composes with the
   * Nihilist/Degenerate subtype penalties). Doom Gathering. Default 0.
   */
  readonly flatBaseSuicideRatePerSecond?: number;
  /**
   * Flat additive increase to the BASE per-Choleric murder rate while active (added to
   * `BASE_CHOLERIC_MURDER_RATE_PER_SECOND` before the ×cholerics×mul). Ethnocentric Revolt.
   * Default 0.
   */
  readonly flatBaseCholericMurderRatePerSecond?: number;
  /**
   * Population-proportional generation while active: adds `fraction × (sum of the listed subtype
   * counts)` unconverted reprobates per second to the generation term (Bacchanal — 10% of Gluttons
   * + Degenerates). Folded in alongside the other generation contributions, before the generation
   * multiplier. Default: none.
   */
  readonly populationGeneration?: {
    readonly fraction: number;
    readonly subtypes: readonly ReprobateSubtype[];
  };
  /**
   * Per-second fraction of the TOTAL reprobate population that dies while active (Enraging
   * Broadcast — "percentage death of total reprobates"). Routed through the suicide pool (random
   * subtype, one soul per death) but NOT scaled by the suicide-rate multiplier — it is a flat
   * percentage cull. Default 0.
   */
  readonly deathFractionPerSecond?: number;
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
    minLevel: 1,
    costPerSecond: { gold: 100, influence: 10 },
    // Sheet: "generates 10% of total gluttons + degenerates as unconverted reprobates per second."
    populationGeneration: { fraction: 0.1, subtypes: ['glutton', 'degenerate'] },
  },
  'loan-shark-op': {
    id: 'loan-shark-op',
    sins: ['avaritia', 'ira'],
    minLevel: 1,
    costPerSecond: { influence: 10 },
    goldPerSecond: 100,
    conversionPerSecond: 0.01,
    subtypeBias: { gambler: 0.5, choleric: 0.5 },
  },
  charity: {
    id: 'charity',
    sins: ['avaritia', 'vanagloria'],
    minLevel: 1,
    costPerSecond: { influence: 25 },
    goldPerSecond: 200,
    conversionPerSecond: 0.01,
    subtypeBias: { gambler: 0.5, celebrity: 0.5 },
  },
  gala: {
    id: 'gala',
    sins: ['superbia', 'vanagloria'],
    minLevel: 1,
    costPerSecond: { gold: 250 },
    influencePerSecond: 20,
    conversionPerSecond: 0.01,
    subtypeBias: { sigma: 0.5, celebrity: 0.5 },
  },
  'outrage-cycle': {
    id: 'outrage-cycle',
    sins: ['ira', 'vanagloria'],
    minLevel: 1,
    costPerSecond: { gold: 50, influence: 5 },
    conversionPerSecond: 0.01,
    // "Conversion only applies to Choleric" (sheet effect): the toggle themes Cholerics +
    // Celebrities, but its conversion is restricted to Choleric — representable directly as a
    // single-subtype bias on the standard conversion pool.
    subtypeBias: { choleric: 1 },
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
    // Sheet: "conversion rate instead applies as a flat increase to base Choleric murder rate."
    flatBaseCholericMurderRatePerSecond: 0.001,
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

/** Sum of flat additive increases to the BASE Choleric murder rate across active toggles. */
export function compositumFlatBaseCholericMurderRatePerSecond(state: GameState): number {
  let s = 0;
  for (const id of state.lifetime.activeToggles)
    s += compositumById(id)?.flatBaseCholericMurderRatePerSecond ?? 0;
  return s;
}

/** Population-proportional generation across active toggles: Σ fraction × Σ(subtype counts). */
export function compositumPopulationGenerationPerSecond(state: GameState): number {
  let s = 0;
  for (const id of state.lifetime.activeToggles) {
    const def = compositumById(id);
    if (!def?.populationGeneration) continue;
    let pop = 0;
    for (const t of def.populationGeneration.subtypes) pop += state.lifetime.reprobates[t];
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
