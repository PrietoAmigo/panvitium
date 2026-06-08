/**
 * *Vitium Mercatura* catalog (03 §2.3). Each business is a sin-themed entity that produces gold
 * passively and generates reprobates passively. This module owns the per-business static data; the
 * dynamic state (counts owned, in-flight builds) lives on `LifetimeState`.
 *
 * The full catalog is the eight Sins × four tiers (32 businesses). Per-tier numbers are pinned to
 * the `Vitium Mercatura` sheet:
 *
 *   tier 1 — cost 500 (Gula) / 100 (others), 60 s,      1 gold/s,      0.05 gen/s
 *   tier 2 — cost 25,000,                     1,800 s,   22 gold/s,     1 gen/s
 *   tier 3 — cost 500,000,                    36,000 s,  450 gold/s,    125 gen/s
 *   tier 4 — cost 100,000,000,                500,000 s, 10,000 gold/s, 500 gen/s
 *
 * The tier number doubles as the Sin-level gate: a tier unlocks at Sin level `tier − 1` (the
 * sheet's "Sin-lvl unlock" column), enforced in `startBuild`.
 *
 * NOTE: the per-business conversion + subtype-bias dimension was removed with reprobate subtypes.
 * Businesses now produce gold + generation only; the Sin theming survives as identity/flavour and
 * is the hook for the forthcoming Vitium Mercatura rework (Slice 2).
 */
import { SINS, type Sin } from './state.js';

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
}

/** Per-tier numbers shared across all eight Sins (Vitium Mercatura sheet). */
interface TierSpec {
  readonly buildTimeSeconds: number;
  readonly goldPerSecond: number;
  readonly reprobateGenPerSecond: number;
}

const TIER_SPECS: Record<BusinessTier, TierSpec> = {
  1: {
    buildTimeSeconds: 60,
    goldPerSecond: 1,
    reprobateGenPerSecond: 0.05,
  },
  2: {
    buildTimeSeconds: 1800,
    goldPerSecond: 22,
    reprobateGenPerSecond: 1,
  },
  3: {
    buildTimeSeconds: 36000,
    goldPerSecond: 450,
    reprobateGenPerSecond: 125,
  },
  4: {
    buildTimeSeconds: 500000,
    goldPerSecond: 10000,
    reprobateGenPerSecond: 500,
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
