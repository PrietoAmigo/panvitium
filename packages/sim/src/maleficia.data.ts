/**
 * Maleficia TUNING DATA (03 §4) — the per-rarity Emptio price bands (`MALEFICIUM_PRICE_RANGE`) and
 * the 34-item catalog (`MALEFICIA`): costs, rarities, invoking power, stack caps, and effects.
 * Separated from the logic in `maleficia.ts` so the economy knobs live in one editable place. Pure
 * data; types and behaviour stay in `maleficia.ts`.
 */
import { type MaleficiumDef, type MaleficiumRarity } from './maleficia.js';

/**
 * *Emptio* price band per rarity (sheet "Maleficium rarity -> Price"). The sheet rolls a
 * `Randint(min, max)` at purchase; each band spans its rarity's catalog costs, so every entry's
 * fixed `cost` sits in band and the rolled price lands in the same range.
 */
export const MALEFICIUM_PRICE_RANGE: Record<
  MaleficiumRarity,
  { readonly min: number; readonly max: number }
> = {
  common: { min: 150, max: 800 },
  rare: { min: 1600, max: 5000 },
  profane: { min: 10000, max: 23000 },
  anathema: { min: 600000, max: 1300000 },
};

/**
 * The full 34-item catalog. Effects are carried in each entry's `description` (magnitudes baked in
 * per the copy rule) and wired into their consuming systems: the modifier engine (`modifiers.ts`)
 * for the passive rate/percent/flat enhancers, `invocations.ts` for the invocation-cost reduction,
 * and the single-use timed-buff system (`maleficiaBuffs`) for the consumables.
 */
export const MALEFICIA: Record<string, MaleficiumDef> = {
  // ── Common ─────────────────────────────────────────────────────────────────
  black_salt_pouch: {
    id: 'black_salt_pouch',
    name: 'Black Salt Pouch',
    description:
      'Drawn from ash, charcoal, and graveyard earth. Single-use: +10% reprobate generation for an hour.',
    rarity: 'common',
    cost: 150,
    invokingPower: 0,
    stackMax: Number.POSITIVE_INFINITY,
  },
  crossroads_dirt: {
    id: 'crossroads_dirt',
    name: 'Crossroads Dirt',
    description:
      'Gathered where four roads meet at midnight. Single-use: -15% Indagatio time for an hour.',
    rarity: 'common',
    cost: 350,
    invokingPower: 0,
    stackMax: Number.POSITIVE_INFINITY,
  },
  crow_feather: {
    id: 'crow_feather',
    name: 'Crow Feather',
    description: 'The bird that counts the dead leaves you one. -10% Indagatio time.',
    rarity: 'common',
    cost: 350,
    invokingPower: 1,
  },
  the_dadu: {
    id: 'the_dadu',
    name: 'The Dadu',
    description:
      'Bones that fall the same way twice, if you ask them right. +5% player efficiency.',
    rarity: 'common',
    cost: 400,
    invokingPower: 1,
  },
  hollow_effigy: {
    id: 'hollow_effigy',
    name: 'Hollow Effigy',
    description: "Wax in your likeness, and in someone else's. +0.1 murders per second.",
    rarity: 'common',
    cost: 400,
    invokingPower: 1,
  },
  black_robe: {
    id: 'black_robe',
    name: 'Black Robe',
    description:
      'What separates the celebrant from the congregation is mostly fabric. +0.4 influence per second.',
    rarity: 'common',
    cost: 500,
    invokingPower: 1,
  },
  witch_ladder: {
    id: 'witch_ladder',
    name: 'Witch Ladder',
    description: 'Forty-and-one knots, a feather worked into each. +0.15 murders per second.',
    rarity: 'common',
    cost: 600,
    invokingPower: 0,
  },
  adder_stone: {
    id: 'adder_stone',
    name: 'Adder Stone',
    description:
      'A holed stone the serpents bored; look through it and see what breeds. +0.6 reprobates per second.',
    rarity: 'common',
    cost: 600,
    invokingPower: 0,
  },
  poppet: {
    id: 'poppet',
    name: 'Poppet',
    description:
      'A cloth figure sewn to a likeness; what it suffers, they suffer. +0.075 suicides per second.',
    rarity: 'common',
    cost: 600,
    invokingPower: 0,
  },
  witch_bottle: {
    id: 'witch_bottle',
    name: 'Witch Bottle',
    description:
      'Urine, pins, and rosemary, corked against the dark, and aimed back at it. +0.8 reprobates per second.',
    rarity: 'common',
    cost: 700,
    invokingPower: 2,
  },
  mandrake_root: {
    id: 'mandrake_root',
    name: 'Mandrake Root',
    description: 'It screamed when it was pulled. You kept it anyway. +0.05 suicides per second.',
    rarity: 'common',
    cost: 750,
    invokingPower: 2,
  },
  sulfur_censer: {
    id: 'sulfur_censer',
    name: 'Sulfur Censer',
    description: 'Where it has burned, prayer no longer travels upward. +0.6 influence per second.',
    rarity: 'common',
    cost: 800,
    invokingPower: 2,
  },

  // ── Rare ───────────────────────────────────────────────────────────────────
  black_candles: {
    id: 'black_candles',
    name: 'Black Candles',
    description:
      'Each flame a small renunciation of the light. +3% invocation effect per candle, up to +15%.',
    rarity: 'rare',
    cost: 1600,
    invokingPower: 0,
    stackMax: 5,
  },
  ars_serpens: {
    id: 'ars_serpens',
    name: 'Ars Serpens',
    description:
      "The serpent's counsel, transcribed, every word a smoother lie. +33% Suasio efficiency.",
    rarity: 'rare',
    cost: 2000,
    invokingPower: 2,
  },
  hand_of_glory: {
    id: 'hand_of_glory',
    name: 'Hand of Glory',
    description:
      'Cut from a hanged man at the crossroads; it opens what should stay shut. Single-use: +33% reprobate generation for an hour.',
    rarity: 'rare',
    cost: 2200,
    invokingPower: 0,
    stackMax: Number.POSITIVE_INFINITY,
  },
  blood_chalk: {
    id: 'blood_chalk',
    name: 'Blood Chalk',
    description: 'Drawn in a circle no priest will step inside. +2 influence per second.',
    rarity: 'rare',
    cost: 2500,
    invokingPower: 3,
  },
  dybbuk_box: {
    id: 'dybbuk_box',
    name: 'Dybbuk Box',
    description: 'Something agreed to stay inside. For now. +10% gold gain.',
    rarity: 'rare',
    cost: 2800,
    invokingPower: 4,
  },
  ritual_dagger: {
    id: 'ritual_dagger',
    name: 'Ritual Dagger',
    description:
      'A rare hour of convergence: when offering and offerer cease to be separate. +10% murder rate.',
    rarity: 'rare',
    cost: 3000,
    invokingPower: 2,
  },
  blackthorn_wand: {
    id: 'blackthorn_wand',
    name: 'Blackthorn Wand',
    description:
      'Cut on a moonless night from a tree that took root over a grave. +2 influence per second.',
    rarity: 'rare',
    cost: 3300,
    invokingPower: 3,
  },
  black_vessel: {
    id: 'black_vessel',
    name: 'Black Vessel',
    description:
      'A vessel of blackened glass that swallows whatever is poured into it. -7% invocation costs.',
    rarity: 'rare',
    cost: 4000,
    invokingPower: 1,
  },
  teraphim: {
    id: 'teraphim',
    name: 'Teraphim',
    description:
      'A household idol kept turned to the wall, oracular and forbidden. +4% sigil effects.',
    rarity: 'rare',
    cost: 5000,
    invokingPower: 1,
  },

  // ── Profane ────────────────────────────────────────────────────────────────
  defixio: {
    id: 'defixio',
    name: 'Defixio',
    description:
      'A name, a nail, a curse folded into lead and buried. Single-use: +50% suicide rate for an hour.',
    rarity: 'profane',
    cost: 10000,
    invokingPower: 0,
    stackMax: Number.POSITIVE_INFINITY,
  },
  voynich_manuscript: {
    id: 'voynich_manuscript',
    name: 'The Voynich Manuscript',
    description: 'Unreadable to the faithful; fluent to the fallen. +25% Desidia gain rate.',
    rarity: 'profane',
    cost: 12000,
    invokingPower: 7,
  },
  galdrabok: {
    id: 'galdrabok',
    name: 'Galdrabók',
    description: 'A book of staves bound in hide, each page a small undoing. +12.5% murder rate.',
    rarity: 'profane',
    cost: 15000,
    invokingPower: 6,
  },
  codex_gigas: {
    id: 'codex_gigas',
    name: 'Codex Gigas',
    description:
      'One scribe. One night. One signature in the margin no Pope has ever erased. +25% influence gain rate.',
    rarity: 'profane',
    cost: 18000,
    invokingPower: 4,
  },
  obsidian_mirror: {
    id: 'obsidian_mirror',
    name: 'Obsidian Mirror',
    description: 'It shows what the future is already weighing. -33% Indagatio time.',
    rarity: 'profane',
    cost: 20000,
    invokingPower: 8,
  },
  grimoire_of_pope_honorius: {
    id: 'grimoire_of_pope_honorius',
    name: 'Grimoire of Pope Honorius',
    description:
      'The papal grimoire that damns its own author, bound within the Church against the Church. +13% invocation effects.',
    rarity: 'profane',
    cost: 22000,
    invokingPower: 5,
  },
  picatrix: {
    id: 'picatrix',
    name: 'Picatrix',
    description:
      'The Ghayat al-Hakim, astral magic copied by hands that did not believe and worked it anyway. +11% sigil effects.',
    rarity: 'profane',
    cost: 23000,
    invokingPower: 4,
  },

  // ── Anathema ───────────────────────────────────────────────────────────────
  achans_wedge: {
    id: 'achans_wedge',
    name: "Achan's Wedge",
    description:
      'The wedge of gold buried under a tent, the plunder that doomed a nation. +200% gold gain.',
    rarity: 'anathema',
    cost: 600000,
    invokingPower: 0,
  },
  pilates_basin: {
    id: 'pilates_basin',
    name: "Pilate's Basin",
    description:
      'The basin he washed his hands in; the water is still clean. -50% Desidia drain rate.',
    rarity: 'anathema',
    cost: 780000,
    invokingPower: 0,
  },
  mark_of_cain: {
    id: 'mark_of_cain',
    name: 'Mark of Cain',
    description:
      'The sevenfold vengeance was never a curse. It was a guarantee. +100% murder rate.',
    rarity: 'anathema',
    cost: 800000,
    invokingPower: 0,
  },
  thirty_pieces_of_silver: {
    id: 'thirty_pieces_of_silver',
    name: 'Thirty Pieces of Silver',
    description:
      'Counted out, refused, returned, refused again. Coinage that always finds its way back into a hand. +200% suicide rate.',
    rarity: 'anathema',
    cost: 800000,
    invokingPower: 0,
  },
  solomons_ring: {
    id: 'solomons_ring',
    name: "Solomon's Ring",
    description: 'The seal that bound seventy-two kings. It still pinches. +66% sigil effects.',
    rarity: 'anathema',
    cost: 850000,
    invokingPower: 0,
  },
  spear_of_longinus: {
    id: 'spear_of_longinus',
    name: 'Spear of Longinus',
    description: 'Just the tip. +200% influence gain rate.',
    rarity: 'anathema',
    cost: 1300000,
    invokingPower: 0,
  },
};
