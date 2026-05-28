import { describe, it, expect } from 'vitest';
import { createInitialState, bn, eq, type GameState } from '@panvitium/sim';
import {
  serializeGameState,
  deserializeGameState,
  serializedGameStateSchema,
} from './state-schema.js';
import {
  saveBlobSchema,
  summarizeSave,
  newDeviceId,
  CURRENT_SCHEMA_VERSION,
  type SaveBlob,
} from './schema.js';

function makeBlob(state: GameState, saveVersion = 0): SaveBlob {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saveVersion,
    lastTickAt: state.lastTickAt,
    deviceId: newDeviceId(),
    state: serializeGameState(state),
  };
}

describe('GameState serialization', () => {
  it('produces a form that passes the schema', () => {
    const serialized = serializeGameState(createInitialState('seed', 1000));
    expect(serializedGameStateSchema.safeParse(serialized).success).toBe(true);
  });

  it('round-trips a fresh state', () => {
    const original = createInitialState('seed', 1234);
    const back = deserializeGameState(serializeGameState(original));
    expect(eq(back.souls, original.souls)).toBe(true);
    expect(back.rngState).toBe(original.rngState);
    expect(back.lastTickAt).toBe(original.lastTickAt);
    expect(back.lifetime.reprobates).toEqual(original.lifetime.reprobates);
  });

  it('preserves huge BigNum values exactly across the wire', () => {
    const original = createInitialState('seed', 0);
    // souls far past 2^53, plus some Devotion and a sigil binding.
    const loaded: GameState = {
      ...original,
      souls: bn('1.23456789e120'),
      devotion: { ...original.devotion, ira: bn('1049760000') },
      sigilBindings: { 7: bn('500'), 32: bn('1e30') },
    };
    const back = deserializeGameState(serializeGameState(loaded));
    expect(eq(back.souls, loaded.souls)).toBe(true);
    expect(eq(back.devotion.ira, bn('1049760000'))).toBe(true);
    expect(eq(back.sigilBindings[7]!, bn('500'))).toBe(true);
    expect(eq(back.sigilBindings[32]!, bn('1e30'))).toBe(true);
  });
});

describe('SaveBlob envelope', () => {
  it('validates a well-formed blob and survives a JSON round-trip', () => {
    const blob = makeBlob(createInitialState('seed', 9999), 3);
    expect(saveBlobSchema.safeParse(blob).success).toBe(true);
    const reparsed = saveBlobSchema.safeParse(JSON.parse(JSON.stringify(blob)));
    expect(reparsed.success).toBe(true);
  });

  it('rejects a wrong schema version and a missing deviceId', () => {
    const blob = makeBlob(createInitialState('seed', 0));
    expect(saveBlobSchema.safeParse({ ...blob, schemaVersion: 2 }).success).toBe(false);
    const { deviceId: _omit, ...withoutDevice } = blob;
    expect(saveBlobSchema.safeParse(withoutDevice).success).toBe(false);
  });

  it('summarizes a save for the conflict chooser', () => {
    const blob = makeBlob(createInitialState('seed', 5), 5);
    const summary = summarizeSave(blob);
    expect(summary.saveVersion).toBe(5);
    expect(summary.souls).toBe('0');
  });

  it('stays far under the 100 KB save budget for a fresh game (ADR-006)', () => {
    const bytes = JSON.stringify(makeBlob(createInitialState('seed', 0))).length;
    expect(bytes).toBeLessThan(100 * 1024);
  });
});

describe('reprobate-dynamics pools — ADR-023 additive-optional', () => {
  it('a v1 save without pool fields loads with pools defaulting to 0', () => {
    const fresh = createInitialState('seed', 0);
    const serialized = serializeGameState(fresh);
    // Strip the pool fields entirely — this simulates a save written by a pre-pool build.
    const { generationPool, suicidePool, murderPool, ...lifetimeMinusPools } = serialized.lifetime;
    void generationPool;
    void suicidePool;
    void murderPool;
    const oldShape = { ...serialized, lifetime: lifetimeMinusPools };
    // Schema accepts it (fields are optional) and the loader fills the runtime defaults.
    const parsed = serializedGameStateSchema.safeParse(oldShape);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const back = deserializeGameState(parsed.data);
    expect(back.lifetime.generationPool).toBe(0);
    expect(back.lifetime.suicidePool).toBe(0);
    expect(back.lifetime.murderPool).toBe(0);
  });

  it('a fresh save omits zero-valued pool fields from the wire (compact)', () => {
    const serialized = serializeGameState(createInitialState('seed', 0));
    // Wire shape stays identical to the pre-pool form for fresh games — keys not present.
    expect('generationPool' in serialized.lifetime).toBe(false);
    expect('suicidePool' in serialized.lifetime).toBe(false);
    expect('murderPool' in serialized.lifetime).toBe(false);
  });

  it('non-zero pools round-trip through the wire correctly', () => {
    const fresh = createInitialState('seed', 0);
    const withPools: GameState = {
      ...fresh,
      lifetime: {
        ...fresh.lifetime,
        generationPool: 0.5,
        suicidePool: 0.97,
        murderPool: 0.001,
      },
    };
    const back = deserializeGameState(serializeGameState(withPools));
    expect(back.lifetime.generationPool).toBeCloseTo(0.5, 10);
    expect(back.lifetime.suicidePool).toBeCloseTo(0.97, 10);
    expect(back.lifetime.murderPool).toBeCloseTo(0.001, 10);
  });

  it('schemaVersion remains v1 — pools are additive-optional, no bump needed', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});

describe('Vitium Mercatura state — ADR-023 additive-optional', () => {
  it('a v1 save without businesses/buildQueue/conversionPool loads with defaults', () => {
    const fresh = createInitialState('seed', 0);
    const serialized = serializeGameState(fresh);
    // Strip the Vitium fields entirely — simulates a pre-Vitium save.
    const {
      businesses,
      buildQueue,
      conversionPool,
      generationPool,
      suicidePool,
      murderPool,
      ...rest
    } = serialized.lifetime;
    void businesses;
    void buildQueue;
    void conversionPool;
    void generationPool;
    void suicidePool;
    void murderPool;
    const oldShape = { ...serialized, lifetime: rest };
    const parsed = serializedGameStateSchema.safeParse(oldShape);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const back = deserializeGameState(parsed.data);
    expect(back.lifetime.businesses).toEqual({});
    expect(back.lifetime.buildQueue).toEqual([]);
    expect(back.lifetime.conversionPool).toBe(0);
  });

  it('a fresh save omits empty businesses/buildQueue and zero conversionPool from the wire', () => {
    const serialized = serializeGameState(createInitialState('seed', 0));
    expect('businesses' in serialized.lifetime).toBe(false);
    expect('buildQueue' in serialized.lifetime).toBe(false);
    expect('conversionPool' in serialized.lifetime).toBe(false);
  });

  it('non-empty Vitium state round-trips through the wire', () => {
    const fresh = createInitialState('seed', 0);
    const withVitium: GameState = {
      ...fresh,
      lifetime: {
        ...fresh.lifetime,
        businesses: { 'gula-mercatura-1': 3, 'avaritia-mercatura-1': 1 },
        buildQueue: [
          { businessId: 'luxuria-mercatura-1', remainingSeconds: 12.5 },
          { businessId: 'gula-mercatura-1', remainingSeconds: 27 },
        ],
        conversionPool: 0.42,
      },
    };
    const back = deserializeGameState(serializeGameState(withVitium));
    expect(back.lifetime.businesses).toEqual({ 'gula-mercatura-1': 3, 'avaritia-mercatura-1': 1 });
    expect(back.lifetime.buildQueue).toHaveLength(2);
    expect(back.lifetime.buildQueue[0]!.businessId).toBe('luxuria-mercatura-1');
    expect(back.lifetime.buildQueue[0]!.remainingSeconds).toBe(12.5);
    expect(back.lifetime.conversionPool).toBeCloseTo(0.42, 10);
  });
});

describe('Acolyte schema — additive-optional remainingSeconds', () => {
  it('an old save where acolyte rows lack remainingSeconds loads with the timer at null', () => {
    const fresh = createInitialState('seed', 0);
    const serialized = serializeGameState(fresh);
    // Inject a synthetic pre-timer acolyte row (no remainingSeconds field on the wire).
    const lifetime = {
      ...serialized.lifetime,
      acolytes: [{ id: 1, assignedAction: null }],
    };
    const parsed = serializedGameStateSchema.safeParse({ ...serialized, lifetime });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const back = deserializeGameState(parsed.data);
    expect(back.lifetime.acolytes).toHaveLength(1);
    expect(back.lifetime.acolytes[0]!.remainingSeconds).toBeNull();
  });

  it('a fresh save with no acolytes does not put remainingSeconds keys on the wire', () => {
    const serialized = serializeGameState(createInitialState('seed', 0));
    // No acolytes at all → array is empty → nothing to check on the entries themselves.
    expect(serialized.lifetime.acolytes).toEqual([]);
  });

  it('an acolyte mid-cycle round-trips its timer exactly', () => {
    const fresh = createInitialState('seed', 0);
    const withTimer: GameState = {
      ...fresh,
      lifetime: {
        ...fresh.lifetime,
        acolytes: [
          { id: 1, assignedAction: 'indagatio', remainingSeconds: 4321.5 },
          { id: 2, assignedAction: null, remainingSeconds: null },
        ],
      },
    };
    const wire = serializeGameState(withTimer);
    // Idle acolyte omits the timer key (additive-optional discipline).
    expect('remainingSeconds' in wire.lifetime.acolytes[0]!).toBe(true);
    expect('remainingSeconds' in wire.lifetime.acolytes[1]!).toBe(false);
    const back = deserializeGameState(wire);
    expect(back.lifetime.acolytes[0]!.remainingSeconds).toBe(4321.5);
    expect(back.lifetime.acolytes[1]!.remainingSeconds).toBeNull();
  });
});

describe('toggleDurations — ADR-023 additive-optional', () => {
  it('a pre-Panvitium save without toggleDurations loads with an empty map', () => {
    const fresh = createInitialState('seed', 0);
    const serialized = serializeGameState(fresh);
    const { toggleDurations, ...rest } = serialized.lifetime;
    void toggleDurations;
    const parsed = serializedGameStateSchema.safeParse({
      ...serialized,
      lifetime: rest,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const back = deserializeGameState(parsed.data);
    expect(back.lifetime.toggleDurations).toEqual({});
  });

  it('a fresh save omits toggleDurations from the wire', () => {
    const serialized = serializeGameState(createInitialState('seed', 0));
    expect('toggleDurations' in serialized.lifetime).toBe(false);
  });

  it('a Panvitium burst mid-flight round-trips its duration', () => {
    const fresh = createInitialState('seed', 0);
    const live: GameState = {
      ...fresh,
      lifetime: {
        ...fresh.lifetime,
        activeToggles: ['panvitium'],
        toggleDurations: { panvitium: 42.5 },
      },
    };
    const wire = serializeGameState(live);
    expect(wire.lifetime.toggleDurations).toEqual({ panvitium: 42.5 });
    const back = deserializeGameState(wire);
    expect(back.lifetime.toggleDurations.panvitium).toBe(42.5);
  });
});

describe('invocationRunners — ADR-023 additive-optional', () => {
  it('a save predating autonomous runners loads with an empty map', () => {
    const fresh = createInitialState('seed', 0);
    const serialized = serializeGameState(fresh);
    const { invocationRunners, ...rest } = serialized.lifetime;
    void invocationRunners;
    const parsed = serializedGameStateSchema.safeParse({ ...serialized, lifetime: rest });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const back = deserializeGameState(parsed.data);
    expect(back.lifetime.invocationRunners).toEqual({});
  });

  it('a fresh save omits invocationRunners from the wire', () => {
    const serialized = serializeGameState(createInitialState('seed', 0));
    expect('invocationRunners' in serialized.lifetime).toBe(false);
  });

  it('a Familiar mid-cycle round-trips its background-Indagatio timer', () => {
    const fresh = createInitialState('seed', 0);
    const live: GameState = {
      ...fresh,
      lifetime: {
        ...fresh.lifetime,
        invocations: { familiar: 1 },
        invocationRunners: { familiar: 3120.5 },
      },
    };
    const wire = serializeGameState(live);
    expect(wire.lifetime.invocationRunners).toEqual({ familiar: 3120.5 });
    const back = deserializeGameState(wire);
    expect(back.lifetime.invocationRunners.familiar).toBe(3120.5);
  });
});

describe('eternalDevotion + startedAt — ADR-023 additive-optional', () => {
  it('a pre-Eternal save without the fields loads with ZERO devotion and startedAt = lastTickAt', () => {
    const fresh = createInitialState('seed', 4_000);
    const serialized = serializeGameState(fresh);
    const { eternalDevotion, startedAt, ...rest } = serialized;
    void eternalDevotion;
    void startedAt;
    const parsed = serializedGameStateSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const back = deserializeGameState(parsed.data);
    expect(back.eternalDevotion.toNumber()).toBe(0);
    expect(back.startedAt).toBe(back.lastTickAt);
  });

  it('a fresh save omits eternalDevotion but always emits startedAt', () => {
    const serialized = serializeGameState(createInitialState('seed', 4_000));
    expect('eternalDevotion' in serialized).toBe(false);
    expect(serialized.startedAt).toBe(4_000);
  });

  it('round-trips a populated eternalDevotion and a distinct startedAt', () => {
    const fresh = createInitialState('seed', 4_000);
    const live: GameState = {
      ...fresh,
      eternalDevotion: bn(1_234_567),
      lastTickAt: 4_000 + 90_000,
    };
    const wire = serializeGameState(live);
    expect(wire.eternalDevotion).toBeDefined();
    const back = deserializeGameState(wire);
    expect(back.eternalDevotion.toNumber()).toBe(1_234_567);
    expect(back.startedAt).toBe(4_000);
    expect(back.lastTickAt).toBe(94_000);
  });
});

describe('achievements + katabasisCount — ADR-023 additive-optional', () => {
  it('a save predating achievements loads with [] and 0', () => {
    const fresh = createInitialState('seed', 4_000);
    const serialized = serializeGameState(fresh);
    const { achievements, katabasisCount, ...rest } = serialized;
    void achievements;
    void katabasisCount;
    const parsed = serializedGameStateSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const back = deserializeGameState(parsed.data);
    expect(back.achievements).toEqual([]);
    expect(back.katabasisCount).toBe(0);
  });

  it('a fresh save omits both (empty/zero)', () => {
    const serialized = serializeGameState(createInitialState('seed', 4_000));
    expect('achievements' in serialized).toBe(false);
    expect('katabasisCount' in serialized).toBe(false);
  });

  it('round-trips populated achievements and a descent count', () => {
    const fresh = createInitialState('seed', 4_000);
    const live: GameState = {
      ...fresh,
      achievements: ['first_harvest', 'semet'],
      katabasisCount: 3,
    };
    const back = deserializeGameState(serializeGameState(live));
    expect(back.achievements).toEqual(['first_harvest', 'semet']);
    expect(back.katabasisCount).toBe(3);
  });
});

describe('inKatabasis — ADR-023 additive-optional freeze flag', () => {
  it('a fresh / non-descent save omits the flag from the wire', () => {
    const serialized = serializeGameState(createInitialState('seed', 5_000));
    expect('inKatabasis' in serialized).toBe(false);
  });

  it('a save written mid-descent round-trips the flag as true', () => {
    const fresh = createInitialState('seed', 5_000);
    const mid: GameState = { ...fresh, inKatabasis: true };
    const serialized = serializeGameState(mid);
    expect(serialized.inKatabasis).toBe(true);
    expect(deserializeGameState(serialized).inKatabasis).toBe(true);
  });

  it('an old save without the flag loads as not-in-Katabasis (absent ⇒ false)', () => {
    const serialized = serializeGameState(createInitialState('seed', 5_000));
    const back = deserializeGameState(serialized);
    expect(back.inKatabasis).not.toBe(true);
  });
});
