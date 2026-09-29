/**
 * Syngraphae — the Depraedatio account's standing contracts, laddered on the RELATIONSHIP TIER.
 *
 * The relationship tier is set by the reserve balance (`lifetime.hoard`): Tier I at 100 gold,
 * Tier II at 10,000, Tier III at 1,000,000. Each tier offers three contracts and the player may
 * choose ONE per tier. The choice is free and final for the lifetime: there is no fee, no switching
 * and no refund, and every term lapses when the account closes at Katabasis (the lifetime reset).
 *
 * The tier gates only the CHOICE: once chosen, a contract stays in force for the rest of the
 * lifetime, even if the reserve later falls below its tier. Every effect reader goes through
 * `syngraphaeInForce`, which reads the chosen list against the catalog (retired ids read as
 * nothing).
 *
 * State is `lifetime.syngraphae` (chosen contract ids; additive-optional on the wire, absent means
 * none). The catalog lives in `syngraphae.data.ts` (editable economy knobs). The rate and charge
 * folds live in `computeModifiers` (ADR-022); the mechanisms are wired at their own sites: the
 * Compounding reinvest and the Vesting drawdown in `tick.ts`, Annuity's surrender bar in
 * `faeneratio.ts`, PI's asset tracing in `tick.ts`, the private item safe in `katabasis.ts`, and
 * the risk analytics gate in the web Analytics program.
 *
 * Pure; no I/O. This module must not import `faeneratio.ts` (that module imports this one).
 */
import { floor, gte } from './bignum.js';
import { type GameState } from './state.js';
import { SYNGRAPHAE } from './syngraphae.data.js';
export { SYNGRAPHAE };

// ── Relationship tier ────────────────────────────────────────────────────────

/** Reserve balance (gold) at which each relationship tier is reached: Tier I, II, III. */
export const RELATIONSHIP_TIER_THRESHOLDS: readonly number[] = [100, 10_000, 1_000_000];
export const MAX_RELATIONSHIP_TIER = RELATIONSHIP_TIER_THRESHOLDS.length;

/** The reserve balance a tier requires (tier 1..3); 0 for tier 0 or below. */
export function relationshipTierThreshold(tier: number): number {
  if (tier <= 0) return 0;
  return RELATIONSHIP_TIER_THRESHOLDS[Math.min(tier, MAX_RELATIONSHIP_TIER) - 1] ?? Infinity;
}

/**
 * The relationship tier the reserve holds right now: the highest tier whose threshold the floored
 * balance meets (0 below 100 gold). Floored first (ADR-005): the reserve accrues fractionally, but a
 * tier is judged in whole coins, exactly as the balance is displayed.
 */
export function relationshipTier(state: GameState): number {
  const balance = floor(state.lifetime.hoard);
  let tier = 0;
  for (let t = 1; t <= MAX_RELATIONSHIP_TIER; t++) {
    if (gte(balance, relationshipTierThreshold(t))) tier = t;
  }
  return tier;
}

// ── The catalog ──────────────────────────────────────────────────────────────

/** A contract's effect: a modifier fold (ADR-022) or one of the mechanisms wired at its own site. */
export type SyngraphaEffect =
  /** Interest rate × mul (Interest rate). */
  | { readonly kind: 'fenusRateMul'; readonly mul: number }
  /** Interest rate × (1 + perHour × hours since account inception) (Long-term investing). */
  | { readonly kind: 'fenusRatePerHour'; readonly perHour: number }
  /** Surrender charge × mul (Active management). */
  | { readonly kind: 'surrenderChargeMul'; readonly mul: number }
  /**
   * Surrender charge × surrenderChargeMul, and `reinvestFraction` of each interest payment
   * auto-deposits into the reserve (Compounding; the split is taken after all multipliers).
   */
  | {
      readonly kind: 'compounding';
      readonly surrenderChargeMul: number;
      readonly reinvestFraction: number;
    }
  /**
   * `fractionPerSecond` of the reserve vests to liquid gold each second as interest, with no
   * surrender charge (Vesting). The principal shrinks (an exponential drawdown).
   */
  | { readonly kind: 'vesting'; readonly fractionPerSecond: number }
  /** Interest rate × fenusRateMul; manual surrender is barred (Annuity). */
  | { readonly kind: 'annuity'; readonly fenusRateMul: number }
  /** A free, automatic Indagatio every `intervalSeconds` of game time (PI). */
  | { readonly kind: 'assetTracing'; readonly intervalSeconds: number }
  /** The private item safe: one maleficium passes the next Katabasis for certain (Custody VIP). */
  | { readonly kind: 'privateSafe' }
  /** The risk analytics tab in the Analytics program (Risk algos). */
  | { readonly kind: 'riskAnalytics' };

export interface SyngraphaDef {
  readonly id: string;
  /** The relationship tier that offers (and keeps in force) this contract: 1, 2 or 3. */
  readonly tier: number;
  readonly effect: SyngraphaEffect;
}

/** Lookup; undefined for unknown ids (a retired contract id reads as nothing). */
export function syngraphaById(id: string): SyngraphaDef | undefined {
  return SYNGRAPHAE.find((n) => n.id === id);
}

/** The contracts one relationship tier offers, in catalog order. */
export function syngraphaeOfTier(tier: number): readonly SyngraphaDef[] {
  return SYNGRAPHAE.filter((n) => n.tier === tier);
}

/** True once the contract has been chosen this lifetime (whether or not it is in force). */
export function syngraphaChosen(state: GameState, id: string): boolean {
  return state.lifetime.syngraphae.includes(id);
}

/** The contract chosen for a tier this lifetime, if any. */
export function chosenSyngraphaOfTier(state: GameState, tier: number): SyngraphaDef | undefined {
  for (const id of state.lifetime.syngraphae) {
    const def = syngraphaById(id);
    if (def && def.tier === tier) return def;
  }
  return undefined;
}

/**
 * True once the contract is chosen: a chosen contract holds for the rest of the lifetime, whatever
 * the reserve does afterwards (the tier gates only the choice). False for a retired id.
 */
export function syngraphaInForce(state: GameState, id: string): boolean {
  return syngraphaById(id) !== undefined && syngraphaChosen(state, id);
}

/** Every contract in force right now (every chosen catalog contract), in catalog order. */
export function syngraphaeInForce(state: GameState): readonly SyngraphaDef[] {
  if (state.lifetime.syngraphae.length === 0) return [];
  return SYNGRAPHAE.filter((n) => syngraphaChosen(state, n.id));
}

/** The in-force effect of the given kind, if any (at most one per kind in the catalog). */
function inForceEffect<K extends SyngraphaEffect['kind']>(
  state: GameState,
  kind: K,
): Extract<SyngraphaEffect, { kind: K }> | undefined {
  for (const def of syngraphaeInForce(state)) {
    if (def.effect.kind === kind) return def.effect as Extract<SyngraphaEffect, { kind: K }>;
  }
  return undefined;
}

// ── Mechanism readers (0 / false when the contract is not in force) ───────────

/** Compounding: the fraction of each interest payment that auto-deposits into the reserve. */
export function reinvestFraction(state: GameState): number {
  return inForceEffect(state, 'compounding')?.reinvestFraction ?? 0;
}

/** Vesting: the fraction of the reserve that vests to liquid gold per second. */
export function vestingFractionPerSecond(state: GameState): number {
  return inForceEffect(state, 'vesting')?.fractionPerSecond ?? 0;
}

/** Annuity: manual surrender (withdrawal) is barred while it is in force. */
export function surrenderBarred(state: GameState): boolean {
  return inForceEffect(state, 'annuity') !== undefined;
}

/** PI: the automatic-Indagatio interval in seconds of game time, or 0 when not in force. */
export function assetTracingInterval(state: GameState): number {
  return inForceEffect(state, 'assetTracing')?.intervalSeconds ?? 0;
}

/** Custody VIP: whether the private item safe is open (in force). */
export function privateSafeOpen(state: GameState): boolean {
  return inForceEffect(state, 'privateSafe') !== undefined;
}

/** Risk algos: whether the risk analytics tab is open (in force). */
export function riskAnalyticsOpen(state: GameState): boolean {
  return inForceEffect(state, 'riskAnalytics') !== undefined;
}

/** Hours since account inception (the first deposit this lifetime), in game time. 0 before it. */
export function accountAgeHours(state: GameState): number {
  return (state.lifetime.accountAge ?? 0) / 3600;
}

/**
 * The interest-rate multiplier from the contracts in force (Interest rate, Long-term investing,
 * Annuity). Folded into `fenusRateMul` by `computeModifiers`; 1 when none are in force.
 */
export function syngraphaFenusRateMul(state: GameState): number {
  let mul = 1;
  for (const def of syngraphaeInForce(state)) {
    const e = def.effect;
    if (e.kind === 'fenusRateMul') mul *= e.mul;
    else if (e.kind === 'annuity') mul *= e.fenusRateMul;
    else if (e.kind === 'fenusRatePerHour') mul *= 1 + e.perHour * accountAgeHours(state);
  }
  return mul;
}

/**
 * The surrender-charge multiplier from the contracts in force (Active management, Compounding).
 * Folded into `surrenderChargeMul` by `computeModifiers`; 1 when none are in force.
 */
export function syngraphaSurrenderChargeMul(state: GameState): number {
  let mul = 1;
  for (const def of syngraphaeInForce(state)) {
    const e = def.effect;
    if (e.kind === 'surrenderChargeMul') mul *= e.mul;
    else if (e.kind === 'compounding') mul *= e.surrenderChargeMul;
  }
  return mul;
}

// ── Choosing ─────────────────────────────────────────────────────────────────

export type SignResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Whether `def` can be chosen now: not already chosen, no other contract chosen for its tier, and
 * the reserve holding its tier. The UI reads this for the available/locked/foreclosed split.
 */
export function syngraphaSignable(
  state: GameState,
  def: SyngraphaDef,
): { readonly signable: boolean; readonly reason?: string } {
  if (syngraphaChosen(state, def.id)) return { signable: false, reason: 'already chosen' };
  if (chosenSyngraphaOfTier(state, def.tier)) {
    return { signable: false, reason: 'a contract is already chosen for this tier' };
  }
  if (relationshipTier(state) < def.tier) {
    return { signable: false, reason: `requires relationship tier ${def.tier}` };
  }
  return { signable: true };
}

/**
 * Choose a contract: free, one per relationship tier, final for the lifetime (the terms lapse at
 * Katabasis). Refused under the Astiwihad freeze, like every other initiation of work (03 §2.4).
 */
export function signSyngrapha(state: GameState, id: string): SignResult {
  if ((state.lifetime.invocations.astiwihad ?? 0) > 0) {
    return { ok: false, reason: 'The world is held in Astiwihad’s stillness.' };
  }
  const def = syngraphaById(id);
  if (!def) return { ok: false, reason: 'no such contract' };
  const gate = syngraphaSignable(state, def);
  if (!gate.signable) return { ok: false, reason: gate.reason ?? 'cannot choose' };
  return {
    ok: true,
    state: {
      ...state,
      lifetime: { ...state.lifetime, syngraphae: [...state.lifetime.syngraphae, id] },
    },
  };
}

// ── The private item safe (Custody VIP) ──────────────────────────────────────

/** The maleficium held in the private safe, if the designation names one the player still owns. */
export function safeItem(state: GameState): string | undefined {
  const id = state.lifetime.safeItem;
  return id !== undefined && state.lifetime.maleficia.includes(id) ? id : undefined;
}

/**
 * Store a maleficium in the private safe, or take it back out. The safe holds ONE item: storing
 * another replaces the first; storing the one already inside empties the safe. Requires the safe to
 * be open (Custody VIP in force) and the item to be owned.
 */
export function toggleSafeItem(state: GameState, id: string): SignResult {
  if (!privateSafeOpen(state)) return { ok: false, reason: 'the private safe is not open' };
  if (!state.lifetime.maleficia.includes(id)) return { ok: false, reason: 'not owned' };
  if (safeItem(state) === id) {
    const { safeItem: _drop, ...rest } = state.lifetime;
    return { ok: true, state: { ...state, lifetime: rest } };
  }
  return { ok: true, state: { ...state, lifetime: { ...state.lifetime, safeItem: id } } };
}
