/**
 * Eternal Sin tests (03 §8, 01). Pins:
 *   - hidden until every Cardinal Sin is at MAX_SIN_LEVEL
 *   - offering is a no-op before all Sins are maxed; otherwise moves souls → eternalDevotion
 *   - reveal at ETERNAL_SIN_THRESHOLD cumulative
 *   - progress is [0, 1]
 *   - runtime score = lastTickAt − startedAt
 *   - eternalDevotion persists across Katabasis (it's top-level, not lifetime)
 */
import { describe, expect, it } from 'vitest';
import {
  allSinsMaxed,
  bn,
  commitKatabasis,
  createInitialState,
  ETERNAL_SIN_THRESHOLD,
  eternalProgress,
  eternalSinRevealed,
  eternalSinVisible,
  gameRuntimeMs,
  offerEternal,
  SINS,
  type GameState,
} from './index.js';

function fresh(seed = 'eternal', t = 0): GameState {
  return createInitialState(seed, t);
}

/** Bring every Cardinal Sin to level 4 (180^4 Devotion each). */
function maxAllSins(s: GameState): GameState {
  const devotion = { ...s.devotion };
  for (const sin of SINS) devotion[sin] = bn(180 ** 4);
  return { ...s, devotion };
}

function withSouls(s: GameState, v: number | string): GameState {
  return { ...s, souls: bn(v) };
}

describe('Eternal Sin — gating', () => {
  it('is invisible until every Cardinal Sin is maxed', () => {
    expect(eternalSinVisible(fresh())).toBe(false);
    expect(allSinsMaxed(fresh())).toBe(false);
    // Seven of eight is not enough.
    let seven = fresh();
    const devotion = { ...seven.devotion };
    for (const sin of SINS.slice(0, 7)) devotion[sin] = bn(180 ** 4);
    seven = { ...seven, devotion };
    expect(eternalSinVisible(seven)).toBe(false);
  });

  it('becomes visible once all eight Cardinal Sins are at level 4', () => {
    expect(eternalSinVisible(maxAllSins(fresh()))).toBe(true);
    expect(allSinsMaxed(maxAllSins(fresh()))).toBe(true);
  });
});

describe('offerEternal', () => {
  it('is a no-op before all Sins are maxed (the Eternal Sin does not yet exist)', () => {
    const s = withSouls(fresh(), 1_000_000);
    const after = offerEternal(s, 1000);
    expect(after.eternalDevotion.toNumber()).toBe(0);
    expect(after.souls.toNumber()).toBe(1_000_000); // untouched
  });

  it('moves souls into eternalDevotion once unlocked, floored and clamped to the pool', () => {
    let s = maxAllSins(withSouls(fresh(), 500));
    s = offerEternal(s, 200);
    expect(s.eternalDevotion.toNumber()).toBe(200);
    expect(s.souls.toNumber()).toBe(300);
    // Offering more than the pool clamps.
    s = offerEternal(s, 99999);
    expect(s.eternalDevotion.toNumber()).toBe(500);
    expect(s.souls.toNumber()).toBe(0);
  });
});

describe('Reveal threshold', () => {
  it('is not revealed below the threshold and revealed at/above it', () => {
    let s = maxAllSins(withSouls(fresh(), ETERNAL_SIN_THRESHOLD + 10));
    expect(eternalSinRevealed(s)).toBe(false);
    s = offerEternal(s, ETERNAL_SIN_THRESHOLD - 1);
    expect(eternalSinRevealed(s)).toBe(false);
    s = offerEternal(s, 1); // now exactly the threshold
    expect(eternalSinRevealed(s)).toBe(true);
  });

  it('progress runs 0 → 1 on a log scale', () => {
    let s = maxAllSins(withSouls(fresh(), ETERNAL_SIN_THRESHOLD * 2));
    expect(eternalProgress(s)).toBe(0);
    // Log-scaled: the halfway mark is the geometric midpoint (√threshold), not threshold/2.
    s = offerEternal(s, Math.round(Math.sqrt(ETERNAL_SIN_THRESHOLD)));
    expect(eternalProgress(s)).toBeCloseTo(0.5, 2);
    s = offerEternal(s, ETERNAL_SIN_THRESHOLD * 2); // pour past the gate — the bar tops out at 1
    expect(eternalProgress(s)).toBe(1);
  });
});

describe('Runtime score', () => {
  it('is lastTickAt − startedAt', () => {
    const s = createInitialState('seed', 1_000);
    expect(gameRuntimeMs(s)).toBe(0);
    const later = { ...s, lastTickAt: 1_000 + 3_600_000 }; // +1 hour
    expect(gameRuntimeMs(later)).toBe(3_600_000);
  });

  it('never goes negative', () => {
    const s = { ...createInitialState('seed', 5_000), lastTickAt: 1_000 };
    expect(gameRuntimeMs(s)).toBe(0);
  });
});

describe('Persistence across Katabasis', () => {
  it('eternalDevotion and startedAt survive a descent (top-level, not lifetime)', () => {
    let s = maxAllSins(withSouls(fresh('kata', 7_000), 1000));
    s = offerEternal(s, 400);
    const { state } = commitKatabasis(s);
    expect(state.eternalDevotion.toNumber()).toBe(400);
    expect(state.startedAt).toBe(7_000);
  });
});
