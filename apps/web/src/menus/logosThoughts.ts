import { strings } from '@panvitium/shared';
import { hashSeed, makeRng } from '@panvitium/sim';

/**
 * The Chthonic Logos's drifting thoughts (Obsessio): the intrusive fragments that crowd the player's
 * mind behind the rites. Pure layout data, no game state: each fragment is placed, tilted, sized,
 * faded, blurred and timed from one seeded stream, so the field is identical every time the scroll
 * opens. The motion itself is a CSS animation (`.logos-mote` riding one of the `logos-path-N`
 * keyframes built by `logosPathKeyframes`), so a fragment never re-renders while it drifts.
 *
 * The Latin is the voice and stays untranslated (ADR-020), so it lives here; the English fragments
 * are player-facing copy and live in strings.ts.
 */
export const LOGOS_LATIN: readonly string[] = [
  'iterum',
  'iterum iterum',
  'semper',
  'mea culpa',
  'non possum tacere',
  'vox clamantis',
  'legio nomen mihi',
  'obsessio',
  'da mihi animas',
  'memento mori',
  'svadeo tibi',
  'qvi tacet consentire videtvr',
  'tenebrae',
];

/** How many fragments drift behind the rites. */
export const LOGOS_THOUGHT_COUNT = 33;

/** The whole field's faintness, applied to every fragment's colour (on top of its own opacity). It
 *  never changes, whatever the rites are doing: the field looks and moves the same throughout. */
export const LOGOS_FIELD_DIM = 0.62;

/** When the scroll opens its mind is empty: each fragment surfaces at its own moment in this span
 *  (seconds), so they arrive gradually and in no order (see `buildLogosThoughts`). */
export const LOGOS_ENTRANCE: { readonly from: number; readonly to: number } = { from: 0.3, to: 8 };

/** How long a fragment stays gone after it reaches the end of its path, before it surfaces again at
 *  the start (seconds; each fragment draws its own). */
export const LOGOS_RETURN: { readonly min: number; readonly max: number } = { min: 3, max: 5 };

/**
 * The curved paths a fragment rides, in design px around its anchor (SVG path syntax; absolute
 * M / C / S / Q only), two of them curling back on themselves. 1-3 run rightward; 4-6 run leftward
 * and are ridden reversed, so the words stay upright.
 */
export const LOGOS_PATHS: readonly { d: string; reverse: boolean }[] = [
  { d: 'M -500 0 C -250 -160 -60 160 120 -10 S 380 -120 500 40', reverse: false },
  {
    d: 'M -500 40 C -300 40 -200 -200 -40 -120 C 120 -40 40 120 -60 80 C -160 40 200 -60 500 -20',
    reverse: false,
  },
  { d: 'M -500 -20 Q -100 220 500 -60', reverse: false },
  { d: 'M 500 0 C 260 140 60 -160 -120 0 S -380 120 -500 -30', reverse: true },
  {
    d: 'M 500 -30 C 300 -30 180 180 30 100 C -120 20 -20 -110 90 -60 C 200 -10 -250 60 -500 10',
    reverse: true,
  },
  { d: 'M 500 30 Q 0 -200 -500 30', reverse: true },
];

/** The number of curved paths a fragment can ride (`logos-path-1` … `-6`). */
export const LOGOS_PATH_COUNT = LOGOS_PATHS.length;

/** Keyframes per path: enough that the sampled polyline reads as the curve at drifting speeds. */
export const LOGOS_PATH_STEPS = 48;

type Point = readonly [number, number];

/** Flatten an absolute M / C / S / Q path into a dense polyline. */
function flattenPath(d: string): Point[] {
  const tokens = d.match(/[MCSQ]|-?\d*\.?\d+/g) ?? [];
  const pts: Point[] = [];
  let i = 0;
  let cur: Point = [0, 0];
  let lastCubicCtrl: Point | null = null;
  const num = (): number => Number(tokens[i++]);
  const cubic = (c1: Point, c2: Point, end: Point): void => {
    for (let k = 1; k <= 64; k++) {
      const t = k / 64;
      const u = 1 - t;
      pts.push([
        u * u * u * cur[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
        u * u * u * cur[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
      ]);
    }
    lastCubicCtrl = c2;
    cur = end;
  };
  let cmd = '';
  while (i < tokens.length) {
    const tok = tokens[i] ?? '';
    if (/^[MCSQ]$/.test(tok)) {
      cmd = tok;
      i++;
    }
    if (cmd === 'M') {
      cur = [num(), num()];
      pts.push(cur);
      lastCubicCtrl = null;
    } else if (cmd === 'C') {
      const c1: Point = [num(), num()];
      const c2: Point = [num(), num()];
      cubic(c1, c2, [num(), num()]);
    } else if (cmd === 'S') {
      const prev: Point | null = lastCubicCtrl;
      const c1: Point = prev ? [2 * cur[0] - prev[0], 2 * cur[1] - prev[1]] : cur;
      const c2: Point = [num(), num()];
      cubic(c1, c2, [num(), num()]);
    } else if (cmd === 'Q') {
      const c: Point = [num(), num()];
      const end: Point = [num(), num()];
      for (let k = 1; k <= 64; k++) {
        const t = k / 64;
        const u = 1 - t;
        pts.push([
          u * u * cur[0] + 2 * u * t * c[0] + t * t * end[0],
          u * u * cur[1] + 2 * u * t * c[1] + t * t * end[1],
        ]);
      }
      lastCubicCtrl = null;
      cur = end;
    } else {
      throw new Error(`logosThoughts: unsupported path command in "${d}"`);
    }
  }
  return pts;
}

/** One sample along a path: where the fragment's centre is, and its heading in degrees. */
export interface LogosPathSample {
  x: number;
  y: number;
  angle: number;
}

/**
 * Sample a path at `steps + 1` points evenly spaced by arc length (so a fragment drifts at a constant
 * speed), each with its tangent heading. Headings are unwrapped so consecutive samples never differ
 * by more than half a turn, and a reversed path is turned half a turn so its words stay upright.
 */
export function sampleLogosPath(d: string, reverse: boolean, steps: number): LogosPathSample[] {
  const pts = flattenPath(d);
  const cum: number[] = [0];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!;
    const b = pts[k]!;
    cum.push(cum[k - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1] ?? 0;
  const out: LogosPathSample[] = [];
  let j = 1;
  let prevAngle: number | null = null;
  for (let s = 0; s <= steps; s++) {
    const target = (total * s) / steps;
    while (j < pts.length - 1 && cum[j]! < target) j++;
    const a = pts[j - 1]!;
    const b = pts[j]!;
    const span = cum[j]! - cum[j - 1]!;
    const f = span > 0 ? Math.min(1, Math.max(0, (target - cum[j - 1]!) / span)) : 0;
    let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + (reverse ? 180 : 0);
    if (prevAngle !== null) {
      while (angle - prevAngle > 180) angle -= 360;
      while (angle - prevAngle < -180) angle += 360;
    }
    prevAngle = angle;
    out.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, angle });
  }
  return out;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * The drift's keyframes, one `logos-path-N` per path, plus the `.logos-path-N` classes that pick
 * them. Each moves the fragment's centre along its curve with `transform` only, so the compositor
 * runs all of it and the drift costs the main thread nothing per frame. (A CSS motion path,
 * `offset-path`, draws the same curve but animates on the main thread, restyling every fragment
 * every frame.) No fade: a fragment holds its faintness the whole way round, and an opacity
 * animated on it would make the compositor render its slithering letters offscreen every frame.
 */
export function logosPathKeyframes(steps: number = LOGOS_PATH_STEPS): string {
  return LOGOS_PATHS.map(({ d, reverse }, i) => {
    const n = i + 1;
    const frames = sampleLogosPath(d, reverse, steps).map((p, k) => {
      const at = r1((k * 100) / steps);
      return `${at}%{transform:translate(${r1(p.x)}px,${r1(p.y)}px) rotate(${r1(p.angle)}deg) translate(-50%,-50%)}`;
    });
    return (
      `@keyframes logos-path-${n}{${frames.join('')}}` +
      `.logos-path-${n}{animation-name:logos-path-${n}}`
    );
  }).join('\n');
}

/** The 1280×720 design stage the scroll is laid out on (scaled to fit the screen). */
export const LOGOS_STAGE_W = 1280;
export const LOGOS_STAGE_H = 720;

/** One drifting fragment, in design px on the stage. */
export interface LogosThought {
  text: string;
  /** Latin (Cinzel caps) or the player's English (Garamond italic). */
  latin: boolean;
  /** The point its path is centred on. Spills past the stage so letterboxing still drifts. */
  x: number;
  y: number;
  /** Heading of its path, in degrees (never past ±75°, so the words stay readable). */
  rotate: number;
  /** Which curved path it rides, 1..LOGOS_PATH_COUNT. */
  path: number;
  fontSize: number;
  opacity: number;
  /** Softness in px (a Gaussian's spread); 0 for a sharp fragment. Drawn as a text-shadow, so it
   *  is rasterised once rather than refiltered as the fragment moves. */
  blur: number;
  color: string;
  /** One traversal of its path, in seconds. */
  duration: number;
  /** How long it stays gone at the end of its path before surfacing again (LOGOS_RETURN). */
  gap: number;
  /** One whole round: its traversal, then its absence (`duration + gap`), in seconds. */
  cycle: number;
  /** When it first surfaces after the scroll opens, in seconds (LOGOS_ENTRANCE): a positive delay
   *  on both its drift and its presence, so it is hidden until then and enters at its path's start. */
  enter: number;
  /** The drift's easing over a round: along the path in the traversal, then held at its end. */
  driftEasing: string;
  /** The presence's easing over a round: shown for the traversal, then gone (scaled to nothing). */
  presenceEasing: string;
  /** Its body, one vertebra per character in reading order, phased from head to tail. */
  vertebrae: LogosVertebra[];
  /** One undulation of the body, in seconds: larger fragments slither slower. */
  slither: number;
}

/** One letter of a slithering fragment (see `logosVertebrae`). */
export interface LogosVertebra {
  ch: string;
  /** The `logos-slither-*` keyframes it rides: its voice, its heading and its share of the swing. */
  keyframes: string;
  /** Its size in ems of the fragment: the body narrows toward the tail. */
  size: number;
  /** A negative delay that sets its phase on the wave. */
  delay: number;
}

/**
 * The serpents (Claude Design, "Serpent Words"): every drifting fragment slithers as it drifts.
 * Each letter is a vertebra riding one sine wave, raised by the wave and turned with its slope; its
 * phase runs from the head, the letter leading the drift, back to the tail. Tuned on the design
 * canvas.
 */
export const LOGOS_SERPENT = {
  /** A vertebra's peak sway at full share, in ems of its own size. */
  amplitude: 0.5,
  /** Letters per wave. */
  wavelength: 9.5,
  /** One undulation of an 18 px fragment, in seconds. */
  period: 2.2,
  /** How far the body narrows: the tail letter is `1 - taper` em. */
  taper: 0.25,
} as const;

/** A vertebra's share of the swing: the head stays steadier, the body sways fully from 40% back.
 *  Quantised to these levels so every vertebra rides one of a few fixed keyframe sets. */
export const LOGOS_SWAY_LEVELS: readonly number[] = [0.35, 0.675, 1];

/** A letter's advance in ems, which sets how steep the wave runs through it: Latin capitals carry
 *  wide tracking, the English italic is narrow. */
const LATIN_PITCH = 0.86;
const NOTE_PITCH = 0.5;

/** Steps per undulation in the slither keyframes (every 30°). */
export const LOGOS_SLITHER_STEPS = 12;

/** The keyframes a vertebra rides, by voice, heading (east: head last; west: head first) and level. */
export function logosSlitherName(latin: boolean, headFirst: boolean, level: number): string {
  return `logos-slither-${latin ? 'latin' : 'note'}-${headFirst ? 'w' : 'e'}${level}`;
}

/** The peak tilt, in degrees, that keeps a full-share vertebra along the wave's slope in a voice. */
export function logosSlitherTilt(latin: boolean): number {
  const { amplitude, wavelength } = LOGOS_SERPENT;
  const gradient = (2 * Math.PI * amplitude) / (wavelength * (latin ? LATIN_PITCH : NOTE_PITCH));
  return (Math.atan(gradient) * 180) / Math.PI;
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * The slither's keyframes, one set per voice, heading and sway level: a vertebra rises by
 * `amplitude · sway · sin θ` em and turns by `tilt · sway · cos θ` (the slope; its sign flips with
 * the heading, as the wave runs the other way along the word). Fixed values, transform only: the
 * compositor runs them, where keyframes reading custom properties would be re-resolved on the main
 * thread for every vertebra at every style pass.
 */
export function logosSlitherKeyframes(steps: number = LOGOS_SLITHER_STEPS): string {
  const out: string[] = [];
  for (const latin of [true, false]) {
    const tilt = logosSlitherTilt(latin);
    for (const headFirst of [false, true]) {
      const bend = headFirst ? 1 : -1;
      LOGOS_SWAY_LEVELS.forEach((sway, level) => {
        const frames: string[] = [];
        for (let k = 0; k <= steps; k++) {
          const theta = (2 * Math.PI * k) / steps;
          const y = r3(-LOGOS_SERPENT.amplitude * sway * Math.sin(theta)) || 0;
          const turn = r1(tilt * bend * sway * Math.cos(theta)) || 0;
          frames.push(`${r3((k * 100) / steps)}%{transform:translateY(${y}em) rotate(${turn}deg)}`);
        }
        out.push(`@keyframes ${logosSlitherName(latin, headFirst, level)}{${frames.join('')}}`);
      });
    }
  }
  return out.join('\n');
}

/**
 * A fragment's body. `headFirst` when it is ridden leftward (its first letter leads); `phase` (0..1)
 * offsets its wave from its neighbours'. Each vertebra's phase trails the head's by its distance
 * back over the wavelength, so the wave runs from the head to the tail.
 */
export function logosVertebrae(
  text: string,
  latin: boolean,
  headFirst: boolean,
  phase: number,
  slither: number,
): LogosVertebra[] {
  const chars = Array.from(text);
  const n = chars.length;
  const { wavelength, taper } = LOGOS_SERPENT;
  const top = LOGOS_SWAY_LEVELS.length - 1;
  return chars.map((ch, j) => {
    const back = headFirst ? j : n - 1 - j;
    const tail = n > 1 ? back / (n - 1) : 0;
    const f = (((phase - back / wavelength) % 1) + 1) % 1;
    const level = Math.round(Math.min(1, tail / 0.4) * top);
    return {
      ch,
      keyframes: logosSlitherName(latin, headFirst, level),
      size: r3(1 - taper * tail),
      delay: r3(-f * slither) || 0,
    };
  });
}

const EMBER = '#d24a2c';
const CANDLE = '#e6a23c';
const BONE = '#eadcc2';

/**
 * Build the field. Sizes span a wide range (a few huge, faint words among many small ones), speeds
 * are log-uniform between 14 s and 220 s, and colour mixes ember, candle and bone. Each fragment
 * surfaces at its own moment after the scroll opens, rides its path once, vanishes at the end and
 * surfaces again at the start 3-5 s later, round after round. Deterministic for a given seed.
 */
export function buildLogosThoughts(
  count: number = LOGOS_THOUGHT_COUNT,
  seed = 'obsessio',
): LogosThought[] {
  const rng = makeRng(hashSeed(seed));
  // Its own stream, so the field's look and placement stay where they were.
  const timing = makeRng(hashSeed(`${seed}:cycle`));
  // The entrance is stratified: each fragment takes a shuffled slot of the span and a random moment
  // within it, so they surface steadily but irregularly, in no order and never in a burst.
  const slots = Array.from({ length: count }, (_, k) => k);
  for (let k = count - 1; k > 0; k--) {
    const j = timing.int(k + 1);
    [slots[k], slots[j]] = [slots[j]!, slots[k]!];
  }
  const slotSpan = (LOGOS_ENTRANCE.to - LOGOS_ENTRANCE.from) / Math.max(1, count);
  const english = strings.opera.logosThoughts;
  const out: LogosThought[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rng.float();
    const huge = roll < 0.09;
    const mid = !huge && roll < 0.3;
    const latin = rng.chance(0.45);
    const pool = latin || english.length === 0 ? LOGOS_LATIN : english;
    const text = pool[rng.int(pool.length)] ?? '';
    const fontSize = huge ? rng.range(80, 140) : mid ? rng.range(24, 46) : rng.range(9, 23);
    const opacity = huge
      ? rng.range(0.03, 0.055)
      : mid
        ? rng.range(0.06, 0.12)
        : rng.range(0.09, 0.22);
    const duration = Math.exp(rng.range(Math.log(14), Math.log(220)));
    const tone = rng.float();
    // The retired flicker's three draws, still taken so every later draw (and so each fragment's
    // softness, place, path and phase) stays where it was.
    rng.chance(0.17);
    rng.range(2.5, 8.5);
    rng.float();
    const blur = huge ? 1.8 : rng.chance(0.18) ? rng.range(1, 2.6) : 0;
    const x = Math.round(rng.range(-160, LOGOS_STAGE_W + 160));
    const y = Math.round(rng.range(-120, LOGOS_STAGE_H + 120));
    const rotate = Math.round(rng.range(-75, 75));
    const path = 1 + rng.int(LOGOS_PATH_COUNT);
    // The retired mid-drift start (the field now enters gradually instead), still drawn.
    rng.float();
    const traversal = Math.round(duration * 10) / 10;
    const gap = r1(timing.range(LOGOS_RETURN.min, LOGOS_RETURN.max));
    const cycle = r1(traversal + gap);
    const held = Math.round((traversal / cycle) * 100000) / 1000;
    // The serpent draws nothing from the stream (its phase is the index's golden-ratio step), so the
    // field's placement, timing and look are exactly what they were before it slithered.
    const headFirst = LOGOS_PATHS[path - 1]?.reverse ?? false;
    const slither =
      Math.round(LOGOS_SERPENT.period * Math.pow(Math.round(fontSize) / 18, 0.4) * 100) / 100;
    out.push({
      text,
      latin,
      x,
      y,
      rotate,
      path,
      fontSize: Math.round(fontSize),
      opacity: Math.round(opacity * 1000) / 1000,
      blur: Math.round(blur * 10) / 10,
      color: tone < 0.4 ? EMBER : tone < 0.52 ? CANDLE : BONE,
      duration: traversal,
      gap,
      cycle,
      enter: r1(LOGOS_ENTRANCE.from + ((slots[i] ?? i) + timing.float()) * slotSpan),
      driftEasing: `linear(0, 1 ${held}%, 1)`,
      presenceEasing: `linear(0, 0 ${held}%, 1 ${held}%, 1)`,
      vertebrae: logosVertebrae(text, latin, headFirst, (i * 0.6180339887) % 1, slither),
      slither,
    });
  }
  return out;
}

/** One copy in a rite's echo trail, in design px relative to the word. */
export interface LogosEcho {
  dx: number;
  dy: number;
  rotate: number;
  scale: number;
  opacity: number;
  /** Softness in px, drawn as a text-shadow (see `LogosThought.blur`). */
  blur: number;
  /** Ember at rest, candle-gold once lit, dried blood when sealed. */
  color: string;
  /** Lit while the rite is spoken, once its progress has passed this echo's share. */
  lit: boolean;
  /** Pulse period in seconds: slow at rest, quicker when dwelt on, frantic while spoken. */
  duration: number;
  delay: number;
}

/** Echoes in each rite's trail. */
export const LOGOS_ECHO_COUNT = 6;

/**
 * A rite's echo trail. It rises up and to the right of the word; dwelling on the rite spreads it,
 * speaking it spreads it further with progress, and each echo catches light in turn, so progress
 * reads as a count of lit echoes (`progress` is 0..100). A sealed rite is only echoes: dimmer
 * through blur, pulsing fast.
 */
export function logosEchoes(opts: {
  sealed: boolean;
  held: boolean;
  active: boolean;
  progress: number;
}): LogosEcho[] {
  const { sealed, held, active } = opts;
  const p = active ? Math.min(100, Math.max(0, opts.progress)) : 0;
  const litCount = active ? Math.floor((p / 100) * LOGOS_ECHO_COUNT + 1e-6) : 0;
  // The spread steps with each echo that catches the light (not with every progress tick), so the
  // trail only moves six times per rite rather than restarting its transition ten times a second.
  const spread = active ? 1.4 + (litCount / LOGOS_ECHO_COUNT) * 0.9 : held ? 1.75 : 1;
  const out: LogosEcho[] = [];
  for (let k = 0; k < LOGOS_ECHO_COUNT; k++) {
    const n = k + 1;
    const lit = n <= litCount;
    const fade = 1 - k / (LOGOS_ECHO_COUNT + 1);
    const base = sealed ? 0.42 : active ? (lit ? 0.8 : 0.2) : held ? 0.5 : 0.28;
    out.push({
      dx: Math.round(n * 12 * spread * 10) / 10,
      dy: Math.round(-n * n * 0.85 * spread * 10) / 10,
      rotate: Math.round(-n * 1.15 * spread * 100) / 100,
      scale: Math.round((1 + n * 0.03) * 1000) / 1000,
      opacity: Math.round(base * (lit ? 1 : fade) * 1000) / 1000,
      blur: Math.round((n * 0.55 + (sealed ? 1.8 : 0)) * 100) / 100,
      color: sealed ? '#9a3424' : lit ? '#f2ac52' : '#c2462e',
      lit,
      duration: sealed ? 0.75 : active ? 0.9 : held ? 1.6 : 3.6,
      delay: Math.round(-k * 0.3 * 100) / 100,
    });
  }
  return out;
}
