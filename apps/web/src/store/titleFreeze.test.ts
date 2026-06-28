/**
 * The launch title menu suspends the LIVE tick: while `titleOpen` is true, `advance` no-ops, so
 * nothing accrues online behind the menu. Unlike the committed-descent freeze, the held wall-clock
 * is not lost — `dismissTitle` pays it out as offline catch-up (covered in gameStore.test.ts); here
 * we only pin that the live tick is suspended while open and resumes once dismissed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { type GameState } from '@panvitium/sim';
import { useGameStore } from './gameStore.js';

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ state: null, ready: false, katabasisPhase: null, recap: null });
  store().init();
  // init() leaves titleOpen at whatever was set; pin it true for this test.
  useGameStore.setState({ titleOpen: true });
});

describe('gameStore — the title menu freezes the sim', () => {
  it('advance is a no-op while the title is open, then resumes once dismissed', () => {
    const before = store().state as GameState;
    store().advance(10);
    expect(store().state).toBe(before); // frozen → identical reference, nothing ticked

    store().dismissTitle();
    expect(store().titleOpen).toBe(false);
    store().advance(10);
    expect(store().state).not.toBe(before); // the tick ran and produced a new state
  });
});
