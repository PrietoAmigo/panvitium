import { describe, it, expect } from 'vitest';
import { bn, floor } from './bignum.js';
import { createInitialState, type GameState } from './state.js';
import {
  indagatioInvestmentEfficiencyMul,
  indagatioInvestmentGold,
  investIndagatio,
  divestIndagatio,
} from './indagatio.js';
import { categoryEfficiency, computeModifiers } from './modifiers.js';
import { ACTIONS, startAction } from './actions.js';
import { commitKatabasis, enterKatabasis } from './katabasis.js';

const fresh = (): GameState => createInitialState('seed', 0);
const withLifetime = (patch: Partial<GameState['lifetime']>): GameState => {
  const base = fresh();
  return { ...base, lifetime: { ...base.lifetime, ...patch } };
};

describe('indagatioInvestmentEfficiencyMul (03 §2.5 — logarithmic, +5% per decade)', () => {
  it('follows the design curve: 0→+0%, 10→+5%, 100→+10%, 1000→+15%', () => {
    expect(indagatioInvestmentEfficiencyMul(bn(0))).toBe(1);
    expect(indagatioInvestmentEfficiencyMul(bn(10))).toBeCloseTo(1.05, 10);
    expect(indagatioInvestmentEfficiencyMul(bn(100))).toBeCloseTo(1.1, 10);
    expect(indagatioInvestmentEfficiencyMul(bn(1000))).toBeCloseTo(1.15, 10);
    expect(indagatioInvestmentEfficiencyMul(bn(1_000_000))).toBeCloseTo(1.3, 10); // 6 decades → +30%
  });

  it('grants nothing at or below one coin (never a penalty)', () => {
    expect(indagatioInvestmentEfficiencyMul(bn(1))).toBe(1);
    expect(indagatioInvestmentEfficiencyMul(bn(0.5))).toBe(1);
  });

  it('is smooth between the decades', () => {
    // 5 g → 1 + 0.05·log10(5) ≈ 1.03495.
    expect(indagatioInvestmentEfficiencyMul(bn(5))).toBeCloseTo(1 + 0.05 * Math.log10(5), 10);
  });
});

describe('investIndagatio (raises the default percentage by 2 points)', () => {
  it('sets 2% per press and moves no gold', () => {
    const r = investIndagatio(withLifetime({ gold: bn(1000) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.lifetime.indagatioInvestPercent).toBe(2);
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(1000);
  });

  it('accumulates across presses', () => {
    let s = fresh();
    for (let i = 0; i < 3; i += 1) {
      const r = investIndagatio(s);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.state;
    }
    expect(s.lifetime.indagatioInvestPercent).toBe(6);
  });

  it('works with no gold held (the percentage is a default, not a transfer)', () => {
    const r = investIndagatio(withLifetime({ gold: bn(0) }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.lifetime.indagatioInvestPercent).toBe(2);
  });

  it('caps at 100% and is refused once there', () => {
    const r = investIndagatio(withLifetime({ indagatioInvestPercent: 99 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.lifetime.indagatioInvestPercent).toBe(100);
    expect(investIndagatio(withLifetime({ indagatioInvestPercent: 100 })).ok).toBe(false);
  });

  it('is allowed under the Astiwihad freeze (it moves no gold)', () => {
    const r = investIndagatio(withLifetime({ invocations: { astiwihad: 1 } }));
    expect(r.ok).toBe(true);
  });
});

describe('divestIndagatio (lowers the default percentage by 1 point)', () => {
  it('takes 1 point off per press and moves no gold', () => {
    const r = divestIndagatio(withLifetime({ gold: bn(500), indagatioInvestPercent: 6 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.lifetime.indagatioInvestPercent).toBe(5);
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(500);
  });

  it('drains to 0% and is then refused', () => {
    let s = withLifetime({ indagatioInvestPercent: 2 });
    for (let i = 0; i < 2; i += 1) {
      const r = divestIndagatio(s);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.state;
    }
    expect(s.lifetime.indagatioInvestPercent).toBe(0);
    expect(divestIndagatio(s).ok).toBe(false);
  });
});

describe('indagatioInvestmentGold (the live share of the gold held)', () => {
  it('is the percentage of the gold held, in whole coins', () => {
    expect(indagatioInvestmentGold(withLifetime({ gold: bn(1000) })).toNumber()).toBe(0);
    const s = withLifetime({ gold: bn(1000), indagatioInvestPercent: 4 });
    expect(indagatioInvestmentGold(s).toNumber()).toBe(40);
    // Floored at both ends (ADR-005): 1,234.9 g → 1,234 g held → 7% = 86.38 → 86.
    const odd = withLifetime({ gold: bn(1234.9), indagatioInvestPercent: 7 });
    expect(indagatioInvestmentGold(odd).toNumber()).toBe(86);
  });

  it('is exact where a fractional multiply would round down (29% of 100 g)', () => {
    // 100 × 0.29 is 28.999… in floating point; the whole-point multiply-then-divide gives 29.
    const s = withLifetime({ gold: bn(100), indagatioInvestPercent: 29 });
    expect(indagatioInvestmentGold(s).toNumber()).toBe(29);
  });

  it('fluctuates with the treasury', () => {
    const s = withLifetime({ gold: bn(1000), indagatioInvestPercent: 10 });
    expect(indagatioInvestmentGold(s).toNumber()).toBe(100);
    const richer = { ...s, lifetime: { ...s.lifetime, gold: bn(5000) } };
    expect(indagatioInvestmentGold(richer).toNumber()).toBe(500);
  });

  it('never exceeds the gold held, at 100%', () => {
    const s = withLifetime({ gold: bn(777.5), indagatioInvestPercent: 100 });
    expect(indagatioInvestmentGold(s).toNumber()).toBe(777);
  });
});

describe('investment feeds Indagatio efficiency alone (ADR-022)', () => {
  it('lifts indagatioEfficiencyMul and the Indagatio category efficiency', () => {
    // 10% of 1,000 g = 100 g → +10%.
    const invested = withLifetime({ gold: bn(1000), indagatioInvestPercent: 10 });
    expect(computeModifiers(invested).indagatioEfficiencyMul).toBeCloseTo(1.1, 10);
    // categoryEfficiency = playerEfficiencyMul × indagatioEfficiencyMul; a fresh game's playerEff is 1.
    expect(categoryEfficiency(invested, 'indagatio')).toBeCloseTo(1.1, 10);
    expect(categoryEfficiency(fresh(), 'indagatio')).toBeCloseTo(1, 10);
  });

  it('leaves the other action categories untouched', () => {
    const invested = withLifetime({ gold: bn(10000), indagatioInvestPercent: 10 });
    const mods = computeModifiers(invested);
    expect(mods.logosEfficiencyMul).toBe(1);
    expect(mods.emptioEfficiencyMul).toBe(1);
    expect(categoryEfficiency(invested, 'emptio')).toBeCloseTo(1, 10);
  });
});

describe('the Cast spends the share of gold held (03 §2.5)', () => {
  it('bakes the bonus into the launched search, spends the gold and keeps the percentage', () => {
    // 50% of 2,000 g = 1,000 g staked → +15% Indagatio efficiency at cast.
    const invested = withLifetime({ gold: bn(2000), indagatioInvestPercent: 50 });
    expect(categoryEfficiency(invested, 'indagatio')).toBeCloseTo(1.15, 10);
    const r = startAction(invested, 'indagatio');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The launched search's duration used the staked efficiency (baseTime / 1.15)…
    expect(r.state.lifetime.actionQueue[0]!.remainingSeconds).toBeCloseTo(
      ACTIONS.indagatio!.baseTimeSeconds / 1.15,
      6,
    );
    // …the 1,000 g is spent (Indagatio has no other gold cost)…
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(1000);
    // …and the default stands, so the next Search would pour 50% of the remaining 1,000 g.
    expect(r.state.lifetime.indagatioInvestPercent).toBe(50);
    expect(indagatioInvestmentGold(r.state).toNumber()).toBe(500);
  });

  it('spends nothing at 0%', () => {
    const r = startAction(withLifetime({ gold: bn(2000) }), 'indagatio');
    expect(r.ok).toBe(true);
    if (r.ok) expect(floor(r.state.lifetime.gold).toNumber()).toBe(2000);
  });

  it('can pour in all the gold held at 100%', () => {
    const r = startAction(
      withLifetime({ gold: bn(640), indagatioInvestPercent: 100 }),
      'indagatio',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(floor(r.state.lifetime.gold).toNumber()).toBe(0);
  });

  it('is spent only by an Indagatio cast, not by starting another rite', () => {
    const invested = withLifetime({
      gold: bn(5000),
      influence: bn(50),
      indagatioInvestPercent: 50,
    });
    const r = startAction(invested, 'suggestion');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const suggestionGold = ACTIONS.suggestion!.cost.gold ?? 0;
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(5000 - suggestionGold);
    expect(r.state.lifetime.indagatioInvestPercent).toBe(50);
  });
});

describe('the percentage resets with the lifetime at Katabasis', () => {
  it('starts the new lifetime at 0%', () => {
    const before = withLifetime({ gold: bn(1000), indagatioInvestPercent: 30 });
    const { state } = commitKatabasis(enterKatabasis(before));
    expect(state.lifetime.indagatioInvestPercent).toBe(0);
  });
});
