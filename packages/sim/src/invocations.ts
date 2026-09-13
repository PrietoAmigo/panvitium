/**
 * Invocations (02 §7, 03 §2.4) — summon hellish entities that grant passive effects. Each has an
 * **invoking-power** requirement (sum of equipped maleficia `invokingPower`, plus sigils) and may
 * also require a Cardinal Sin level. Summoning is always free up front; the cost is a per-second
 * **upkeep** paid out of income and pools while active (see `invocationUpkeep` + tick.ts step 1a):
 * flat gold/influence, %-of-gain (gold/influence), a flat or %-of-pool **reprobate** drain (a pure
 * cost — no souls minted), and a **desidia** drain. A flat drain the pool can't sustain dispels
 * the invocation; %-costs only zero a gain or shrink a pool, never bankrupt. Most are persistent and
 * dispellable at will; on Katabasis all are dispelled (katabasis.ts — `invocations` reset to {}).
 *
 * Visibility (02 §12): an invocation appears in the Ars Goetia list once the player has at least
 * HALF its required invoking power — a teaser that the entity is within reach.
 *
 * **The apex entities (Sin level 3) are one-kind-per-lifetime** (see `invoke`): once any apex is
 * summoned, only that same kind may be re-summoned until the next Katabasis.
 *
 * The effect shapes (no autonomous runners remain — that shape was retired):
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
 * The `def.autonomous` field remains on the type for the shared runner infrastructure, but no
 * invocation currently uses it.
 */
import { div, floor, gte, max, mul, sub, ZERO, type BigNum } from './bignum.js';
import { sigilInvokingPower, sigilCostReductionByChannel } from './sigils.js';
import { totalInvokingPower, sigilEffectMultiplier } from './maleficia.js';
import { mintSouls } from './population.js';
import { sinLevel } from './progression.js';
import { totalReprobates, type GameState, type Sin } from './state.js';
import { computeModifiers } from './modifiers.js';
import { advanceRunnerCycles } from './runner.js';
import { type Tier } from './probability.js';
import { type Rng } from './rng.js';
import { type OutcomeEvent } from './events.js';
// The invocation catalog lives in `invocations.data.ts` (the editable economy knobs); imported for
// the logic here and re-exported so `import { INVOCATIONS } from './invocations.js'` keeps working.
import { INVOCATIONS } from './invocations.data.js';
export { INVOCATIONS };

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
   * optional minimum (Morpheus pays 90% of gold). Omitted for invocations that don't cost gold.
   */
  readonly goldCost?: { readonly fraction: number; readonly minimum?: number };
  /** Maximum simultaneously active (the apex entities cap at 1). Default unlimited (stackable). */
  readonly maxActive?: number;
  /**
   * Per-second upkeep paid while active (Invocatio sheet, "Cost" column). Charged each tick out of
   * this tick's income and pools (see tick.ts "1a"); a flat cost that can't be covered dispels the
   * invocation (cf. Aurevora at gold 0). All fields are per copy. Apex one-time invoke costs
   * (Morpheus) stay on `soulCost`/`goldCost`; Aurevora's exponential drain lives in apex.ts.
   *   - `gold` / `influence`: flat amount per second.
   *   - `goldGainFraction` / `influenceGainFraction`: fraction of that resource's gross gain/second.
   *   - `maxInfluenceFraction`: fraction of the effective max influence per second (Lemure).
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
    readonly maxInfluenceFraction?: number;
    readonly reprobate?: number;
    readonly reprobateFraction?: number;
    readonly desidia?: number;
  };
  /**
   * Autonomous background runner (02 §3): this invocation runs `action` in its own channel at
   * `efficiency` × the player's efficiency, without occupying the player's action slot. The Familiar
   * runs Indagatio (time-mode); the Imp runs Decimatio (cost-outcome). The runner carries out its
   * action for free — no per-cycle gold/influence cost — so it never stalls on the treasury (the
   * invocation's per-second summon upkeep is charged separately in tick.ts). `forcedTier` pins the
   * outcome tier so a passive runner can't roll a catastrophic result (the Imp is Good-only, 03 §2.4).
   */
  readonly autonomous?: {
    readonly action: string;
    readonly efficiency: number;
    readonly forcedTier?: Tier;
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
    sigilInvokingPower(state, sigilEffectMultiplier(state.lifetime.maleficia))
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

/** The soul cost to summon `def` right now (floored). Zero for free invocations. */
export function invocationSoulCost(state: GameState, def: InvocationDef): BigNum {
  if (!def.soulCost) return ZERO;
  const pct = floor(mul(state.souls, def.soulCost.fraction));
  const base = max(pct, def.soulCost.minimum);
  // The invocation cost channel (Orobas #55 / Zepar #16 / Andrealphus #65) softens the soul price
  // (divides by `(1 + strength)`; can pierce the nominal minimum since it is a genuine discount).
  // Floor keeps souls whole.
  const red = sigilCostReductionByChannel(
    state,
    sigilEffectMultiplier(state.lifetime.maleficia),
  ).invocation;
  return red && red > 1 ? floor(div(base, red)) : base;
}

/**
 * The gold cost to summon `def` right now (floored). Zero for invocations that don't list a gold
 * cost. Morpheus is the only entry with a gold cost so far (90% of the gold pool, no minimum). The
 * invocation cost channel softens it too (ADR-035: the channel covers ALL invocation costs).
 */
export function invocationGoldCost(state: GameState, def: InvocationDef): BigNum {
  if (!def.goldCost) return ZERO;
  const pct = floor(mul(state.lifetime.gold, def.goldCost.fraction));
  const base = max(pct, def.goldCost.minimum ?? 0);
  const red = sigilCostReductionByChannel(
    state,
    sigilEffectMultiplier(state.lifetime.maleficia),
  ).invocation;
  return red && red > 1 ? floor(div(base, red)) : base;
}

/** Aggregated per-second invocation upkeep (Invocatio sheet), summed across all active copies. */
export interface InvocationUpkeep {
  /** Fraction of gross gold gain/s consumed (clamped to ≤ 1). */
  readonly goldGainFraction: number;
  /** Fraction of gross influence gain/s consumed (clamped to ≤ 1). */
  readonly influenceGainFraction: number;
  /** Absolute gold/s drained (flat costs). */
  readonly flatGoldPerSecond: number;
  /** Absolute influence/s drained (flat costs + Lemure's %-of-max-influence). */
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
 * Sum the upkeep of every active invocation. `effectiveMax` is the current effective max influence
 * (for Lemure's 1%-of-max drain). The gain fractions are clamped to 1 so a stack can at most zero a
 * resource's gain, never invert it; flat drains are absolute and can bankrupt a pool (→ dispel).
 *
 * The invocation cost channel ("− cost of all invocations": Orobas #55, Zepar #16, Andrealphus #65)
 * softens EVERY upkeep cost (ADR-035) — the flat gold/influence drains AND the %-of-gain drains (the
 * apex tradeoffs) alike — dividing each by its `(1 + strength)` channel.
 */
export function invocationUpkeep(state: GameState, effectiveMax: number): InvocationUpkeep {
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
    if (u.maxInfluenceFraction) {
      flatInfluencePerSecond += u.maxInfluenceFraction * n * effectiveMax;
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
  // The invocation cost channel softens EVERY upkeep cost (ADR-035): the %-of-gain drains and the
  // flat gold/influence/reprobate/desidia drains alike, dividing each by `(1 + strength)`. The
  // reprobate FRACTION is a proportion of the pool, so the channel softens it too.
  const red = sigilCostReductionByChannel(
    state,
    sigilEffectMultiplier(state.lifetime.maleficia),
  ).invocation;
  if (red && red > 1) {
    goldGainFraction /= red;
    influenceGainFraction /= red;
    flatGoldPerSecond /= red;
    flatInfluencePerSecond /= red;
    flatReprobatesPerSecond /= red;
    reprobateFraction /= red;
    flatDesidiaPerSecond /= red;
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
 * Summon one of `id`. Checks: known id, gates met, under the max-active cap, soul/gold cost
 * affordable, plus the Morpheus lockout (an Erinyes-summoned lifetime can never invoke Morpheus
 * again). On success: deduct the soul and gold costs and increment the invocation count.
 * Persistent by default — stays until dispelled or Katabasis.
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
  const soulCost = invocationSoulCost(state, def);
  if (!gte(floor(state.souls), soulCost)) {
    return { ok: false, reason: 'not enough souls' };
  }
  const goldCost = invocationGoldCost(state, def);
  if (!gte(floor(state.lifetime.gold), goldCost)) {
    return { ok: false, reason: 'not enough gold' };
  }

  // Standard cost deduction + active-count increment. Apexes stamp `apexInvoked` so the
  // one-kind-per-lifetime rule holds even after a dispel + re-summon.
  let working: GameState = {
    ...state,
    souls: sub(state.souls, soulCost),
    lifetime: {
      ...state.lifetime,
      gold: sub(state.lifetime.gold, goldCost),
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
 * Timer key for copy `k` of runner `id`. Copy 0 keeps the bare id so single-copy runners (and saves
 * predating stacking) are unchanged; each additional stacked copy gets its own suffixed channel.
 */
export function invocationRunnerKey(id: string, k: number): string {
  return k === 0 ? id : `${id}#${k}`;
}

/**
 * The effective per-copy efficiency an active runner channel works at: its base `autonomous.efficiency`
 * × the player's own efficiency × the invocation-wide boost × the runner's own Sin effectiveness (the
 * Familiar has no Sin, so it takes no per-Sin term). This is the single source of truth the runner
 * advance and the UI both read, so the displayed efficiency and progress-bar speed match the sim.
 * Returns 0 for an invocation with no autonomous channel.
 */
export function invocationRunnerEfficiency(state: GameState, def: InvocationDef): number {
  const auto = def.autonomous;
  if (!auto) return 0;
  const mods = computeModifiers(state);
  const sinMul = def.sin ? mods.invocationSinEffectivenessMul[def.sin] : 1;
  return auto.efficiency * mods.playerEfficiencyMul * mods.invocationEfficiencyMul * sinMul;
}

/**
 * Advance every active autonomous-runner invocation (the Familiar's background Indagatio, the Imp's
 * background Decimatio — 02 §3) by `deltaSeconds`, never touching the player's action slot. Per
 * runner the effective efficiency is `autonomous.efficiency × the player's efficiency` (× the
 * invocation-wide and per-Sin boosts).
 *
 * Stackable runners (the Normal-type Imp/Upir/Lamia) run ONE INDEPENDENT CHANNEL PER SUMMONED COPY,
 * so N copies work at ~N× the rate — folding the count into efficiency wouldn't do this, because the
 * per-cycle outcome is quantised at `max(1, floor(eff))` and would round sub-unit gains away. The
 * channels resolve in sequence against the running `working` state. Runners carry out their actions
 * for free (no per-cycle resource cost), so no channel stalls on the treasury; each persists its
 * in-flight timer. Timers whose copy no longer exists (dispelled, or the runner is gone) are dropped.
 * Events fold into the same outcome stream.
 */
export function advanceInvocationRunners(
  state: GameState,
  deltaSeconds: number,
  rng: Rng,
): { state: GameState; events: OutcomeEvent[] } {
  const active = activeRunnerIds(state);
  const existing = state.lifetime.invocationRunners;

  // The timer keys that *should* exist: one per summoned copy of each active runner. Anything else
  // in the record is stale (a dispelled copy or a dispelled runner) and gets cleared.
  const validKeys = new Set<string>();
  for (const id of active) {
    const copies = state.lifetime.invocations[id] ?? 0;
    for (let k = 0; k < copies; k++) validKeys.add(invocationRunnerKey(id, k));
  }
  const hasStaleTimers = Object.keys(existing).some((key) => !validKeys.has(key));

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
    const copies = working.lifetime.invocations[id] ?? 0;
    for (let k = 0; k < copies; k++) {
      const key = invocationRunnerKey(id, k);
      // Recomputed per copy (inside the helper) so each channel sees the resources earlier copies
      // have already spent; the efficiency itself is the same for every copy of a runner.
      const eff = invocationRunnerEfficiency(working, def);
      // Absent key (undefined) ⇒ null: a fresh or previously-stalled channel the engine will (re)start.
      const prev = existing[key] ?? null;
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
      // Only persist a numeric timer; a channel resting exactly between cycles (null) leaves its
      // key out of the record and simply restarts a fresh cycle next tick.
      if (r.remaining !== null) runners[key] = r.remaining;
    }
  }

  return {
    state: { ...working, lifetime: { ...working.lifetime, invocationRunners: runners } },
    events,
  };
}
