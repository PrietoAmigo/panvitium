// The cave-painting brush of the Ars Goetia invocation plates (Claude Design, "Invocation Plates"
// handoff, archived in docs/frontend/). A gesture is a centreline and a brush width; the brush lays it
// down as a fan of dry bristle strokes in one yellow ochre, every random choice drawn from a seeded
// mulberry32, so the same gesture and seed always paint the same marks. Presentation only and
// framework-free (the sim never sees it): it emits SVG markup, which the plate bake rasterizes into
// the PNGs the grimoire shows (scripts/bake-invocation-plates.ts). The arithmetic and the order of
// the random draws follow the design's generator exactly, so a bake repaints the designed plates
// stroke for stroke.

/** The only paint colour. */
export const PAINT = '#d9a53f';

export type Point = readonly [x: number, y: number];

/** One stroke of the brush along a centreline. */
export interface Gesture {
  /** The centreline's control points: a Catmull-Rom spline through them (a polyline when `lin`). */
  readonly p: readonly Point[];
  /** The brush width in plate units (drawn ×1.55 unless `n` is set). */
  readonly w: number;
  /** Dryness, 0..1 (default 0.3): shorter, more broken bristles. */
  readonly dry?: number;
  /** Droplets flicked off the stroke's end. */
  readonly splat?: number;
  /** Straight segments between the points instead of a spline. */
  readonly lin?: boolean;
  /** An explicit bristle count, for fine lines (the width is then taken as given). */
  readonly n?: number;
}

/** A solid dab of paint (an ellipse): eyes, nuggets, drops. */
export interface Dab {
  readonly dot: readonly [x: number, y: number, rx: number, ry: number];
}

export type Mark = Gesture | Dab;

/** mulberry32: a seeded 32-bit PRNG yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Samples a centreline about every 4 units, each span in at least 6 steps: a Catmull-Rom spline
 * through the points, or straight segments for a two-point line or a `lin` polyline. The last point
 * closes the run.
 */
export function sampleCentreline(pts: readonly Point[], lin = false): Point[] {
  const out: Point[] = [];
  const n = pts.length;
  if (n === 2 || lin) {
    for (let i = 0; i < n - 1; i += 1) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const steps = Math.max(6, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
      for (let k = 0; k < steps; k += 1) {
        const t = k / steps;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    out.push(pts[n - 1]!);
    return out;
  }
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = pts[Math.max(i - 1, 0)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(i + 2, n - 1)]!;
    const steps = Math.max(6, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 4));
    for (let k = 0; k < steps; k += 1) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (j: 0 | 1): number =>
        0.5 *
        (2 * p1[j] +
          (-p0[j] + p2[j]) * t +
          (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 +
          (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(pts[n - 1]!);
  return out;
}

/** The bristle count for a gesture: `n` when given, else one per 1.3 units of drawn width, 4..48. */
export function bristleCount(g: Gesture): number {
  return g.n ?? Math.max(4, Math.min(48, Math.round(brushWidth(g) / 1.3)));
}

/** The drawn width of a gesture: ×1.55 its nominal width, unless its bristles are counted (`n`). */
function brushWidth(g: Gesture): number {
  return g.w * (g.n ? 1 : 1.55);
}

/**
 * Paints one mark as SVG markup, drawing every random choice from `rand`. A dab is one solid
 * ellipse. A gesture is a fan of bristles across the brush (`u` from −1 to 1): each is offset from
 * the centreline by `u·w/2` (±6% jitter, narrowing 30% along the stroke) and drifts quadratically
 * (±37.5%·w by the tail), is trimmed at both ends (the edges and a dry brush more), gets a random
 * width and opacity, and, dry or at the brush's edge, breaks into dashes. `splat` droplets land
 * around the stroke's end.
 */
export function brushMarkup(mark: Mark, rand: () => number): string {
  if ('dot' in mark) {
    const [x, y, rx, ry] = mark.dot;
    return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${PAINT}" opacity="0.9"/>`;
  }
  const { p, dry: dry0 = 0.3, splat = 0, lin = false } = mark;
  const w = brushWidth(mark);
  const dry = Math.min(0.95, dry0 + 0.15);
  const c = sampleCentreline(p, lin);
  const m = c.length;
  // Arc length along the samples, so a bristle's trims fall at fractions of the whole stroke.
  const L = [0];
  for (let i = 1; i < m; i += 1) {
    const a = c[i - 1]!;
    const b = c[i]!;
    L.push(L[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = L[m - 1] || 1;
  // The unit normal at each sample, from its neighbours.
  const nrm = c.map((_, i): Point => {
    const a = c[Math.max(i - 1, 0)]!;
    const b = c[Math.min(i + 1, m - 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
  const N = bristleCount(mark);
  let out = '';
  for (let b = 0; b < N; b += 1) {
    const u = N === 1 ? 0 : (b / (N - 1)) * 2 - 1;
    const e = Math.abs(u);
    const off = (u * w) / 2 + (rand() - 0.5) * w * 0.12;
    const drift = (rand() - 0.5) * w * 0.75;
    const t0 = rand() * 0.06 + e * e * rand() * 0.22;
    const t1 = 1 - (rand() * 0.1 + e * rand() * 0.32 + rand() * dry * 0.35);
    let d = '';
    for (let i = 0; i < m; i += 1) {
      const t = L[i]! / total;
      if (t < t0 || t > t1) continue;
      const o = off * (1 - 0.3 * t) + drift * t * t;
      const pt = c[i]!;
      const nm = nrm[i]!;
      d += (d ? 'L' : 'M') + (pt[0] + nm[0] * o).toFixed(1) + ' ' + (pt[1] + nm[1] * o).toFixed(1);
    }
    // A bristle trimmed away entirely lays no paint and draws nothing more.
    if (!d) continue;
    const width = (0.6 + rand() * rand() * 5 * (w > 25 ? 1.3 : 1)).toFixed(2);
    const opacity = (0.5 + rand() * 0.5).toFixed(2);
    let dash = '';
    if (rand() < dry + e * 0.3) {
      // Dry breaks: dashes over a normalised length of 100.
      const segs: string[] = [];
      let s = 0;
      while (s < 100) {
        const a = 8 + rand() * 38;
        const gap = 1 + rand() * 9 * (dry + 0.2);
        segs.push(a.toFixed(1), gap.toFixed(1));
        s += a + gap;
      }
      dash = ` pathLength="100" stroke-dasharray="${segs.join(' ')}"`;
    }
    out +=
      `<path d="${d}" fill="none" stroke="${PAINT}" stroke-width="${width}"` +
      ` stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"${dash}/>`;
  }
  const end = c[m - 1]!;
  for (let k = 0; k < splat; k += 1) {
    const a = rand() * Math.PI * 2;
    const r = w * 0.8 + rand() * 30;
    const cx = end[0] + Math.cos(a) * r;
    const cy = end[1] + Math.sin(a) * r;
    const radius = (0.8 + rand() * 2.8).toFixed(1);
    out += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${PAINT}" opacity="0.85"/>`;
  }
  return out;
}
