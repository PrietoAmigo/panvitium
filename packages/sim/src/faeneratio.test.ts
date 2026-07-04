/**
 * Faeneratio loop tests (Depraedatio gold rework spec §13). Pins:
 *   - Mutuum: open from the start (the gating rebalance removed the Avaritia-I gate); scales with
 *     reprobates; obeys `faenerationOutputMul`, `mutuumPerCapitaMul` and `goldRateMul`; one big
 *     tick equals the sum of small ticks
 *   - Thesaurus: deposit/withdraw floor semantics (ADR-005); withdraw recovery math + the 0.9 cap;
 *     fractional interest accrual (big tick ≡ Σ small ticks); interest frozen mid-descent and
 *     under Morpheus
 *   - Anatocismus (usura-4): the 50/50 split after all multipliers — hoard grows, liquid gets the
 *     other half, the HUD rate shows the liquid half only
 *   - Foedus: global tier boundaries at T0 decades, cap 4, tier 0 below T0; the upkeep discount on
 *     a ramped (Panvitium) cost; `foedusOptOut` suppression
 */
import { describe, expect, it } from 'vitest';
import {
  bn,
  computeModifiers,
  createInitialState,
  depositThesaurus,
  FENUS_RATE,
  foedusTier,
  foedusUpkeepMul,
  compositumFoedusUpkeepMul,
  COMPOSITA,
  MUTUUM_PER_CAPITA,
  mutuumGoldPerSecond,
  NEUTRAL_MODIFIERS,
  perSecondRates,
  thesaurusInterestPerSecond,
  thesaurusRecoveryFraction,
  tick,
  withdrawThesaurus,
  type GameState,
} from './index.js';

function fresh(seed = 'faeneratio', t = 0): GameState {
  return createInitialState(seed, t);
}

function withReprobates(s: GameState, n: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, reprobates: n } };
}

function withHoard(s: GameState, n: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, hoard: bn(n) } };
}

function withGold(s: GameState, n: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, gold: bn(n) } };
}

const goldOf = (s: GameState): number => s.lifetime.gold.toNumber();

describe('Mutuum — the loan book', () => {
  it('is open from the start (the gating rebalance removed the Avaritia-I gate)', () => {
    const s = withReprobates(fresh(), 1000); // Avaritia devotion 0
    expect(mutuumGoldPerSecond(s, computeModifiers(s))).toBeCloseTo(MUTUUM_PER_CAPITA * 1000, 9);
  });

  it('scales linearly with the living reprobates', () => {
    const s = withReprobates(fresh(), 1000);
    const mods = computeModifiers(s);
    expect(mutuumGoldPerSecond(s, mods)).toBeCloseTo(MUTUUM_PER_CAPITA * 1000, 9);
    const twice = withReprobates(fresh(), 2000);
    expect(mutuumGoldPerSecond(twice, computeModifiers(twice))).toBeCloseTo(
      MUTUUM_PER_CAPITA * 2000,
      9,
    );
  });

  it('obeys mutuumPerCapitaMul; the tick composes faenerationOutputMul and goldRateMul on top', () => {
    const s = withReprobates(fresh(), 1000);
    const boosted = mutuumGoldPerSecond(s, { ...NEUTRAL_MODIFIERS, mutuumPerCapitaMul: 2 });
    expect(boosted).toBeCloseTo(MUTUUM_PER_CAPITA * 1000 * 2, 9);
    // Through the tick: a Plutus (faenerationOutputMul) and Midas (goldRateMul ×3) both scale the
    // realised take.
    const base = tick(s, 1).state;
    const withMidas: GameState = {
      ...s,
      lifetime: { ...s.lifetime, invocations: { midas: 1 } },
    };
    const midas = tick(withMidas, 1).state;
    // Midas: ×3 on the whole line (base 2 + mutuum 50).
    expect(goldOf(midas)).toBeCloseTo(goldOf(base) * 3, 6);
  });

  it('one big tick equals the sum of small ticks (population steady over the span)', () => {
    // 100 reprobates over 10 s accrue <1 in both death pools, so the population — and with it the
    // Mutuum take — holds steady; the two paths must then agree exactly (ADR-004).
    const s = withReprobates(fresh(), 100);
    const big = tick(s, 10).state;
    let small = s;
    for (let i = 0; i < 100; i++) small = tick(small, 0.1).state;
    expect(goldOf(small)).toBeCloseTo(goldOf(big), 6);
  });
});

describe('Thesaurus — deposit / withdraw', () => {
  it('deposit floors at the spend boundary and moves gold into the hoard', () => {
    const s = withGold(fresh(), 500);
    const r = depositThesaurus(s, 100.7);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(goldOf(r.state)).toBe(400); // 100, not 100.7, left the purse
    expect(r.state.lifetime.hoard.toNumber()).toBe(100);
  });

  it('refuses a deposit beyond liquid gold or of nothing; Avaritia 0 is no bar', () => {
    expect(depositThesaurus(withGold(fresh(), 50), 100).ok).toBe(false);
    expect(depositThesaurus(withGold(fresh(), 500), 100).ok).toBe(true); // no gate any more
    expect(depositThesaurus(withGold(fresh(), 500), 0).ok).toBe(false);
  });

  it('withdraw removes the FULL amount from the hoard and returns the recovery fraction, floored', () => {
    const s = withHoard(fresh(), 1000);
    const r = withdrawThesaurus(s, 101, computeModifiers(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.lifetime.hoard.toNumber()).toBe(899); // the full 101 left the vault
    expect(goldOf(r.state)).toBe(25); // floor(101 × 0.25) came back
  });

  it('withdraw recovery is capped at 0.9 after all multipliers', () => {
    expect(thesaurusRecoveryFraction(NEUTRAL_MODIFIERS)).toBeCloseTo(0.25, 9);
    expect(
      thesaurusRecoveryFraction({ ...NEUTRAL_MODIFIERS, thesaurusRecoveryMul: 2 }),
    ).toBeCloseTo(0.5, 9);
    expect(thesaurusRecoveryFraction({ ...NEUTRAL_MODIFIERS, thesaurusRecoveryMul: 100 })).toBe(
      0.9,
    );
  });

  it('refuses a withdrawal beyond the hoard', () => {
    const s = withHoard(fresh(), 50);
    expect(withdrawThesaurus(s, 100, computeModifiers(s)).ok).toBe(false);
  });
});

describe('Thesaurus — Fenus interest', () => {
  it('pays FENUS_RATE × hoard into LIQUID gold each second (the hoard itself is untouched)', () => {
    const s = withHoard(fresh(), 10_000);
    const mods = computeModifiers(s);
    expect(thesaurusInterestPerSecond(s, mods)).toBeCloseTo(FENUS_RATE * 10_000, 9);
    const after = tick(s, 1).state;
    expect(after.lifetime.hoard.toNumber()).toBe(10_000);
    expect(goldOf(after)).toBeCloseTo(2 + FENUS_RATE * 10_000, 6); // base 2 + interest 5
  });

  it('accrues fractionally: one big offline tick equals the sum of small ticks', () => {
    const s = withHoard(fresh(), 10_000);
    const big = tick(s, 3600).state;
    let small = s;
    for (let i = 0; i < 36; i++) small = tick(small, 100).state;
    expect(goldOf(small)).toBeCloseTo(goldOf(big), 4);
  });

  it('obeys fenusRateMul', () => {
    const s = withHoard(fresh(), 10_000);
    expect(thesaurusInterestPerSecond(s, { ...NEUTRAL_MODIFIERS, fenusRateMul: 3 })).toBeCloseTo(
      FENUS_RATE * 10_000 * 3,
      9,
    );
  });

  it('is frozen mid-descent and under Morpheus (the freeze early-returns cover it)', () => {
    const s = withHoard(fresh(), 1_000_000);
    const descent: GameState = { ...s, inKatabasis: true };
    expect(goldOf(tick(descent, 60).state)).toBe(goldOf(s));
    expect(perSecondRates(descent).gold).toBe(0);
    const asleep: GameState = {
      ...s,
      lifetime: { ...s.lifetime, invocations: { morpheus: 1 } },
    };
    expect(goldOf(tick(asleep, 60).state)).toBe(goldOf(s));
    expect(perSecondRates(asleep).gold).toBe(0);
  });
});

describe('Anatocismus (usura-4) — the 50/50 split', () => {
  /** The full Usura chain signed by fiat; hoard 10,000. Fenus ×(1.5·1.5·2) = ×4.5. */
  function contracted(): GameState {
    const s = withHoard(fresh(), 10_000);
    return {
      ...s,
      lifetime: {
        ...s.lifetime,
        syngraphae: ['usura-1', 'usura-2', 'usura-3', 'usura-4'],
      },
    };
  }

  it('after all multipliers, half the interest deposits into the hoard, half pays out liquid', () => {
    const s = contracted();
    const mods = computeModifiers(s);
    expect(mods.fenusRateMul).toBeCloseTo(4.5, 9);
    const interest = FENUS_RATE * 4.5 * 10_000; // 22.5/s, goldRateMul 1 here
    const after = tick(s, 1).state;
    expect(after.lifetime.hoard.toNumber()).toBeCloseTo(10_000 + interest / 2, 6);
    expect(goldOf(after)).toBeCloseTo(2 + interest / 2, 6); // base 2 + the liquid half
  });

  it('the HUD gold/s shows the liquid half only', () => {
    const s = contracted();
    const unsplit: GameState = {
      ...s,
      lifetime: { ...s.lifetime, syngraphae: ['usura-1', 'usura-2', 'usura-3'] },
    };
    const interest = FENUS_RATE * (1.5 * 1.5 * 2) * 10_000;
    expect(perSecondRates(unsplit).gold).toBeCloseTo(2 + interest, 6);
    expect(perSecondRates(s).gold).toBeCloseTo(2 + interest / 2, 6);
  });
});

describe('Foedus — the global hoard tier', () => {
  it('steps at T0 decades (1e4, 1e5, 1e6, 1e7), capped at 4, tier 0 below T0', () => {
    const at = (hoard: number): number => foedusTier(withHoard(fresh(), hoard));
    expect(at(0)).toBe(0);
    expect(at(9_999)).toBe(0);
    expect(at(10_000)).toBe(1);
    expect(at(99_999)).toBe(1);
    expect(at(100_000)).toBe(2);
    expect(at(1_000_000)).toBe(3);
    expect(at(10_000_000)).toBe(4);
    expect(at(1e12)).toBe(4); // the cap
  });

  it('the upkeep multiplier is 1 − 0.125 × tier', () => {
    expect(foedusUpkeepMul(0)).toBe(1);
    expect(foedusUpkeepMul(1)).toBeCloseTo(0.875, 9);
    expect(foedusUpkeepMul(4)).toBeCloseTo(0.5, 9);
  });

  it('discounts a ramped (Panvitium) computed cost — the eᵗ ramp takes the multiplier', () => {
    // Panvitium's influence upkeep (no interest cross-talk on the influence side): two states
    // differing only in hoard tier must differ in influence drain by exactly the Foedus factor.
    const base = (hoard: number): GameState => {
      const s = withHoard(withGold(fresh('panv'), 1e12), hoard);
      return {
        ...s,
        lifetime: {
          ...s.lifetime,
          influence: bn(90),
          maxInfluence: bn(1e9),
          activeToggles: ['panvitium'],
          toggleDurations: { panvitium: 2 }, // two seconds into the ramp
        },
      };
    };
    const influenceCost = (s: GameState): number => {
      const after = tick(s, 0.1).state;
      // Isolate the upkeep leg: (influence income over the tick) − (net influence change).
      const control: GameState = { ...s, lifetime: { ...s.lifetime, activeToggles: [] } };
      const controlAfter = tick(control, 0.1).state;
      return controlAfter.lifetime.influence.toNumber() - after.lifetime.influence.toNumber();
    };
    const full = influenceCost(base(0)); // tier 0
    const discounted = influenceCost(base(10_000_000)); // tier 4 → ×0.5
    expect(full).toBeGreaterThan(0);
    expect(discounted / full).toBeCloseTo(0.5, 3);
  });

  it('foedusOptOut suppresses the discount for that ceremony', () => {
    const rich = withHoard(fresh(), 10_000_000); // tier 4
    const def = COMPOSITA.panvitium!;
    expect(compositumFoedusUpkeepMul(rich, def)).toBeCloseTo(0.5, 9);
    expect(compositumFoedusUpkeepMul(rich, { ...def, foedusOptOut: true })).toBe(1);
  });
});
