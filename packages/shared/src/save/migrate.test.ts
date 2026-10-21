import { describe, it, expect } from 'vitest';
import { createInitialState } from '@panvitium/sim';
import { serializeGameState } from './state-schema.js';
import { CURRENT_SCHEMA_VERSION, newDeviceId, type SaveBlob } from './schema.js';
import { migrateSave, SaveMigrationError, type SaveMigration } from './migrate.js';
import { migrateV3ToV4 } from './migrations/v3-to-v4.js';
import { migrateV13ToV14 } from './migrations/v13-to-v14.js';
import { migrateV14ToV15 } from './migrations/v14-to-v15.js';

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

  it('sums the per-subtype counts, drops conversionPool, retires the old defixio curse', () => {
    const migrated = migrateSave(v1Blob()); // chains v1 → v2 → … → v8
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.lifetime.reprobates).toBe(200); // 100+40+10+5+5+20+0+15+5
    expect('conversionPool' in migrated.state.lifetime).toBe(false);
    // v1→v2 stripped the subtype target off the old cull curse; v7→v8 then retired the curse
    // entirely (Defixio is now a single-use suicide buff), so no defixio survives the full chain.
    expect('defixio' in migrated.state.lifetime).toBe(false);
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
    expect('defixio' in migrated.state.lifetime).toBe(false);
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
    // The v3 → v4 step alone (the full chain then retires the rites at v10 → v11, below).
    const stepped = migrateV3ToV4.migrate(v3Blob());
    expect(stepped.schemaVersion).toBe(4);
    const lifetime = (stepped.state as { lifetime: Record<string, unknown> }).lifetime;
    expect(lifetime.autoRepeat).toEqual(['caedes', 'pogrom']);
    expect((lifetime.actionQueue as { actionId: string }[]).map((t) => t.actionId)).toEqual([
      'caedes',
      'indagatio',
    ]);
    expect(
      (lifetime.acolytes as { assignedAction: string | null }[]).map((a) => a.assignedAction),
    ).toEqual(['caedes', null, 'pogrom']);
  });

  it('carried through the whole chain, the retired rites end up stripped (v10 → v11)', () => {
    const migrated = migrateSave(v3Blob());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.lifetime.autoRepeat).toEqual([]);
    expect(migrated.state.lifetime.actionQueue.map((t) => t.actionId)).toEqual(['indagatio']);
    expect(migrated.state.lifetime.acolytes.map((a) => a.assignedAction)).toEqual([
      null,
      null,
      null,
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

describe('v4 → v5 migration (Mercatus → the Faeneratio loop)', () => {
  /** A v4-shaped raw blob: per-Sin Mercatus depths, gold as a wire string. */
  function v4Blob(): Record<string, unknown> {
    const base = currentBlob();
    const lifetime = base.state.lifetime as Record<string, unknown>;
    return {
      ...base,
      schemaVersion: 4,
      state: {
        ...base.state,
        lifetime: {
          ...lifetime,
          gold: '100',
          mercatusDepths: { gula: 4, avaritia: 3, superbia: 2 },
        },
      },
    };
  }

  it('credits each trade’s divest value on the frozen curve and drops the field', () => {
    const migrated = migrateSave(v4Blob());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // Per the frozen table (C0 50, r 1.6; Avaritiae ratio 1.6 × 0.995; Superbiae ×1.25):
    //   gula d4:     floor(0.25 × 50·(1.6⁴−1)/0.6)               = floor(115.70)  = 115
    //   avaritia d3: floor(0.25 × 50·(1.592³−1)/0.592)           = floor(64.08)   = 64
    //   superbia d2: floor(0.25 × 50·(1.6²−1)/0.6 × 1.25)        = floor(40.625)  = 40
    // 115 + 64 + 40 = 219, on top of the 100 held.
    expect(migrated.state.lifetime.gold).toBe('319');
    expect('mercatusDepths' in migrated.state.lifetime).toBe(false);
    // The new system seeds by omission: no hoard, no contracts on the migrated wire.
    expect('hoard' in migrated.state.lifetime).toBe(false);
    expect('syngraphae' in migrated.state.lifetime).toBe(false);
  });

  it('is a no-op gold-wise with no depths, and tolerates junk entries (credit 0)', () => {
    const blob = v4Blob();
    const lifetime = (blob.state as Record<string, unknown>).lifetime as Record<string, unknown>;
    lifetime.mercatusDepths = { acme: 9, gula: 'lots', ira: -4, luxuria: 0 };
    const migrated = migrateSave(blob);
    expect(migrated.state.lifetime.gold).toBe('100'); // unknown sin / NaN / non-positive credit 0
    expect('mercatusDepths' in migrated.state.lifetime).toBe(false);
  });

  it('leaves a v4 save without the field untouched apart from the version stamp', () => {
    const blob = v4Blob();
    const lifetime = (blob.state as Record<string, unknown>).lifetime as Record<string, unknown>;
    delete lifetime.mercatusDepths;
    const migrated = migrateSave(blob);
    expect(migrated.state.lifetime.gold).toBe('100');
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe('v5 → v6 migration (invocation roster rework)', () => {
  /** A v5-shaped raw blob with active invocations + the old world-still pending flag + lockout. */
  function v5Blob(): Record<string, unknown> {
    const base = currentBlob();
    const lifetime = base.state.lifetime as Record<string, unknown>;
    return {
      ...base,
      schemaVersion: 5,
      state: {
        ...base.state,
        lifetime: {
          ...lifetime,
          invocations: { midas: 1, imp: 2 },
          invocationRunners: { imp: 1.5 },
          invocationDurations: { aurevora: 3 },
          pendingMorpheus: true,
          morpheusLockedOut: true,
        },
      },
    };
  }

  it('clears active invocations + timers and maps the world-still pending flag to Astiwihad', () => {
    const migrated = migrateSave(v5Blob());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.lifetime.invocations).toEqual({});
    expect('invocationRunners' in migrated.state.lifetime).toBe(false);
    expect('invocationDurations' in migrated.state.lifetime).toBe(false);
    expect('pendingMorpheus' in migrated.state.lifetime).toBe(false);
    expect('morpheusLockedOut' in migrated.state.lifetime).toBe(false);
    expect(migrated.state.lifetime.pendingAstiwihad).toBe(true);
    expect(migrated.state.lifetime.apexInvoked).toBe('astiwihad');
  });

  it('seeds apexInvoked from a pending Erinyes when no Morpheus flag was set', () => {
    const blob = v5Blob();
    const lifetime = (blob.state as Record<string, unknown>).lifetime as Record<string, unknown>;
    delete lifetime.pendingMorpheus;
    delete lifetime.morpheusLockedOut;
    lifetime.pendingErinyes = true;
    const migrated = migrateSave(blob);
    expect(migrated.state.lifetime.apexInvoked).toBe('erinyes');
    expect(migrated.state.lifetime.pendingErinyes).toBe(true);
    expect(migrated.state.lifetime.pendingAstiwihad ?? false).toBe(false);
  });
});

describe('v6 → v7 migration (Stagnation resource renamed to Desidia)', () => {
  /** A v6-shaped raw blob carrying the old top-level `stagnation` field. */
  function v6Blob(): Record<string, unknown> {
    const base = currentBlob();
    return {
      ...base,
      schemaVersion: 6,
      state: { ...(base.state as Record<string, unknown>), stagnation: 42.5, desidiaActive: true },
    };
  }

  it('renames state.stagnation to state.desidia, preserving the value and the toggle flag', () => {
    const migrated = migrateSave(v6Blob());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.desidia).toBe(42.5);
    expect('stagnation' in migrated.state).toBe(false);
    expect(migrated.state.desidiaActive).toBe(true);
  });

  it('is a no-op for a v6 save that never banked any torpor (neither field on the wire)', () => {
    const blob = v6Blob();
    const state = blob.state as Record<string, unknown>;
    delete state.stagnation;
    delete state.desidiaActive;
    const migrated = migrateSave(blob);
    expect(migrated.state.desidia).toBeUndefined(); // absent on the wire; defaults to 0 at load
    expect('stagnation' in migrated.state).toBe(false);
  });
});

describe('v7 → v8 migration (maleficia rework)', () => {
  /** A v7-shaped raw blob: a live Hand of Glory timer, an old Defixio curse, and owned Iron Nails. */
  function v7Blob(): Record<string, unknown> {
    const base = currentBlob();
    const state = base.state as Record<string, unknown>;
    const lifetime = state.lifetime as Record<string, unknown>;
    return {
      ...base,
      schemaVersion: 7,
      state: {
        ...state,
        lifetime: {
          ...lifetime,
          handOfGloryRemaining: 900,
          defixio: { elapsed: 5 },
          maleficia: ['iron_nails', 'black_robe', 'iron_nails'],
          emptioList: ['iron_nails', 'ars_serpens'],
          maleficiaPrices: { iron_nails: 300, ars_serpens: 2000 },
        },
      },
    };
  }

  it('carries the Hand of Glory timer into maleficiaBuffs, retires Defixio, strips Iron Nails', () => {
    const migrated = migrateSave(v7Blob());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.lifetime.maleficiaBuffs).toEqual({ hand_of_glory: 900 });
    expect('handOfGloryRemaining' in migrated.state.lifetime).toBe(false);
    expect('defixio' in migrated.state.lifetime).toBe(false);
    expect(migrated.state.lifetime.maleficia).toEqual(['red_robe']);
    expect(migrated.state.lifetime.emptioList).toEqual(['ars_serpens']);
    expect(migrated.state.lifetime.maleficiaPrices).toEqual({ ars_serpens: 2000 });
  });

  it('is a no-op for a v7 save with no Hand of Glory buff, no curse, and no Iron Nails', () => {
    const blob = v7Blob();
    const lifetime = (blob.state as Record<string, unknown>).lifetime as Record<string, unknown>;
    delete lifetime.handOfGloryRemaining;
    delete lifetime.defixio;
    lifetime.maleficia = ['black_robe'];
    lifetime.emptioList = ['ars_serpens'];
    lifetime.maleficiaPrices = { ars_serpens: 2000 };
    const migrated = migrateSave(blob);
    expect(migrated.state.lifetime.maleficiaBuffs).toBeUndefined(); // absent on the wire → {} at load
    expect(migrated.state.lifetime.maleficia).toEqual(['red_robe']);
  });
});

describe('v8 → v9 migration (the retired invocation-runner channel)', () => {
  /** A v8-shaped raw blob still carrying a stale runner-timer map. */
  function v8Blob(runners?: Record<string, number>): Record<string, unknown> {
    const base = currentBlob();
    const state = base.state as Record<string, unknown>;
    const lifetime = state.lifetime as Record<string, unknown>;
    return {
      ...base,
      schemaVersion: 8,
      state: {
        ...state,
        lifetime: runners ? { ...lifetime, invocationRunners: runners } : lifetime,
      },
    };
  }

  it('drops a lingering invocationRunners map and stamps the current version', () => {
    const migrated = migrateSave(v8Blob({ familiar: 3120.5, 'imp#1': 2 }));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect('invocationRunners' in migrated.state.lifetime).toBe(false);
  });

  it('is a no-op for a v8 save without runner timers', () => {
    const blob = v8Blob();
    const migrated = migrateSave(blob);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const lifetime = (blob.state as Record<string, unknown>).lifetime;
    expect(migrated.state.lifetime).toEqual(lifetime);
  });
});

describe('v9 → v10 migration (the Depraedatio relationship-tier rework)', () => {
  /** A v9-shaped raw blob with the given lifetime overrides. */
  function v9Blob(extra: Record<string, unknown>): Record<string, unknown> {
    const base = currentBlob();
    const state = base.state as Record<string, unknown>;
    const lifetime = state.lifetime as Record<string, unknown>;
    return { ...base, schemaVersion: 9, state: { ...state, lifetime: { ...lifetime, ...extra } } };
  }

  it('strips the retired contract ids and refunds their burned signing fees to gold', () => {
    const migrated = migrateSave(
      v9Blob({ gold: '1000', syngraphae: ['usura-1', 'usura-2', 'custodia-1', 'faeneratio-4'] }),
    );
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect('syngraphae' in migrated.state.lifetime).toBe(false);
    // 1000 + 500 + 5,000 + 500 + 500,000
    expect(migrated.state.lifetime.gold).toBe('507000');
  });

  it('drops the Peculium base stamped mid-descent', () => {
    const migrated = migrateSave(v9Blob({ hoardAtDescent: '7.25e12' }));
    expect('hoardAtDescent' in migrated.state.lifetime).toBe(false);
  });

  it('keeps the reserve and is a no-op for a v9 save without contracts', () => {
    const blob = v9Blob({ hoard: '12345' });
    const migrated = migrateSave(blob);
    expect(migrated.state.lifetime).toEqual((blob.state as Record<string, unknown>).lifetime);
  });
});

describe('v10 → v11 migration (the Decimatio category retired, ADR-038)', () => {
  /** A v10-shaped raw blob with the given lifetime overrides. */
  function v10Blob(extra: Record<string, unknown>): Record<string, unknown> {
    const base = currentBlob();
    const state = base.state as Record<string, unknown>;
    const lifetime = state.lifetime as Record<string, unknown>;
    return { ...base, schemaVersion: 10, state: { ...state, lifetime: { ...lifetime, ...extra } } };
  }

  it('drops the retired rites from the auto-repeat list, keeping any other id', () => {
    const migrated = migrateSave(v10Blob({ autoRepeat: ['pogrom', 'suggestion', 'caedes'] }));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.lifetime.autoRepeat).toEqual(['suggestion']);
  });

  it('drops in-flight retired timers and credits back each one’s base gold price', () => {
    const migrated = migrateSave(
      v10Blob({
        gold: '1000',
        actionQueue: [
          { actionId: 'purgatio', remainingSeconds: 200 },
          { actionId: 'indagatio', remainingSeconds: 90 },
          { actionId: 'caedes', remainingSeconds: 0.5 },
          { actionId: 'pogrom', remainingSeconds: 30 },
        ],
      }),
    );
    expect(migrated.state.lifetime.actionQueue).toEqual([
      { actionId: 'indagatio', remainingSeconds: 90 },
    ]);
    // 1000 + 100,000 (Purgatio) + 10 (Caedes) + 100 (Pogrom)
    expect(migrated.state.lifetime.gold).toBe('101110');
  });

  it('returns an acolyte on a retired rite to idle and leaves the others working', () => {
    const migrated = migrateSave(
      v10Blob({
        acolytes: [
          { id: 1, assignedAction: 'caedes', remainingSeconds: 0.4 },
          { id: 2, assignedAction: 'suggestion', remainingSeconds: 0.7 },
          { id: 3, assignedAction: 'purgatio', remainingSeconds: 120 },
          { id: 4, assignedAction: null },
        ],
      }),
    );
    expect(migrated.state.lifetime.acolytes).toEqual([
      { id: 1, assignedAction: null },
      { id: 2, assignedAction: 'suggestion', remainingSeconds: 0.7 },
      { id: 3, assignedAction: null },
      { id: 4, assignedAction: null },
    ]);
  });

  it('is a no-op for a v10 save that never worked a Decimatio rite', () => {
    const blob = v10Blob({
      gold: '500',
      autoRepeat: ['suggestion'],
      actionQueue: [{ actionId: 'suggestion', remainingSeconds: 1 }],
      acolytes: [{ id: 1, assignedAction: 'indagatio', remainingSeconds: 40 }],
    });
    const migrated = migrateSave(blob);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.lifetime).toEqual((blob.state as Record<string, unknown>).lifetime);
  });
});

describe('v11 → v12 migration (the Black Robe renamed the Red Robe)', () => {
  /** A v11-shaped raw blob with the given lifetime overrides. */
  function v11Blob(extra: Record<string, unknown>): Record<string, unknown> {
    const base = currentBlob();
    const state = base.state as Record<string, unknown>;
    const lifetime = state.lifetime as Record<string, unknown>;
    return { ...base, schemaVersion: 11, state: { ...state, lifetime: { ...lifetime, ...extra } } };
  }

  it('rewrites black_robe to red_robe everywhere a save can carry it', () => {
    const migrated = migrateSave(
      v11Blob({
        maleficia: ['sulfur_censer', 'black_robe'],
        emptioList: ['black_robe', 'ars_serpens'],
        maleficiaPrices: { obsidian_mirror: 14210, black_robe: 640, ars_serpens: 2000 },
        actionQueue: [
          { actionId: 'emptio', remainingSeconds: 30, target: 'black_robe', paidGold: 640 },
          { actionId: 'indagatio', remainingSeconds: 90 },
        ],
        safeItem: 'black_robe',
      }),
    );
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const lifetime = migrated.state.lifetime;
    expect(lifetime.maleficia).toEqual(['sulfur_censer', 'red_robe']);
    expect(lifetime.emptioList).toEqual(['red_robe', 'ars_serpens']);
    expect(lifetime.maleficiaPrices).toEqual({
      obsidian_mirror: 14210,
      red_robe: 640,
      ars_serpens: 2000,
    });
    expect(lifetime.actionQueue).toEqual([
      { actionId: 'emptio', remainingSeconds: 30, target: 'red_robe', paidGold: 640 },
      { actionId: 'indagatio', remainingSeconds: 90 },
    ]);
    expect(lifetime.safeItem).toBe('red_robe');
  });

  it('is a no-op for a v11 save that never held the robe', () => {
    const blob = v11Blob({
      maleficia: ['sulfur_censer'],
      emptioList: ['ars_serpens'],
      maleficiaPrices: { ars_serpens: 2000 },
      actionQueue: [{ actionId: 'emptio', remainingSeconds: 30, target: 'ars_serpens' }],
      safeItem: 'sulfur_censer',
    });
    const migrated = migrateSave(blob);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.lifetime).toEqual((blob.state as Record<string, unknown>).lifetime);
  });
});

describe('v12 → v13 migration (the Indagatio investment becomes a default percentage)', () => {
  /** A v12-shaped raw blob with the given lifetime overrides. */
  function v12Blob(extra: Record<string, unknown>): Record<string, unknown> {
    const base = currentBlob();
    const state = base.state as Record<string, unknown>;
    const lifetime = state.lifetime as Record<string, unknown>;
    return { ...base, schemaVersion: 12, state: { ...state, lifetime: { ...lifetime, ...extra } } };
  }

  it('drops the gold stake and refunds it into liquid gold', () => {
    const migrated = migrateSave(v12Blob({ gold: '1000', indagatioInvestment: '250' }));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const lifetime = migrated.state.lifetime;
    expect('indagatioInvestment' in lifetime).toBe(false);
    expect(lifetime.gold).toBe('1250');
    // The new percentage seeds by omission: the player chooses a share afresh.
    expect(lifetime.indagatioInvestPercent).toBeUndefined();
  });

  it('refunds a stake beyond the safe-integer range exactly (BigNum gold)', () => {
    const migrated = migrateSave(v12Blob({ gold: '1e30', indagatioInvestment: '1e30' }));
    expect(migrated.state.lifetime.gold).toBe('2e+30');
  });

  it('drops a malformed stake without crediting anything', () => {
    const migrated = migrateSave(v12Blob({ gold: '1000', indagatioInvestment: 42 }));
    expect('indagatioInvestment' in migrated.state.lifetime).toBe(false);
    expect(migrated.state.lifetime.gold).toBe('1000');
  });

  it('is a no-op for a v12 save that held no stake', () => {
    const blob = v12Blob({ gold: '1000' });
    const migrated = migrateSave(blob);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.lifetime).toEqual((blob.state as Record<string, unknown>).lifetime);
  });
});

describe('v13 → v14 migration (the first-descent cinematic)', () => {
  /** A v13-shaped raw blob with the given top-level state overrides. */
  function v13Blob(extra: Record<string, unknown>): Record<string, unknown> {
    const base = currentBlob();
    const state = base.state as Record<string, unknown>;
    return { ...base, schemaVersion: 13, state: { ...state, ...extra } };
  }

  it('marks the cinematic seen for a save that had already descended', () => {
    const migrated = migrateSave(v13Blob({ katabasisCount: 3 }));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.firstDescentSeen).toBe(true);
    expect(migrated.state.katabasisCount).toBe(3);
  });

  it('leaves the flag absent for a save that has not yet descended', () => {
    const blob = v13Blob({});
    expect('katabasisCount' in (blob.state as Record<string, unknown>)).toBe(false);
    const migrated = migrateSave(blob);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect('firstDescentSeen' in migrated.state).toBe(false);
    expect(migrated.state).toEqual(blob.state);
  });

  it('treats a zero or malformed count as no descent', () => {
    for (const katabasisCount of [0, -1, '2', null]) {
      const migrated = migrateV13ToV14.migrate(v13Blob({ katabasisCount }));
      expect(migrated.schemaVersion).toBe(14);
      expect('firstDescentSeen' in (migrated.state as Record<string, unknown>)).toBe(false);
    }
  });
});

describe('v14 → v15 migration (Panvitium retired, ADR-039)', () => {
  /** A v14-shaped raw blob: lifetime and top-level state overrides on a current save. */
  function v14Blob(
    lifetimeExtra: Record<string, unknown>,
    stateExtra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const base = currentBlob();
    const state = base.state as Record<string, unknown>;
    const lifetime = state.lifetime as Record<string, unknown>;
    return {
      ...base,
      schemaVersion: 14,
      state: { ...state, ...stateExtra, lifetime: { ...lifetime, ...lifetimeExtra } },
    };
  }

  it('drops a burning Panvitium and its duration counter', () => {
    const migrated = migrateSave(
      v14Blob({ activeToggles: ['panvitium'], toggleDurations: { panvitium: 42.5 } }),
    );
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect('activeToggles' in migrated.state.lifetime).toBe(false);
    expect('toggleDurations' in migrated.state.lifetime).toBe(false);
  });

  it('drops the empty toggle list every v14 save carried, and nothing else', () => {
    const blob = v14Blob({ activeToggles: [] });
    const migrated = migrateSave(blob);
    const { activeToggles: _drop, ...rest } = (blob.state as Record<string, unknown>)
      .lifetime as Record<string, unknown>;
    expect(migrated.state.lifetime).toEqual(rest);
  });

  it('strips the retired The Long Burn achievement and keeps the rest in order', () => {
    const migrated = migrateSave(
      v14Blob(
        { activeToggles: [] },
        { achievements: ['first_stain', 'the_long_burn', 'eight_at_the_table'] },
      ),
    );
    expect(migrated.state.achievements).toEqual(['first_stain', 'eight_at_the_table']);
  });

  it('is defensive about a blob with no state', () => {
    const migrated = migrateV14ToV15.migrate({ schemaVersion: 14 });
    expect(migrated).toEqual({ schemaVersion: 15 });
  });
});
