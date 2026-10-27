/**
 * The red cloud's noise and density mapping (the "Red Cloud" handoff, 4a): the fields are
 * deterministic, normalised, and tile in x without a seam, and the density reads as the designer's
 * curve: 1 a solid cloud, about 0.5 broken wisps, 0 fully clear.
 */
import { describe, it, expect } from 'vitest';
import { FOG_H, FOG_W, fogAlpha, fogOffset, makeFogNoise } from './RedCloud.js';

const n = (field: Float32Array, x: number, y: number): number => field[y * FOG_W + x] ?? NaN;

/** The shares of a field's pixels the cloud fills solid (alpha 1) and leaves clear (alpha 0). */
function cover(field: Float32Array, density: number): { solid: number; clear: number } {
  const off = fogOffset(density);
  let solid = 0;
  let clear = 0;
  for (const v of field) {
    const a = fogAlpha(v, off);
    if (a >= 1) solid++;
    if (a <= 0) clear++;
  }
  return { solid: solid / field.length, clear: clear / field.length };
}

describe('the red cloud', () => {
  const field = makeFogNoise(7);

  it('is a deterministic field in [0, 1], distinct per seed', () => {
    expect(field.length).toBe(FOG_W * FOG_H);
    expect(Array.from(makeFogNoise(7))).toEqual(Array.from(field));
    expect(Array.from(makeFogNoise(21))).not.toEqual(Array.from(field));
    for (const v of field) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('tiles in x without a seam: the wrap is no steeper than any step inside the tile', () => {
    let inner = 0;
    let wrap = 0;
    for (let y = 0; y < FOG_H; y++) {
      for (let x = 0; x < FOG_W - 1; x++) {
        inner = Math.max(inner, Math.abs(n(field, x + 1, y) - n(field, x, y)));
      }
      wrap = Math.max(wrap, Math.abs(n(field, 0, y) - n(field, FOG_W - 1, y)));
    }
    expect(wrap).toBeLessThanOrEqual(inner);
  });

  it('maps density onto the alpha ramp, clamped to [0, 1]', () => {
    expect(fogOffset(1)).toBe(1);
    expect(fogOffset(0)).toBe(-2.6);
    expect(fogOffset(0.5)).toBe(-0.8);
    expect(fogOffset(2)).toBe(1);
    expect(fogOffset(-1)).toBe(-2.6);
    expect(fogAlpha(0.5, 1)).toBe(1);
    expect(fogAlpha(0.1, -2.6)).toBe(0);
  });

  it('reads solid at density 1, broken at 0.5, and clear at 0, for both fields', () => {
    for (const f of [field, makeFogNoise(21)]) {
      expect(cover(f, 1).solid).toBe(1);
      const mid = cover(f, 0.5);
      expect(mid.solid).toBeGreaterThan(0.05);
      expect(mid.solid).toBeLessThan(0.6);
      expect(cover(f, 0).clear).toBeGreaterThan(0.99);
    }
  });
});
