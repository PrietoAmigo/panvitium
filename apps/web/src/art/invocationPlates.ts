// The Ars Goetia invocation plates (Claude Design, "Invocation Plates" handoff, archived in
// docs/frontend/): one painted plate per invocation, a fast dry brush in yellow ochre on dark cave
// stone. This module lays a plate out as a standalone SVG, bottom to top: the base fill, the stone
// (fractal noise under a low raking light, one of three textures cycled by plate), a vignette, then
// the paint under a wobble displacement. The grimoire does not render it live: the bake
// (scripts/bake-invocation-plates.ts) rasterizes each plate once to a static PNG, so no browser runs
// the stone and wobble filters and every one shows the same plate (ADR-021).
import { brushMarkup, mulberry32 } from './brush.js';
import { INVOCATION_PLATES, PLATE_HEIGHT, PLATE_WIDTH } from './invocationPlates.data.js';

/** The bake's scale: 2× the design box, a 600 × 800 PNG. */
export const PLATE_SCALE = 2;

/** The invocation ids with a plate, in plate order. */
export const INVOCATION_PLATE_IDS: readonly string[] = INVOCATION_PLATES.map((p) => p.id);

/** The base fill under the stone. */
const BASE = '#17110d';
/** The vignette's shadow colour. */
const SHADOW = '#0b0706';

/** The three cave-stone textures, cycled by plate index. */
const STONES = [
  { frequency: '0.007 0.011', seed: 11, light: '#3a2e24', azimuth: 235, elevation: 48 },
  { frequency: '0.009 0.006', seed: 27, light: '#372b22', azimuth: 220, elevation: 50 },
  { frequency: '0.006 0.01', seed: 63, light: '#3d3026', azimuth: 250, elevation: 46 },
] as const;

/** The seed of a plate's `markIndex`-th mark: each mark draws from its own stream. */
export function plateSeed(plateIndex: number, markIndex: number): number {
  return plateIndex * 997 + markIndex * 31 + 7;
}

/** The paint of one plate: every mark in order, each brushed from its own seeded stream. */
function plateArt(plateIndex: number): string {
  const plate = INVOCATION_PLATES[plateIndex]!;
  return plate.marks
    .map((mark, i) => brushMarkup(mark, mulberry32(plateSeed(plateIndex, i))))
    .join('');
}

/** The plate for invocation `id` as a standalone SVG document (600 × 800), or undefined if it has
 *  none. */
export function invocationPlateSvg(id: string): string | undefined {
  const index = INVOCATION_PLATE_IDS.indexOf(id);
  if (index < 0) return undefined;
  const stone = STONES[index % STONES.length]!;
  const box = `width="${PLATE_WIDTH}" height="${PLATE_HEIGHT}"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLATE_WIDTH} ${PLATE_HEIGHT}"` +
    ` width="${PLATE_WIDTH * PLATE_SCALE}" height="${PLATE_HEIGHT * PLATE_SCALE}">` +
    '<defs>' +
    '<filter id="wobble" x="-10%" y="-10%" width="120%" height="120%">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="5" result="w"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="w" scale="6" xChannelSelector="R" yChannelSelector="G"/>' +
    '</filter>' +
    '<filter id="stone" x="0" y="0" width="100%" height="100%">' +
    `<feTurbulence type="fractalNoise" baseFrequency="${stone.frequency}" numOctaves="5" seed="${stone.seed}"/>` +
    `<feDiffuseLighting lighting-color="${stone.light}" surfaceScale="3.5">` +
    `<feDistantLight azimuth="${stone.azimuth}" elevation="${stone.elevation}"/>` +
    '</feDiffuseLighting>' +
    '</filter>' +
    '<radialGradient id="vignette" cx="45%" cy="40%" r="75%">' +
    `<stop offset="0.4" stop-color="${SHADOW}" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="${SHADOW}" stop-opacity="0.85"/>` +
    '</radialGradient>' +
    '</defs>' +
    `<rect ${box} fill="${BASE}"/>` +
    `<rect ${box} filter="url(#stone)"/>` +
    `<rect ${box} fill="url(#vignette)"/>` +
    `<g filter="url(#wobble)"><g>${plateArt(index)}</g></g>` +
    '</svg>'
  );
}

/**
 * The text a plate's bake digest is taken over (scripts/bake-invocation-plates.ts): its SVG with
 * every full-precision number cut to 3 decimals. Only the splat droplets' centres carry full
 * precision, and a platform's last-bit difference in `Math.cos` must not read as a stale bake.
 */
export function plateFingerprint(svg: string): string {
  return svg.replace(/\d+\.\d{4,}/g, (n) => Number(n).toFixed(3));
}
