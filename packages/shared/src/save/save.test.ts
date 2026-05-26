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
