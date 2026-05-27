import { describe, it, expect, beforeEach } from 'vitest';
import { bn, floor, sinLevel, type GameState } from '@panvitium/sim';
import { useGameStore } from './gameStore.js';

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();

function patchGold(g: number): void {
  const s = store().state as GameState;
  useGameStore.setState({ state: { ...s, lifetime: { ...s.lifetime, gold: bn(g) } } });
}

function patchSouls(v: number): void {
  const s = store().state as GameState;
  useGameStore.setState({ state: { ...s, souls: bn(v) } });
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
    katabasisPhase: null,
    recap: null,
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

describe('gameStore — Katabasis', () => {
  it('beginKatabasis opens the menu', () => {
    store().beginKatabasis();
    expect(store().katabasisPhase).toBe('menu');
  });

  it('offers any amount (down to 1); levels are reached naturally at the threshold', () => {
    patchSouls(200);
    store().beginKatabasis();
    store().offer('gula', 1);
    let st = store().state as GameState;
    expect(st.devotion.gula.toString()).toBe('1');
    expect(sinLevel(st.devotion.gula)).toBe(0); // not a level yet, but skill rises
    expect(floor(st.souls).toNumber()).toBe(199);
    store().offer('gula', 179); // cumulative 180 → level 1 naturally
    st = store().state as GameState;
    expect(sinLevel(st.devotion.gula)).toBe(1);
    expect(floor(st.souls).toNumber()).toBe(20);
  });

  it('offering more than the pool clamps to what is available (Offer all)', () => {
    patchSouls(50);
    store().beginKatabasis();
    const all = (store().state as GameState).souls;
    store().offer('avaritia', all);
    const st = store().state as GameState;
    expect(st.devotion.avaritia.toString()).toBe('50');
    expect(floor(st.souls).toNumber()).toBe(0);
  });

  it('confirm resets the lifetime, shows the recap, then closes', () => {
    patchSouls(500);
    const s0 = store().state as GameState;
    useGameStore.setState({
      state: { ...s0, lifetime: { ...s0.lifetime, gold: bn(1000), influence: bn(70) } },
    });
    store().beginKatabasis();
    store().confirmKatabasis();
    expect(store().katabasisPhase).toBe('recap');
    expect(store().recap).not.toBeNull();
    const st = store().state as GameState;
    expect(floor(st.lifetime.influence).toNumber()).toBe(0);
    expect(floor(st.lifetime.gold).toNumber()).toBe(50); // base 5% of 1000
    expect(floor(st.souls).toNumber()).toBe(500); // carried over
    store().closeRecap();
    expect(store().katabasisPhase).toBeNull();
    expect(store().recap).toBeNull();
  });
});
