/**
 * The Ars Goetia invocation plates (Claude Design, "Invocation Plates" handoff): one plate for every
 * sim invocation, in the design's seed order; each a 600 × 800 SVG over the 300 × 400 design box,
 * layered bottom to top as base fill, stone, vignette, then the paint under the wobble, with the
 * stone cycled by plate and the paint in the one ochre. And the baked PNGs the grimoire loads: one
 * per plate at 2×, each baked from the current SVG (the bake records the digest of what it
 * rasterized, so a plate retuned but not re-baked fails here).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { INVOCATION_IDS } from '@panvitium/sim';
import { PAINT } from './brush.js';
import {
  INVOCATION_PLATE_IDS,
  invocationPlateSvg,
  plateFingerprint,
  plateSeed,
} from './invocationPlates.js';
import baked from './invocationPlates.baked.json';

/** The handoff's plate order, which seeds the strokes. */
const DESIGN_ORDER = [
  'familiar',
  'wendigo',
  'blob',
  'empusa',
  'kobold',
  'imp',
  'banshee',
  'narcissus',
  'arachne',
  'upir',
  'lamia',
  'behemoth',
  'harpy',
  'plutus',
  'nightmare',
  'fama',
  'lemure',
  'midas',
  'aurevora',
  'doppelgaenger',
  'succubus',
  'specunitas',
  'astiwihad',
  'erinyes',
  'morpheus',
];

// By path: jsdom's URL would resolve a relative file URL against its http://localhost page.
const BAKED_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../public/assets/panvitium/invocations-ars-goetia',
);

/** The plate's SVG, which every known id has. */
const svgOf = (id: string): string => invocationPlateSvg(id)!;

/** The painted layer: the markup inside the wobbled group. */
function paintOf(svg: string): string {
  const open = '<g filter="url(#wobble)"><g>';
  return svg.slice(svg.indexOf(open) + open.length, svg.lastIndexOf('</g></g>'));
}

describe('the plate roster', () => {
  it('paints one plate for every invocation in the sim catalog, and none besides', () => {
    expect([...INVOCATION_PLATE_IDS].sort()).toEqual([...INVOCATION_IDS].sort());
  });

  it("keeps the design's order, which seeds each plate's strokes", () => {
    expect(INVOCATION_PLATE_IDS).toEqual(DESIGN_ORDER);
  });

  it('seeds mark i of plate p from p × 997 + i × 31 + 7', () => {
    expect(plateSeed(0, 0)).toBe(7);
    expect(plateSeed(18, 4)).toBe(18 * 997 + 4 * 31 + 7);
  });
});

describe('invocationPlateSvg', () => {
  it('has no plate for an unknown id', () => {
    expect(invocationPlateSvg('beelzebub')).toBeUndefined();
  });

  it('lays a 600 × 800 plate over the 300 × 400 design box', () => {
    const svg = svgOf('familiar');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 300 400"/);
    expect(svg).toContain('width="600" height="800">');
  });

  it('stacks the base fill, the stone, the vignette, then the wobbled paint', () => {
    const svg = svgOf('aurevora');
    const layers = [
      '<rect width="300" height="400" fill="#17110d"/>',
      '<rect width="300" height="400" filter="url(#stone)"/>',
      '<rect width="300" height="400" fill="url(#vignette)"/>',
      '<g filter="url(#wobble)">',
    ].map((layer) => svg.indexOf(layer));
    expect(layers.every((at) => at > 0)).toBe(true);
    expect([...layers].sort((a, b) => a - b)).toEqual(layers);
  });

  it('cycles the three stones by plate', () => {
    const stone = (id: string): string | undefined =>
      svgOf(id).match(/numOctaves="5" seed="(\d+)"/)?.[1];
    expect(['familiar', 'wendigo', 'blob', 'empusa'].map(stone)).toEqual(['11', '27', '63', '11']);
    expect(svgOf('familiar')).toContain('lighting-color="#3a2e24"');
    expect(svgOf('wendigo')).toContain('lighting-color="#372b22"');
    expect(svgOf('blob')).toContain('lighting-color="#3d3026"');
  });

  it('paints every plate in the one ochre', () => {
    for (const id of INVOCATION_PLATE_IDS) {
      const paint = paintOf(svgOf(id));
      expect(paint.length).toBeGreaterThan(0);
      const colours = new Set(paint.match(/(?:fill|stroke)="[^"]*"/g));
      expect(colours).toContain(`stroke="${PAINT}"`);
      for (const c of colours)
        expect([`fill="none"`, `stroke="${PAINT}"`, `fill="${PAINT}"`]).toContain(c);
    }
  });

  it('paints the same plate every time', () => {
    for (const id of INVOCATION_PLATE_IDS) expect(invocationPlateSvg(id)).toBe(svgOf(id));
  });
});

describe('plateFingerprint', () => {
  it('cuts full-precision numbers to 3 decimals and leaves the rest as painted', () => {
    expect(plateFingerprint('<circle cx="12.345678901234" cy="-3.00049" r="1.8"/>')).toBe(
      '<circle cx="12.346" cy="-3.000" r="1.8"/>',
    );
    expect(plateFingerprint('<path d="M78.1 115.4" stroke-width="5.03" opacity="0.97"/>')).toBe(
      '<path d="M78.1 115.4" stroke-width="5.03" opacity="0.97"/>',
    );
  });

  it("does not see a last-bit difference in a droplet's centre", () => {
    expect(plateFingerprint('cx="97.53082109547373"')).toBe(
      plateFingerprint('cx="97.53082109547374"'),
    );
  });
});

describe('the baked plates', () => {
  it('has a 600 × 800 PNG for every plate', () => {
    for (const id of INVOCATION_PLATE_IDS) {
      const png = readFileSync(join(BAKED_DIR, `${id}.png`));
      expect(png.subarray(0, 8).toString('hex'), id).toBe('89504e470d0a1a0a');
      expect(png.subarray(12, 16).toString('latin1'), id).toBe('IHDR');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], id).toEqual([600, 800]);
    }
  });

  it('were baked from the current plates (re-bake after retuning one)', () => {
    const digests: Record<string, string> = baked;
    expect(Object.keys(digests)).toEqual([...INVOCATION_PLATE_IDS]);
    for (const id of INVOCATION_PLATE_IDS) {
      const digest = createHash('sha256')
        .update(plateFingerprint(svgOf(id)))
        .digest('hex');
      expect(digest, `${id}: run pnpm --filter @panvitium/web bake:plates`).toBe(digests[id]);
    }
  });
});
