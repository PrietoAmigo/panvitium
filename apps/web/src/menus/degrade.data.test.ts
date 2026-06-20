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

  it('skips invocations that have no designed display', () => {
    expect(boundVisualsFor('altar', ['imp', 'upir'])).toEqual([]);
    expect(boundVisualsFor('altar', [])).toEqual([]);
  });
});
