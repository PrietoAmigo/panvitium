/**
 * Invocations (02 §7, 03 §2.4) — summon hellish entities that grant passive effects. Each has an
 * **invoking-power** requirement (sum of equipped maleficia `invokingPower`, plus sigils once those
 * land) and may also require a Cardinal Sin level. Summoning costs souls (a percentage of the
 * current pool with a floor) or nothing for the apex entities. Most are persistent and dispellable
 * at will; on Katabasis all are dispelled (handled in katabasis.ts — `invocations` reset to {}).
 *
 * Visibility (02 §12): an invocation appears in the Ars Goetia list once the player has at least
 * HALF its required invoking power — a teaser that the entity is within reach.
 *
 * THIS SLICE wires the infrastructure plus a representative subset whose effects map cleanly onto
 * the existing modifier bundle (computeModifiers reads `state.lifetime.invocations`):
 *   - Fama        (Vanagloria) — influence gain rate up      [stackable]
 *   - Nightmare   (Tristitia)  — reprobate suicide rate up   [stackable]
 *   - Harpy       (Ira)        — Choleric murder rate up      [stackable]
 *   - Behemoth    (Superbia)   — Stellar outcome chance up    [stackable]
 *   - Midas       (Avaritia)   — 3× gold, 100× Apocalyptic    [apex, max 1, free]
 *   - Doppelgaenger (Superbia) — +50% player efficiency, half influence [apex, max 1, free]
 *
 * Deferred to follow-ups (need new machinery): autonomous-channel invocations (Familiar, Imp),
 * periodic-kill entities (Upir, Astiwihad), dispel-condition entities (Aurevora at gold 0), and
 * the Katabasis-modifying apexes (Erinyes, Morpheus). Number magnitudes are placeholders,
 * spreadsheet-overridable; the shape is authoritative.
 */
import { floor, gte, max, mul, sub, ZERO, type BigNum } from './bignum.js';
import { totalInvokingPower } from './maleficia.js';
import { sinLevel } from './progression.js';
import { type GameState, type Sin } from './state.js';

export interface InvocationDef {
  readonly id: string;
  /** Sin alignment for flavour/grouping; `null` for the unaligned Familiar (not wired this slice). */
  readonly sin: Sin | null;
  /** Required invoking power to summon (02 §7). Visible at half this (02 §12). */
  readonly invokingPower: number;
  /** Required Cardinal Sin level, if any. */
  readonly sinLevel?: number;
  /** Soul cost: fraction of the current pool, floored, with a minimum. Omit for free apexes. */
  readonly soulCost?: { readonly fraction: number; readonly minimum: number };
  /** Maximum simultaneously active (the apex entities cap at 1). Default unlimited (stackable). */
  readonly maxActive?: number;
}

/** The wired subset of the invocation catalog (03 §2.4). Keyed by id. */
export const INVOCATIONS: Readonly<Record<string, InvocationDef>> = {
  fama: {
    id: 'fama',
    sin: 'vanagloria',
    invokingPower: 7,
    sinLevel: 1,
    soulCost: { fraction: 0.1, minimum: 100 },
  },
  nightmare: {
    id: 'nightmare',
    sin: 'tristitia',
    invokingPower: 6,
    sinLevel: 1,
    soulCost: { fraction: 0.1, minimum: 100 },
  },
  harpy: {
    id: 'harpy',
    sin: 'ira',
    invokingPower: 7,
    sinLevel: 2,
    soulCost: { fraction: 0.25, minimum: 1500 },
  },
  behemoth: {
    id: 'behemoth',
    sin: 'superbia',
    invokingPower: 3,
    sinLevel: 1,
    soulCost: { fraction: 0.1, minimum: 100 },
  },
  midas: {
    id: 'midas',
    sin: 'avaritia',
    invokingPower: 11,
    sinLevel: 3,
    maxActive: 1,
  },
  doppelgaenger: {
    id: 'doppelgaenger',
    sin: 'superbia',
    invokingPower: 12,
    sinLevel: 3,
    maxActive: 1,
  },
} as const;

/** All wired invocation ids in stable order. */
export const INVOCATION_IDS: readonly string[] = Object.freeze(Object.keys(INVOCATIONS));

/** Lookup; undefined for unknown ids. */
export function invocationById(id: string): InvocationDef | undefined {
  return INVOCATIONS[id];
}

/** Current invoking power: sum of equipped maleficia (sigils add here once they land, 02 §7). */
export function currentInvokingPower(state: GameState): number {
  return totalInvokingPower(state.lifetime.maleficia);
}

/** How many of `id` are currently active. */
export function activeInvocationCount(state: GameState, id: string): number {
  return state.lifetime.invocations[id] ?? 0;
}

/** Visible in the Ars Goetia list once invoking power ≥ half the requirement (02 §12). */
export function invocationVisible(state: GameState, def: InvocationDef): boolean {
  return currentInvokingPower(state) >= def.invokingPower / 2;
}

/** Whether every gate (invoking power, Sin level) is met. Does NOT check cost or cap. */
export function invocationUnlocked(state: GameState, def: InvocationDef): boolean {
  if (currentInvokingPower(state) < def.invokingPower) return false;
  if (def.sinLevel !== undefined && def.sin !== null) {
    if (sinLevel(state.devotion[def.sin]) < def.sinLevel) return false;
  }
  return true;
}

/** The soul cost to summon `def` right now (floored). Zero for free invocations. */
export function invocationSoulCost(state: GameState, def: InvocationDef): BigNum {
  if (!def.soulCost) return ZERO;
  const pct = floor(mul(state.souls, def.soulCost.fraction));
  return max(pct, def.soulCost.minimum);
}

export type InvokeResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Summon one of `id`. Checks: known id, gates met, under the max-active cap, soul cost affordable.
 * On success: deduct the soul cost and increment the invocation count. Persistent by default —
 * stays until dispelled or Katabasis.
 */
export function invoke(state: GameState, id: string): InvokeResult {
  const def = invocationById(id);
  if (!def) return { ok: false, reason: `unknown invocation: ${id}` };
  if (!invocationUnlocked(state, def)) {
    const ip = `${def.invokingPower} invoking power`;
    const lvl =
      def.sinLevel !== undefined && def.sin !== null ? `, ${def.sin} ${def.sinLevel}` : '';
    return { ok: false, reason: `requires ${ip}${lvl}` };
  }
  const cap = def.maxActive ?? Infinity;
  if (activeInvocationCount(state, id) >= cap) {
    return { ok: false, reason: 'already at its limit' };
  }
  const cost = invocationSoulCost(state, def);
  if (!gte(floor(state.souls), cost)) {
    return { ok: false, reason: 'not enough souls' };
  }
  const invocations = { ...state.lifetime.invocations, [id]: activeInvocationCount(state, id) + 1 };
  return {
    ok: true,
    state: {
      ...state,
      souls: sub(state.souls, cost),
      lifetime: { ...state.lifetime, invocations },
    },
  };
}

/** Dispel one of `id` (decrement; delete the key at 0). Fails if none active. */
export function dispel(state: GameState, id: string): InvokeResult {
  const count = activeInvocationCount(state, id);
  if (count <= 0) return { ok: false, reason: 'not active' };
  const invocations = { ...state.lifetime.invocations };
  if (count === 1) delete invocations[id];
  else invocations[id] = count - 1;
  return {
    ok: true,
    state: { ...state, lifetime: { ...state.lifetime, invocations } },
  };
}
