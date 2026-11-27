/**
 * The Analytics pixel dress: the tab glyphs stay inside their 5 × 5 grid, are drawn in whole art
 * pixels, and read as three different marks.
 */
import { describe, it, expect } from 'vitest';
import { AN_ICONS } from './analyticsPixel.js';

/** Every `M{x} {y}h{w}v{h}` rectangle of a glyph path. */
function rects(path: string): [number, number, number, number][] {
  return Array.from(path.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-(\d+)z/g), (m) => {
    expect(m[5]).toBe(m[3]); // each rectangle closes on its own width
    return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  });
}

describe('the Analytics tab glyphs', () => {
  it('keeps every cell of every glyph inside its 5 × 5 grid', () => {
    for (const path of Object.values(AN_ICONS)) {
      const rs = rects(path);
      expect(rs.length).toBeGreaterThan(0);
      // The path is nothing but those rectangles.
      expect(path.replace(/M\d+ \d+h\d+v\d+h-\d+z/g, '').trim()).toBe('');
      for (const [x, y, w, h] of rs) {
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        expect(x + w).toBeLessThanOrEqual(5);
        expect(y + h).toBeLessThanOrEqual(5);
      }
    }
  });

  it('gives each tab its own mark', () => {
    expect(new Set(Object.values(AN_ICONS)).size).toBe(Object.keys(AN_ICONS).length);
  });
});
