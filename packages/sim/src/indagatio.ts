/**
 * Indagatio investment (03 §2.5) — a share of the player's gold poured into every Search to make it
 * more efficient.
 *
 * The player sets a DEFAULT investment PERCENTAGE (`lifetime.indagatioInvestPercent`, whole points
 * 0–100), not a sum: each Invest press raises it by `INDAGATIO_INVEST_STEP_PERCENT` (2 points), each
 * Divest press lowers it by `INDAGATIO_DIVEST_STEP_PERCENT` (1 point). Setting it moves no gold.
 * Instead every Cast pours that share of the gold held AT THAT MOMENT into the Search
 * (`indagatioInvestmentGold`, floored to whole coins): `startAction('indagatio')` deducts it, and its
 * efficiency bonus is baked into that search's duration. The percentage stands, so the next Cast
 * pours the same share of whatever gold is then held; the sum it represents floats with the
 * treasury.
 *
 * The invested gold grants action efficiency to Indagatio ALONE (it is folded into
 * `indagatioEfficiencyMul` in `computeModifiers`, which only `categoryEfficiency('indagatio')` — the
 * player's own Cast — reads; Logos/Emptio and the acolyte channels never see it). Because Indagatio
 * is a time-mode action, more efficiency means a shorter search (`startAction` divides the duration
 * by it).
 *
 * The bonus is LOGARITHMIC: each ten-fold of invested gold adds a flat 5% (per the design brief) —
 *   0 g → +0%,  10 g → +5%,  100 g → +10%,  1,000 g → +15%,  and so on.
 * i.e. `bonus = 0.05 × log10(gold)`, clamped at 0 so below 1 g grants nothing (never a penalty).
 *
 * Invest / divest only adjust the percentage, so they are preferences rather than economic actions:
 * they are allowed under the Astiwihad freeze (the Cast itself is still refused there). The
 * percentage lives in `lifetime`, so a descent resets it to 0 with the rest of the lifetime.
 */
import { div, floor, gt, mul, ONE, ZERO, type BigNum } from './bignum.js';
import { type GameState } from './state.js';

/**
 * Efficiency added per ten-fold of invested gold (the design brief: 10 g → +5%, 100 g → +10%, …).
 * A tuning knob; not sourced from the economy sheet (this feature post-dates it).
 */
export const INDAGATIO_INVESTMENT_EFF_PER_DECADE = 0.05;

/** Percentage points one Invest press adds to the default investment. */
export const INDAGATIO_INVEST_STEP_PERCENT = 2;

/** Percentage points one Divest press takes off the default investment. */
export const INDAGATIO_DIVEST_STEP_PERCENT = 1;

/** The ceiling of the default investment: a Search can take at most all of the gold held. */
export const INDAGATIO_INVEST_MAX_PERCENT = 100;

/**
 * The Indagatio-efficiency MULTIPLIER granted by an investment of `investment` gold (≥ 1).
 * Logarithmic: `1 + 0.05 × log10(gold)`, clamped so gold ≤ 1 grants exactly 1× (no bonus, never a
 * penalty). Folded into `indagatioEfficiencyMul` by `computeModifiers`; also read by the UI.
 */
export function indagatioInvestmentEfficiencyMul(investment: BigNum): number {
  const inv = floor(investment);
  // At or below one coin, log10 is ≤ 0 — grant no bonus rather than a fractional/negative one.
  if (!gt(inv, ONE)) return 1;
  return 1 + INDAGATIO_INVESTMENT_EFF_PER_DECADE * inv.log10();
}

/**
 * The gold the next Cast would pour into the Search right now: the default percentage of the gold
 * currently held, in whole coins (`floor(floor(gold) × percent / 100)`, ADR-005). Never more than
 * the gold held, so the Cast is always affordable. Live: it moves with the treasury.
 */
export function indagatioInvestmentGold(state: GameState): BigNum {
  const percent = state.lifetime.indagatioInvestPercent;
  if (percent <= 0) return ZERO;
  // Multiply by the whole percentage first, then divide: exact for whole-coin balances.
  return floor(div(mul(floor(state.lifetime.gold), percent), 100));
}

export type IndagatioInvestResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/** The same state with the default investment set to `percent`. */
function withPercent(state: GameState, percent: number): GameState {
  return { ...state, lifetime: { ...state.lifetime, indagatioInvestPercent: percent } };
}

/**
 * Raise the default investment by `INDAGATIO_INVEST_STEP_PERCENT` points, capped at 100%. Moves no
 * gold: the share is taken from the treasury only when a Search is cast. Refused once at the cap.
 */
export function investIndagatio(state: GameState): IndagatioInvestResult {
  const current = state.lifetime.indagatioInvestPercent;
  if (current >= INDAGATIO_INVEST_MAX_PERCENT) {
    return { ok: false, reason: 'The Search already takes all your gold.' };
  }
  const next = Math.min(INDAGATIO_INVEST_MAX_PERCENT, current + INDAGATIO_INVEST_STEP_PERCENT);
  return { ok: true, state: withPercent(state, next) };
}

/**
 * Lower the default investment by `INDAGATIO_DIVEST_STEP_PERCENT` point, floored at 0%. Moves no
 * gold. Refused when nothing is invested.
 */
export function divestIndagatio(state: GameState): IndagatioInvestResult {
  const current = state.lifetime.indagatioInvestPercent;
  if (current <= 0) return { ok: false, reason: 'nothing invested' };
  const next = Math.max(0, current - INDAGATIO_DIVEST_STEP_PERCENT);
  return { ok: true, state: withPercent(state, next) };
}
