/**
 * Save migration v3 → v4 (ADR-023): the Decimatio rite formerly identified as `caedis` (Latin
 * genitive) was renamed to `caedes` (the nominative) for consistency with the other rite names
 * (Decimatio, Purgatio). The persisted shape is unchanged — but the action id lives, by value, in
 * three places a player's save can carry it, and a stale `caedis` there would orphan silently (an
 * inert auto-repeat entry, a queued timer that resolves to no action, an acolyte assigned to a rite
 * that no longer exists). This migration rewrites every persisted occurrence:
 *
 *   1. `lifetime.autoRepeat[]`            — the player-slot auto-repeat list.
 *   2. `lifetime.actionQueue[].actionId`  — in-flight rite timers.
 *   3. `lifetime.acolytes[].assignedAction` — acolyte delegations.
 *
 * Defensive about shape (the blob is untyped on load) and a no-op for any field already in v4 form.
 */
import type { SaveMigration } from '../migrate.js';

const OLD_ID = 'caedis';
const NEW_ID = 'caedes';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

export const migrateV3ToV4: SaveMigration = {
  from: 3,
  to: 4,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 4 };
    const state = asRecord(next.state);
    if (!state) return next;
    const lifetime = asRecord(state.lifetime);
    if (!lifetime) return next;

    const newLifetime: Record<string, unknown> = { ...lifetime };

    // 1. Auto-repeat list: rename the entry in place.
    if (Array.isArray(lifetime.autoRepeat)) {
      newLifetime.autoRepeat = lifetime.autoRepeat.map((id) => (id === OLD_ID ? NEW_ID : id));
    }

    // 2. Action-queue timers: rename the actionId on any in-flight Caedes timer.
    if (Array.isArray(lifetime.actionQueue)) {
      newLifetime.actionQueue = lifetime.actionQueue.map((t) => {
        const timer = asRecord(t);
        return timer && timer.actionId === OLD_ID ? { ...timer, actionId: NEW_ID } : t;
      });
    }

    // 3. Acolyte delegations: rename the assignedAction on any acolyte working the rite.
    if (Array.isArray(lifetime.acolytes)) {
      newLifetime.acolytes = lifetime.acolytes.map((a) => {
        const acolyte = asRecord(a);
        return acolyte && acolyte.assignedAction === OLD_ID
          ? { ...acolyte, assignedAction: NEW_ID }
          : a;
      });
    }

    next.state = { ...state, lifetime: newLifetime };
    return next;
  },
};
