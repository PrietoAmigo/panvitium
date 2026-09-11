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
