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
