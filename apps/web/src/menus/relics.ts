// Shared presentation for the maleficia relics: the Loculi reliquary (MaleficiaCabinet) and the
// Unveiling pop-up (MaleficiumUnveiling) both read the rarity palette, the rarity rank, the effect
// headline split and the stage-frame geometry from here (Claude Design, "Loculi Reliquary" handoff).
import type { CSSProperties } from 'react';
import type { Rarity } from './types.js';

/**
 * Both surfaces were authored on a 1280×720 stage. They lay out in a 16:9 frame fitted inside their
 * full-surface overlay (which must be a size container), and every length is a design px scaled to
 * that frame: `stagePx(290)` is 290px on a 1280-wide frame. The room behind scales the same way.
 */
export const STAGE_FRAME: CSSProperties = {
  position: 'absolute',
  inset: 0,
  margin: 'auto',
  width: 'min(100cqw, calc(100cqh * 16 / 9))',
  height: 'min(100cqh, calc(100cqw * 9 / 16))',
  containerType: 'size',
  // Resolved in each descendant against this frame (its nearest size container).
  ['--relic-u' as string]: 'calc(100cqw / 1280)',
};

/** A length in design px, scaled to the fitted stage frame (see `STAGE_FRAME`). */
export function stagePx(n: number): string {
  return `calc(${n} * var(--relic-u))`;
}

/** An sRGB triple, 0..255 per channel. */
export type Rgb = readonly [number, number, number];

/**
 * Rarity → ember palette. One hue per tier: `ember` is the full colour (labels, headline number,
 * outline, light), `wash` the same hue at low alpha (text glow), `ring` a touch stronger (borders).
 */
export const RARITY: Record<Rarity, { ember: string; wash: string; ring: string; rgb: Rgb }> = {
  common: {
    ember: '#caa85f',
    wash: 'rgba(202,168,95,.22)',
    ring: 'rgba(202,168,95,.30)',
    rgb: [202, 168, 95],
  },
  rare: {
    ember: '#54b39b',
    wash: 'rgba(84,179,155,.22)',
    ring: 'rgba(84,179,155,.32)',
    rgb: [84, 179, 155],
  },
  profane: {
    ember: '#9a6fe0',
    wash: 'rgba(154,111,224,.26)',
    ring: 'rgba(154,111,224,.34)',
    rgb: [154, 111, 224],
  },
  anathema: {
    ember: '#c2403f',
    wash: 'rgba(194,64,63,.26)',
    ring: 'rgba(194,64,63,.34)',
    rgb: [194, 64, 63],
  },
};

/** Display order: most potent first. */
export const RANK: Record<Rarity, number> = { anathema: 4, profane: 3, rare: 2, common: 1 };

/** Order relics anathema → common, stable within a tier (a copy; the input is left untouched). */
export function byRarity<T extends { rarity: Rarity }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => RANK[b.rarity] - RANK[a.rarity]);
}

/** An effect line split for display: the headline magnitude and the words that follow it. */
export interface EffectParts {
  /** The leading magnitude ("+25%", "−33%", "+0.8"), with a true minus sign; '' when none leads. */
  readonly headline: string;
  /** The rest of the line ("influence gain rate"); the whole line when no magnitude leads. */
  readonly remainder: string;
  /** True for a consumable's line ("Single-use: …"), whose marker is stripped from both parts. */
  readonly singleUse: boolean;
}

/**
 * Split an effect line into its headline number and remainder, per the handoff: strip the trailing
 * full stop and a leading "Single-use: ", then take a leading signed magnitude (with an optional %)
 * as the headline, its ASCII hyphen set as a true minus (U+2212). No leading magnitude → no headline,
 * the whole line as the remainder.
 */
export function parseEffect(effect: string): EffectParts {
  let s = effect.trim().replace(/\.$/, '');
  const singleUse = /^Single-use:\s*/.test(s);
  if (singleUse) s = s.replace(/^Single-use:\s*/, '');
  const m = /^([+-]?[\d.,]+%?)\s+(.*)$/.exec(s);
  if (!m) return { headline: '', remainder: s, singleUse };
  return { headline: (m[1] ?? '').replace('-', '−'), remainder: m[2] ?? '', singleUse };
}
