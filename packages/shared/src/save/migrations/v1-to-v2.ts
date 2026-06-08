/**
 * Save migration v1 → v2 (ADR-006 / ADR-023): reprobate subtypes and the Vitium conversion
 * mechanic were removed, so the persisted shape changes in three ways that a purely additive load
 * could not absorb:
 *
 *   1. `lifetime.reprobates` was a per-subtype record `{ reprobate, glutton, … }`; it becomes a
 *      single integer. We migrate by SUMMING the old per-subtype counts — every reprobate is now
 *      identical, so the surviving population is the total of the formerly-distinct subtypes.
 *   2. `lifetime.conversionPool` (the accrual pool that drove conversions) is removed; we drop it.
 *   3. `lifetime.defixio.target` (the cursed subtype) is removed; we keep `elapsed` so an in-flight
 *      curse continues against the unified pool.
 *
 * The migration is defensive about shape (the blob is untyped on load) and a no-op for any field
 * already in v2 form, so it is safe to run on a partially-migrated or hand-edited blob.
 */
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

/** Sum the numeric values of a v1 per-subtype reprobates record. */
function sumReprobates(reprobates: unknown): number {
  const rec = asRecord(reprobates);
  if (!rec) return typeof reprobates === 'number' ? reprobates : 0;
  let total = 0;
  for (const v of Object.values(rec)) if (typeof v === 'number' && Number.isFinite(v)) total += v;
  return total;
}

export const migrateV1ToV2: SaveMigration = {
  from: 1,
  to: 2,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 2 };
    const state = asRecord(next.state);
    if (!state) return next;
    const lifetime = asRecord(state.lifetime);
    if (!lifetime) return next;

    const newLifetime: Record<string, unknown> = { ...lifetime };

    // 1. Collapse the per-subtype record into a single integer (sum). Already-number is preserved.
    newLifetime.reprobates =
      typeof lifetime.reprobates === 'number'
        ? lifetime.reprobates
        : sumReprobates(lifetime.reprobates);

    // 2. Drop the conversion pool entirely.
    delete newLifetime.conversionPool;

    // 3. Strip the subtype target from an in-flight Defixio curse, keeping its elapsed time.
    const defixio = asRecord(lifetime.defixio);
    if (defixio) {
      newLifetime.defixio = { elapsed: typeof defixio.elapsed === 'number' ? defixio.elapsed : 0 };
    }

    next.state = { ...state, lifetime: newLifetime };
    return next;
  },
};
