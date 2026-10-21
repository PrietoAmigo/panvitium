/* =============================================================================
   The altar's glow, cast into the room
   -----------------------------------------------------------------------------
   The altar sigil and STATUS QUO are crisp chrome over the room's canvas, but the light they
   cast is part of the room: it goes through the degradation pass (pixelated, crushed, grained)
   while the seal and the label stay sharp above it.

   The DOM stays the one source of truth for how that light moves. Invisible anchors carry the
   geometry and the CSS animations and transitions (menus.css): the glyph itself, plus the hidden
   `.altar-sigil-aura`, `.altar-sq-bloom` and `.altar-sq-line`. `altarGlows` samples them on every
   frame the pass renders (their live boxes, opacities and the glyph's `--seal-breath`) and turns
   them into engine glows. The look (colours, blur radii, gradient stops) lives here.
   ========================================================================== */

import type { EngineGlow, EngineGlowShadow, EngineGlowStops } from './degrade.js';

/** One drop-shadow in CSS px (in the glyph's own space, before its scale), colour as rgba parts. */
type ShadowSpec = readonly [blur: number, r: number, g: number, b: number, a: number];

interface SealLook {
  /** The silhouette's own tint, under the crisp glyph. */
  readonly fill: string;
  /** Rest and swell of the breath; the glow eases between them as `--seal-breath` runs 0 to 1. */
  readonly rest: readonly ShadowSpec[];
  readonly swell: readonly ShadowSpec[];
}

/** The seal's glow: a deep crimson hugging the strokes. */
export const SEAL_IDLE: SealLook = {
  fill: 'rgb(170, 14, 9)',
  rest: [
    [6, 170, 14, 9, 1],
    [20, 180, 15, 10, 1],
    [46, 150, 10, 7, 1],
  ],
  swell: [
    [8, 185, 18, 11, 1],
    [30, 195, 20, 12, 1],
    [62, 160, 12, 8, 1],
  ],
};

export const SEAL_ARMED: SealLook = {
  fill: 'rgb(180, 15, 10)',
  rest: [
    [9, 180, 15, 10, 1],
    [30, 190, 17, 11, 1],
    [70, 155, 11, 7, 1],
  ],
  swell: [
    [12, 195, 20, 12, 1],
    [44, 205, 22, 13, 1],
    [100, 165, 13, 8, 1],
  ],
};

/** The seal of Semet's glow: a deep amber hugging the strokes, in place of the crimson. It stays
 *  well below the art's gold, so the crisp strokes stand clear of the pixelated glow, as the cream
 *  seal does on its crimson (a gold-on-gold glow made the sharp art read as pixelated). */
export const SEAL_SEMET: SealLook = {
  fill: 'rgb(120, 74, 10)',
  rest: [
    [6, 130, 82, 12, 1],
    [20, 140, 90, 14, 1],
    [46, 110, 66, 10, 1],
  ],
  swell: [
    [8, 150, 96, 16, 1],
    [30, 160, 104, 18, 1],
    [62, 124, 76, 12, 1],
  ],
};

export const SEAL_SEMET_ARMED: SealLook = {
  fill: 'rgb(130, 82, 12)',
  rest: [
    [9, 140, 88, 14, 1],
    [30, 150, 96, 16, 1],
    [70, 118, 72, 11, 1],
  ],
  swell: [
    [12, 160, 104, 18, 1],
    [44, 170, 112, 20, 1],
    [100, 132, 82, 13, 1],
  ],
};

/** The seal of Semet's wide aura: a dim gold, where the Katabasis sigil's is crimson. */
export const AURA_STOPS_SEMET: EngineGlowStops = [
  [0, 'rgba(201, 162, 39, 0.5)'],
  [0.4, 'rgba(170, 130, 30, 0.3)'],
  [0.7, 'rgba(120, 90, 20, 0.12)'],
  [1, 'rgba(120, 90, 20, 0)'],
];

/** The seal's wide aura, filling its anchor's box. */
export const AURA_STOPS: EngineGlowStops = [
  [0, 'rgba(150, 10, 7, 0.6)'],
  [0.4, 'rgba(125, 7, 5, 0.38)'],
  [0.7, 'rgba(95, 4, 4, 0.16)'],
  [1, 'rgba(95, 4, 4, 0)'],
];

/** STATUS QUO's soft bloom behind the word. */
export const BLOOM_STOPS: EngineGlowStops = [
  [0, 'rgba(235, 30, 18, 0.55)'],
  [0.55, 'rgba(200, 20, 12, 0.22)'],
  [1, 'rgba(200, 20, 12, 0)'],
];

/** STATUS QUO's line beneath the word, its ends fading out, and its glow (CSS px). */
export const LINE_STOPS: EngineGlowStops = [
  [0, 'rgba(255, 45, 25, 0)'],
  [0.22, 'rgba(255, 45, 25, 0.9)'],
  [0.5, 'rgba(255, 120, 90, 1)'],
  [0.78, 'rgba(255, 45, 25, 0.9)'],
  [1, 'rgba(255, 45, 25, 0)'],
];
export const LINE_SHADOWS: readonly ShadowSpec[] = [
  [4, 255, 50, 28, 1],
  [10, 240, 30, 18, 0.9],
];

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A CSS number from computed style, or `fallback` when it is empty or not a number. */
function cssNumber(value: string, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/** An element's live opacity (its CSS animations and transitions included). */
function opacityOf(el: Element): number {
  return clamp01(cssNumber(getComputedStyle(el).opacity, 1));
}

/** Shadows in CSS px, scaled by `px` (stage-width fraction per CSS px of the shape's own space). */
function shadows(
  rest: readonly ShadowSpec[],
  swell: readonly ShadowSpec[],
  breath: number,
  px: number,
): EngineGlowShadow[] {
  return rest.map((r, i) => {
    const s = swell[i] ?? r;
    const c = (k: 1 | 2 | 3): number => Math.round(lerp(r[k], s[k], breath));
    return {
      blur: lerp(r[0], s[0], breath) * px,
      color: `rgba(${c(1)}, ${c(2)}, ${c(3)}, ${lerp(r[4], s[4], breath)})`,
    };
  });
}

/**
 * The glows the altar sigil and STATUS QUO cast, sampled from the live DOM under `root` (the room
 * stage). Empty when the sigil is not up or the stage has no size yet.
 */
export function altarGlows(root: ParentNode | null): EngineGlow[] {
  const layer = root?.querySelector<HTMLElement>('.altar-sigil');
  if (!layer) return [];
  const stage = layer.getBoundingClientRect();
  if (stage.width <= 0 || stage.height <= 0) return [];
  const box = (el: Element): { x: number; y: number; w: number; h: number } => {
    const r = el.getBoundingClientRect();
    return {
      x: (r.left + r.width / 2 - stage.left) / stage.width,
      y: (r.top + r.height / 2 - stage.top) / stage.height,
      w: r.width / stage.width,
      h: r.height / stage.height,
    };
  };
  const fade = opacityOf(layer);
  const semet = layer.querySelector('.altar-sigil-btn.is-semet') !== null;
  const glows: EngineGlow[] = [];

  const aura = layer.querySelector('.altar-sigil-aura');
  if (aura) {
    glows.push({
      kind: 'ellipse',
      ...box(aura),
      stops: semet ? AURA_STOPS_SEMET : AURA_STOPS,
      alpha: fade * opacityOf(aura),
    });
  }

  const glyph = layer.querySelector<HTMLImageElement>('.altar-sigil-glyph');
  if (glyph && glyph.complete && glyph.naturalWidth > 0 && glyph.offsetWidth > 0) {
    const armed = glyph.closest('.is-armed') !== null;
    const look = semet ? (armed ? SEAL_SEMET_ARMED : SEAL_SEMET) : armed ? SEAL_ARMED : SEAL_IDLE;
    const breath = clamp01(cssNumber(getComputedStyle(glyph).getPropertyValue('--seal-breath'), 0));
    // The glyph's live box takes its pulse, pointer scale and shake; the art keeps its aspect.
    const b = box(glyph);
    const widthPx = b.w * stage.width;
    const scale = widthPx / glyph.offsetWidth;
    glows.push({
      kind: 'silhouette',
      img: glyph,
      x: b.x,
      y: b.y,
      w: b.w,
      h: (widthPx * (glyph.naturalHeight / glyph.naturalWidth)) / stage.height,
      fill: look.fill,
      shadows: shadows(look.rest, look.swell, breath, scale / stage.width),
      alpha: fade,
    });
  }

  const sq = layer.querySelector('.altar-sq');
  if (sq) {
    const sqAlpha = fade * opacityOf(sq);
    const bloom = sq.querySelector('.altar-sq-bloom');
    if (bloom) {
      glows.push({
        kind: 'ellipse',
        ...box(bloom),
        stops: BLOOM_STOPS,
        alpha: sqAlpha * opacityOf(bloom),
      });
    }
    const line = sq.querySelector('.altar-sq-line');
    if (line) {
      glows.push({
        kind: 'bar',
        ...box(line),
        stops: LINE_STOPS,
        shadows: shadows(LINE_SHADOWS, LINE_SHADOWS, 0, 1 / stage.width),
        alpha: sqAlpha * opacityOf(line),
      });
    }
  }
  return glows;
}
