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
    expect(saveBlobSchema.safeParse({ ...blob, schemaVersion: 99 }).success).toBe(false);
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

  it('schemaVersion is v4 (the Decimatio caedis → caedes rite rename bumped it again)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
  });
});

describe('inbox reply / delete — ADR-023 additive-optional round-trip', () => {
  it('answeredReply + deleted survive the wire; untouched mail carries neither (defaults omitted)', () => {
    const fresh = createInitialState('seed', 0);
    const withMail: GameState = {
      ...fresh,
      lifetime: {
        ...fresh.lifetime,
        inbox: [
          { id: 'welcome', receivedAt: 10, readAt: 20, answeredReply: 2 },
          { id: 'class-action', receivedAt: 30, readAt: null, deleted: true },
          { id: 'first-business', receivedAt: 40, readAt: null },
        ],
      },
    };
    const back = deserializeGameState(serializeGameState(withMail)).lifetime.inbox;
    expect(back.find((e) => e.id === 'welcome')!.answeredReply).toBe(2);
    expect(back.find((e) => e.id === 'class-action')!.deleted).toBe(true);
    const plain = back.find((e) => e.id === 'first-business')!;
    expect(plain.answeredReply).toBeUndefined();
    expect(plain.deleted).toBeUndefined();
  });
});

describe('flagDoppelgaengerSeen — ADR-023 additive-optional round-trip', () => {
  it('round-trips when set; omitted from the wire (and absent ≡ false) otherwise', () => {
    const fresh = createInitialState('seed', 0);
    expect('flagDoppelgaengerSeen' in serializeGameState(fresh)).toBe(false);
    expect(deserializeGameState(serializeGameState(fresh)).flagDoppelgaengerSeen).toBeUndefined();

    const seen: GameState = { ...fresh, flagDoppelgaengerSeen: true };
    const wire = serializeGameState(seen);
    expect(wire.flagDoppelgaengerSeen).toBe(true);
    expect(deserializeGameState(wire).flagDoppelgaengerSeen).toBe(true);
  });
});

describe('Mercatus depths — ADR-023 additive-optional (a/b/c round-trip)', () => {
  it('(a) a save without mercatusDepths loads with every depth defaulting to 0', () => {
    const fresh = createInitialState('seed', 0);
    const serialized = serializeGameState(fresh);
    // Strip the optional fields entirely — simulates an older minimal save.
    const { mercatusDepths, generationPool, suicidePool, murderPool, ...rest } =
      serialized.lifetime;
    void mercatusDepths;
    void generationPool;
    void suicidePool;
    void murderPool;
    const oldShape = { ...serialized, lifetime: rest };
    const parsed = serializedGameStateSchema.safeParse(oldShape);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const back = deserializeGameState(parsed.data);
    expect(back.lifetime.mercatusDepths).toEqual({});
    expect(back.lifetime.reprobates).toBe(0);
  });

  it('(b) a fresh save omits empty mercatusDepths from the wire', () => {
    const serialized = serializeGameState(createInitialState('seed', 0));
    expect('mercatusDepths' in serialized.lifetime).toBe(false);
    expect('maleficiaPrices' in serialized.lifetime).toBe(false);
    expect('handOfGloryRemaining' in serialized.lifetime).toBe(false);
    expect('defixio' in serialized.lifetime).toBe(false);
  });

  it('rolled maleficiaPrices round-trip through the wire; absent → empty default', () => {
    const fresh = createInitialState('seed', 0);
    const withPrices: GameState = {
      ...fresh,
      lifetime: { ...fresh.lifetime, maleficiaPrices: { obsidian_mirror: 14210, black_robe: 640 } },
    };
    const back = deserializeGameState(serializeGameState(withPrices));
    expect(back.lifetime.maleficiaPrices).toEqual({ obsidian_mirror: 14210, black_robe: 640 });
    // A save that predates rolled pricing deserializes to an empty map.
    const wire = serializeGameState(fresh);
    expect(back.lifetime).toBeDefined();
    expect(deserializeGameState(wire).lifetime.maleficiaPrices).toEqual({});
  });

  it('(c) populated mercatusDepths round-trip exactly; junk keys are dropped on load', () => {
    const fresh = createInitialState('seed', 0);
    const withVitium: GameState = {
      ...fresh,
      lifetime: {
        ...fresh.lifetime,
        mercatusDepths: { gula: 12, superbia: 3 },
        handOfGloryRemaining: 1234,
        defixio: { elapsed: 42 },
      },
    };
    const wire = serializeGameState(withVitium);
    const back = deserializeGameState(wire);
    expect(back.lifetime.mercatusDepths).toEqual({ gula: 12, superbia: 3 });
    expect(back.lifetime.handOfGloryRemaining).toBe(1234);
    expect(back.lifetime.defixio).toEqual({ elapsed: 42 });
    // A hand-edited blob can't smuggle non-Sin keys into the runtime record.
    const tampered = {
      ...wire,
      lifetime: { ...wire.lifetime, mercatusDepths: { gula: 2, acme: 9 } },
    };
    const parsed = serializedGameStateSchema.safeParse(tampered);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(deserializeGameState(parsed.data).lifetime.mercatusDepths).toEqual({ gula: 2 });
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

describe('invocationDurations — ADR-023 additive-optional', () => {
  it('a save predating apex durations loads with an empty map', () => {
    const fresh = createInitialState('seed', 0);
    const serialized = serializeGameState(fresh);
    const { invocationDurations, ...rest } = serialized.lifetime;
    void invocationDurations;
    const parsed = serializedGameStateSchema.safeParse({ ...serialized, lifetime: rest });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const back = deserializeGameState(parsed.data);
    expect(back.lifetime.invocationDurations).toEqual({});
  });

  it('a fresh save omits invocationDurations from the wire', () => {
    const serialized = serializeGameState(createInitialState('seed', 0));
    expect('invocationDurations' in serialized.lifetime).toBe(false);
  });

  it('an active Aurevora round-trips its duration counter exactly', () => {
    const fresh = createInitialState('seed', 0);
    const live: GameState = {
      ...fresh,
      lifetime: {
        ...fresh.lifetime,
        invocations: { aurevora: 1 },
        invocationDurations: { aurevora: 12.5 },
      },
    };
    const wire = serializeGameState(live);
    expect(wire.lifetime.invocationDurations).toEqual({ aurevora: 12.5 });
    const back = deserializeGameState(wire);
    expect(back.lifetime.invocationDurations.aurevora).toBe(12.5);
  });
});

describe('apex Katabasis-modifier flags + Erinyes stacks — ADR-023 additive-optional', () => {
  it('a save predating the apex Katabasis modifiers loads with falsy/zero defaults', () => {
    const fresh = createInitialState('seed', 0);
    const serialized = serializeGameState(fresh);
    // No fields set on a fresh save — omitted from the wire.
    expect('pendingErinyes' in serialized.lifetime).toBe(false);
    expect('pendingMorpheus' in serialized.lifetime).toBe(false);
    expect('morpheusLockedOut' in serialized.lifetime).toBe(false);
    expect('erinyesEfficiencyStacks' in serialized).toBe(false);
    // And the deserializer defaults them when absent.
    const back = deserializeGameState(serialized);
    expect(back.lifetime.pendingErinyes ?? false).toBe(false);
    expect(back.lifetime.pendingMorpheus ?? false).toBe(false);
    expect(back.lifetime.morpheusLockedOut ?? false).toBe(false);
    expect(back.erinyesEfficiencyStacks ?? 0).toBe(0);
  });

  it('a mid-flight Erinyes (kill-all + lockout, pending commit) round-trips its flags', () => {
    const fresh = createInitialState('seed', 0);
    const live: GameState = {
      ...fresh,
      erinyesEfficiencyStacks: 2,
      lifetime: {
        ...fresh.lifetime,
        invocations: { erinyes: 1 },
        pendingErinyes: true,
        morpheusLockedOut: true,
      },
    };
    const wire = serializeGameState(live);
    expect(wire.lifetime.pendingErinyes).toBe(true);
    expect(wire.lifetime.morpheusLockedOut).toBe(true);
    expect(wire.erinyesEfficiencyStacks).toBe(2);
    const back = deserializeGameState(wire);
    expect(back.lifetime.pendingErinyes).toBe(true);
    expect(back.lifetime.morpheusLockedOut).toBe(true);
    expect(back.erinyesEfficiencyStacks).toBe(2);
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

describe('inbox — ADR-023 additive-optional impact-feedback mail (5.2)', () => {
  it('omits the inbox from the wire when empty', () => {
    const serialized = serializeGameState(createInitialState('seed', 5_000));
    expect('inbox' in serialized.lifetime).toBe(false);
  });

  it('round-trips delivered emails with their read state', () => {
    const fresh = createInitialState('seed', 5_000);
    const withMail: GameState = {
      ...fresh,
      lifetime: {
        ...fresh.lifetime,
        inbox: [
          { id: 'welcome', receivedAt: 1000, readAt: 2000 },
          { id: 'class-action', receivedAt: 3000, readAt: null },
        ],
      },
    };
    const back = deserializeGameState(serializeGameState(withMail));
    expect(back.lifetime.inbox).toHaveLength(2);
    expect(back.lifetime.inbox[0]!.id).toBe('welcome');
    expect(back.lifetime.inbox[0]!.readAt).toBe(2000);
    expect(back.lifetime.inbox[1]!.readAt).toBeNull();
  });

  it('loads an old save without the inbox as an empty inbox', () => {
    const back = deserializeGameState(serializeGameState(createInitialState('seed', 5_000)));
    expect(back.lifetime.inbox).toEqual([]);
  });
});
