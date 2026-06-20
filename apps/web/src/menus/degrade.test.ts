import { describe, it, expect } from 'vitest';
import { DEFAULT_DEGRADE } from './degrade.js';

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
