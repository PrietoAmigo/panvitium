// The Loculi pixel-art pipeline (Claude Design, "Loculi Reliquary" handoff): the same principle as
// the Influence vessel (a low-res canvas upscaled nearest-neighbour), applied per relic with a fixed
// art-pixel size so every maleficium reads at one chunkiness, plus the dithered pixel light (the
// rarity halo, the floor glow, the Unveiling's rays). Framework-free: the React wrappers live in
// PixelRelic.tsx. The per-pixel rules are pure functions over RGBA buffers so they are testable
// without a real 2D context (jsdom has none).
import type { Rgb } from './relics.js';

/** 4×4 ordered-dither (Bayer) thresholds, 0..15; `BAYER4[(y & 3) * 4 + (x & 3)] / 16` per pixel. */
export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Alpha below this becomes fully transparent, at or above it fully opaque (hard pixel edges). */
export const ALPHA_CUTOFF = 110;
/** Colour crush: each RGB channel is rounded to a multiple of this. */
export const CRUSH_STEP = 26;
/** Alpha of the one-pixel rarity outline. */
export const OUTLINE_ALPHA = 210;
/** The Unveiling's coarse-to-fine grid steps (art pixels on the long side), before full resolution. */
export const REVEAL_STEPS: readonly number[] = [3, 5, 8, 12, 18, 26, 38, 54, 76];

/** Options for pixelating one relic. */
export interface RelicPixelOptions {
  /** Draw the one-pixel rarity outline around the silhouette. */
  readonly outline: boolean;
  /** Crush each colour channel to multiples of `CRUSH_STEP`. */
  readonly crush: boolean;
  /** The outline colour (the rarity ember). */
  readonly rgb: Rgb;
}

/** Art pixels on the long side for a relic drawn `longSide` design-px long at `pixelSize` px. */
export function relicGrid(longSide: number, pixelSize: number): number {
  return Math.max(8, Math.round(longSide / pixelSize));
}

/** The reveal's grid sequence for a relic whose full resolution is `full`: the coarse steps below it,
 *  then full. */
export function revealGrids(full: number): number[] {
  return [...REVEAL_STEPS.filter((g) => g < full), full];
}

/**
 * Harden one downscaled relic in place: alpha thresholded at `ALPHA_CUTOFF` (below → 0, else 255),
 * each opaque pixel's colour crushed to multiples of `CRUSH_STEP` (when `crush`), then every
 * transparent pixel 4-adjacent to an opaque one painted as the rarity outline at `OUTLINE_ALPHA`
 * (when `outline`).
 */
export function hardenRelicPixels(
  d: Uint8ClampedArray,
  width: number,
  height: number,
  o: RelicPixelOptions,
): void {
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i + 3] ?? 0) < ALPHA_CUTOFF) {
      d[i + 3] = 0;
      continue;
    }
    d[i + 3] = 255;
    if (o.crush) {
      for (let k = 0; k < 3; k += 1) {
        d[i + k] = Math.min(255, Math.round((d[i + k] ?? 0) / CRUSH_STEP) * CRUSH_STEP);
      }
    }
  }
  if (!o.outline) return;
  const opaque = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p += 1) opaque[p] = (d[p * 4 + 3] ?? 0) > 0 ? 1 : 0;
  const [r, g, b] = o.rgb;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (opaque[p]) continue;
      const touches =
        (x > 0 && opaque[p - 1] === 1) ||
        (x < width - 1 && opaque[p + 1] === 1) ||
        (y > 0 && opaque[p - width] === 1) ||
        (y < height - 1 && opaque[p + width] === 1);
      if (!touches) continue;
      d[p * 4] = r;
      d[p * 4 + 1] = g;
      d[p * 4 + 2] = b;
      d[p * 4 + 3] = OUTLINE_ALPHA;
    }
  }
}

/** Quantize a 0..1 intensity to one of `levels` alpha steps, ordered-dithered by pixel position. */
export function ditherLevel(a: number, x: number, y: number, levels: number): number {
  const threshold = (BAYER4[(y & 3) * 4 + (x & 3)] ?? 0) / 16;
  return Math.min(levels, Math.floor(a * levels + threshold)) / levels;
}

/** Alpha levels of the radial glows (halo and floor). */
export const GLOW_LEVELS = 5;

/**
 * Paint a radial pixel glow into an RGBA buffer: intensity `max(0, 1 − d)^power × amp` from the
 * centre (d = normalised elliptical distance to the edge), dithered to `GLOW_LEVELS` alpha steps and
 * scaled to `maxAlpha`.
 */
export function paintGlow(
  d: Uint8ClampedArray,
  width: number,
  height: number,
  rgb: Rgb,
  maxAlpha: number,
  power: number,
  amp: number,
): void {
  const [r, g, b] = rgb;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = ((x + 0.5) / width) * 2 - 1;
      const dy = ((y + 0.5) / height) * 2 - 1;
      const a = Math.pow(Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)), power) * amp;
      const i = (y * width + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = ditherLevel(a, x, y, GLOW_LEVELS) * maxAlpha * 255;
    }
  }
}

/** Alpha levels and ceiling of the Unveiling's rays. */
export const RAY_LEVELS = 6;
export const RAY_MAX_ALPHA = 0.55;
/** Seconds the rays take to swell in. */
export const RAY_SWELL_SECONDS = 1.2;

/**
 * Paint the Unveiling's light shafts into an RGBA buffer at time `t` (seconds): two rotating angular
 * sine bands inside a ±0.75 rad cone falling from above the top centre, with distance falloff, plus
 * a soft core glow behind the relic; all scaled by `swell` (0..1) and dithered to `RAY_LEVELS`.
 */
export function paintRays(
  d: Uint8ClampedArray,
  width: number,
  height: number,
  rgb: Rgb,
  t: number,
  swell: number,
): void {
  const [r, g, b] = rgb;
  const ox = width / 2;
  const oy = -height * 0.28;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - ox;
      const dy = y - oy;
      const ang = Math.atan2(dx, dy);
      const rr = Math.sqrt(dx * dx + dy * dy) / height;
      const ray =
        Math.pow(Math.max(0, Math.sin(ang * 11 + t * 0.22)), 6) * 0.6 +
        Math.pow(Math.max(0, Math.sin(ang * 6 - t * 0.15 + 1.3)), 10) * 0.5;
      const cone = Math.max(0, 1 - Math.abs(ang) / 0.75);
      const fall = Math.max(0, 1 - rr / 1.35);
      const cy = (y - height * 0.34) * 1.5;
      const core =
        Math.pow(Math.max(0, 1 - Math.sqrt(dx * dx + cy * cy) / (height * 0.55)), 2) * 0.35;
      const a = (ray * cone * fall * 0.55 + core) * swell;
      const i = (y * width + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = ditherLevel(a, x, y, RAY_LEVELS) * RAY_MAX_ALPHA * 255;
    }
  }
}

// ── Image loading + the per-relic pixelation (DOM canvas) ───────────────────────────────────────

const images = new Map<string, Promise<HTMLImageElement | null>>();

/** Load (once) and decode an image; resolves null when it cannot be loaded. */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    images.set(src, p);
  }
  return p;
}

const pixelated = new Map<string, HTMLCanvasElement | null>();

/**
 * Pixelate a relic to `grid` art pixels on its long side (aspect kept): downscale by repeated halving
 * (quality), one smoothed draw to the target size (+1px padding for the outline), then
 * `hardenRelicPixels`. Cached per (src, grid, options). Returns null without a 2D context.
 */
export function pixelateRelic(
  src: string,
  img: HTMLImageElement,
  grid: number,
  o: RelicPixelOptions,
): HTMLCanvasElement | null {
  const key = `${src}|${grid}|${o.outline ? 1 : 0}${o.crush ? 1 : 0}|${o.rgb.join(',')}`;
  if (pixelated.has(key)) return pixelated.get(key) ?? null;
  const out = drawPixelated(img, grid, o);
  pixelated.set(key, out);
  return out;
}

function drawPixelated(
  img: HTMLImageElement,
  grid: number,
  o: RelicPixelOptions,
): HTMLCanvasElement | null {
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const s = Math.max(1, grid) / Math.max(iw, ih);
  const w = Math.max(1, Math.round(iw * s));
  const h = Math.max(1, Math.round(ih * s));
  const pad = o.outline ? 1 : 0;
  let source: CanvasImageSource = img;
  let sw = iw;
  let sh = ih;
  while (sw / 2 > w * 1.5) {
    const half = document.createElement('canvas');
    half.width = Math.max(1, Math.round(sw / 2));
    half.height = Math.max(1, Math.round(sh / 2));
    const hx = half.getContext('2d');
    if (!hx) return null;
    hx.imageSmoothingQuality = 'high';
    hx.drawImage(source, 0, 0, half.width, half.height);
    source = half;
    sw = half.width;
    sh = half.height;
  }
  const c = document.createElement('canvas');
  c.width = w + pad * 2;
  c.height = h + pad * 2;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) return null;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(source, pad, pad, w, h);
  const data = x.getImageData(0, 0, c.width, c.height);
  hardenRelicPixels(data.data, c.width, c.height, o);
  x.putImageData(data, 0, 0);
  return c;
}
