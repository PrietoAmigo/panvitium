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
export const LOGOS_THOUGHT_COUNT = 66;

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
 * them. Each moves the fragment's centre along its curve with `transform` and fades it in over the
 * first tenth and out over the last: transform and opacity only, so the compositor runs all of it
 * and the drift costs the main thread nothing per frame. (A CSS motion path, `offset-path`, draws
 * the same curve but animates on the main thread, restyling every fragment every frame.)
 */
export function logosPathKeyframes(steps: number = LOGOS_PATH_STEPS): string {
  return LOGOS_PATHS.map(({ d, reverse }, i) => {
    const n = i + 1;
    const frames = sampleLogosPath(d, reverse, steps).map((p, k) => {
      const at = r1((k * 100) / steps);
      const fade = k === 0 || k === steps ? 'opacity:0;' : '';
      return `${at}%{${fade}transform:translate(${r1(p.x)}px,${r1(p.y)}px) rotate(${r1(p.angle)}deg) translate(-50%,-50%)}`;
    });
    return (
      `@keyframes logos-path-${n}{${frames.join('')}10%{opacity:1}90%{opacity:1}}` +
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
  /** A negative delay, so the field is already mid-drift when the scroll opens. */
  delay: number;
  /** A fragment that flickers (about one in six), with its own flicker period. */
  flicker: { duration: number; delay: number } | null;
}

const EMBER = '#d24a2c';
const CANDLE = '#e6a23c';
const BONE = '#eadcc2';

/**
 * Build the field. Sizes span a wide range (a few huge, faint words among many small ones), speeds
 * are log-uniform between 14 s and 220 s, and colour mixes ember, candle and bone. Deterministic for
 * a given seed.
 */
export function buildLogosThoughts(
  count: number = LOGOS_THOUGHT_COUNT,
  seed = 'obsessio',
): LogosThought[] {
  const rng = makeRng(hashSeed(seed));
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
    const flickers = rng.chance(0.17);
    const flickerDuration = rng.range(2.5, 8.5);
    const flickerDelay = -rng.float() * flickerDuration;
    const blur = huge ? 1.8 : rng.chance(0.18) ? rng.range(1, 2.6) : 0;
    out.push({
      text,
      latin,
      x: Math.round(rng.range(-160, LOGOS_STAGE_W + 160)),
      y: Math.round(rng.range(-120, LOGOS_STAGE_H + 120)),
      rotate: Math.round(rng.range(-75, 75)),
      path: 1 + rng.int(LOGOS_PATH_COUNT),
      fontSize: Math.round(fontSize),
      opacity: Math.round(opacity * 1000) / 1000,
      blur: Math.round(blur * 10) / 10,
      color: tone < 0.4 ? EMBER : tone < 0.52 ? CANDLE : BONE,
      duration: Math.round(duration * 10) / 10,
      delay: Math.round(-rng.float() * duration * 10) / 10,
      flicker: flickers
        ? {
            duration: Math.round(flickerDuration * 10) / 10,
            delay: Math.round(flickerDelay * 10) / 10,
          }
        : null,
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
