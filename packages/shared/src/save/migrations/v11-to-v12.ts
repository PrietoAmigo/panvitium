/**
 * Save migration v11 → v12 (ADR-023): the Black Robe maleficium was renamed the Red Robe, and its
 * id `black_robe` became `red_robe`. The item is otherwise unchanged (cost, invoking power, the
 * +0.4 influence/s), but its id lives, by value, in five places a save can carry it, and a stale
 * `black_robe` there would orphan silently (an owned relic that grants nothing, a listing that can
 * never be bought, a dead price, an Emptio that resolves to no item, an empty-looking safe). This
 * migration rewrites every persisted occurrence:
 *
 *   1. `lifetime.maleficia[]`             — the owned relics.
 *   2. `lifetime.emptioList[]`            — the items Indagatio has surfaced for purchase.
 *   3. `lifetime.maleficiaPrices{}`       — the per-item rolled price (a key rename).
 *   4. `lifetime.actionQueue[].target`    — an in-flight Emptio's purchase target.
 *   5. `lifetime.safeItem`                — the relic held in the Custody VIP safe.
 *
 * The robe is a passive relic, never a single-use buff, so `maleficiaBuffs` cannot hold it.
 * Defensive about shape (the blob is untyped on load) and a no-op for a save without the old id.
 */
import type { SaveMigration } from '../migrate.js';

const OLD_ID = 'black_robe';
const NEW_ID = 'red_robe';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

/** Rewrite every `OLD_ID` in a persisted string array; returns a new array. */
function renamedIds(value: unknown[]): unknown[] {
  return value.map((entry) => (entry === OLD_ID ? NEW_ID : entry));
}

export const migrateV11ToV12: SaveMigration = {
  from: 11,
  to: 12,
  migrate(blob) {
    const next: Record<string, unknown> = { ...blob, schemaVersion: 12 };
    const state = asRecord(next.state);
    if (!state) return next;
    const lifetime = asRecord(state.lifetime);
    if (!lifetime) return next;

    const newLifetime: Record<string, unknown> = { ...lifetime };

    // 1, 2. Owned relics and the Emptio listing.
    if (Array.isArray(lifetime.maleficia) && lifetime.maleficia.includes(OLD_ID)) {
      newLifetime.maleficia = renamedIds(lifetime.maleficia);
    }
    if (Array.isArray(lifetime.emptioList) && lifetime.emptioList.includes(OLD_ID)) {
      newLifetime.emptioList = renamedIds(lifetime.emptioList);
    }

    // 3. Rolled prices: move the entry to the new key, keeping the others' order.
    const prices = asRecord(lifetime.maleficiaPrices);
    if (prices && Object.prototype.hasOwnProperty.call(prices, OLD_ID)) {
      newLifetime.maleficiaPrices = Object.fromEntries(
        Object.entries(prices).map(([id, price]) => [id === OLD_ID ? NEW_ID : id, price]),
      );
    }

    // 4. An in-flight Emptio aimed at the robe.
    if (Array.isArray(lifetime.actionQueue)) {
      const queue = lifetime.actionQueue;
      if (queue.some((t) => asRecord(t)?.target === OLD_ID)) {
        newLifetime.actionQueue = queue.map((t) => {
          const timer = asRecord(t);
          return timer?.target === OLD_ID ? { ...timer, target: NEW_ID } : t;
        });
      }
    }

    // 5. The safe.
    if (lifetime.safeItem === OLD_ID) newLifetime.safeItem = NEW_ID;

    next.state = { ...state, lifetime: newLifetime };
    return next;
  },
};
