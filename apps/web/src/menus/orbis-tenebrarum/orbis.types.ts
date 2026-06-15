// Presentation shapes for the Orbis Tenebrarum (merged Indagatio × Emptio) surface.
// These are the CONTRACT the integrator fills from the sim / game store. Nothing here
// holds game state — the component is a pure function of these props.

export type OrbisRarity = 'common' | 'rare' | 'profane' | 'anathema';

/**
 * One maleficium that Indagatio has surfaced — i.e. an entry on the Emptio list.
 * Keyed by the canonical maleficium id so the integrator's merge is a lookup, not a guess.
 */
export interface OrbisFind {
  /** Canonical maleficium id (`ars_serpens`, `obsidian_mirror`, …). Stable React key + select key. */
  id: string;
  /** Display name — REAL, from the sim catalog. */
  name: string;
  /** Rarity band — REAL, from the sim catalog. Drives pin/badge colour. */
  rarity: OrbisRarity;
  /** One-line effect — REAL, from the sim catalog. Empty string when the relic grants no effect to show. */
  effect: string;
  /** Grimoire flavour line — REAL, from the sim catalog. */
  desc: string;
  /** Price, PRE-FORMATTED by the app's bignum formatter, e.g. `'220 g'`. The component never formats numbers. */
  costLabel: string;
  /** True once bought via Emptio — REAL, from the store. */
  acquired: boolean;
  /** Whether the player can buy it right now (`gold >= price && !acquired`) — REAL, computed by the integrator. */
  affordable: boolean;
  /**
   * FLAVOUR. Optional fixed globe position `[lon, lat]`. Omit and the component derives a
   * stable position from the id (see `orbis.data.ts` → `coordForFind`). Indagatio has no real
   * geography; this is purely where the relic glows on the world.
   */
  coord?: readonly [number, number];
}

export interface OrbisTenebrarumProps {
  /** The Emptio list — maleficia discovered but not necessarily bought — in discovery order. */
  finds: readonly OrbisFind[];
  /** Treasury balance, PRE-FORMATTED, e.g. `'1,240'`. */
  gold: string;
  /** True while an Indagatio search is underway. Spins the globe + disables Cast. The integrator owns the timer. */
  searching: boolean;
  /** Indagatio cycle length, PRE-FORMATTED, e.g. `'30:00'`. Defaults to `'30:00'`. */
  searchDuration?: string;
  /** PRE-FORMATTED time left in the running Indagatio, e.g. `'04:12'`; shown as a live countdown while
   * `searching`. Null when idle, in which case the static `searchDuration` estimate is shown instead. */
  searchRemaining?: string | null;
  /** The in-flight Emptio buy, if any: which find id is being acquired and how far along (0→1). Drives a
   * progress bar on that ledger row. Null when no Emptio is running. Emptio does NOT spin the globe. */
  emptioProgress?: { id: string; fraction: number } | null;
  /** Currently inspected find id. Drives the globe's focus tween and the detail panel. */
  selectedId?: string | null;
  /** Begin an Indagatio search. */
  onCast: () => void;
  /** Inspect a find (fired by clicking a globe pin OR a ledger row). */
  onSelect: (id: string) => void;
  /** Buy a find via Emptio. */
  onAcquire: (id: string) => void;
}
