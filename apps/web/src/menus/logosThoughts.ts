import { strings } from '@panvitium/shared';
import { hashSeed, makeRng } from '@panvitium/sim';

/**
 * The Chthonic Logos's drifting thoughts (Obsessio): the intrusive fragments that crowd the player's
 * mind behind the rites. Pure layout data, no game state: each fragment is placed, tilted, sized,
 * faded, blurred and timed from one seeded stream, so the field is identical every time the scroll
 * opens. The motion itself is CSS (`.logos-mote` riding one of the `.logos-path-N` curves in
 * menus.css), so a fragment never re-renders while it drifts.
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

/** The number of curved paths a fragment can ride (`.logos-path-1` … `-6` in menus.css). */
export const LOGOS_PATH_COUNT = 6;

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
  /** Gaussian blur in px; 0 for a sharp fragment. */
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
  blur: number;
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
  const spread = active ? 1.4 + (p / 100) * 0.9 : held ? 1.75 : 1;
  const out: LogosEcho[] = [];
  for (let k = 0; k < LOGOS_ECHO_COUNT; k++) {
    const n = k + 1;
    const lit = active && p >= (n / LOGOS_ECHO_COUNT) * 100 - 0.01;
    const fade = 1 - k / (LOGOS_ECHO_COUNT + 1);
    const base = sealed ? 0.42 : active ? (lit ? 0.8 : 0.2) : held ? 0.5 : 0.28;
    out.push({
      dx: Math.round(n * 12 * spread * 10) / 10,
      dy: Math.round(-n * n * 0.85 * spread * 10) / 10,
      rotate: Math.round(-n * 1.15 * spread * 100) / 100,
      scale: Math.round((1 + n * 0.03) * 1000) / 1000,
      opacity: Math.round(base * (lit ? 1 : fade) * 1000) / 1000,
      blur: Math.round((n * 0.55 + (sealed ? 1.8 : 0)) * 100) / 100,
      lit,
      duration: sealed ? 0.75 : active ? 0.9 : held ? 1.6 : 3.6,
      delay: Math.round(-k * 0.3 * 100) / 100,
    });
  }
  return out;
}
