import { describe, it, expect } from 'vitest';
import { DEFAULT_DEGRADE, applySpriteTint } from './degrade.js';

// The Fausto-curse "Vertigo" layer is an additive pass gated on `curseVertigo`. The no-curse
// invariant: the shipped recipe leaves the layer off, so a frame with no curse is byte-for-byte the
// normal game look. (The canvas render itself needs a real 2D context, unavailable under jsdom, so
// the invariant is asserted at the recipe level — the default the integrator spreads over.)
describe('DEFAULT_DEGRADE — Fausto-curse Vertigo defaults', () => {
  it('ships with the curse layer off (curseVertigo 0)', () => {
    expect(DEFAULT_DEGRADE.curseVertigo).toBe(0);
  });

  it('does not assume reduced motion', () => {
    expect(DEFAULT_DEGRADE.reducedMotion).toBe(false);
  });
});

// The Desidia fast-forward layer is an additive pass gated on `ffw`, exactly like the curse. Same
// no-effect invariant: shipped off (`ffw` 0), so a frame with Desidia inactive is the normal look;
// and the author-side strength dial ships at its tuned 0.35. Asserted at the recipe level (no canvas
// context under jsdom), matching the Vertigo defaults test above.
describe('DEFAULT_DEGRADE — Desidia fast-forward defaults', () => {
  it('ships with the fast-forward layer off (ffw 0)', () => {
    expect(DEFAULT_DEGRADE.ffw).toBe(0);
  });

  it('keeps the tuned fast-forward strength dial (ffwStrength 0.35)', () => {
    expect(DEFAULT_DEGRADE.ffwStrength).toBe(0.35);
  });
});

// A bound figure's colour filter (the Invocation Room's amber) runs once over the art's pixels.
// The canvas readback needs a real 2D context, so the filter itself is asserted on raw RGBA.
describe('applySpriteTint', () => {
  const AMBER = { rgb: [0xec, 0x8a, 0x00] as const, density: 0.4 };
  const lum = (d: Uint8ClampedArray, i: number): number =>
    0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;

  it('warms a neutral grey toward amber (red > green > blue) at the same luminance', () => {
    const d = new Uint8ClampedArray([128, 128, 128, 255]);
    applySpriteTint(d, AMBER);
    expect(d[0]!).toBeGreaterThan(d[1]!);
    expect(d[1]!).toBeGreaterThan(d[2]!);
    expect(Math.abs(lum(d, 0) - 128)).toBeLessThanOrEqual(1);
    expect(d[3]).toBe(255);
  });

  it('leaves alpha, black and fully transparent pixels alone', () => {
    const d = new Uint8ClampedArray([0, 0, 0, 200, 90, 160, 220, 0]);
    applySpriteTint(d, AMBER);
    expect([...d]).toEqual([0, 0, 0, 200, 90, 160, 220, 0]);
  });

  it('is a no-op at zero density', () => {
    const d = new Uint8ClampedArray([40, 180, 60, 255]);
    applySpriteTint(d, { rgb: AMBER.rgb, density: 0 });
    expect([...d]).toEqual([40, 180, 60, 255]);
  });

  it('keeps the tint slight: a green figure stays green, only shifted warm', () => {
    const d = new Uint8ClampedArray([40, 180, 60, 255]);
    applySpriteTint(d, AMBER);
    expect(d[1]!).toBeGreaterThan(d[0]!);
    expect(d[1]!).toBeGreaterThan(d[2]!);
    expect(d[2]!).toBeLessThan(60);
  });
});
