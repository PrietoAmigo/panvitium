/**
 * Save migration v4 → v5 (ADR-023): the Mercatus system (eight per-Sin trades with integer
 * depths) was removed by the Depraedatio gold rework — the Faeneratio loop (Mutuum / Thesaurus /
 * Syngraphae) replaces it. The persisted shape changes in one way:
 *
 *   1. `lifetime.mercatusDepths` (sin → depth) is removed. The player is CREDITED gold equal to
 *      each trade's divest value — 25% of the closed-form cumulative invest cost to its depth —
 *      as if every trade were sold off at the moment of migration (matching the Katabasis
 *      liquidation semantics the shipped `mercatus.ts` had). The cost math is frozen HERE (a
 *      migration must be self-contained and stable in time; the module it came from is deleted):
 *      `C0 = 50`, ratio `r = 1.6`; Avaritiae folds its compounding per-depth discount into the
 *      ratio (`1.6 × 0.995`); Superbiae costs a flat ×1.25; cumulative cost to depth d is the
 *      geometric closed form `C0 × (ratio^d − 1)/(ratio − 1) × flatMul`.
 *
 * The new fields (`hoard`, `syngraphae`) seed by OMISSION (absent ≡ zero / none — ADR-023).
 * Gold is a BigNum wire string; the credit goes through the sim's exact serialize/deserialize
 * round-trip so no precision is lost (ADR-005). The migration is defensive about shape (the blob
 * is untyped on load), credits 0 for malformed entries, and is a no-op for fields already in v5 form.
 */
import { deserializeBigNum, serializeBigNum } from '@panvitium/sim';
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

/** The frozen Mercatus cost constants (Vitium Mercatura sheet, as shipped). */
const C0 = 50;
const RATIO = 1.6;
const AVARITIA_DISCOUNT = 0.995;
const SUPERBIA_FLAT_MUL = 1.25;
/** The Globals shutdown-recovery fraction the divest refunded. */
const DIVEST_FRACTION = 0.25;

/** The eight Cardinal Sins the depth record could legitimately carry. */
const SINS = new Set([
  'gula',
  'luxuria',
  'avaritia',
  'tristitia',
  'ira',
  'acedia',
  'vanagloria',
  'superbia',
]);

/**
 * The frozen closed-form cumulative invest cost to depth `d` on a Sin's own curve — Avaritiae's
 * compounding discount lives in the ratio, Superbiae's surcharge is a flat multiplier (copied
 * from the shipped `mercatus.ts`, not imported: that module is deleted).
 */
function cumulativeInvestCost(sin: string, d: number): number {
  if (d <= 0) return 0;
  const ratio = sin === 'avaritia' ? RATIO * AVARITIA_DISCOUNT : RATIO;
  const flatMul = sin === 'superbia' ? SUPERBIA_FLAT_MUL : 1;
  return ((C0 * (Math.pow(ratio, d) - 1)) / (ratio - 1)) * flatMul;
}

/**
 * Floor with a tiny epsilon (the shipped refund flooring): `RATIO − 1` is 0.6000000000000001 in
 * IEEE doubles, so an exactly-integer refund can compute a hair low and a naked floor would short
 * it by 1 gold.
 */
function floorRefund(n: number): number {
  return Math.floor(n + 1e-9);
}

export const migrateV4ToV5: SaveMigration = {
  from: 4,
  to: 5,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 5 };
    const state = asRecord(next.state);
    if (!state) return next;
    const lifetime = asRecord(state.lifetime);
    if (!lifetime) return next;

    const newLifetime: Record<string, unknown> = { ...lifetime };

    // 1. Credit each trade's divest value (25% of its frozen cumulative cost), then drop the
    //    field. Per-trade flooring matches the shipped manual-divest refund exactly. Malformed
    //    entries (unknown sins, non-numeric or non-positive depths) credit 0.
    let credit = 0;
    const depths = asRecord(lifetime.mercatusDepths);
    if (depths) {
      for (const [sin, depth] of Object.entries(depths)) {
        if (!SINS.has(sin)) continue;
        if (typeof depth !== 'number' || !Number.isFinite(depth) || depth <= 0) continue;
        credit += floorRefund(DIVEST_FRACTION * cumulativeInvestCost(sin, Math.floor(depth)));
      }
    }
    delete newLifetime.mercatusDepths;

    // 2. `hoard` and `syngraphae` seed by omission (absent ≡ zero / none — ADR-023).

    if (credit > 0 && typeof lifetime.gold === 'string') {
      newLifetime.gold = serializeBigNum(deserializeBigNum(lifetime.gold).add(credit));
    }

    next.state = { ...state, lifetime: newLifetime };
    return next;
  },
};
