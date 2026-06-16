/**
 * Invocations (02 §7, 03 §2.4) — summon hellish entities that grant passive effects. Each has an
 * **invoking-power** requirement (sum of equipped maleficia `invokingPower`, plus sigils once those
 * land) and may also require a Cardinal Sin level. Summoning is free up front for most entities;
 * the cost is a per-second **upkeep** paid out of income while active (Invocatio sheet — see
 * `invocationUpkeep` + tick.ts step 1a), and a flat drain the pool can't sustain dispels the
 * invocation. Morpheus is the exception: it pays a one-time %-of-pool soul+gold cost on invoke.
 * Most are persistent and dispellable at will; on Katabasis all are dispelled (handled in
 * katabasis.ts — `invocations` reset to {}).
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
 *   (1) autonomous-runner channel — `def.autonomous`, advanced via runner.ts (Familiar, Imp, Upir,
 *       Lamia → Suasio).
 *   (2) static modifier-bundle contribution — a line in modifiers.ts (Fama, Nightmare, Harpy,
 *       Lemure, Behemoth, Midas, Plutus, Succubus, Doppelgänger).
 *   (3) per-tick / per-invoke side-effects — Astiwihad + Aurevora live in apex.ts (per-tick mass
 *       suicide + exponential gold drain); Erinyes + Morpheus are handled at invoke/commit time
 *       in this module + katabasis.ts (kill-all + Katabasis carry-over overrides); Specunitas
 *       feeds the per-subtype conversion-bias hook in dynamics.ts (`conversionBiasMul`).
 * Number magnitudes are placeholders, spreadsheet-overridable; the shape is authoritative.
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
   * Per-second upkeep paid while active (Invocatio sheet, "Cost" column). Charged each tick out of
   * this tick's income and pools (see tick.ts "1a"); a flat cost that can't be covered dispels the
   * invocation (cf. Aurevora at gold 0). All fields are per copy. Apex one-time invoke costs
   * (Morpheus) stay on `soulCost`/`goldCost`; Aurevora's exponential drain lives in apex.ts.
   *   - `gold` / `influence`: flat amount per second.
   *   - `goldGainFraction` / `influenceGainFraction`: fraction of that resource's gross gain/second.
   *   - `maxInfluenceFraction`: fraction of the effective max influence per second (Lemure).
   */
  readonly upkeep?: {
    readonly gold?: number;
    readonly influence?: number;
    readonly goldGainFraction?: number;
    readonly influenceGainFraction?: number;
    readonly maxInfluenceFraction?: number;
  };
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
    invokingPower: 2,
    maxActive: 1,
    // The lone "Special" invocation: only one Familiar may be bound (unlike the stackable Normals).
    // Hybrid (02 §3): a flat +33% to player efficiency (applied in modifiers.ts alongside the other
    // invocation magnitudes) AND a background Indagatio runner at 1% of the player's efficiency
    // (Invocatio sheet efficiency column).
    autonomous: { action: 'indagatio', efficiency: 0.01 },
  },
  imp: {
    id: 'imp',
    sin: 'ira',
    invokingPower: 2,
    sinLevel: 1,
    upkeep: { gold: 10 }, // 10 gold/s (Invocatio sheet)
    // Stackable (Normal type). Background Decimatio (cost-outcome): each cycle pays
    // ceil(caedisCost × 0.05×playerEff) and resolves a Good kill. Good-only so a passive entity can
    // never roll Apocalyptic and gut the player's gold/reprobates unprompted (03 §2.4). Each summoned
    // copy runs its own channel (advanceInvocationRunners), so N imps cull at ~N× the rate.
    autonomous: { action: 'caedis', efficiency: 0.05, forcedTier: 'good' },
  },
  upir: {
    id: 'upir',
    sin: 'gula',
    invokingPower: 3,
    sinLevel: 1,
    upkeep: { influence: 1 }, // 1 influence/s (Invocatio sheet)
    // Stackable (Normal type). Gula's background culler. The spreadsheet frames Upir as a Caedis
    // runner at 0.05 (the doc's "kills 1 / 30 s" was the older mechanic); per the
    // spreadsheet-wins-on-numbers rule we model it as the engine's cost-outcome runner, Good-only
    // like the Imp. Each summoned copy runs its own channel, so stacking multiplies throughput.
    autonomous: { action: 'caedis', efficiency: 0.05, forcedTier: 'good' },
  },
  fama: {
    id: 'fama',
    sin: 'vanagloria',
    invokingPower: 3,
    sinLevel: 1,
    upkeep: { goldGainFraction: 0.25 }, // 25% of current gold gain/s (Invocatio sheet)
  },
  nightmare: {
    id: 'nightmare',
    sin: 'tristitia',
    invokingPower: 3,
    sinLevel: 1,
    upkeep: { influence: 3 }, // 3 influence/s (Invocatio sheet)
  },
  harpy: {
    id: 'harpy',
    sin: 'ira',
    invokingPower: 4,
    sinLevel: 2,
    upkeep: { influence: 5 }, // 5 influence/s (Invocatio sheet)
  },
  lamia: {
    id: 'lamia',
    sin: 'luxuria',
    invokingPower: 4,
    sinLevel: 2,
    upkeep: { influence: 3 }, // 3 influence/s (Invocatio sheet)
    // Stackable (Normal type). A background Suasio runner at `efficiency × the player's efficiency`
    // (Invocatio sheet: "action efficiency applies to Suasio"), without occupying the player's action
    // slot. `suggestion` is the Suasio-category action; natural tier rolls. Each summoned copy runs
    // its own channel (advanceInvocationRunners), so N lamiae work at ~N× the rate.
    autonomous: { action: 'suggestion', efficiency: 0.05 },
  },
  lemure: {
    id: 'lemure',
    sin: 'acedia',
    invokingPower: 3,
    sinLevel: 1,
    upkeep: { maxInfluenceFraction: 0.01 }, // 1% of max influence/s (Invocatio sheet)
    // Stackable. Effect (modifiers.ts): an additive boost to the offline gain rate (Invocatio sheet),
    // 0.025 × player/invocation efficiency per copy.
  },
  behemoth: {
    id: 'behemoth',
    sin: 'superbia',
    invokingPower: 2,
    sinLevel: 1,
    upkeep: { goldGainFraction: 0.05, influenceGainFraction: 0.05 }, // 5% gold+infl gain/s (sheet)
  },
  midas: {
    id: 'midas',
    sin: 'avaritia',
    invokingPower: 7,
    sinLevel: 3,
    maxActive: 1,
  },
  plutus: {
    id: 'plutus',
    sin: 'avaritia',
    invokingPower: 5,
    sinLevel: 2,
    upkeep: { influence: 3 }, // 3 influence/s (Invocatio sheet)
    // Stackable. Effect (modifiers.ts): lifts Vitium Mercatura output (gold + generation +
    // conversion) by a flat factor per copy. A passive modifier source, no autonomous channel.
  },
  succubus: {
    id: 'succubus',
    sin: 'luxuria',
    invokingPower: 9,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { goldGainFraction: 0.99 }, // 99% of current gold gain/s (Invocatio sheet)
    // Apex Luxuria (free). Effect (modifiers.ts): dramatically multiplies reprobate generation, but
    // cuts gold gain to 1% of total — a generation-at-all-costs ritual.
  },
  doppelgaenger: {
    id: 'doppelgaenger',
    sin: 'superbia',
    invokingPower: 8,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { influenceGainFraction: 0.5 }, // 50% of current influence gain/s (Invocatio sheet)
  },
  astiwihad: {
    id: 'astiwihad',
    sin: 'tristitia',
    invokingPower: 10,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { influenceGainFraction: 1 }, // 100% of current influence gain/s (Invocatio sheet)
    // Apex Tristitia (free). Effect (apex.ts): each second a small chance the whole reprobate
    // population suicides at once — every death mints a soul, so a wipe banks the lot.
  },
  aurevora: {
    id: 'aurevora',
    sin: 'gula',
    invokingPower: 7,
    sinLevel: 3,
    maxActive: 1,
    // Apex Gula (free). Effect (apex.ts): an exponentially-rising gold drain paid against a
    // similarly-rising player-efficiency boost (duration tracked in invocationDurations); when the
    // drain takes gold to 0 it dispels. The efficiency half is folded in by modifiers.ts.
  },
  erinyes: {
    id: 'erinyes',
    sin: 'ira',
    invokingPower: 10,
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
    invokingPower: 10,
    sinLevel: 3,
    soulCost: { fraction: 0.9, minimum: 0 },
    goldCost: { fraction: 0.9 },
    maxActive: 1,
    // Apex Acedia (66% souls + 66% gold). Effect on invoke (see `invoke`): refused while
    // `morpheusLockedOut` is set. Effect while active (see tick.ts): the lifetime is held in
    // stillness — no income, no dynamics, no Opera or builds; on commit, `pendingMorpheus` overrides
    // the Katabasis carry-over to gold 100% + maleficia 100% + Emptio-list preserved.
  },
  specunitas: {
    id: 'specunitas',
    sin: 'vanagloria',
    invokingPower: 9,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { goldGainFraction: 0.99 }, // 99% of current gold gain/s (Invocatio sheet)
    // Apex Vanagloria (free). Its only effect was the conversion-bias hook (Celebrity subtype),
    // which was removed with reprobate subtypes. EFFECTLESS for now — flagged for re-homing in the
    // orphaned-sigils/invocations slice (Slice 4).
  },
} as const;

/** All wired invocation ids in stable order. */
export const INVOCATION_IDS: readonly string[] = Object.freeze(Object.keys(INVOCATIONS));

/** Lookup; undefined for unknown ids. */
export function invocationById(id: string): InvocationDef | undefined {
  return INVOCATIONS[id];
}

/** Current invoking power: equipped maleficia + Andrealphus #65 sigil (02 §7). */
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
  // Orobas #55 softens the soul price (divides by `(1 + strength)`; can pierce the nominal minimum
  // since it is a genuine discount). Floor keeps souls whole.
  const red = sigilCostReductionByChannel(
    state,
    sigilEffectMultiplier(state.lifetime.maleficia),
  ).invocationSoul;
  return red && red > 1 ? floor(div(base, red)) : base;
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
  /** Ids contributing a flat gold drain — dispelled together if the drain can't be paid. */
  readonly flatGoldDrainers: readonly string[];
  /** Ids contributing a flat influence drain — dispelled together if the drain can't be paid. */
  readonly flatInfluenceDrainers: readonly string[];
}

/**
 * Sum the upkeep of every active invocation. `effectiveMax` is the current effective max influence
 * (for Lemure's 1%-of-max drain). The gain fractions are clamped to 1 so a stack can at most zero a
 * resource's gain, never invert it; flat drains are absolute and can bankrupt a pool (→ dispel).
 *
 * Orobas #55 ("− cost of all invocations") softens the flat, out-of-pocket drains — dividing them by
 * its `(1 + strength)` channel — but leaves the %-of-gain costs (the apex tradeoffs) untouched.
 */
export function invocationUpkeep(state: GameState, effectiveMax: number): InvocationUpkeep {
  let goldGainFraction = 0;
  let influenceGainFraction = 0;
  let flatGoldPerSecond = 0;
  let flatInfluencePerSecond = 0;
  const flatGoldDrainers: string[] = [];
  const flatInfluenceDrainers: string[] = [];
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
  }
  // Orobas #55 discount on the flat drains (same channel as the one-time soul price).
  const red = sigilCostReductionByChannel(
    state,
    sigilEffectMultiplier(state.lifetime.maleficia),
  ).invocationSoul;
  if (red && red > 1) {
    flatGoldPerSecond /= red;
    flatInfluencePerSecond /= red;
  }
  return {
    goldGainFraction: Math.min(1, goldGainFraction),
    influenceGainFraction: Math.min(1, influenceGainFraction),
    flatGoldPerSecond,
    flatInfluencePerSecond,
    flatGoldDrainers,
    flatInfluenceDrainers,
  };
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
        lifetime: { ...working.lifetime, reprobates: 0 },
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
 * channels resolve in sequence against the running `working` state, so a later copy naturally stalls
 * when the earlier ones have drained the gold/influence a cost-outcome cycle needs. A stalled channel
 * stores no timer (its key is omitted) and retries next tick. Timers whose copy no longer exists
 * (dispelled, or the runner is gone) are dropped. Events fold into the same outcome stream.
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
      // Only persist a numeric timer; a stalled channel (null) leaves its key out of the record.
      if (r.remaining !== null) runners[key] = r.remaining;
    }
  }

  return {
    state: { ...working, lifetime: { ...working.lifetime, invocationRunners: runners } },
    events,
  };
}
