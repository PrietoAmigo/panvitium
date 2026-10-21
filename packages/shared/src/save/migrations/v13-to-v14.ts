/**
 * Save migration v13 → v14 (ADR-023): the first-descent cinematic (Claude Design "First Katabasis"
 * handoff). The playthrough's first commit that truly descends now plays a short cinematic before
 * the Abyss transit, once, recorded by the permanent top-level flag `firstDescentSeen`. Absent
 * reads as "never seen", which is wrong for a save that had already descended before the cinematic
 * existed, so the persisted state changes in one way:
 *
 *   1. A save whose `katabasisCount` is above zero gains `firstDescentSeen: true`, so a veteran
 *      never sees the cinematic. A save that has not yet descended seeds by OMISSION (absent ≡
 *      false): its first real descent plays it.
 *
 * Defensive about shape (the blob is untyped on load): a missing or malformed count is treated as
 * no descent, and a save that already carries the flag keeps it as is.
 */
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

export const migrateV13ToV14: SaveMigration = {
  from: 13,
  to: 14,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 14 };
    const state = asRecord(next.state);
    if (!state) return next;
    const count = state.katabasisCount;
    if (typeof count !== 'number' || !(count > 0) || state.firstDescentSeen === true) return next;
    next.state = { ...state, firstDescentSeen: true };
    return next;
  },
};
