/**
 * Save migration v2 → v3 (ADR-006 / ADR-023): the legacy Vitium Mercatura business system
 * (32-business catalog, build queue, flat emitters) was replaced by the Mercatus system — eight
 * trades with a single integer depth each. The persisted shape changes in three ways:
 *
 *   1. `lifetime.businesses` (id → owned count) is removed. The player is CREDITED gold equal to
 *      25% of each owned business's old build cost × count — the legacy shutdown-refund fraction,
 *      applied as if every business were shut down at the moment of migration. The old catalog no
 *      longer exists in the sim, so its cost table is frozen HERE (a migration must be
 *      self-contained and stable in time): tier 1 = 100 gold (Gula 500), tier 2 = 25,000,
 *      tier 3 = 500,000, tier 4 = 100,000,000, with ids of the form `<sin>-mercatura-<tier>`.
 *   2. `lifetime.buildQueue` is removed; in-flight builds FIZZLE with no refund of their up-front
 *      cost — matching the old cancel semantics (the only teardown path, `enterKatabasis`,
 *      fizzled the queue without refund; there was no manual cancel).
 *   3. `lifetime.mercatusDepths` is the replacement state; it is seeded empty by OMISSION (absent
 *      ≡ all depths 0 — the new system starts from scratch).
 *
 * Gold is a BigNum wire string; the credit goes through the sim's exact serialize/deserialize
 * round-trip so no precision is lost (ADR-005). The migration is defensive about shape (the blob
 * is untyped on load) and a no-op for any field already in v3 form.
 */
import { deserializeBigNum, serializeBigNum } from '@panvitium/sim';
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

/**
 * The frozen legacy build-cost table, keyed by the catalog's id shape `<sin>-mercatura-<tier>`.
 * Unknown / malformed ids credit 0 (they paid nothing the migration can see).
 */
function legacyBuildCost(businessId: string): number {
  const m = /^([a-z]+)-mercatura-([1-4])$/.exec(businessId);
  if (!m) return 0;
  const sin = m[1];
  switch (m[2]) {
    case '1':
      return sin === 'gula' ? 500 : 100;
    case '2':
      return 25_000;
    case '3':
      return 500_000;
    case '4':
      return 100_000_000;
    default:
      return 0;
  }
}

/** The legacy shutdown-refund fraction (Globals "Business shutdown gold recovery"). */
const LEGACY_REFUND_FRACTION = 0.25;

export const migrateV2ToV3: SaveMigration = {
  from: 2,
  to: 3,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 3 };
    const state = asRecord(next.state);
    if (!state) return next;
    const lifetime = asRecord(state.lifetime);
    if (!lifetime) return next;

    const newLifetime: Record<string, unknown> = { ...lifetime };

    // 1. Credit 25% of every owned business's build cost, then drop the field. Per-business
    //    flooring matches the old manual-shutdown refund exactly.
    let credit = 0;
    const businesses = asRecord(lifetime.businesses);
    if (businesses) {
      for (const [id, count] of Object.entries(businesses)) {
        if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue;
        credit += Math.floor(legacyBuildCost(id) * LEGACY_REFUND_FRACTION) * Math.floor(count);
      }
    }
    delete newLifetime.businesses;

    // 2. Fizzle the build queue — no refund of in-flight costs (matches old cancel semantics).
    delete newLifetime.buildQueue;

    // 3. mercatusDepths is seeded by omission (absent ≡ empty ≡ all depths 0).

    if (credit > 0 && typeof lifetime.gold === 'string') {
      newLifetime.gold = serializeBigNum(deserializeBigNum(lifetime.gold).add(credit));
    }

    next.state = { ...state, lifetime: newLifetime };
    return next;
  },
};
