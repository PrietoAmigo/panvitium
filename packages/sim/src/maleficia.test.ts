import { describe, it, expect } from 'vitest';
import {
  MALEFICIA,
  MALEFICIUM_IDS,
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

describe('canSurface — stack rules (03 §2.5)', () => {
  it('non-stackable items: owned OR listed blocks re-surfacing', () => {
    expect(canSurface('black_robe', [], [])).toBe(true);
    expect(canSurface('black_robe', ['black_robe'], [])).toBe(false);
    expect(canSurface('black_robe', [], ['black_robe'])).toBe(false);
  });

  it('stackable items: blocked only once owned + listed reaches stackMax', () => {
    // Black Salt Pouch: stackMax = 5.
    expect(canSurface('black_salt_pouch', [], [])).toBe(true);
    expect(canSurface('black_salt_pouch', ['black_salt_pouch'], ['black_salt_pouch'])).toBe(true); // 2/5
    expect(
      canSurface(
        'black_salt_pouch',
        ['black_salt_pouch', 'black_salt_pouch'],
        ['black_salt_pouch', 'black_salt_pouch', 'black_salt_pouch'],
      ),
    ).toBe(false); // 5/5
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
