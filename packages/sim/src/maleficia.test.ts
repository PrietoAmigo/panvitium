import { describe, it, expect } from 'vitest';
import {
  MALEFICIA,
  MALEFICIUM_IDS,
  MALEFICIUM_PRICE_RANGE,
  canSurface,
  countCopies,
  findableIds,
  isStackable,
  totalInvokingPower,
} from './maleficia.js';

describe('maleficia catalog', () => {
  it('exposes a non-empty id list and every entry has a coherent shape', () => {
    expect(MALEFICIUM_IDS.length).toBeGreaterThan(0);
    for (const id of MALEFICIUM_IDS) {
      const def = MALEFICIA[id]!;
      expect(def.id).toBe(id);
      expect(['common', 'rare', 'profane', 'anathema']).toContain(def.rarity);
      expect(def.cost).toBeGreaterThan(0);
      expect(def.invokingPower).toBeGreaterThanOrEqual(0);
    }
  });

  it('isStackable maps to whether `stackMax` is set', () => {
    expect(isStackable(MALEFICIA.black_salt_pouch!)).toBe(true);
    expect(isStackable(MALEFICIA.black_robe!)).toBe(false);
  });

  it('countCopies counts each occurrence in a list', () => {
    expect(countCopies(['a', 'b', 'a', 'c', 'a'], 'a')).toBe(3);
    expect(countCopies(['x'], 'a')).toBe(0);
  });

  it('totalInvokingPower sums per-copy values across the inventory', () => {
    // Black Robe (1) + Sulfur Censer (2) + Black Salt Pouch ×3 (1 each) = 6.
    const inv = [
      'black_robe',
      'sulfur_censer',
      'black_salt_pouch',
      'black_salt_pouch',
      'black_salt_pouch',
    ];
    expect(totalInvokingPower(inv)).toBe(6);
  });
});

describe('maleficia catalog — sheet parity (25 items)', () => {
  it('has the full 25-item roster', () => {
    expect(MALEFICIUM_IDS.length).toBe(25);
  });

  it('pins the sheet invoking-power values for the power sources', () => {
    const ip = (id: string) => MALEFICIA[id]!.invokingPower;
    expect(ip('voynich_manuscript')).toBe(6);
    expect(ip('obsidian_mirror')).toBe(8);
    expect(ip('blood_chalk')).toBe(4);
    expect(ip('blackthorn_wand')).toBe(4);
    expect(ip('dybbuk_box')).toBe(3);
    expect(ip('witch_bottle')).toBe(2);
    expect(ip('mandrake_root')).toBe(2);
    expect(ip('iron_nails')).toBe(1);
    // The anathema enhancers and the targeted/enhancer items carry no invoking power.
    for (const id of [
      'spear_of_longinus',
      'solomons_ring',
      'black_candles',
      'defixio',
      'hand_of_glory',
    ]) {
      expect(ip(id)).toBe(0);
    }
  });

  it('pins the stack caps: ∞ for the unbounded items, 5 for Black Candles, single for the rest', () => {
    for (const id of ['black_salt_pouch', 'defixio', 'hand_of_glory', 'iron_nails']) {
      expect(MALEFICIA[id]!.stackMax).toBe(Number.POSITIVE_INFINITY);
    }
    expect(MALEFICIA.black_candles!.stackMax).toBe(5);
    expect(MALEFICIA.black_robe!.stackMax).toBeUndefined();
  });

  it('every cost sits within its rarity price band', () => {
    for (const id of MALEFICIUM_IDS) {
      const def = MALEFICIA[id]!;
      const band = MALEFICIUM_PRICE_RANGE[def.rarity];
      expect(def.cost).toBeGreaterThanOrEqual(band.min);
      expect(def.cost).toBeLessThanOrEqual(band.max);
    }
  });
});

describe('canSurface — stack rules (03 §2.5)', () => {
  it('non-stackable items: owned OR listed blocks re-surfacing', () => {
    expect(canSurface('black_robe', [], [])).toBe(true);
    expect(canSurface('black_robe', ['black_robe'], [])).toBe(false);
    expect(canSurface('black_robe', [], ['black_robe'])).toBe(false);
  });

  it('stackable items: blocked only once owned + listed reaches stackMax', () => {
    // Black Candles: stackMax = 5.
    expect(canSurface('black_candles', [], [])).toBe(true);
    expect(canSurface('black_candles', ['black_candles'], ['black_candles'])).toBe(true); // 2/5
    expect(
      canSurface(
        'black_candles',
        ['black_candles', 'black_candles'],
        ['black_candles', 'black_candles', 'black_candles'],
      ),
    ).toBe(false); // 5/5
  });

  it('unbounded (∞) stacks never saturate — Black Salt Pouch', () => {
    const many = Array.from({ length: 50 }, () => 'black_salt_pouch');
    expect(canSurface('black_salt_pouch', many, many)).toBe(true);
  });

  it('unknown ids are not findable', () => {
    expect(canSurface('does_not_exist', [], [])).toBe(false);
  });
});

describe('findableIds — by rarity, honouring stack rules', () => {
  it('returns only catalog entries of the given rarity that can be surfaced', () => {
    const commons = findableIds('common', [], []);
    expect(commons).toContain('black_robe');
    expect(commons).toContain('black_salt_pouch');
    expect(commons).not.toContain('ritual_dagger'); // rare
  });

  it('excludes already-owned non-stackable items at the same rarity', () => {
    const before = findableIds('rare', [], []);
    expect(before).toContain('ritual_dagger');
    const after = findableIds('rare', ['ritual_dagger'], []);
    expect(after).not.toContain('ritual_dagger');
  });
});
