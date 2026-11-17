/* Exstinctio — the descent / ascent transit (Claude Design "Katabasis Transitions", round 2, IV).

   The room the player stands in, as the degradation pass drew it the moment the transit mounts,
   loses its light in the order of its weakness: the shadows go first, then the marble, and the
   altar candles last, whose final embers fall out of the frame. The ascent runs it back: embers rise
   into the candles, the candles catch first, and the light spreads back brightest-first.

   Everything here works on the pass's own low-resolution buffer (one pixel per pass block, read back
   from the room canvas by `roomSnapshot.ts`), so every frame breaks up in the room's exact blocks.
   A pixel's light is weighed by brightness plus warmth (candle flame outlives white marble), offset
   by the pass's Bayer dither so the dark eats the room in the pass's own pattern. Each step keeps a
   shrinking share of the pixels, by that weight, and pushes the survivors further toward the
   grimoire ramp, so the light reddens as it dies.

   The maths (keys, thresholds, steps, embers, the timeline) is pure and DOM-free; `playExstinctio`
   is the thin canvas player the transit mounts. Presentation only: no game state, RNG or save. */

import { BAYER, DEFAULT_DEGRADE, PAL_LUT } from './degrade.js';

/** A plain RGBA pixel buffer: `ImageData`'s shape, without needing the DOM type. */
export interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** Which way the transit runs: Katabasis puts the light out, Anabasis brings it back. */
export type ExstinctioDir = 'down' | 'up';

/** How much of the room's light is still alive at each step. Step 0 is the room as the pass draws
 *  it; the last step holds only the altar candles. */
export const EXSTINCTIO_ALIVE: readonly number[] = [
  1, 0.8, 0.62, 0.47, 0.35, 0.25, 0.17, 0.11, 0.07, 0.042, 0.024, 0.013, 0.006, 0.0025,
];
/** The number of extinction steps. */
export const EXSTINCTIO_STEPS = EXSTINCTIO_ALIVE.length;
/** How much further toward the grimoire ramp the surviving light is pushed at each step. */
export const EXSTINCTIO_GRADE_PER_STEP = 0.07;
/** The void a dead pixel falls to: the grimoire ramp's darkest stop. */
export const EXSTINCTIO_VOID: readonly [number, number, number] = [0x0a, 0x08, 0x07];

// How a pixel's light is weighed: brightness, plus warmth (red over blue) weighed double, so candle
// flame outlives white marble; the Bayer offset breaks the dying light up in the pass's pattern.
const KEY_LUMA = 0.45;
const KEY_WARMTH = 0.9;
const KEY_DITHER = 0.16;

/** A survivor must be at least this bright to become an ember, so a black room yields none. */
const EMBER_MIN_LUMA = 0.3;
/** The last survivors are gathered into embers on a grid of this many buffer pixels. */
const EMBER_CELL = 6;
/** At most this many embers (the altar's candles). */
export const EMBER_MAX = 9;
/** Each ember's easing exponent, so they fall (or rise) unevenly: some hang, some drop at once. */
const EMBER_CURVES: readonly number[] = [1.6, 3.2, 1.3, 5, 2.2, 4, 1.8, 6, 2.6];

// ── The timeline (ms from the transit's mount; it holds 5000 ms in all) ─────────────────────────

/** Katabasis: when each extinction step begins (index = step). */
export const DESCENT_STEP_AT_MS: readonly number[] = [
  0, 500, 700, 900, 1100, 1300, 1500, 1700, 1950, 2200, 2500, 2800, 3100, 3450,
];
/** Katabasis: the last candles leave as embers and fall out of the frame, over this long. */
export const DESCENT_EMBERS_AT_MS = 3800;
export const DESCENT_EMBERS_MS = 800;
/** Anabasis: embers rise from below the frame into the candles, over this long. */
export const ASCENT_EMBERS_AT_MS = 300;
export const ASCENT_EMBERS_MS = 900;
/** Anabasis: when each step begins to show (index = step). The light comes back from the last step
 *  to the first, so the times fall as the index rises: step 13 (the candles) shows first. */
export const ASCENT_STEP_AT_MS: readonly number[] = [
  3600, 3450, 3300, 3150, 3000, 2800, 2600, 2400, 2200, 2000, 1800, 1600, 1400, 1200,
];
/** Katabasis: the seal's light leaves the room in the glyph's own three steps (its CSS fade): at these
 *  times (ms) the room keeps 66%, then 33%, then none of it. */
export const SEAL_LIGHT_STEPS_MS: readonly number[] = [200, 300, 400];
/** Under reduced motion the transit holds one still frame: this moment of its timeline (the descent
 *  on the candles alone, the ascent on the room nearly lit). */
export const EXSTINCTIO_REST_MS = 3400;
/** How long the player keeps painting: the transit's whole hold. */
const PLAY_MS = 5000;

/** What the transit shows at `t` ms: an extinction step (or `null`: the void); while embers travel,
 *  how far they have come (0..1, else `null`); and how much of the seal's light is still in the room
 *  (1 at the commit, 0 once the seal has gone out; always 0 on the way up). */
export interface ExstinctioMoment {
  readonly step: number | null;
  readonly embers: number | null;
  readonly seal: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function exstinctioAt(dir: ExstinctioDir, t: number): ExstinctioMoment {
  if (dir === 'down') {
    if (t >= DESCENT_EMBERS_AT_MS) {
      return {
        step: null,
        embers: clamp01((t - DESCENT_EMBERS_AT_MS) / DESCENT_EMBERS_MS),
        seal: 0,
      };
    }
    let step = 0;
    for (let i = 0; i < DESCENT_STEP_AT_MS.length; i++) {
      if ((DESCENT_STEP_AT_MS[i] ?? Infinity) <= t) step = i;
    }
    const gone = SEAL_LIGHT_STEPS_MS.filter((at) => at <= t).length;
    const seal = gone >= SEAL_LIGHT_STEPS_MS.length ? 0 : ([1, 0.66, 0.33][gone] ?? 0);
    return { step, embers: null, seal };
  }
  if (t < ASCENT_EMBERS_AT_MS) return { step: null, embers: null, seal: 0 };
  if (t < (ASCENT_STEP_AT_MS[ASCENT_STEP_AT_MS.length - 1] ?? 0)) {
    return {
      step: null,
      embers: clamp01((t - ASCENT_EMBERS_AT_MS) / ASCENT_EMBERS_MS),
      seal: 0,
    };
  }
  for (let i = 0; i < ASCENT_STEP_AT_MS.length; i++) {
    if ((ASCENT_STEP_AT_MS[i] ?? Infinity) <= t) return { step: i, embers: null, seal: 0 };
  }
  return { step: null, embers: null, seal: 0 };
}

// ── Reading the pass back ───────────────────────────────────────────────────────────────────────

/** The pass's low-resolution buffer size for a canvas of `width` × `height` (its `_ensureLow`). */
export function lowResSize(
  width: number,
  height: number,
  block: number = DEFAULT_DEGRADE.block,
): { w: number; h: number } {
  const b = Math.max(1, Math.round(block));
  return { w: Math.max(2, Math.round(width / b)), h: Math.max(2, Math.round(height / b)) };
}

/** One pixel per pass block, read at each block's centre. The pass upscales its buffer
 *  nearest-neighbour and lays a dark scanline over every block's first row, so the centre row is
 *  the buffer's own colour. */
export function sampleBlocks(full: PixelBuffer, w: number, h: number): PixelBuffer {
  const out = new Uint8ClampedArray(w * h * 4);
  const src = full.data;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(full.height - 1, Math.floor(((y + 0.5) * full.height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(full.width - 1, Math.floor(((x + 0.5) * full.width) / w));
      const i = (sy * full.width + sx) * 4;
      const o = (y * w + x) * 4;
      out[o] = src[i] ?? 0;
      out[o + 1] = src[i + 1] ?? 0;
      out[o + 2] = src[i + 2] ?? 0;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

// ── The extinction ──────────────────────────────────────────────────────────────────────────────

/** Each pixel's light, the order it dies in (lowest first). */
export function lightKeys(src: PixelBuffer): Float32Array {
  const { width: w, height: h, data: d } = src;
  const keys = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      const r = (d[i] ?? 0) / 255;
      const g = (d[i + 1] ?? 0) / 255;
      const b = (d[i + 2] ?? 0) / 255;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const warmth = r > b ? r - b : 0;
      keys[p] =
        KEY_LUMA * luma + KEY_WARMTH * warmth + (BAYER[(y & 3) * 4 + (x & 3)] ?? 0) * KEY_DITHER;
    }
  }
  return keys;
}

/** The weight a pixel needs to be alive at each step: the quantile that keeps that step's share. */
export function aliveThresholds(
  keys: Float32Array,
  alive: readonly number[] = EXSTINCTIO_ALIVE,
): number[] {
  const sorted = Float32Array.from(keys).sort();
  const n = sorted.length;
  return alive.map((f) => {
    if (f >= 1 || n === 0) return -Infinity;
    const idx = Math.min(n - 1, Math.max(0, Math.floor((1 - f) * n)));
    return sorted[idx] ?? Infinity;
  });
}

/** How far toward the grimoire ramp the survivors of `step` are pushed. */
export const stepGrade = (step: number): number => Math.min(1, step * EXSTINCTIO_GRADE_PER_STEP);

/** One pixel graded `amount` of the way toward the grimoire ramp, by its luminance. */
function gradeToward(r: number, g: number, b: number, amount: number): [number, number, number] {
  if (amount <= 0) return [r, g, b];
  const l = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  const li = l < 0 ? 0 : l > 255 ? 255 : l;
  return [
    r + ((PAL_LUT[li * 3] ?? r) - r) * amount,
    g + ((PAL_LUT[li * 3 + 1] ?? g) - g) * amount,
    b + ((PAL_LUT[li * 3 + 2] ?? b) - b) * amount,
  ];
}

/** Paint extinction `step` into `out` (an RGBA buffer the size of `src`): the survivors graded
 *  toward the ramp, everything else the void. A step past the last leaves nothing alive. */
export function renderExstinctioStep(
  src: PixelBuffer,
  keys: Float32Array,
  thresholds: readonly number[],
  step: number,
  out: Uint8ClampedArray,
): void {
  const threshold = thresholds[step] ?? Infinity;
  const amount = stepGrade(step);
  const d = src.data;
  const [vr, vg, vb] = EXSTINCTIO_VOID;
  for (let p = 0, i = 0; p < keys.length; p++, i += 4) {
    if ((keys[p] ?? -Infinity) >= threshold) {
      const [r, g, b] = gradeToward(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0, amount);
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    } else {
      out[i] = vr;
      out[i + 1] = vg;
      out[i + 2] = vb;
    }
    out[i + 3] = 255;
  }
}

/** Paint into `out` the room as the seal leaves it: `lit` (the seal's light in it) weighted `seal`,
 *  over `bare` (the room without it). Both are the same size as `out`. */
export function mixSealLight(
  lit: PixelBuffer,
  bare: PixelBuffer,
  seal: number,
  out: Uint8ClampedArray,
): void {
  const a = lit.data;
  const b = bare.data;
  const w = clamp01(seal);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = (a[i] ?? 0) * w + (b[i] ?? 0) * (1 - w);
    out[i + 1] = (a[i + 1] ?? 0) * w + (b[i + 1] ?? 0) * (1 - w);
    out[i + 2] = (a[i + 2] ?? 0) * w + (b[i + 2] ?? 0) * (1 - w);
    out[i + 3] = 255;
  }
}

/** One of the last lights, in buffer pixels, with the colour it burns. */
export interface Ember {
  readonly x: number;
  readonly y: number;
  readonly color: readonly [number, number, number];
}

/** The lights still alive at `threshold` (the last step's), gathered into at most `max` embers,
 *  biggest first: the altar candles. Only lit survivors count, so a dark room yields none. Each
 *  burns in the colour of its brightest pixel, graded as far as the last step grades it. */
export function survivingEmbers(
  src: PixelBuffer,
  keys: Float32Array,
  threshold: number,
  max: number = EMBER_MAX,
): Ember[] {
  const { width: w, height: h, data: d } = src;
  const cols = Math.ceil(w / EMBER_CELL);
  const cells = new Map<number, { n: number; sx: number; sy: number; luma: number; i: number }>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if ((keys[p] ?? -Infinity) < threshold) continue;
      const i = p * 4;
      const luma = (0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0)) / 255;
      if (luma < EMBER_MIN_LUMA) continue;
      const cell = Math.floor(y / EMBER_CELL) * cols + Math.floor(x / EMBER_CELL);
      const c = cells.get(cell);
      if (c) {
        c.n++;
        c.sx += x;
        c.sy += y;
        if (luma > c.luma) {
          c.luma = luma;
          c.i = i;
        }
      } else {
        cells.set(cell, { n: 1, sx: x, sy: y, luma, i });
      }
    }
  }
  const amount = stepGrade(EXSTINCTIO_STEPS - 1);
  return [...cells.entries()]
    .sort(([ka, a], [kb, b]) => b.n - a.n || ka - kb)
    .slice(0, max)
    .map(([, c]) => {
      const [r, g, b] = gradeToward(d[c.i] ?? 0, d[c.i + 1] ?? 0, d[c.i + 2] ?? 0, amount);
      return {
        x: c.sx / c.n,
        y: c.sy / c.n,
        color: [Math.round(r), Math.round(g), Math.round(b)] as const,
      };
    });
}

/** How far ember `k` sits below its candle at `progress` (0..1) of its travel, for a fall of
 *  `distance` pixels. Katabasis: it hangs, then drops out of the frame. Anabasis: it starts that far
 *  below and rises into place, fast at first. */
export function emberOffset(
  dir: ExstinctioDir,
  k: number,
  progress: number,
  distance: number,
): number {
  const e = EMBER_CURVES[k % EMBER_CURVES.length] ?? 2;
  const p = clamp01(progress);
  return distance * (dir === 'down' ? Math.pow(p, e) : Math.pow(1 - p, e));
}

// ── The player ──────────────────────────────────────────────────────────────────────────────────

/** Whether the player asked the system for less motion (read once; the transit is 5 s long). */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Play the transit into `canvas` from the room snapshot `src`, for its whole hold. Steps are built
 * on demand (each one only when the timeline reaches it), so the per-frame cost is one pass over the
 * buffer at most. `still` paints the reduced-motion rest frame once and stops. Without a 2D context
 * (jsdom) it paints nothing. Returns the stop function.
 *
 * `settle` reads the room again on the first animation frame, once the pass has repainted it without
 * the seal's light (the descent's snapshot is taken the instant the seal is pressed, its crimson
 * glow still in the room). The seal's light then leaves the frame in the glyph's own three steps,
 * and the extinction runs on the bare room, so the altar candles, not that glow, burn last. Without
 * it (or when it reads nothing of the same size) everything runs on `src`.
 */
export function playExstinctio(
  canvas: HTMLCanvasElement,
  src: PixelBuffer,
  dir: ExstinctioDir,
  still: boolean,
  settle?: () => PixelBuffer | null,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  const { width: w, height: h } = src;
  canvas.width = w;
  canvas.height = h;
  const frame = ctx.createImageData(w, h);
  const [vr, vg, vb] = EXSTINCTIO_VOID;
  const voidFill = `rgb(${vr},${vg},${vb})`;

  // The room the extinction runs on, prepared on the first animation frame.
  let room: {
    bare: PixelBuffer;
    keys: Float32Array;
    thresholds: number[];
    embers: Ember[];
  } | null = null;
  const prepare = (): void => {
    const read = settle?.() ?? null;
    const bare = read && read.width === w && read.height === h ? read : src;
    const keys = lightKeys(bare);
    const thresholds = aliveThresholds(keys);
    const embers = survivingEmbers(bare, keys, thresholds[thresholds.length - 1] ?? Infinity);
    room = { bare, keys, thresholds, embers };
  };

  let shown = '';
  const paint = (t: number): void => {
    const now = exstinctioAt(dir, t);
    if (now.step !== null) {
      // Until the room is prepared (the mount frame), the step-0 room is the snapshot as taken.
      const key = room ? `${now.step}:${now.seal}` : 'lit';
      if (key === shown) return;
      shown = key;
      if (!room) {
        frame.data.set(src.data);
      } else if (now.step === 0 && now.seal > 0 && room.bare !== src) {
        mixSealLight(src, room.bare, now.seal, frame.data);
      } else {
        renderExstinctioStep(room.bare, room.keys, room.thresholds, now.step, frame.data);
      }
      ctx.putImageData(frame, 0, 0);
      return;
    }
    shown = '';
    ctx.fillStyle = voidFill;
    ctx.fillRect(0, 0, w, h);
    if (now.embers === null || !room) return;
    room.embers.forEach((e, k) => {
      // Far enough to clear the bottom edge, halo and all, whichever room it is.
      const distance = h + 3 - e.y;
      const x = Math.round(e.x);
      const y = Math.round(e.y + emberOffset(dir, k, now.embers ?? 0, distance));
      const [r, g, b] = e.color;
      ctx.fillStyle = `rgba(${r},${g},${b},0.35)`;
      ctx.fillRect(x - 2, y - 2, 4, 4);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    });
  };

  // The mount frame: the room as it stood (or, on the way up, the void). The clock starts here, with
  // the transit's CSS.
  const t0 = performance.now();
  paint(0);
  let raf = 0;
  const loop = (now: number): void => {
    if (!room) prepare();
    if (still) {
      paint(EXSTINCTIO_REST_MS);
      return;
    }
    const t = now - t0;
    paint(t);
    if (t < PLAY_MS) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
