/**
 * Katabasis-modifying apex tests (03 §2.4) — Erinyes + Astiwihad — plus the one-apex-per-lifetime
 * rule and Morpheus's reworked reprobate → desidia conversion. Pins:
 *   - catalog entries (gates, free, max 1; Morpheus's reprobate-fraction upkeep)
 *   - Erinyes invoke: kills every reprobate (mints one soul each), sets pendingErinyes + apexInvoked
 *   - Astiwihad invoke: sets pendingAstiwihad + apexInvoked; the tick is then frozen (world-still)
 *   - one apex kind per lifetime: a different apex is refused even after dispelling the first; the
 *     same kind may be re-summoned
 *   - the Astiwihad freeze halts income, dynamics, acolyte runners, and blocks startAction /
 *     depositThesaurus / signSyngrapha
 *   - commit: Erinyes → gold 0, maleficia 0, ×2 stack; Astiwihad → gold 100%, maleficia 100%, Emptio
 *     preserved; the mutex favours Erinyes if both flags are set
 *   - Morpheus consumes reprobates as a PURE cost (no souls) and generates desidia, without
 *     freezing the world
 */
import { describe, expect, it } from 'vitest';
import {
  bn,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  depositThesaurus,
  dispel,
  enterKatabasis,
  floor,
  invocationById,
  invoke,
  signSyngrapha,
  startAction,
  tick,
  totalReprobates,
  type GameState,
} from './index.js';

function fresh(seed = 'apex-katabasis', t = 0): GameState {
  return createInitialState(seed, t);
}
const goldOf = (s: GameState): number => floor(s.lifetime.gold).toNumber();
const soulsOf = (s: GameState): number => floor(s.souls).toNumber();

/** A state with EVERY Sin at level 3 and 20 invoking power, so any apex's gate is met. */
function withAllGates(
  opts: { souls?: number; gold?: number; reprobates?: number } = {},
): GameState {
  const s = fresh();
  const devotion = { ...s.devotion };
  for (const k of Object.keys(devotion) as (keyof typeof devotion)[]) devotion[k] = bn(180 ** 3);
  return {
    ...s,
    souls: bn(opts.souls ?? 100_000),
    devotion,
    lifetime: {
      ...s.lifetime,
      gold: bn(opts.gold ?? 1_000_000),
      maleficia: Array.from({ length: 20 }, () => 'black_salt_pouch'), // each +1 IP, stackable
      reprobates: opts.reprobates ?? 0,
    },
  };
}

describe('Catalog', () => {
  it('Erinyes / Astiwihad are free, max 1, IP 10, Sin level 3', () => {
    for (const [id, sin] of [
      ['erinyes', 'ira'],
      ['astiwihad', 'tristitia'],
    ] as const) {
      const def = invocationById(id)!;
      expect(def.sin).toBe(sin);
      expect(def.invokingPower).toBe(10);
      expect(def.sinLevel).toBe(3);
      expect(def.maxActive).toBe(1);
      expect(def.upkeep).toBeUndefined();
      expect(def.soulCost).toBeUndefined();
    }
  });

  it('Morpheus (Acedia apex) drains 5% of the reprobate pool/s, max 1, IP 10, Sin level 3', () => {
    const def = invocationById('morpheus')!;
    expect(def.sin).toBe('acedia');
    expect(def.invokingPower).toBe(10);
    expect(def.sinLevel).toBe(3);
    expect(def.maxActive).toBe(1);
    expect(def.upkeep?.reprobateFraction).toBe(0.05);
    expect(def.soulCost).toBeUndefined();
    expect(def.goldCost).toBeUndefined();
  });
});

describe('Erinyes invoke', () => {
  it('kills every reprobate (one soul minted each) and sets pendingErinyes + apexInvoked', () => {
    const before = withAllGates({ souls: 0, reprobates: 250 });
    const r = invoke(before, 'erinyes');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(totalReprobates(r.state)).toBe(0);
    expect(soulsOf(r.state)).toBe(250); // one per dead reprobate (a kill mints a soul)
    expect(r.state.lifetime.invocations.erinyes).toBe(1);
    expect(r.state.lifetime.pendingErinyes).toBe(true);
    expect(r.state.lifetime.apexInvoked).toBe('erinyes');
  });
});

describe('Astiwihad invoke', () => {
  it('sets pendingAstiwihad + apexInvoked and freezes the tick', () => {
    const before = withAllGates({ gold: 1000, reprobates: 100 });
    const r = invoke(before, 'astiwihad');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.lifetime.pendingAstiwihad).toBe(true);
    expect(r.state.lifetime.apexInvoked).toBe('astiwihad');
    // The world is now held still: a 60s tick advances only the clock.
    const before2 = goldOf(r.state);
    const t = tick(r.state, 60);
    expect(goldOf(t.state)).toBe(before2);
    expect(totalReprobates(t.state)).toBe(100);
    expect(t.state.lastTickAt).toBe(r.state.lastTickAt + 60_000);
    expect(t.events).toEqual([]);
  });
});

describe('One apex kind per lifetime', () => {
  it('refuses a different apex once one is invoked, even after dispelling it; same kind re-summons', () => {
    const base = withAllGates();
    const m = invoke(base, 'midas');
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.lifetime.apexInvoked).toBe('midas');

    // A different apex is refused while Midas answers this lifetime.
    const s2 = invoke(m.state, 'succubus');
    expect(s2.ok).toBe(false);
    if (s2.ok) return;
    expect(s2.reason).toMatch(/apex/i);

    // Dispel Midas — the lifetime still remembers the apex kind, so a different apex stays refused.
    const dropped = dispel(m.state, 'midas');
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    expect(invoke(dropped.state, 'succubus').ok).toBe(false);
    // …but the SAME apex kind can be re-summoned.
    expect(invoke(dropped.state, 'midas').ok).toBe(true);
  });
});

describe('Astiwihad freeze halts runners and blocks initiations', () => {
  it('acolyte runners make no progress; startAction / Thesaurus / Syngrapha are refused', () => {
    const s = withAllGates({ gold: 100_000, reprobates: 1000 });
    const frozen: GameState = {
      ...s,
      lifetime: {
        ...s.lifetime,
        invocations: { astiwihad: 1 },
        acolytes: [{ id: 1, assignedAction: 'caedes', remainingSeconds: 10 }],
      },
    };
    const r = tick(frozen, 3600);
    expect(r.events).toEqual([]);
    expect(totalReprobates(r.state)).toBe(1000); // no culls
    expect(r.state.lifetime.acolytes[0]!.remainingSeconds).toBe(10); // timer untouched

    expect(startAction(frozen, 'suggestion').ok).toBe(false);
    const d = depositThesaurus(frozen, 100);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toMatch(/stillness/i);
    const g = signSyngrapha(frozen, 'usura-1');
    expect(g.ok).toBe(false);
  });
});

describe('Erinyes carry-over at commitKatabasis', () => {
  it('zeros gold + maleficia keep and stacks the permanent player-efficiency ×2', () => {
    const before = withAllGates({ gold: 500_000 });
    const live: GameState = {
      ...before,
      lifetime: {
        ...before.lifetime,
        maleficia: ['black_salt_pouch', 'iron_nail', 'spear_of_longinus'],
        pendingErinyes: true,
        apexInvoked: 'erinyes',
      },
    };
    const { state, recap } = commitKatabasis(enterKatabasis(live));
    expect(floor(recap.goldKept).toNumber()).toBe(0);
    expect(recap.maleficiaKept).toEqual([]);
    expect(recap.maleficiaLost.length).toBe(3);
    expect(state.erinyesEfficiencyStacks).toBe(1);
    expect(state.lifetime.pendingErinyes ?? false).toBe(false);
    expect(state.lifetime.apexInvoked ?? null).toBe(null);
  });

  it('stacks compose: two committed Erinyes give ×4 player efficiency', () => {
    const base = computeModifiers(fresh()).playerEfficiencyMul;
    const after = computeModifiers({ ...fresh(), erinyesEfficiencyStacks: 2 });
    expect(after.playerEfficiencyMul).toBeCloseTo(base * 4, 6);
  });
});

describe('Astiwihad carry-over at commitKatabasis', () => {
  it('maxes gold + maleficia keep and preserves the Emptio list; no efficiency stack', () => {
    const before = withAllGates({ gold: 200_000 });
    const live: GameState = {
      ...before,
      lifetime: {
        ...before.lifetime,
        maleficia: ['black_salt_pouch', 'iron_nail'],
        emptioList: ['obsidian_mirror'],
        pendingAstiwihad: true,
        apexInvoked: 'astiwihad',
      },
    };
    const { state, recap } = commitKatabasis(enterKatabasis(live));
    expect(floor(recap.goldKept).toNumber()).toBe(200_000);
    expect(recap.maleficiaKept).toEqual(live.lifetime.maleficia);
    expect(recap.maleficiaLost).toEqual([]);
    expect(state.lifetime.emptioList).toEqual(['obsidian_mirror']);
    expect(state.erinyesEfficiencyStacks ?? 0).toBe(0);
    expect(state.lifetime.pendingAstiwihad ?? false).toBe(false);
  });
});

describe('Mutual exclusion at commit when both flags were set', () => {
  it('Erinyes wins outright; Astiwihad carry-over does not apply', () => {
    const before = withAllGates({ gold: 500_000 });
    const live: GameState = {
      ...before,
      lifetime: {
        ...before.lifetime,
        maleficia: ['black_salt_pouch'],
        emptioList: ['obsidian_mirror'],
        pendingErinyes: true,
        pendingAstiwihad: true, // shouldn't normally co-occur
      },
    };
    const { state, recap } = commitKatabasis(enterKatabasis(live));
    expect(floor(recap.goldKept).toNumber()).toBe(0); // Erinyes
    expect(recap.maleficiaKept).toEqual([]); // Erinyes
    expect(state.lifetime.emptioList).toEqual([]); // Astiwihad's preservation does NOT apply
  });
});

describe('Morpheus: reprobate → desidia, no world freeze', () => {
  it('consumes reprobates as a pure cost (no souls) and generates desidia, income still flowing', () => {
    const s = withAllGates({ gold: 1000, reprobates: 1000, souls: 0 });
    const active: GameState = {
      ...s,
      souls: bn(0),
      desidia: 0,
      lifetime: { ...s.lifetime, invocations: { morpheus: 1 } },
    };
    // One 0.1s tick: Morpheus drains 5% × 1000 × 0.1 = 5 reprobates; base suicide/murder pools stay
    // < 1 over this span so they mint nothing, isolating the cost (which mints NO souls).
    const r = tick(active, 0.1);
    expect(totalReprobates(r.state)).toBe(995);
    expect(soulsOf(r.state)).toBe(0); // the reprobate cost minted no souls
    expect(r.state.desidia).toBeGreaterThan(0); // Morpheus converts consumption to desidia
    expect(r.state.lifetime.gold.toNumber()).toBeGreaterThan(1000); // world NOT frozen
  });
});
