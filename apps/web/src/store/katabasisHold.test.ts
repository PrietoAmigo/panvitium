/**
 * Store actions backing the press-and-hold Katabasis offering (KatabasisModal `HoldButton`).
 * `bindMore` / `bindLess` move souls between the pool and a sigil binding by a *relative* delta,
 * reading fresh state each call (so a hold that ramps its delta per step composes correctly) and
 * clamping to the pool (locking) or to what is bound (freeing). Devotion offering reuses `offer`,
 * which already clamps to the pool, so it needs no new action.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bn, floor, type GameState } from '@panvitium/sim';
import { useGameStore } from './gameStore.js';

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();
const souls = (): number => floor((store().state as GameState).souls).toNumber();
const bound = (id: number): number => {
  const b = (store().state as GameState).sigilBindings[id];
  return b ? floor(b).toNumber() : 0;
};

function patchSouls(v: number): void {
  const s = store().state as GameState;
  useGameStore.setState({ state: { ...s, souls: bn(v) } });
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ state: null, ready: false, katabasisPhase: null, recap: null });
  store().init();
  patchSouls(1000);
});

describe('gameStore — press-and-hold binding (bindMore / bindLess)', () => {
  it('bindMore locks a relative delta, draining it from the pool', () => {
    store().bindMore(6, 100);
    expect(bound(6)).toBe(100);
    expect(souls()).toBe(900);
    // A second hold-step accumulates onto the same sigil.
    store().bindMore(6, 250);
    expect(bound(6)).toBe(350);
    expect(souls()).toBe(650);
  });

  it('bindMore clamps an over-large delta to the available pool', () => {
    store().bindMore(6, 100_000); // far more than the 1000 in the pool
    expect(bound(6)).toBe(1000);
    expect(souls()).toBe(0);
    // With an empty pool a further lock is a no-op.
    store().bindMore(6, 50);
    expect(bound(6)).toBe(1000);
    expect(souls()).toBe(0);
  });

  it('bindLess releases a relative delta back to the pool, clamping at zero', () => {
    store().bindMore(6, 400);
    expect(souls()).toBe(600);
    store().bindLess(6, 150);
    expect(bound(6)).toBe(250);
    expect(souls()).toBe(750);
    // Freeing more than is bound empties the sigil rather than going negative.
    store().bindLess(6, 9999);
    expect(bound(6)).toBe(0);
    expect(souls()).toBe(1000);
  });

  it('accepts a BigNum delta as well as a number', () => {
    store().bindMore(6, bn(120));
    expect(bound(6)).toBe(120);
    store().bindLess(6, bn(20));
    expect(bound(6)).toBe(100);
  });
});
