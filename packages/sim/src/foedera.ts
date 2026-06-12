/**
 * Foedera (spec §2) — the coupling between active Vitium Compositum ceremonies and the Mercatūs
 * of their member Sins, on the REVENUE side.
 *
 * While a ceremony is active, each member Sin's Mercatus revenue is multiplied by
 * `1 + FOEDUS_REVENUE_BONUS_PER_TIER × foedusTier`; several active ceremonies sharing a Sin stack
 * multiplicatively on that trade. (The upkeep side of the same Foedus — the per-tier discount on a
 * ceremony's per-second cost — is applied in `compositum.ts`'s `advanceToggles`, the existing
 * step-0 upkeep site.)
 *
 * This module exists to keep the import graph acyclic: `mercatus.ts` owns the depth/tier math and
 * must not know about ceremonies; `compositum.ts` owns the ceremonies and imports only the tier
 * math; the revenue coupling needs BOTH, so it lives here and is consumed by the tick. Per the
 * spec's engineering plan this is deliberately NOT a modifier-bundle field (ADR-022): it depends
 * on per-VC active state, so it computes at the call sites instead.
 */
import { COMPOSITA, type CompositumDef } from './compositum.js';
import { FOEDUS_REVENUE_BONUS_PER_TIER, foedusTier, mercatusRevenuePerSecond } from './mercatus.js';
import { SINS, type GameState, type Sin } from './state.js';

/**
 * One ceremony's Foedus revenue contribution to one Sin's Mercatus: `1 + 0.05 × tier` when the
 * ceremony includes the Sin and has not opted out, else ×1. Whether the ceremony is ACTIVE is
 * the caller's concern (`foedusRevenueMul` walks the active set).
 */
export function foedusRevenueContribution(state: GameState, def: CompositumDef, sin: Sin): number {
  if (def.foedusOptOut === true || !def.sins.includes(sin)) return 1;
  const tier = foedusTier(state, def.sins);
  return tier > 0 ? 1 + FOEDUS_REVENUE_BONUS_PER_TIER * tier : 1;
}

/**
 * The combined Foedus revenue multiplier on one Sin's Mercatus: the product of
 * `1 + 0.05 × tier` over every ACTIVE, non-opted-out ceremony whose member-Sin set includes
 * `sin`. 1× when no such ceremony is active (tier 0 contributes ×1 and drops out naturally).
 */
export function foedusRevenueMul(state: GameState, sin: Sin): number {
  let mul = 1;
  for (const id of state.lifetime.activeToggles) {
    const def = COMPOSITA[id];
    if (def) mul *= foedusRevenueContribution(state, def, sin);
  }
  return mul;
}

/**
 * The highest Foedus tier any ACTIVE ceremony holds with this Sin's trade — for the UI badge on
 * the Mercatus row (shown when ≥ 1). 0 when no active ceremony includes the Sin.
 */
export function highestFoedusTierForSin(state: GameState, sin: Sin): number {
  let best = 0;
  for (const id of state.lifetime.activeToggles) {
    const def = COMPOSITA[id];
    if (!def || def.foedusOptOut === true || !def.sins.includes(sin)) continue;
    best = Math.max(best, foedusTier(state, def.sins));
  }
  return best;
}

/**
 * One Sin's full Mercatus revenue/s: the raw demand-driven take (signature clause included) ×
 * its combined Foedus bonus. The tick reads this for the Acediae offline-revenue exemption.
 */
export function mercatusRevenueWithFoedus(state: GameState, sin: Sin): number {
  const raw = mercatusRevenuePerSecond(state, sin);
  return raw > 0 ? raw * foedusRevenueMul(state, sin) : 0;
}

/**
 * Total Mercatus revenue/s across the eight trades, Foedus bonuses applied per Sin. This replaces
 * the legacy `businessGoldPerSecond` at tick step 1, composed exactly as before:
 * `(... + mercatusGoldPerSecond × vitiumMercaturaOutputMul + ...) × goldRateMul`.
 */
export function mercatusGoldPerSecond(state: GameState): number {
  let s = 0;
  for (const sin of SINS) s += mercatusRevenueWithFoedus(state, sin);
  return s;
}
