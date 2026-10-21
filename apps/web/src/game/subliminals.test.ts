import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  CODE_SUBLIMINALS,
  CODE_SUBLIMINAL_WEIGHT,
  FAUSTO_SUBLIMINALS,
  RANDOM_SUBLIMINALS,
  SUBLIMINAL_MEAN_GAP_MS,
  codePlatesShown,
  faustoSubliminals,
  isCodeSubliminal,
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
  it('draws from the sixteen subl plates, none of them Fausto', () => {
    expect(RANDOM_SUBLIMINALS).toHaveLength(16);
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
    for (let i = 0; i < 340; i += 1) seen.add(pickRandomSubliminal(i / 340, null, true));
    expect(seen.size).toBe(RANDOM_SUBLIMINALS.length);
    for (const prev of [RANDOM_SUBLIMINALS[3]!, CODE_SUBLIMINALS[0]!]) {
      for (let i = 0; i < 100; i += 1) {
        expect(pickRandomSubliminal(i / 100, prev, true)).not.toBe(prev);
      }
    }
    expect(RANDOM_SUBLIMINALS).toContain(
      pickRandomSubliminal(0.999999, RANDOM_SUBLIMINALS[3]!, true),
    );
  });
});

describe('subliminals — the code plates', () => {
  it('are the two halves of the rectory number, among the random plates', () => {
    expect(CODE_SUBLIMINALS).toEqual([
      '/assets/panvitium/subliminals/sublcode_1.png',
      '/assets/panvitium/subliminals/sublcode_2.png',
    ]);
    for (const src of CODE_SUBLIMINALS) expect(RANDOM_SUBLIMINALS).toContain(src);
  });

  it("show from Father Stahl's first letter until his call is answered", () => {
    const none = new Set<string>();
    const letter = new Set(['fr-stahl-1']);
    const ward = new Set(['the-ward']);
    expect(codePlatesShown(none, none)).toBe(false);
    expect(codePlatesShown(new Set(['fr-stahl-2', 'parish-1']), none)).toBe(false);
    expect(codePlatesShown(letter, none)).toBe(true);
    expect(codePlatesShown(letter, new Set(['succubus']))).toBe(true);
    expect(codePlatesShown(letter, ward)).toBe(false);
    expect(codePlatesShown(none, ward)).toBe(false);
  });

  it('are never drawn outside that window', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(pickRandomSubliminal(i / 1000, null, false));
    expect(seen.size).toBe(RANDOM_SUBLIMINALS.length - CODE_SUBLIMINALS.length);
    expect([...seen].some(isCodeSubliminal)).toBe(false);
  });

  it('are each ten times likelier than any other plate inside it', () => {
    expect(CODE_SUBLIMINAL_WEIGHT).toBe(10);
    // An even sweep of the roll counts each plate in proportion to its weight.
    const total = RANDOM_SUBLIMINALS.length - 2 + 2 * CODE_SUBLIMINAL_WEIGHT; // 34
    const steps = total * 100;
    const counts = new Map<string, number>();
    for (let i = 0; i < steps; i += 1) {
      const src = pickRandomSubliminal((i + 0.5) / steps, null, true);
      counts.set(src, (counts.get(src) ?? 0) + 1);
    }
    for (const src of RANDOM_SUBLIMINALS) {
      expect(counts.get(src), src).toBe(isCodeSubliminal(src) ? 1000 : 100);
    }
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
