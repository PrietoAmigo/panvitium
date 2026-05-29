/**
 * *Vitium Mercatura* catalog (03 §2.3). Each business is a sin-themed entity that produces gold
 * passively, generates reprobates passively, and biases new conversions toward its matching
 * subtype. This module owns the per-business static data; the dynamic state (counts owned,
 * in-flight builds) lives on `LifetimeState`.
 *
 * The full catalog is the eight Sins × four tiers (32 businesses). Per-tier numbers are pinned to
 * the `Vitium Mercatura` sheet:
 *
 *   tier 1 — cost 500 (Gula) / 100 (others), 60 s,      1 gold/s,      0.05 gen/s, 0.001 conv/s
 *   tier 2 — cost 25,000,                     1,800 s,   22 gold/s,     1 gen/s,    0.025 conv/s
 *   tier 3 — cost 500,000,                    36,000 s,  450 gold/s,    125 gen/s,  0.2 conv/s
 *   tier 4 — cost 100,000,000,                500,000 s, 10,000 gold/s, 500 gen/s,  1 conv/s
 *
 * The tier number doubles as the Sin-level gate: a tier unlocks at Sin level `tier − 1` (the
 * sheet's "Sin-lvl unlock" column), enforced in `startBuild`.
 *
 * Subtype bias rules (per the user's correction). The subtype of each *generated* / *converted*
 * reprobate is picked from the active-business count × subtype-bias weighting (`biasedSubtype` in
 * dynamics). Per-business `subtypeBias` defines the per-business probability of each subtype on
 * conversion; weights are aggregated then renormalized at draw time (02 §9). Each business is
 * heavily biased toward its matching subtype with a small leakage to `'reprobate'` (unconverted).
 */
import { SINS, SUBTYPE_OF_SIN, type Sin, type ReprobateSubtype } from './state.js';

/** Business tier; also the Sin-level gate (a tier unlocks at Sin level `tier − 1`). */
export type BusinessTier = 1 | 2 | 3 | 4;

/** Static catalog entry for one business id. Multiple instances can be owned (stacked). */
export interface BusinessDef {
  readonly id: string;
  readonly sin: Sin;
  /** Tier 1..4. Doubles as the Sin-level gate (`startBuild` requires Sin level `level − 1`). */
  readonly level: BusinessTier;
  /** Cost (gold) to start a build. Paid up-front. */
  readonly buildCost: number;
  /** How long the build takes from start to completion (seconds). */
  readonly buildTimeSeconds: number;
  /** Gold per second this business produces while owned. */
  readonly goldPerSecond: number;
  /** Reprobate births per second this business contributes (fed into the generation pool). */
  readonly reprobateGenPerSecond: number;
  /**
   * Conversion attempts per second this business contributes (fed into the conversion pool).
   * Each attempt may convert one unconverted reprobate to a subtype picked by `biasedSubtype`.
   */
  readonly conversionPerSecond: number;
  /** Per-business subtype bias on conversion. Need not sum to 1 — caller renormalizes. */
  readonly subtypeBias: Partial<Record<ReprobateSubtype, number>>;
}

/** Per-tier numbers shared across all eight Sins (Vitium Mercatura sheet). */
interface TierSpec {
  readonly buildTimeSeconds: number;
  readonly goldPerSecond: number;
  readonly reprobateGenPerSecond: number;
  readonly conversionPerSecond: number;
}

const TIER_SPECS: Record<BusinessTier, TierSpec> = {
  1: {
    buildTimeSeconds: 60,
    goldPerSecond: 1,
    reprobateGenPerSecond: 0.05,
    conversionPerSecond: 0.001,
  },
  2: {
    buildTimeSeconds: 1800,
    goldPerSecond: 22,
    reprobateGenPerSecond: 1,
    conversionPerSecond: 0.025,
  },
  3: {
    buildTimeSeconds: 36000,
    goldPerSecond: 450,
    reprobateGenPerSecond: 125,
    conversionPerSecond: 0.2,
  },
  4: {
    buildTimeSeconds: 500000,
    goldPerSecond: 10000,
    reprobateGenPerSecond: 500,
    conversionPerSecond: 1,
  },
};

/** Build cost per tier. Tier 1 is the only sin-specific cost (Gula 500, all others 100). */
function buildCostFor(sin: Sin, tier: BusinessTier): number {
  switch (tier) {
    case 1:
      return sin === 'gula' ? 500 : 100;
    case 2:
      return 25_000;
    case 3:
      return 500_000;
    case 4:
      return 100_000_000;
  }
}

/** Build the 32-entry catalog (eight Sins × four tiers) in sin-major / tier order. */
function buildCatalog(): Record<string, BusinessDef> {
  const out: Record<string, BusinessDef> = {};
  for (const sin of SINS) {
    const subtype = SUBTYPE_OF_SIN[sin];
    for (const level of [1, 2, 3, 4] as const) {
      const spec = TIER_SPECS[level];
      const id = `${sin}-mercatura-${level}`;
      out[id] = {
        id,
        sin,
        level,
        buildCost: buildCostFor(sin, level),
        buildTimeSeconds: spec.buildTimeSeconds,
        goldPerSecond: spec.goldPerSecond,
        reprobateGenPerSecond: spec.reprobateGenPerSecond,
        conversionPerSecond: spec.conversionPerSecond,
        subtypeBias: { [subtype]: 0.85, reprobate: 0.15 },
      };
    }
  }
  return out;
}

/** The full 32-entry catalog (eight Sins × four tiers), keyed by id. */
export const BUSINESSES: Readonly<Record<string, BusinessDef>> = Object.freeze(buildCatalog());

/** Default fraction of `buildCost` refunded on manual shutdown / Katabasis (03 §2.3). */
export const SHUTDOWN_REFUND_FRACTION = 0.25;

/** Lookup; returns undefined for unknown ids. */
export function businessById(id: string): BusinessDef | undefined {
  return BUSINESSES[id];
}

/** All catalog ids in a stable order (matches `Object.keys(BUSINESSES)` insertion order). */
export const BUSINESS_IDS: readonly string[] = Object.freeze(Object.keys(BUSINESSES));
