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
        invocationRunners: { imp: 7 },
        acolytes: [{ id: 1, assignedAction: 'caedes', remainingSeconds: 3 }],
      },
    };
  }

  it('liquidates the hoard IN FULL into gold (no recovery penalty) and zeroes it', () => {
    const before = loaded();
    const after = enterKatabasis(before);
    // The descent voids the contracts: the full 400 pays out, not 0.25 × 400.
    expect(after.lifetime.gold.toNumber()).toBe(1400);
    expect(after.lifetime.hoard.toNumber()).toBe(0);
    // The Peculium base is stamped before the liquidation zeroed the hoard.
    expect(after.lifetime.hoardAtDescent?.toNumber()).toBe(400);
  });

  it('pays the faeneratio-4 liquidation bonus (×1.25) when that contract is signed', () => {
    const before = loaded();
    const signed: GameState = {
      ...before,
      lifetime: {
        ...before.lifetime,
        syngraphae: ['faeneratio-1', 'faeneratio-2', 'faeneratio-3', 'faeneratio-4'],
      },
    };
    const after = enterKatabasis(signed);
    expect(after.lifetime.gold.toNumber()).toBe(1000 + 400 * 1.25);
  });

  it('stops toggles, fizzles the action queue, and dispels invocations + their channels', () => {
    const after = enterKatabasis(loaded());
    expect(after.lifetime.activeToggles).toHaveLength(0);
    expect(Object.keys(after.lifetime.toggleDurations)).toHaveLength(0);
    expect(after.lifetime.actionQueue).toHaveLength(0);
    expect(Object.keys(after.lifetime.invocations)).toHaveLength(0);
    expect(Object.keys(after.lifetime.invocationRunners)).toHaveLength(0);
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

  it('commit resets the hoard, the Syngraphae, and the Peculium base with the lifetime', () => {
    const before = loaded();
    const signed: GameState = {
      ...before,
      lifetime: { ...before.lifetime, syngraphae: ['usura-1', 'faeneratio-1'] },
    };
    const { state } = commitKatabasis(enterKatabasis(signed));
    expect(state.lifetime.hoard.toNumber()).toBe(0);
    expect(state.lifetime.syngraphae).toHaveLength(0);
    expect(state.lifetime.hoardAtDescent).toBeUndefined();
  });
});

describe('Peculium (custodia-4) — the kept-gold floor at commit', () => {
  /** A descent-ready state: `hoard` in the vault, `gold` liquid, custodia-4 optionally signed. */
  function estate(opts: { hoard: number; gold?: number; signed?: boolean }): GameState {
    const base = createInitialState('peculium', 0);
    return {
      ...base,
      lifetime: {
        ...base.lifetime,
        gold: bn(opts.gold ?? 0),
        hoard: bn(opts.hoard),
        ...(opts.signed === false
          ? {}
          : { syngraphae: ['custodia-1', 'custodia-2', 'custodia-3', 'custodia-4'] }),
      },
    };
  }

  it('floors the kept gold at 10% of the hoard value at descent', () => {
    // Estate: 10,000 hoard + 0 liquid → 10,000 at descent; base roll keeps 5% = 500.
    const { recap } = commitKatabasis(enterKatabasis(estate({ hoard: 10_000 })));
    // Peculium guarantees floor(0.10 × 10,000) = 1,000 — above the 500 the roll kept.
    expect(recap.goldKept.toNumber()).toBe(1000);
  });

  it('does not lower a roll that already beats the floor', () => {
    // A large liquid estate: the 5% roll on (100,000 + 10,000) = 5,500 beats the 1,000 floor.
    const { recap } = commitKatabasis(enterKatabasis(estate({ hoard: 10_000, gold: 100_000 })));
    expect(recap.goldKept.toNumber()).toBe(5500);
  });

  it('does nothing while unsigned', () => {
    const { recap } = commitKatabasis(enterKatabasis(estate({ hoard: 10_000, signed: false })));
    expect(recap.goldKept.toNumber()).toBe(500); // the bare 5% roll
  });

  it('survives a mid-descent save/reload: the floor reads the persisted hoard-at-descent', () => {
    const entered = enterKatabasis(estate({ hoard: 10_000 }));
    // The stamp is on the lifetime (the wire round-trip is pinned in @panvitium/shared's save
    // tests); commit reads it rather than the already-zeroed hoard.
    expect(entered.lifetime.hoardAtDescent?.toNumber()).toBe(10_000);
    expect(entered.lifetime.hoard.toNumber()).toBe(0);
    const { recap } = commitKatabasis(entered);
    expect(recap.goldKept.toNumber()).toBe(1000);
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

  it('runs no simulation when inKatabasis — souls and reprobates are unchanged, even offline-sized', () => {
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
