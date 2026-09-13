/**
 * Incoming-call buff engine (docs/PANVITIUM-CALLS-IN.md): applying a chosen option's effects, the
 * timed-buff decay, and the per-field aggregation the modifier bundle reads. Also pins the wiring
 * into `computeModifiers`, the tick decay, and the offline Desidia grant (the re-homed
 * `doing-nothing` buff, ADR-034).
 */
import { describe, it, expect } from 'vitest';
import {
  applyCallEffects,
  advanceCallBuffs,
  callBuffMultipliers,
  computeModifiers,
  grantDesidiaForOffline,
  DESIDIA_PER_SECOND,
  tick,
  createInitialState,
  bn,
  type GameState,
  type CallInEffect,
} from './index.js';

/** A fresh state with some gold and reprobates so the one-shot effects have something to bite. */
function stateWith(over: Partial<GameState['lifetime']> = {}): GameState {
  const fresh = createInitialState('seed', 0);
  return { ...fresh, lifetime: { ...fresh.lifetime, gold: bn(1000), reprobates: 100, ...over } };
}

describe('applyCallEffects — one-shot effects', () => {
  it('spendGoldPct deducts the fraction of current gold', () => {
    const s = applyCallEffects(stateWith(), [{ kind: 'spendGoldPct', pct: 33 }]);
    expect(s.lifetime.gold.toNumber()).toBeCloseTo(670, 6); // 1000 × (1 − 0.33)
  });

  it('killReprobatesPct culls the fraction AND mints one soul per death', () => {
    const s = applyCallEffects(stateWith(), [{ kind: 'killReprobatesPct', pct: 10 }]);
    expect(s.lifetime.reprobates).toBe(90);
    expect(s.souls.toNumber()).toBe(10); // a cull yields souls, one for one
    expect(s.totalSoulsObtained.toNumber()).toBe(10);
  });

  it('loseReprobatesPct removes the fraction but mints NO souls (lost, not culled)', () => {
    const s = applyCallEffects(stateWith(), [{ kind: 'loseReprobatesPct', pct: 10 }]);
    expect(s.lifetime.reprobates).toBe(90);
    expect(s.souls.toNumber()).toBe(0);
  });

  it('permanentMul raises the lifetime maxInfluence cap', () => {
    const before = stateWith();
    const s = applyCallEffects(before, [
      { kind: 'permanentMul', field: 'maxInfluence', factor: 1.1 },
    ]);
    expect(s.lifetime.maxInfluence.toNumber()).toBeCloseTo(
      before.lifetime.maxInfluence.toNumber() * 1.1,
      6,
    );
  });

  it('applies multiple effects in order (a tradeoff: buff + cost)', () => {
    const s = applyCallEffects(stateWith(), [
      { kind: 'timedMul', field: 'goldGainMul', factor: 2, durationSec: 3600 },
      { kind: 'loseReprobatesPct', pct: 10 },
    ]);
    expect(s.lifetime.callBuffs).toHaveLength(1);
    expect(s.lifetime.reprobates).toBe(90);
    expect(s.souls.toNumber()).toBe(0); // "lose", not "kill"
  });
});

describe('applyCallEffects — timed buffs', () => {
  it('appends a timedMul to lifetime.callBuffs with its full duration', () => {
    const s = applyCallEffects(stateWith(), [
      { kind: 'timedMul', field: 'reprobateGenMul', factor: 1.33, durationSec: 3600 },
    ]);
    expect(s.lifetime.callBuffs).toEqual([
      { field: 'reprobateGenMul', factor: 1.33, remainingSeconds: 3600 },
    ]);
  });

  it('never stores a dead buff (inert factor or non-positive duration)', () => {
    const inert: CallInEffect[] = [
      { kind: 'timedMul', field: 'goldGainMul', factor: 1, durationSec: 3600 },
      { kind: 'timedMul', field: 'goldGainMul', factor: 2, durationSec: 0 },
    ];
    expect(applyCallEffects(stateWith(), inert).lifetime.callBuffs).toEqual([]);
  });
});

describe('callBuffMultipliers', () => {
  it('is neutral (all 1) with no active buffs', () => {
    const m = callBuffMultipliers(stateWith());
    expect(m.goldRateMul).toBe(1);
    expect(m.influenceRateMul).toBe(1);
    expect(m.desidiaGainMul).toBe(1);
  });

  it('folds influence gain AND regen onto the one influence rate (multiplicatively)', () => {
    const s = stateWith({
      callBuffs: [
        { field: 'influenceGainMul', factor: 1.33, remainingSeconds: 100 },
        { field: 'influenceRegenRate', factor: 2, remainingSeconds: 100 },
      ],
    });
    expect(callBuffMultipliers(s).influenceRateMul).toBeCloseTo(1.33 * 2, 9);
  });

  it('ignores an expired buff (remaining ≤ 0)', () => {
    const s = stateWith({
      callBuffs: [{ field: 'goldGainMul', factor: 5, remainingSeconds: 0 }],
    });
    expect(callBuffMultipliers(s).goldRateMul).toBe(1);
  });
});

describe('advanceCallBuffs', () => {
  it('decrements every buff timer by the delta', () => {
    const s = stateWith({
      callBuffs: [{ field: 'goldGainMul', factor: 2, remainingSeconds: 100 }],
    });
    expect(advanceCallBuffs(s, 25).lifetime.callBuffs[0]!.remainingSeconds).toBe(75);
  });

  it('drops a buff once its timer runs out', () => {
    const s = stateWith({
      callBuffs: [
        { field: 'goldGainMul', factor: 2, remainingSeconds: 3 },
        { field: 'reprobateGenMul', factor: 2, remainingSeconds: 100 },
      ],
    });
    const after = advanceCallBuffs(s, 5).lifetime.callBuffs;
    expect(after).toHaveLength(1);
    expect(after[0]!.field).toBe('reprobateGenMul');
  });
});

describe('computeModifiers integration', () => {
  it('a goldGainMul buff doubles the gold rate versus no buff', () => {
    const base = computeModifiers(stateWith()).goldRateMul;
    const buffed = computeModifiers(
      stateWith({ callBuffs: [{ field: 'goldGainMul', factor: 2, remainingSeconds: 100 }] }),
    ).goldRateMul;
    expect(buffed).toBeCloseTo(base * 2, 9);
  });

  it('a playerEfficiencyMul buff lifts the player efficiency', () => {
    const base = computeModifiers(stateWith()).playerEfficiencyMul;
    const buffed = computeModifiers(
      stateWith({
        callBuffs: [{ field: 'playerEfficiencyMul', factor: 1.33, remainingSeconds: 100 }],
      }),
    ).playerEfficiencyMul;
    expect(buffed).toBeCloseTo(base * 1.33, 9);
  });
});

describe('tick decay', () => {
  it('decays an active buff by the tick delta and keeps it while it lasts', () => {
    const s = stateWith({
      callBuffs: [{ field: 'goldGainMul', factor: 2, remainingSeconds: 3600 }],
    });
    const after = tick(s, 5).state.lifetime.callBuffs;
    expect(after).toHaveLength(1);
    expect(after[0]!.remainingSeconds).toBeCloseTo(3595, 6);
  });

  it('drops a buff on the tick it expires', () => {
    const s = stateWith({
      callBuffs: [{ field: 'goldGainMul', factor: 2, remainingSeconds: 3 }],
    });
    expect(tick(s, 5).state.lifetime.callBuffs).toEqual([]);
  });
});

describe('offline Desidia (re-homed doing-nothing buff, ADR-034)', () => {
  it('a desidiaGainMul buff multiplies the offline Desidia grant', () => {
    const plain = grantDesidiaForOffline(stateWith(), 600);
    const buffed = grantDesidiaForOffline(
      stateWith({ callBuffs: [{ field: 'desidiaGainMul', factor: 3, remainingSeconds: 100 }] }),
      600,
    );
    expect(plain.desidia).toBeCloseTo(DESIDIA_PER_SECOND * 600, 9);
    expect(buffed.desidia).toBeCloseTo(DESIDIA_PER_SECOND * 600 * 3, 9);
  });
});
