import { describe, it, expect } from 'vitest';
import {
  MALEFICIA,
  MALEFICIUM_IDS,
  MALEFICIUM_PRICE_RANGE,
  activateMaleficium,
  canSurface,
  countCopies,
  findableIds,
  isStackable,
  sigilEffectMultiplier,
  totalInvokingPower,
  HAND_OF_GLORY_DURATION_SECONDS,
  HAND_OF_GLORY_GENERATION_MUL,
} from './maleficia.js';
import { createInitialState, type GameState } from './state.js';
import { computeModifiers } from './modifiers.js';
import { tick } from './tick.js';

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

  it("sigilEffectMultiplier reflects Solomon's Ring (+50%) and Iron Nails (+1% each)", () => {
    expect(sigilEffectMultiplier([])).toBe(1);
    expect(sigilEffectMultiplier(['solomons_ring'])).toBeCloseTo(1.5, 9);
    expect(sigilEffectMultiplier(['iron_nails', 'iron_nails', 'iron_nails'])).toBeCloseTo(1.03, 9);
    expect(sigilEffectMultiplier(['solomons_ring', 'iron_nails'])).toBeCloseTo(1.51, 9);
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

describe('Hand of Glory (single-use generation buff)', () => {
  const withItem = (n = 1): GameState => {
    const s = createInitialState('hog', 0);
    return { ...s, lifetime: { ...s.lifetime, maleficia: Array(n).fill('hand_of_glory') } };
  };

  it('activation consumes one copy and grants an hour of buff', () => {
    const r = activateMaleficium(withItem(2), 'hand_of_glory');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(countCopies(r.state.lifetime.maleficia, 'hand_of_glory')).toBe(1); // one consumed
      expect(r.state.lifetime.handOfGloryRemaining).toBe(HAND_OF_GLORY_DURATION_SECONDS);
    }
  });

  it('repeat activations stack the timer; refuses when none held or item not usable', () => {
    let s = withItem(2);
    s = (activateMaleficium(s, 'hand_of_glory') as { ok: true; state: GameState }).state;
    s = (activateMaleficium(s, 'hand_of_glory') as { ok: true; state: GameState }).state;
    expect(s.lifetime.handOfGloryRemaining).toBe(2 * HAND_OF_GLORY_DURATION_SECONDS);
    expect(activateMaleficium(s, 'hand_of_glory').ok).toBe(false); // inventory now empty
    expect(activateMaleficium(withItem(1), 'black_robe').ok).toBe(false); // not activatable
  });

  it('doubles reprobate generation while live, and is 1× when expired', () => {
    const active = {
      ...withItem(),
      lifetime: { ...withItem().lifetime, handOfGloryRemaining: 100 },
    };
    const base = computeModifiers(withItem()).reprobateGenerationRateMul;
    expect(computeModifiers(active).reprobateGenerationRateMul).toBeCloseTo(
      base * HAND_OF_GLORY_GENERATION_MUL,
      6,
    );
  });

  it('the buff decays in real time and expires', () => {
    const active: GameState = {
      ...createInitialState('hog', 0),
      lifetime: { ...createInitialState('hog', 0).lifetime, handOfGloryRemaining: 30 },
    };
    expect(tick(active, 10).state.lifetime.handOfGloryRemaining).toBe(20);
    expect(tick(active, 50).state.lifetime.handOfGloryRemaining).toBe(0); // floors at 0
  });
});
