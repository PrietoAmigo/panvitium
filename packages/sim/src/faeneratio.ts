/**
 * The Depraedatio account — the Avaritia-centric gold loop that replaced the eight per-Sin
 * Mercatūs (ADR-025 superseded). Two parts:
 *
 *   - THESAURUS (the reserve): a vault (`lifetime.hoard`, BigNum) the player deposits liquid gold
 *     into; it pays interest into LIQUID gold at the Fenus rate (`FENUS_RATE × mods.fenusRateMul ×
 *     hoard`). A manual withdrawal (the surrender) forfeits the surrender charge; Katabasis (the
 *     account close) liquidates the reserve in full, with no charge.
 *   - SYNGRAPHAE (the contracts): one per relationship tier, the tier set by the reserve balance;
 *     see `syngraphae.ts`.
 *
 * The loan book (Mutuum, the per-reprobate take) and the Foedus ceremony-upkeep rebate are retired:
 * the account's only income is the reserve's interest (plus the Vesting drawdown, which returns
 * principal as interest).
 *
 * The interest is composed at the tick's gold line, scaled by `mods.faenerationOutputMul` (Plutus,
 * Vapula #60) and `goldRateMul` like all income. Fully deterministic: no RNG.
 */
import { add, bn, floor, gte, isZero, lte, mul, sub, ZERO, type BigNum } from './bignum.js';
import { type GameState } from './state.js';
import { type Modifiers } from './modifiers.js';
import { reinvestFraction, surrenderBarred, vestingFractionPerSecond } from './syngraphae.js';

// ── Constants (placeholders pending the sheet's Faeneratio block; a settled sheet value wins) ──

/**
 * Fenus: interest paid into liquid gold, as a fraction of the reserve per second (0.05%/s; the
 * full-recycle doubling time ln 2 / rate ≈ 23 minutes).
 */
export const FENUS_RATE = 0.0005;

/**
 * The base surrender charge: the fraction of a manual withdrawal the counting house keeps (0.15, a
 * fifth of the old 0.75 charge, i.e. 85% returned). Scaled by `mods.surrenderChargeMul` (Active
 * management ×0.67, Compounding ×1.5, Vine #45 / Furcas #50 soften it), clamped to [0, 1].
 */
export const BASE_SURRENDER_CHARGE = 0.15;

// ── Thesaurus (the reserve) ──────────────────────────────────────────────────

/**
 * The reserve's raw interest/s (Fenus): `FENUS_RATE × mods.fenusRateMul × hoard`, paid into LIQUID
 * gold. RAW: the tick composes `× faenerationOutputMul × goldRateMul` on top; the Compounding split
 * is likewise the tick's concern, applied AFTER all multipliers. Collapses the reserve to a number
 * like the other income terms (the pipeline is number-based; BigNum matters only past ~1e308).
 */
export function thesaurusInterestPerSecond(state: GameState, mods: Modifiers): number {
  if (isZero(state.lifetime.hoard)) return 0;
  return FENUS_RATE * mods.fenusRateMul * state.lifetime.hoard.toNumber();
}

/**
 * The account's income term at the tick's gold line: the reserve's interest scaled by
 * `mods.faenerationOutputMul` (Plutus, Vapula #60). `goldRateMul` composes on top at the tick.
 */
export function faeneratioGoldPerSecond(state: GameState, mods: Modifiers): number {
  return thesaurusInterestPerSecond(state, mods) * mods.faenerationOutputMul;
}

/**
 * The account's realised interest/s after every multiplier (`faenerationOutputMul`, `goldRateMul`),
 * before the Compounding split: what the reserve earns, whether it pays out or reinvests.
 */
export function realisedInterestPerSecond(state: GameState, mods: Modifiers): number {
  return faeneratioGoldPerSecond(state, mods) * mods.goldRateMul;
}

/**
 * Compounding: the gold/s auto-depositing into the reserve, `reinvestFraction` of each interest
 * payment AFTER all multipliers. 0 while the contract is not in force. The HUD's gold/s shows the
 * liquid remainder only.
 */
export function reinvestPerSecond(state: GameState, mods: Modifiers): number {
  const fraction = reinvestFraction(state);
  if (fraction <= 0) return 0;
  return realisedInterestPerSecond(state, mods) * fraction;
}

/**
 * Vesting: the reserve vests to liquid gold at `fractionPerSecond` of the balance per second (an
 * exponential drawdown), paid as interest with no surrender charge. Exact over any span (ADR-004):
 * over `seconds` the reserve pays `hoard × (1 − e^(−k·seconds))`, so one big tick equals the sum of
 * small ones. Returns the gold that vests over the span (0 when not in force or the reserve is empty).
 */
export function vestingPayout(state: GameState, seconds: number): BigNum {
  const k = vestingFractionPerSecond(state);
  const hoard = state.lifetime.hoard;
  if (k <= 0 || seconds <= 0 || lte(hoard, ZERO)) return ZERO;
  return mul(hoard, -Math.expm1(-k * seconds));
}

/** Vesting's instantaneous rate (gold/s), for the readouts: `k × reserve` (0 when not in force). */
export function vestingPerSecond(state: GameState): number {
  const k = vestingFractionPerSecond(state);
  if (k <= 0 || lte(state.lifetime.hoard, ZERO)) return 0;
  return k * state.lifetime.hoard.toNumber();
}

/**
 * The effective surrender charge: `BASE_SURRENDER_CHARGE × mods.surrenderChargeMul`, clamped to
 * [0, 1]. The fraction of a manual withdrawal forfeited to the counting house.
 */
export function surrenderCharge(mods: Modifiers): number {
  return Math.min(1, Math.max(0, BASE_SURRENDER_CHARGE * mods.surrenderChargeMul));
}

/** The fraction of a manual withdrawal returned to liquid gold: `1 − surrenderCharge`. */
export function thesaurusRecoveryFraction(mods: Modifiers): number {
  return 1 - surrenderCharge(mods);
}

export type ThesaurusResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Deposit liquid gold into the reserve — instant, any amount up to liquid gold. The amount is
 * floored at the spend boundary (ADR-005; gold accrues fractionally but is spent in whole coins).
 * The first deposit of a lifetime is the account's INCEPTION: it starts the account-age clock
 * (`lifetime.accountAge`) that Long-term investing and the realised-income line read. Refused under
 * the Astiwihad freeze, like every other initiation of work (03 §2.4).
 */
export function depositThesaurus(state: GameState, amount: BigNum | number): ThesaurusResult {
  if ((state.lifetime.invocations.astiwihad ?? 0) > 0) {
    return { ok: false, reason: 'The world is held in Astiwihad’s stillness.' };
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
        accountAge: state.lifetime.accountAge ?? 0,
      },
    },
  };
}

/**
 * Withdraw from the reserve (the surrender): the FULL `amount` leaves the reserve, but only
 * `floor(amount × (1 − surrenderCharge))` returns to liquid gold. Floored per ADR-005 on both sides
 * of the move. Barred outright while an Annuity is in force. The UI states the charge before
 * confirming.
 */
export function withdrawThesaurus(
  state: GameState,
  amount: BigNum | number,
  mods: Modifiers,
): ThesaurusResult {
  if ((state.lifetime.invocations.astiwihad ?? 0) > 0) {
    return { ok: false, reason: 'The world is held in Astiwihad’s stillness.' };
  }
  if (surrenderBarred(state)) return { ok: false, reason: 'the annuity bars manual surrender' };
  const take = floor(bn(amount));
  if (lte(take, ZERO)) return { ok: false, reason: 'nothing to reclaim' };
  if (!gte(floor(state.lifetime.hoard), take)) {
    return { ok: false, reason: 'the reserve holds less than that' };
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
 * Katabasis liquidation (the account close): the reserve liquidates IN FULL into liquid gold, with
 * no surrender charge. Runs at `enterKatabasis`, BEFORE the remaining-gold roll, so Avaritia levels
 * judge the whole estate; idempotent (no-op at an empty reserve), so the defensive repeat at commit
 * costs nothing.
 */
export function liquidateThesaurus(state: GameState): GameState {
  if (isZero(state.lifetime.hoard)) return state;
  return {
    ...state,
    lifetime: {
      ...state.lifetime,
      gold: add(state.lifetime.gold, state.lifetime.hoard),
      hoard: ZERO,
    },
  };
}
