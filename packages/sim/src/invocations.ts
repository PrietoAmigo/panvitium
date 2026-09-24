/**
 * Invocations (02 §7, 03 §2.4) — summon hellish entities that grant passive effects. Each has an
 * **invoking-power** requirement (sum of equipped maleficia `invokingPower`, plus sigils) and may
 * also require a Cardinal Sin level. Summoning is always free up front; the cost is a per-second
 * **upkeep** paid out of income and pools while active (see `invocationUpkeep` + tick.ts step 1a):
 * flat gold/influence, %-of-gain (gold/influence), a flat or %-of-pool **reprobate** drain (a pure
 * cost — no souls minted), and a **desidia** drain. A flat drain the pool can't sustain dispels
 * the invocation; %-costs only zero a gain or shrink a pool, never bankrupt. Most are persistent and
 * dispellable at will; on Katabasis all are dispelled (katabasis.ts — `invocations` reset to {}).
 * Every cost is softened by `invocationCostMul` (the Orobas / Zepar / Andrealphus cost channel and
 * Black Vessel, each a `1/(1 + x)` cut; ADR-035/036).
 *
 * Visibility (02 §12): an invocation appears in the Ars Goetia list once the player has at least
 * HALF its required invoking power — a teaser that the entity is within reach.
 *
 * **The apex entities (Sin level 3) are one-kind-per-lifetime** (see `invoke`): once any apex is
 * summoned, only that same kind may be re-summoned until the next Katabasis.
 *
 * The effect shapes (the autonomous-runner shape was retired and removed, ADR-036):
 *   (1) modifier-bundle contribution — a line in modifiers.ts (most entries; the "scaled by
 *       efficiency" ones scale by the all-invocation × per-Sin invocation-effect multipliers, NOT
 *       player efficiency). This covers the flat dynamics effects (Imp murders, Banshee suicides,
 *       Empusa/Lamia/Succubus generation), income (Kobold/Arachne/Fama/Plutus/Specunitas/Midas),
 *       player efficiency (Familiar/Wendigo/Doppelgänger), the outcome-tier shifts (Behemoth/
 *       Narcissus/Upir), and desidia generation (Blob/Morpheus, applied in the tick).
 *   (2) per-tick side-effect in apex.ts — Aurevora's exponential gold drain ↔ rising efficiency.
 *   (3) per-invoke / per-commit side-effect (this module + katabasis.ts) — Erinyes kills every
 *       reprobate and zeroes the Katabasis carry-over (×2 player-efficiency stack); Astiwihad holds
 *       the world still (tick freeze) and maxes the carry-over. Both set a `pending*` flag at invoke.
 */
import { invocationCostMul, sigilInvokingPower, sigilStrengthMul } from './sigils.js';
import { totalInvokingPower } from './maleficia.js';
import { mintSouls } from './population.js';
import { sinLevel } from './progression.js';
import { totalReprobates, type GameState, type Sin } from './state.js';
// The invocation catalog lives in `invocations.data.ts` (the editable economy knobs); imported for
// the logic here and re-exported so `import { INVOCATIONS } from './invocations.js'` keeps working.
import { INVOCATIONS } from './invocations.data.js';
export { INVOCATIONS };

export interface InvocationDef {
  readonly id: string;
  /** Sin alignment for flavour/grouping and the per-Sin effect sigils; `null` for the Familiar. */
  readonly sin: Sin | null;
  /** Required invoking power to summon (02 §7). Visible at half this (02 §12). */
  readonly invokingPower: number;
  /** Required Cardinal Sin level, if any. */
  readonly sinLevel?: number;
  /** Maximum simultaneously active (the apex entities cap at 1). Default unlimited (stackable). */
  readonly maxActive?: number;
  /**
   * Per-second upkeep paid while active (Invocatio sheet, "Cost" column). Charged each tick out of
   * this tick's income and pools (see tick.ts "1a"); a flat cost that can't be covered dispels the
   * invocation (cf. Aurevora at gold 0). All fields are per copy. Summoning itself is free; Aurevora's
   * exponential drain lives in apex.ts.
   *   - `gold` / `influence`: flat amount per second.
   *   - `goldGainFraction` / `influenceGainFraction`: fraction of that resource's gross gain/second.
   *   - `reprobate`: flat living reprobates drained per second (Arachne). Whole units leave the pool
   *     WITHOUT minting souls (upkeep is a cost, not a death); a drain the population can't cover
   *     dispels the invocation. Accrued fractionally through `lifetime.reprobateCostPool`.
   *   - `reprobateFraction`: fraction of the CURRENT reprobate pool drained per second (Morpheus).
   *     Self-limiting like the %-of-gain costs, so it never bankrupts and never triggers a dispel;
   *     also no souls minted.
   *   - `desidia`: flat desidia drained per second (Upir), from the top-level desidia pool.
   *     A drain the pool can't cover dispels the invocation.
   */
  readonly upkeep?: {
    readonly gold?: number;
    readonly influence?: number;
    readonly goldGainFraction?: number;
    readonly influenceGainFraction?: number;
    readonly reprobate?: number;
    readonly reprobateFraction?: number;
    readonly desidia?: number;
  };
}

/** All wired invocation ids in stable order. */
export const INVOCATION_IDS: readonly string[] = Object.freeze(Object.keys(INVOCATIONS));

/** Lookup; undefined for unknown ids. */
export function invocationById(id: string): InvocationDef | undefined {
  return INVOCATIONS[id];
}

/** Current invoking power: equipped maleficia + Forneus #30 sigil (02 §7). */
export function currentInvokingPower(state: GameState): number {
  return (
    totalInvokingPower(state.lifetime.maleficia) +
    sigilInvokingPower(state, sigilStrengthMul(state))
  );
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

/** Aggregated per-second invocation upkeep (Invocatio sheet), summed across all active copies. */
export interface InvocationUpkeep {
  /** Fraction of gross gold gain/s consumed (clamped to ≤ 1). */
  readonly goldGainFraction: number;
  /** Fraction of gross influence gain/s consumed (clamped to ≤ 1). */
  readonly influenceGainFraction: number;
  /** Absolute gold/s drained (flat costs). */
  readonly flatGoldPerSecond: number;
  /** Absolute influence/s drained (flat costs). */
  readonly flatInfluencePerSecond: number;
  /** Absolute living reprobates/s drained (Arachne's flat cost). No souls minted. */
  readonly flatReprobatesPerSecond: number;
  /** Fraction of the current reprobate pool/s drained (Morpheus). Self-limiting; no souls minted. */
  readonly reprobateFraction: number;
  /** Absolute desidia/s drained (Upir's flat cost) from the top-level desidia pool. */
  readonly flatDesidiaPerSecond: number;
  /** Ids contributing a flat gold drain — dispelled together if the drain can't be paid. */
  readonly flatGoldDrainers: readonly string[];
  /** Ids contributing a flat influence drain — dispelled together if the drain can't be paid. */
  readonly flatInfluenceDrainers: readonly string[];
  /** Ids contributing a flat reprobate drain — dispelled together if the population can't cover it. */
  readonly flatReprobateDrainers: readonly string[];
  /** Ids contributing a flat desidia drain — dispelled together if the pool can't cover it. */
  readonly flatDesidiaDrainers: readonly string[];
}

/**
 * Sum the upkeep of every active invocation. The gain fractions are clamped to 1 so a stack can at
 * most zero a resource's gain, never invert it; flat drains are absolute and can bankrupt a pool
 * (→ dispel).
 *
 * EVERY upkeep cost (ADR-035/036) — the flat gold/influence/reprobate/desidia drains AND the
 * %-of-gain / %-of-pool drains (the apex tradeoffs) alike — is multiplied by `invocationCostMul`:
 * the cost channel ("− cost of all invocations": Orobas #55, Zepar #16, Andrealphus #65) divides by
 * `1 + strength`, and Black Vessel applies its own `1/(1 + k)` cut. So a Lemure's "25% of influence
 * gain/s" reads 25% / ((1 + strength)(1 + k)).
 */
export function invocationUpkeep(state: GameState): InvocationUpkeep {
  let goldGainFraction = 0;
  let influenceGainFraction = 0;
  let flatGoldPerSecond = 0;
  let flatInfluencePerSecond = 0;
  let flatReprobatesPerSecond = 0;
  let reprobateFraction = 0;
  let flatDesidiaPerSecond = 0;
  const flatGoldDrainers: string[] = [];
  const flatInfluenceDrainers: string[] = [];
  const flatReprobateDrainers: string[] = [];
  const flatDesidiaDrainers: string[] = [];
  for (const id of INVOCATION_IDS) {
    const n = activeInvocationCount(state, id);
    if (n <= 0) continue;
    const u = INVOCATIONS[id]?.upkeep;
    if (!u) continue;
    if (u.goldGainFraction) goldGainFraction += u.goldGainFraction * n;
    if (u.influenceGainFraction) influenceGainFraction += u.influenceGainFraction * n;
    if (u.gold) {
      flatGoldPerSecond += u.gold * n;
      flatGoldDrainers.push(id);
    }
    if (u.influence) {
      flatInfluencePerSecond += u.influence * n;
      flatInfluenceDrainers.push(id);
    }
    if (u.reprobate) {
      flatReprobatesPerSecond += u.reprobate * n;
      flatReprobateDrainers.push(id);
    }
    if (u.reprobateFraction) reprobateFraction += u.reprobateFraction * n;
    if (u.desidia) {
      flatDesidiaPerSecond += u.desidia * n;
      flatDesidiaDrainers.push(id);
    }
  }
  // Every drain, flat or proportional (the reprobate FRACTION too), takes the same cost multiplier.
  const costMul = invocationCostMul(state);
  if (costMul !== 1) {
    goldGainFraction *= costMul;
    influenceGainFraction *= costMul;
    flatGoldPerSecond *= costMul;
    flatInfluencePerSecond *= costMul;
    flatReprobatesPerSecond *= costMul;
    reprobateFraction *= costMul;
    flatDesidiaPerSecond *= costMul;
  }
  return {
    goldGainFraction: Math.min(1, goldGainFraction),
    influenceGainFraction: Math.min(1, influenceGainFraction),
    flatGoldPerSecond,
    flatInfluencePerSecond,
    flatReprobatesPerSecond,
    reprobateFraction: Math.min(1, reprobateFraction),
    flatDesidiaPerSecond,
    flatGoldDrainers,
    flatInfluenceDrainers,
    flatReprobateDrainers,
    flatDesidiaDrainers,
  };
}

export type InvokeResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/** The apex invocations (03 §2.4) — the Sin-level-3 entities capped at one active. Only ONE kind of
 * apex may be invoked per lifetime (see `invoke`). */
export function isApexInvocation(def: InvocationDef): boolean {
  return def.sinLevel === 3;
}

/**
 * Summon one of `id`. Checks: known id, gates met, under the max-active cap, and the
 * one-apex-kind-per-lifetime rule. Summoning is free (the cost is the per-second upkeep); on
 * success the invocation count increments. Persistent by default — stays until dispelled or
 * Katabasis.
 *
 * The two Katabasis-modifying apexes (03 §2.4) carry side-effects at invoke time:
 *   - Erinyes immediately kills every reprobate (each death mints one soul — a kill, not upkeep) and
 *     sets `pendingErinyes` for `commitKatabasis` to read.
 *   - Astiwihad sets `pendingAstiwihad` (world held still while active; carry-over maxed at commit).
 *
 * Only ONE kind of apex may be invoked per lifetime: once any apex is summoned, `invoke` refuses a
 * different apex kind until the next Katabasis (re-summoning the same kind, within its cap, is fine).
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
  // One apex kind per lifetime: once any apex is invoked, only that same kind may be re-summoned
  // (subject to its cap) until the next Katabasis. A different apex is refused.
  if (isApexInvocation(def)) {
    const already = state.lifetime.apexInvoked;
    if (already !== undefined && already !== id) {
      return { ok: false, reason: 'another apex already answers this lifetime' };
    }
  }
  const cap = def.maxActive ?? Infinity;
  if (activeInvocationCount(state, id) >= cap) {
    return { ok: false, reason: 'already at its limit' };
  }
  // Active-count increment. Apexes stamp `apexInvoked` so the one-kind-per-lifetime rule holds even
  // after a dispel + re-summon.
  let working: GameState = {
    ...state,
    lifetime: {
      ...state.lifetime,
      invocations: { ...state.lifetime.invocations, [id]: activeInvocationCount(state, id) + 1 },
      ...(isApexInvocation(def) ? { apexInvoked: id } : {}),
    },
  };

  // ── Apex side-effects ────────────────────────────────────────────────────────────────────
  if (id === 'erinyes') {
    // Kill every reprobate at once — each death mints one soul (the 1-person-1-soul invariant; this
    // is a KILL, not upkeep). No RNG draws (a 100% wipe is deterministic) and the count is exact.
    const population = totalReprobates(working);
    if (population > 0) {
      working = mintSouls(working, population);
      working = { ...working, lifetime: { ...working.lifetime, reprobates: 0 } };
    }
    working = { ...working, lifetime: { ...working.lifetime, pendingErinyes: true } };
  } else if (id === 'astiwihad') {
    // The world-still apex (formerly Morpheus): its carry-over is maxed at commit.
    working = { ...working, lifetime: { ...working.lifetime, pendingAstiwihad: true } };
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

/**
 * Mark the one-time Doppelgänger jumpscare as seen (presentation-only bookkeeping). Pure: returns a
 * new state with `flagDoppelgaengerSeen` set, leaving the input untouched. Idempotent — once set the
 * scare never re-arms. The scare itself is orchestrated by the web app; this only records that it ran.
 */
export function markDoppelgaengerSeen(state: GameState): GameState {
  if (state.flagDoppelgaengerSeen === true) return state;
  return { ...state, flagDoppelgaengerSeen: true };
}
