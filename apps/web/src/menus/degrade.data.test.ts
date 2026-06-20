import { describe, it, expect } from 'vitest';
import { altarPlateForAcolytes, boundVisualsFor } from './degrade.data.js';

const PLATE = (n: number): string =>
  `/assets/panvitium/backgrounds/altar_by_acolytes/169_altar_clean_${n}acolytes.png`;

describe('altarPlateForAcolytes', () => {
  it('maps each acolyte count 0–4 to its matching plate', () => {
    for (let n = 0; n <= 4; n++) {
      expect(altarPlateForAcolytes(n)).toBe(PLATE(n));
    }
  });

  it('clamps below 0 and above the max of 4', () => {
    expect(altarPlateForAcolytes(-2)).toBe(PLATE(0));
    expect(altarPlateForAcolytes(7)).toBe(PLATE(4));
  });

  it('floors a fractional count', () => {
    expect(altarPlateForAcolytes(2.9)).toBe(PLATE(2));
  });
});

describe('boundVisualsFor', () => {
  it('returns the Morpheus visual only in the altar room when he is bound', () => {
    const altar = boundVisualsFor('altar', ['morpheus']);
    expect(altar.map((v) => v.id)).toEqual(['morpheus']);
    expect(altar[0]?.float).toBe(true);
    // Same id, wrong room → nothing (his designed display lives on the altar).
    expect(boundVisualsFor('invocation', ['morpheus'])).toEqual([]);
  });

  it('returns the Familiar visual only in the studio room, grounded (no float/vignette)', () => {
    const studio = boundVisualsFor('studio', ['familiar']);
    expect(studio.map((v) => v.id)).toEqual(['familiar']);
    // Sits on the floor: omits the levitating-trance treatment Morpheus carries.
    expect(studio[0]?.float).toBeUndefined();
    expect(studio[0]?.vignette).toBeUndefined();
    // Same id, wrong room → nothing (its designed display lives in the studio).
    expect(boundVisualsFor('altar', ['familiar'])).toEqual([]);
  });

  it('returns the Aurevora visual only in the invocation room, grounded (no float/vignette)', () => {
    const room = boundVisualsFor('invocation', ['aurevora']);
    expect(room.map((v) => v.id)).toEqual(['aurevora']);
    // Sits cross-legged on the circle: no levitation, no room-dimming glow.
    expect(room[0]?.float).toBeUndefined();
    expect(room[0]?.vignette).toBeUndefined();
    // Same id, wrong room → nothing (its designed display lives in the invocation room).
    expect(boundVisualsFor('altar', ['aurevora'])).toEqual([]);
  });

  it('returns the Astiwihad visual only in the altar room, grounded (no float/vignette)', () => {
    const altar = boundVisualsFor('altar', ['astiwihad']);
    expect(altar.map((v) => v.id)).toEqual(['astiwihad']);
    // Stands at the threshold, no effects.
    expect(altar[0]?.float).toBeUndefined();
    expect(altar[0]?.vignette).toBeUndefined();
    // Same id, wrong room → nothing (its designed display lives on the altar).
    expect(boundVisualsFor('studio', ['astiwihad'])).toEqual([]);
  });

  it('returns the Specunitas visual only in the studio room, grounded with a focal dim', () => {
    const studio = boundVisualsFor('studio', ['specunitas']);
    expect(studio.map((v) => v.id)).toEqual(['specunitas']);
    // A standing figure, not a levitating trance: no float, but a gentle focal vignette.
    expect(studio[0]?.float).toBeUndefined();
    expect(studio[0]?.vignette).toBe(0.4);
    // Same id, wrong room → nothing (its designed display lives in the studio).
    expect(boundVisualsFor('altar', ['specunitas'])).toEqual([]);
  });

  it('returns the Doppelgaenger visual only in the studio room, grounded with a contact shadow', () => {
    const studio = boundVisualsFor('studio', ['doppelgaenger']);
    expect(studio.map((v) => v.id)).toEqual(['doppelgaenger']);
    // Stands on the parquet facing the lens: no levitation, no room-dimming glow — just a flat
    // contact/ground shadow at its feet (the only treatment the brief allows).
    expect(studio[0]?.float).toBeUndefined();
    expect(studio[0]?.vignette).toBeUndefined();
    expect(studio[0]?.groundShadow).toBe(0.83);
    // Same id, wrong room → nothing (its designed display lives in the studio).
    expect(boundVisualsFor('altar', ['doppelgaenger'])).toEqual([]);
  });

  it('skips invocations that have no designed display', () => {
    expect(boundVisualsFor('altar', ['imp', 'upir'])).toEqual([]);
    expect(boundVisualsFor('altar', [])).toEqual([]);
  });
});
