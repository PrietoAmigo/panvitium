/**
 * Save migration v14 → v15 (ADR-023, ADR-039): Panvitium, the Chthonic Logos's fourth rite and the
 * last Vitium Compositum ceremony, is removed, and with it the toggle engine that served it alone.
 * The persisted state changes in two ways:
 *
 *   1. `lifetime.activeToggles` (the active ceremony ids) and `lifetime.toggleDurations` (their
 *      seconds active, for Panvitium's ramping upkeep) are dropped. A burn in flight at save time
 *      simply ends: its upkeep was paid second by second, so nothing is owed back.
 *   2. The retired achievement id `the_long_burn` ("Sustain Panvitium for 60 seconds") is stripped
 *      from `achievements`, so the ledger's tally counts only achievements that still exist.
 *
 * Defensive about shape (the blob is untyped on load): a missing lifetime or a malformed
 * achievements list is left as is.
 */
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

const RETIRED_ACHIEVEMENT = 'the_long_burn';

export const migrateV14ToV15: SaveMigration = {
  from: 14,
  to: 15,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 15 };
    const state = asRecord(next.state);
    if (!state) return next;
    let nextState: Record<string, unknown> = state;

    const lifetime = asRecord(state.lifetime);
    if (lifetime && ('activeToggles' in lifetime || 'toggleDurations' in lifetime)) {
      const { activeToggles: _toggles, toggleDurations: _durations, ...rest } = lifetime;
      nextState = { ...nextState, lifetime: rest };
    }

    const achievements = state.achievements;
    if (Array.isArray(achievements) && achievements.includes(RETIRED_ACHIEVEMENT)) {
      nextState = {
        ...nextState,
        achievements: achievements.filter((id) => id !== RETIRED_ACHIEVEMENT),
      };
    }

    if (nextState !== state) next.state = nextState;
    return next;
  },
};
