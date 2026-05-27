import { describe, it, expect } from 'vitest';
import { bn, eq, floor } from './bignum.js';
import { createInitialState, totalReprobates, type GameState } from './state.js';
import { sinLevel } from './progression.js';
import {
  offerDevotion,
  bindSigil,
  unbindAllSigils,
  totalBound,
  remainingGoldFraction,
  remainingUnconvertedFraction,
  remainingMaleficiaChance,
  commitKatabasis,
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
    expect(remainingUnconvertedFraction(s)).toBeCloseTo(0.05, 6);
    expect(remainingMaleficiaChance(s)).toBeCloseTo(0.05, 6);
  });

  it('rise with the offering Sin level', () => {
    const base = fresh(0);
    const s = {
      ...base,
      devotion: {
        ...base.devotion,
        avaritia: bn(32400), // level 2
        luxuria: bn(180), // level 1
        superbia: bn(1049760000), // level 4
      },
    };
    expect(remainingGoldFraction(s)).toBeCloseTo(0.05 + 0.0625 * 2, 6); // 0.175
    expect(remainingUnconvertedFraction(s)).toBeCloseTo(0.05 + 0.0625 * 1, 6); // 0.1125
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
        reprobates: { ...s.lifetime.reprobates, reprobate: 100, glutton: 50 },
        invocations: { upir: 3 },
        activeToggles: ['bacchanal'],
        actionQueue: [{ actionId: 'caedis', remainingSeconds: 4 }],
        emptioList: ['black-robe'],
      },
    };
  }

  it('keeps base fractions of gold and unconverted reprobates; loses converted', () => {
    const { state, recap } = commitKatabasis(loaded());
    expect(soulsOf(state)).toBe(500); // carried untouched
    expect(eq(state.lifetime.gold, bn(50))).toBe(true); // 5% of 1000
    expect(state.lifetime.reprobates.reprobate).toBe(5); // 5% of 100
    expect(state.lifetime.reprobates.glutton).toBe(0); // converted lost
    expect(totalReprobates(state)).toBe(5);
    expect(recap.goldKept.toString()).toBe('50');
    expect(recap.reprobatesKept).toBe(5);
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
});
