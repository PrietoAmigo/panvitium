/**
 * Depraedatio account tests (the reserve after the relationship-tier rework). Pins:
 *   - the loan book is gone: a populous lifetime earns no account income without a reserve
 *   - Thesaurus: deposit/withdraw floor semantics (ADR-005); the account's inception at the first
 *     deposit; the surrender charge (base 0.15, a fifth of the old 0.75) and its multipliers
 *   - Fenus interest: fractional accrual (big tick ≡ Σ small ticks), the realised-income tally, and
 *     the freezes (mid-descent, Astiwihad)
 *   - Compounding: the 1% reinvest split after all multipliers; the HUD shows the liquid remainder
 *   - Vesting: the exact exponential drawdown to cash (big tick ≡ Σ small ticks), untaxed by
 *     %-of-gain upkeep, still running after the reserve falls below Tier II
 *   - Annuity: manual surrender barred for the lifetime once chosen
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_GOLD_PER_SECOND,
  BASE_SURRENDER_CHARGE,
  bn,
  computeModifiers,
  createInitialState,
  depositThesaurus,
  FENUS_RATE,
  NEUTRAL_MODIFIERS,
  perSecondRates,
  resourceFlows,
  surrenderCharge,
  thesaurusInterestPerSecond,
  thesaurusRecoveryFraction,
  tick,
  vestingPayout,
  vestingPerSecond,
  withdrawThesaurus,
  type GameState,
} from './index.js';

function fresh(seed = 'faeneratio', t = 0): GameState {
  return createInitialState(seed, t);
}

function withHoard(s: GameState, n: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, hoard: bn(n) } };
}

function withGold(s: GameState, n: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, gold: bn(n) } };
}

function withContracts(s: GameState, ...ids: string[]): GameState {
  return { ...s, lifetime: { ...s.lifetime, syngraphae: ids } };
}

const goldOf = (s: GameState): number => s.lifetime.gold.toNumber();
const hoardOf = (s: GameState): number => s.lifetime.hoard.toNumber();

describe('the loan book is retired', () => {
  it('a populous lifetime with an empty reserve earns only the base gold', () => {
    const s: GameState = { ...fresh(), lifetime: { ...fresh().lifetime, reprobates: 100_000 } };
    expect(perSecondRates(s).gold).toBeCloseTo(BASE_GOLD_PER_SECOND, 9); // no per-capita take
  });
});

describe('Thesaurus — deposit / withdraw', () => {
  it('deposit floors at the spend boundary and moves gold into the reserve', () => {
    const s = withGold(fresh(), 500);
    const r = depositThesaurus(s, 100.7);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(goldOf(r.state)).toBe(400); // 100, not 100.7, left the purse
    expect(hoardOf(r.state)).toBe(100);
  });

  it('the first deposit is the account inception: it starts the account-age clock', () => {
    const s = withGold(fresh(), 500);
    expect(s.lifetime.accountAge).toBeUndefined();
    const r = depositThesaurus(s, 10);
    if (!r.ok) throw new Error('deposit');
    expect(r.state.lifetime.accountAge).toBe(0);
    const aged = tick(r.state, 90).state;
    expect(aged.lifetime.accountAge).toBeCloseTo(90, 9);
    // A later deposit never resets the clock.
    const again = depositThesaurus(withGold(aged, 500), 10);
    if (!again.ok) throw new Error('deposit');
    expect(again.state.lifetime.accountAge).toBeCloseTo(90, 9);
  });

  it('the account-age clock does not run before inception', () => {
    expect(tick(fresh(), 600).state.lifetime.accountAge).toBeUndefined();
  });

  it('refuses a deposit beyond liquid gold or of nothing', () => {
    expect(depositThesaurus(withGold(fresh(), 50), 100).ok).toBe(false);
    expect(depositThesaurus(withGold(fresh(), 500), 100).ok).toBe(true);
    expect(depositThesaurus(withGold(fresh(), 500), 0).ok).toBe(false);
  });

  it('withdraw removes the FULL amount and returns the post-charge remainder, floored', () => {
    const s = withHoard(fresh(), 1000);
    const r = withdrawThesaurus(s, 101, computeModifiers(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(hoardOf(r.state)).toBe(899); // the full 101 left the reserve
    expect(goldOf(r.state)).toBe(85); // floor(101 × 0.85) came back; the 15% charge is forfeit
  });

  it('the base surrender charge is 0.15 (a fifth of the old 0.75), 85% returned', () => {
    expect(BASE_SURRENDER_CHARGE).toBe(0.15);
    expect(surrenderCharge(NEUTRAL_MODIFIERS)).toBeCloseTo(0.15, 12);
    expect(thesaurusRecoveryFraction(NEUTRAL_MODIFIERS)).toBeCloseTo(0.85, 12);
  });

  it('surrenderChargeMul scales the charge, clamped to [0, 1]', () => {
    const at = (m: number): number =>
      surrenderCharge({ ...NEUTRAL_MODIFIERS, surrenderChargeMul: m });
    expect(at(0.67)).toBeCloseTo(0.1005, 12);
    expect(at(1.5)).toBeCloseTo(0.225, 12);
    expect(at(100)).toBe(1);
    expect(at(0)).toBe(0);
  });

  it('refuses a withdrawal beyond the reserve', () => {
    const s = withHoard(fresh(), 50);
    expect(withdrawThesaurus(s, 100, computeModifiers(s)).ok).toBe(false);
  });
});

describe('Thesaurus — Fenus interest', () => {
  it('pays FENUS_RATE × reserve into LIQUID gold each second (the reserve is untouched)', () => {
    const s = withHoard(fresh(), 10_000);
    const mods = computeModifiers(s);
    expect(thesaurusInterestPerSecond(s, mods)).toBeCloseTo(FENUS_RATE * 10_000, 9);
    const after = tick(s, 1).state;
    expect(hoardOf(after)).toBe(10_000);
    expect(goldOf(after)).toBeCloseTo(BASE_GOLD_PER_SECOND + FENUS_RATE * 10_000, 6); // base + interest 5
  });

  it('accrues fractionally: one big tick equals the sum of small ticks', () => {
    const s = withHoard(fresh(), 10_000);
    const big = tick(s, 3600).state;
    let small = s;
    for (let i = 0; i < 36; i++) small = tick(small, 100).state;
    expect(goldOf(small)).toBeCloseTo(goldOf(big), 4);
  });

  it('tallies the realised interest on the account since inception', () => {
    const s = withHoard(fresh(), 10_000);
    const after = tick(s, 60).state;
    expect(after.lifetime.accountIncome?.toNumber()).toBeCloseTo(FENUS_RATE * 10_000 * 60, 6);
    // No reserve, no tally (the field stays absent on a fresh lifetime).
    expect(tick(fresh(), 60).state.lifetime.accountIncome).toBeUndefined();
  });

  it('obeys fenusRateMul', () => {
    const s = withHoard(fresh(), 10_000);
    expect(thesaurusInterestPerSecond(s, { ...NEUTRAL_MODIFIERS, fenusRateMul: 3 })).toBeCloseTo(
      FENUS_RATE * 10_000 * 3,
      9,
    );
  });

  it('is frozen mid-descent and under Astiwihad (the freeze early-returns cover it)', () => {
    const s = withHoard(fresh(), 1_000_000);
    const descent: GameState = { ...s, inKatabasis: true };
    expect(goldOf(tick(descent, 60).state)).toBe(goldOf(s));
    expect(perSecondRates(descent).gold).toBe(0);
    const asleep: GameState = {
      ...s,
      lifetime: { ...s.lifetime, invocations: { astiwihad: 1 } },
    };
    expect(goldOf(tick(asleep, 60).state)).toBe(goldOf(s));
    expect(perSecondRates(asleep).gold).toBe(0);
  });
});

describe('Compounding (Tier II) — the 1% reinvest', () => {
  const contracted = (): GameState => withContracts(withHoard(fresh(), 10_000), 'compounding');

  it('after all multipliers, 1% of the interest deposits into the reserve, 99% pays out', () => {
    const s = contracted();
    const interest = FENUS_RATE * 10_000; // 5/s, goldRateMul 1 here
    const after = tick(s, 1).state;
    expect(hoardOf(after)).toBeCloseTo(10_000 + interest * 0.01, 9);
    expect(goldOf(after)).toBeCloseTo(BASE_GOLD_PER_SECOND + interest * 0.99, 9);
    // The realised-income tally counts the whole payment, the reinvested share included.
    expect(after.lifetime.accountIncome?.toNumber()).toBeCloseTo(interest, 9);
  });

  it('the HUD gold/s shows the liquid remainder only', () => {
    const interest = FENUS_RATE * 10_000;
    expect(perSecondRates(withHoard(fresh(), 10_000)).gold).toBeCloseTo(
      BASE_GOLD_PER_SECOND + interest,
      9,
    );
    expect(perSecondRates(contracted()).gold).toBeCloseTo(
      BASE_GOLD_PER_SECOND + interest * 0.99,
      9,
    );
  });

  it('raises the surrender charge by 50% (0.15 → 0.225)', () => {
    expect(surrenderCharge(computeModifiers(contracted()))).toBeCloseTo(0.225, 12);
  });

  it('stays in force after the reserve falls below Tier II', () => {
    const s = withContracts(withHoard(fresh(), 5_000), 'compounding');
    expect(hoardOf(tick(s, 1).state)).toBeCloseTo(5_000 + FENUS_RATE * 5_000 * 0.01, 9);
    expect(surrenderCharge(computeModifiers(s))).toBeCloseTo(0.225, 12);
  });
});

describe('Vesting (Tier II) — the drawdown to cash', () => {
  const vesting = (hoard: number): GameState => withContracts(withHoard(fresh(), hoard), 'vesting');

  it('vests 1% of the reserve per second (exact exponential), paid to cash with no charge', () => {
    const s = vesting(1_000_000);
    const paid = vestingPayout(s, 1).toNumber();
    expect(paid).toBeCloseTo(1_000_000 * (1 - Math.exp(-0.01)), 6);
    const after = tick(s, 1).state;
    expect(hoardOf(after)).toBeCloseTo(1_000_000 - paid, 6);
    // base gold + the interest on the reserve at the start of the second + the vested principal
    expect(goldOf(after)).toBeCloseTo(BASE_GOLD_PER_SECOND + FENUS_RATE * 1_000_000 + paid, 6);
    expect(vestingPerSecond(s)).toBeCloseTo(10_000, 9);
  });

  it('one big tick equals the sum of small ticks (the drawdown is integrated exactly)', () => {
    const s = vesting(1_000_000);
    expect(vestingPayout(s, 50).toNumber()).toBeCloseTo(1_000_000 * (1 - Math.exp(-0.5)), 6);
    let small = s;
    let paid = 0;
    for (let i = 0; i < 50; i++) {
      const p = vestingPayout(small, 1).toNumber();
      paid += p;
      small = withHoard(small, hoardOf(small) - p);
    }
    expect(paid).toBeCloseTo(vestingPayout(s, 50).toNumber(), 6);
  });

  it('keeps draining after the reserve falls below Tier II, toward zero but never past it', () => {
    const s = vesting(5_000);
    expect(vestingPayout(s, 1).toNumber()).toBeCloseTo(5_000 * (1 - Math.exp(-0.01)), 9);
    const drained = vestingPayout(s, 600).toNumber(); // e^(-6): about 99.75% vests in 10 minutes
    expect(drained).toBeLessThan(5_000);
    expect(drained).toBeCloseTo(5_000 * (1 - Math.exp(-6)), 6);
    expect(vestingPayout(vesting(0), 60).toNumber()).toBe(0);
  });

  it('is inert when not chosen', () => {
    expect(vestingPayout(withHoard(fresh(), 1_000_000), 60).toNumber()).toBe(0);
    expect(vestingPerSecond(withHoard(fresh(), 1_000_000))).toBe(0);
  });

  it('adds to the tally of realised income and joins the gold flow untaxed', () => {
    const s = vesting(1_000_000);
    const after = tick(s, 1).state;
    const paid = vestingPayout(s, 1).toNumber();
    expect(after.lifetime.accountIncome?.toNumber()).toBeCloseTo(FENUS_RATE * 1_000_000 + paid, 6);
    const flows = resourceFlows(s);
    expect(flows.gold.generation).toBeCloseTo(
      BASE_GOLD_PER_SECOND + FENUS_RATE * 1_000_000 + 10_000,
      6,
    );
  });
});

describe('Annuity (Tier II) — the surrender bar', () => {
  it('bars manual withdrawals while in force', () => {
    const s = withContracts(withHoard(fresh(), 20_000), 'annuity');
    const r = withdrawThesaurus(s, 100, computeModifiers(s));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/annuity/i);
  });

  it('keeps the bar for the lifetime, whatever the reserve holds', () => {
    const s = withContracts(withHoard(fresh(), 9_000), 'annuity');
    expect(withdrawThesaurus(s, 100, computeModifiers(s)).ok).toBe(false);
    expect(withdrawThesaurus(withHoard(fresh(), 9_000), 100, NEUTRAL_MODIFIERS).ok).toBe(true);
  });
});
