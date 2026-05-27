import { describe, it, expect, beforeEach } from 'vitest';
import { bn, type GameState } from '@panvitium/sim';
import { useGameStore } from './gameStore.js';

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();

function patchGold(g: number): void {
  const s = store().state as GameState;
  useGameStore.setState({ state: { ...s, lifetime: { ...s.lifetime, gold: bn(g) } } });
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({
    state: null,
    saveVersion: 0,
    deviceId: '',
    ready: false,
    log: [],
    signature: null,
    notice: null,
  });
  store().init();
});

describe('gameStore — action wiring', () => {
  it('starts a fresh game on init with an empty log', () => {
    expect(store().ready).toBe(true);
    expect(store().state).not.toBeNull();
    expect(store().log).toHaveLength(0);
  });

  it('queues an affordable action and clears any notice', () => {
    patchGold(200);
    store().act('caedis');
    expect(store().state?.lifetime.actionQueue).toHaveLength(1);
    expect(store().notice).toBeNull();
  });

  it('refuses a second action while one is underway (one player action at a time)', () => {
    patchGold(300);
    store().act('caedis');
    expect(store().state?.lifetime.actionQueue).toHaveLength(1);
    store().act('caedis'); // a rite is already underway
    expect(store().state?.lifetime.actionQueue).toHaveLength(1);
    expect(store().notice).toBeTruthy();
  });

  it('refuses an unaffordable action with a notice and no queue', () => {
    store().act('caedis'); // fresh game has no gold
    expect(store().state?.lifetime.actionQueue ?? []).toHaveLength(0);
    expect(store().notice).toBeTruthy();
  });

  it('dismisses a notice', () => {
    store().act('caedis');
    expect(store().notice).toBeTruthy();
    store().dismissNotice();
    expect(store().notice).toBeNull();
  });
});

describe('gameStore — outcome log', () => {
  it('records an outcome when a queued action resolves', () => {
    patchGold(200);
    store().act('caedis');
    store().advance(10); // resolves the 10 s Caedis
    expect(store().state?.lifetime.actionQueue).toHaveLength(0);
    expect(store().log.length).toBeGreaterThanOrEqual(1);
    expect(store().log[0]?.actionId).toBe('caedis');
  });

  it('caps the log at 100 entries, newest first', () => {
    for (let i = 0; i < 120; i++) {
      patchGold(200);
      store().act('caedis');
      store().advance(10);
    }
    expect(store().log).toHaveLength(100);
    expect(store().log[0]?.actionId).toBe('caedis');
  });
});
