/**
 * Indagatio investment (03 §2.5) — gold set aside to make the Search more efficient.
 *
 * The player can move liquid gold into a per-lifetime "default investment"
 * (`lifetime.indagatioInvestment`) and pull it back out again. The invested gold grants action
 * efficiency to Indagatio ALONE (it is folded into `indagatioEfficiencyMul` in `computeModifiers`,
 * which only `categoryEfficiency('indagatio')` — the player's own Cast — reads; Suasio/Decimatio/
 * Emptio and the acolyte/Familiar runner channels never see it). Because Indagatio is a time-mode
 * action, more efficiency means a shorter search (`startAction` divides the duration by it).
 *
 * The bonus is LOGARITHMIC: each ten-fold of invested gold adds a flat 5% (per the design brief) —
 *   0 g → +0%,  10 g → +5%,  100 g → +10%,  1,000 g → +15%,  and so on.
 * i.e. `bonus = 0.05 × log10(gold)`, clamped at 0 so below 1 g grants nothing (never a penalty).
 *
 * Invest / divest move a fixed FRACTION of the relevant balance per press (10% of liquid gold in,
 * 10% of the current investment back out), with a one-coin floor so small balances still move.
 * Both are pure gold moves between two lifetime buckets — no cost, no loss on the way back — modelled
 * on the Thesaurus deposit/withdraw pair, and refused under the Morpheus freeze like every other
 * economic action (03 §2.4). The investment lives in `lifetime`, so a descent clears it with the
 * rest of the lifetime's gold.
 */
import { add, floor, gt, lt, lte, min, mul, sub, ONE, ZERO, type BigNum } from './bignum.js';
import { type GameState } from './state.js';

/**
 * Efficiency added per ten-fold of invested gold (the design brief: 10 g → +5%, 100 g → +10%, …).
 * A tuning knob; not sourced from the economy sheet (this feature post-dates it).
 */
export const INDAGATIO_INVESTMENT_EFF_PER_DECADE = 0.05;

/** Fraction of the relevant balance an Invest / Divest press moves (10% of holdings per press). */
export const INDAGATIO_INVEST_FRACTION = 0.1;

/**
 * The Indagatio-efficiency MULTIPLIER granted by the current default investment (≥ 1). Logarithmic:
 * `1 + 0.05 × log10(gold)`, clamped so gold ≤ 1 grants exactly 1× (no bonus, never a penalty).
 * Folded into `indagatioEfficiencyMul` by `computeModifiers`; also read by the UI to show the effect.
 */
export function indagatioInvestmentEfficiencyMul(investment: BigNum): number {
  const inv = floor(investment);
  // At or below one coin, log10 is ≤ 0 — grant no bonus rather than a fractional/negative one.
  if (!gt(inv, ONE)) return 1;
  return 1 + INDAGATIO_INVESTMENT_EFF_PER_DECADE * inv.log10();
}

export type IndagatioInvestResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Move a slice of liquid gold into the default Indagatio investment: `INDAGATIO_INVEST_FRACTION` of
 * current gold, at least one coin, never more than is held. Floored at the spend boundary (ADR-005;
 * gold accrues fractionally but moves in whole coins). Refused under the Morpheus freeze.
 */
export function investIndagatio(state: GameState): IndagatioInvestResult {
  if ((state.lifetime.invocations.morpheus ?? 0) > 0) {
    return { ok: false, reason: 'The world is held in Morpheus’s stillness.' };
  }
  const liquid = floor(state.lifetime.gold);
  if (lte(liquid, ZERO)) return { ok: false, reason: 'no gold to invest' };
  let amount = floor(mul(liquid, INDAGATIO_INVEST_FRACTION));
  if (lt(amount, ONE)) amount = ONE; // one-coin floor so small balances still move
  amount = min(amount, liquid); // never invest more than we hold
  return {
    ok: true,
    state: {
      ...state,
      lifetime: {
        ...state.lifetime,
        gold: sub(state.lifetime.gold, amount),
        indagatioInvestment: add(state.lifetime.indagatioInvestment, amount),
      },
    },
  };
}

/**
 * Pull a slice of the default investment back into liquid gold: `INDAGATIO_INVEST_FRACTION` of the
 * current investment, at least one coin, never more than is invested. The full amount returns — no
 * recovery penalty (unlike the Thesaurus withdrawal); it is the player's own gold, merely set aside.
 * Refused under the Morpheus freeze.
 */
export function divestIndagatio(state: GameState): IndagatioInvestResult {
  if ((state.lifetime.invocations.morpheus ?? 0) > 0) {
    return { ok: false, reason: 'The world is held in Morpheus’s stillness.' };
  }
  const invested = floor(state.lifetime.indagatioInvestment);
  if (lte(invested, ZERO)) return { ok: false, reason: 'nothing invested' };
  let amount = floor(mul(invested, INDAGATIO_INVEST_FRACTION));
  if (lt(amount, ONE)) amount = ONE; // one-coin floor so the last coins still come out
  amount = min(amount, invested); // never divest more than is invested
  return {
    ok: true,
    state: {
      ...state,
      lifetime: {
        ...state.lifetime,
        gold: add(state.lifetime.gold, amount),
        indagatioInvestment: sub(state.lifetime.indagatioInvestment, amount),
      },
    },
  };
}
