/**
 * Syngraphae tests (the Depraedatio relationship-tier contracts). Pins:
 *   - the relationship tier from the reserve balance (100 / 10,000 / 1,000,000; floored)
 *   - the catalog: three contracts per tier, three tiers
 *   - choosing: free, one per tier, final for the lifetime, gated on the tier, refused under the
 *     Astiwihad freeze
 *   - no suspension: the tier gates only the choice; a chosen contract holds for the lifetime
 *   - the folds: Interest rate / Long-term investing / Annuity → fenusRateMul, Active management /
 *     Compounding → surrenderChargeMul
 *   - PI's asset tracing: a free Indagatio every 150 s of game time, the RNG untouched without it
 *   - the private item safe (toggle, one item) and the risk-analytics gate
 */
import { describe, expect, it } from 'vitest';
import {
  bn,
  computeModifiers,
  createInitialState,
  privateSafeOpen,
  relationshipTier,
  riskAnalyticsOpen,
  safeItem,
  signSyngrapha,
  surrenderCharge,
  SYNGRAPHAE,
  syngraphaeOfTier,
  syngraphaInForce,
  syngraphaSignable,
  syngraphaById,
  tick,
  toggleSafeItem,
  type GameState,
} from './index.js';

function fresh(seed = 'syngraphae', t = 0): GameState {
  return createInitialState(seed, t);
}

/** A lifetime whose reserve holds `hoard` gold, with the given contracts already chosen. */
function account(hoard: number, ...chosen: string[]): GameState {
  const s = fresh();
  return { ...s, lifetime: { ...s.lifetime, hoard: bn(hoard), syngraphae: chosen } };
}

describe('the relationship tier', () => {
  it('steps at 100, 10,000 and 1,000,000 gold in reserve (tier 0 below 100)', () => {
    const at = (hoard: number): number => relationshipTier(account(hoard));
    expect(at(0)).toBe(0);
    expect(at(99)).toBe(0);
    expect(at(100)).toBe(1);
    expect(at(9_999)).toBe(1);
    expect(at(10_000)).toBe(2);
    expect(at(999_999)).toBe(2);
    expect(at(1_000_000)).toBe(3);
    expect(at(1e12)).toBe(3);
  });

  it('judges the floored balance (99.99 is still Tier 0)', () => {
    expect(relationshipTier(account(99.99))).toBe(0);
  });
});

describe('the catalog', () => {
  it('offers three contracts at each of the three tiers', () => {
    expect(SYNGRAPHAE).toHaveLength(9);
    expect(syngraphaeOfTier(1).map((n) => n.id)).toEqual([
      'interest-rate',
      'long-term',
      'active-management',
    ]);
    expect(syngraphaeOfTier(2).map((n) => n.id)).toEqual(['compounding', 'vesting', 'annuity']);
    expect(syngraphaeOfTier(3).map((n) => n.id)).toEqual(['pi', 'custody-vip', 'risk-algos']);
  });

  it('retired contract ids read as nothing', () => {
    expect(syngraphaById('usura-1')).toBeUndefined();
    expect(syngraphaById('faeneratio-2')).toBeUndefined();
    const legacy = account(1_000_000, 'usura-1', 'custodia-4');
    expect(computeModifiers(legacy).fenusRateMul).toBe(1);
    expect(syngraphaSignable(legacy, syngraphaById('interest-rate')!).signable).toBe(true);
  });
});

describe('signSyngrapha — free, one per tier, final', () => {
  it('chooses a contract for free once the reserve holds its tier', () => {
    const s = { ...account(100), lifetime: { ...account(100).lifetime, gold: bn(0) } };
    const r = signSyngrapha(s, 'interest-rate');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.lifetime.syngraphae).toEqual(['interest-rate']);
    expect(r.state.lifetime.gold.toNumber()).toBe(0); // no fee
  });

  it('refuses a contract whose tier the reserve does not hold', () => {
    const r = signSyngrapha(account(9_999), 'vesting');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/tier 2/);
  });

  it('allows only ONE contract per tier, and the choice is final', () => {
    const r = signSyngrapha(account(100, 'long-term'), 'interest-rate');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/already chosen/);
    expect(signSyngrapha(account(100, 'long-term'), 'long-term').ok).toBe(false);
  });

  it('tiers are independent: one choice at each tier', () => {
    let s = account(1_000_000);
    for (const id of ['active-management', 'annuity', 'risk-algos']) {
      const r = signSyngrapha(s, id);
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
    }
    expect(s.lifetime.syngraphae).toEqual(['active-management', 'annuity', 'risk-algos']);
  });

  it('refuses unknown ids and the Astiwihad freeze', () => {
    expect(signSyngrapha(account(1_000_000), 'usura-1').ok).toBe(false);
    const frozen = account(1_000_000);
    const asleep = { ...frozen, lifetime: { ...frozen.lifetime, invocations: { astiwihad: 1 } } };
    const r = signSyngrapha(asleep, 'pi');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/stillness/i);
  });
});

describe('no suspension: the tier gates only the choice', () => {
  it('a chosen contract stays in force after the reserve falls below its tier', () => {
    expect(syngraphaInForce(account(10_000, 'annuity'), 'annuity')).toBe(true);
    expect(syngraphaInForce(account(0, 'annuity'), 'annuity')).toBe(true);
    expect(computeModifiers(account(0, 'annuity')).fenusRateMul).toBeCloseTo(1.1666, 12);
    expect(syngraphaInForce(account(0), 'annuity')).toBe(false); // not chosen
  });
});

describe('the folds (ADR-022)', () => {
  it('Interest rate: interest ×1.33', () => {
    expect(computeModifiers(account(100, 'interest-rate')).fenusRateMul).toBeCloseTo(1.33, 12);
  });

  it('Long-term investing: interest +10% per hour of account age', () => {
    const s = account(100, 'long-term');
    expect(computeModifiers(s).fenusRateMul).toBe(1); // no inception yet
    const aged = { ...s, lifetime: { ...s.lifetime, accountAge: 2.5 * 3600 } };
    expect(computeModifiers(aged).fenusRateMul).toBeCloseTo(1.25, 12);
  });

  it('Active management: surrender charge −33% (0.15 → 0.1005)', () => {
    expect(surrenderCharge(computeModifiers(account(100, 'active-management')))).toBeCloseTo(
      0.1005,
      12,
    );
  });

  it('the tier folds compose multiplicatively across tiers', () => {
    const s = account(10_000, 'interest-rate', 'annuity');
    expect(computeModifiers(s).fenusRateMul).toBeCloseTo(1.33 * 1.1666, 12);
    const t = account(10_000, 'active-management', 'compounding');
    expect(surrenderCharge(computeModifiers(t))).toBeCloseTo(0.15 * 0.67 * 1.5, 12);
  });
});

describe('PI (Tier III) — automatic asset tracing', () => {
  /** A PI account with a full purse so a failure tier's gold bite is visible but harmless. */
  function traced(hoard = 1_000_000): GameState {
    const s = account(hoard, 'pi');
    return { ...s, lifetime: { ...s.lifetime, gold: bn(1_000) } };
  }

  it('resolves one free Indagatio every 150 s of game time, tagged `tracing`', () => {
    const r1 = tick(traced(), 149);
    expect(r1.events.filter((e) => e.source === 'tracing')).toHaveLength(0);
    expect(r1.state.lifetime.assetTracingElapsed).toBeCloseTo(149, 9);
    const r2 = tick(r1.state, 1);
    const traces = r2.events.filter((e) => e.source === 'tracing');
    expect(traces).toHaveLength(1);
    expect(traces[0]!.actionId).toBe('indagatio');
    expect(r2.state.lifetime.assetTracingElapsed).toBeCloseTo(0, 9);
  });

  it('a long span fires every trace it covers (one big tick ≡ the small ones)', () => {
    const r = tick(traced(), 600);
    expect(r.events.filter((e) => e.source === 'tracing')).toHaveLength(4);
  });

  it('ignores Indagatio efficiency: the interval is fixed at 150 s', () => {
    const s = traced();
    const fast = { ...s, lifetime: { ...s.lifetime, maleficia: ['obsidian_mirror'] } };
    expect(computeModifiers(fast).indagatioEfficiencyMul).toBeGreaterThan(1);
    expect(tick(fast, 149).events.filter((e) => e.source === 'tracing')).toHaveLength(0);
  });

  it('keeps tracing after the reserve falls below Tier III', () => {
    const r = tick(traced(0), 150);
    expect(r.events.filter((e) => e.source === 'tracing')).toHaveLength(1);
  });

  it('draws no RNG without PI (the stream stays byte-identical, ADR-011)', () => {
    const plain = { ...fresh(), lifetime: { ...fresh().lifetime, hoard: bn(1_000_000) } };
    expect(tick(plain, 600).state.rngState).toBe(plain.rngState);
  });
});

describe('Custody VIP (Tier III) — the private item safe', () => {
  function vault(hoard = 1_000_000): GameState {
    const s = account(hoard, 'custody-vip');
    return { ...s, lifetime: { ...s.lifetime, maleficia: ['codex_gigas', 'dybbuk_box'] } };
  }

  it('is open once Custody VIP is chosen, even after the reserve falls below Tier III', () => {
    expect(privateSafeOpen(vault())).toBe(true);
    expect(privateSafeOpen(vault(0))).toBe(true);
    expect(privateSafeOpen(account(1_000_000))).toBe(false);
  });

  it('holds one maleficium: storing another replaces the first; storing it again empties it', () => {
    const a = toggleSafeItem(vault(), 'codex_gigas');
    if (!a.ok) throw new Error(a.reason);
    expect(safeItem(a.state)).toBe('codex_gigas');
    const b = toggleSafeItem(a.state, 'dybbuk_box');
    if (!b.ok) throw new Error(b.reason);
    expect(safeItem(b.state)).toBe('dybbuk_box');
    const c = toggleSafeItem(b.state, 'dybbuk_box');
    if (!c.ok) throw new Error(c.reason);
    expect(safeItem(c.state)).toBeUndefined();
    expect(c.state.lifetime.safeItem).toBeUndefined();
  });

  it('refuses an unowned item and a closed safe', () => {
    expect(toggleSafeItem(vault(), 'spear_of_longinus').ok).toBe(false);
    const closed = {
      ...account(1_000_000),
      lifetime: { ...account(1_000_000).lifetime, maleficia: ['codex_gigas'] },
    };
    expect(toggleSafeItem(closed, 'codex_gigas').ok).toBe(false);
  });

  it('a stored item the player no longer owns reads as an empty safe', () => {
    const a = toggleSafeItem(vault(), 'codex_gigas');
    if (!a.ok) throw new Error(a.reason);
    const spent = { ...a.state, lifetime: { ...a.state.lifetime, maleficia: ['dybbuk_box'] } };
    expect(safeItem(spent)).toBeUndefined();
  });
});

describe('Risk algos (Tier III) — the risk analytics gate', () => {
  it('opens the risk analytics tab once chosen', () => {
    expect(riskAnalyticsOpen(account(1_000_000, 'risk-algos'))).toBe(true);
    expect(riskAnalyticsOpen(account(0, 'risk-algos'))).toBe(true);
    expect(riskAnalyticsOpen(account(1_000_000))).toBe(false);
  });
});
