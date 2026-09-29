/**
 * Save migration v9 → v10 (ADR-023): the Depraedatio relationship-tier rework. The loan book is
 * retired and the twelve-node Avaritia contract tree (Usura / Faeneratio / Custodia branches) is
 * replaced by nine free contracts laddered on the reserve's relationship tier. The persisted shape
 * changes in two ways:
 *
 *   1. `lifetime.syngraphae`: every RETIRED contract id is stripped. The player signed those terms
 *      this lifetime with burned gold, so each stripped id's signing fee is CREDITED back to liquid
 *      gold (the fee table is frozen HERE: a migration must be self-contained and stable in time).
 *      Ids already in the new catalog are kept as they are.
 *   2. `lifetime.hoardAtDescent` (the retired Peculium base, stamped mid-descent) is dropped.
 *
 * The new fields (`accountAge`, `accountIncome`, `safeItem`, `assetTracingElapsed`) seed by
 * OMISSION (absent ≡ not yet opened / zero / empty / zero, ADR-023). Gold is a BigNum wire string;
 * the credit goes through the sim's exact serialize/deserialize round-trip (ADR-005). Defensive
 * about shape (the blob is untyped on load): a malformed list is dropped with no credit.
 */
import { deserializeBigNum, serializeBigNum } from '@panvitium/sim';
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

/** The retired contracts' signing fees (burned gold), as shipped in schema v9. */
const RETIRED_FEES: Readonly<Record<string, number>> = {
  'usura-1': 500,
  'usura-2': 5_000,
  'usura-3': 50_000,
  'usura-4': 500_000,
  'faeneratio-1': 500,
  'faeneratio-2': 5_000,
  'faeneratio-3': 50_000,
  'faeneratio-4': 500_000,
  'custodia-1': 500,
  'custodia-2': 5_000,
  'custodia-3': 50_000,
  'custodia-4': 500_000,
};

/** The v10 contract ids (frozen here, like the fee table). */
const V10_CONTRACTS = new Set([
  'interest-rate',
  'long-term',
  'active-management',
  'compounding',
  'vesting',
  'annuity',
  'pi',
  'custody-vip',
  'risk-algos',
]);

export const migrateV9ToV10: SaveMigration = {
  from: 9,
  to: 10,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 10 };
    const state = asRecord(next.state);
    if (!state) return next;
    const lifetime = asRecord(state.lifetime);
    if (!lifetime) return next;

    const { hoardAtDescent: _peculiumBase, syngraphae: raw, ...rest } = lifetime;
    const newLifetime: Record<string, unknown> = { ...rest };

    if (Array.isArray(raw)) {
      let refund = 0;
      const kept: string[] = [];
      for (const id of raw) {
        if (typeof id !== 'string') continue;
        if (V10_CONTRACTS.has(id)) kept.push(id);
        else refund += RETIRED_FEES[id] ?? 0;
      }
      if (kept.length > 0) newLifetime.syngraphae = kept;
      if (refund > 0 && typeof lifetime.gold === 'string') {
        newLifetime.gold = serializeBigNum(deserializeBigNum(lifetime.gold).add(refund));
      }
    }

    next.state = { ...state, lifetime: newLifetime };
    return next;
  },
};
