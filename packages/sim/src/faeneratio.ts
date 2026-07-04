/**
 * The Faeneratio loop (Depraedatio gold rework spec) — the Avaritia-centric gold economy that
 * replaced the eight per-Sin Mercatūs (ADR-025 superseded). Three parts:
 *
 *   - MUTUUM (the loan book): passive gold income proportional to the reprobate population —
 *     small sums seeded among the masses through brokers, repaid up a ledger whose unnamed head is
 *     the player. `mutuumGoldPerSecond = MUTUUM_PER_CAPITA × mods.mutuumPerCapitaMul × reprobates`.
 *     No principal, no decision: this is the income floor and the population coupling (the ADR-025
 *     design point that the economy rides the population curve survives here).
 *   - THESAURUS (the hoard): a vault (`lifetime.hoard`, BigNum) the player deposits liquid gold
 *     into; the hoard pays interest into LIQUID gold at the Fenus rate
 *     (`FENUS_RATE × mods.fenusRateMul × hoard`). Withdrawal is punitive (the recovery fraction);
 *     Katabasis liquidates the hoard in full — the descent voids the contracts, so no recovery
 *     penalty applies there.
 *   - SYNGRAPHAE (the contracts): the Avaritia-gated skill tree — see `syngraphae.ts`.
 *
 * The FOEDUS survives on its upkeep side only, re-anchored from Mercatus depths to the hoard: one
 * GLOBAL tier for all ceremonies, stepped per decade of hoard above `FOEDUS_T0`. The revenue side
 * (per-Sin trade bonuses) retired with the trades.
 *
 * Both income terms are composed at the tick's gold line, scaled by `mods.faenerationOutputMul`
 * (Plutus, Vapula #60 — the renamed `vitiumMercaturaOutputMul`) and `goldRateMul` like all income.
 * Fully deterministic: no RNG, no timers.
 */
import { add, bn, floor, gte, isZero, lte, mul, sub, ZERO, type BigNum } from './bignum.js';
import { type GameState } from './state.js';
import { type Modifiers } from './modifiers.js';
import { ANATOCISMUS_SPLIT, katabasisLiquidationMul, syngraphaSigned } from './syngraphae.js';

// ── Constants (Vitium Mercatura sheet → Faeneratio block; spec §12) ──────────
// Placeholder values from the approved spec, pending reconciliation on the sheet (the sheet is
// authoritative once its Faeneratio block is settled; a settled sheet value wins over these).

/** Mutuum take: gold/s per living reprobate (spec §4.1 placeholder). */
export const MUTUUM_PER_CAPITA = 0.05;
/**
 * Fenus: interest paid into liquid gold, as a fraction of the hoard per second (spec §4.2
 * placeholder — 0.05%/s; full-recycle doubling time ln 2 / rate ≈ 23 minutes).
 */
export const FENUS_RATE = 0.0005;
/**
 * Base fraction of a withdrawal returned to liquid gold — the Globals shutdown-recovery constant
 * (0.25), the same niche it held for the Mercatus divest. Lifted by `mods.thesaurusRecoveryMul`
 * (Custodia nodes, Vine #45 / Furcas #50), capped at `THESAURUS_RECOVERY_CAP`.
 */
export const THESAURUS_RECOVERY = 0.25;
/** Hard cap on the effective withdrawal recovery after all multipliers (spec §4.2). */
export const THESAURUS_RECOVERY_CAP = 0.9;

/** Foedus threshold: the hoard size at which the global tier steps to 1 (spec §4.4 placeholder). */
export const FOEDUS_T0 = 10_000;
export const MAX_FOEDUS_TIER = 4;
/** VC upkeep multiplier = 1 − discount × tier (tier 4 → ×0.5). Unchanged in shape from ADR-025. */
export const FOEDUS_UPKEEP_DISCOUNT_PER_TIER = 0.125;

// ── Mutuum (the loan book) ───────────────────────────────────────────────────

/**
 * The loan book's raw take: `MUTUUM_PER_CAPITA × mods.mutuumPerCapitaMul × reprobates`. Open from
 * the start — the gating rebalance moved every Faeneratio gate one level down, so the old
 * Avaritia-I unlock became no gate at all. RAW — the tick composes
 * `× faenerationOutputMul × goldRateMul` on top, like all income.
 */
export function mutuumGoldPerSecond(state: GameState, mods: Modifiers): number {
  return MUTUUM_PER_CAPITA * mods.mutuumPerCapitaMul * state.lifetime.reprobates;
}

// ── Thesaurus (the hoard) ────────────────────────────────────────────────────

/**
 * The hoard's raw interest/s (Fenus): `FENUS_RATE × mods.fenusRateMul × hoard`, paid into LIQUID
 * gold. RAW — the tick composes `× faenerationOutputMul × goldRateMul` (and the offline factors)
 * on top; the Anatocismus split (usura-4) is likewise the tick's concern, applied AFTER all
 * multipliers. Collapses the hoard to a number like the other income terms (the pipeline is
 * number-based; BigNum matters only past ~1e308).
 */
export function thesaurusInterestPerSecond(state: GameState, mods: Modifiers): number {
  if (isZero(state.lifetime.hoard)) return 0;
  return FENUS_RATE * mods.fenusRateMul * state.lifetime.hoard.toNumber();
}

/**
 * The Faeneratio income term at the tick's gold line (spec §6): the SUM of the Mutuum take and
 * the Thesaurus interest, scaled by `mods.faenerationOutputMul` (Plutus, Vapula #60). Sits exactly
 * where Mercatus revenue sat; `goldRateMul` (and the offline factors) compose on top at the tick.
 */
export function faeneratioGoldPerSecond(state: GameState, mods: Modifiers): number {
  return (
    (mutuumGoldPerSecond(state, mods) + thesaurusInterestPerSecond(state, mods)) *
    mods.faenerationOutputMul
  );
}

/**
 * Anatocismus (usura-4, "interest upon interest, by contract"): the gold/s auto-depositing into
 * the hoard — half of each interest payment AFTER all multipliers (`faenerationOutputMul` and
 * `goldRateMul`; the tick applies its offline factor on top). 0 while the contract is unsigned.
 * The HUD's gold/s shows the liquid half only; the Thesaurus tab shows this rate.
 */
export function anatocismusDepositPerSecond(state: GameState, mods: Modifiers): number {
  if (!syngraphaSigned(state, 'usura-4')) return 0;
  return (
    thesaurusInterestPerSecond(state, mods) *
    mods.faenerationOutputMul *
    mods.goldRateMul *
    ANATOCISMUS_SPLIT
  );
}

/**
 * The effective withdrawal recovery fraction: `THESAURUS_RECOVERY × mods.thesaurusRecoveryMul`,
 * capped at 0.9 after all multipliers (spec §4.2).
 */
export function thesaurusRecoveryFraction(mods: Modifiers): number {
  return Math.min(THESAURUS_RECOVERY_CAP, THESAURUS_RECOVERY * mods.thesaurusRecoveryMul);
}

export type ThesaurusResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Deposit liquid gold into the hoard — instant, any amount up to liquid gold. The amount is
 * floored at the spend boundary (ADR-005; gold accrues fractionally but is spent in whole coins).
 * Refused under the Morpheus freeze, like every other initiation of work (03 §2.4).
 */
export function depositThesaurus(state: GameState, amount: BigNum | number): ThesaurusResult {
  if ((state.lifetime.invocations.morpheus ?? 0) > 0) {
    return { ok: false, reason: 'The world is held in Morpheus’s stillness.' };
  }
  const give = floor(bn(amount));
  if (lte(give, ZERO)) return { ok: false, reason: 'nothing to place' };
  if (!gte(floor(state.lifetime.gold), give)) return { ok: false, reason: 'not enough gold' };
  return {
    ok: true,
    state: {
      ...state,
      lifetime: {
        ...state.lifetime,
        gold: sub(state.lifetime.gold, give),
        hoard: add(state.lifetime.hoard, give),
      },
    },
  };
}

/**
 * Withdraw from the hoard: the FULL `amount` leaves the hoard, but only
 * `floor(amount × recovery)` returns to liquid gold — the counting house releases little of what
 * it has tasted. Floored per ADR-005 on both sides of the move. The UI must state the loss before
 * confirming.
 */
export function withdrawThesaurus(
  state: GameState,
  amount: BigNum | number,
  mods: Modifiers,
): ThesaurusResult {
  if ((state.lifetime.invocations.morpheus ?? 0) > 0) {
    return { ok: false, reason: 'The world is held in Morpheus’s stillness.' };
  }
  const take = floor(bn(amount));
  if (lte(take, ZERO)) return { ok: false, reason: 'nothing to reclaim' };
  if (!gte(floor(state.lifetime.hoard), take)) {
    return { ok: false, reason: 'the hoard holds less than that' };
  }
  const recovered = floor(mul(take, thesaurusRecoveryFraction(mods)));
  return {
    ok: true,
    state: {
      ...state,
      lifetime: {
        ...state.lifetime,
        gold: add(state.lifetime.gold, recovered),
        hoard: sub(state.lifetime.hoard, take),
      },
    },
  };
}

/**
 * Katabasis liquidation (spec §4.2/§7): the hoard liquidates IN FULL into liquid gold — no
 * recovery penalty; the descent voids the contracts — × the faeneratio-4 bonus (×1.25) when that
 * contract is signed. Runs at `enterKatabasis`, BEFORE the remaining-gold roll, so Avaritia levels
 * judge the whole estate; idempotent (no-op at hoard 0), so the defensive repeat at commit costs
 * nothing. The caller stamps `hoardAtDescent` (the Peculium base) before calling.
 */
export function liquidateThesaurus(state: GameState): GameState {
  if (isZero(state.lifetime.hoard)) return state;
  return {
    ...state,
    lifetime: {
      ...state.lifetime,
      gold: add(state.lifetime.gold, mul(state.lifetime.hoard, katabasisLiquidationMul(state))),
      hoard: ZERO,
    },
  };
}

// ── Foedus tier (re-anchored to the hoard — spec §4.4) ───────────────────────

/**
 * The GLOBAL Foedus tier: a pact between the hoard and the rituals — a fat vault greases the
 * ceremonies. `tier = 0` while `hoard < T0`, else `min(floor(log10(hoard / T0)) + 1, 4)` (tiers
 * step at 1e4, 1e5, 1e6, 1e7). One tier for all ceremonies; the per-Sin member dependency retired
 * with the Mercatūs. Pure hoard math — whether a ceremony pays upkeep (and whether it opted out)
 * is the caller's concern (`compositumFoedusUpkeepMul`).
 */
export function foedusTier(state: GameState): number {
  const hoard = state.lifetime.hoard;
  if (!gte(hoard, FOEDUS_T0)) return 0;
  // log-difference form (exact at the decade boundaries, where break_infinity's mantissa is 1);
  // the epsilon guards the same IEEE hair-low family as the old refund flooring.
  const decades = hoard.log10() - Math.log10(FOEDUS_T0);
  return Math.min(Math.floor(decades + 1e-9) + 1, MAX_FOEDUS_TIER);
}

/** VC upkeep multiplier for a Foedus tier: 1 − 0.125 × tier (tier 4 → ×0.5). */
export function foedusUpkeepMul(tier: number): number {
  return 1 - FOEDUS_UPKEEP_DISCOUNT_PER_TIER * tier;
}
