// Flavour tables for the Orbis Tenebrarum globe.
//
// ⚠️  rarity → colour is presentation; the labels mirror the sim's rarity bands.
//     The coordinate map is pure FLAVOUR (Indagatio has no real geography) — it only
//     decides where each relic glows on the world. Every position is forced onto land:
//     sea coordinates snap to the nearest land anchor and unlisted ids hash into a land set,
//     so any maleficium the sim hands you gets a deterministic, on-land position.

import { LAND_POINTS, isLand } from './orbis.land.js';
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
  blackthorn_wand: [-4, 57],
  witch_bottle: [-71, -36],
  mandrake_root: [12.5, 42.2],
  crow_feather: [31.2, 29.9],
  voynich_manuscript: [12.5, 43.5],
  obsidian_mirror: [-99, 19],
  solomon_ring: [35.2, 31.8],
  '30_pieces': [35.5, 31.5],
  longinus: [49, 33],
  sulfur_censer: [15, 37.7],
  black_robe: [2, 48.8],
  black_candle: [23, 50],
  black_salt_pouch: [15, 60],
  iron_nails: [12.5, 41.9],
  crossroads_dirt: [-90, 32],
  hollow_effigy: [10, 51],
  defixio: [12, 41.9],
  codex_gigas: [14.4, 50],
  mark_of_cain: [44.4, 33.3],
};

/** Stable 32-bit hash of an id. */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Nearest land anchor to an off-land coordinate (squared-distance scan). */
function nearestLand(lon: number, lat: number): readonly [number, number] {
  let best = LAND_POINTS[0]!;
  let bestD = Infinity;
  for (const p of LAND_POINTS) {
    const dx = p[0] - lon;
    const dy = p[1] - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

const resolved = new Map<string, readonly [number, number]>();

/**
 * Resolve the globe position for a find, guaranteed on land: an explicit or flavour-table coord
 * (snapped to the nearest land anchor if it falls in the sea), or for unlisted ids a deterministic
 * land anchor from the id hash. Memoised per id, so the per-frame pin loop stays cheap.
 */
export function coordForFind(find: OrbisFind): readonly [number, number] {
  const cached = resolved.get(find.id);
  if (cached) return cached;
  const candidate = find.coord ?? MALEFICIA_COORDS[find.id];
  const out = candidate
    ? isLand(candidate[0], candidate[1])
      ? candidate
      : nearestLand(candidate[0], candidate[1])
    : LAND_POINTS[hashId(find.id) % LAND_POINTS.length]!;
  resolved.set(find.id, out);
  return out;
}
