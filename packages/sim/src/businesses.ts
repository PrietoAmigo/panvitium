/**
 * *Vitium Mercatura* catalog (03 §2.3). Each business is a sin-themed entity that produces gold
 * passively, generates reprobates passively, and biases new conversions toward its matching
 * subtype. This module owns the per-business static data; the dynamic state (counts owned,
 * in-flight builds) lives on `LifetimeState`.
 *
 * THIS SLICE: only the Level-1 entry-tier of each Sin (eight businesses total). Higher tiers land
 * in a follow-up. The Level-1 numbers below are pinned to the `Vitium Mercatura` sheet (build cost
 * 1000, build time 60 s, 1 gold/s, 1 reprobate/s, 0.01 conversion/s); subtype-bias splits are the
 * code's representation of the sheet's "toward <subtype>" direction.
 *
 * Subtype bias rules (per the user's correction). The subtype of each *generated* reprobate is
 * picked from the active-business count × subtype-bias weighting (`biasedSubtype` in dynamics).
 * Per-business `subtypeBias` defines the per-business probability of each subtype on conversion;
 * weights are aggregated then renormalized at draw time (02 §9). Each entry-tier business is
 * heavily biased toward its matching subtype with a small leakage to `'reprobate'` (unconverted).
 */
import { type Sin, type ReprobateSubtype } from './state.js';

/** Static catalog entry for one business id. Multiple instances can be owned (stacked). */
export interface BusinessDef {
  readonly id: string;
  readonly sin: Sin;
  /** Level-1 entry-tier in this slice (1..4 in the broader catalog). */
  readonly level: 1;
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

/** The eight entry-tier businesses keyed by id. Catalog grows tier-by-tier in future slices. */
export const BUSINESSES: Readonly<Record<string, BusinessDef>> = {
  'gula-mercatura-1': {
    id: 'gula-mercatura-1',
    sin: 'gula',
    level: 1,
    buildCost: 1000,
    buildTimeSeconds: 60,
    goldPerSecond: 1,
    reprobateGenPerSecond: 1,
    conversionPerSecond: 0.01,
    subtypeBias: { glutton: 0.85, reprobate: 0.15 },
  },
  'luxuria-mercatura-1': {
    id: 'luxuria-mercatura-1',
    sin: 'luxuria',
    level: 1,
    buildCost: 1000,
    buildTimeSeconds: 60,
    goldPerSecond: 1,
    reprobateGenPerSecond: 1,
    conversionPerSecond: 0.01,
    subtypeBias: { degenerate: 0.85, reprobate: 0.15 },
  },
  'avaritia-mercatura-1': {
    id: 'avaritia-mercatura-1',
    sin: 'avaritia',
    level: 1,
    buildCost: 1000,
    buildTimeSeconds: 60,
    goldPerSecond: 1,
    reprobateGenPerSecond: 1,
    conversionPerSecond: 0.01,
    subtypeBias: { gambler: 0.85, reprobate: 0.15 },
  },
  'tristitia-mercatura-1': {
    id: 'tristitia-mercatura-1',
    sin: 'tristitia',
    level: 1,
    buildCost: 1000,
    buildTimeSeconds: 60,
    goldPerSecond: 1,
    reprobateGenPerSecond: 1,
    conversionPerSecond: 0.01,
    subtypeBias: { nihilist: 0.85, reprobate: 0.15 },
  },
  'ira-mercatura-1': {
    id: 'ira-mercatura-1',
    sin: 'ira',
    level: 1,
    buildCost: 1000,
    buildTimeSeconds: 60,
    goldPerSecond: 1,
    reprobateGenPerSecond: 1,
    conversionPerSecond: 0.01,
    subtypeBias: { choleric: 0.85, reprobate: 0.15 },
  },
  'acedia-mercatura-1': {
    id: 'acedia-mercatura-1',
    sin: 'acedia',
    level: 1,
    buildCost: 1000,
    buildTimeSeconds: 60,
    goldPerSecond: 1,
    reprobateGenPerSecond: 1,
    conversionPerSecond: 0.01,
    subtypeBias: { husk: 0.85, reprobate: 0.15 },
  },
  'vanagloria-mercatura-1': {
    id: 'vanagloria-mercatura-1',
    sin: 'vanagloria',
    level: 1,
    buildCost: 1000,
    buildTimeSeconds: 60,
    goldPerSecond: 1,
    reprobateGenPerSecond: 1,
    conversionPerSecond: 0.01,
    subtypeBias: { celebrity: 0.85, reprobate: 0.15 },
  },
  'superbia-mercatura-1': {
    id: 'superbia-mercatura-1',
    sin: 'superbia',
    level: 1,
    buildCost: 1000,
    buildTimeSeconds: 60,
    goldPerSecond: 1,
    reprobateGenPerSecond: 1,
    conversionPerSecond: 0.01,
    subtypeBias: { sigma: 0.85, reprobate: 0.15 },
  },
} as const;

/** Default fraction of `buildCost` refunded on manual shutdown / Katabasis (03 §2.3). */
export const SHUTDOWN_REFUND_FRACTION = 0.25;

/** Lookup; returns undefined for unknown ids. */
export function businessById(id: string): BusinessDef | undefined {
  return BUSINESSES[id];
}

/** All catalog ids in a stable order (matches `Object.keys(BUSINESSES)` insertion order). */
export const BUSINESS_IDS: readonly string[] = Object.freeze(Object.keys(BUSINESSES));
