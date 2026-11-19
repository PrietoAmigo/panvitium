// Flavour tables for the Orbis Tenebrarum globe.
//
// ⚠️  rarity → colour is presentation; the labels mirror the sim's rarity bands.
//     Where a relic glows on the world is pure FLAVOUR (Indagatio has no real geography). Every
//     maleficium is scattered over the whole inhabited land by `scatterOverLand`: a seeded,
//     area-weighted spread with a minimum spacing, so relics turn up on every continent rather than
//     piling into one region, and the scatter is re-rolled each lifetime (the integrator salts it
//     with the Katabasis count). Every position is forced onto land: a sea coordinate snaps to the
//     nearest land anchor, and an id the scatter never saw hashes into the land set.

import { LAND_POINTS, isLand } from './orbis.land.js';
import type { OrbisFind, OrbisRarity } from './orbis.types.js';

export const ORBIS_RARITY: Record<OrbisRarity, { label: string; color: string; glow: string }> = {
  common: { label: 'Common', color: '#b6a884', glow: 'rgba(182,168,132,.55)' },
  rare: { label: 'Rare', color: '#56b3a3', glow: 'rgba(86,179,163,.6)' },
  profane: { label: 'Profane', color: '#a574d8', glow: 'rgba(165,116,216,.6)' },
  anathema: { label: 'Anathema', color: '#d05a4d', glow: 'rgba(208,90,77,.6)' },
};

/**
 * The rarity each Search outcome tier reaches for first (it falls back down the chain when none of
 * that rarity is left to find): the odds bars paint a tier in this rarity's colour. The failure
 * tiers (Bad: a false lead; Terrible / Apocalyptic: gold lost) find nothing and map to null.
 * Mirrors the sim's `indagatioTierDelta` chains.
 */
export const ORBIS_TIER_FIND: Readonly<Record<string, OrbisRarity | null>> = {
  stellar: 'anathema',
  excellent: 'profane',
  good: 'rare',
  neutral: 'common',
  bad: null,
  terrible: null,
  apocalyptic: null,
};

/** A globe position as a compact coordinate line, e.g. `43.50°N · 12.50°E`. */
export function formatCoord([lon, lat]: readonly [number, number]): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} · ${Math.abs(lon).toFixed(2)}°${ew}`;
}

const DEG = Math.PI / 180;

/** Stable 32-bit hash of a string. */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** A small seeded PRNG (mulberry32) for the scatter. Presentation only: it never touches the sim's
 *  RNG stream (ADR-011), so placing relics cannot shift any game outcome. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Great-circle separation of two `[lon, lat]` points, in degrees. */
export function arcDegrees(a: readonly [number, number], b: readonly [number, number]): number {
  const p1 = a[1] * DEG;
  const p2 = b[1] * DEG;
  const c =
    Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos((b[0] - a[0]) * DEG);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}

/** The widest spacing the scatter first asks for between two relics (degrees of arc), and how much
 *  each later pass relaxes it so every id still finds a place. */
const SCATTER_START_SEPARATION = 24;
const SCATTER_RELAX = 0.8;
/** How far (degrees) a relic may wander off its 4° land anchor, so the pins do not sit on a grid. */
const SCATTER_JITTER = 1.6;

let scatterCache: { key: string; map: ReadonlyMap<string, readonly [number, number]> } | null =
  null;

/**
 * Scatter `ids` over the inhabited land (the `LAND_POINTS` anchors), deterministically for `salt`.
 *
 * The anchors are visited in an area-weighted random order (Efraimidis–Spirakis keys weighted by
 * cos(latitude): a 4° grid cell shrinks toward the poles, so without the weight Siberia, Canada and
 * Greenland would draw far more than their share). Each id, in order, takes the next anchor at least
 * `SCATTER_START_SEPARATION` degrees from every relic already placed; ids left over when no anchor
 * is that far from the rest take a second pass at a relaxed spacing, and so on. Each final position
 * is nudged up to `SCATTER_JITTER` degrees off its anchor while staying on land.
 *
 * Every id gets a distinct on-land position spread across all continents, and the same salt always
 * yields the same map (one cached result: the panel calls this every render).
 */
export function scatterOverLand(
  ids: readonly string[],
  salt: string,
): ReadonlyMap<string, readonly [number, number]> {
  const key = `${salt}\u0000${ids.join(',')}`;
  if (scatterCache?.key === key) return scatterCache.map;

  const rand = mulberry32(hashId(salt) ^ 0x9e3779b9);
  const order = LAND_POINTS.map((p) => ({
    p,
    k: Math.pow(rand(), 1 / Math.max(0.05, Math.cos(p[1] * DEG))),
  }))
    .sort((a, b) => b.k - a.k)
    .map((e) => e.p);

  const taken: Array<readonly [number, number]> = [];
  const anchors = new Map<string, readonly [number, number]>();
  let pending = [...ids];
  let sep = SCATTER_START_SEPARATION;
  while (pending.length > 0 && sep > 0.5) {
    let next = 0;
    for (const p of order) {
      const id = pending[next];
      if (id === undefined) break;
      if (taken.some((t) => arcDegrees(t, p) < sep)) continue;
      taken.push(p);
      anchors.set(id, p);
      next += 1;
    }
    pending = pending.slice(next);
    sep *= SCATTER_RELAX;
  }
  // More ids than land anchors (never with the real catalog): the rest share hashed anchors.
  for (const id of pending) anchors.set(id, LAND_POINTS[hashId(id) % LAND_POINTS.length]!);

  const map = new Map<string, readonly [number, number]>();
  for (const id of ids) {
    const p = anchors.get(id);
    if (!p) continue;
    const lon = Math.round((p[0] + (rand() * 2 - 1) * SCATTER_JITTER) * 100) / 100;
    const lat = Math.round((p[1] + (rand() * 2 - 1) * SCATTER_JITTER) * 100) / 100;
    map.set(id, isLand(lon, lat) ? [lon, lat] : p);
  }
  scatterCache = { key, map };
  return map;
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
 * Resolve the globe position for a find, guaranteed on land: its `coord` (the integrator passes the
 * scatter's position; snapped to the nearest land anchor if it falls in the sea), or for a find
 * without one a deterministic land anchor from the id hash. Memoised per id and position, so the
 * per-frame pin loop stays cheap and a new lifetime's scatter is picked up.
 */
export function coordForFind(find: OrbisFind): readonly [number, number] {
  const key = find.coord ? `${find.id}@${find.coord[0]},${find.coord[1]}` : find.id;
  const cached = resolved.get(key);
  if (cached) return cached;
  const c = find.coord;
  const out = c
    ? isLand(c[0], c[1])
      ? c
      : nearestLand(c[0], c[1])
    : LAND_POINTS[hashId(find.id) % LAND_POINTS.length]!;
  resolved.set(key, out);
  return out;
}
