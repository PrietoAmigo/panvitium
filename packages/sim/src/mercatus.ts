/**
 * The Mercatus system (Vitium Mercatura rework spec §1) — eight trades, exactly one per Cardinal
 * Sin. Each has a single integer DEPTH `d ≥ 0`; deepening is an instant gold purchase (no build
 * times, no build queue, no copies). Revenue is demand-driven: a trade's take scales with the
 * living reprobate population and with how far its roots reach into them.
 *
 *   revenue/s (per trade)    = spendPerCapita × reprobates × penetration(d)
 *   penetration(d)           = 1 − e^(−a·d)
 *   generation/s (per trade) = genPerDepth × d
 *
 * Invest cost from depth d to d+1 is `floor(C0 × r^d)`; the cumulative cost to depth d is the
 * closed form `C0 × (r^d − 1)/(r − 1)` — derived, never stored. Divesting refunds
 * `divestFraction × cumulative cost of the divested depths`, floored; the fraction is the Globals
 * "Business shutdown gold recovery" constant (0.25), still lifted by the Vine #45 sigil.
 *
 * This module also owns the FOEDUS TIER function (spec §2): a Foedus forms between a Vitium
 * Compositum ceremony and the Mercatūs of its member Sins, scaling with the SHALLOWEST member
 * depth. The tier math lives here (it reads only depths + a Sin list); the coupling to active
 * ceremonies (upkeep discount, revenue bonus) is computed at the call sites — `compositum.ts`
 * for upkeep, `foedera.ts` for revenue — because it depends on per-VC active state and is
 * deliberately NOT a global modifier-bundle value (ADR-022 note in the spec).
 *
 * Fully deterministic: no RNG, no timers, no pools.
 */
import { add, floor, gte, sub } from './bignum.js';
import { sinLevel } from './progression.js';
import { sigilShutdownRefundMul } from './sigils.js';
import { SINS, type GameState, type Sin } from './state.js';

// ── Constants (Vitium Mercatura sheet) ───────────────────────────────────────

/** Invest cost seed: going from depth 0 to 1 costs `floor(C0)` gold. */
export const MERCATUS_C0 = 50;
/** Invest cost ratio: each further depth costs ×r the previous. */
export const MERCATUS_COST_RATIO = 1.6;
/** Penetration curve steepness: penetration(d) = 1 − e^(−a·d). */
export const MERCATUS_PENETRATION_A = 0.15;
/** Gold/s each reprobate yields to one trade at full penetration. */
export const MERCATUS_SPEND_PER_CAPITA = 0.1;
/** Reprobate generation/s contributed per depth of one trade. */
export const MERCATUS_GEN_PER_DEPTH = 0.02;
/** Depth cap per Sin level: cap = 10 × sinLevel. */
export const MERCATUS_DEPTH_CAP_PER_SIN_LEVEL = 10;
/**
 * Base fraction of the divested depths' cumulative cost refunded on divest / Katabasis
 * liquidation — the Globals "Business shutdown gold recovery" constant, carried over from the
 * legacy business system. The Vine #45 sigil keeps modifying this same fraction.
 */
export const DIVEST_FRACTION = 0.25;

/** Foedus (spec §2): one tier per `FOEDUS_DEPTH_STEP` of the shallowest member depth. */
export const FOEDUS_DEPTH_STEP = 10;
export const MAX_FOEDUS_TIER = 4;
/** VC upkeep multiplier = 1 − discount × tier (tier 4 → ×0.5). */
export const FOEDUS_UPKEEP_DISCOUNT_PER_TIER = 0.125;
/** Mercatus revenue multiplier = 1 + bonus × tier per active member VC (tier 4 → ×1.2). */
export const FOEDUS_REVENUE_BONUS_PER_TIER = 0.05;

// ── Depth / unlock / cost curves ─────────────────────────────────────────────

/** Current depth of a Sin's trade (0 when never deepened). */
export function mercatusDepth(state: GameState, sin: Sin): number {
  return state.lifetime.mercatusDepths[sin] ?? 0;
}

/** A Mercatus becomes available at its Sin's level 1. */
export function mercatusUnlocked(state: GameState, sin: Sin): boolean {
  return sinLevel(state.devotion[sin]) >= 1;
}

/** Depth cap: 10 × the Sin's current level (level 4 → 40). */
export function mercatusDepthCap(state: GameState, sin: Sin): number {
  return MERCATUS_DEPTH_CAP_PER_SIN_LEVEL * sinLevel(state.devotion[sin]);
}

/** Gold cost to deepen a trade from depth `d` to `d+1`: floor(C0 × r^d). */
export function investCost(d: number): number {
  return Math.floor(MERCATUS_C0 * Math.pow(MERCATUS_COST_RATIO, d));
}

/**
 * Cumulative invest cost to reach depth `d` from 0 — the closed form
 * `C0 × (r^d − 1)/(r − 1)` (spec §1.1: derive, never store). Divest refunds are computed
 * against this form, not against the per-step floored costs.
 */
export function cumulativeInvestCost(d: number): number {
  if (d <= 0) return 0;
  return (MERCATUS_C0 * (Math.pow(MERCATUS_COST_RATIO, d) - 1)) / (MERCATUS_COST_RATIO - 1);
}

/**
 * Floor with a tiny epsilon, for refund amounts derived from the closed-form cumulative cost.
 * `MERCATUS_COST_RATIO − 1` is 0.6000000000000001 in IEEE doubles, so an exactly-integer span
 * (e.g. cumulative(3) − cumulative(2) = 128) computes a hair LOW (127.99999999999997) and a naked
 * floor would short the refund by 1 gold. Same family as the break_infinity flooring gotcha
 * (skill §5); the epsilon restores the mathematically-intended integer. Pinned in mercatus.test.
 */
function floorRefund(n: number): number {
  return Math.floor(n + 1e-9);
}

/**
 * Effective divest/liquidation fraction: the base `DIVEST_FRACTION` lifted by any bound Vine #45
 * sigil, clamped to ≤ 1 so a divest can never refund more than was invested. Shared by manual
 * divest and the Katabasis liquidation so they stay in lockstep.
 */
export function divestFraction(state: GameState): number {
  return Math.min(1, DIVEST_FRACTION * sigilShutdownRefundMul(state));
}

// ── Revenue / generation ─────────────────────────────────────────────────────

/** Reach into the population at depth `d`: 1 − e^(−a·d) (0 at depth 0, asymptotic to 1). */
export function penetration(d: number): number {
  return 1 - Math.exp(-MERCATUS_PENETRATION_A * d);
}

/**
 * One trade's raw revenue/s: spendPerCapita × living reprobates × penetration(depth).
 * RAW — the Foedus revenue bonus (active-VC dependent) composes on top in `foedera.ts`, and the
 * global `vitiumMercaturaOutputMul` (Plutus, Vapula #60) at the tick call site.
 */
export function mercatusRevenuePerSecond(state: GameState, sin: Sin): number {
  const d = mercatusDepth(state, sin);
  if (d <= 0) return 0;
  return MERCATUS_SPEND_PER_CAPITA * state.lifetime.reprobates * penetration(d);
}

/**
 * Total reprobate generation/s across all trades: Σ genPerDepth × depth. Folds into the
 * generation pool at the dynamics call site, scaled by `vitiumMercaturaOutputMul` there.
 * (The Foedus bonus applies to revenue only, not generation — spec §2.)
 */
export function mercatusGenerationPerSecond(state: GameState): number {
  let s = 0;
  for (const sin of SINS) s += MERCATUS_GEN_PER_DEPTH * mercatusDepth(state, sin);
  return s;
}

/** Total depth across all eight trades (email triggers, light telemetry). */
export function totalMercatusDepth(state: GameState): number {
  let s = 0;
  for (const sin of SINS) s += mercatusDepth(state, sin);
  return s;
}

// ── Invest / divest ──────────────────────────────────────────────────────────

export type MercatusResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/** Write a new depth for `sin`, dropping the key at 0 so empty-state stays clean on the wire. */
function withDepth(state: GameState, sin: Sin, depth: number): GameState {
  const mercatusDepths = { ...state.lifetime.mercatusDepths };
  if (depth <= 0) delete mercatusDepths[sin];
  else mercatusDepths[sin] = depth;
  return { ...state, lifetime: { ...state.lifetime, mercatusDepths } };
}

/**
 * Deepen a Sin's trade by one depth — an instant gold purchase. Checks: the Sin is at level ≥ 1
 * (the trade exists), the depth cap (10 × sinLevel) is not reached, and the gold is there.
 * Refused under the Morpheus freeze, like every other initiation of work (03 §2.4).
 */
export function investMercatus(state: GameState, sin: Sin): MercatusResult {
  if ((state.lifetime.invocations.morpheus ?? 0) > 0) {
    return { ok: false, reason: 'The world is held in Morpheus\u2019s stillness.' };
  }
  if (!mercatusUnlocked(state, sin)) {
    return { ok: false, reason: `requires ${sin} level 1` };
  }
  const d = mercatusDepth(state, sin);
  if (d >= mercatusDepthCap(state, sin)) {
    return { ok: false, reason: 'its roots can reach no deeper at this rank' };
  }
  const cost = investCost(d);
  if (!gte(floor(state.lifetime.gold), cost)) {
    return { ok: false, reason: 'not enough gold' };
  }
  const paid = withDepth(state, sin, d + 1);
  return {
    ok: true,
    state: { ...paid, lifetime: { ...paid.lifetime, gold: sub(paid.lifetime.gold, cost) } },
  };
}

export type DivestResult =
  | { readonly ok: true; readonly state: GameState; readonly refund: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Wind a trade down by `depths` (clamped to the current depth; pass the full depth to sell off
 * entirely). Instant; refunds `floor(divestFraction × cumulative cost of the divested depths)`
 * gold, where the cumulative cost is the closed-form span `cumulative(d) − cumulative(d − k)`.
 */
export function divestMercatus(state: GameState, sin: Sin, depths = 1): DivestResult {
  const d = mercatusDepth(state, sin);
  if (d <= 0) return { ok: false, reason: 'the trade has no roots to cut' };
  const k = Math.min(Math.max(1, Math.floor(depths)), d);
  const span = cumulativeInvestCost(d) - cumulativeInvestCost(d - k);
  const refund = floorRefund(divestFraction(state) * span);
  const cut = withDepth(state, sin, d - k);
  return {
    ok: true,
    state: { ...cut, lifetime: { ...cut.lifetime, gold: add(cut.lifetime.gold, refund) } },
    refund,
  };
}

/**
 * Katabasis liquidation (spec §1.4): every trade auto-divests at `divestFraction` into gold —
 * BEFORE the remaining-gold carry-over roll, preserving the Avaritia carry-over interplay the old
 * auto-shutdown had — and all depths reset to 0 with the lifetime. Idempotent (no-op at depth 0),
 * so the defensive repeat at commit after the enter-teardown costs nothing.
 */
export function liquidateMercatus(state: GameState): GameState {
  let refund = 0;
  for (const sin of SINS) {
    const d = mercatusDepth(state, sin);
    if (d > 0) refund += floorRefund(divestFraction(state) * cumulativeInvestCost(d));
  }
  if (refund === 0 && Object.keys(state.lifetime.mercatusDepths).length === 0) return state;
  return {
    ...state,
    lifetime: {
      ...state.lifetime,
      gold: add(state.lifetime.gold, refund),
      mercatusDepths: {},
    },
  };
}

// ── Foedus tier (spec §2) ────────────────────────────────────────────────────

/**
 * The Foedus tier between a ceremony's member-Sin set and their Mercatūs:
 * `min(floor(min(member depths) / FOEDUS_DEPTH_STEP), MAX_FOEDUS_TIER)`. Tier 0 = no Foedus.
 * Pure depth math — whether the ceremony is active (revenue bonus) or paying upkeep (discount)
 * is the caller's concern.
 */
export function foedusTier(state: GameState, sins: readonly Sin[]): number {
  if (sins.length === 0) return 0;
  let minDepth = Infinity;
  for (const sin of sins) minDepth = Math.min(minDepth, mercatusDepth(state, sin));
  return Math.min(Math.floor(minDepth / FOEDUS_DEPTH_STEP), MAX_FOEDUS_TIER);
}

/** VC upkeep multiplier for a Foedus tier: 1 − 0.125 × tier (tier 4 → ×0.5). */
export function foedusUpkeepMul(tier: number): number {
  return 1 - FOEDUS_UPKEEP_DISCOUNT_PER_TIER * tier;
}
