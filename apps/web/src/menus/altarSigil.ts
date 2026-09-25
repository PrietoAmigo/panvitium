/* =============================================================================
   The altar sigil's motion: the "Altar sigil" handoff's keyframes, as numbers
   -----------------------------------------------------------------------------
   The Claude Design handoff animates the in-room Katabasis sigil with CSS keyframes (the prior
   gate's `kat-seal-vibe` / `-pulse` / `-breathe`, with a darker red glow). The room draws the
   seal INTO the degradation pass instead, so it pixelates, crushes and grains with the plate like
   every other diegetic element (ADR-021). A canvas cannot run CSS keyframes, so this module
   samples the same keyframes, frame by frame, for the engine (`degrade.ts`) to paint.

   The CSS semantics are kept: every animation restarts from 0% when the look changes (a class
   swap restarts CSS animations); the vibration is linear between its keyframes while the pulse
   and the glow ease in-out between theirs; the two stacked drop-shadows interpolate their blur
   and their premultiplied colour. Framework-free and DOM-free, like the engine.
   ========================================================================== */

/** The seal's two looks: idle (shown) and armed (after the first press). */
export type AltarSigilLook = 'idle' | 'armed';

/** One drop-shadow of the seal's glow. Blur radius in CSS px; colour premultiplied by alpha. */
export interface SigilGlow {
  readonly blur: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** One sampled frame of the seal, in the design's CSS px, before any stage scaling. */
export interface AltarSigilPose {
  /** Vibration translate (CSS px). Sits inside the pulse scale, which scales it too. */
  readonly dx: number;
  readonly dy: number;
  /** Vibration rotation (radians). */
  readonly rot: number;
  /** Pulse scale. */
  readonly scale: number;
  /** The stacked drop-shadows, inner then outer: the outer is cast from the inner's composite. */
  readonly glow: readonly [SigilGlow, SigilGlow];
}

/** A CSS `cubic-bezier(x1, y1, x2, y2)` timing function: solve x(t) = p for t, return y(t). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    // Newton–Raphson from t = p converges in a few steps for every curve used here…
    let t = p;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - p;
      if (Math.abs(err) < 1e-7 && t >= 0 && t <= 1) return sampleY(t);
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-7) break;
      t -= err / slope;
    }
    // …and bisection (x(t) is monotonic on [0, 1] when x1, x2 lie in it) catches a flat slope.
    let lo = 0;
    let hi = 1;
    t = p;
    for (let i = 0; i < 40; i++) {
      const x = sampleX(t);
      if (Math.abs(x - p) < 1e-7) break;
      if (x < p) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

/** CSS `ease` and `ease-in-out`. */
export const EASE = cubicBezier(0.25, 0.1, 0.25, 1);
export const EASE_IN_OUT = cubicBezier(0.42, 0, 0.58, 1);
const LINEAR = (p: number): number => p;

// ── The keyframes (the handoff's values, which keep menus.css's former `kat-seal-*`) ─────────────

type VibeKey = readonly [at: number, dx: number, dy: number, deg: number];

// kat-seal-vibe, 0.12 s linear: the heavy idle shiver (translate up to ~4px, rotate up to ~1.6deg).
const VIBE: readonly VibeKey[] = [
  [0, 0, 0, 0],
  [0.1, -3, 2, -1.4],
  [0.2, 3, -2, 1.2],
  [0.3, -4, -1, -0.8],
  [0.4, 4, 3, 1.6],
  [0.5, -2, 3, -1.2],
  [0.6, 3, -3, 1],
  [0.7, -4, 1, -1.6],
  [0.8, 2, 2, 0.8],
  [0.9, -3, -2, -1],
  [1, 0, 0, 0],
];

// kat-seal-vibe-strong, 0.07 s linear: the armed shake (translate up to ~12px, rotate up to 4deg).
const VIBE_STRONG: readonly VibeKey[] = [
  [0, 0, 0, 0],
  [0.08, -9, 5, -3.6],
  [0.16, 10, -6, 3.2],
  [0.24, -11, -3, -2.4],
  [0.32, 11, 7, 4],
  [0.4, -6, 8, -3.2],
  [0.5, 9, -8, 2.8],
  [0.6, -12, 3, -4],
  [0.7, 8, 6, 2.2],
  [0.8, -8, -6, -2.8],
  [0.9, 7, 4, 3],
  [1, 0, 0, 0],
];

/** A drop-shadow from its CSS `rgba(r, g, b, a)`, stored premultiplied for interpolation. */
function shadow(blur: number, r: number, g: number, b: number, a: number): SigilGlow {
  return { blur, r: r * a, g: g * a, b: b * a, a };
}

type GlowPair = readonly [SigilGlow, SigilGlow];

interface LookSpec {
  readonly vibe: readonly VibeKey[];
  /** The vibration's period (s). */
  readonly vibeS: number;
  /** The pulse's and the glow's shared period (s); each eases in-out rest → swell → rest. */
  readonly breathS: number;
  readonly pulse: readonly [rest: number, swell: number];
  readonly glow: readonly [rest: GlowPair, swell: GlowPair];
}

const LOOKS: Record<AltarSigilLook, LookSpec> = {
  // kat-seal-pulse (3.4 s, scale .97 ↔ 1.05) + kat-seal-breathe (3.4 s, the darker red glow).
  idle: {
    vibe: VIBE,
    vibeS: 0.12,
    breathS: 3.4,
    pulse: [0.97, 1.05],
    glow: [
      [shadow(12, 215, 50, 30, 0.8), shadow(28, 195, 35, 22, 0.4)],
      [shadow(24, 230, 70, 42, 1), shadow(50, 205, 45, 28, 0.75)],
    ],
  },
  // kat-seal-pulse-armed (1 s, scale 1.55 ↔ 1.78) + kat-seal-breathe-armed (1 s).
  armed: {
    vibe: VIBE_STRONG,
    vibeS: 0.07,
    breathS: 1,
    pulse: [1.55, 1.78],
    glow: [
      [shadow(28, 230, 70, 42, 1), shadow(64, 205, 40, 25, 0.9)],
      [shadow(46, 240, 90, 55, 1), shadow(110, 215, 50, 30, 0.95)],
    ],
  },
};

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

function lerpGlow(a: SigilGlow, b: SigilGlow, u: number): SigilGlow {
  return {
    blur: lerp(a.blur, b.blur, u),
    r: lerp(a.r, b.r, u),
    g: lerp(a.g, b.g, u),
    b: lerp(a.b, b.b, u),
    a: lerp(a.a, b.a, u),
  };
}

/** Where `t` falls in a looping animation of period `s`: 0..1. */
function phaseOf(t: number, s: number): number {
  const p = (t % s) / s;
  return p < 0 ? p + 1 : p;
}

/** The vibration at phase `p`, linear between its keyframes. */
function vibeAt(keys: readonly VibeKey[], p: number): readonly [number, number, number] {
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (p > b[0]) continue;
    const a = keys[i - 1]!;
    const u = (p - a[0]) / (b[0] - a[0]);
    return [lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u)];
  }
  return [0, 0, 0];
}

/**
 * The seal's pose `t` seconds after its look began (the look's animations start at 0% then).
 * Under reduced motion the vibration and the pulse drop and the glow holds still, frozen at the
 * look's first keyframe: the armed seal stays visibly larger, but nothing moves.
 */
export function sampleAltarSigil(look: AltarSigilLook, t: number, still = false): AltarSigilPose {
  const spec = LOOKS[look];
  if (still) {
    return { dx: 0, dy: 0, rot: 0, scale: spec.pulse[0], glow: spec.glow[0] };
  }
  // rest → swell over the first half of the breath, swell → rest over the second, each eased.
  // (ease-in-out is point-symmetric, so easing the mirrored phase equals easing swell → rest.)
  const p = phaseOf(t, spec.breathS);
  const u = EASE_IN_OUT(p < 0.5 ? p * 2 : 2 - p * 2);
  const [rest, swell] = spec.glow;
  const [dx, dy, deg] = vibeAt(spec.vibe, phaseOf(t, spec.vibeS));
  return {
    dx,
    dy,
    rot: (deg * Math.PI) / 180,
    scale: lerp(spec.pulse[0], spec.pulse[1], u),
    glow: [lerpGlow(rest[0], swell[0], u), lerpGlow(rest[1], swell[1], u)],
  };
}

/** A glow's CSS colour, un-premultiplied (for a canvas `shadowColor`). */
export function glowColor(g: SigilGlow): string {
  if (g.a <= 0) return 'rgba(0,0,0,0)';
  const c = (v: number): number => Math.round(Math.min(255, Math.max(0, v / g.a)));
  return `rgba(${c(g.r)},${c(g.g)},${c(g.b)},${Math.min(1, g.a)})`;
}

// ── Transitions (the fade and the pointer feedback), CSS-style ───────────────────────────────────

/** A CSS-style transition of one number: `from` → `to` over `dur` seconds, from `start`. */
export interface Tween {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly dur: number;
  readonly ease: (p: number) => number;
}

/** A value at rest (no transition running). */
export function settled(value: number): Tween {
  return { from: value, to: value, start: 0, dur: 0, ease: LINEAR };
}

/** The tween's value at time `t` (same clock as `start`). */
export function tweenAt(tw: Tween, t: number): number {
  if (tw.dur <= 0 || t >= tw.start + tw.dur) return tw.to;
  if (t <= tw.start) return tw.from;
  return lerp(tw.from, tw.to, tw.ease((t - tw.start) / tw.dur));
}

/**
 * Head for a new target the way CSS restarts a transition mid-flight: from wherever the value is
 * now. An unchanged target keeps its running transition.
 */
export function retarget(
  tw: Tween,
  to: number,
  now: number,
  dur: number,
  ease: (p: number) => number,
): Tween {
  if (tw.to === to) return tw;
  return { from: tweenAt(tw, now), to, start: now, dur, ease };
}

/** The overlay's fade in (kat-ov-in, 0.35 s ease) and its fade out on the idle timeout (0.5 s). */
export const SIGIL_FADE_IN_S = 0.35;
export const SIGIL_FADE_OUT_S = 0.5;

/** The seal button's pointer feedback: :hover scale(1.06), :active scale(.95) over 0.28 s. */
export const SIGIL_HOVER_SCALE = 1.06;
export const SIGIL_PRESS_SCALE = 0.95;
export const SIGIL_POINTER_S = 0.28;
export const SIGIL_POINTER_EASE = cubicBezier(0.2, 0.7, 0.3, 1);
