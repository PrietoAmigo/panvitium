/**
 * The Orbis Tenebrarum pixel globe's framework-free rules (orbis.pixel.ts): the land mask agrees
 * with the coastline test, the per-size tables cover the disc, a frame paints land where land faces
 * the viewer and sea where it does not, and the marks drawn on top land on whole art pixels. All
 * pure array work, so no 2D context is needed.
 */
import { describe, it, expect } from 'vitest';
import {
  ARROWS,
  ART_PX,
  GLOBE_MAX_N,
  GLOBE_MIN_N,
  buildGlobeTables,
  drawArrow,
  drawBrackets,
  drawPin,
  globeSideFor,
  landAt,
  octantOf,
  renderGlobe,
  rgba32,
  shadeHex,
  type PixelPen,
} from './orbis.pixel.js';
import { isLand, LAND_POINTS } from './orbis.land.js';

/** A pen that records every art pixel it fills. */
function recorder(): PixelPen & { pixels: Map<string, string> } {
  const pixels = new Map<string, string>();
  return {
    pixels,
    fillStyle: '#000000',
    fillRect(x: number, y: number, w: number, h: number) {
      for (let j = 0; j < h; j += 1) {
        for (let i = 0; i < w; i += 1) pixels.set(`${x + i},${y + j}`, String(this.fillStyle));
      }
    },
  };
}

describe('land mask', () => {
  it('agrees with the coastline test on the land anchors and on open sea', () => {
    let agree = 0;
    for (const [lon, lat] of LAND_POINTS) if (landAt(lon, lat)) agree += 1;
    // The 0.5° mask may differ from the exact test only on a coastline cell or two.
    expect(agree / LAND_POINTS.length).toBeGreaterThan(0.97);
    for (const [lon, lat] of [
      [-150, 0],
      [-30, -30],
      [70, -20],
      [160, 30],
    ] as const) {
      expect(isLand(lon, lat)).toBe(false);
      expect(landAt(lon, lat)).toBe(false);
    }
  });

  it('wraps longitude, so the antimeridian reads the same from either side', () => {
    expect(landAt(170, 65)).toBe(landAt(170 - 360, 65));
    expect(landAt(-175, 66)).toBe(landAt(185, 66));
  });
});

describe('globe sizing and tables', () => {
  it('keeps the art pixel at three CSS px and bounds the side', () => {
    expect(ART_PX).toBe(3);
    expect(globeSideFor(444, 600)).toBe(148);
    expect(globeSideFor(381, 470)).toBe(127);
    expect(globeSideFor(100, 100)).toBe(GLOBE_MIN_N);
    expect(globeSideFor(2000, 2000)).toBe(GLOBE_MAX_N);
  });

  it('covers the disc and rings it with the rim', () => {
    const t = buildGlobeTables(120);
    const area = Math.PI * t.R * t.R;
    expect(t.disc.length).toBeGreaterThan(area * 0.97);
    expect(t.disc.length).toBeLessThan(area * 1.03);
    expect(t.base.some((w) => w === rgba32('#8a7438'))).toBe(true);
    // The rim and atmosphere sit outside the disc only.
    for (const i of t.disc) expect(t.base[i]).toBe(0);
  });
});

describe('renderGlobe', () => {
  it('paints land facing the viewer over Africa, and sea over the Pacific', () => {
    const t = buildGlobeTables(100);
    const out = new Uint32Array(100 * 100);
    const land = new Uint8Array(100 * 100);
    const centre = 50 * 100 + 50;

    renderGlobe(t, 20, 5, out, land); // central Africa
    expect(land[centre]).toBe(1);
    const landShare = t.disc.reduce((n, i) => n + (land[i] ?? 0), 0) / t.disc.length;
    expect(landShare).toBeGreaterThan(0.3);

    land.fill(0);
    renderGlobe(t, -150, 0, out, land); // the open Pacific
    expect(land[centre]).toBe(0);
    // Every disc pixel is painted opaque; the corners stay transparent.
    for (const i of t.disc) expect(out[i]! >>> 24).toBe(255);
    expect(out[0]).toBe(0);
  });

  it('turns the rim teal and draws a sweep while a Search runs', () => {
    const t = buildGlobeTables(100);
    const quiet = new Uint32Array(100 * 100);
    const busy = new Uint32Array(100 * 100);
    renderGlobe(t, 20, 5, quiet, new Uint8Array(100 * 100));
    renderGlobe(t, 20, 5, busy, new Uint8Array(100 * 100), { pulse: 0.5, sweepX: 50 });
    const band = t.band[0]!;
    expect(busy[band]).not.toBe(quiet[band]);
    expect(busy[50 * 100 + 50]).not.toBe(quiet[50 * 100 + 50]);
  });
});

describe('marks', () => {
  it('draws a pin as a 3×3 gem in a one-pixel outline', () => {
    const pen = recorder();
    drawPin(pen, 10, 10, '#56b3a3');
    expect(pen.pixels.size).toBe(25);
    expect(pen.pixels.get('8,8')).toBe('#050a0c');
    expect(pen.pixels.get('9,9')).toBe('#56b3a3');
    expect(pen.pixels.get('11,11')).toBe(shadeHex('#56b3a3', 0.62));
  });

  it('brackets a selection at its four corners, leaving the pin itself clear', () => {
    const pen = recorder();
    drawBrackets(pen, 20, 20, '#d05a4d');
    expect(pen.pixels.has('15,15')).toBe(true);
    expect(pen.pixels.has('25,25')).toBe(true);
    expect(pen.pixels.has('20,20')).toBe(false);
    expect(pen.pixels.has('20,15')).toBe(false);
  });

  it('points an arrowhead each of the eight ways', () => {
    expect(ARROWS.map((a) => `${a.w}x${a.h}`)).toEqual([
      '4x7',
      '4x4',
      '7x4',
      '4x4',
      '4x7',
      '4x4',
      '7x4',
      '4x4',
    ]);
    expect(octantOf(1, 0)).toBe(0);
    expect(octantOf(0, 1)).toBe(2);
    expect(octantOf(-1, 0)).toBe(4);
    expect(octantOf(0, -1)).toBe(6);
    expect(octantOf(1, -1)).toBe(7);
    // The east arrow's tip is its rightmost pixel, on the middle row.
    const pen = recorder();
    drawArrow(pen, 30, 30, 0, '#b6a884');
    const xs = [...pen.pixels.keys()].map((k) => Number(k.split(',')[0]));
    expect(pen.pixels.get(`${Math.max(...xs)},30`)).toBe('#b6a884');
  });
});
