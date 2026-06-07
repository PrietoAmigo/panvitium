import { describe, it, expect, beforeEach } from 'vitest';
import {
  bn,
  floor,
  sinLevel,
  SINS,
  ETERNAL_SIN_THRESHOLD,
  computeModifiers,
  type GameState,
} from '@panvitium/sim';
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

/** Raise max influence so acolytes can be recruited (first acolyte unlocks at 242). */
function patchMaxInfluence(v: number): void {
  const s = store().state as GameState;
  useGameStore.setState({ state: { ...s, lifetime: { ...s.lifetime, maxInfluence: bn(v) } } });
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
    titleOpen: false,
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

describe('gameStore — maleficia activation (5.1)', () => {
  it('uses a Hand of Glory: consumes one copy and starts the buff, clearing any notice', () => {
    const s = store().state as GameState;
    useGameStore.setState({
      state: { ...s, lifetime: { ...s.lifetime, maleficia: ['hand_of_glory'] } },
    });
    store().activateMaleficium('hand_of_glory');
    expect(store().state?.lifetime.maleficia).toHaveLength(0);
    expect(store().state?.lifetime.handOfGloryRemaining ?? 0).toBeGreaterThan(0);
    expect(store().notice).toBeNull();
  });

  it('sets a notice and changes nothing when the item is not owned', () => {
    const before = store().state?.lifetime.maleficia.length ?? 0;
    store().activateMaleficium('hand_of_glory');
    expect(store().state?.lifetime.maleficia.length ?? 0).toBe(before);
    expect(store().notice).toBeTruthy();
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

  it('openKatabasis opens the gate without committing — no teardown until beginKatabasis', () => {
    const s0 = store().state as GameState;
    useGameStore.setState({
      state: {
        ...s0,
        lifetime: { ...s0.lifetime, businesses: { ...s0.lifetime.businesses, gula_1: 2 } },
      },
    });
    store().openKatabasis();
    const st = store().state as GameState;
    expect(store().katabasisPhase).toBe('menu'); // gate is showing…
    expect(st.inKatabasis).not.toBe(true); // …but the lifetime is intact (nothing torn down)
    expect(st.lifetime.businesses.gula_1).toBe(2);
    // Turning back is a clean exit.
    store().closeKatabasis();
    expect(store().katabasisPhase).toBeNull();
    expect((store().state as GameState).lifetime.businesses.gula_1).toBe(2);
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

  it('freezes the lifetime while the menu is open — souls do not accrue during the descent', () => {
    const s0 = store().state as GameState;
    useGameStore.setState({
      state: {
        ...s0,
        lifetime: { ...s0.lifetime, reprobates: { ...s0.lifetime.reprobates, reprobate: 5000 } },
      },
    });
    store().beginKatabasis();
    const soulsAtEntry = floor((store().state as GameState).souls).toNumber();
    store().advance(3600); // an hour of would-be suicides
    expect(floor((store().state as GameState).souls).toNumber()).toBe(soulsAtEntry);
  });

  it('entering Katabasis tears down businesses, toggles, and invocations immediately', () => {
    const s0 = store().state as GameState;
    useGameStore.setState({
      state: {
        ...s0,
        lifetime: {
          ...s0.lifetime,
          businesses: { 'gula-mercatura-1': 1 },
          activeToggles: ['bacchanal'],
          invocations: { imp: 1 },
        },
      },
    });
    store().beginKatabasis();
    const st = store().state as GameState;
    expect(Object.keys(st.lifetime.businesses)).toHaveLength(0);
    expect(st.lifetime.activeToggles).toHaveLength(0);
    expect(Object.keys(st.lifetime.invocations)).toHaveLength(0);
  });

  it('a reload mid-descent re-opens the allocation menu (frozen flag persisted)', () => {
    store().beginKatabasis();
    expect((store().state as GameState).inKatabasis).toBe(true);
    store().persist(); // write the frozen save to localStorage
    // Simulate a reload: forget we are ready and which screen was open, then re-init from the save.
    useGameStore.setState({ ready: false, katabasisPhase: null });
    store().init();
    expect(store().katabasisPhase).toBe('menu');
    expect((store().state as GameState).inKatabasis).toBe(true);
  });
});

describe('gameStore — Vitium Mercatura (build/shutdown)', () => {
  it('builds the entry tier at Sin level 0 (gated at tier − 1)', () => {
    patchGold(1000);
    // Devotion is 0; the entry tier unlocks at Sin level 0, so a fresh player can build it.
    store().build('gula-mercatura-1');
    expect(store().state?.lifetime.buildQueue ?? []).toHaveLength(1);
    expect(store().notice).toBeNull();
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
    patchGold(2000);
    store().build('gula-mercatura-1');
    const s = store().state as GameState;
    expect(s.lifetime.buildQueue).toHaveLength(1);
    expect(s.lifetime.actionQueue).toHaveLength(0); // doesn't occupy the player slot
    expect(floor(s.lifetime.gold).toNumber()).toBe(1500); // 2000 − 500 (Gula tier-1 cost)
    expect(store().notice).toBeNull();
  });

  it('completes a build via advance and lets the player shut it down for a 25% refund', () => {
    patchDevotion('gula', 180);
    patchGold(2000);
    store().build('gula-mercatura-1');
    store().advance(60); // build completes in 60s
    const built = store().state as GameState;
    expect(built.lifetime.buildQueue).toHaveLength(0);
    expect(built.lifetime.businesses['gula-mercatura-1']).toBe(1);
    // Don't over-specify business/base gold accrued during the advance; check the shutdown delta.
    const goldBefore = floor(built.lifetime.gold).toNumber();
    store().shutdown('gula-mercatura-1');
    const after = store().state as GameState;
    expect(after.lifetime.businesses['gula-mercatura-1']).toBeUndefined();
    expect(floor(after.lifetime.gold).toNumber()).toBe(goldBefore + 125); // floor(500 * 0.25)
  });

  it('refuses shutdown when nothing owned', () => {
    patchDevotion('gula', 180);
    store().shutdown('gula-mercatura-1');
    expect(store().notice).toBeTruthy();
  });
});

describe('gameStore — acolyte delegation', () => {
  it('the first tick auto-recruits one acolyte once influence reaches the first threshold', () => {
    expect(store().state?.lifetime.acolytes ?? []).toHaveLength(0);
    store().advance(0.1);
    expect(store().state?.lifetime.acolytes ?? []).toHaveLength(0); // base influence: still none
    patchMaxInfluence(242);
    store().advance(0.1);
    expect(store().state?.lifetime.acolytes ?? []).toHaveLength(1);
  });

  it('assigns and unassigns Indagatio without occupying the player slot', () => {
    patchMaxInfluence(242);
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

  it('refuses assignment of a non-delegatable action', () => {
    store().advance(0.1); // recruit
    store().assignAcolyte('emptio'); // Emptio needs a per-target maleficium — not delegatable
    expect(store().notice).toBeTruthy();
  });

  it('refuses assignment when all acolytes are busy', () => {
    patchMaxInfluence(242);
    store().advance(0.1); // recruit (1 acolyte at this influence)
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
    expect(store().notice).toMatch(/gula 1 \+ luxuria 1/);
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

describe('gameStore — Eternal Sin', () => {
  function maxAllSins(): void {
    const s = store().state as GameState;
    const devotion = { ...s.devotion };
    for (const sin of SINS) devotion[sin] = bn(180 ** 4);
    useGameStore.setState({ state: { ...s, devotion } });
  }

  it('offering is a no-op before all Sins are maxed', () => {
    patchSouls(1_000_000);
    store().offerEternal(1000);
    expect(store().state?.eternalDevotion.toNumber()).toBe(0);
    expect(store().eternalReveal).toBe(false);
  });

  it('offers to the Eternal Sin once all Sins are maxed', () => {
    maxAllSins();
    patchSouls(5000);
    store().offerEternal(2000);
    expect(store().state?.eternalDevotion.toNumber()).toBe(2000);
    expect(floor(store().state!.souls).toNumber()).toBe(3000);
  });

  it('crossing the threshold raises the reveal flag exactly once', () => {
    maxAllSins();
    patchSouls(ETERNAL_SIN_THRESHOLD + 100);
    store().offerEternal(ETERNAL_SIN_THRESHOLD - 1);
    expect(store().eternalReveal).toBe(false); // not yet
    store().offerEternal(1); // crosses
    expect(store().eternalReveal).toBe(true);
    // Dismiss, then offer more — it must not re-trigger.
    store().dismissEternalReveal();
    expect(store().eternalReveal).toBe(false);
    store().offerEternal(50);
    expect(store().eternalReveal).toBe(false);
  });
});

describe('gameStore — sigil binding', () => {
  it('binds souls to a sigil, moving them out of the pool', () => {
    patchSouls(10_000);
    store().bind(6, 4000); // Valefor
    const s = store().state as GameState;
    expect(s.sigilBindings[6]?.toNumber()).toBe(4000);
    expect(floor(s.souls).toNumber()).toBe(6000);
  });

  it('rebinds to an absolute target (delta returns to the pool)', () => {
    patchSouls(10_000);
    store().bind(6, 4000);
    store().bind(6, 1000); // lower the binding → 3000 returns
    const s = store().state as GameState;
    expect(s.sigilBindings[6]?.toNumber()).toBe(1000);
    expect(floor(s.souls).toNumber()).toBe(9000);
  });

  it('unbinds entirely, returning all souls', () => {
    patchSouls(10_000);
    store().bind(6, 4000);
    store().unbind(6);
    const s = store().state as GameState;
    expect(s.sigilBindings[6]).toBeUndefined();
    expect(floor(s.souls).toNumber()).toBe(10_000);
  });

  it('bindings persist across a descent (no auto-unbind on beginKatabasis)', () => {
    patchSouls(10_000);
    store().bind(6, 4000);
    store().bind(7, 1000); // Aamon
    store().beginKatabasis();
    const s = store().state as GameState;
    expect(s.sigilBindings[6]?.toNumber()).toBe(4000);
    expect(s.sigilBindings[7]?.toNumber()).toBe(1000);
    expect(floor(s.souls).toNumber()).toBe(5000); // pool untouched by entering
  });

  it('unbindAll returns every bound soul to the pool at once', () => {
    patchSouls(10_000);
    store().bind(6, 4000);
    store().bind(7, 1000);
    store().unbindAll();
    const s = store().state as GameState;
    expect(s.sigilBindings[6]).toBeUndefined();
    expect(s.sigilBindings[7]).toBeUndefined();
    expect(floor(s.souls).toNumber()).toBe(10_000);
  });

  it('a bound sigil changes the modifier bundle', () => {
    patchSouls(10_000);
    const before = computeModifiers(store().state as GameState).goldRateMul;
    store().bind(6, 10_000); // Valefor: gold rate up
    const after = computeModifiers(store().state as GameState).goldRateMul;
    expect(after).toBeGreaterThan(before);
  });

  it('exports the current save and re-imports it (round-trip)', () => {
    patchSouls(98_765);
    const text = store().exportSave();
    expect(text).not.toBeNull();
    patchSouls(1); // perturb, then restore from the export
    expect(store().importSave(text as string)).toBe(true);
    expect(floor((store().state as GameState).souls).toNumber()).toBe(98_765);
  });

  it('rejects an invalid import and leaves the game untouched', () => {
    const before = store().state;
    expect(store().importSave('garbage')).toBe(false);
    expect(store().state).toBe(before);
  });
});
