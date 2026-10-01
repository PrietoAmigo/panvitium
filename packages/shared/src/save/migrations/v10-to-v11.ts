/**
 * Save migration v10 → v11 (ADR-023): the Decimatio category is retired (ADR-038). Its three rites,
 * `caedes`, `pogrom` and `purgatio`, leave the action catalog, but their ids live, by value, in
 * three places a save can carry them. Left there they would orphan: an inert auto-repeat entry, a
 * queued timer that holds the player slot and resolves to nothing, and (worst) an acolyte assigned to
 * an action that no longer exists, with no control left to recall it. This migration clears every
 * persisted occurrence:
 *
 *   1. `lifetime.autoRepeat[]`              — the retired ids are dropped.
 *   2. `lifetime.actionQueue[]`             — in-flight retired timers are dropped. The rite was paid
 *      for at its start, so each dropped timer's printed base gold price is CREDITED back (the price
 *      table is frozen HERE: a migration must be self-contained and stable in time). The base price
 *      is the floor of what was paid (efficiency could only raise it), never more.
 *   3. `lifetime.acolytes[].assignedAction` — an acolyte on a retired rite returns to idle (a
 *      delegated cycle was free, so nothing is owed).
 *
 * Gold is a BigNum wire string; the credit goes through the sim's exact serialize/deserialize
 * round-trip (ADR-005). Defensive about shape (the blob is untyped on load), and a no-op for a save
 * that carries none of the retired ids.
 */
import { deserializeBigNum, serializeBigNum } from '@panvitium/sim';
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

/** The retired Decimatio rites' base gold prices, as shipped in schema v10. */
const RETIRED_RITE_PRICES: Readonly<Record<string, number>> = {
  caedes: 10,
  pogrom: 100,
  purgatio: 100_000,
};

const isRetired = (id: unknown): boolean =>
  typeof id === 'string' && Object.prototype.hasOwnProperty.call(RETIRED_RITE_PRICES, id);

export const migrateV10ToV11: SaveMigration = {
  from: 10,
  to: 11,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 11 };
    const state = asRecord(next.state);
    if (!state) return next;
    const lifetime = asRecord(state.lifetime);
    if (!lifetime) return next;

    const newLifetime: Record<string, unknown> = { ...lifetime };

    // 1. Auto-repeat list: drop the retired ids.
    if (Array.isArray(lifetime.autoRepeat) && lifetime.autoRepeat.some(isRetired)) {
      newLifetime.autoRepeat = lifetime.autoRepeat.filter((id) => !isRetired(id));
    }

    // 2. Action queue: drop in-flight retired timers, refunding each one's base price.
    if (Array.isArray(lifetime.actionQueue)) {
      let refund = 0;
      const kept = lifetime.actionQueue.filter((t) => {
        const id = asRecord(t)?.actionId;
        if (!isRetired(id)) return true;
        refund += RETIRED_RITE_PRICES[id as string] ?? 0;
        return false;
      });
      if (kept.length !== lifetime.actionQueue.length) newLifetime.actionQueue = kept;
      if (refund > 0 && typeof lifetime.gold === 'string') {
        newLifetime.gold = serializeBigNum(deserializeBigNum(lifetime.gold).add(refund));
      }
    }

    // 3. Acolyte delegations: an acolyte on a retired rite returns to idle. The idle wire form omits
    //    the cycle timer (the serializer drops a null `remainingSeconds`), so it is dropped here too.
    if (Array.isArray(lifetime.acolytes)) {
      const acolytes = lifetime.acolytes;
      if (acolytes.some((a) => isRetired(asRecord(a)?.assignedAction))) {
        newLifetime.acolytes = acolytes.map((a) => {
          const acolyte = asRecord(a);
          if (!acolyte || !isRetired(acolyte.assignedAction)) return a;
          const { remainingSeconds: _timer, ...rest } = acolyte;
          return { ...rest, assignedAction: null };
        });
      }
    }

    next.state = { ...state, lifetime: newLifetime };
    return next;
  },
};
