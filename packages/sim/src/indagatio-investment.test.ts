import { describe, it, expect } from 'vitest';
import { bn, floor } from './bignum.js';
import { createInitialState, type GameState } from './state.js';
import { indagatioInvestmentEfficiencyMul, investIndagatio, divestIndagatio } from './indagatio.js';
import { categoryEfficiency, computeModifiers } from './modifiers.js';
import { ACTIONS, startAction } from './actions.js';

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

describe('investIndagatio (moves 10% of liquid gold into the default stake)', () => {
  it('invests one tenth of current gold, floored', () => {
    const r = investIndagatio(withLifetime({ gold: bn(1000) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(900);
    expect(floor(r.state.lifetime.indagatioInvestment).toNumber()).toBe(100);
  });

  it('moves at least one coin when 10% floors to zero', () => {
    const r = investIndagatio(withLifetime({ gold: bn(5) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(4);
    expect(floor(r.state.lifetime.indagatioInvestment).toNumber()).toBe(1);
  });

  it('accumulates across presses (10% of the shrinking balance each time)', () => {
    let s = withLifetime({ gold: bn(1000) });
    const step1 = investIndagatio(s);
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;
    s = step1.state; // gold 900, investment 100
    const step2 = investIndagatio(s);
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;
    expect(floor(step2.state.lifetime.gold).toNumber()).toBe(810); // 900 − 90
    expect(floor(step2.state.lifetime.indagatioInvestment).toNumber()).toBe(190); // 100 + 90
  });

  it('refuses when there is no gold to invest', () => {
    const r = investIndagatio(withLifetime({ gold: bn(0) }));
    expect(r.ok).toBe(false);
  });

  it('is refused under the Astiwihad freeze', () => {
    const r = investIndagatio(withLifetime({ gold: bn(1000), invocations: { astiwihad: 1 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('Astiwihad');
  });
});

describe('divestIndagatio (pulls 10% of the stake back, in full — no penalty)', () => {
  it('returns one tenth of the investment to liquid gold, floored', () => {
    const r = divestIndagatio(withLifetime({ gold: bn(0), indagatioInvestment: bn(190) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(floor(r.state.lifetime.indagatioInvestment).toNumber()).toBe(171); // 190 − 19
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(19); // full amount back, no recovery loss
  });

  it('moves at least one coin when 10% floors to zero, and can drain to empty', () => {
    let s = withLifetime({ gold: bn(0), indagatioInvestment: bn(3) });
    for (let i = 0; i < 3; i += 1) {
      const r = divestIndagatio(s);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.state;
    }
    expect(floor(s.lifetime.indagatioInvestment).toNumber()).toBe(0);
    expect(floor(s.lifetime.gold).toNumber()).toBe(3); // every coin recovered
    expect(divestIndagatio(s).ok).toBe(false); // nothing left to pull
  });

  it('refuses when nothing is invested', () => {
    const r = divestIndagatio(withLifetime({ indagatioInvestment: bn(0) }));
    expect(r.ok).toBe(false);
  });

  it('is refused under the Astiwihad freeze', () => {
    const r = divestIndagatio(
      withLifetime({ indagatioInvestment: bn(100), invocations: { astiwihad: 1 } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('Astiwihad');
  });
});

describe('investment feeds Indagatio efficiency alone (ADR-022)', () => {
  it('lifts indagatioEfficiencyMul and the Indagatio category efficiency', () => {
    const invested = withLifetime({ indagatioInvestment: bn(100) });
    expect(computeModifiers(invested).indagatioEfficiencyMul).toBeCloseTo(1.1, 10);
    // categoryEfficiency = playerEfficiencyMul × indagatioEfficiencyMul; a fresh game's playerEff is 1.
    expect(categoryEfficiency(invested, 'indagatio')).toBeCloseTo(1.1, 10);
    expect(categoryEfficiency(fresh(), 'indagatio')).toBeCloseTo(1, 10);
  });

  it('leaves the other action categories untouched', () => {
    const invested = withLifetime({ indagatioInvestment: bn(1000) });
    const mods = computeModifiers(invested);
    expect(mods.suasioEfficiencyMul).toBe(1);
    expect(mods.decimatioEfficiencyMul).toBe(1);
    expect(mods.emptioEfficiencyMul).toBe(1);
    expect(categoryEfficiency(invested, 'emptio')).toBeCloseTo(1, 10);
  });
});

describe('the Cast consumes the investment (one-shot, 03 §2.5)', () => {
  it('bakes the bonus into the launched search and then zeroes the stake', () => {
    const invested = withLifetime({ gold: bn(1000), indagatioInvestment: bn(1000) });
    // 1,000 g staked → +15% Indagatio efficiency at cast.
    expect(categoryEfficiency(invested, 'indagatio')).toBeCloseTo(1.15, 10);
    const r = startAction(invested, 'indagatio');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The launched search's duration used the staked efficiency (baseTime / 1.15)…
    expect(r.state.lifetime.actionQueue[0]!.remainingSeconds).toBeCloseTo(
      ACTIONS.indagatio!.baseTimeSeconds / 1.15,
      6,
    );
    // …the stake is spent (zeroed), not refunded to gold (Indagatio has no gold cost)…
    expect(floor(r.state.lifetime.indagatioInvestment).toNumber()).toBe(0);
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(1000);
    // …so a later search would run at base speed.
    expect(categoryEfficiency(r.state, 'indagatio')).toBeCloseTo(1, 10);
  });

  it('is consumed only by an Indagatio cast, not by starting another rite', () => {
    // Starting Caedes must leave the staked investment intact — only the Search spends it.
    const invested = withLifetime({ gold: bn(5000), indagatioInvestment: bn(1000) });
    const r = startAction(invested, 'caedes');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(floor(r.state.lifetime.indagatioInvestment).toNumber()).toBe(1000);
  });
});
