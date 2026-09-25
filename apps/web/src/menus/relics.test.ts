/**
 * The Loculi's shared presentation helpers (Claude Design, "Loculi Reliquary"): the effect headline
 * split the reliquary and the Unveiling set as a headline number, and the rarity ordering of the
 * procession.
 */
import { describe, it, expect } from 'vitest';
import { byRarity, parseEffect, stagePx } from './relics.js';

describe('parseEffect — the headline number', () => {
  it('takes a leading percentage as the headline and the rest as the remainder', () => {
    expect(parseEffect('+25% influence gain rate.')).toEqual({
      headline: '+25%',
      remainder: 'influence gain rate',
      singleUse: false,
    });
  });

  it('sets a leading minus as a true minus sign (U+2212)', () => {
    const fx = parseEffect('-33% Indagatio time.');
    expect(fx.headline).toBe('−33%');
    expect(fx.remainder).toBe('Indagatio time');
  });

  it('takes a decimal flat rate', () => {
    expect(parseEffect('+0.8 reprobates per second.')).toMatchObject({
      headline: '+0.8',
      remainder: 'reprobates per second',
    });
  });

  it('strips the "Single-use:" marker and flags the line as a consumable', () => {
    expect(parseEffect('Single-use: +50% suicide rate for an hour.')).toEqual({
      headline: '+50%',
      remainder: 'suicide rate for an hour',
      singleUse: true,
    });
  });

  it('keeps later magnitudes in the remainder', () => {
    expect(parseEffect('+3% invocation effect per candle, up to +15%.')).toMatchObject({
      headline: '+3%',
      remainder: 'invocation effect per candle, up to +15%',
    });
  });

  it('has no headline when no magnitude leads: the whole line is the remainder', () => {
    expect(parseEffect('Doubles the dark.')).toEqual({
      headline: '',
      remainder: 'Doubles the dark',
      singleUse: false,
    });
    expect(parseEffect('')).toEqual({ headline: '', remainder: '', singleUse: false });
  });
});

describe('byRarity — the procession order', () => {
  it('orders anathema → common, stable within a tier, without touching the input', () => {
    const items = [
      { id: 'c1', rarity: 'common' as const },
      { id: 'r1', rarity: 'rare' as const },
      { id: 'a1', rarity: 'anathema' as const },
      { id: 'c2', rarity: 'common' as const },
      { id: 'p1', rarity: 'profane' as const },
      { id: 'r2', rarity: 'rare' as const },
    ];
    expect(byRarity(items).map((x) => x.id)).toEqual(['a1', 'p1', 'r1', 'r2', 'c1', 'c2']);
    expect(items[0]!.id).toBe('c1');
  });
});

describe('stagePx — design px on the fitted 1280×720 frame', () => {
  it('scales by the frame unit', () => {
    expect(stagePx(290)).toBe('calc(290 * var(--relic-u))');
    expect(stagePx(-10)).toBe('calc(-10 * var(--relic-u))');
  });
});
