/**
 * The Counting House pixel dress (Claude Design, "Depraedatio Pixel Rework"): the balance sparkline
 * redrawn on the 3 px art grid (every cell on the grid and inside the padded plot, one unbroken
 * stepped line, the dithered wash only beneath it and thinning toward the floor), the 5 × 5 glyph
 * paths staying inside their grid, and the accent bevel tones.
 */
import { describe, it, expect } from 'vitest';
import {
  CH_ART_PX,
  CH_DELTA_UP,
  CH_ICONS,
  mixHex,
  pixelSparkline,
  SPARK_WASH_DENSITY,
} from './depraedatioPixel.js';

/** The [x, y] origins (CSS px) of every `M{x} {y}h…z` cell in a path. */
function cells(path: string): [number, number][] {
  return Array.from(path.matchAll(/M(\d+) (\d+)h/g), (m) => [Number(m[1]), Number(m[2])]);
}

/** The cells of a path keyed by art-pixel column, each column's rows sorted. */
function byColumn(path: string, px: number): Map<number, number[]> {
  const cols = new Map<number, number[]>();
  for (const [x, y] of cells(path)) {
    const c = x / px;
    cols.set(
      c,
      [...(cols.get(c) ?? []), y / px].sort((a, b) => a - b),
    );
  }
  return cols;
}

const SERIES = [
  2010, 2035, 2028, 2062, 2090, 2075, 2110, 2150, 2138, 2172, 2205, 2190, 2240, 2268, 2255, 2300,
  2330, 2318, 2360, 2402, 2388, 2430, 2465, 2486,
];

describe('pixelSparkline', () => {
  const W = 264;
  const H = 66;
  const PAD = 2;
  const gw = W / CH_ART_PX; // 88
  const gh = H / CH_ART_PX; // 22
  const { line, area } = pixelSparkline(SERIES, W, H);

  it('draws every cell on the 3 px grid and inside the padded plot', () => {
    for (const [x, y] of [...cells(line), ...cells(area)]) {
      expect(x % CH_ART_PX).toBe(0);
      expect(y % CH_ART_PX).toBe(0);
      expect(x / CH_ART_PX).toBeGreaterThanOrEqual(PAD);
      expect(x / CH_ART_PX).toBeLessThan(gw - PAD);
      expect(y / CH_ART_PX).toBeGreaterThanOrEqual(PAD);
      expect(y / CH_ART_PX).toBeLessThan(gh - PAD);
    }
  });

  it('puts an unbroken run of line pixels in every plot column', () => {
    const cols = byColumn(line, CH_ART_PX);
    expect(cols.size).toBe(gw - 2 * PAD);
    for (const rows of cols.values()) {
      for (let i = 1; i < rows.length; i++) expect(rows[i]).toBe((rows[i - 1] ?? 0) + 1);
    }
  });

  it('joins neighbouring columns so the line never breaks', () => {
    const cols = byColumn(line, CH_ART_PX);
    for (let c = PAD + 1; c < gw - PAD; c++) {
      const a = cols.get(c - 1) ?? [];
      const b = cols.get(c) ?? [];
      // Two runs in adjacent columns touch when their row spans overlap or meet.
      const touch =
        (b[0] ?? 0) <= (a[a.length - 1] ?? 0) + 1 && (a[0] ?? 0) <= (b[b.length - 1] ?? 0) + 1;
      expect(touch).toBe(true);
    }
  });

  it('runs from the floor at the first (lowest) point to the ceiling at the last (highest)', () => {
    const cols = byColumn(line, CH_ART_PX);
    expect(cols.get(PAD)).toEqual([gh - PAD - 1]);
    expect(cols.get(gw - PAD - 1)?.[0]).toBe(PAD);
  });

  it('dithers the wash only beneath the line, densest near the top', () => {
    const lineCols = byColumn(line, CH_ART_PX);
    for (const [x, y] of cells(area)) {
      const rows = lineCols.get(x / CH_ART_PX) ?? [];
      expect(y / CH_ART_PX).toBeGreaterThan(Math.min(...rows));
    }
    const ys = cells(area).map(([, y]) => y / CH_ART_PX);
    const upper = ys.filter((y) => y < gh / 2).length;
    const lower = ys.filter((y) => y >= gh / 2).length;
    expect(area.length).toBeGreaterThan(0);
    expect(upper).toBeGreaterThan(lower);
    // Nothing on the floor row: the wash has faded out by then.
    expect(ys).not.toContain(gh - PAD - 1);
    expect(SPARK_WASH_DENSITY).toBeLessThanOrEqual(0.5);
  });

  it('draws nothing for a series of fewer than two points or a box too small to plot', () => {
    expect(pixelSparkline([5], W, H)).toEqual({ line: '', area: '' });
    expect(pixelSparkline(SERIES, 12, 12)).toEqual({ line: '', area: '' });
  });

  it('draws a flat series as one straight row', () => {
    const flat = pixelSparkline([7, 7, 7], W, H);
    const rows = new Set(cells(flat.line).map(([, y]) => y));
    expect(rows.size).toBe(1);
  });
});

describe('the pixel glyphs', () => {
  it('keeps every 5 × 5 icon cell inside its grid', () => {
    for (const path of Object.values(CH_ICONS)) {
      for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)/g)) {
        const [x, y, w, h] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
        expect(x + w).toBeLessThanOrEqual(5);
        expect(y + h).toBeLessThanOrEqual(5);
      }
    }
  });

  it('gives the two privacy states different marks', () => {
    expect(CH_ICONS.privacyOn).not.toBe(CH_ICONS.privacyOff);
  });

  it('keeps the delta mark inside its 3 × 2 grid', () => {
    for (const m of CH_DELTA_UP.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)/g)) {
      expect(Number(m[1]) + Number(m[3])).toBeLessThanOrEqual(3);
      expect(Number(m[2]) + Number(m[4])).toBeLessThanOrEqual(2);
    }
  });
});

describe('mixHex', () => {
  it('derives the Pine bevel tones', () => {
    expect(mixHex('#1E4638', '#ffffff', 0.14)).toBe('#3e6054');
    expect(mixHex('#1E4638', '#000000', 0.3)).toBe('#153127');
  });

  it('returns either end at t = 0 and t = 1, clamping beyond', () => {
    expect(mixHex('#1b3a5b', '#ffffff', 0)).toBe('#1b3a5b');
    expect(mixHex('#1b3a5b', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#1b3a5b', '#ffffff', 2)).toBe('#ffffff');
  });

  it('leaves a malformed colour unchanged', () => {
    expect(mixHex('teal', '#ffffff', 0.5)).toBe('teal');
    expect(mixHex('#5E2233', 'nope', 0.5)).toBe('#5E2233');
  });
});
