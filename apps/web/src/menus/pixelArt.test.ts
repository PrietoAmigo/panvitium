/**
 * The Loculi pixel-art rules (Claude Design, "Loculi Reliquary"), pinned on raw RGBA buffers since
 * jsdom has no 2D context: the relic hardening (alpha cut at 110, colour crush to multiples of 26,
 * the one-pixel rarity outline at alpha 210), the grid sizes and the reveal steps, the Bayer-dithered
 * quantization, and the glow / ray painters' bounds.
 */
import { describe, it, expect } from 'vitest';
import {
  ALPHA_CUTOFF,
  ditherLevel,
  hardenRelicPixels,
  OUTLINE_ALPHA,
  paintGlow,
  paintRays,
  RAY_MAX_ALPHA,
  relicGrid,
  revealGrids,
} from './pixelArt.js';

const EMBER = [194, 64, 63] as const;

/** A w×h RGBA buffer, all transparent black. */
function buffer(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

function setPixel(d: Uint8ClampedArray, w: number, x: number, y: number, rgba: number[]): void {
  d.set(rgba, (y * w + x) * 4);
}

function pixel(d: Uint8ClampedArray, w: number, x: number, y: number): number[] {
  const i = (y * w + x) * 4;
  return Array.from(d.slice(i, i + 4));
}

describe('hardenRelicPixels', () => {
  it('cuts alpha hard at the threshold: below → transparent, at or above → opaque', () => {
    const d = buffer(2, 1);
    setPixel(d, 2, 0, 0, [10, 10, 10, ALPHA_CUTOFF - 1]);
    setPixel(d, 2, 1, 0, [10, 10, 10, ALPHA_CUTOFF]);
    hardenRelicPixels(d, 2, 1, { outline: false, crush: false, rgb: EMBER });
    expect(pixel(d, 2, 0, 0)[3]).toBe(0);
    expect(pixel(d, 2, 1, 0)).toEqual([10, 10, 10, 255]);
  });

  it('crushes each colour channel to multiples of 26 (clamped to 255)', () => {
    const d = buffer(1, 1);
    setPixel(d, 1, 0, 0, [100, 12, 250, 255]);
    hardenRelicPixels(d, 1, 1, { outline: false, crush: true, rgb: EMBER });
    expect(pixel(d, 1, 0, 0)).toEqual([104, 0, 255, 255]);
  });

  it('rings the silhouette with a 4-adjacent rarity outline, leaving diagonals clear', () => {
    const d = buffer(3, 3);
    setPixel(d, 3, 1, 1, [200, 200, 200, 255]);
    hardenRelicPixels(d, 3, 3, { outline: true, crush: false, rgb: EMBER });
    for (const [x, y] of [
      [1, 0],
      [0, 1],
      [2, 1],
      [1, 2],
    ] as const) {
      expect(pixel(d, 3, x, y)).toEqual([...EMBER, OUTLINE_ALPHA]);
    }
    for (const [x, y] of [
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
    ] as const) {
      expect(pixel(d, 3, x, y)[3]).toBe(0);
    }
    expect(pixel(d, 3, 1, 1)).toEqual([200, 200, 200, 255]);
  });

  it('draws no outline when asked not to', () => {
    const d = buffer(3, 1);
    setPixel(d, 3, 1, 0, [200, 200, 200, 255]);
    hardenRelicPixels(d, 3, 1, { outline: false, crush: false, rgb: EMBER });
    expect(pixel(d, 3, 0, 0)[3]).toBe(0);
    expect(pixel(d, 3, 2, 0)[3]).toBe(0);
  });
});

describe('grid sizes and the reveal steps', () => {
  it('sizes a relic by its long side over the art-pixel size (3 px)', () => {
    expect(relicGrid(380, 3)).toBe(127); // the reliquary's hero
    expect(relicGrid(400, 3)).toBe(133); // the Unveiling's relic
    expect(relicGrid(58, 3)).toBe(19); // a procession sprite
  });

  it('resolves through the coarse steps below full resolution, then full', () => {
    expect(revealGrids(133)).toEqual([3, 5, 8, 12, 18, 26, 38, 54, 76, 133]);
    expect(revealGrids(19)).toEqual([3, 5, 8, 12, 18, 19]);
  });
});

describe('ditherLevel', () => {
  it('maps the extremes to the extremes', () => {
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        expect(ditherLevel(0, x, y, 5)).toBe(0);
        expect(ditherLevel(1, x, y, 5)).toBe(1);
      }
    }
  });

  it('dithers an in-between intensity across the 4×4 cell, never past the ceiling', () => {
    const levels = new Set<number>();
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) levels.add(ditherLevel(0.5, x, y, 5));
    }
    expect([...levels].sort()).toEqual([0.4, 0.6]);
    expect(ditherLevel(1.3, 0, 0, 5)).toBe(1);
  });
});

describe('paintGlow', () => {
  it('is brightest at the centre, dark at the corners, in the rarity colour', () => {
    const w = 21;
    const h = 21;
    const d = buffer(w, h);
    paintGlow(d, w, h, EMBER, 0.5, 1.7, 1);
    // Full intensity at the centre → the top level × maxAlpha (as the clamped buffer stores it).
    expect(pixel(d, w, 10, 10)).toEqual([...EMBER, Uint8ClampedArray.of(0.5 * 255)[0]]);
    expect(pixel(d, w, 0, 0)).toEqual([...EMBER, 0]);
  });
});

describe('paintRays', () => {
  it('is dark before it swells, and never brighter than its ceiling once it has', () => {
    const w = 64;
    const h = 36;
    const dark = buffer(w, h);
    paintRays(dark, w, h, EMBER, 0, 0);
    expect(dark.filter((_, i) => i % 4 === 3).every((a) => a === 0)).toBe(true);

    const lit = buffer(w, h);
    paintRays(lit, w, h, EMBER, 2, 1);
    const alphas = lit.filter((_, i) => i % 4 === 3);
    expect(Math.max(...alphas)).toBeGreaterThan(0);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(Math.ceil(RAY_MAX_ALPHA * 255));
  });
});
