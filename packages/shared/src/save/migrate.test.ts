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

describe('v1 → v2 migration (reprobate-subtype / conversion removal)', () => {
  /** A v1-shaped raw blob: per-subtype reprobates record, conversionPool, defixio.target. */
  function v1Blob(): Record<string, unknown> {
    const base = currentBlob();
    const lifetime = base.state.lifetime as Record<string, unknown>;
    return {
      ...base,
      schemaVersion: 1,
      state: {
        ...base.state,
        lifetime: {
          ...lifetime,
          reprobates: {
            reprobate: 100,
            glutton: 40,
            degenerate: 10,
            gambler: 5,
            nihilist: 5,
            choleric: 20,
            husk: 0,
            celebrity: 15,
            sigma: 5,
          },
          conversionPool: 0.7,
          defixio: { target: 'choleric', elapsed: 42 },
        },
      },
    };
  }

  it('sums the per-subtype counts, drops conversionPool, strips the defixio target', () => {
    const migrated = migrateSave(v1Blob()); // chains v1 → v2 → v3 → v4
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.lifetime.reprobates).toBe(200); // 100+40+10+5+5+20+0+15+5
    expect('conversionPool' in migrated.state.lifetime).toBe(false);
    expect(migrated.state.lifetime.defixio).toEqual({ elapsed: 42 });
  });

  it('handles a v1 save with no defixio and an empty reprobate record', () => {
    const blob = v1Blob();
    const lifetime = (blob.state as Record<string, unknown>).lifetime as Record<string, unknown>;
    lifetime.reprobates = {
      reprobate: 0,
      glutton: 0,
      degenerate: 0,
      gambler: 0,
      nihilist: 0,
      choleric: 0,
      husk: 0,
      celebrity: 0,
      sigma: 0,
    };
    delete lifetime.defixio;
    delete lifetime.conversionPool;
    const migrated = migrateSave(blob);
    expect(migrated.state.lifetime.reprobates).toBe(0);
    expect(migrated.state.lifetime.defixio).toBeUndefined();
  });
});

describe('v2 → v3 migration (legacy business system → Mercatus)', () => {
  /** A v2-shaped raw blob: owned businesses + an in-flight build queue, gold as a wire string. */
  function v2Blob(): Record<string, unknown> {
    const base = currentBlob();
    const lifetime = base.state.lifetime as Record<string, unknown>;
    return {
      ...base,
      schemaVersion: 2,
      state: {
        ...base.state,
        lifetime: {
          ...lifetime,
          gold: '100',
          businesses: { 'gula-mercatura-1': 2, 'avaritia-mercatura-2': 1 },
          buildQueue: [{ businessId: 'ira-mercatura-1', remainingSeconds: 30 }],
        },
      },
    };
  }

  it('credits 25% of each owned build cost, fizzles the queue, drops both fields', () => {
    const migrated = migrateSave(v2Blob());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // floor(500 × 0.25) × 2 + floor(25000 × 0.25) × 1 = 250 + 6250 = 6500, on top of 100 held.
    expect(migrated.state.lifetime.gold).toBe('6600');
    expect('businesses' in migrated.state.lifetime).toBe(false);
    expect('buildQueue' in migrated.state.lifetime).toBe(false);
    // The new system starts from scratch: depths are seeded by omission.
    expect('mercatusDepths' in migrated.state.lifetime).toBe(false);
  });

  it('is a no-op gold-wise for a v2 save with no businesses, and tolerates junk entries', () => {
    const blob = v2Blob();
    const lifetime = (blob.state as Record<string, unknown>).lifetime as Record<string, unknown>;
    lifetime.businesses = { acme: 3, 'gula-mercatura-1': 'lots', 'ira-mercatura-2': -4 };
    delete lifetime.buildQueue;
    const migrated = migrateSave(blob);
    expect(migrated.state.lifetime.gold).toBe('100'); // unknown id / NaN / negative all credit 0
    expect('businesses' in migrated.state.lifetime).toBe(false);
  });
});

describe('v3 → v4 migration (Decimatio rite caedis → caedes rename)', () => {
  /** A v3-shaped raw blob carrying the old `caedis` id in every persisted action reference. */
  function v3Blob(): Record<string, unknown> {
    const base = currentBlob();
    const lifetime = base.state.lifetime as Record<string, unknown>;
    return {
      ...base,
      schemaVersion: 3,
      state: {
        ...base.state,
        lifetime: {
          ...lifetime,
          autoRepeat: ['caedis', 'pogrom'],
          actionQueue: [
            { actionId: 'caedis', remainingSeconds: 4 },
            { actionId: 'indagatio', remainingSeconds: 12 },
          ],
          acolytes: [
            { id: 1, assignedAction: 'caedis' },
            { id: 2, assignedAction: null },
            { id: 3, assignedAction: 'pogrom' },
          ],
        },
      },
    };
  }

  it('rewrites caedis → caedes in autoRepeat, the action queue, and acolyte delegations', () => {
    const migrated = migrateSave(v3Blob());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.lifetime.autoRepeat).toEqual(['caedes', 'pogrom']);
    expect(migrated.state.lifetime.actionQueue.map((t) => t.actionId)).toEqual([
      'caedes',
      'indagatio',
    ]);
    expect(migrated.state.lifetime.acolytes.map((a) => a.assignedAction)).toEqual([
      'caedes',
      null,
      'pogrom',
    ]);
  });

  it('is a no-op for a v3 save that never worked the rite', () => {
    const blob = v3Blob();
    const lifetime = (blob.state as Record<string, unknown>).lifetime as Record<string, unknown>;
    lifetime.autoRepeat = [];
    lifetime.actionQueue = [];
    lifetime.acolytes = [];
    const migrated = migrateSave(blob);
    expect(migrated.state.lifetime.autoRepeat).toEqual([]);
    expect(migrated.state.lifetime.actionQueue).toEqual([]);
    expect(migrated.state.lifetime.acolytes).toEqual([]);
  });
});
