/**
 * Maleficia catalog (03 §4). Each maleficium is an occult item the player discovers via *Indagatio*
 * and purchases via *Emptio*; once owned it sits in the Loculi (the Invocation Room niches) and
 * (depending on the item) contributes invoking power, an enhancer multiplier through the modifier
 * engine, an invocation-cost reduction, a single-use timed buff, or some combination. The catalog is
 * the authoritative shape; the modifier engine reads it to apply equipped-item effects.
 *
 * Roster, rarity, invoking power and stack caps are pinned to the `Maleficia` sheet (34 items).
 * Effects beyond raw invoking power are listed in each entry's `description`; the enhancer
 * multipliers (Suasio/Desidia/rate/sigil/invocation) are wired in `modifiers.ts`, the invocation-cost
 * reduction (Black Vessel) in `invocations.ts`, and the single-use consumables in the `maleficiaBuffs`
 * timer system below.
 *
 * Stack rules (03 §2.5): a non-stackable maleficium already owned OR listed in *Emptio* cannot be
 * surfaced again; a stackable one cannot be surfaced once owned + listed reaches its `stackMax`.
 * Stackable items live in the array as duplicates (one entry per copy); `countOwned` reads them.
 */
import {
  SOLOMON_RING_SIGIL_BONUS,
  PICATRIX_SIGIL_BONUS,
  TERAPHIM_SIGIL_BONUS,
} from './constants.js';
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
 *
 * The *Emptio* list also never holds two copies of the SAME maleficium at once: a stackable already
 * on the list is not re-found until it is bought (which clears its entry). Owned copies do not block
 * re-finding, so stacks still grow one purchase at a time. This keeps an ever-findable consumable
 * (Defixio, Hand of Glory) from flooding the 20-slot list and starving the rarer finds out through
 * the eviction rule (which never displaces a rarer relic) — so every maleficium stays discoverable.
 */
export function canSurface(
  id: string,
  owned: readonly string[],
  listed: readonly string[],
): boolean {
  const def = MALEFICIA[id];
  if (!def) return false;
  if (countCopies(listed, id) > 0) return false; // one copy per id on the list at a time
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
 * (Solomon's Ring +66%, Picatrix +11%, Teraphim +4%). 1 when none are equipped. Consumed by
 * `sigilModifierContributions` and `sigilKatabasisBonus` so it scales modifier, tier, and
 * Katabasis-carryover sigils alike. All three are non-stackable, so they compose additively.
 */
export function sigilEffectMultiplier(owned: readonly string[]): number {
  return (
    1 +
    SOLOMON_RING_SIGIL_BONUS * countCopies(owned, 'solomons_ring') +
    PICATRIX_SIGIL_BONUS * countCopies(owned, 'picatrix') +
    TERAPHIM_SIGIL_BONUS * countCopies(owned, 'teraphim')
  );
}

/**
 * Black Vessel: -7% to every invocation cost (summon soul/gold and per-second upkeep, ADR-035).
 * Non-stackable, so 0 or 1 copies; returns the multiplier applied to each invocation cost
 * (`1 - 0.07` when owned, clamped ≥ 0). Consumed in `invocations.ts` alongside the sigil cost channel.
 */
export const BLACK_VESSEL_INVOCATION_COST_REDUCTION = 0.07;
export function maleficiaInvocationCostMul(owned: readonly string[]): number {
  const factor = 1 - BLACK_VESSEL_INVOCATION_COST_REDUCTION * countCopies(owned, 'black_vessel');
  return Math.max(0, factor);
}

// ── Single-use timed buffs ────────────────────────────────────────────────────
// The consumable maleficia (Hand of Glory, Black Salt Pouch, Defixio, Crossroads Dirt) each grant a
// one-hour multiplier on a single modifier field when activated. Activation consumes one owned copy
// and (re)fills that id's timer in `lifetime.maleficiaBuffs` (a fresh use EXTENDS the timer, as Hand
// of Glory always has); the tick decays each timer by `simDelta` and drops it at 0. `computeModifiers`
// folds the active buffs into their fields via `maleficiaBuffMultipliers`.

/** How long a single-use maleficium's buff lasts per activation (Maleficia sheet: one hour). */
export const MALEFICIA_BUFF_DURATION_SECONDS = 3600;

/** The modifier fields a single-use maleficia buff can lift. */
export type MaleficiaBuffField =
  | 'reprobateGenerationRateMul'
  | 'reprobateSuicideRateMul'
  | 'indagatioEfficiencyMul';

interface MaleficiaBuffDef {
  readonly field: MaleficiaBuffField;
  readonly factor: number;
}

/**
 * The single-use consumables and the timed multiplier each grants. `factor` is the multiplier on
 * `field` while the buff is live (magnitudes match the catalog copy):
 *   - Hand of Glory:     +33% reprobate generation
 *   - Black Salt Pouch:  +10% reprobate generation
 *   - Defixio:           +50% suicide rate
 *   - Crossroads Dirt:   -15% Indagatio time (a search-speed lift: `1 / (1 - 0.15)`)
 */
export const MALEFICIA_BUFFS: Record<string, MaleficiaBuffDef> = {
  hand_of_glory: { field: 'reprobateGenerationRateMul', factor: 1.33 },
  black_salt_pouch: { field: 'reprobateGenerationRateMul', factor: 1.1 },
  defixio: { field: 'reprobateSuicideRateMul', factor: 1.5 },
  crossroads_dirt: { field: 'indagatioEfficiencyMul', factor: 1 / (1 - 0.15) },
};

/** Ids that can be activated as a single-use timed buff (drives the Loculi "Use" affordance). */
export const SINGLE_USE_MALEFICIA: readonly string[] = Object.keys(MALEFICIA_BUFFS);

/** The per-field product of the currently-active single-use maleficia buffs. */
export interface MaleficiaBuffMultipliers {
  readonly reprobateGenerationRateMul: number;
  readonly reprobateSuicideRateMul: number;
  readonly indagatioEfficiencyMul: number;
}

const NEUTRAL_MALEFICIA_BUFFS: MaleficiaBuffMultipliers = {
  reprobateGenerationRateMul: 1,
  reprobateSuicideRateMul: 1,
  indagatioEfficiencyMul: 1,
};

/**
 * Aggregate the active single-use buffs into a per-field product (multiplicative composition,
 * ADR-022). A timer at or below 0 is ignored (the tick drops it next pass). Returns the neutral
 * bundle when none is active, so a save with no buffs behaves exactly as before.
 */
export function maleficiaBuffMultipliers(state: GameState): MaleficiaBuffMultipliers {
  const buffs = state.lifetime.maleficiaBuffs;
  const ids = Object.keys(buffs);
  if (ids.length === 0) return NEUTRAL_MALEFICIA_BUFFS;
  const out = { ...NEUTRAL_MALEFICIA_BUFFS };
  for (const id of ids) {
    if ((buffs[id] ?? 0) <= 0) continue;
    const def = MALEFICIA_BUFFS[id];
    if (def) out[def.field] *= def.factor;
  }
  return out;
}

export type ActivateResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Activate a single-use maleficium from the owned inventory. Consumes one copy and (re)fills that
 * id's one-hour timer in `lifetime.maleficiaBuffs`; a repeat activation extends the timer while the
 * buff's magnitude stays fixed (the Hand of Glory convention). Non-consumable items can't be used
 * this way.
 */
export function activateMaleficium(state: GameState, id: string): ActivateResult {
  if (!MALEFICIA_BUFFS[id]) return { ok: false, reason: 'This maleficium cannot be used.' };
  const idx = state.lifetime.maleficia.indexOf(id);
  if (idx === -1) {
    const def = MALEFICIA[id];
    return { ok: false, reason: `You hold no ${def ? def.name : 'such maleficium'}.` };
  }
  const maleficia = [
    ...state.lifetime.maleficia.slice(0, idx),
    ...state.lifetime.maleficia.slice(idx + 1),
  ];
  const remaining = (state.lifetime.maleficiaBuffs[id] ?? 0) + MALEFICIA_BUFF_DURATION_SECONDS;
  return {
    ok: true,
    state: {
      ...state,
      lifetime: {
        ...state.lifetime,
        maleficia,
        maleficiaBuffs: { ...state.lifetime.maleficiaBuffs, [id]: remaining },
      },
    },
  };
}
