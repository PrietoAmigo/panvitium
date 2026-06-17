/**
 * Maleficia catalog (03 §4). Each maleficium is an occult item the player discovers via *Indagatio*
 * and purchases via *Emptio*; once owned it sits on the Invocation Room shelf and (depending on
 * the item) contributes invoking power, an enhancer multiplier through the modifier engine, an
 * oracular reveal, or some combination. The catalog is the authoritative shape; the modifier
 * engine reads it to apply equipped-item effects. Item effects beyond the modifier-engine-wired
 * ones (oracular reveals, targeted single-use items like Hand of Glory / Defixio) attach as their
 * target systems land — they have a slot here ready for it.
 *
 * Roster, rarity, invoking power and stack caps are pinned to the `Maleficia` sheet (29 items).
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
// The price bands + catalog live in `maleficia.data.ts` (the editable economy knobs); imported for
// the logic here and re-exported so existing `import { MALEFICIA, ... } from './maleficia.js'` works.
import { MALEFICIUM_PRICE_RANGE, MALEFICIA } from './maleficia.data.js';
export { MALEFICIUM_PRICE_RANGE, MALEFICIA };

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

export const MALEFICIUM_IDS: readonly string[] = Object.keys(MALEFICIA);

/**
 * Maximum number of items the Indagatio's Emptio list can hold at once. Finding a new item past
 * this cap drops the oldest surfaced item (FIFO).
 */
export const MAX_EMPTIO_LIST_SIZE = 20;

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
