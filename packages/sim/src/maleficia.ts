/**
 * Maleficia catalog (03 §4). Each maleficium is an occult item the player discovers via *Indagatio*
 * and purchases via *Emptio*; once owned it sits on the Invocation Room shelf and (depending on
 * the item) contributes invoking power, an enhancer multiplier through the modifier engine, an
 * oracular reveal, or some combination. The catalog is the authoritative shape; the modifier
 * engine reads it to apply equipped-item effects. Item effects beyond the modifier-engine-wired
 * ones (oracular reveals, targeted single-use items like Hand of Glory / Defixio) attach as their
 * target systems land — they have a slot here ready for it.
 *
 * Stack rules (03 §2.5): a non-stackable maleficium already owned OR listed in *Emptio* cannot be
 * surfaced again; a stackable one cannot be surfaced once owned + listed reaches its `stackMax`.
 * Stackable items live in the array as duplicates (one entry per copy); `countOwned` reads them.
 */
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
  /** Undefined = non-stackable (max 1 owned). A number caps owned + listed total. */
  readonly stackMax?: number;
}

/** A first set spanning every rarity, with the four anathema items wired into the modifier engine. */
export const MALEFICIA: Record<string, MaleficiumDef> = {
  black_robe: {
    id: 'black_robe',
    name: 'Black Robe',
    description: 'What separates the celebrant from the congregation is mostly fabric.',
    rarity: 'common',
    cost: 500,
    invokingPower: 1,
  },
  black_salt_pouch: {
    id: 'black_salt_pouch',
    name: 'Black Salt Pouch',
    description: 'Drawn from ash, charcoal, and graveyard earth.',
    rarity: 'common',
    cost: 150,
    invokingPower: 1,
    stackMax: 5,
  },
  sulfur_censer: {
    id: 'sulfur_censer',
    name: 'Sulfur Censer',
    description: 'Where it has burned, prayer no longer travels upward.',
    rarity: 'common',
    cost: 800,
    invokingPower: 2,
  },
  ritual_dagger: {
    id: 'ritual_dagger',
    name: 'Ritual Dagger',
    description: 'A rare hour of convergence: when offering and offerer cease to be separate.',
    rarity: 'rare',
    cost: 3000,
    invokingPower: 2,
  },
  blackthorn_wand: {
    id: 'blackthorn_wand',
    name: 'Blackthorn Wand',
    description: 'Cut on a moonless night from a tree that took root over a grave.',
    rarity: 'rare',
    cost: 5000,
    invokingPower: 4,
  },
  obsidian_mirror: {
    id: 'obsidian_mirror',
    name: 'Obsidian Mirror',
    description: 'It shows what the future is already weighing.',
    rarity: 'profane',
    cost: 20000,
    invokingPower: 8,
  },
  spear_of_longinus: {
    id: 'spear_of_longinus',
    name: 'Spear of Longinus',
    description: 'Just the tip.',
    rarity: 'anathema',
    cost: 100000,
    invokingPower: 0,
  },
  codex_gigas: {
    id: 'codex_gigas',
    name: 'Codex Gigas',
    description: 'One scribe. One night. One signature in the margin no Pope has ever erased.',
    rarity: 'anathema',
    cost: 100000,
    invokingPower: 0,
  },
  thirty_pieces_of_silver: {
    id: 'thirty_pieces_of_silver',
    name: 'Thirty Pieces of Silver',
    description:
      'Counted out, refused, returned, refused again. Coinage that always finds its way back into a hand.',
    rarity: 'anathema',
    cost: 100000,
    invokingPower: 0,
  },
  mark_of_cain: {
    id: 'mark_of_cain',
    name: 'Mark of Cain',
    description: 'The sevenfold vengeance was never a curse. It was a guarantee.',
    rarity: 'anathema',
    cost: 100000,
    invokingPower: 0,
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
 * `stackMax` across owned + listed. Unknown ids return false.
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
