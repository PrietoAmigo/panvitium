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

function patchDevotion(sin: 'gula', value: number): void {
  const s = store().state as GameState;
  useGameStore.setState({ state: { ...s, devotion: { ...s.devotion, [sin]: bn(value) } } });
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

describe('gameStore — Vitium Mercatura (build/shutdown)', () => {
  it('refuses to build when below the gating Sin level (sets a notice)', () => {
    patchGold(500);
    // Devotion is 0 → gula L0 → can't build gula-mercatura-1 (requires L1).
    store().build('gula-mercatura-1');
    expect(store().state?.lifetime.buildQueue ?? []).toHaveLength(0);
    expect(store().notice).toMatch(/gula level/i);
  });

  it('refuses to build when gold is insufficient', () => {
    patchDevotion('gula', 180); // exactly L1
    patchGold(50);
    store().build('gula-mercatura-1');
    expect(store().state?.lifetime.buildQueue ?? []).toHaveLength(0);
    expect(store().notice).toMatch(/gold/i);
  });

  it('queues a build when gated and paid, leaving the player slot free', () => {
    patchDevotion('gula', 180);
    patchGold(500);
    store().build('gula-mercatura-1');
    const s = store().state as GameState;
    expect(s.lifetime.buildQueue).toHaveLength(1);
    expect(s.lifetime.actionQueue).toHaveLength(0); // doesn't occupy the player slot
    expect(floor(s.lifetime.gold).toNumber()).toBe(400);
    expect(store().notice).toBeNull();
  });

  it('completes a build via advance and lets the player shut it down for a 50% refund', () => {
    patchDevotion('gula', 180);
    patchGold(200);
    store().build('gula-mercatura-1');
    store().advance(30); // build completes in 30s
    const built = store().state as GameState;
    expect(built.lifetime.buildQueue).toHaveLength(0);
    expect(built.lifetime.businesses['gula-mercatura-1']).toBe(1);
    // Advance produced 30 s × 1 g/s of business gold ON TOP of base 10 g/s → 100 + 30 + base.
    // Don't over-specify the exact number; just check the shutdown delta.
    const goldBefore = floor(built.lifetime.gold).toNumber();
    store().shutdown('gula-mercatura-1');
    const after = store().state as GameState;
    expect(after.lifetime.businesses['gula-mercatura-1']).toBeUndefined();
    expect(floor(after.lifetime.gold).toNumber()).toBe(goldBefore + 50);
  });

  it('refuses shutdown when nothing owned', () => {
    patchDevotion('gula', 180);
    store().shutdown('gula-mercatura-1');
    expect(store().notice).toBeTruthy();
  });
});

describe('gameStore — acolyte delegation', () => {
  it('the first tick auto-recruits one acolyte from a fresh game', () => {
    expect(store().state?.lifetime.acolytes ?? []).toHaveLength(0);
    store().advance(0.1);
    expect(store().state?.lifetime.acolytes ?? []).toHaveLength(1);
  });

  it('assigns and unassigns Indagatio without occupying the player slot', () => {
    store().advance(0.1); // recruit
    store().assignAcolyte('indagatio');
    const s = store().state as GameState;
    expect(s.lifetime.acolytes[0]!.assignedAction).toBe('indagatio');
    expect(s.lifetime.actionQueue).toHaveLength(0);
    expect(store().notice).toBeNull();

    store().unassignAcolyte('indagatio');
    const after = store().state as GameState;
    expect(after.lifetime.acolytes[0]!.assignedAction).toBeNull();
    expect(after.lifetime.acolytes[0]!.remainingSeconds).toBeNull();
  });

  it('refuses assignment when nothing delegatable is selected', () => {
    store().advance(0.1); // recruit
    store().assignAcolyte('caedis'); // not delegatable in this slice
    expect(store().notice).toBeTruthy();
  });

  it('refuses assignment when all acolytes are busy', () => {
    store().advance(0.1); // recruit (1 acolyte at base influence)
    store().assignAcolyte('indagatio');
    store().assignAcolyte('indagatio'); // no one left to assign
    expect(store().notice).toMatch(/idle acolyte/i);
  });
});

describe('gameStore — Vitium Compositum ceremonies', () => {
  function patchTwoSins(a: 'gula' | 'avaritia', b: 'luxuria' | 'ira', level: number): void {
    const s = store().state as GameState;
    useGameStore.setState({
      state: {
        ...s,
        devotion: { ...s.devotion, [a]: bn(180 ** level), [b]: bn(180 ** level) },
      },
    });
  }

  it('refuses activation when the Sin gates are not met', () => {
    store().activateCeremony('bacchanal');
    expect(store().notice).toMatch(/gula 2 \+ luxuria 2/);
  });

  it('activates a ceremony when gated, adding it to activeToggles', () => {
    patchTwoSins('gula', 'luxuria', 2);
    store().activateCeremony('bacchanal');
    const s = store().state as GameState;
    expect(s.lifetime.activeToggles).toContain('bacchanal');
    expect(store().notice).toBeNull();
  });

  it('deactivates a running ceremony', () => {
    patchTwoSins('gula', 'luxuria', 2);
    store().activateCeremony('bacchanal');
    store().deactivateCeremony('bacchanal');
    const s = store().state as GameState;
    expect(s.lifetime.activeToggles).not.toContain('bacchanal');
  });

  it('auto-deactivates and surfaces a notice when upkeep cannot be paid', () => {
    patchTwoSins('gula', 'luxuria', 2);
    // bacchanal costs 50 gold/s; zero it out so the next tick can't pay.
    const s0 = store().state as GameState;
    useGameStore.setState({ state: { ...s0, lifetime: { ...s0.lifetime, gold: bn(0) } } });
    store().activateCeremony('bacchanal');
    store().advance(1);
    const s = store().state as GameState;
    expect(s.lifetime.activeToggles).not.toContain('bacchanal');
    expect(store().notice).toMatch(/bacchanal/i);
  });
});

describe('gameStore — invocations', () => {
  function equipPower(ip: number): void {
    const s = store().state as GameState;
    const maleficia = Array.from({ length: ip }, () => 'black_salt_pouch');
    useGameStore.setState({ state: { ...s, lifetime: { ...s.lifetime, maleficia } } });
  }
  function patchSuperbia(level: number): void {
    const s = store().state as GameState;
    useGameStore.setState({
      state: { ...s, devotion: { ...s.devotion, superbia: bn(180 ** level) } },
    });
  }

  it('refuses to summon without invoking power / Sin level', () => {
    patchSouls(1_000_000);
    store().summon('behemoth');
    expect(store().notice).toBeTruthy();
    expect(store().state?.lifetime.invocations.behemoth ?? 0).toBe(0);
  });

  it('summons when gated and paid, deducting souls', () => {
    equipPower(3);
    patchSuperbia(1);
    patchSouls(1000);
    store().summon('behemoth'); // cost = max(100, 10% of 1000) = 100
    const s = store().state as GameState;
    expect(s.lifetime.invocations.behemoth).toBe(1);
    expect(floor(s.souls).toNumber()).toBe(900);
    expect(store().notice).toBeNull();
  });

  it('dispels an active invocation', () => {
    equipPower(3);
    patchSuperbia(1);
    patchSouls(1_000_000);
    store().summon('behemoth');
    store().banish('behemoth');
    expect(store().state?.lifetime.invocations.behemoth ?? 0).toBe(0);
  });

  it('enforces the apex max-active cap (Doppelgaenger)', () => {
    equipPower(12);
    patchSuperbia(3);
    store().summon('doppelgaenger'); // free, max 1
    store().summon('doppelgaenger'); // second is rejected
    expect(store().state?.lifetime.invocations.doppelgaenger).toBe(1);
    expect(store().notice).toMatch(/limit/i);
  });
});

describe('gameStore — Panvitium', () => {
  function unlockAllSins(): void {
    const s = store().state as GameState;
    const devotion = { ...s.devotion };
    for (const k of Object.keys(devotion) as (keyof typeof devotion)[]) devotion[k] = bn(180 ** 3);
    useGameStore.setState({
      state: { ...s, devotion, lifetime: { ...s.lifetime, gold: bn(1e12), influence: bn(1e12) } },
    });
  }

  it('activates Panvitium once every Sin is level 3, and refuses manual deactivation', () => {
    unlockAllSins();
    store().activateCeremony('panvitium');
    expect(store().state?.lifetime.activeToggles).toContain('panvitium');
    store().deactivateCeremony('panvitium');
    expect(store().state?.lifetime.activeToggles).toContain('panvitium'); // still on
    expect(store().notice).toMatch(/cannot be stopped/i);
  });

  it('refuses activation before all Sins are level 3', () => {
    store().activateCeremony('panvitium');
    expect(store().state?.lifetime.activeToggles ?? []).not.toContain('panvitium');
    expect(store().notice).toBeTruthy();
  });
});
