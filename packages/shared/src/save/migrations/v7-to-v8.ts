/**
 * Save migration v7 → v8 (ADR-023): the maleficia rework.
 *
 * Three persisted-shape changes:
 *   1. The Hand of Glory timer `lifetime.handOfGloryRemaining` (a bare number) is subsumed by the
 *      unified single-use-buff map `lifetime.maleficiaBuffs` (id -> seconds). A v7 save mid-buff has
 *      its remaining time carried over as `maleficiaBuffs.hand_of_glory`; the field is then dropped.
 *   2. The old Defixio curse `lifetime.defixio` ({ elapsed }) was a reprobate-pool cull. Defixio is
 *      now a single-use suicide-rate buff with no in-flight equivalent, so any pending curse is
 *      dropped (its effect simply ends at the descent boundary of the load).
 *   3. Iron Nails was removed from the catalog, so its id is stripped from the owned `maleficia`
 *      list, the `emptioList`, and the `maleficiaPrices` map — otherwise a stray id would linger.
 *
 * All three source fields are additive-optional (omitted from the wire when empty — ADR-023), so a
 * v7 save that held no Hand of Glory buff, no curse, and no Iron Nails needs none of these steps and
 * this migration only stamps the version. Defensive about shape (the blob is untyped on load).
 */
import type { SaveMigration } from '../migrate.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

/** Drop every occurrence of `id` from a persisted string array; returns a new array. */
function withoutId(value: unknown, id: string): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry) => entry !== id) as string[];
}

export const migrateV7ToV8: SaveMigration = {
  from: 7,
  to: 8,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 8 };
    const state = asRecord(next.state);
    if (!state) return next;
    const lifetime = asRecord(state.lifetime);
    if (!lifetime) return next;

    const newLifetime: Record<string, unknown> = { ...lifetime };

    // 1. Hand of Glory timer -> maleficiaBuffs.hand_of_glory.
    const remaining = newLifetime.handOfGloryRemaining;
    if (typeof remaining === 'number' && remaining > 0) {
      const buffs = asRecord(newLifetime.maleficiaBuffs) ?? {};
      newLifetime.maleficiaBuffs = { ...buffs, hand_of_glory: remaining };
    }
    delete newLifetime.handOfGloryRemaining;

    // 2. Old Defixio cull curse has no equivalent under the new (buff) Defixio: drop it.
    delete newLifetime.defixio;

    // 3. Iron Nails removed from the catalog: strip its id everywhere it could persist.
    const maleficia = withoutId(newLifetime.maleficia, 'iron_nails');
    if (maleficia) newLifetime.maleficia = maleficia;
    const emptioList = withoutId(newLifetime.emptioList, 'iron_nails');
    if (emptioList) newLifetime.emptioList = emptioList;
    const prices = asRecord(newLifetime.maleficiaPrices);
    if (prices && 'iron_nails' in prices) {
      const { iron_nails: _drop, ...rest } = prices;
      newLifetime.maleficiaPrices = rest;
    }

    next.state = { ...state, lifetime: newLifetime };
    return next;
  },
};
