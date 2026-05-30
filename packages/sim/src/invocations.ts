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
 *   - Harpy       (Ira)        — Decimatio efficiency up       [stackable]
 *   - Behemoth    (Superbia)   — Stellar outcome chance up    [stackable]
 *   - Midas       (Avaritia)   — 3× gold, 100× Apocalyptic    [apex, max 1, free]
 *   - Doppelgaenger (Superbia) — +50% player efficiency, half influence [apex, max 1, free]
 *
 * Phase 4 close: every invocation in the catalog is wired. The three effect shapes are:
 *   (1) autonomous-runner channel — `def.autonomous`, advanced via runner.ts (Familiar, Imp, Upir).
 *   (2) static modifier-bundle contribution — a line in modifiers.ts (Fama, Nightmare, Harpy,
 *       Lamia, Lemure, Behemoth, Midas, Plutus, Succubus, Doppelgänger).
 *   (3) per-tick / per-invoke side-effects — Astiwihad + Aurevora live in apex.ts (per-tick mass
 *       suicide + exponential gold drain); Erinyes + Morpheus are handled at invoke/commit time
 *       in this module + katabasis.ts (kill-all + Katabasis carry-over overrides); Specunitas
 *       feeds the per-subtype conversion-bias hook in dynamics.ts (`conversionBiasMul`).
 * Number magnitudes are placeholders, spreadsheet-overridable; the shape is authoritative.
 */
import { floor, gte, max, mul, sub, ZERO, type BigNum } from './bignum.js';
import { totalInvokingPower } from './maleficia.js';
import { mintSouls } from './population.js';
import { sinLevel } from './progression.js';
import {
  REPROBATE_SUBTYPES,
  totalReprobates,
  type GameState,
  type ReprobateSubtype,
  type Sin,
} from './state.js';
import { computeModifiers } from './modifiers.js';
import { advanceRunnerCycles } from './runner.js';
import { type Tier } from './probability.js';
import { type Rng } from './rng.js';
import { type OutcomeEvent } from './events.js';

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
  /**
   * Gold cost (in addition to soulCost): a fraction of the current gold pool, floored, with an
   * optional minimum (Morpheus pays 66% of gold). Omitted for invocations that don't cost gold.
   */
  readonly goldCost?: { readonly fraction: number; readonly minimum?: number };
  /** Maximum simultaneously active (the apex entities cap at 1). Default unlimited (stackable). */
  readonly maxActive?: number;
  /**
   * Autonomous background runner (02 §3): this invocation runs `action` in its own channel at
   * `efficiency` × the player's efficiency, without occupying the player's action slot. The Familiar
   * runs Indagatio (time-mode, free); the Imp runs Decimatio (cost-outcome) — its channel pays
   * `ceil(cost × efficiency)` per cycle and stalls when the lifetime can't afford one. `forcedTier`
   * pins the outcome tier so a passive runner can't roll a catastrophic result (the Imp is Good-only,
   * 03 §2.4).
   */
  readonly autonomous?: {
    readonly action: string;
    readonly efficiency: number;
    readonly forcedTier?: Tier;
  };
}

/** The wired subset of the invocation catalog (03 §2.4). Keyed by id. */
export const INVOCATIONS: Readonly<Record<string, InvocationDef>> = {
  familiar: {
    id: 'familiar',
    sin: null,
    invokingPower: 3,
    maxActive: 1,
    // Hybrid (02 §3): a flat +33% to player efficiency (applied in modifiers.ts alongside the other
    // invocation magnitudes) AND a background Indagatio runner at 5% of the player's efficiency.
    autonomous: { action: 'indagatio', efficiency: 0.05 },
  },
  imp: {
    id: 'imp',
    sin: 'ira',
    invokingPower: 4,
    sinLevel: 1,
    soulCost: { fraction: 0.1, minimum: 100 },
    maxActive: 1,
    // Background Decimatio (cost-outcome): each cycle pays ceil(caedisCost × 0.05×playerEff) and
    // resolves a Good kill. Good-only so a passive entity can never roll Apocalyptic and gut the
    // player's gold/reprobates unprompted (03 §2.4).
    autonomous: { action: 'caedis', efficiency: 0.05, forcedTier: 'good' },
  },
  upir: {
    id: 'upir',
    sin: 'gula',
    invokingPower: 3,
    sinLevel: 1,
    soulCost: { fraction: 0.1, minimum: 100 },
    maxActive: 1,
    // Gula's background culler. The spreadsheet frames Upir as a Caedis runner at 0.05 (the doc's
    // "kills 1 / 30 s" was the older mechanic); per the spreadsheet-wins-on-numbers rule we model it
    // as the engine's cost-outcome runner, Good-only like the Imp. Single channel (maxActive 1) —
    // the runner model is one channel per id, so stacking wouldn't multiply throughput anyway.
    autonomous: { action: 'caedis', efficiency: 0.05, forcedTier: 'good' },
  },
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
  lamia: {
    id: 'lamia',
    sin: 'luxuria',
    invokingPower: 8,
    sinLevel: 2,
    soulCost: { fraction: 0.25, minimum: 1500 },
    // Stackable. Effect (modifiers.ts): lifts Suasio success-tier weights and unconverted reprobate
    // generation. No autonomous channel — a passive modifier source like Fama/Nightmare/Harpy.
  },
  lemure: {
    id: 'lemure',
    sin: 'acedia',
    invokingPower: 7,
    sinLevel: 1,
    soulCost: { fraction: 0.1, minimum: 100 },
    // Stackable. Effect (modifiers.ts): adds flat influence/s scaling with the Husk population.
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
  plutus: {
    id: 'plutus',
    sin: 'avaritia',
    invokingPower: 8,
    sinLevel: 2,
    soulCost: { fraction: 0.25, minimum: 1500 },
    // Stackable. Effect (modifiers.ts): lifts Vitium Mercatura output (gold + generation +
    // conversion) by a flat factor per copy. A passive modifier source, no autonomous channel.
  },
  succubus: {
    id: 'succubus',
    sin: 'luxuria',
    invokingPower: 12,
    sinLevel: 3,
    maxActive: 1,
    // Apex Luxuria (free). Effect (modifiers.ts): dramatically multiplies reprobate generation, but
    // cuts gold gain to 1% of total — a generation-at-all-costs ritual.
  },
  doppelgaenger: {
    id: 'doppelgaenger',
    sin: 'superbia',
    invokingPower: 12,
    sinLevel: 3,
    maxActive: 1,
  },
  astiwihad: {
    id: 'astiwihad',
    sin: 'tristitia',
    invokingPower: 15,
    sinLevel: 3,
    maxActive: 1,
    // Apex Tristitia (free). Effect (apex.ts): each second a small chance the whole reprobate
    // population suicides at once — every death mints a soul, so a wipe banks the lot.
  },
  aurevora: {
    id: 'aurevora',
    sin: 'gula',
    invokingPower: 10,
    sinLevel: 3,
    maxActive: 1,
    // Apex Gula (free). Effect (apex.ts): an exponentially-rising gold drain paid against a
    // similarly-rising player-efficiency boost (duration tracked in invocationDurations); when the
    // drain takes gold to 0 it dispels. The efficiency half is folded in by modifiers.ts.
  },
  erinyes: {
    id: 'erinyes',
    sin: 'ira',
    invokingPower: 17,
    sinLevel: 3,
    maxActive: 1,
    // Apex Ira (free, one-shot at the next Katabasis). Effects on invoke (see `invoke`): kills the
    // entire reprobate population (every death mints a soul), dispels any active Morpheus and locks
    // it out for the rest of the lifetime, and sets `pendingErinyes` for `commitKatabasis` to read
    // (zero gold + maleficia carry-over and stack a permanent ×2 player-efficiency multiplier).
  },
  morpheus: {
    id: 'morpheus',
    sin: 'acedia',
    invokingPower: 14,
    sinLevel: 3,
    soulCost: { fraction: 0.66, minimum: 0 },
    goldCost: { fraction: 0.66 },
    maxActive: 1,
    // Apex Acedia (66% souls + 66% gold). Effect on invoke (see `invoke`): refused while
    // `morpheusLockedOut` is set. Effect while active (see tick.ts): the lifetime is held in
    // stillness — no income, no dynamics, no Opera or builds; on commit, `pendingMorpheus` overrides
    // the Katabasis carry-over to gold 100% + maleficia 100% + Emptio-list preserved.
  },
  specunitas: {
    id: 'specunitas',
    sin: 'vanagloria',
    invokingPower: 13,
    sinLevel: 3,
    maxActive: 1,
    // Apex Vanagloria (free). Effect (dynamics.ts `conversionBiasMul`): the Celebrity subtype's
    // weight in the conversion-bias draw is multiplied 100× — businesses already biased toward
    // Celebrity (Vanagloria-mercatura) convert almost entirely to Celebrity while Specunitas is
    // active. The same hook will carry Eligos #15 / Phenex #37 sigil bonuses later.
  },
} as const;

/** All wired invocation ids in stable order. */
export const INVOCATION_IDS: readonly string[] = Object.freeze(Object.keys(INVOCATIONS));

/** A zeroed per-subtype reprobate map (used by the Erinyes kill-all). */
function zeroReprobates(): Record<ReprobateSubtype, number> {
  const out = {} as Record<ReprobateSubtype, number>;
  for (const t of REPROBATE_SUBTYPES) out[t] = 0;
  return out;
}

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

/**
 * The gold cost to summon `def` right now (floored). Zero for invocations that don't list a gold
 * cost. Morpheus is the only entry with a gold cost so far (66% of the gold pool, no minimum).
 */
export function invocationGoldCost(state: GameState, def: InvocationDef): BigNum {
  if (!def.goldCost) return ZERO;
  const pct = floor(mul(state.lifetime.gold, def.goldCost.fraction));
  const min = def.goldCost.minimum ?? 0;
  return max(pct, min);
}

export type InvokeResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Summon one of `id`. Checks: known id, gates met, under the max-active cap, soul/gold cost
 * affordable, plus the Morpheus lockout (an Erinyes-summoned lifetime can never invoke Morpheus
 * again). On success: deduct the soul and gold costs and increment the invocation count.
 * Persistent by default — stays until dispelled or Katabasis.
 *
 * The two Katabasis-modifying apexes (03 §2.4) carry side-effects at invoke time:
 *   - Erinyes immediately kills every reprobate (each death mints one soul), dispels any active
 *     Morpheus, clears `pendingMorpheus`, sets `morpheusLockedOut`, and sets `pendingErinyes` for
 *     `commitKatabasis` to read.
 *   - Morpheus refuses if `morpheusLockedOut` is set; otherwise pays its cost and sets
 *     `pendingMorpheus`.
 */
export function invoke(state: GameState, id: string): InvokeResult {
  const def = invocationById(id);
  if (!def) return { ok: false, reason: `unknown invocation: ${id}` };
  if (id === 'morpheus' && state.lifetime.morpheusLockedOut === true) {
    return { ok: false, reason: 'Morpheus has been silenced by Erinyes\u2019s wrath.' };
  }
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
  const soulCost = invocationSoulCost(state, def);
  if (!gte(floor(state.souls), soulCost)) {
    return { ok: false, reason: 'not enough souls' };
  }
  const goldCost = invocationGoldCost(state, def);
  if (!gte(floor(state.lifetime.gold), goldCost)) {
    return { ok: false, reason: 'not enough gold' };
  }

  // Standard cost deduction + active-count increment.
  let working: GameState = {
    ...state,
    souls: sub(state.souls, soulCost),
    lifetime: {
      ...state.lifetime,
      gold: sub(state.lifetime.gold, goldCost),
      invocations: { ...state.lifetime.invocations, [id]: activeInvocationCount(state, id) + 1 },
    },
  };

  // ── Apex side-effects ────────────────────────────────────────────────────────────────────
  if (id === 'erinyes') {
    // Kill every reprobate at once — each death mints one soul (the 1-person-1-soul invariant).
    // No RNG draws (a 100% wipe is deterministic) and the integer count is exact.
    const population = totalReprobates(working);
    if (population > 0) {
      working = mintSouls(working, population);
      working = {
        ...working,
        lifetime: { ...working.lifetime, reprobates: zeroReprobates() },
      };
    }
    // Dispel any active Morpheus, cancel its pending Katabasis effect, and lock it out.
    const invocations = { ...working.lifetime.invocations };
    if ((invocations.morpheus ?? 0) > 0) delete invocations.morpheus;
    working = {
      ...working,
      lifetime: {
        ...working.lifetime,
        invocations,
        pendingErinyes: true,
        pendingMorpheus: false,
        morpheusLockedOut: true,
      },
    };
  } else if (id === 'morpheus') {
    working = {
      ...working,
      lifetime: { ...working.lifetime, pendingMorpheus: true },
    };
  }

  return { ok: true, state: working };
}

/** Dispel one of `id` (decrement; delete the key at 0). Fails if none active. */
export function dispel(state: GameState, id: string): InvokeResult {
  const count = activeInvocationCount(state, id);
  if (count <= 0) return { ok: false, reason: 'not active' };
  const invocations = { ...state.lifetime.invocations };
  let invocationDurations = state.lifetime.invocationDurations;
  if (count === 1) {
    delete invocations[id];
    // No copies remain → drop any duration-scaled counter so a re-summon starts from zero.
    if (id in invocationDurations) {
      invocationDurations = { ...invocationDurations };
      delete invocationDurations[id];
    }
  } else invocations[id] = count - 1;
  return {
    ok: true,
    state: { ...state, lifetime: { ...state.lifetime, invocations, invocationDurations } },
  };
}

/** Invocation ids that run an autonomous background action and are currently active (count ≥ 1). */
function activeRunnerIds(state: GameState): string[] {
  const out: string[] = [];
  for (const id of INVOCATION_IDS) {
    const def = INVOCATIONS[id];
    if (def?.autonomous && (state.lifetime.invocations[id] ?? 0) > 0) out.push(id);
  }
  return out;
}

/**
 * Advance every active autonomous-runner invocation (the Familiar's background Indagatio, the Imp's
 * background Decimatio — 02 §3) by `deltaSeconds`, each in its own channel, never touching the
 * player's action slot. Per runner the effective efficiency is `autonomous.efficiency × the player's
 * efficiency`. Cost-outcome runners (Imp) pay per cycle and may STALL when the lifetime can't afford
 * one — a stalled runner stores no timer (its key is omitted) and is retried next tick. Timers for
 * invocations no longer active are dropped. Events fold into the same outcome stream.
 */
export function advanceInvocationRunners(
  state: GameState,
  deltaSeconds: number,
  rng: Rng,
): { state: GameState; events: OutcomeEvent[] } {
  const active = activeRunnerIds(state);
  const existing = state.lifetime.invocationRunners;
  const hasStaleTimers = Object.keys(existing).some((id) => !active.includes(id));
  if (active.length === 0) {
    // Nothing runs; clear any leftover timers so dispelled runners don't linger in the save.
    return hasStaleTimers
      ? { state: { ...state, lifetime: { ...state.lifetime, invocationRunners: {} } }, events: [] }
      : { state, events: [] };
  }

  const events: OutcomeEvent[] = [];
  let working = state;
  const runners: Record<string, number> = {};

  for (const id of active) {
    const def = INVOCATIONS[id]!;
    const auto = def.autonomous!;
    const mods = computeModifiers(working);
    // Per-invocation auto.efficiency × player's own × any invocation-wide boost (Ira level, 03 §1).
    const eff = auto.efficiency * mods.playerEfficiencyMul * mods.invocationEfficiencyMul;
    // Absent key (undefined) ⇒ null: a fresh or previously-stalled channel the engine will (re)start.
    const prev = existing[id] ?? null;
    const r = advanceRunnerCycles(
      working,
      auto.action,
      eff,
      prev,
      deltaSeconds,
      rng,
      auto.forcedTier,
    );
    working = r.state;
    for (const e of r.events) events.push(e);
    // Only persist a numeric timer; a stalled channel (null) leaves its key out of the record.
    if (r.remaining !== null) runners[id] = r.remaining;
  }

  return {
    state: { ...working, lifetime: { ...working.lifetime, invocationRunners: runners } },
    events,
  };
}
