import { describe, it, expect } from 'vitest';
import { createInitialState } from '@panvitium/sim';
import { serializeGameState } from './state-schema.js';
import { CURRENT_SCHEMA_VERSION, newDeviceId, type SaveBlob } from './schema.js';
import { migrateSave, SaveMigrationError, type SaveMigration } from './migrate.js';

function currentBlob(): SaveBlob {
  const state = createInitialState('seed', 1000);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saveVersion: 0,
    lastTickAt: state.lastTickAt,
    deviceId: newDeviceId(),
    state: serializeGameState(state),
  };
}

describe('migrateSave', () => {
  it('passes a current-version blob straight through', () => {
    const blob = currentBlob();
    expect(migrateSave(blob)).toEqual(blob);
  });

  it('throws on a blob with no numeric version', () => {
    expect(() => migrateSave({ foo: 'bar' })).toThrow(SaveMigrationError);
  });

  it('throws on a version newer than supported', () => {
    const future = { ...currentBlob(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => migrateSave(future)).toThrow(/newer than supported/);
  });

  it('throws when a version gap has no registered migration', () => {
    const older = { ...currentBlob(), schemaVersion: CURRENT_SCHEMA_VERSION - 1 };
    expect(() => migrateSave(older, [])).toThrow(/No migration registered/);
  });

  it('applies a registered migration to upgrade an older blob', () => {
    // Simulate a v0 -> v1 upgrade: the only difference is the version stamp.
    const upgrade: SaveMigration = {
      from: CURRENT_SCHEMA_VERSION - 1,
      to: CURRENT_SCHEMA_VERSION,
      migrate: (blob) => ({ ...blob, schemaVersion: CURRENT_SCHEMA_VERSION }),
    };
    const older = { ...currentBlob(), schemaVersion: CURRENT_SCHEMA_VERSION - 1 };
    const result = migrateSave(older, [upgrade]);
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});
