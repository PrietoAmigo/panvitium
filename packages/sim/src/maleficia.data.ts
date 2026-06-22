/**
 * Maleficia TUNING DATA (03 §4) — the per-rarity Emptio price bands (`MALEFICIUM_PRICE_RANGE`) and
 * the 29-item catalog (`MALEFICIA`): costs, rarities, invoking power, stack caps, and effects.
 * Separated from the logic in `maleficia.ts` so the economy knobs live in one editable place. Pure
 * data; types and behaviour stay in `maleficia.ts`.
 */
import { type MaleficiumDef, type MaleficiumRarity } from './maleficia.js';

/**
 * *Emptio* price band per rarity (sheet "Maleficium rarity -> Price"). The sheet rolls a
 * `Randint(min, max)` at purchase; until rolled pricing lands, each entry's `cost` carries an
 * in-band fixed value and this table is the source of truth for the eventual roll.
 */
export const MALEFICIUM_PRICE_RANGE: Record<
  MaleficiumRarity,
  { readonly min: number; readonly max: number }
> = {
  common: { min: 100, max: 1000 },
  rare: { min: 1000, max: 3333 },
  profane: { min: 6666, max: 23754 },
  anathema: { min: 66666, max: 93456 },
};

/** The full 29-item catalog (sheet order). Effects past invoking power are wired in later slices. */
export const MALEFICIA: Record<string, MaleficiumDef> = {
  ars_serpens: {
    id: 'ars_serpens',
    name: 'Ars Serpens',
    description:
      "The serpent's counsel, transcribed — every word a smoother lie. +33% Suasio efficiency.",
    rarity: 'rare',
    cost: 2000,
    invokingPower: 2,
  },
  ritual_dagger: {
    id: 'ritual_dagger',
    name: 'Ritual Dagger',
    description:
      'A rare hour of convergence: when offering and offerer cease to be separate. +33% Decimatio efficiency.',
    rarity: 'rare',
    cost: 3000,
    invokingPower: 2,
  },
  voynich_manuscript: {
    id: 'voynich_manuscript',
    name: 'The Voynich Manuscript',
    description: 'Unreadable to the faithful; fluent to the fallen. +66% Suasio efficiency.',
    rarity: 'profane',
    cost: 12000,
    invokingPower: 6,
  },
  black_robe: {
    id: 'black_robe',
    name: 'Black Robe',
    description: 'What separates the celebrant from the congregation is mostly fabric.',
    rarity: 'common',
    cost: 500,
    invokingPower: 1,
  },
  blood_chalk: {
    id: 'blood_chalk',
    name: 'Blood Chalk',
    description: 'Drawn in a circle no priest will step inside.',
    rarity: 'rare',
    cost: 2500,
    invokingPower: 4,
  },
  sulfur_censer: {
    id: 'sulfur_censer',
    name: 'Sulfur Censer',
    description: 'Where it has burned, prayer no longer travels upward.',
    rarity: 'common',
    cost: 800,
    invokingPower: 2,
  },
  obsidian_mirror: {
    id: 'obsidian_mirror',
    name: 'Obsidian Mirror',
    description: 'It shows what the future is already weighing. Reveals every Opera distribution.',
    rarity: 'profane',
    cost: 20000,
    invokingPower: 8,
  },
  blackthorn_wand: {
    id: 'blackthorn_wand',
    name: 'Blackthorn Wand',
    description: 'Cut on a moonless night from a tree that took root over a grave.',
    rarity: 'rare',
    cost: 3300,
    invokingPower: 4,
  },
  black_candles: {
    id: 'black_candles',
    name: 'Black Candles',
    description: 'Each flame a small renunciation of the light. +5% invocation effect per candle.',
    rarity: 'common',
    cost: 600,
    invokingPower: 0,
    stackMax: 5,
  },
  defixio: {
    id: 'defixio',
    name: 'Defixio',
    description:
      'A name, a nail, a curse folded into lead and buried. Single-use: culls a random subtype.',
    rarity: 'profane',
    cost: 10000,
    invokingPower: 0,
    stackMax: Number.POSITIVE_INFINITY,
  },
  hand_of_glory: {
    id: 'hand_of_glory',
    name: 'Hand of Glory',
    description:
      'Cut from a hanged man at the crossroads; it opens what should stay shut. Single-use: +100% base generation for an hour.',
    rarity: 'rare',
    cost: 2200,
    invokingPower: 0,
    stackMax: Number.POSITIVE_INFINITY,
  },
  the_dadu: {
    id: 'the_dadu',
    name: 'The Dadu',
    description:
      'Bones that fall the same way twice, if you ask them right. Reveals the Decimatio distribution.',
    rarity: 'common',
    cost: 400,
    invokingPower: 1,
  },
  dybbuk_box: {
    id: 'dybbuk_box',
    name: 'Dybbuk Box',
    description: 'Something agreed to stay inside. For now.',
    rarity: 'rare',
    cost: 2800,
    invokingPower: 3,
  },
  hollow_effigy: {
    id: 'hollow_effigy',
    name: 'Hollow Effigy',
    description: "Wax in your likeness, and in someone else's. Reveals the Suasio distribution.",
    rarity: 'common',
    cost: 400,
    invokingPower: 1,
  },
  black_salt_pouch: {
    id: 'black_salt_pouch',
    name: 'Black Salt Pouch',
    description: 'Drawn from ash, charcoal, and graveyard earth.',
    rarity: 'common',
    cost: 150,
    invokingPower: 1,
    stackMax: Number.POSITIVE_INFINITY,
  },
  spear_of_longinus: {
    id: 'spear_of_longinus',
    name: 'Spear of Longinus',
    description: 'Just the tip. x3 maximum influence.',
    rarity: 'anathema',
    cost: 80000,
    invokingPower: 0,
  },
  codex_gigas: {
    id: 'codex_gigas',
    name: 'Codex Gigas',
    description:
      'One scribe. One night. One signature in the margin no Pope has ever erased. ×1.33 influence gain rate.',
    rarity: 'profane',
    cost: 18000,
    invokingPower: 0,
  },
  mark_of_cain: {
    id: 'mark_of_cain',
    name: 'Mark of Cain',
    description: 'The sevenfold vengeance was never a curse. It was a guarantee. ×3 murder rate.',
    rarity: 'anathema',
    cost: 80000,
    invokingPower: 0,
  },
  thirty_pieces_of_silver: {
    id: 'thirty_pieces_of_silver',
    name: 'Thirty Pieces of Silver',
    description:
      'Counted out, refused, returned, refused again. Coinage that always finds its way back into a hand. Gold gain rises by 0.001% of your current gold.',
    rarity: 'anathema',
    cost: 80000,
    invokingPower: 0,
  },
  solomons_ring: {
    id: 'solomons_ring',
    name: "Solomon's Ring",
    description: 'The seal that bound seventy-two kings. It still pinches. +66% sigil effects.',
    rarity: 'anathema',
    cost: 85000,
    invokingPower: 0,
  },
  galdrabok: {
    id: 'galdrabok',
    name: 'Galdrabók',
    description: 'A book of staves bound in hide, each page a small undoing. ×1.15 murder rate.',
    rarity: 'profane',
    cost: 15000,
    invokingPower: 0,
  },
  witch_ladder: {
    id: 'witch_ladder',
    name: 'Witch Ladder',
    description: 'Forty-and-one knots, a feather worked into each. ×1.05 suicide rate.',
    rarity: 'common',
    cost: 600,
    invokingPower: 0,
  },
  adder_stone: {
    id: 'adder_stone',
    name: 'Adder Stone',
    description:
      'A holed stone the serpents bored; look through it and see what breeds. ×1.05 reprobate generation.',
    rarity: 'common',
    cost: 600,
    invokingPower: 0,
  },
  poppet: {
    id: 'poppet',
    name: 'Poppet',
    description:
      'A cloth figure sewn to a likeness; what it suffers, they suffer. ×1.05 murder rate.',
    rarity: 'common',
    cost: 600,
    invokingPower: 0,
  },
  iron_nails: {
    id: 'iron_nails',
    name: 'Iron Nails',
    description:
      'Pulled from the True Cross, or near enough to sell. +1% sigil effects and +1 invoking power each.',
    rarity: 'common',
    cost: 300,
    invokingPower: 1,
    stackMax: Number.POSITIVE_INFINITY,
  },
  witch_bottle: {
    id: 'witch_bottle',
    name: 'Witch Bottle',
    description: 'Urine, pins, and rosemary, corked against the dark — and aimed back at it.',
    rarity: 'common',
    cost: 700,
    invokingPower: 2,
  },
  crossroads_dirt: {
    id: 'crossroads_dirt',
    name: 'Crossroads Dirt',
    description: 'Gathered where four roads meet at midnight. Reveals the Emptio distribution.',
    rarity: 'common',
    cost: 350,
    invokingPower: 1,
  },
  mandrake_root: {
    id: 'mandrake_root',
    name: 'Mandrake Root',
    description: 'It screamed when it was pulled. You kept it anyway.',
    rarity: 'common',
    cost: 750,
    invokingPower: 2,
  },
  crow_feather: {
    id: 'crow_feather',
    name: 'Crow Feather',
    description:
      'The bird that counts the dead leaves you one. Reveals the Indagatio distribution.',
    rarity: 'common',
    cost: 350,
    invokingPower: 1,
  },
};
