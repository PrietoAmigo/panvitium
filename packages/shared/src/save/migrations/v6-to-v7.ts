/**
 * Save migration v6 → v7 (ADR-023): the "Stagnation" resource was renamed to "Desidia". The offline
 * torpor resource and the time-acceleration toggle that spends it now share a single name (Desidia),
 * so the persisted top-level field `state.stagnation` is renamed to `state.desidia`, its value
 * preserved unchanged.
 *
 * Both fields are additive-optional (omitted from the wire when 0 — ADR-023), so a v6 save that never
 * banked any torpor has neither key and this migration is a no-op for it. The `desidiaActive` toggle
 * flag already carried the `desidia` name, so it is untouched by the rename.
 *
 * Defensive about shape (the blob is untyped on load); a no-op for anything already in v7 form.
 */
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

export const migrateV6ToV7: SaveMigration = {
  from: 6,
  to: 7,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 7 };
    const state = asRecord(next.state);
    if (!state) return next;

    const newState: Record<string, unknown> = { ...state };
    if ('stagnation' in newState) {
      newState.desidia = newState.stagnation;
      delete newState.stagnation;
    }

    next.state = newState;
    return next;
  },
};
