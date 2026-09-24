/**
 * Save migration v8 → v9 (ADR-023, ADR-036): the autonomous invocation-runner channel is removed.
 *
 * No invocation had run an autonomous background action since the v5 → v6 roster rework, so the
 * runner timers `lifetime.invocationRunners` (invocation id → remaining seconds) could only ever be
 * empty or stale. The field is dropped from the persisted shape. It was additive-optional (omitted
 * from the wire when empty), so a typical v8 save carries nothing to drop and this migration only
 * stamps the version. Defensive about shape (the blob is untyped on load).
 */
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

export const migrateV8ToV9: SaveMigration = {
  from: 8,
  to: 9,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 9 };
    const state = asRecord(next.state);
    if (!state) return next;
    const lifetime = asRecord(state.lifetime);
    if (!lifetime || !('invocationRunners' in lifetime)) return next;
    const { invocationRunners: _drop, ...rest } = lifetime;
    next.state = { ...state, lifetime: rest };
    return next;
  },
};
