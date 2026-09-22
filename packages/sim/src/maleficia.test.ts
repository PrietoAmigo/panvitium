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
  maleficiaBuffMultipliers,
  maleficiaInvocationCostMul,
  MALEFICIA_BUFF_DURATION_SECONDS,
  SINGLE_USE_MALEFICIA,
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
      // Every effect magnitude is baked into the copy (the description carries the numbers).
      expect(def.description.length).toBeGreaterThan(0);
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
    // Black Robe (1) + Sulfur Censer (2) + The Voynich Manuscript (7) = 10.
    expect(totalInvokingPower(['black_robe', 'sulfur_censer', 'voynich_manuscript'])).toBe(10);
  });
});

describe('maleficia catalog — sheet parity (34 items)', () => {
  it('has the full 34-item roster', () => {
    expect(MALEFICIUM_IDS.length).toBe(34);
  });

  it('includes the six new relics and no longer includes the removed Iron Nails', () => {
    for (const id of [
      'black_vessel',
      'teraphim',
      'picatrix',
      'grimoire_of_pope_honorius',
      'pilates_basin',
      'achans_wedge',
    ]) {
      expect(MALEFICIA[id], id).toBeDefined();
    }
    expect(MALEFICIA.iron_nails).toBeUndefined();
  });

  it('pins the sheet invoking-power values', () => {
    const ip = (id: string) => MALEFICIA[id]!.invokingPower;
    expect(ip('voynich_manuscript')).toBe(7);
    expect(ip('obsidian_mirror')).toBe(8);
    expect(ip('galdrabok')).toBe(6);
    expect(ip('grimoire_of_pope_honorius')).toBe(5);
    expect(ip('codex_gigas')).toBe(4);
    expect(ip('picatrix')).toBe(4);
    expect(ip('dybbuk_box')).toBe(4);
    expect(ip('blood_chalk')).toBe(3);
    expect(ip('blackthorn_wand')).toBe(3);
    expect(ip('witch_bottle')).toBe(2);
    expect(ip('mandrake_root')).toBe(2);
    expect(ip('black_vessel')).toBe(1);
    expect(ip('teraphim')).toBe(1);
    // The anathema relics and the single-use / rate-flat items carry no invoking power.
    for (const id of [
      'spear_of_longinus',
      'solomons_ring',
      'mark_of_cain',
      'thirty_pieces_of_silver',
      'achans_wedge',
      'pilates_basin',
      'black_candles',
      'defixio',
      'hand_of_glory',
      'black_salt_pouch',
      'crossroads_dirt',
      'witch_ladder',
      'adder_stone',
      'poppet',
    ]) {
      expect(ip(id), id).toBe(0);
    }
  });

  it('pins the stack caps: ∞ for the consumables, 5 for Black Candles, single for the rest', () => {
    for (const id of ['black_salt_pouch', 'defixio', 'hand_of_glory', 'crossroads_dirt']) {
      expect(MALEFICIA[id]!.stackMax, id).toBe(Number.POSITIVE_INFINITY);
    }
    expect(MALEFICIA.black_candles!.stackMax).toBe(5);
    expect(MALEFICIA.black_robe!.stackMax).toBeUndefined();
  });

  it('every cost sits within its (widened) rarity price band', () => {
    for (const id of MALEFICIUM_IDS) {
      const def = MALEFICIA[id]!;
      const band = MALEFICIUM_PRICE_RANGE[def.rarity];
      expect(def.cost, id).toBeGreaterThanOrEqual(band.min);
      expect(def.cost, id).toBeLessThanOrEqual(band.max);
    }
  });

  it("sigilEffectMultiplier reflects Solomon's Ring (+66%), Picatrix (+11%), Teraphim (+4%)", () => {
    expect(sigilEffectMultiplier([])).toBe(1);
    expect(sigilEffectMultiplier(['solomons_ring'])).toBeCloseTo(1.66, 9);
    expect(sigilEffectMultiplier(['picatrix'])).toBeCloseTo(1.11, 9);
    expect(sigilEffectMultiplier(['teraphim'])).toBeCloseTo(1.04, 9);
    expect(sigilEffectMultiplier(['solomons_ring', 'picatrix', 'teraphim'])).toBeCloseTo(1.81, 9);
  });

  it('maleficiaInvocationCostMul shaves 7% per Black Vessel (non-stackable)', () => {
    expect(maleficiaInvocationCostMul([])).toBe(1);
    expect(maleficiaInvocationCostMul(['black_vessel'])).toBeCloseTo(0.93, 9);
  });
});

describe('canSurface — stack rules (03 §2.5)', () => {
  it('non-stackable items: owned OR listed blocks re-surfacing', () => {
    expect(canSurface('black_robe', [], [])).toBe(true);
    expect(canSurface('black_robe', ['black_robe'], [])).toBe(false);
    expect(canSurface('black_robe', [], ['black_robe'])).toBe(false);
  });

  it('stackable items: owned copies do not block re-finding, up to stackMax', () => {
    // Black Candles: stackMax = 5. Owned copies (already bought) never block a new find while the
    // stack has room — you re-find and re-buy one at a time.
    expect(canSurface('black_candles', [], [])).toBe(true);
    expect(canSurface('black_candles', ['black_candles'], [])).toBe(true); // 1 owned, room for more
    expect(canSurface('black_candles', Array(4).fill('black_candles'), [])).toBe(true); // 4/5
    expect(canSurface('black_candles', Array(5).fill('black_candles'), [])).toBe(false); // 5/5 full
  });

  it('a stackable already on the list is not re-surfaced (one copy per id at a time)', () => {
    expect(canSurface('black_candles', [], ['black_candles'])).toBe(false);
    expect(canSurface('black_salt_pouch', [], ['black_salt_pouch'])).toBe(false);
    expect(canSurface('defixio', [], ['defixio'])).toBe(false);
    // An unbounded stack the player already OWNS many of is still re-findable while none is listed.
    const manyOwned = Array.from({ length: 50 }, () => 'black_salt_pouch');
    expect(canSurface('black_salt_pouch', manyOwned, [])).toBe(true);
  });

  it('unknown ids are not findable', () => {
    expect(canSurface('does_not_exist', [], [])).toBe(false);
    expect(canSurface('iron_nails', [], [])).toBe(false); // removed from the catalog
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

describe('single-use maleficia buffs', () => {
  const withItems = (ids: string[]): GameState => {
    const s = createInitialState('buff', 0);
    return { ...s, lifetime: { ...s.lifetime, maleficia: ids } };
  };
  const buffed = (id: string, seconds = 100): GameState => {
    const s = createInitialState('buff', 0);
    return { ...s, lifetime: { ...s.lifetime, maleficiaBuffs: { [id]: seconds } } };
  };

  it('the consumables are exactly Hand of Glory, Black Salt Pouch, Defixio, Crossroads Dirt', () => {
    expect(new Set(SINGLE_USE_MALEFICIA)).toEqual(
      new Set(['hand_of_glory', 'black_salt_pouch', 'defixio', 'crossroads_dirt']),
    );
  });

  it('activation consumes one copy and grants an hour of buff', () => {
    const r = activateMaleficium(withItems(['hand_of_glory', 'hand_of_glory']), 'hand_of_glory');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(countCopies(r.state.lifetime.maleficia, 'hand_of_glory')).toBe(1); // one consumed
      expect(r.state.lifetime.maleficiaBuffs.hand_of_glory).toBe(MALEFICIA_BUFF_DURATION_SECONDS);
    }
  });

  it('repeat activations extend the timer; refuses when none held or item not usable', () => {
    let s = withItems(['defixio', 'defixio']);
    s = (activateMaleficium(s, 'defixio') as { ok: true; state: GameState }).state;
    s = (activateMaleficium(s, 'defixio') as { ok: true; state: GameState }).state;
    expect(s.lifetime.maleficiaBuffs.defixio).toBe(2 * MALEFICIA_BUFF_DURATION_SECONDS);
    expect(activateMaleficium(s, 'defixio').ok).toBe(false); // inventory now empty
    expect(activateMaleficium(withItems(['black_robe']), 'black_robe').ok).toBe(false); // not usable
  });

  it('each buff lifts the field it targets while live (and composes multiplicatively)', () => {
    // Hand of Glory (+33%) and Black Salt Pouch (+10%) both drive reprobate generation.
    expect(
      maleficiaBuffMultipliers(buffed('hand_of_glory')).reprobateGenerationRateMul,
    ).toBeCloseTo(1.33, 6);
    expect(
      maleficiaBuffMultipliers(buffed('black_salt_pouch')).reprobateGenerationRateMul,
    ).toBeCloseTo(1.1, 6);
    expect(maleficiaBuffMultipliers(buffed('defixio')).reprobateSuicideRateMul).toBeCloseTo(1.5, 6);
    expect(maleficiaBuffMultipliers(buffed('crossroads_dirt')).indagatioEfficiencyMul).toBeCloseTo(
      1 / 0.85,
      6,
    );
  });

  it('Hand of Glory lifts reprobate generation +33% through the full modifier bundle', () => {
    const base = computeModifiers(withItems([])).reprobateGenerationRateMul;
    expect(computeModifiers(buffed('hand_of_glory')).reprobateGenerationRateMul).toBeCloseTo(
      base * 1.33,
      6,
    );
  });

  it('a buff decays in real time and is dropped at expiry', () => {
    const active = buffed('hand_of_glory', 30);
    expect(tick(active, 10).state.lifetime.maleficiaBuffs.hand_of_glory).toBe(20);
    expect(tick(active, 50).state.lifetime.maleficiaBuffs.hand_of_glory).toBeUndefined(); // dropped
  });
});

describe('passive maleficia enhancers (modifier bundle)', () => {
  const owning = (ids: string[]): GameState => {
    const s = createInitialState('mod', 0);
    return { ...s, lifetime: { ...s.lifetime, maleficia: ids } };
  };

  it('percent enhancers land on their fields', () => {
    expect(computeModifiers(owning(['mark_of_cain'])).murderRateMul).toBeCloseTo(2, 6); // +100%
    expect(computeModifiers(owning(['ritual_dagger'])).murderRateMul).toBeCloseTo(1.1, 6); // +10%
    expect(computeModifiers(owning(['achans_wedge'])).goldRateMul).toBeCloseTo(3, 6); // +200%
    expect(computeModifiers(owning(['spear_of_longinus'])).influenceRateMul).toBeCloseTo(3, 6); // +200%
    expect(
      computeModifiers(owning(['thirty_pieces_of_silver'])).reprobateSuicideRateMul,
    ).toBeCloseTo(3, 6); // +200%
    expect(computeModifiers(owning(['the_dadu'])).playerEfficiencyMul).toBeCloseTo(1.05, 6); // +5%
    expect(computeModifiers(owning(['voynich_manuscript'])).desidiaGainMul).toBeCloseTo(1.25, 6);
    expect(computeModifiers(owning(['pilates_basin'])).desidiaDrainMul).toBeCloseTo(0.5, 6); // −50%
  });

  it('flat-per-second enhancers land on their flat fields', () => {
    expect(computeModifiers(owning(['hollow_effigy'])).flatMurdersPerSecond).toBeCloseTo(0.1, 6);
    expect(computeModifiers(owning(['poppet'])).flatSuicidesPerSecond).toBeCloseTo(0.075, 6);
    expect(computeModifiers(owning(['adder_stone'])).flatGenerationPerSecond).toBeCloseTo(0.6, 6);
    expect(computeModifiers(owning(['black_robe'])).flatInfluencePerSecond).toBeCloseTo(0.4, 6);
  });

  it('Crow Feather and Obsidian Mirror shorten the Indagatio search', () => {
    expect(computeModifiers(owning(['crow_feather'])).indagatioEfficiencyMul).toBeCloseTo(
      1 / 0.9,
      6,
    );
    expect(computeModifiers(owning(['obsidian_mirror'])).indagatioEfficiencyMul).toBeCloseTo(
      1 / 0.67,
      6,
    );
  });
});
