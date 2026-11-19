// The Orbis Tenebrarum pixel globe (Claude Design "Dithered Orb"): a low-resolution orthographic
// world rendered per frame into an RGBA buffer, upscaled nearest-neighbour by CSS
// (`image-rendering: pixelated`), so it reads as pixel art at one chunkiness with the panel's 3 px
// grid. The sea and the land each take a five-step palette, ordered-dithered (the Loculi's 4×4
// Bayer matrix) by a light fixed to the screen, so the shading stays put while the world turns
// under it; coasts are a one-pixel outline, the graticule a dotted line, and the rim a gold ring in
// a dithered teal atmosphere. Pins, the selection brackets, the rim arrows toward finds beyond the
// horizon and the Emptio bar are drawn on top as whole art pixels.
//
// Framework-free and DOM-free: the per-pixel rules are pure functions over typed arrays (testable
// without a 2D context, which jsdom lacks); `OrbisTenebrarum` owns the canvas and the loop.
import { BAYER4 } from '../pixelArt.js';
import { LAND_EDGES } from './orbis.land.js';

/** CSS px per art pixel: the panel's pixel grid (the notched borders and bevels are 3 px too). */
export const ART_PX = 3;
/** The globe canvas's art-pixel side bounds: it grows with the room the stage leaves. */
export const GLOBE_MIN_N = 96;
export const GLOBE_MAX_N = 160;
/** The default side, used until the stage is measured (and where it cannot be, e.g. in tests). */
export const GLOBE_DEFAULT_N = 148;
/** The globe's radius as a share of the canvas side; the margin holds the rim arrows. */
export const GLOBE_RADIUS = 0.46;

const DEG = Math.PI / 180;

/** The art-pixel side for a measured box of `w` × `h` CSS px. */
export function globeSideFor(w: number, h: number): number {
  const n = Math.floor(Math.min(w, h) / ART_PX);
  return Math.max(GLOBE_MIN_N, Math.min(GLOBE_MAX_N, n));
}

// ---------------------------------------------------------------- land mask

/** The land mask's resolution: an equirectangular grid of 0.5° cells. */
const MASK_STEP = 0.5;
const MASK_W = 360 / MASK_STEP;
const MASK_H = 180 / MASK_STEP;
let mask: Uint8Array | null = null;

/**
 * The land mask, built once on first use by an even–odd scanline fill of the bundled coastlines
 * (the same crossings rule as `isLand`, one row per cell centre): far cheaper per lookup than a
 * point-in-polygon test, which the renderer needs for every globe pixel every frame.
 */
function landMask(): Uint8Array {
  if (mask) return mask;
  const m = new Uint8Array(MASK_W * MASK_H);
  const xs: number[] = [];
  for (let r = 0; r < MASK_H; r += 1) {
    const lat = 90 - (r + 0.5) * MASK_STEP;
    xs.length = 0;
    for (const [lo1, la1, lo2, la2] of LAND_EDGES) {
      if (la1 > lat !== la2 > lat) xs.push(lo1 + ((lat - la1) / (la2 - la1)) * (lo2 - lo1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k]! + 180) / MASK_STEP - 0.5));
      const to = Math.min(MASK_W - 1, Math.floor((xs[k + 1]! + 180) / MASK_STEP - 0.5));
      for (let c = from; c <= to; c += 1) m[r * MASK_W + c] = 1;
    }
  }
  mask = m;
  return m;
}

/** Whether `[lon, lat]` (degrees, any longitude) is land, by the 0.5° mask. */
export function landAt(lon: number, lat: number): boolean {
  const m = landMask();
  let c = Math.floor((lon + 180) / MASK_STEP) % MASK_W;
  if (c < 0) c += MASK_W;
  const r = Math.min(MASK_H - 1, Math.max(0, Math.floor((90 - lat) / MASK_STEP)));
  return m[r * MASK_W + c] === 1;
}

// ---------------------------------------------------------------- palette

/** A colour as the little-endian RGBA word an `ImageData` buffer's Uint32 view holds. */
export function rgba32(hex: string, a = 255): number {
  const n = parseInt(hex.slice(1), 16);
  return ((a << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}

/** Blend a packed colour toward `hex` by `t` (0 → unchanged, 1 → `hex`), fully opaque. */
function mix32(word: number, hex: string, t: number): number {
  const n = parseInt(hex.slice(1), 16);
  const r = word & 255;
  const g = (word >> 8) & 255;
  const b = (word >> 16) & 255;
  const lerp = (a: number, z: number): number => Math.round(a + (z - a) * t);
  return (
    ((255 << 24) |
      (lerp(b, n & 255) << 16) |
      (lerp(g, (n >> 8) & 255) << 8) |
      lerp(r, (n >> 16) & 255)) >>>
    0
  );
}

const SEA = ['#04090b', '#081419', '#0c1d24', '#122a33', '#19384a'].map((h) => rgba32(h));
const LAND = ['#12221c', '#1d3a2f', '#2a5242', '#3a6b56', '#4f8a6d'].map((h) => rgba32(h));
const COAST_LIT = rgba32('#7cc3a0');
const COAST_DARK = rgba32('#3f7a62');
const GRATICULE = rgba32('#2f4a4a');
/** The specular glint: a sparse dither one shade above the lit sea, not a white patch. */
const GLINT = rgba32('#24505c');
const RIM = rgba32('#8a7438');
const ATMOSPHERE = rgba32('#2c6d64');
/** The Search's teal: the pulse on the rim and the sweep across the world while it runs. */
export const SEARCH_TEAL = '#56b3a3';

/** The screen-fixed light, from the upper left and toward the viewer. */
const LIGHT = ((): readonly [number, number, number] => {
  const v = [-0.42, 0.55, 0.72] as const;
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
})();

const bayer = (x: number, y: number): number => (BAYER4[(y & 3) * 4 + (x & 3)] ?? 0) / 16;

/** Ordered-dither `v` ∈ [0, 1] into one of `levels` steps. */
const dither = (v: number, levels: number, x: number, y: number): number =>
  Math.max(0, Math.min(levels - 1, Math.floor(v * (levels - 1) + bayer(x, y))));

// ---------------------------------------------------------------- per-size tables

/** Everything about a globe of side `n` that does not depend on where the world is turned. */
export interface GlobeTables {
  readonly n: number;
  /** Radius and centre in art pixels. */
  readonly R: number;
  readonly c: number;
  /** Indices (into the n×n buffer) of the pixels on the disc, and each one's unit-sphere point. */
  readonly disc: Int32Array;
  readonly X: Float32Array;
  readonly Y: Float32Array;
  readonly Z: Float32Array;
  /** Per disc pixel: its dithered sea, land and coast colour under the fixed light, and its glint. */
  readonly sea: Uint32Array;
  readonly land: Uint32Array;
  readonly coast: Uint32Array;
  readonly glint: Uint8Array;
  /** The pixels of the disc's outermost two-pixel band (the Search pulse). */
  readonly band: Int32Array;
  /** The static frame: transparent, the gold rim and the dithered atmosphere. */
  readonly base: Uint32Array;
  /** The graticule's sample points, as [sin lat, cos lat, lon] triples. */
  readonly grat: Float32Array;
}

/** Build the tables for a globe of side `n` art pixels. */
export function buildGlobeTables(n: number): GlobeTables {
  const R = n * GLOBE_RADIUS;
  const c = n / 2;
  const disc: number[] = [];
  const X: number[] = [];
  const Y: number[] = [];
  const Z: number[] = [];
  const sea: number[] = [];
  const land: number[] = [];
  const coast: number[] = [];
  const glint: number[] = [];
  const band: number[] = [];
  const base = new Uint32Array(n * n);
  const gx = c - R * 0.38;
  const gy = c - R * 0.42;
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const dx = (x + 0.5 - c) / R;
      const dy = (c - (y + 0.5)) / R;
      const rho = Math.hypot(dx, dy);
      const i = y * n + x;
      if (rho <= 1) {
        const z = Math.sqrt(1 - rho * rho);
        const light = Math.max(0, Math.min(1, dx * LIGHT[0] + dy * LIGHT[1] + z * LIGHT[2]));
        const v = Math.pow(light, 0.9);
        disc.push(i);
        X.push(dx);
        Y.push(dy);
        Z.push(z);
        sea.push(SEA[dither(v, SEA.length, x, y)]!);
        land.push(LAND[dither(Math.min(1, v * 1.05), LAND.length, x, y)]!);
        coast.push(light > 0.35 ? COAST_LIT : COAST_DARK);
        glint.push(Math.hypot(x + 0.5 - gx, y + 0.5 - gy) < R * 0.16 && bayer(x, y) < 0.25 ? 1 : 0);
        if (rho > 1 - 2.2 / R) band.push(i);
      } else if (rho <= 1 + 1.2 / R) {
        base[i] = RIM;
      } else if (rho <= 1 + 5.5 / R) {
        const fall = 1 - (rho - 1) / (5.5 / R);
        if (bayer(x, y) < fall * 0.55) base[i] = ATMOSPHERE;
      }
    }
  }
  // Graticule every 20°, sampled about once per art pixel along each line.
  const step = Math.max(0.2, 0.9 / R / DEG);
  const grat: number[] = [];
  for (let lon = -180; lon < 180; lon += 20) {
    for (let lat = -80; lat <= 80; lat += step) {
      grat.push(Math.sin(lat * DEG), Math.cos(lat * DEG), lon);
    }
  }
  for (let lat = -80; lat <= 80; lat += 20) {
    for (let lon = -180; lon < 180; lon += step) {
      grat.push(Math.sin(lat * DEG), Math.cos(lat * DEG), lon);
    }
  }
  return {
    n,
    R,
    c,
    disc: Int32Array.from(disc),
    X: Float32Array.from(X),
    Y: Float32Array.from(Y),
    Z: Float32Array.from(Z),
    sea: Uint32Array.from(sea),
    land: Uint32Array.from(land),
    coast: Uint32Array.from(coast),
    glint: Uint8Array.from(glint),
    band: Int32Array.from(band),
    base,
    grat: Float32Array.from(grat),
  };
}

/** The Search's overlay for one frame: the rim pulse's strength and the sweep's column. */
export interface SearchOverlay {
  readonly pulse: number;
  readonly sweepX: number;
}

/**
 * Render the world turned to centre `(cLon, cLat)` into `out` (an n×n RGBA word buffer). `isLand`
 * is scratch space of n×n bytes (only its disc pixels are written, so the rest must stay 0).
 */
export function renderGlobe(
  t: GlobeTables,
  cLon: number,
  cLat: number,
  out: Uint32Array,
  isLand: Uint8Array,
  search: SearchOverlay | null = null,
): void {
  const { n, disc, X, Y, Z } = t;
  out.set(t.base);
  const s0 = Math.sin(cLat * DEG);
  const c0 = Math.cos(cLat * DEG);
  for (let k = 0; k < disc.length; k += 1) {
    const x = X[k]!;
    const y = Y[k]!;
    const z = Z[k]!;
    const lat = Math.asin(Math.max(-1, Math.min(1, z * s0 + y * c0))) / DEG;
    const lon = cLon + Math.atan2(x, z * c0 - y * s0) / DEG;
    isLand[disc[k]!] = landAt(lon, lat) ? 1 : 0;
  }
  for (let k = 0; k < disc.length; k += 1) {
    const i = disc[k]!;
    if (isLand[i]) {
      const inland = isLand[i - 1] && isLand[i + 1] && isLand[i - n] && isLand[i + n];
      out[i] = inland ? t.land[k]! : t.coast[k]!;
    } else {
      out[i] = t.sea[k]!;
    }
  }
  // The dotted graticule, over the sea only.
  const g = t.grat;
  for (let j = 0; j < g.length; j += 3) {
    const sinP = g[j]!;
    const cosP = g[j + 1]!;
    const dl = (g[j + 2]! - cLon) * DEG;
    const cdl = Math.cos(dl);
    if (s0 * sinP + c0 * cosP * cdl < 0) continue;
    const px = Math.floor(t.c + t.R * cosP * Math.sin(dl));
    const py = Math.floor(t.c - t.R * (c0 * sinP - s0 * cosP * cdl));
    if (px < 0 || py < 0 || px >= n || py >= n || ((px + py) & 1) === 1) continue;
    const i = py * n + px;
    if (!isLand[i] && out[i] !== t.base[i] /* on the disc */) out[i] = GRATICULE;
  }
  for (let k = 0; k < disc.length; k += 1) {
    const i = disc[k]!;
    if (t.glint[k] && !isLand[i]) out[i] = GLINT;
  }
  if (search) {
    for (const i of t.band) out[i] = mix32(out[i]!, SEARCH_TEAL, search.pulse);
    // A three-column sweep with a fading tail, crossing the disc left to right.
    for (let k = 0; k < disc.length; k += 1) {
      const i = disc[k]!;
      const lag = search.sweepX - (i % n);
      if (lag >= 0 && lag < 3) out[i] = mix32(out[i]!, '#7fd0c0', [0.6, 0.35, 0.18][lag]!);
    }
  }
}

// ---------------------------------------------------------------- marks drawn on top

/** The slice of a 2D context the marks need (so tests can record calls without a canvas). */
export interface PixelPen {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** Darken a `#rrggbb` colour by `f` (0 → black, 1 → unchanged). */
export function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number): string =>
    Math.round(v * f)
      .toString(16)
      .padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

const OUTLINE = '#050a0c';

/** A pin: a 3×3 gem (lit top-left, shaded bottom-right) in a one-pixel dark outline. */
export function drawPin(pen: PixelPen, x: number, y: number, color: string): void {
  pen.fillStyle = OUTLINE;
  pen.fillRect(x - 2, y - 2, 5, 5);
  pen.fillStyle = shadeHex(color, 0.62);
  pen.fillRect(x - 1, y - 1, 3, 3);
  pen.fillStyle = color;
  pen.fillRect(x - 1, y - 1, 2, 2);
}

/** The selection: four corner brackets around a pin, 11 art pixels across. */
export function drawBrackets(pen: PixelPen, x: number, y: number, color: string): void {
  pen.fillStyle = color;
  const a = x - 5;
  const b = y - 5;
  const e = x + 5;
  const f = y + 5;
  pen.fillRect(a, b, 3, 1);
  pen.fillRect(a, b, 1, 3);
  pen.fillRect(e - 2, b, 3, 1);
  pen.fillRect(e, b, 1, 3);
  pen.fillRect(a, f, 3, 1);
  pen.fillRect(a, f - 2, 1, 3);
  pen.fillRect(e - 2, f, 3, 1);
  pen.fillRect(e, f - 2, 1, 3);
}

/** The Emptio's progress under the pin being bought: a nine-pixel bar in a dark frame. */
export function drawProgress(pen: PixelPen, x: number, y: number, fraction: number): void {
  pen.fillStyle = OUTLINE;
  pen.fillRect(x - 5, y + 4, 11, 3);
  pen.fillStyle = '#123430';
  pen.fillRect(x - 4, y + 5, 9, 1);
  const filled = Math.round(9 * Math.max(0, Math.min(1, fraction)));
  if (filled > 0) {
    pen.fillStyle = SEARCH_TEAL;
    pen.fillRect(x - 4, y + 5, filled, 1);
  }
}

type Bitmap = { readonly w: number; readonly h: number; readonly cells: ReadonlyArray<number> };

/** An arrowhead pointing east (4×7) and one pointing south-east (4×4), as [x, y] cell pairs. */
const ARROW_E: Bitmap = {
  w: 4,
  h: 7,
  cells: [
    0, 0, 0, 1, 1, 1, 0, 2, 1, 2, 2, 2, 0, 3, 1, 3, 2, 3, 3, 3, 0, 4, 1, 4, 2, 4, 0, 5, 1, 5, 0, 6,
  ],
};
const ARROW_SE: Bitmap = {
  w: 4,
  h: 4,
  cells: [3, 0, 2, 1, 3, 1, 1, 2, 2, 2, 3, 2, 0, 3, 1, 3, 2, 3, 3, 3],
};

/** Rotate a bitmap a quarter turn clockwise on screen (y down): east becomes south. */
function rotateCw(b: Bitmap): Bitmap {
  const cells: number[] = [];
  for (let k = 0; k < b.cells.length; k += 2) cells.push(b.h - 1 - b.cells[k + 1]!, b.cells[k]!);
  return { w: b.h, h: b.w, cells };
}

/** The arrowhead for each of the eight screen directions (0 = east, clockwise in 45° steps). */
export const ARROWS: readonly Bitmap[] = ((): Bitmap[] => {
  const out: Bitmap[] = [];
  for (let o = 0; o < 8; o += 1) {
    let b = o % 2 === 0 ? ARROW_E : ARROW_SE;
    for (let r = 0; r < Math.floor(o / 2); r += 1) b = rotateCw(b);
    out.push(b);
  }
  return out;
})();

/** The eighth of the compass (0 = east, clockwise) closest to a screen direction (y down). */
export function octantOf(dx: number, dy: number): number {
  return ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
}

/** An arrowhead toward a find beyond the horizon, centred on `(x, y)` just outside the rim. */
export function drawArrow(
  pen: PixelPen,
  x: number,
  y: number,
  octant: number,
  color: string,
): void {
  const b = ARROWS[octant] ?? ARROWS[0]!;
  const ox = Math.round(x) - Math.floor(b.w / 2);
  const oy = Math.round(y) - Math.floor(b.h / 2);
  pen.fillStyle = color;
  for (let k = 0; k < b.cells.length; k += 2)
    pen.fillRect(ox + b.cells[k]!, oy + b.cells[k + 1]!, 1, 1);
}
