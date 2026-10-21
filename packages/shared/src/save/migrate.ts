/**
 * Save migration (ADR-006): the version field on every save drives forward migration on load
 * and rejection of versions newer than this client understands. Migrations are applied in
 * sequence from the blob's version up to {@link CURRENT_SCHEMA_VERSION}.
 */
import { z } from 'zod';
import { saveBlobSchema, CURRENT_SCHEMA_VERSION, type SaveBlob } from './schema.js';
import { migrateV1ToV2 } from './migrations/v1-to-v2.js';
import { migrateV2ToV3 } from './migrations/v2-to-v3.js';
import { migrateV3ToV4 } from './migrations/v3-to-v4.js';
import { migrateV4ToV5 } from './migrations/v4-to-v5.js';
import { migrateV5ToV6 } from './migrations/v5-to-v6.js';
import { migrateV6ToV7 } from './migrations/v6-to-v7.js';
import { migrateV7ToV8 } from './migrations/v7-to-v8.js';
import { migrateV8ToV9 } from './migrations/v8-to-v9.js';
import { migrateV9ToV10 } from './migrations/v9-to-v10.js';
import { migrateV10ToV11 } from './migrations/v10-to-v11.js';
import { migrateV11ToV12 } from './migrations/v11-to-v12.js';
import { migrateV12ToV13 } from './migrations/v12-to-v13.js';
import { migrateV13ToV14 } from './migrations/v13-to-v14.js';
import { migrateV14ToV15 } from './migrations/v14-to-v15.js';

/** A single forward migration that upgrades a blob from one schema version to the next. */
export interface SaveMigration {
  readonly from: number;
  readonly to: number;
  migrate(blob: Record<string, unknown>): Record<string, unknown>;
}

/** Registered migrations, applied in sequence (v1 → v2: reprobate-subtype/conversion removal;
 * v2 → v3: legacy business system → Mercatus — gold credit, build-queue fizzle, field drop;
 * v3 → v4: Decimatio rite id `caedis` → `caedes` rewritten in persisted action references;
 * v4 → v5: Mercatus → the Faeneratio loop — divest-value gold credit, `mercatusDepths` drop;
 * v5 → v6: invocation roster rework — clear active invocations, pendingMorpheus → pendingAstiwihad,
 * drop morpheusLockedOut, seed apexInvoked;
 * v6 → v7: the Stagnation resource renamed to Desidia — state.stagnation → state.desidia;
 * v7 → v8: maleficia rework — Hand of Glory timer → maleficiaBuffs, drop the old Defixio curse,
 * strip the removed Iron Nails id;
 * v8 → v9: the retired invocation-runner channel — drop `invocationRunners`;
 * v9 → v10: the Depraedatio relationship-tier rework — strip the retired contract ids (refunding
 * their signing fees) and drop the Peculium base `hoardAtDescent`;
 * v10 → v11: the Decimatio category retired (ADR-038) — strip `caedes` / `pogrom` / `purgatio` from
 * the auto-repeat list, the action queue (refunding each in-flight rite's base price) and acolyte
 * delegations (back to idle);
 * v11 → v12: the Black Robe maleficium renamed the Red Robe — `black_robe` → `red_robe` in the owned
 * relics, the Emptio listing, the rolled prices, an in-flight Emptio target and the safe;
 * v12 → v13: the Indagatio investment rework — the gold stake `indagatioInvestment` is dropped and
 * refunded into gold, superseded by the default percentage `indagatioInvestPercent`;
 * v13 → v14: the first-descent cinematic — seed `firstDescentSeen` for every save that had already
 * descended, so a veteran never sees it;
 * v14 → v15: Panvitium retired (ADR-039) — drop the ceremony toggles `activeToggles` /
 * `toggleDurations` and strip the retired `the_long_burn` achievement). */
export const SAVE_MIGRATIONS: readonly SaveMigration[] = [
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4,
  migrateV4ToV5,
  migrateV5ToV6,
  migrateV6ToV7,
  migrateV7ToV8,
  migrateV8ToV9,
  migrateV9ToV10,
  migrateV10ToV11,
  migrateV11ToV12,
  migrateV12ToV13,
  migrateV13ToV14,
  migrateV14ToV15,
];

export class SaveMigrationError extends Error {
  override name = 'SaveMigrationError';
}

const versionedSchema = z.object({ schemaVersion: z.number().int() }).passthrough();

/**
 * Bring an unknown persisted blob up to the current schema version, then validate it.
 *
 * Applies registered migrations from the blob's version up to {@link CURRENT_SCHEMA_VERSION},
 * then parses with the strict schema. Throws {@link SaveMigrationError} if the blob has no numeric
 * version, is newer than this client supports, or has a gap with no registered migration.
 */
export function migrateSave(
  raw: unknown,
  migrations: readonly SaveMigration[] = SAVE_MIGRATIONS,
): SaveBlob {
  const probe = versionedSchema.safeParse(raw);
  if (!probe.success) {
    throw new SaveMigrationError('Save has no numeric schemaVersion');
  }

  let version = probe.data.schemaVersion;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new SaveMigrationError(
      `Save schemaVersion ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}`,
    );
  }

  let blob = raw as Record<string, unknown>;
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = migrations.find((m) => m.from === version);
    if (!step) {
      throw new SaveMigrationError(`No migration registered from schemaVersion ${version}`);
    }
    blob = step.migrate(blob);
    version = step.to;
  }

  return saveBlobSchema.parse(blob);
}
