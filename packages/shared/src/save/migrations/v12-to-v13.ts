/**
 * Save migration v12 → v13 (ADR-023): the Indagatio investment rework. The gold STAKE
 * (`lifetime.indagatioInvestment`, liquid gold set aside for the next Search) is replaced by a
 * default investment PERCENTAGE (`lifetime.indagatioInvestPercent`): the share of the gold held
 * that every Search pours into itself when cast. The persisted shape changes in one way:
 *
 *   1. `lifetime.indagatioInvestment` is dropped, and any gold it held is CREDITED back to liquid
 *      gold: it was the player's own gold, merely set aside and not yet spent on a Search.
 *
 * The new `indagatioInvestPercent` seeds by OMISSION (absent ≡ 0%, ADR-023): the player chooses a
 * share afresh. Gold is a BigNum wire string; the credit goes through the sim's exact
 * serialize/deserialize round-trip (ADR-005). Defensive about shape (the blob is untyped on load):
 * a malformed stake is dropped with no credit, and a save without the field is a no-op.
 */
import { deserializeBigNum, serializeBigNum } from '@panvitium/sim';
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

export const migrateV12ToV13: SaveMigration = {
  from: 12,
  to: 13,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 13 };
    const state = asRecord(next.state);
    if (!state) return next;
    const lifetime = asRecord(state.lifetime);
    if (!lifetime || !Object.prototype.hasOwnProperty.call(lifetime, 'indagatioInvestment')) {
      return next;
    }

    const { indagatioInvestment: stake, ...rest } = lifetime;
    const newLifetime: Record<string, unknown> = { ...rest };
    if (typeof stake === 'string' && typeof lifetime.gold === 'string') {
      const refund = deserializeBigNum(stake);
      if (refund.gt(0)) {
        newLifetime.gold = serializeBigNum(deserializeBigNum(lifetime.gold).add(refund));
      }
    }

    next.state = { ...state, lifetime: newLifetime };
    return next;
  },
};
