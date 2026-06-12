/**
 * Save migration (ADR-006): the version field on every save drives forward migration on load
 * and rejection of versions newer than this client understands. Migrations are applied in
 * sequence from the blob's version up to {@link CURRENT_SCHEMA_VERSION}.
 */
import { z } from 'zod';
import { saveBlobSchema, CURRENT_SCHEMA_VERSION, type SaveBlob } from './schema.js';
import { migrateV1ToV2 } from './migrations/v1-to-v2.js';
import { migrateV2ToV3 } from './migrations/v2-to-v3.js';

/** A single forward migration that upgrades a blob from one schema version to the next. */
export interface SaveMigration {
  readonly from: number;
  readonly to: number;
  migrate(blob: Record<string, unknown>): Record<string, unknown>;
}

/** Registered migrations, applied in sequence (v1 → v2: reprobate-subtype/conversion removal;
 * v2 → v3: legacy business system → Mercatus — gold credit, build-queue fizzle, field drop). */
export const SAVE_MIGRATIONS: readonly SaveMigration[] = [migrateV1ToV2, migrateV2ToV3];

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
