/**
 * Syngraphae tests (Depraedatio gold rework spec §4.3 / §13). Pins:
 *   - the catalog: twelve nodes, three linear branches of four, gates 0..3 (the gating rebalance
 *     moved every gate one level down — the first node of each branch is open from the start),
 *     costs 500 → 500,000
 *   - signing: the Avaritia level gate, the branch-order prerequisite, affordability, the burn
 *     (paid, never hoarded, never refunded), the Morpheus freeze refusal
 *   - reset at Katabasis (the commit-side lapse; also pinned in katabasis.test.ts)
 *   - the custodia-2 hoard-milestone bonus in computeModifiers (steps, cap, absent below 1,000)
 *   - the modifier folds: Usura → fenusRateMul, Faeneratio → mutuumPerCapitaMul,
 *     Custodia → thesaurusRecoveryMul, Escheat → the two flat coefficients
 */
import { describe, expect, it } from 'vitest';
import {
  bn,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  enterKatabasis,
  signSyngrapha,
  SYNGRAPHAE,
  SYNGRAPHA_BRANCHES,
  syngraphaBranch,
  syngraphaSignable,
  syngraphaSigned,
  hoardMilestoneBonus,
  type GameState,
} from './index.js';

function fresh(seed = 'syngraphae', t = 0): GameState {
  return createInitialState(seed, t);
}

/** Avaritia at the given level (180^level cumulative Devotion), with a full purse. */
function ready(level: number, gold = 10_000_000): GameState {
  const s = fresh();
  return {
    ...s,
    devotion: { ...s.devotion, avaritia: bn(180 ** level) },
    lifetime: { ...s.lifetime, gold: bn(gold) },
  };
}

const goldOf = (s: GameState): number => s.lifetime.gold.toNumber();

describe('the catalog', () => {
  it('carries twelve nodes in three linear branches of four, gates 1..4', () => {
    expect(SYNGRAPHAE).toHaveLength(12);
    for (const branch of SYNGRAPHA_BRANCHES) {
      const chain = syngraphaBranch(branch);
      expect(chain).toHaveLength(4);
      expect(chain.map((n) => n.gate)).toEqual([0, 1, 2, 3]);
      expect(chain.map((n) => n.cost)).toEqual([500, 5_000, 50_000, 500_000]);
    }
  });

  it('names the three contract nodes (Anatocismus, Escheat, Peculium)', () => {
    const named = SYNGRAPHAE.filter((n) => n.name !== undefined).map((n) => n.name);
    expect(named).toEqual(['Anatocismus', 'Escheat', 'Peculium']);
  });
});

describe('signSyngrapha — gates, order, burn', () => {
  it('signs an available node and BURNS the fee (gold down by exactly the cost)', () => {
    const s = ready(0); // the first node of a branch carries no Avaritia gate at all
    const r = signSyngrapha(s, 'usura-1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(goldOf(r.state)).toBe(10_000_000 - 500);
    expect(r.state.lifetime.hoard.toNumber()).toBe(0); // the fee is never hoarded
    expect(syngraphaSigned(r.state, 'usura-1')).toBe(true);
  });

  it('enforces the Avaritia level gate (usura-1 is ungated; usura-2 gates on level 1)', () => {
    expect(signSyngrapha(ready(0), 'usura-1').ok).toBe(true);
    const s = ready(0);
    const first = signSyngrapha(s, 'usura-1');
    if (!first.ok) throw new Error('sign failed');
    // usura-2 gates on Avaritia 1, even with usura-1 signed and gold in hand.
    expect(signSyngrapha(first.state, 'usura-2').ok).toBe(false);
    const levelled = signSyngrapha(
      { ...first.state, devotion: { ...first.state.devotion, avaritia: bn(180) } },
      'usura-2',
    );
    expect(levelled.ok).toBe(true);
  });

  it('enforces the branch-order prerequisite (linear chains)', () => {
    const s = ready(3); // the deepest gate is now level 3
    expect(signSyngrapha(s, 'usura-2').ok).toBe(false); // usura-1 unsigned
    const gate = syngraphaSignable(s, SYNGRAPHAE.find((n) => n.id === 'usura-2')!);
    expect(gate.signable).toBe(false);
    // The branches are independent: custodia-1 needs no usura node.
    expect(signSyngrapha(s, 'custodia-1').ok).toBe(true);
  });

  it('refuses when unaffordable, already signed, or unknown', () => {
    expect(signSyngrapha(ready(0, 100), 'usura-1').ok).toBe(false);
    const s = ready(0);
    const first = signSyngrapha(s, 'usura-1');
    if (!first.ok) throw new Error('sign failed');
    expect(signSyngrapha(first.state, 'usura-1').ok).toBe(false);
    expect(signSyngrapha(s, 'no-such-contract').ok).toBe(false);
  });

  it('there is no refund path: the catalog exposes no unsign, and Katabasis burns the terms', () => {
    const s = ready(0);
    const signed = signSyngrapha(s, 'faeneratio-1');
    if (!signed.ok) throw new Error('sign failed');
    const { state } = commitKatabasis(enterKatabasis(signed.state));
    expect(state.lifetime.syngraphae).toHaveLength(0); // the terms lapse at the descent
    // The fee stayed burned: kept gold is a fraction of what remained, never cost-restored.
    expect(goldOf(state)).toBeLessThan(goldOf(signed.state));
  });
});

describe('the modifier folds (ADR-022)', () => {
  function signedByFiat(ids: string[], hoard = 0): GameState {
    const s = fresh();
    return {
      ...s,
      lifetime: { ...s.lifetime, syngraphae: ids, hoard: bn(hoard) },
    };
  }

  it('Usura nodes multiply fenusRateMul (1.5 × 1.5 × 2 = 4.5)', () => {
    expect(computeModifiers(signedByFiat(['usura-1'])).fenusRateMul).toBeCloseTo(1.5, 9);
    expect(
      computeModifiers(signedByFiat(['usura-1', 'usura-2', 'usura-3'])).fenusRateMul,
    ).toBeCloseTo(4.5, 9);
  });

  it('Faeneratio nodes multiply mutuumPerCapitaMul (1.5 × 2 = 3)', () => {
    expect(
      computeModifiers(signedByFiat(['faeneratio-1', 'faeneratio-3'])).mutuumPerCapitaMul,
    ).toBeCloseTo(3, 9);
  });

  it('Custodia nodes multiply thesaurusRecoveryMul (1.6 × 1.5 stacks 0.25 to 0.6)', () => {
    const m = computeModifiers(signedByFiat(['custodia-1', 'custodia-3']));
    expect(m.thesaurusRecoveryMul).toBeCloseTo(2.4, 9);
    expect(0.25 * m.thesaurusRecoveryMul).toBeCloseTo(0.6, 9);
  });

  it('Escheat sets the two flat death-duty coefficients', () => {
    const m = computeModifiers(signedByFiat(['faeneratio-2']));
    expect(m.escheatGoldPerMurder).toBe(1);
    expect(m.escheatGoldPerSuicide).toBe(0.5);
    const none = computeModifiers(signedByFiat([]));
    expect(none.escheatGoldPerMurder).toBe(0);
    expect(none.escheatGoldPerSuicide).toBe(0);
  });

  it('custodia-2 folds the hoard-milestone bonus into goldRateMul: steps, cap, absent below 1,000', () => {
    const at = (hoard: number): number => hoardMilestoneBonus(signedByFiat(['custodia-2'], hoard));
    expect(at(999)).toBe(0); // absent below the threshold
    expect(at(1_000)).toBeCloseTo(0.02, 9); // 1 step
    expect(at(9_999)).toBeCloseTo(0.02, 9);
    expect(at(10_000)).toBeCloseTo(0.04, 9); // 2 steps
    expect(at(1e12)).toBeCloseTo(0.2, 9); // 10 steps → the +20% cap
    expect(at(1e15)).toBeCloseTo(0.2, 9); // still capped
    // Unsigned: no bonus whatever the hoard.
    expect(hoardMilestoneBonus(signedByFiat([], 1e12))).toBe(0);
    // And it lands on goldRateMul itself.
    expect(computeModifiers(signedByFiat(['custodia-2'], 10_000)).goldRateMul).toBeCloseTo(1.04, 9);
  });
});
