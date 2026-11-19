// The Counting House (Depraedatio) in the PC programs' pixel dress: the same 3 px art grid as the
// Orbis Tenebrarum program, on which the account's borders, bevels, dividers, bars, icons and the
// balance sparkline all sit. Pure helpers only (no DOM): the account surface in DepraedatioAccount.tsx
// draws from them and index.css carries the matching rules.
import { BAYER4 } from './pixelArt.js';

/** The art pixel, in CSS px (the Orbis grid). */
export const CH_ART_PX = 3;

/** Peak density of the sparkline's dithered wash, just under the line (it thins to 0 at the floor). */
export const SPARK_WASH_DENSITY = 0.5;

/** One art pixel as an SVG subpath at grid cell (x, y), in CSS px. */
function cell(x: number, y: number, px: number): string {
  return `M${x * px} ${y * px}h${px}v${px}h-${px}z`;
}

/** A pixel sparkline as two SVG path strings, both in CSS px of the drawing box. */
export interface PixelSpark {
  /** The one-pixel stepped line, joined vertically where the series climbs or falls. */
  readonly line: string;
  /** The ordered-dither wash beneath the line. */
  readonly area: string;
}

/**
 * Redraw `series` as pixel art in a `width × height` box: the box is cut into `px`-sized art pixels,
 * `pad` of them kept clear on every side, the series is sampled once per art column (linear between
 * its points) and quantized to a row, and the line is drawn one art pixel thick with vertical joins
 * so it never breaks. Beneath it, a Bayer (4×4) dither whose density falls from
 * `SPARK_WASH_DENSITY` at the top of the plot to nothing at its floor stands in for the old fading
 * gradient. Fewer than two points, or a box too small for two columns, draws nothing.
 */
export function pixelSparkline(
  series: readonly number[],
  width: number,
  height: number,
  px: number = CH_ART_PX,
  pad = 2,
): PixelSpark {
  const gw = Math.floor(width / px);
  const gh = Math.floor(height / px);
  const cols = gw - 2 * pad;
  const top = pad;
  const bot = gh - pad - 1;
  const n = series.length;
  if (n < 2 || cols < 2 || bot <= top) return { line: '', area: '' };

  const mn = Math.min(...series);
  const mx = Math.max(...series);
  const rows: number[] = [];
  for (let c = 0; c < cols; c++) {
    const t = (c / (cols - 1)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(t));
    const f = t - i;
    const v = (series[i] ?? 0) * (1 - f) + (series[i + 1] ?? 0) * f;
    rows.push(top + Math.round((1 - (v - mn) / (mx - mn || 1)) * (bot - top)));
  }

  let line = '';
  let area = '';
  for (let c = 0; c < cols; c++) {
    const x = pad + c;
    const r = rows[c] ?? bot;
    const prev = c > 0 ? (rows[c - 1] ?? r) : r;
    // The column's own pixel, plus the run that joins it to the previous column's row.
    if (prev < r) for (let y = prev + 1; y <= r; y++) line += cell(x, y, px);
    else if (prev > r) for (let y = r; y < prev; y++) line += cell(x, y, px);
    else line += cell(x, r, px);
    for (let y = r + 1; y <= bot; y++) {
      const density = SPARK_WASH_DENSITY * (1 - (y - top) / (bot - top));
      if ((BAYER4[(y & 3) * 4 + (x & 3)] ?? 16) / 16 < density) area += cell(x, y, px);
    }
  }
  return { line, area };
}

/** The account's glyphs, each a 5 × 5 art-pixel path (viewBox `0 0 5 5`), drawn in currentColor. */
export type ChIconName =
  | 'portfolio'
  | 'contracts'
  | 'statements'
  | 'documents'
  | 'settings'
  | 'privacyOff'
  | 'privacyOn';

export const CH_ICONS: Readonly<Record<ChIconName, string>> = {
  // A frame with its right half filled (was ◨).
  portfolio: 'M0 0h5v1h-5z M0 4h5v1h-5z M0 1h1v3h-1z M3 1h2v3h-2z',
  // A page with a folded corner and one line of text (was ❏).
  contracts: 'M0 0h4v1h-4z M0 1h1v3h-1z M3 1h2v1h-2z M4 2h1v2h-1z M0 4h5v1h-5z M1 2h2v1h-2z',
  // A stack of coins (was ⛃).
  statements: 'M1 0h3v1h-3z M0 1h5v1h-5z M1 2h3v1h-3z M0 3h5v1h-5z M1 4h3v1h-3z',
  // Three rules (was ☰).
  documents: 'M0 0h5v1h-5z M0 2h5v1h-5z M0 4h5v1h-5z',
  // A cog (was ⚙).
  settings:
    'M0 0h1v1h-1z M2 0h1v1h-1z M4 0h1v1h-1z M1 1h3v1h-3z M0 2h2v1h-2z M3 2h2v1h-2z M1 3h3v1h-3z M0 4h1v1h-1z M2 4h1v1h-1z M4 4h1v1h-1z',
  // A ring with a pip, figures shown (was ◎).
  privacyOff: 'M1 0h3v1h-3z M0 1h1v3h-1z M4 1h1v3h-1z M1 4h3v1h-3z M2 2h1v1h-1z',
  // The ring filled, figures masked (was ◉).
  privacyOn: 'M1 0h3v1h-3z M0 1h1v3h-1z M4 1h1v3h-1z M1 4h3v1h-3z M1 1h3v3h-3z',
};

/** The balance delta's rising mark, a 3 × 2 art-pixel path (viewBox `0 0 3 2`; was ▲). */
export const CH_DELTA_UP = 'M1 0h1v1h-1z M0 1h3v1h-3z';

/** `#rrggbb` → its three channels, or null when the string is not that shape. */
function channels(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return [parseInt(m[1] ?? '0', 16), parseInt(m[2] ?? '0', 16), parseInt(m[3] ?? '0', 16)];
}

/**
 * `a` moved toward `b` by `t` (0..1, clamped), both `#rrggbb`: the bevel tones of the account accent
 * (its lit top edge and its shaded foot). A malformed input returns `a` unchanged.
 */
export function mixHex(a: string, b: string, t: number): string {
  const A = channels(a);
  const B = channels(b);
  if (!A || !B) return a;
  const k = Math.max(0, Math.min(1, t));
  return (
    '#' +
    A.map((v, i) => {
      const s = Math.round(v + ((B[i] ?? v) - v) * k).toString(16);
      return s.length < 2 ? `0${s}` : s;
    }).join('')
  );
}
