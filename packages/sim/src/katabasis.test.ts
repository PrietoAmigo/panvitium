import { describe, it, expect } from 'vitest';
import { bn, eq, floor } from './bignum.js';
import { createInitialState, totalReprobates, type GameState } from './state.js';
import { tick } from './tick.js';
import { sinLevel } from './progression.js';
import {
  offerDevotion,
  bindSigil,
  unbindAllSigils,
  totalBound,
  remainingGoldFraction,
  remainingReprobateFraction,
  remainingMaleficiaChance,
  commitKatabasis,
  enterKatabasis,
} from './katabasis.js';

const fresh = (souls: number | string): GameState => ({
  ...createInitialState('seed', 0),
  souls: bn(souls),
});
const soulsOf = (s: GameState): number => floor(s.souls).toNumber();

describe('offerDevotion', () => {
  it('moves souls permanently into Devotion and clamps to the pool', () => {
    let s = fresh(1000);
    s = offerDevotion(s, 'gula', 180);
    expect(soulsOf(s)).toBe(820);
    expect(eq(s.devotion.gula, bn(180))).toBe(true);
    expect(sinLevel(s.devotion.gula)).toBe(1);
    s = offerDevotion(s, 'gula', 10_000); // more than the 820 left → clamped
    expect(soulsOf(s)).toBe(0);
    expect(eq(s.devotion.gula, bn(1000))).toBe(true);
  });
});

describe('sigil binding', () => {
  it('binds from the pool and re-binds without stacking', () => {
    let s = fresh(1000);
    s = bindSigil(s, 6, 100);
    expect(soulsOf(s)).toBe(900);
    expect(eq(s.sigilBindings[6] ?? bn(0), bn(100))).toBe(true);
    s = bindSigil(s, 6, 250); // re-bind: the current 100 counts as available
    expect(soulsOf(s)).toBe(750);
    expect(eq(s.sigilBindings[6] ?? bn(0), bn(250))).toBe(true);
    s = bindSigil(s, 6, 0); // unbind → key removed, souls returned
    expect(s.sigilBindings[6]).toBeUndefined();
    expect(soulsOf(s)).toBe(1000);
  });

  it('totalBound sums bindings; unbindAll returns them to the pool', () => {
    let s = fresh(1000);
    s = bindSigil(s, 6, 100);
    s = bindSigil(s, 20, 300);
    expect(eq(totalBound(s), bn(400))).toBe(true);
    expect(soulsOf(s)).toBe(600);
    s = unbindAllSigils(s);
    expect(soulsOf(s)).toBe(1000);
    expect(totalBound(s).toNumber()).toBe(0);
  });
});

describe('carry-over fractions', () => {
  it('use base values with no Devotion', () => {
    const s = fresh(0);
    expect(remainingGoldFraction(s)).toBeCloseTo(0.05, 6);
    expect(remainingReprobateFraction(s)).toBeCloseTo(0.05, 6);
    expect(remainingMaleficiaChance(s)).toBeCloseTo(0.05, 6);
  });

  it('rise with the offering Sin level', () => {
    const base = fresh(0);
    const s = {
      ...base,
      devotion: {
        ...base.devotion,
        avaritia: bn(32400), // level 2
        tristitia: bn(180), // level 1 (Resignation → remaining reprobate %)
        superbia: bn(1049760000), // level 4
      },
    };
    expect(remainingGoldFraction(s)).toBeCloseTo(0.05 + 0.125 * 2, 6); // 0.30
    expect(remainingReprobateFraction(s)).toBeCloseTo(0.05 + 0.125 * 1, 6); // 0.175
    expect(remainingMaleficiaChance(s)).toBeCloseTo(0.05 + 0.125 * 4, 6); // 0.55
  });
});

describe('commitKatabasis', () => {
  function loaded(): GameState {
    const s = fresh(500);
    return {
      ...s,
      lifetime: {
        ...s.lifetime,
        gold: bn(1000),
        influence: bn(500),
        reprobates: 150,
        invocations: { upir: 3 },
        activeToggles: ['panvitium'],
        actionQueue: [{ actionId: 'caedes', remainingSeconds: 4 }],
        emptioList: ['black-robe'],
      },
    };
  }

  it('keeps a base fraction of gold and reprobates', () => {
    const { state, recap } = commitKatabasis(loaded());
    expect(soulsOf(state)).toBe(500); // carried untouched
    expect(eq(state.lifetime.gold, bn(50))).toBe(true); // 5% of 1000
    expect(state.lifetime.reprobates).toBe(7); // floor(5% of 150)
    expect(totalReprobates(state)).toBe(7);
    expect(recap.goldKept.toString()).toBe('50');
    expect(recap.reprobatesKept).toBe(7);
    expect(recap.soulsCarried.toString()).toBe('500');
  });

  it('resets the volatile lifetime (influence, invocations, toggles, queue, emptio, max influence)', () => {
    const { state } = commitKatabasis(loaded());
    expect(eq(state.lifetime.influence, bn(0))).toBe(true);
    expect(Object.keys(state.lifetime.invocations)).toHaveLength(0);
    expect(state.lifetime.activeToggles).toHaveLength(0);
    expect(state.lifetime.actionQueue).toHaveLength(0);
    expect(state.lifetime.emptioList).toHaveLength(0);
    expect(eq(state.lifetime.maxInfluence, bn(100))).toBe(true);
  });

  it('resets the reprobate-dynamics pools to 0 on rebirth (02 §9 / §6)', () => {
    const base = loaded();
    // Stuff non-trivial residuals into the pools — the rebirth must wipe them.
    const dirtied = {
      ...base,
      lifetime: {
        ...base.lifetime,
        generationPool: 0.7,
        suicidePool: 0.5,
        murderPool: 0.99,
      },
    };
    const { state } = commitKatabasis(dirtied);
    expect(state.lifetime.generationPool).toBe(0);
    expect(state.lifetime.suicidePool).toBe(0);
    expect(state.lifetime.murderPool).toBe(0);
  });

  it('carries Devotion and sigil bindings through unchanged', () => {
    let s = loaded();
    s = offerDevotion(s, 'avaritia', 200); // permanent: souls 500 → 300
    s = bindSigil(s, 6, 100); // bound: souls 300 → 200
    const { state } = commitKatabasis(s);
    expect(eq(state.devotion.avaritia, bn(200))).toBe(true);
    expect(eq(state.sigilBindings[6] ?? bn(0), bn(100))).toBe(true);
    expect(soulsOf(state)).toBe(200);
  });

  it('rolls each maleficium and partitions kept/lost with no loss', () => {
    const base = loaded();
    const s = { ...base, lifetime: { ...base.lifetime, maleficia: ['a', 'b', 'c', 'd', 'e'] } };
    const { state, recap } = commitKatabasis(s);
    expect(recap.maleficiaKept.length + recap.maleficiaLost.length).toBe(5);
    expect(state.lifetime.maleficia).toEqual(recap.maleficiaKept);
    expect(state.rngState).not.toBe(s.rngState); // the rolls consumed the RNG
  });

  it('persists the inbox, arm timers and Fausto flags across the descent (mail history is permanent)', () => {
    const base = loaded();
    const s: GameState = {
      ...base,
      lifetime: {
        ...base.lifetime,
        inbox: [
          { id: 'parish-1', receivedAt: 10, readAt: 20 },
          { id: 'fausto-4', receivedAt: 30, readAt: null },
        ],
        emailArmedAt: { 'newsletter-local': 5 },
        flagFCThreatSent: true,
        flagFaustoCurse: true,
      },
    };
    const { state } = commitKatabasis(s);
    // The inbox and its arm timers survive untouched — nothing re-delivers next run.
    expect(state.lifetime.inbox.map((e) => e.id)).toEqual(['parish-1', 'fausto-4']);
    expect(state.lifetime.emailArmedAt['newsletter-local']).toBe(5);
    // The threat branch stays closed, and the curse holds while its letter is still in the inbox.
    expect(state.lifetime.flagFCThreatSent).toBe(true);
    expect(state.lifetime.flagFaustoCurse).toBe(true);
  });
});

describe('enterKatabasis — teardown on descent (02 §6)', () => {
  function loaded(): GameState {
    const base = createInitialState('enter', 0);
    return {
      ...base,
      souls: bn(5000),
      lifetime: {
        ...base.lifetime,
        gold: bn(1000),
        reprobates: 50,
        hoard: bn(400),
        activeToggles: ['panvitium'],
        toggleDurations: { panvitium: 12 },
        actionQueue: [{ actionId: 'caedes', remainingSeconds: 4 }],
        invocations: { imp: 1 },
        acolytes: [{ id: 1, assignedAction: 'caedes', remainingSeconds: 3 }],
      },
    };
  }

  it('liquidates the reserve IN FULL into gold (no surrender charge) and zeroes it', () => {
    const before = loaded();
    const after = enterKatabasis(before);
    // The account close pays the full 400 out, not the post-charge 0.85 × 400.
    expect(after.lifetime.gold.toNumber()).toBe(1400);
    expect(after.lifetime.hoard.toNumber()).toBe(0);
  });

  it('stops toggles, fizzles the action queue, and dispels invocations', () => {
    const after = enterKatabasis(loaded());
    expect(after.lifetime.activeToggles).toHaveLength(0);
    expect(Object.keys(after.lifetime.toggleDurations)).toHaveLength(0);
    expect(after.lifetime.actionQueue).toHaveLength(0);
    expect(Object.keys(after.lifetime.invocations)).toHaveLength(0);
  });

  it('drops acolyte assignments but keeps the carry-over inputs (reprobates, maleficia) intact', () => {
    const after = enterKatabasis(loaded());
    expect(after.lifetime.acolytes[0]!.assignedAction).toBeNull();
    expect(after.lifetime.acolytes[0]!.remainingSeconds).toBeNull();
    // Reprobates are NOT cleared here — the commit rolls them for carry-over.
    expect(after.lifetime.reprobates).toBe(50);
    // Souls in the pool are untouched on entry.
    expect(after.souls.toNumber()).toBe(5000);
  });

  it('does not double-pay: committing after entering rolls the already-folded gold once', () => {
    const entered = enterKatabasis(loaded());
    const { recap } = commitKatabasis(entered);
    // The hoard is already gone at entry → commit finds nothing to liquidate again. Gold kept is
    // a fraction of the 1400 (post-liquidation) held, never of 1400 + another 400.
    expect(recap.goldKept.toNumber()).toBeLessThanOrEqual(1400);
  });

  it('commit closes the account: reserve, contracts, age, income and safe reset with the lifetime', () => {
    const before = loaded();
    const signed: GameState = {
      ...before,
      lifetime: {
        ...before.lifetime,
        syngraphae: ['interest-rate'],
        accountAge: 3600,
        accountIncome: bn(250),
        assetTracingElapsed: 42,
      },
    };
    const { state } = commitKatabasis(enterKatabasis(signed));
    expect(state.lifetime.hoard.toNumber()).toBe(0);
    expect(state.lifetime.syngraphae).toHaveLength(0);
    expect(state.lifetime.accountAge).toBeUndefined();
    expect(state.lifetime.accountIncome).toBeUndefined();
    expect(state.lifetime.assetTracingElapsed).toBeUndefined();
    expect(state.lifetime.safeItem).toBeUndefined();
  });
});

describe('the private item safe (Custody VIP) at the account close', () => {
  /**
   * A descent-ready estate owning a few maleficia, with Custody VIP chosen and `item` stored in the
   * safe. `hoard` sets the relationship tier (Tier III at 1,000,000). The Superbia chance is the
   * bare base, so most relics are lost on the roll.
   */
  function estate(opts: { hoard: number; item?: string; chosen?: boolean }): GameState {
    const base = createInitialState('safe', 0);
    return {
      ...base,
      lifetime: {
        ...base.lifetime,
        hoard: bn(opts.hoard),
        maleficia: ['dybbuk_box', 'codex_gigas', 'black_candles', 'black_candles'],
        ...(opts.chosen === false ? {} : { syngraphae: ['custody-vip'] }),
        ...(opts.item !== undefined ? { safeItem: opts.item } : {}),
      },
    };
  }

  it('keeps the stored maleficium for certain (repeatable over many seeds)', () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = { ...estate({ hoard: 1_000_000, item: 'codex_gigas' }), rngState: seed * 7919 };
      const { recap } = commitKatabasis(enterKatabasis(s));
      expect(recap.maleficiaKept).toContain('codex_gigas');
    }
  });

  it('keeps ONE copy of a stackable; the other copies still roll', () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = { ...estate({ hoard: 1_000_000, item: 'black_candles' }), rngState: seed * 104729 };
      const { recap } = commitKatabasis(enterKatabasis(s));
      expect(recap.maleficiaKept).toContain('black_candles');
      expect(recap.maleficiaKept.length + recap.maleficiaLost.length).toBe(4);
    }
  });

  it('keeps the item even when the reserve fell below Tier III before the descent', () => {
    const entered = enterKatabasis(estate({ hoard: 0, item: 'codex_gigas' }));
    expect(entered.lifetime.safeItem).toBe('codex_gigas');
    expect(commitKatabasis(entered).recap.maleficiaKept).toContain('codex_gigas');
  });

  it('keeps nothing when Custody VIP was never chosen', () => {
    const entered = enterKatabasis(
      estate({ hoard: 1_000_000, item: 'codex_gigas', chosen: false }),
    );
    expect(entered.lifetime.safeItem).toBeUndefined();
  });

  it('survives a mid-descent save/reload: the designation sits on the frozen lifetime', () => {
    const entered = enterKatabasis(estate({ hoard: 1_000_000, item: 'codex_gigas' }));
    expect(entered.lifetime.hoard.toNumber()).toBe(0); // the reserve is liquidated
    expect(entered.lifetime.safeItem).toBe('codex_gigas');
    expect(commitKatabasis(entered).recap.maleficiaKept).toContain('codex_gigas');
  });

  it('draws no RNG for the safe copy (ADR-011): the relics before it roll exactly as without it', () => {
    // The safe copy is third in the list: the first two relics see the same draws either way, and
    // the safe descent ends one draw short of the plain one.
    const plain = commitKatabasis(enterKatabasis(estate({ hoard: 1_000_000 })));
    const safe = commitKatabasis(
      enterKatabasis(estate({ hoard: 1_000_000, item: 'black_candles' })),
    );
    for (const id of ['dybbuk_box', 'codex_gigas']) {
      expect(safe.recap.maleficiaKept.includes(id)).toBe(plain.recap.maleficiaKept.includes(id));
    }
    expect(safe.state.rngState).not.toBe(plain.state.rngState);
  });

  it('Erinyes wins over the safe (the commit-side mutex zeroes every carry-over)', () => {
    const s = estate({ hoard: 1_000_000, item: 'codex_gigas' });
    const entered = enterKatabasis({ ...s, lifetime: { ...s.lifetime, pendingErinyes: true } });
    expect(commitKatabasis(entered).recap.maleficiaKept).toEqual([]);
  });
});

describe('tick — frozen while inKatabasis (02 §6)', () => {
  function withReprobates(n: number): GameState {
    const base = createInitialState('freeze', 0);
    return {
      ...base,
      lifetime: { ...base.lifetime, reprobates: n },
    };
  }

  it('runs no simulation when inKatabasis — souls and reprobates are unchanged, even over a large delta', () => {
    const frozen: GameState = { ...withReprobates(5000), inKatabasis: true };
    const soulsBefore = frozen.souls.toNumber();
    const r = tick(frozen, 3600); // an hour of would-be suicides
    expect(r.state.souls.toNumber()).toBe(soulsBefore);
    expect(totalReprobates(r.state)).toBe(5000);
    expect(r.events).toHaveLength(0);
    // The clock still advances so no spurious gap lingers for the next live tick.
    expect(r.state.lastTickAt).toBe(frozen.lastTickAt + 3600 * 1000);
  });

  it('the same state simulates normally once the flag is cleared', () => {
    const thawed = withReprobates(5000); // inKatabasis absent ⇒ false
    const r = tick(thawed, 3600);
    // With reprobates present, suicides mint souls over an hour — proves the freeze was the cause.
    expect(r.state.souls.toNumber()).toBeGreaterThan(0);
  });

  it('enterKatabasis sets the flag and commitKatabasis clears it', () => {
    const entered = enterKatabasis(createInitialState('flag', 0));
    expect(entered.inKatabasis).toBe(true);
    const { state } = commitKatabasis(entered);
    expect(state.inKatabasis).toBe(false);
  });
});
