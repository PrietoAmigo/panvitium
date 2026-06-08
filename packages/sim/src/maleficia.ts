/**
 * Maleficia catalog (03 §4). Each maleficium is an occult item the player discovers via *Indagatio*
 * and purchases via *Emptio*; once owned it sits on the Invocation Room shelf and (depending on
 * the item) contributes invoking power, an enhancer multiplier through the modifier engine, an
 * oracular reveal, or some combination. The catalog is the authoritative shape; the modifier
 * engine reads it to apply equipped-item effects. Item effects beyond the modifier-engine-wired
 * ones (oracular reveals, targeted single-use items like Hand of Glory / Defixio) attach as their
 * target systems land — they have a slot here ready for it.
 *
 * Roster, rarity, invoking power and stack caps are pinned to the `Maleficia` sheet (25 items).
 * Effects beyond raw invoking power are listed in each entry's `description`; the enhancer
 * multipliers (Suasio/Decimatio/invocation/sigil), the oracular reveals, and the targeted
 * single-use items are wired into their consuming systems in later slices.
 *
 * Stack rules (03 §2.5): a non-stackable maleficium already owned OR listed in *Emptio* cannot be
 * surfaced again; a stackable one cannot be surfaced once owned + listed reaches its `stackMax`.
 * Stackable items live in the array as duplicates (one entry per copy); `countOwned` reads them.
 */
import { SOLOMON_RING_SIGIL_BONUS, IRON_NAILS_SIGIL_BONUS } from './constants.js';
import type { GameState } from './state.js';

export type MaleficiumRarity = 'common' | 'rare' | 'profane' | 'anathema';

export interface MaleficiumDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rarity: MaleficiumRarity;
  /** Gold cost in *Emptio* (paid up front; on Bad/Terrible/Apocalyptic the deal still costs). */
  readonly cost: number;
  /** Each owned copy adds this to total invoking power (gates higher-tier invocations). */
  readonly invokingPower: number;
  /**
   * Undefined = non-stackable (max 1 owned). A finite number caps owned + listed total;
   * `Number.POSITIVE_INFINITY` marks an unbounded stack (limited only by gold).
   */
  readonly stackMax?: number;
}

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

/** The full 25-item catalog (sheet order). Effects past invoking power are wired in later slices. */
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
      'One scribe. One night. One signature in the margin no Pope has ever erased. x3 influence gain rate.',
    rarity: 'anathema',
    cost: 80000,
    invokingPower: 0,
  },
  mark_of_cain: {
    id: 'mark_of_cain',
    name: 'Mark of Cain',
    description:
      'The sevenfold vengeance was never a curse. It was a guarantee. Apocalyptic chance falls to zero.',
    rarity: 'anathema',
    cost: 80000,
    invokingPower: 0,
  },
  thirty_pieces_of_silver: {
    id: 'thirty_pieces_of_silver',
    name: 'Thirty Pieces of Silver',
    description:
      'Counted out, refused, returned, refused again. Coinage that always finds its way back into a hand. x3 gold gain rate.',
    rarity: 'anathema',
    cost: 80000,
    invokingPower: 0,
  },
  solomons_ring: {
    id: 'solomons_ring',
    name: "Solomon's Ring",
    description: 'The seal that bound seventy-two kings. It still pinches. +50% sigil effects.',
    rarity: 'anathema',
    cost: 85000,
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

export const MALEFICIUM_IDS: readonly string[] = Object.keys(MALEFICIA);

/** Whether a maleficium can be stacked (owned in multiple copies). */
export function isStackable(def: MaleficiumDef): boolean {
  return def.stackMax !== undefined;
}

/** Count copies of `id` in a maleficia-list (used for both owned and *Emptio* list). */
export function countCopies(list: readonly string[], id: string): number {
  let n = 0;
  for (const entry of list) if (entry === id) n++;
  return n;
}

/**
 * Whether `id` could legally be surfaced into the *Emptio* list right now (03 §2.5):
 * non-stackable items must be neither owned nor listed; stackable items must not already saturate
 * `stackMax` across owned + listed (an unbounded `Number.POSITIVE_INFINITY` cap never saturates).
 * Unknown ids return false.
 */
export function canSurface(
  id: string,
  owned: readonly string[],
  listed: readonly string[],
): boolean {
  const def = MALEFICIA[id];
  if (!def) return false;
  const total = countCopies(owned, id) + countCopies(listed, id);
  if (def.stackMax === undefined) return total === 0;
  return total < def.stackMax;
}

/** All catalog ids of the given rarity that can be surfaced from the current state. */
export function findableIds(
  rarity: MaleficiumRarity,
  owned: readonly string[],
  listed: readonly string[],
): string[] {
  const out: string[] = [];
  for (const id of MALEFICIUM_IDS) {
    const def = MALEFICIA[id];
    if (def && def.rarity === rarity && canSurface(id, owned, listed)) out.push(id);
  }
  return out;
}

/** Total invoking power from every equipped copy (sums stackables). */
export function totalInvokingPower(owned: readonly string[]): number {
  let p = 0;
  for (const id of owned) {
    const def = MALEFICIA[id];
    if (def) p += def.invokingPower;
  }
  return p;
}

/**
 * Multiplier applied to every sigil's effect strength from equipped sigil-enhancer maleficia
 * (Solomon's Ring +50%, Iron Nails +1% per copy). 1 when none are equipped. Consumed by
 * `sigilModifierContributions` and `sigilKatabasisBonus` so it scales modifier, tier, and
 * Katabasis-carryover sigils alike.
 */
export function sigilEffectMultiplier(owned: readonly string[]): number {
  return (
    1 +
    SOLOMON_RING_SIGIL_BONUS * countCopies(owned, 'solomons_ring') +
    IRON_NAILS_SIGIL_BONUS * countCopies(owned, 'iron_nails')
  );
}

/** Hand of Glory: one use grants +100% reprobate generation for an hour (Maleficia sheet). */
export const HAND_OF_GLORY_DURATION_SECONDS = 3600;
export const HAND_OF_GLORY_GENERATION_MUL = 2; // +100% base generation while the buff is live

export type ActivateResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Activate a single-use maleficium from the owned inventory. Currently only Hand of Glory is
 * activatable: it consumes one copy and adds an hour to the generation buff (repeat activations
 * extend the timer; the multiplier stays +100% while any time remains). Other items can't be used
 * this way. Defixio's single-use cull is deferred — its sheet "exp ramp" magnitude is unspecified.
 */
export function activateMaleficium(state: GameState, id: string): ActivateResult {
  const removeOne = (idx: number): string[] => [
    ...state.lifetime.maleficia.slice(0, idx),
    ...state.lifetime.maleficia.slice(idx + 1),
  ];
  if (id === 'hand_of_glory') {
    const idx = state.lifetime.maleficia.indexOf('hand_of_glory');
    if (idx === -1) return { ok: false, reason: 'You hold no Hand of Glory.' };
    return {
      ok: true,
      state: {
        ...state,
        lifetime: {
          ...state.lifetime,
          maleficia: removeOne(idx),
          handOfGloryRemaining:
            state.lifetime.handOfGloryRemaining + HAND_OF_GLORY_DURATION_SECONDS,
        },
      },
    };
  }
  if (id === 'defixio') {
    if (state.lifetime.defixio) return { ok: false, reason: 'A defixio is already at work.' };
    const idx = state.lifetime.maleficia.indexOf('defixio');
    if (idx === -1) return { ok: false, reason: 'You hold no Defixio.' };
    // The curse begins immediately and culls the reprobate pool at eᵗ/s (no subtype target).
    return {
      ok: true,
      state: {
        ...state,
        lifetime: {
          ...state.lifetime,
          maleficia: removeOne(idx),
          defixio: { elapsed: 0 },
        },
      },
    };
  }
  return { ok: false, reason: 'This maleficium cannot be used.' };
}
