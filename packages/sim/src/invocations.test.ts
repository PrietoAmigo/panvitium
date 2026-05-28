/**
 * Invocation tests (02 §7 / §12, 03 §2.4). Pins:
 *   - catalog integrity for the wired subset
 *   - invoking power = sum of equipped maleficia
 *   - visibility at ≥ half required invoking power; unlock at full + Sin level
 *   - soul cost = max(fraction × pool, minimum); free apexes cost 0
 *   - invoke deducts souls and increments the count; dispel decrements / deletes
 *   - maxActive cap on apex entities (Midas, Doppelgaenger)
 *   - modifier effects: Midas (3× gold, 100× apoc), Doppelgaenger (1.5× eff, ½ infl),
 *     Fama (1.25× infl/stack), Nightmare (+5% suicide/stack), Harpy (1.1× murder/stack),
 *     Behemoth (+50% stellar/stack)
 *   - Mark of Cain still wins the apocalyptic lock over Midas
 *   - Katabasis dispels everything
 */
import { describe, expect, it } from 'vitest';
import {
  activeInvocationCount,
  bn,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  currentInvokingPower,
  dispel,
  INVOCATION_IDS,
  invocationById,
  invocationSoulCost,
  invocationUnlocked,
  invocationVisible,
  invoke,
  NEUTRAL_MODIFIERS,
  type GameState,
  type Sin,
} from './index.js';

function fresh(seed = 'invocations', t = 0): GameState {
  return createInitialState(seed, t);
}
function withSouls(s: GameState, v: number): GameState {
  return { ...s, souls: bn(v) };
}
function withSin(s: GameState, sin: Sin, level: number): GameState {
  return { ...s, devotion: { ...s.devotion, [sin]: bn(180 ** level) } };
}
/** Give the player enough invoking power by equipping power-source maleficia. */
function withPower(s: GameState, ip: number): GameState {
  // Black Salt Pouch grants 1 invoking power each and is stackable — stack to the target.
  const maleficia = Array.from({ length: ip }, () => 'black_salt_pouch');
  return { ...s, lifetime: { ...s.lifetime, maleficia } };
}
/** Set an invocation's active count directly (bypasses gates) for effect tests. */
function withInvocation(s: GameState, id: string, count: number): GameState {
  return {
    ...s,
    lifetime: { ...s.lifetime, invocations: { ...s.lifetime.invocations, [id]: count } },
  };
}

describe('Invocation catalog', () => {
  it('exposes the wired subset', () => {
    expect(INVOCATION_IDS).toEqual([
      'fama',
      'nightmare',
      'harpy',
      'behemoth',
      'midas',
      'doppelgaenger',
    ]);
  });

  it('apex entities cap at 1; the rest are stackable', () => {
    expect(invocationById('midas')!.maxActive).toBe(1);
    expect(invocationById('doppelgaenger')!.maxActive).toBe(1);
    expect(invocationById('fama')!.maxActive).toBeUndefined();
  });
});

describe('Invoking power + gates', () => {
  it('invoking power sums equipped maleficia', () => {
    expect(currentInvokingPower(fresh())).toBe(0);
    expect(currentInvokingPower(withPower(fresh(), 5))).toBe(5);
  });

  it('an invocation is visible at half its required invoking power', () => {
    const def = invocationById('behemoth')!; // requires 3
    expect(invocationVisible(withPower(fresh(), 1), def)).toBe(false); // 1 < 1.5
    expect(invocationVisible(withPower(fresh(), 2), def)).toBe(true); // 2 ≥ 1.5
  });

  it('unlock requires full invoking power AND the Sin level', () => {
    const def = invocationById('behemoth')!; // IP 3, Superbia 1
    let s = withPower(fresh(), 3);
    expect(invocationUnlocked(s, def)).toBe(false); // Superbia 0
    s = withSin(s, 'superbia', 1);
    expect(invocationUnlocked(s, def)).toBe(true);
  });
});

describe('Soul cost', () => {
  it('is max(fraction × pool, minimum)', () => {
    const fama = invocationById('fama')!; // 10%, min 100
    // pool 2000 → 10% = 200 > 100 → cost 200.
    expect(invocationSoulCost(withSouls(fresh(), 2000), fama).toNumber()).toBe(200);
    // pool 100 → 10% = 10 < 100 → floor at the minimum 100.
    expect(invocationSoulCost(withSouls(fresh(), 100), fama).toNumber()).toBe(100);
  });

  it('is zero for free apex invocations', () => {
    expect(invocationSoulCost(withSouls(fresh(), 1e9), invocationById('midas')!).toNumber()).toBe(
      0,
    );
  });
});

describe('invoke / dispel', () => {
  it('rejects when gates are unmet', () => {
    const r = invoke(withSouls(fresh(), 1e6), 'behemoth'); // no power, no Superbia
    expect(r.ok).toBe(false);
  });

  it('rejects when souls are insufficient', () => {
    let s = withSin(withPower(fresh(), 3), 'superbia', 1);
    s = withSouls(s, 50); // behemoth min cost is 100
    const r = invoke(s, 'behemoth');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/souls/);
  });

  it('summons, deducts souls, increments the count', () => {
    let s = withSin(withPower(fresh(), 3), 'superbia', 1);
    s = withSouls(s, 1000);
    const r = invoke(s, 'behemoth'); // cost = max(100, 10% of 1000 = 100) = 100
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(activeInvocationCount(r.state, 'behemoth')).toBe(1);
    expect(r.state.souls.toNumber()).toBe(900);
  });

  it('stacks a stackable invocation', () => {
    let s = withSin(withPower(fresh(), 3), 'superbia', 1);
    s = withSouls(s, 1_000_000);
    const r1 = invoke(s, 'behemoth');
    if (!r1.ok) throw new Error('r1');
    const r2 = invoke(r1.state, 'behemoth');
    if (!r2.ok) throw new Error('r2');
    expect(activeInvocationCount(r2.state, 'behemoth')).toBe(2);
  });

  it('enforces the maxActive cap on apex entities', () => {
    const s = withSin(withPower(fresh(), 12), 'superbia', 3);
    const r1 = invoke(s, 'doppelgaenger'); // free, max 1
    if (!r1.ok) throw new Error('r1');
    const r2 = invoke(r1.state, 'doppelgaenger');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toMatch(/limit/);
  });

  it('dispel decrements then deletes the key', () => {
    const s = withInvocation(fresh(), 'fama', 2);
    const d1 = dispel(s, 'fama');
    if (!d1.ok) throw new Error('d1');
    expect(activeInvocationCount(d1.state, 'fama')).toBe(1);
    const d2 = dispel(d1.state, 'fama');
    if (!d2.ok) throw new Error('d2');
    expect(activeInvocationCount(d2.state, 'fama')).toBe(0);
    expect('fama' in d2.state.lifetime.invocations).toBe(false);
    expect(dispel(d2.state, 'fama').ok).toBe(false);
  });
});

describe('Invocation modifier effects', () => {
  it('Midas: 3× gold and 100× apocalyptic weight', () => {
    const base = computeModifiers(fresh());
    const mid = computeModifiers(withInvocation(fresh(), 'midas', 1));
    expect(mid.goldRateMul).toBeCloseTo(base.goldRateMul * 3, 6);
    expect(mid.tierWeightMul.apocalyptic).toBeCloseTo(100, 6);
  });

  it('Mark of Cain still locks apocalyptic to 0 even with Midas active', () => {
    let s = withInvocation(fresh(), 'midas', 1);
    s = { ...s, lifetime: { ...s.lifetime, maleficia: ['mark_of_cain'] } };
    expect(computeModifiers(s).tierWeightMul.apocalyptic).toBe(0);
  });

  it('Doppelgaenger: +50% player efficiency, half influence', () => {
    const base = computeModifiers(fresh());
    const dop = computeModifiers(withInvocation(fresh(), 'doppelgaenger', 1));
    expect(dop.playerEfficiencyMul).toBeCloseTo(base.playerEfficiencyMul * 1.5, 6);
    expect(dop.influenceRateMul).toBeCloseTo(base.influenceRateMul * 0.5, 6);
  });

  it('Fama: influence ×1.25 per stack', () => {
    const two = computeModifiers(withInvocation(fresh(), 'fama', 2));
    expect(two.influenceRateMul).toBeCloseTo(1.25 ** 2, 6);
  });

  it('Nightmare: +5% suicide rate per stack (additive)', () => {
    const three = computeModifiers(withInvocation(fresh(), 'nightmare', 3));
    expect(three.reprobateSuicideRateMul).toBeCloseTo(1 + 0.05 * 3, 6);
  });

  it('Harpy: Choleric murder ×1.1 per stack', () => {
    const two = computeModifiers(withInvocation(fresh(), 'harpy', 2));
    expect(two.cholericMurderRateMul).toBeCloseTo(1.1 ** 2, 6);
  });

  it('Behemoth: +50% Stellar weight per stack', () => {
    const two = computeModifiers(withInvocation(fresh(), 'behemoth', 2));
    expect(two.tierWeightMul.stellar).toBeCloseTo(1 + 0.5 * 2, 6);
  });

  it('no invocations → bundle matches the neutral baseline for the affected fields', () => {
    const m = computeModifiers(fresh());
    expect(m.cholericMurderRateMul).toBe(NEUTRAL_MODIFIERS.cholericMurderRateMul);
    expect(m.tierWeightMul.apocalyptic).toBeUndefined();
    expect(m.tierWeightMul.stellar).toBeUndefined();
  });
});

describe('Katabasis dispels all invocations (02 §7)', () => {
  it('invocations reset to empty on rebirth', () => {
    let s = withInvocation(fresh(), 'fama', 3);
    s = withInvocation(s, 'midas', 1);
    const { state } = commitKatabasis(s);
    expect(Object.keys(state.lifetime.invocations)).toHaveLength(0);
  });
});
