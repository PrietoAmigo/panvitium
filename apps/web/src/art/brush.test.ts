/**
 * The invocation plates' brush (Claude Design, "Invocation Plates" handoff), pinned against the
 * design's generator: the mulberry32 stream, the centreline sampling (a polyline for two points or
 * `lin`, else a Catmull-Rom spline through every control point), the bristle count, and the marks
 * one gesture lays down (one ochre, the bristle widths and opacities, the dry dashes, the splat
 * droplets, the dab), all deterministic in the seed.
 */
import { describe, it, expect } from 'vitest';
import {
  PAINT,
  brushMarkup,
  bristleCount,
  mulberry32,
  sampleCentreline,
  type Gesture,
  type Point,
} from './brush.js';

/** Every value of one attribute across the markup's elements of one tag. */
function attrs(markup: string, tag: string, name: string): string[] {
  const out: string[] = [];
  for (const el of markup.match(new RegExp(`<${tag} [^>]*>`, 'g')) ?? []) {
    const m = el.match(new RegExp(` ${name}="([^"]*)"`));
    if (m?.[1] !== undefined) out.push(m[1]);
  }
  return out;
}

const count = (markup: string, tag: string): number =>
  (markup.match(new RegExp(`<${tag} `, 'g')) ?? []).length;

describe('mulberry32', () => {
  it('yields the canonical mulberry32 stream for a seed', () => {
    const r = mulberry32(7);
    expect(r()).toBe(0.011704753153026104);
    expect(r()).toBe(0.06195825757458806);
    expect(r()).toBe(0.97690763277933);
  });

  it('takes the seed as an unsigned 32-bit integer', () => {
    expect(mulberry32(2 ** 32 + 7)()).toBe(mulberry32(7)());
  });

  it('stays in [0, 1)', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i += 1) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('sampleCentreline', () => {
  it('samples a two-point line evenly, one step per ~4 units, closing on its end', () => {
    const c = sampleCentreline([
      [0, 0],
      [40, 0],
    ]);
    expect(c).toHaveLength(11); // round(40 / 4) = 10 steps, then the end point
    expect(c[0]).toEqual([0, 0]);
    expect(c[5]).toEqual([20, 0]);
    expect(c[10]).toEqual([40, 0]);
  });

  it('takes at least 6 steps over a short span', () => {
    expect(
      sampleCentreline([
        [0, 0],
        [4, 0],
      ]),
    ).toHaveLength(7);
  });

  it('walks a `lin` polyline straight through every vertex', () => {
    const pts: Point[] = [
      [0, 0],
      [40, 0],
      [40, 40],
    ];
    const c = sampleCentreline(pts, true);
    expect(c).toHaveLength(21);
    expect(c[10]).toEqual([40, 0]);
    expect(c[15]).toEqual([40, 20]); // halfway down the second, straight segment
    expect(c[20]).toEqual([40, 40]);
  });

  it('runs a Catmull-Rom spline through every control point', () => {
    const pts: Point[] = [
      [0, 0],
      [48, 36],
      [96, 0],
    ];
    const c = sampleCentreline(pts);
    expect(c).toHaveLength(31); // 15 steps per 60-unit span, then the end point
    expect(c[0]).toEqual([0, 0]);
    expect(c[15]).toEqual([48, 36]);
    expect(c[30]).toEqual([96, 0]);
    // Between the points it bows off the straight chord (y = 0.75x along the first span).
    const [x, y] = c[7]!;
    expect(y).toBeGreaterThan(0.75 * x + 1);
  });
});

describe('bristleCount', () => {
  it('lays one bristle per 1.3 units of the ×1.55 drawn width, clamped to 4..48', () => {
    expect(bristleCount({ p: [], w: 26 })).toBe(31); // round(26 × 1.55 / 1.3)
    expect(bristleCount({ p: [], w: 2 })).toBe(4);
    expect(bristleCount({ p: [], w: 60 })).toBe(48);
  });

  it('takes an explicit count as given', () => {
    expect(bristleCount({ p: [], w: 5, n: 3 })).toBe(3);
  });
});

describe('brushMarkup', () => {
  const STROKE: Gesture = {
    p: [
      [60, 150],
      [150, 95],
      [240, 150],
    ],
    w: 20,
  };

  it('paints the same marks for the same seed, and others for another', () => {
    expect(brushMarkup(STROKE, mulberry32(9))).toBe(brushMarkup(STROKE, mulberry32(9)));
    expect(brushMarkup(STROKE, mulberry32(9))).not.toBe(brushMarkup(STROKE, mulberry32(10)));
  });

  it('lays a fan of round-capped bristles, at most one per bristle, in the one ochre', () => {
    const svg = brushMarkup(STROKE, mulberry32(3));
    const paths = count(svg, 'path');
    expect(paths).toBeGreaterThan(0);
    expect(paths).toBeLessThanOrEqual(bristleCount(STROKE));
    expect(new Set(attrs(svg, 'path', 'stroke'))).toEqual(new Set([PAINT]));
    expect(new Set(attrs(svg, 'path', 'fill'))).toEqual(new Set(['none']));
    expect(new Set(attrs(svg, 'path', 'stroke-linecap'))).toEqual(new Set(['round']));
  });

  it('gives each bristle an opacity of 0.5..1 and a width of 0.6..5.6', () => {
    // Nominal width 12, drawn 18.6: under the broad-brush threshold.
    const svg = brushMarkup({ ...STROKE, w: 12 }, mulberry32(4));
    for (const o of attrs(svg, 'path', 'opacity').map(Number)) {
      expect(o).toBeGreaterThanOrEqual(0.5);
      expect(o).toBeLessThanOrEqual(1);
    }
    for (const w of attrs(svg, 'path', 'stroke-width').map(Number)) {
      expect(w).toBeGreaterThanOrEqual(0.6);
      expect(w).toBeLessThanOrEqual(5.6);
    }
  });

  it('thickens the bristles of a broad brush (drawn wider than 25) by 1.3', () => {
    // Nominal width 20 is drawn 31 wide, so its bristles reach up to 0.6 + 5 × 1.3.
    const widths = attrs(brushMarkup(STROKE, mulberry32(5)), 'path', 'stroke-width').map(Number);
    expect(Math.max(...widths)).toBeGreaterThan(5.6);
    for (const w of widths) expect(w).toBeLessThanOrEqual(0.6 + 5 * 1.3);
  });

  it('breaks the bristles of a dry brush into dashes over a normalised length of 100', () => {
    const svg = brushMarkup({ ...STROKE, dry: 0.8 }, mulberry32(6));
    const dashed = attrs(svg, 'path', 'stroke-dasharray');
    expect(dashed.length).toBeGreaterThan(0);
    expect(attrs(svg, 'path', 'pathLength')).toEqual(dashed.map(() => '100'));
  });

  it('flicks `splat` droplets of radius 0.8..3.6 off the end of the stroke', () => {
    const svg = brushMarkup({ ...STROKE, splat: 4 }, mulberry32(8));
    expect(count(svg, 'circle')).toBe(4);
    for (const r of attrs(svg, 'circle', 'r').map(Number)) {
      expect(r).toBeGreaterThanOrEqual(0.8);
      expect(r).toBeLessThanOrEqual(3.6);
    }
    expect(new Set(attrs(svg, 'circle', 'fill'))).toEqual(new Set([PAINT]));
    expect(count(brushMarkup(STROKE, mulberry32(8)), 'circle')).toBe(0);
  });

  it('draws a counted fine line with at most `n` bristles', () => {
    const svg = brushMarkup({ p: STROKE.p, w: 5, n: 3 }, mulberry32(2));
    expect(count(svg, 'path')).toBeGreaterThan(0);
    expect(count(svg, 'path')).toBeLessThanOrEqual(3);
  });

  it('sets a dab as one solid ellipse, round unless given a second radius', () => {
    const rand = mulberry32(1);
    expect(brushMarkup({ dot: [142, 232, 6, 4] }, rand)).toBe(
      `<ellipse cx="142" cy="232" rx="6" ry="4" fill="${PAINT}" opacity="0.9"/>`,
    );
    // A dab draws nothing from the stream.
    expect(rand()).toBe(mulberry32(1)());
  });
});
