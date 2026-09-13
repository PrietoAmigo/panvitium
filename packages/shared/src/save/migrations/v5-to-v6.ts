/**
 * Save migration v5 → v6 (ADR-023): the invocation roster rework. The invocation catalog was
 * reshuffled wholesale — most entries changed Sin, gate, cost and effect (e.g. the Imp/Upir/Harpy/
 * Lamia autonomous runners became flat modifier effects; the world-still apex moved from Morpheus to
 * Astiwihad; Morpheus became a reprobate → desidia converter) — and a "one apex kind per lifetime"
 * rule was added. Two persisted-shape changes:
 *
 *   1. `lifetime.morpheusLockedOut` is removed (replaced by the one-apex-per-lifetime rule), and the
 *      world-still pending flag `lifetime.pendingMorpheus` is renamed to `lifetime.pendingAstiwihad`
 *      (Astiwihad now carries the 100%-gold/maleficia + Emptio-list Katabasis carry-over that
 *      Morpheus used to). `lifetime.apexInvoked` is seeded from whichever pending flag survives so the
 *      one-per-lifetime rule holds for a save migrated mid-lifetime.
 *   2. Active invocations and their runner/duration timers (`invocations`, `invocationRunners`,
 *      `invocationDurations`) are CLEARED. They are lifetime-scoped and cheaply re-summoned; clearing
 *      them prevents an old count landing on a redefined entry or forming an illegal multi-apex set
 *      under the new one-per-lifetime rule. (Any old Aurevora ramp resets to 0 — harmless.)
 *
 * The new fields (`reprobateCostPool`, `pendingAstiwihad`, `apexInvoked`) otherwise seed by OMISSION
 * (absent ≡ 0 / false / none — ADR-023). Defensive about shape (the blob is untyped on load); a no-op
 * for anything already in v6 form.
 */
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

export const migrateV5ToV6: SaveMigration = {
  from: 5,
  to: 6,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 6 };
    const state = asRecord(next.state);
    if (!state) return next;
    const lifetime = asRecord(state.lifetime);
    if (!lifetime) return next;

    const newLifetime: Record<string, unknown> = { ...lifetime };

    // 1. Clear the reworked invocation state (invocations is a required wire field → reset to {}).
    newLifetime.invocations = {};
    delete newLifetime.invocationRunners;
    delete newLifetime.invocationDurations;

    // 2. Rename the world-still pending flag; drop the retired lockout; seed apexInvoked.
    const pendingErinyes = lifetime.pendingErinyes === true;
    const pendingAstiwihad = lifetime.pendingMorpheus === true;
    delete newLifetime.pendingMorpheus;
    delete newLifetime.morpheusLockedOut;
    if (pendingAstiwihad) newLifetime.pendingAstiwihad = true;
    if (pendingErinyes) newLifetime.apexInvoked = 'erinyes';
    else if (pendingAstiwihad) newLifetime.apexInvoked = 'astiwihad';

    // 3. `reprobateCostPool` seeds by omission (absent ≡ 0 — ADR-023).

    next.state = { ...state, lifetime: newLifetime };
    return next;
  },
};
