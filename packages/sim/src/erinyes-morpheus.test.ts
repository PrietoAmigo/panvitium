/**
 * Erinyes + Morpheus apex tests (03 §2.4). Pins:
 *   - catalog entries (gates, free / 90%-souls + 90%-gold cost, max 1)
 *   - Erinyes invoke: kills every reprobate (mints one soul each), dispels active Morpheus,
 *     clears pendingMorpheus, sets pendingErinyes and morpheusLockedOut
 *   - Morpheus invoke: deducts soul + gold cost; refused while morpheusLockedOut
 *   - tick is frozen while Morpheus is active (clock advances, nothing else accrues)
 *   - startAction and investMercatus are blocked under Morpheus
 *   - commitKatabasis: Erinyes overrides → gold 0, maleficia 0, stacks ×2 player efficiency
 *   - commitKatabasis: Morpheus overrides → gold 100%, maleficia 100%, Emptio list preserved
 *   - computeModifiers folds Erinyes's permanent stacks (×2 per stack on playerEfficiencyMul)
 *   - apex modifiers and lockout don't survive Katabasis commit
 */
import { describe, expect, it } from 'vitest';
import {
  bn,
  BASE_GOLD_PER_SECOND,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  enterKatabasis,
  floor,
  invocationById,
  invocationGoldCost,
  invoke,
  startAction,
  tick,
  totalReprobates,
  type GameState,
} from './index.js';
import { investMercatus } from './mercatus.js';

function fresh(seed = 'erinyes-morpheus', t = 0): GameState {
  return createInitialState(seed, t);
}
const goldOf = (s: GameState): number => floor(s.lifetime.gold).toNumber();
const soulsOf = (s: GameState): number => floor(s.souls).toNumber();

/**
 * Build a state with the gates met (souls + invoking power + Sin level for the chosen apex), some
 * gold, and an optional reprobate population. Bypasses normal gameplay so the focused tests don't
 * have to grind to Ira/Acedia 3.
 */
function withGates(opts: {
  apex: 'erinyes' | 'morpheus';
  souls?: number;
  gold?: number;
  reprobates?: number;
}): GameState {
  const s = fresh();
  // Black Salt Pouches (each +1 IP, stackable) cover either gate (Erinyes 10, Morpheus 10).
  const maleficia = Array.from({ length: 20 }, () => 'black_salt_pouch');
  const sin = opts.apex === 'erinyes' ? 'ira' : 'acedia';
  const reprobates = opts.reprobates ?? 0;
  return {
    ...s,
    souls: bn(opts.souls ?? 100_000),
    devotion: { ...s.devotion, [sin]: bn(180 ** 3) }, // Sin level 3
    lifetime: {
      ...s.lifetime,
      gold: bn(opts.gold ?? 1_000_000),
      maleficia,
      reprobates,
    },
  };
}

describe('Catalog', () => {
  it('Erinyes (Ira apex) is free, max 1, IP 10, Sin level 3', () => {
    const def = invocationById('erinyes')!;
    expect(def.sin).toBe('ira');
    expect(def.invokingPower).toBe(10);
    expect(def.sinLevel).toBe(3);
    expect(def.maxActive).toBe(1);
    expect(def.soulCost).toBeUndefined();
    expect(def.goldCost).toBeUndefined();
  });

  it('Morpheus (Acedia apex) costs 90% souls + 90% gold, max 1, IP 10, Sin level 3', () => {
    const def = invocationById('morpheus')!;
    expect(def.sin).toBe('acedia');
    expect(def.invokingPower).toBe(10);
    expect(def.sinLevel).toBe(3);
    expect(def.maxActive).toBe(1);
    expect(def.soulCost).toEqual({ fraction: 0.9, minimum: 0 });
    expect(def.goldCost).toEqual({ fraction: 0.9 });
  });

  it('invocationGoldCost computes the floored 90% gold fraction; 0 for the others', () => {
    const s = withGates({ apex: 'morpheus', gold: 1000 });
    const morpheus = invocationById('morpheus')!;
    expect(floor(invocationGoldCost(s, morpheus)).toNumber()).toBe(900);
    expect(floor(invocationGoldCost(s, invocationById('erinyes')!)).toNumber()).toBe(0);
  });
});

describe('Erinyes invoke', () => {
  it('kills every reprobate (one soul minted each) and sets pendingErinyes + lockout', () => {
    const before = withGates({ apex: 'erinyes', souls: 0, reprobates: 250 });
    const r = invoke(before, 'erinyes');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(totalReprobates(r.state)).toBe(0);
    expect(soulsOf(r.state)).toBe(250); // one per dead reprobate
    expect(r.state.lifetime.invocations.erinyes).toBe(1);
    expect(r.state.lifetime.pendingErinyes).toBe(true);
    expect(r.state.lifetime.morpheusLockedOut).toBe(true);
  });

  it('dispels an active Morpheus and clears pendingMorpheus', () => {
    let s = withGates({ apex: 'morpheus', souls: 10_000, gold: 1_000_000 });
    // Boost Ira to 3 so the Erinyes follow-up clears gates too.
    s = { ...s, devotion: { ...s.devotion, ira: bn(180 ** 3) } };
    const m = invoke(s, 'morpheus');
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.lifetime.invocations.morpheus).toBe(1);
    expect(m.state.lifetime.pendingMorpheus).toBe(true);
    const e = invoke(m.state, 'erinyes');
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.state.lifetime.invocations.morpheus).toBeUndefined();
    expect(e.state.lifetime.pendingMorpheus).toBe(false);
    expect(e.state.lifetime.pendingErinyes).toBe(true);
    expect(e.state.lifetime.morpheusLockedOut).toBe(true);
  });
});

describe('Morpheus invoke', () => {
  it('deducts both soul + gold costs', () => {
    const before = withGates({ apex: 'morpheus', souls: 10_000, gold: 1_000_000 });
    const r = invoke(before, 'morpheus');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 90% of 10_000 souls = 9_000, leaving 1_000; 90% of 1_000_000 gold = 900_000, leaving 100_000.
    expect(soulsOf(r.state)).toBe(1_000);
    expect(goldOf(r.state)).toBe(100_000);
    expect(r.state.lifetime.pendingMorpheus).toBe(true);
  });

  it('refuses when morpheusLockedOut is set (Erinyes-summoned lifetime)', () => {
    const locked: GameState = {
      ...withGates({ apex: 'morpheus' }),
      lifetime: { ...withGates({ apex: 'morpheus' }).lifetime, morpheusLockedOut: true },
    };
    const r = invoke(locked, 'morpheus');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/Erinyes/);
  });

  it('refuses with no gate (not enough invoking power)', () => {
    const s = fresh();
    const r = invoke(s, 'morpheus');
    expect(r.ok).toBe(false);
  });
});

describe('Morpheus freeze: tick is held in stillness', () => {
  it('clock advances but nothing else accrues', () => {
    // A state with Morpheus active and a generous gold accrual would normally produce income.
    const s = withGates({ apex: 'morpheus', gold: 1000 });
    const active: GameState = {
      ...s,
      lifetime: { ...s.lifetime, invocations: { morpheus: 1 }, pendingMorpheus: true },
    };
    const before = goldOf(active);
    const r = tick(active, 60);
    expect(goldOf(r.state)).toBe(before);
    // 60s × 10 gold/s base = 600 would have arrived under a normal tick.
    expect(BASE_GOLD_PER_SECOND).toBeGreaterThan(0); // sanity
    expect(r.state.lastTickAt).toBe(active.lastTickAt + 60_000);
    expect(r.events).toEqual([]);
  });
});

describe('Morpheus blocks Opera + Builds', () => {
  it('startAction refuses with a recognisable reason', () => {
    const s = withGates({ apex: 'morpheus', gold: 100_000 });
    const frozen: GameState = {
      ...s,
      lifetime: { ...s.lifetime, invocations: { morpheus: 1 } },
    };
    const r = startAction(frozen, 'suggestion');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/Morpheus/);
  });

  it('investMercatus refuses with the same Morpheus stillness reason', () => {
    const s = withGates({ apex: 'morpheus', gold: 100_000 });
    const frozen: GameState = {
      ...s,
      devotion: { ...s.devotion, gula: bn(180) },
      lifetime: { ...s.lifetime, invocations: { morpheus: 1 } },
    };
    const r = investMercatus(frozen, 'gula');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/Morpheus/);
  });
});

describe('Erinyes carry-over at commitKatabasis', () => {
  it('zeros gold + maleficia keep, stacks the permanent player-efficiency ×2', () => {
    const before = withGates({ apex: 'erinyes', gold: 500_000 });
    const live: GameState = {
      ...before,
      lifetime: {
        ...before.lifetime,
        // Some maleficia to test the (zeroed) chance.
        maleficia: ['black_salt_pouch', 'iron_nail', 'spear_of_longinus'],
        pendingErinyes: true,
      },
    };
    const torn = enterKatabasis(live);
    const { state, recap } = commitKatabasis(torn);
    expect(floor(recap.goldKept).toNumber()).toBe(0);
    expect(recap.maleficiaKept).toEqual([]);
    expect(recap.maleficiaLost.length).toBe(3);
    expect(state.erinyesEfficiencyStacks).toBe(1);
    // Apex pending flags clear with the new lifetime.
    expect(state.lifetime.pendingErinyes ?? false).toBe(false);
    expect(state.lifetime.morpheusLockedOut ?? false).toBe(false);
  });

  it('stacks compose: two committed Erinyes give ×4 player efficiency', () => {
    const base = computeModifiers(fresh()).playerEfficiencyMul;
    const after = computeModifiers({ ...fresh(), erinyesEfficiencyStacks: 2 });
    expect(after.playerEfficiencyMul).toBeCloseTo(base * 4, 6);
  });
});

describe('Morpheus carry-over at commitKatabasis', () => {
  it('maxes gold + maleficia keep and preserves the Emptio list', () => {
    const before = withGates({ apex: 'morpheus', gold: 200_000 });
    const live: GameState = {
      ...before,
      lifetime: {
        ...before.lifetime,
        maleficia: ['black_salt_pouch', 'iron_nail'],
        emptioList: ['obsidian_mirror'], // surfaced but not yet bought
        pendingMorpheus: true,
      },
    };
    const torn = enterKatabasis(live);
    const { state, recap } = commitKatabasis(torn);
    // Gold kept at 100% of pre-descent (no Mercatus depths, so liquidation adds nothing).
    expect(floor(recap.goldKept).toNumber()).toBe(200_000);
    expect(recap.maleficiaKept).toEqual(live.lifetime.maleficia);
    expect(recap.maleficiaLost).toEqual([]);
    expect(state.lifetime.emptioList).toEqual(['obsidian_mirror']); // preserved
    // Erinyes stacks did NOT increment; Morpheus doesn't grant the permanent boost.
    expect(state.erinyesEfficiencyStacks ?? 0).toBe(0);
    expect(state.lifetime.pendingMorpheus ?? false).toBe(false);
  });
});

describe('Mutual exclusion at commit when both flags were set', () => {
  it('Erinyes wins outright; Morpheus carry-over does not apply', () => {
    // Synthetic edge case: even if both pending flags ended up true, the invoke logic clears
    // pendingMorpheus on Erinyes; this asserts the commit-side mutex regardless.
    const before = withGates({ apex: 'erinyes', gold: 500_000 });
    const live: GameState = {
      ...before,
      lifetime: {
        ...before.lifetime,
        maleficia: ['black_salt_pouch'],
        emptioList: ['obsidian_mirror'],
        pendingErinyes: true,
        pendingMorpheus: true, // shouldn't normally happen
      },
    };
    const torn = enterKatabasis(live);
    const { state, recap } = commitKatabasis(torn);
    expect(floor(recap.goldKept).toNumber()).toBe(0); // Erinyes
    expect(recap.maleficiaKept).toEqual([]); // Erinyes
    expect(state.lifetime.emptioList).toEqual([]); // Morpheus's preservation does NOT apply
  });
});
