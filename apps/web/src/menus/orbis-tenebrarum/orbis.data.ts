// Flavour tables for the Orbis Tenebrarum globe.
//
// ⚠️  rarity → colour is presentation; the labels mirror the sim's rarity bands.
//     The coordinate map is pure FLAVOUR (Indagatio has no real geography) — it only
//     decides where each relic glows on the world. Unknown ids fall back to a stable hash,
//     so any maleficium the sim hands you gets a deterministic, non-overlapping position.

import type { OrbisFind, OrbisRarity } from './orbis.types.js';

export const ORBIS_RARITY: Record<OrbisRarity, { label: string; color: string; glow: string }> = {
  common: { label: 'Common', color: '#b6a884', glow: 'rgba(182,168,132,.55)' },
  rare: { label: 'Rare', color: '#56b3a3', glow: 'rgba(86,179,163,.6)' },
  profane: { label: 'Profane', color: '#d05a4d', glow: 'rgba(208,90,77,.6)' },
  anathema: { label: 'Anathema', color: '#a574d8', glow: 'rgba(165,116,216,.6)' },
};

/** Hand-placed [lon, lat] for the known catalog ids — evocative, spread across the globe. */
export const MALEFICIA_COORDS: Record<string, readonly [number, number]> = {
  ars_serpens: [35, 39],
  ritual_dagger: [44, 33],
  blood_chalk: [25, 47.5],
  blackthorn_wand: [-7, 57.5],
  witch_bottle: [-71, -36],
  mandrake_root: [12, 41],
  crow_feather: [31.2, 29.9],
  voynich_manuscript: [12.5, 43.5],
  obsidian_mirror: [-99, 19],
  solomon_ring: [35.2, 31.8],
  '30_pieces': [35.5, 31.5],
  longinus: [49, 33],
  sulfur_censer: [15, 37.7],
  black_robe: [2, 48.8],
  black_candle: [23, 50],
  black_salt_pouch: [18, 59],
  iron_nails: [12.5, 41.9],
  crossroads_dirt: [-90, 32],
  hollow_effigy: [10, 51],
  defixio: [12, 41.9],
  codex_gigas: [14.4, 50],
  mark_of_cain: [44.4, 33.3],
};

/** Deterministic [lon, lat] from an id — used when a find has no explicit coord and isn't in the table. */
function hashCoord(id: string): readonly [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const lon = (h % 360) - 180;
  const lat = (Math.floor(h / 360) % 130) - 65;
  return [lon, lat];
}

/** Resolve the globe position for a find: explicit coord → flavour table → stable hash. */
export function coordForFind(find: OrbisFind): readonly [number, number] {
  return find.coord ?? MALEFICIA_COORDS[find.id] ?? hashCoord(find.id);
}
