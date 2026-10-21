import { useEffect, useRef, type ReactElement } from 'react';
import {
  DegradePass,
  DEFAULT_DEGRADE,
  spriteArtSize,
  type EngineSprite,
} from '../menus/degrade.js';
import { decodeImage } from '../menus/DegradedScene.js';
import { ASSET_BASE } from '../menus/degrade.data.js';

/* The first-descent cinematic, "the soul leaves the body" (Claude Design "First Katabasis"
   handoff). The first time a playthrough truly descends, before the Abyss transit: the Altar Room
   fades to black; Plate I (the golden glove upon the ritual altar) surfaces, holds and goes; Plate
   II (the crimson hooded figure on the stone altar) surfaces and at once falls away to the centre
   of the screen, shrinking ever faster while its rim darkens into an oval and erodes inward, until
   nothing is left. Late in the fall the hand-off (`onTransit`) mounts the Abyss transit underneath,
   and the overlay lifts off it. Both plates composite THROUGH the degradation pass, like the
   jumpscare and the subliminal plates. App orchestrates when it plays; the store records that it
   has. Like the empty-handed warning and the transits it cannot be skipped: the overlay swallows
   every click and has no key handler, and it ends only when its timeline does. */

/** The first plate: the golden glove upon the ritual altar. */
export const FIRST_DESCENT_PLATE_I = `${ASSET_BASE}/katabasis/first-descent-1-glove.png`;
/** The second plate, the one that falls away: the crimson hooded figure on the stone altar. */
export const FIRST_DESCENT_PLATE_II = `${ASSET_BASE}/katabasis/first-descent-2-body.png`;

/** The black fades in over the room. */
export const FIRST_DESCENT_BLACK_IN_MS = 700;
/** When Plate I begins to surface (just after the black has settled). */
export const FIRST_DESCENT_PLATE_AT_MS = 900;
/** A plate surfaces out of the black. */
export const FIRST_DESCENT_SURFACE_MS = 1400;
/** Plate I's still hold. */
export const FIRST_DESCENT_PLATE_HOLD_MS = 1500;
/** Plate I sinks back into the black. */
export const FIRST_DESCENT_SINK_MS = 900;
/** The black between the plates; Plate II is swapped in as it begins. */
export const FIRST_DESCENT_GAP_MS = 250;
/** The fall: Plate II shrinks away to the centre and dissolves. It begins the moment the plate has
 *  surfaced (Plate II never holds still). */
export const FIRST_DESCENT_FALL_MS = 3000;
/** How far into the fall the hand-off comes: the Abyss transit mounts and the overlay starts to lift. */
export const FIRST_DESCENT_TRANSIT_AT = 0.72;
/** The overlay is fully lifted this long after the fall ends. */
export const FIRST_DESCENT_LIFT_MS = 700;
/** Under reduced motion the fall is replaced by a plain cross-fade into the transit, this long. */
export const FIRST_DESCENT_CROSSFADE_MS = 1200;

/** Exponent of the fall's accelerating shrink. */
export const FIRST_DESCENT_SHRINK_CURVE = 2.6;
/** Fraction of the fall over which the edge darkening reaches full strength. */
export const FIRST_DESCENT_EDGE_RAMP = 0.42;
/** Softness of the edge darkening's onset. */
export const FIRST_DESCENT_EDGE_CURVE = 1.4;
/** Superellipse exponent of the darkening's shape (2 = a plain ellipse, so the corners go first). */
export const FIRST_DESCENT_OVALNESS = 2;
/** How late the block erosion bites. */
export const FIRST_DESCENT_ERODE_CURVE = 3.9;
/** How many dissolve frames are baked across the fall. */
export const FIRST_DESCENT_DISSOLVE_STEPS = 40;
/** The dissolve's bake width (px). Plenty: the pass downsamples to 427 × 240 anyway. */
const DISSOLVE_WIDTH = 854;
/** The erosion's block (px at bake size), the pass's own pixel grain. */
const DISSOLVE_BLOCK = 4;

// The pass composites into a 1280 × 720 buffer: a sprite's `w` is a fraction of its width, and its
// `y` (the baseline) a fraction of its height.
const STAGE_W = 1280;
const STAGE_H = 720;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Every fade's curve. */
const ease = (p: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(p));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The cinematic's beats, in ms from the commit. */
export interface FirstDescentTimeline {
  /** Plate I surfaces from `plateIIn` to `plateIShown`, holds, then sinks to `plateIGone`. */
  readonly plateIIn: number;
  readonly plateIShown: number;
  readonly plateISink: number;
  readonly plateIGone: number;
  /** Plate II surfaces from `plateIIIn` to `fallAt`. */
  readonly plateIIIn: number;
  /** The fall begins (or, under reduced motion, the cross-fade into the transit). */
  readonly fallAt: number;
  /** The hand-off: the Abyss transit mounts underneath and the overlay starts to lift. */
  readonly transitAt: number;
  /** The overlay has lifted: the cinematic is over. */
  readonly end: number;
  /** Whether Plate II falls and dissolves (false under reduced motion: it only cross-fades). */
  readonly falls: boolean;
}

export function firstDescentTimeline(reducedMotion = false): FirstDescentTimeline {
  const plateIIn = FIRST_DESCENT_PLATE_AT_MS;
  const plateIShown = plateIIn + FIRST_DESCENT_SURFACE_MS;
  const plateISink = plateIShown + FIRST_DESCENT_PLATE_HOLD_MS;
  const plateIGone = plateISink + FIRST_DESCENT_SINK_MS;
  const plateIIIn = plateIGone + FIRST_DESCENT_GAP_MS;
  const fallAt = plateIIIn + FIRST_DESCENT_SURFACE_MS;
  const base = { plateIIn, plateIShown, plateISink, plateIGone, plateIIIn, fallAt };
  if (reducedMotion) {
    return { ...base, transitAt: fallAt, end: fallAt + FIRST_DESCENT_CROSSFADE_MS, falls: false };
  }
  return {
    ...base,
    transitAt: fallAt + FIRST_DESCENT_TRANSIT_AT * FIRST_DESCENT_FALL_MS,
    end: fallAt + FIRST_DESCENT_FALL_MS + FIRST_DESCENT_LIFT_MS,
    falls: true,
  };
}

const TIMELINE = firstDescentTimeline();
/** When the fall begins. */
export const FIRST_DESCENT_FALL_AT_MS = TIMELINE.fallAt;
/** When the hand-off calls `onTransit`. */
export const FIRST_DESCENT_TRANSIT_MS = TIMELINE.transitAt;
/** The whole cinematic, black in to the overlay lifted: `onDone` fires after exactly this long. */
export const FIRST_DESCENT_TOTAL_MS = TIMELINE.end;

/** What one moment of the cinematic shows. */
export interface FirstDescentFrame {
  /** The overlay's opacity: black over the room at first, lifted off the transit at the end. */
  readonly overlay: number;
  /** The black curtain over the plate, between and around the plates. */
  readonly curtain: number;
  /** Which plate the pass composites (0: Plate I, 1: Plate II). */
  readonly plate: 0 | 1;
  /** Progress through the fall, 0..1 (0 before it, and throughout under reduced motion). */
  readonly fall: number;
}

/** The cinematic at `t` ms from the commit. */
export function firstDescentFrame(tl: FirstDescentTimeline, t: number): FirstDescentFrame {
  const overlay =
    t < tl.transitAt
      ? ease(t / FIRST_DESCENT_BLACK_IN_MS)
      : 1 - ease((t - tl.transitAt) / (tl.end - tl.transitAt));
  let curtain = 0;
  if (t < tl.plateIIn) curtain = 1;
  else if (t < tl.plateIShown) curtain = 1 - ease((t - tl.plateIIn) / FIRST_DESCENT_SURFACE_MS);
  else if (t < tl.plateISink) curtain = 0;
  else if (t < tl.plateIGone) curtain = ease((t - tl.plateISink) / FIRST_DESCENT_SINK_MS);
  else if (t < tl.plateIIIn) curtain = 1;
  else if (t < tl.fallAt) curtain = 1 - ease((t - tl.plateIIIn) / FIRST_DESCENT_SURFACE_MS);
  return {
    overlay,
    curtain,
    plate: t >= tl.plateIGone ? 1 : 0,
    fall: tl.falls ? clamp01((t - tl.fallAt) / FIRST_DESCENT_FALL_MS) : 0,
  };
}

/** The falling plate's width (a fraction of the stage) at fall progress `p`: an accelerating shrink. */
export function fallWidth(p: number): number {
  return Math.max(0.004, 1 - 0.99 * Math.pow(clamp01(p), FIRST_DESCENT_SHRINK_CURVE));
}

/** Which of `count` dissolve frames shows at fall progress `p` (> 0); frame i carries k = (i + 1) / count. */
export function dissolveIndex(p: number, count: number): number {
  return Math.min(count - 1, Math.floor(clamp01(p) * count));
}

/** Size a centred plate sprite to `w` of the stage width. Its `y` is its baseline (bottom edge), so
 *  centring puts the baseline half the plate's height below the middle. */
function placePlate(sprite: EngineSprite, w: number): void {
  const size = spriteArtSize(sprite.img);
  if (!size) return;
  const aspect = size.h / size.w;
  sprite.w = w;
  sprite.y = 0.5 + (w * STAGE_W * aspect) / STAGE_H / 2;
}

// ── The dissolve: pre-baked frames of Plate II ──────────────────────────────

/** Each pixel's superellipse radius from the frame's centre (0 there, 1 at the edge midpoints). */
export function dissolveRadii(w: number, h: number, oval = FIRST_DESCENT_OVALNESS): Float32Array {
  const radii = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const dy = Math.abs(((y + 0.5) / h) * 2 - 1);
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(((x + 0.5) / w) * 2 - 1);
      radii[y * w + x] = Math.pow(Math.pow(dx, oval) + Math.pow(dy, oval), 1 / oval);
    }
  }
  return radii;
}

/** One fixed noise value per block, the same for every frame, so the erosion is coherent. */
export function dissolveNoise(w: number, h: number, block = DISSOLVE_BLOCK): Float32Array {
  const noise = new Float32Array(Math.ceil(w / block) * Math.ceil(h / block));
  for (let i = 0; i < noise.length; i++) {
    const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    noise[i] = s - Math.floor(s);
  }
  return noise;
}

/**
 * Write dissolve step `k` (0..1] of the `w` × `h` RGBA plate `src` into `out`: the source colour,
 * its alpha scaled by the step's mask. The rim darkens into the superellipse progressively (never a
 * jump), then the picture erodes block by block, the rim first, the erosion held back toward the end.
 */
export function dissolveFrame(
  src: Uint8ClampedArray,
  out: Uint8ClampedArray,
  w: number,
  h: number,
  k: number,
  radii: Float32Array,
  noise: Float32Array,
  block = DISSOLVE_BLOCK,
): void {
  const f = Math.pow(smooth(0, FIRST_DESCENT_EDGE_RAMP, k), FIRST_DESCENT_EDGE_CURVE);
  const kk = Math.pow(k, FIRST_DESCENT_ERODE_CURVE - 0.3);
  const inner = Math.max(0, 1 - 0.45 * f - 0.55 * kk);
  const outer = Math.max(inner + 0.04, 1.0005 - 0.62 * kk);
  const edge = Math.min(1, f + kk);
  const th = Math.pow(k, FIRST_DESCENT_ERODE_CURVE) * 1.05;
  const cols = Math.ceil(w / block);
  for (let y = 0; y < h; y++) {
    const row = ((y / block) | 0) * cols;
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const r = radii[p]!;
      let a = 1 - smooth(inner, outer, r) * edge;
      if (a > 0 && th > 0 && noise[row + ((x / block) | 0)]! < th * (0.55 + 0.9 * r)) a = 0;
      const i = p * 4;
      out[i] = src[i]!;
      out[i + 1] = src[i + 1]!;
      out[i + 2] = src[i + 2]!;
      out[i + 3] = src[i + 3]! * a;
    }
  }
}

/**
 * Bake Plate II's dissolve, one frame per task so the work never takes a frame's budget. Each
 * frame is a canvas the pass draws directly: the pixel work for all forty takes ~130 ms, while
 * round-tripping each through a PNG (`toBlob`, then an `Image`) took 6 to 10 s, longer than the 6.35
 * s before the fall, which then fell undissolved, its hard edges showing.
 */
async function bakeDissolve(plate: HTMLImageElement): Promise<HTMLCanvasElement[]> {
  const w = DISSOLVE_WIDTH;
  const h = Math.round((w * plate.naturalHeight) / plate.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D context unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(plate, 0, 0, w, h);
  const src = ctx.getImageData(0, 0, w, h).data;
  const radii = dissolveRadii(w, h);
  const noise = dissolveNoise(w, h);
  const out = ctx.createImageData(w, h);
  const frames: HTMLCanvasElement[] = [];
  for (let n = 1; n <= FIRST_DESCENT_DISSOLVE_STEPS; n++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    dissolveFrame(src, out.data, w, h, n / FIRST_DESCENT_DISSOLVE_STEPS, radii, noise);
    const frame = document.createElement('canvas');
    frame.width = w;
    frame.height = h;
    const fctx = frame.getContext('2d');
    if (!fctx) throw new Error('2D context unavailable');
    fctx.putImageData(out, 0, 0);
    frames.push(frame);
  }
  return frames;
}

/** The cinematic's art, filled in as it becomes ready. */
interface FirstDescentArt {
  /** Plates I and II, once both have decoded. */
  plates: readonly [HTMLImageElement, HTMLImageElement] | null;
  /** Plate II's dissolve frames, once all are baked; until then the plate falls undissolved. */
  dissolve: readonly HTMLCanvasElement[] | null;
}

let primed: FirstDescentArt | null = null;

/**
 * Decode both plates and bake the dissolve ahead of time, so the cinematic never shows an empty
 * frame. App calls it as soon as the altar sigil rises with the cinematic due (decoding the plates
 * and baking take about a second, the fall begins 6.35 s after the commit); the cinematic calls it
 * again on mount. Idempotent while the art is held; a failed decode lets a later call retry.
 */
export function primeFirstDescent(): FirstDescentArt {
  if (primed) return primed;
  const art: FirstDescentArt = { plates: null, dissolve: null };
  primed = art;
  Promise.all([decodeImage(FIRST_DESCENT_PLATE_I), decodeImage(FIRST_DESCENT_PLATE_II)])
    .then(([one, two]) => {
      art.plates = [one, two];
      return bakeDissolve(two);
    })
    .then(
      (frames) => {
        art.dissolve = frames;
      },
      () => {
        // Without a 2D context the plate falls undissolved; without its plates, a later call retries.
        if (art.plates === null && primed === art) primed = null;
      },
    );
  return art;
}

/**
 * Let the baked frames go (~65 MB of canvases): once the cinematic has played (it plays once per
 * playthrough), or when the altar sigil goes down with no commit (App primes it again next time).
 */
export function releaseFirstDescent(): void {
  primed = null;
}

export function FirstDescent({
  onTransit,
  onDone,
  reducedMotion = false,
}: {
  /** The hand-off, late in the fall: begin the descent (the Abyss transit mounts underneath). */
  onTransit: () => void;
  /** The overlay has lifted: drop it. */
  onDone: () => void;
  /** Replace the fall with a plain cross-fade into the transit. Read once, when it mounts. */
  reducedMotion?: boolean;
}): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const curtainRef = useRef<HTMLDivElement>(null);
  // With no way to skip, the timeline is the only exit: a re-render handing in fresh callbacks must
  // not restart it, so it is armed once per mount and reads the latest callbacks through refs (the
  // TRANSIT_HOLD_MS lesson, as in EmptyHandedWarning).
  const transit = useRef(onTransit);
  const done = useRef(onDone);
  const reduced = useRef(reducedMotion);
  useEffect(() => {
    transit.current = onTransit;
    done.current = onDone;
  });

  useEffect(() => {
    const tl = firstDescentTimeline(reduced.current);
    const timers = [
      window.setTimeout(() => transit.current(), tl.transitAt),
      window.setTimeout(() => {
        // Released here, at the real end, not on unmount: StrictMode's rehearsal unmount would
        // otherwise throw the pre-baked frames away and start the bake over.
        releaseFirstDescent();
        done.current();
      }, tl.end),
    ];
    const art = primeFirstDescent();
    // The pass needs a 2D context; without one the black and its timeline still run.
    let pass: DegradePass | null = null;
    try {
      if (canvasRef.current) {
        pass = new DegradePass(canvasRef.current);
        pass.set({ ...DEFAULT_DEGRADE });
        pass.start();
      }
    } catch {
      pass = null;
    }

    // One sprite, the plate on show. Each animation frame mutates its `w`, `y` and `img`; the pass's
    // own 24 fps loop picks them up, so the fall keeps the pass's lo-fi cadence.
    let sprite: EngineSprite | null = null;
    let shown: 0 | 1 | null = null;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number): void => {
      const t = now - t0;
      const f = firstDescentFrame(tl, t);
      if (rootRef.current) rootRef.current.style.opacity = String(f.overlay);
      if (curtainRef.current) curtainRef.current.style.opacity = String(f.curtain);
      const plate = art.plates?.[f.plate];
      if (pass && plate && shown !== f.plate) {
        // The swap happens under full black: no curtain animation of the pass's own.
        shown = f.plate;
        sprite = { img: plate, x: 0.5, y: 1, w: 1, phase: 0, still: true };
        placePlate(sprite, 1);
        pass.setScene({ bg: null, sprites: [sprite] }, false);
      }
      if (sprite && shown === 1 && f.fall > 0) {
        const frames = art.dissolve;
        const next = frames ? frames[dissolveIndex(f.fall, frames.length)] : undefined;
        if (next) sprite.img = next;
        placePlate(sprite, fallWidth(f.fall));
        // Whether the falling plate wears its dissolve ('baked') or falls bare ('pending'), for the
        // e2e check that the bake always lands before the fall.
        if (rootRef.current) rootRef.current.dataset.dissolve = next ? 'baked' : 'pending';
      }
      if (t < tl.end) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      cancelAnimationFrame(raf);
      pass?.stop();
    };
  }, []);

  // No onClick / key handler and pointer-events on (via CSS): clicks land here and do nothing, so
  // the cinematic cannot be skipped and nothing underneath is interactable while it plays.
  return (
    <div ref={rootRef} className="first-descent" role="presentation" aria-hidden="true">
      <canvas ref={canvasRef} className="scene-canvas" aria-hidden="true" />
      <div ref={curtainRef} className="first-descent-curtain" />
    </div>
  );
}
