import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  FAUSTO_SUBLIMINALS,
  RANDOM_SUBLIMINALS,
  SUBLIMINAL_MEAN_GAP_MS,
  faustoSubliminals,
  pickRandomSubliminal,
  subliminalChance,
} from './subliminals.js';

describe('subliminals — Fausto', () => {
  it('maps letters #1 to #3 to their plates and #5 to the fourth; #4 has none', () => {
    expect(faustoSubliminals(['fausto-1', 'fausto-2', 'fausto-3', 'fausto-4', 'fausto-5'])).toEqual(
      [
        '/assets/panvitium/subliminals/fausto1.png',
        '/assets/panvitium/subliminals/fausto2.png',
        '/assets/panvitium/subliminals/fausto3.png',
        '/assets/panvitium/subliminals/fausto4.png',
      ],
    );
    expect(FAUSTO_SUBLIMINALS['fausto-4']).toBeUndefined();
  });

  it('ignores every other email', () => {
    expect(faustoSubliminals(['gideon-1', 'newsletter-local', 'reuben-1'])).toEqual([]);
  });
});

describe('subliminals — random', () => {
  it('draws from the twenty-one subl plates, none of them Fausto', () => {
    expect(RANDOM_SUBLIMINALS).toHaveLength(21);
    expect(RANDOM_SUBLIMINALS.every((src) => /\/subl[^/]*\.png$/.test(src))).toBe(true);
  });

  it('averages one plate every six minutes, whatever the check cadence', () => {
    expect(subliminalChance(0)).toBe(0);
    expect(subliminalChance(SUBLIMINAL_MEAN_GAP_MS)).toBeCloseTo(1 - Math.exp(-1), 10);
    // Ten 100 ms checks add up to exactly one 1 s check.
    const miss10 = (1 - subliminalChance(100)) ** 10;
    expect(1 - miss10).toBeCloseTo(subliminalChance(1000), 12);
  });

  it('covers the whole pool and never repeats the previous plate', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 160; i += 1) seen.add(pickRandomSubliminal(i / 160, null));
    expect(seen.size).toBe(RANDOM_SUBLIMINALS.length);
    const prev = RANDOM_SUBLIMINALS[3]!;
    for (let i = 0; i < 100; i += 1) {
      expect(pickRandomSubliminal(i / 100, prev)).not.toBe(prev);
    }
    expect(RANDOM_SUBLIMINALS).toContain(pickRandomSubliminal(0.999999, prev));
  });
});

describe('subliminals — assets', () => {
  const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public');

  it('ships every plate it names', () => {
    for (const src of [...Object.values(FAUSTO_SUBLIMINALS), ...RANDOM_SUBLIMINALS]) {
      expect(existsSync(join(PUBLIC_DIR, src)), src).toBe(true);
    }
  });
});
