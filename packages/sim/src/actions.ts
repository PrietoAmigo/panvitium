/**
 * Opera action engine (02 §3, 03 §2). An action declares a base time, a cost, and a base outcome
 * distribution (TierWeights). `startAction` pays the cost and queues a timer; `tick` advances the
 * timer and calls `resolveAction` on completion, which draws a tier from the seeded RNG and applies
 * that tier's effect. This slice implements the two base actions that close the first loop —
 * Suggestion (corrupt → reprobates) and Caedis (cull → souls). The remaining Suasio/Decimatio
 * actions, costs/times for higher tiers, and efficiency from sins/invocations come later.
 *
 * Efficiency note (03 §2.1/§2.2): for Suasio and Decimatio, efficiency scales costs and outcomes by
 * the same %, NOT the action time. It defaults to 1 here (no modifiers yet); the resolver and start
 * accept it so the hook exists. Resolution recomputes at the current efficiency rather than storing
 * it on the timer, which avoids changing the serialized state shape.
 */
import { add, floor, gte, sub } from './bignum.js';
import { type Rng } from './rng.js';
import {
  type Tier,
  type TierWeights,
  TIERS,
  applyTierModifiers,
  normalizeTierWeights,
  resolveTier,
} from './probability.js';
import { categoryEfficiency, categoryTierModifiers, computeModifiers } from './modifiers.js';
import {
  addReprobates,
  loseGoldFraction,
  loseReprobatesFraction,
  mintSouls,
  removeReprobates,
} from './population.js';
import { type ActionTimer, type GameState, type Sin, totalReprobates } from './state.js';
import { sinLevel } from './progression.js';
import { type OutcomeEvent } from './events.js';
import {
  MALEFICIA,
  MALEFICIUM_PRICE_RANGE,
  MAX_EMPTIO_LIST_SIZE,
  findableIds,
  sigilEffectMultiplier,
  type MaleficiumRarity,
} from './maleficia.js';
import {
  sigilCostReductionByChannel,
  sigilDuplicateOutputChance,
  sigilIndagatioDoubleFindChance,
} from './sigils.js';
// The action catalog + tier-weight distributions live in `actions.data.ts` (the editable economy
// knobs); imported for the engine here and re-exported so `import { ACTIONS } from './actions.js'`
// keeps working.
import { ACTIONS } from './actions.data.js';
export { ACTIONS };

export interface ActionCost {
  readonly gold?: number;
  readonly influence?: number;
}

/**
 * How action efficiency feeds into a category:
 *   'cost-outcome' — Suasio / Decimatio: efficiency scales costs and outcome units by the same %.
 *   'time'         — Indagatio / Emptio: efficiency divides the action's duration; cost and
 *                    success rates are untouched (03 §2.5 / §2.6).
 */
export type EfficiencyMode = 'cost-outcome' | 'time';

export interface ActionDef {
  readonly id: string;
  readonly category: 'suasio' | 'decimatio' | 'indagatio' | 'emptio';
  readonly baseTimeSeconds: number;
  readonly cost: ActionCost;
  readonly weights: TierWeights;
  readonly efficiencyMode: EfficiencyMode;
  /**
   * Sin-level gate that makes the action appear in the Opera (Suasio/Decimatio sheets). Absent =
   * available from the first lifetime (Suggestion / Caedis, which are gated only on *delegation*,
   * not availability). Logismoi/Imperium gate on Luxuria, Pogrom/Purgatio on Ira.
   */
  readonly unlock?: { readonly sin: Sin; readonly level: number };
  /**
   * Sin-level gate that enables *delegation* of this action — acolyte assignment / automation (the
   * Suasio/Decimatio sheets' "toggle" level). Distinct from `unlock` (mere availability): an action
   * can be playable by hand before it can be automated. Absent on Indagatio/Emptio (handled
   * separately). Suggestion/Caedis toggle at Luxuria/Ira 1; the higher rites at 3/4.
   */
  readonly delegateUnlock?: { readonly sin: Sin; readonly level: number };
}

/** Whether `def` is available to start: no gate, or the gating Sin has reached the unlock level. */
export function actionUnlocked(state: GameState, def: ActionDef): boolean {
  if (!def.unlock) return true;
  return sinLevel(state.devotion[def.unlock.sin]) >= def.unlock.level;
}

/** Inclusive integer in [lo, hi] from the seeded RNG. */
function randint(rng: Rng, lo: number, hi: number): number {
  return lo + rng.int(hi - lo + 1);
}

export type StartResult = { ok: true; state: GameState } | { ok: false; reason: string };

export interface StartOptions {
  /** Action-specific payload — for Emptio, the maleficium id being purchased. */
  readonly target?: string;
  /** Override the computed efficiency (tests). Falls through to category eff if omitted. */
  readonly efficiency?: number;
}

/**
 * Pay an action's cost and queue it. Affordability compares the FLOORED resource (resources are
 * natural numbers; the bignum gotcha). Efficiency is applied per category's `efficiencyMode`:
 * `cost-outcome` (Suasio/Decimatio) scales the cost; `time` (Indagatio/Emptio) divides the duration
 * and leaves cost untouched. Emptio is per-target: it reads `MALEFICIA[target].cost` for gold and
 * verifies the target is on the *Emptio* list.
 */
export function startAction(
  state: GameState,
  actionId: string,
  options: StartOptions = {},
): StartResult {
  const def = ACTIONS[actionId];
  if (!def) return { ok: false, reason: `unknown action: ${actionId}` };

  // Sin-level availability gate (Suasio/Decimatio sheets). Suggestion/Caedis have no gate.
  if (!actionUnlocked(state, def)) {
    return { ok: false, reason: 'This rite is not yet within your reach.' };
  }

  // Morpheus freeze (03 §2.4): no new Opera can be started while the apex Acedia is active.
  if ((state.lifetime.invocations.morpheus ?? 0) > 0) {
    return { ok: false, reason: 'The world is held in Morpheus\u2019s stillness.' };
  }

  // One player-driven action at a time (02 §3) — EXCEPT Indagatio, which scries in the background
  // and does not occupy the player slot: it neither blocks nor is blocked by Suasio/Decimatio/Emptio.
  // Only one Indagatio may run at once (the Cast control is single).
  if (actionId === 'indagatio') {
    if (state.lifetime.actionQueue.some((t) => t.actionId === 'indagatio')) {
      return { ok: false, reason: 'A scrying is already underway.' };
    }
  } else if (state.lifetime.actionQueue.some((t) => t.actionId !== 'indagatio')) {
    return { ok: false, reason: 'A rite is already underway.' };
  }

  const eff = options.efficiency ?? categoryEfficiency(state, def.category);

  // Resolve gold / influence cost. Suasio/Decimatio scale by efficiency; Indagatio/Emptio do not.
  // Emptio pulls its gold cost from the targeted maleficium.
  let goldCost = def.cost.gold ?? 0;
  let influenceCost = def.cost.influence ?? 0;
  let target: string | undefined;
  // Sigil cost reductions (Paimon influence, Amy Emptio gold, Orobas soul — soul applied elsewhere).
  const costRed = sigilCostReductionByChannel(
    state,
    sigilEffectMultiplier(state.lifetime.maleficia),
  );
  if (actionId === 'emptio') {
    if (!options.target) return { ok: false, reason: 'No maleficium chosen.' };
    if (!state.lifetime.emptioList.includes(options.target)) {
      return { ok: false, reason: 'Not in the Emptio list.' };
    }
    const malef = MALEFICIA[options.target];
    if (!malef) return { ok: false, reason: 'Unknown maleficium.' };
    // The price was rolled within the rarity band when the item was discovered; fall back to the
    // catalog cost for any item surfaced before rolled pricing landed (older saves).
    const rolled = state.lifetime.maleficiaPrices[options.target] ?? malef.cost;
    goldCost = costRed.emptioGold ? Math.ceil(rolled / costRed.emptioGold) : rolled;
    target = options.target;
  }
  if (def.efficiencyMode === 'cost-outcome') {
    goldCost = Math.ceil(goldCost * eff);
    influenceCost = Math.ceil(influenceCost * eff);
  }
  // Paimon #9 softens action influence costs (after any efficiency scaling), never increasing them.
  if (costRed.influence) influenceCost = Math.ceil(influenceCost / costRed.influence);

  if (!gte(floor(state.lifetime.gold), goldCost)) return { ok: false, reason: 'not enough gold' };
  if (!gte(floor(state.lifetime.influence), influenceCost)) {
    return { ok: false, reason: 'not enough influence' };
  }

  // Time scales for `time` mode; safe-floor at 1 second so any positive eff still progresses.
  const duration =
    def.efficiencyMode === 'time' && eff > 0
      ? Math.max(1, def.baseTimeSeconds / eff)
      : def.baseTimeSeconds;

  const timer: ActionTimer =
    target === undefined
      ? { actionId: def.id, remainingSeconds: duration }
      : { actionId: def.id, remainingSeconds: duration, target };
  const lifetime = {
    ...state.lifetime,
    gold: sub(state.lifetime.gold, goldCost),
    influence: sub(state.lifetime.influence, influenceCost),
    actionQueue: [...state.lifetime.actionQueue, timer],
  };
  return { ok: true, state: { ...state, lifetime } };
}

/**
 * Whether `actionId` may be set to AUTO-REPEAT: it carries a toggle-level gate (`delegateUnlock` —
 * the Suasio/Decimatio sheets' "toggle" level) and the player has reached it. This is the same gate
 * that opens acolyte delegation; the player's own one-shot rite gains its auto-repeat toggle at the
 * same Sin level (02 §3). Actions without a `delegateUnlock` (Indagatio/Emptio) are never
 * player-auto-repeatable. Every action's toggle level sits at or above its availability gate
 * (`unlock`), so a reached toggle level implies the rite is also castable — `ensureAutoRepeatStarted`
 * still routes through `startAction`, which re-checks availability, so a future inversion would
 * simply leave the toggle inert rather than misbehave.
 */
export function isAutoRepeatable(state: GameState, actionId: string): boolean {
  const def = ACTIONS[actionId];
  if (!def?.delegateUnlock) return false;
  return sinLevel(state.devotion[def.delegateUnlock.sin]) >= def.delegateUnlock.level;
}

/** Whether `actionId` is currently set to auto-repeat in the player's slot. */
export function isAutoRepeating(state: GameState, actionId: string): boolean {
  return state.lifetime.autoRepeat.includes(actionId);
}

/**
 * Keep every auto-repeating action running in the player's slot: for each id in `autoRepeat` that has
 * no in-flight timer, (re)start a cycle when it's affordable and unlocked. Called by the tick after
 * resolving completed timers (so a finished cycle re-queues and a stalled one retries) and the moment
 * the player toggles it on (so the loop begins without waiting a tick). `startAction` enforces the
 * one-player-rite-at-a-time slot and the Morpheus freeze, so a busy or frozen slot simply leaves the
 * action waiting for a later tick — no partial state, no error.
 */
export function ensureAutoRepeatStarted(state: GameState): GameState {
  let working = state;
  for (const id of working.lifetime.autoRepeat) {
    if (working.lifetime.actionQueue.some((t) => t.actionId === id)) continue; // already running
    const r = startAction(working, id);
    if (r.ok) working = r.state;
  }
  return working;
}

/**
 * Turn auto-repeat on or off for a player rite. Enabling is mutually exclusive among the
 * player-slot rites — only one fills the slot at a time (02 §3) — so it replaces any other
 * auto-repeating rite and immediately starts a first cycle (via `ensureAutoRepeatStarted`). Disabling
 * drops the id: the in-flight cycle finishes and the slot frees. A no-op (returns the input) when
 * enabling an action that is not yet auto-repeatable.
 */
export function setAutoRepeat(state: GameState, actionId: string, on: boolean): GameState {
  const current = state.lifetime.autoRepeat;
  if (on) {
    if (!isAutoRepeatable(state, actionId)) return state;
    const next = current.includes(actionId) ? current : [actionId];
    return ensureAutoRepeatStarted({ ...state, lifetime: { ...state.lifetime, autoRepeat: next } });
  }
  if (!current.includes(actionId)) return state;
  return {
    ...state,
    lifetime: { ...state.lifetime, autoRepeat: current.filter((a) => a !== actionId) },
  };
}

/**
 * Fresh-cycle duration for a runner of `actionId` at efficiency `eff`. Time-mode divides the base
 * by efficiency (floored at 1 s); cost-outcome leaves the base untouched (eff scales the outcome,
 * not the duration). Delegated runners pay no per-cycle cost (acolytes/invocations carry out their
 * actions for free); only the duration is derived here. Mirrors the duration logic in `startAction`.
 */
export function runnerCycleDuration(actionId: string, eff: number): number {
  const def = ACTIONS[actionId];
  if (!def) return Infinity;
  return def.efficiencyMode === 'time' && eff > 0
    ? Math.max(1, def.baseTimeSeconds / eff)
    : def.baseTimeSeconds;
}

/** Draw the outcome tier for a completed action, apply its effect, and report what happened. */
/**
 * The resolved (normalized) outcome distribution for an action right now — exactly the weights
 * `resolveAction` draws from: base × global `tierWeightMul` × the per-category success shift,
 * renormalized to sum 1. Pure and read-only; the oracular reveals (Maleficia) show these live odds,
 * so they always match what an actual cast would roll.
 */
export function actionTierDistribution(state: GameState, actionId: string): TierWeights {
  const def = ACTIONS[actionId];
  if (!def) {
    return normalizeTierWeights({
      stellar: 0,
      excellent: 0,
      good: 0,
      neutral: 0,
      bad: 0,
      terrible: 0,
      apocalyptic: 0,
    });
  }
  const mods = computeModifiers(state);
  return normalizeTierWeights(
    applyTierModifiers(
      applyTierModifiers(def.weights, mods.tierWeightMul),
      categoryTierModifiers(state, def.category),
    ),
  );
}

/** First two moments (mean and standard deviation) of one resolution's effect on a resource. */
export interface OutcomeMoment {
  readonly mean: number;
  /** Standard deviation — the listable "deviation" companion to the mean (√variance). */
  readonly sd: number;
}

/**
 * The expected outcome of ONE resolution of an action (a single cycle for a runner), as mean ± sd per
 * dimension. Computed analytically in closed form from the live tier distribution (or a forced tier)
 * times each tier's per-dimension delta moments — no sampling, deterministic, and consistent with
 * what `resolveAction` actually rolls. `souls`/`reprobates`/`gold` are net deltas; `maleficia` is the
 * expected count surfaced (Indagatio). Modeled for the actions that have runner/forecast surfaces so
 * far (Caedis, Suggestion, Indagatio); other actions return a zero forecast until modeled.
 */
export interface OutcomeForecast {
  readonly souls: OutcomeMoment;
  readonly reprobates: OutcomeMoment;
  readonly gold: OutcomeMoment;
  readonly maleficia: OutcomeMoment;
}

const ZERO_MOMENT: OutcomeMoment = { mean: 0, sd: 0 };
const ZERO_FORECAST: OutcomeForecast = {
  souls: ZERO_MOMENT,
  reprobates: ZERO_MOMENT,
  gold: ZERO_MOMENT,
  maleficia: ZERO_MOMENT,
};

/** Per-dimension first two raw moments (mean `m`, variance `v`) of one tier's delta. */
interface Dim {
  readonly m: number;
  readonly v: number;
}
interface TierDelta {
  readonly souls: Dim;
  readonly reprobates: Dim;
  readonly gold: Dim;
  readonly maleficia: Dim;
}
const ZERO_DIM: Dim = { m: 0, v: 0 };
const NO_DELTA: TierDelta = {
  souls: ZERO_DIM,
  reprobates: ZERO_DIM,
  gold: ZERO_DIM,
  maleficia: ZERO_DIM,
};
/** A deterministic amount (variance 0). */
const fixed = (m: number): Dim => ({ m, v: 0 });
/** k copies of a uniform integer in [lo, hi] inclusive: mean k·(lo+hi)/2, variance k²·((n²−1)/12). */
const uniform = (lo: number, hi: number, k: number): Dim => {
  const n = hi - lo + 1;
  return { m: (k * (lo + hi)) / 2, v: k * k * ((n * n - 1) / 12) };
};

function caedisTierDelta(tier: Tier, units: number, pop: number, gold: number): TierDelta {
  switch (tier) {
    // Stellar/Excellent remove randint(...)×units (capped by population in `resolveCaedis`; the
    // forecast uses the uncapped moments, an upper bound when the roster is nearly empty). Souls
    // minted equal reprobates removed.
    case 'stellar': {
      const r = uniform(15, 45, units);
      return { ...NO_DELTA, reprobates: { m: -r.m, v: r.v }, souls: r };
    }
    case 'excellent': {
      const r = uniform(3, 9, units);
      return { ...NO_DELTA, reprobates: { m: -r.m, v: r.v }, souls: r };
    }
    case 'good': {
      const removed = Math.min(units, pop); // deterministic
      return { ...NO_DELTA, reprobates: fixed(-removed), souls: fixed(removed) };
    }
    case 'bad':
      return { ...NO_DELTA, gold: fixed(-Math.floor(0.05 * gold)) };
    case 'terrible':
      return { ...NO_DELTA, gold: fixed(-Math.floor(0.15 * gold)) };
    case 'apocalyptic':
      return {
        ...NO_DELTA,
        gold: fixed(-Math.floor(0.33 * gold)),
        reprobates: fixed(-Math.floor(0.25 * pop)),
      };
    default:
      return NO_DELTA; // neutral: the kill fails
  }
}

function suggestionTierDelta(tier: Tier, units: number, pop: number): TierDelta {
  switch (tier) {
    case 'stellar':
      return { ...NO_DELTA, reprobates: uniform(4, 8, units) };
    case 'excellent':
      return { ...NO_DELTA, reprobates: uniform(2, 4, units) };
    case 'good':
      return { ...NO_DELTA, reprobates: fixed(units) };
    case 'bad':
      return { ...NO_DELTA, reprobates: fixed(-Math.min(units, pop)) };
    case 'terrible':
      return { ...NO_DELTA, reprobates: fixed(-Math.floor(0.09 * pop)) };
    case 'apocalyptic':
      return { ...NO_DELTA, reprobates: fixed(-Math.floor(0.5 * pop)) };
    default:
      return NO_DELTA; // neutral: nothing
  }
}

function indagatioTierDelta(state: GameState, tier: Tier, gold: number): TierDelta {
  const canFind = (chain: readonly MaleficiumRarity[]): boolean =>
    chain.some(
      (r) => findableIds(r, state.lifetime.maleficia, state.lifetime.emptioList).length > 0,
    );
  // Mirrors resolveIndagatio: each surfacing tier finds one item along its rarity chain (the rare
  // Furcas double-find is not modeled); the failure tiers bite gold instead.
  switch (tier) {
    case 'stellar':
      return {
        ...NO_DELTA,
        maleficia: fixed(canFind(['anathema', 'profane', 'rare', 'common']) ? 1 : 0),
      };
    case 'excellent':
      return { ...NO_DELTA, maleficia: fixed(canFind(['profane', 'rare', 'common']) ? 1 : 0) };
    case 'good':
      return { ...NO_DELTA, maleficia: fixed(canFind(['rare', 'common']) ? 1 : 0) };
    case 'neutral':
      return { ...NO_DELTA, maleficia: fixed(canFind(['common']) ? 1 : 0) };
    case 'terrible':
      return { ...NO_DELTA, gold: fixed(-Math.floor(0.15 * gold)) };
    case 'apocalyptic':
      return { ...NO_DELTA, gold: fixed(-Math.floor(0.8 * gold)) };
    default:
      return NO_DELTA; // bad: false lead
  }
}

export function actionOutcomeForecast(
  state: GameState,
  actionId: string,
  efficiency = 1,
  forcedTier?: Tier,
): OutcomeForecast {
  if (!ACTIONS[actionId]) return ZERO_FORECAST;
  const units = Math.max(1, Math.floor(efficiency));
  const pop = totalReprobates(state);
  const gold = floor(state.lifetime.gold).toNumber();
  const dist: TierWeights = forcedTier
    ? (Object.fromEntries(TIERS.map((t) => [t, t === forcedTier ? 1 : 0])) as TierWeights)
    : actionTierDistribution(state, actionId);
  const tierDelta = (tier: Tier): TierDelta =>
    actionId === 'caedis'
      ? caedisTierDelta(tier, units, pop, gold)
      : actionId === 'suggestion'
        ? suggestionTierDelta(tier, units, pop)
        : actionId === 'indagatio'
          ? indagatioTierDelta(state, tier, gold)
          : NO_DELTA;

  // Mixture moments via the law of total variance: across tiers, mean = Σ pₜ·mₜ and
  // E[X²] = Σ pₜ·(vₜ + mₜ²); variance = E[X²] − mean².
  const acc = {
    souls: { m: 0, e2: 0 },
    reprobates: { m: 0, e2: 0 },
    gold: { m: 0, e2: 0 },
    maleficia: { m: 0, e2: 0 },
  };
  for (const tier of TIERS) {
    const p = dist[tier] ?? 0;
    if (p <= 0) continue;
    const d = tierDelta(tier);
    for (const dim of ['souls', 'reprobates', 'gold', 'maleficia'] as const) {
      acc[dim].m += p * d[dim].m;
      acc[dim].e2 += p * (d[dim].v + d[dim].m * d[dim].m);
    }
  }
  const moment = (a: { m: number; e2: number }): OutcomeMoment => ({
    mean: a.m,
    sd: Math.sqrt(Math.max(0, a.e2 - a.m * a.m)),
  });
  return {
    souls: moment(acc.souls),
    reprobates: moment(acc.reprobates),
    gold: moment(acc.gold),
    maleficia: moment(acc.maleficia),
  };
}

export function resolveAction(
  state: GameState,
  actionId: string,
  rng: Rng,
  options: { target?: string; efficiency?: number; forcedTier?: Tier } = {},
): { state: GameState; event: OutcomeEvent | null } {
  const def = ACTIONS[actionId];
  if (!def) return { state, event: null };
  const mods = computeModifiers(state);
  // Efficiency for cost-outcome categories combines player × category mul; time-mode actions
  // (Indagatio/Emptio) don't use eff in resolution — duration was scaled at start.
  const eff =
    options.efficiency ??
    mods.playerEfficiencyMul *
      (def.category === 'suasio'
        ? mods.suasioEfficiencyMul
        : def.category === 'decimatio'
          ? mods.decimatioEfficiencyMul
          : 1);
  // A background runner may force a fixed outcome tier (the Imp's Caedis is always Good, 03 §2.4 —
  // a passive entity must not randomly trigger an Apocalyptic that wipes the player unprompted).
  // Otherwise: global tier multipliers (Sin skills, sigils, maleficia) THEN the per-category success
  // shift (Resignation/Retribution/Lamia, 02 §2) — composed before renormalization in resolveTier.
  const tier =
    options.forcedTier ??
    resolveTier(
      applyTierModifiers(
        applyTierModifiers(def.weights, mods.tierWeightMul),
        categoryTierModifiers(state, def.category),
      ),
      rng,
    );

  let next: GameState = state;
  let surfaced: string[] = [];
  let acquired: string[] = [];
  let lostFromList: string[] = [];

  // Duplicate-output sigils (Sigils sheet rev 2026-06-12): Malphas #39 (Suasio), Focalor #41
  // (Decimatio), Agares #2 (Indagatio). Rolled once per resolution; only POSITIVE tiers
  // (Stellar/Excellent/Good) duplicate — the curse never doubles a catastrophe. Emptio has no
  // duplication sigil. The second application re-rolls its own randomness against the same tier.
  const dupCategory =
    def.category === 'suasio' || def.category === 'decimatio' || def.category === 'indagatio'
      ? def.category
      : null;
  const positiveTier = tier === 'stellar' || tier === 'excellent' || tier === 'good';
  // Compute the duplication chance FIRST and only draw from the RNG when it is live. An unbound
  // dup-sigil roster yields chance 0, so gating the draw keeps the seeded stream byte-identical to
  // the pre-sigil sequence (ADR-011) — mirroring the Furcas double-find guard in resolveIndagatio.
  const dupChance =
    dupCategory !== null && positiveTier ? sigilDuplicateOutputChance(state, dupCategory) : 0;
  const applyTwice = dupChance > 0 && rng.float() < dupChance;
  const passes = applyTwice ? 2 : 1;

  switch (def.id) {
    case 'suggestion':
      next = resolveSuggestion(state, tier, rng, eff);
      if (applyTwice) next = resolveSuggestion(next, tier, rng, eff);
      break;
    case 'logismoi':
      next = resolveLogismoi(state, tier, rng, eff);
      if (applyTwice) next = resolveLogismoi(next, tier, rng, eff);
      break;
    case 'imperium':
      next = resolveImperium(state, tier, rng, eff);
      if (applyTwice) next = resolveImperium(next, tier, rng, eff);
      break;
    case 'caedis':
      next = resolveCaedis(state, tier, rng, eff);
      if (applyTwice) next = resolveCaedis(next, tier, rng, eff);
      break;
    case 'pogrom':
      next = resolvePogrom(state, tier, rng, eff);
      if (applyTwice) next = resolvePogrom(next, tier, rng, eff);
      break;
    case 'purgatio':
      next = resolvePurgatio(state, tier, rng, eff);
      if (applyTwice) next = resolvePurgatio(next, tier, rng, eff);
      break;
    case 'indagatio': {
      surfaced = [];
      for (let pass = 0; pass < passes; pass += 1) {
        const r = resolveIndagatio(next, tier, rng);
        next = r.state;
        surfaced = surfaced.concat(r.surfaced);
      }
      break;
    }
    case 'emptio': {
      const r = resolveEmptio(state, tier, options.target);
      next = r.state;
      acquired = r.acquired;
      lostFromList = r.lostFromList;
      break;
    }
  }

  // `.toNumber()` of a zero BigNum can yield -0; normalize so consumers compare and render cleanly.
  const norm = (n: number): number => (n === 0 ? 0 : n);
  const event: OutcomeEvent = {
    actionId: def.id,
    tier,
    soulsDelta: norm(sub(floor(next.souls), floor(state.souls)).toNumber()),
    reprobateDelta: totalReprobates(next) - totalReprobates(state),
    goldDelta: norm(sub(floor(next.lifetime.gold), floor(state.lifetime.gold)).toNumber()),
    ...(surfaced.length ? { maleficiaSurfaced: surfaced } : {}),
    ...(acquired.length ? { maleficiaAcquired: acquired } : {}),
    ...(lostFromList.length ? { maleficiaLost: lostFromList } : {}),
  };
  return { state: next, event };
}

/** Suggestion outcome effects (exported for direct testing of each tier). */
export function resolveSuggestion(
  state: GameState,
  tier: Tier,
  rng: Rng,
  efficiency = 1,
): GameState {
  const units = Math.max(1, Math.floor(efficiency));
  switch (tier) {
    case 'stellar':
      // major sin → +randint(4,8) unconverted reprobates (Suasio sheet); efficiency scales the count.
      return addReprobates(state, randint(rng, 4, 8) * units);
    case 'excellent':
      // sin spreads → +randint(2,4) reprobates (sheet rev); efficiency scales the count.
      return addReprobates(state, randint(rng, 2, 4) * units);
    case 'good':
      return addReprobates(state, units);
    case 'bad':
      return removeReprobates(state, units).state; // rejects + redeems another
    case 'terrible':
      return loseReprobatesFraction(state, 0.09).state; // Church intervention
    case 'apocalyptic':
      return loseReprobatesFraction(state, 0.5).state; // mass apostasy (sheet rev)
    case 'neutral':
    default:
      return state;
  }
}

/** Logismoi outcome effects (Suasio sheet; exported for direct testing of each tier). */
export function resolveLogismoi(state: GameState, tier: Tier, rng: Rng, efficiency = 1): GameState {
  const units = Math.max(1, Math.floor(efficiency));
  switch (tier) {
    case 'stellar':
      // the word catches fire → +3% of the current population (sheet rev); efficiency scales.
      return addReprobates(
        state,
        Math.floor(totalReprobates(state) * 0.03 * Math.max(0, efficiency)),
      );
    case 'excellent':
      return addReprobates(state, randint(rng, 20, 58) * units); // sheet rev (owner answer #3)
    case 'good':
      return addReprobates(state, randint(rng, 10, 29) * units);
    case 'bad':
      return removeReprobates(state, units).state; // reject + redeem
    case 'terrible':
      return loseReprobatesFraction(state, 0.09).state; // Church intervention
    case 'apocalyptic':
      return loseReprobatesFraction(state, 0.5).state; // mass apostasy (sheet rev)
    case 'neutral':
    default:
      return state;
  }
}

/**
 * Imperium outcomes (Suasio sheet rev 2026-06-12): the fixed "player in control" Good is retired —
 * the late rite carries a full distribution. Stellar pays +3% of CURRENT SOULS; Excellent +3% of
 * the population; Good +randint(100,1000) reprobates; the tails shed the flock.
 */
export function resolveImperium(state: GameState, tier: Tier, rng: Rng, efficiency = 1): GameState {
  const units = Math.max(1, Math.floor(efficiency));
  switch (tier) {
    case 'stellar':
      return mintSouls(
        state,
        Math.floor(floor(state.souls).toNumber() * 0.03 * Math.max(0, efficiency)),
      );
    case 'excellent':
      return addReprobates(
        state,
        Math.floor(totalReprobates(state) * 0.03 * Math.max(0, efficiency)),
      );
    case 'good':
      return addReprobates(state, randint(rng, 100, 1000) * units);
    case 'bad':
      return removeReprobates(state, units).state;
    case 'terrible':
      return loseReprobatesFraction(state, 0.05).state;
    case 'apocalyptic':
      return loseReprobatesFraction(state, 0.5).state;
    case 'neutral':
    default:
      return state;
  }
}

/** Caedis outcome effects (exported for direct testing of each tier). */
export function resolveCaedis(state: GameState, tier: Tier, rng: Rng, efficiency = 1): GameState {
  const scale = Math.max(1, Math.floor(efficiency));
  switch (tier) {
    case 'stellar': {
      const { state: next, removed } = removeReprobates(state, randint(rng, 15, 45) * scale);
      return mintSouls(next, removed);
    }
    case 'excellent': {
      const { state: next, removed } = removeReprobates(state, randint(rng, 3, 9) * scale);
      return mintSouls(next, removed);
    }
    case 'good': {
      const { state: next, removed } = removeReprobates(state, scale);
      return mintSouls(next, removed);
    }
    case 'bad':
      return loseGoldFraction(state, 0.05);
    case 'terrible':
      return loseGoldFraction(state, 0.15);
    case 'apocalyptic': {
      // A Higher Power stops the assassination and campaigns against you (Decimatio sheet rev):
      // 33% current gold loss and 25% of all reprobates lost — taken from you, not harvested,
      // so no souls are minted (mirrors the Suggestion "Church" loss).
      const afterGold = loseGoldFraction(state, 0.33);
      return loseReprobatesFraction(afterGold, 0.25).state;
    }
    case 'neutral':
    default:
      // The kill fails; gold was already spent, nothing else happens.
      return state;
  }
}

/**
 * Pogrom outcome (Decimatio sheet rev 2026-06-12): a mass cull of the reprobate pool.
 * Stellar/Excellent/Good kill 2.5 / 1 / 0.1 % of the population and harvest a soul per death;
 * positive culls scale with efficiency (clamped to 100%). Bad burns gold; Terrible lets the Church
 * seize the flock; Apocalyptic burns 66% of gold AND half the flock.
 */
export function resolvePogrom(state: GameState, tier: Tier, _rng: Rng, efficiency = 1): GameState {
  // Efficiency lifts the positive cull share (02 §2: Decimatio efficiency modifies positive
  // outcomes), never beyond the whole population.
  const cullFrac = (base: number): number => Math.min(1, base * Math.max(0, efficiency));
  const purge = (frac: number): GameState => {
    const { state: next, removed } = loseReprobatesFraction(state, cullFrac(frac));
    return mintSouls(next, removed);
  };
  switch (tier) {
    case 'stellar':
      return purge(0.025);
    case 'excellent':
      return purge(0.01);
    case 'good':
      return purge(0.001);
    case 'bad':
      return loseGoldFraction(state, 0.05); // mob turns
    case 'terrible':
      return loseReprobatesFraction(state, 0.15).state; // Church seizes the flock
    case 'apocalyptic':
      // A Higher Power smites the operation: 66% gold and half the flock (sheet rev).
      return loseReprobatesFraction(loseGoldFraction(state, 0.66), 0.5).state;
    case 'neutral':
    default:
      return state; // mob disperses; gold already spent
  }
}

/**
 * Purgatio outcome (Decimatio sheet rev 2026-06-12): the great soul farm — Stellar/Excellent/Good
 * kill 25 / 10 / 1 % of all reprobates, harvesting a soul per death (positive share scales with
 * efficiency, clamped to 100%). Bad burns 5% of gold; Terrible burns ALL gold; Apocalyptic burns
 * all gold and the whole flock.
 */
export function resolvePurgatio(
  state: GameState,
  tier: Tier,
  _rng: Rng,
  efficiency = 1,
): GameState {
  const harvest = (base: number): GameState => {
    const frac = Math.min(1, base * Math.max(0, efficiency));
    const k = Math.floor(totalReprobates(state) * frac);
    const { state: next, removed } = removeReprobates(state, k);
    return mintSouls(next, removed);
  };
  switch (tier) {
    case 'stellar':
      return harvest(0.25);
    case 'excellent':
      return harvest(0.1);
    case 'good':
      return harvest(0.01);
    case 'bad':
      return loseGoldFraction(state, 0.05); // mob turns
    case 'terrible':
      return loseGoldFraction(state, 1); // the whole purse burns (sheet rev)
    case 'apocalyptic':
      // Everything burns: all gold AND the whole flock, none of it harvested.
      return loseReprobatesFraction(loseGoldFraction(state, 1), 1).state;
    case 'neutral':
    default:
      return state; // mob disperses; gold already spent
  }
}

/**
 * Indagatio outcome: tier picks a rarity to surface from the catalog. The candidates respect the
 * stack rules in 03 §2.5 (non-stackable items already owned or listed cannot be re-found; stackable
 * items can only be surfaced while owned+listed < stackMax). If the picked rarity has no findable
 * candidates, the search falls back to the next rarity down before giving up.
 */
export function resolveIndagatio(
  state: GameState,
  tier: Tier,
  rng: Rng,
): { state: GameState; surfaced: string[] } {
  // Walks rarities best→worst from the tier's entry point, stopping at the first one with a
  // findable candidate (Indagatio & Emptio sheet): Stellar→anathema, Excellent→profane, Good→rare,
  // Neutral→common. Bad is a false lead (time lost, nothing surfaced); the failure tiers below bite
  // gold instead.
  const fallbackChain: MaleficiumRarity[] =
    tier === 'stellar'
      ? ['anathema', 'profane', 'rare', 'common']
      : tier === 'excellent'
        ? ['profane', 'rare', 'common']
        : tier === 'good'
          ? ['rare', 'common']
          : tier === 'neutral'
            ? ['common']
            : [];
  // Find one item along the chain; returns the updated state + picked id, or null if none findable.
  const findOne = (st: GameState): { state: GameState; picked: string } | null => {
    for (const rarity of fallbackChain) {
      const ids = findableIds(rarity, st.lifetime.maleficia, st.lifetime.emptioList);
      if (ids.length === 0) continue;
      const picked = ids[rng.int(ids.length)];
      if (!picked) continue; // defensive: rng.int could (in theory) land out of range
      // The Emptio surfaces at most MAX_EMPTIO_LIST_SIZE items; finding the next one drops the
      // oldest (FIFO) so the list never grows past the cap.
      const grown = [...st.lifetime.emptioList, picked];
      const capped =
        grown.length > MAX_EMPTIO_LIST_SIZE
          ? grown.slice(grown.length - MAX_EMPTIO_LIST_SIZE)
          : grown;
      return {
        state: {
          ...st,
          lifetime: { ...st.lifetime, emptioList: capped },
        },
        picked,
      };
    }
    return null;
  };

  // Roll the Emptio price for any newly-surfaced item that lacks one (Maleficia sheet: Randint per
  // rarity band). Drawn AFTER all find logic so which items surface stays byte-identical to the
  // pre-pricing RNG stream; only never-before-priced ids draw.
  const priceSurfaced = (st: GameState, ids: readonly string[]): GameState => {
    const prices = { ...st.lifetime.maleficiaPrices };
    let changed = false;
    for (const id of ids) {
      if (prices[id] !== undefined) continue;
      const def = MALEFICIA[id];
      if (!def) continue;
      const band = MALEFICIUM_PRICE_RANGE[def.rarity];
      prices[id] = randint(rng, band.min, band.max);
      changed = true;
    }
    return changed ? { ...st, lifetime: { ...st.lifetime, maleficiaPrices: prices } } : st;
  };

  const first = findOne(state);
  if (first) {
    let working = first.state;
    const surfaced = [first.picked];
    // Furcas #50: a chance to surface a SECOND item in the same search. The float is drawn only when
    // the chance is live, so an unbound roster leaves the RNG stream (and existing tests) untouched.
    const chance = sigilIndagatioDoubleFindChance(state);
    if (chance > 0 && rng.float() < chance) {
      const second = findOne(working);
      if (second) {
        working = second.state;
        surfaced.push(second.picked);
      }
    }
    return { state: priceSurfaced(working, surfaced), surfaced };
  }

  // Failure tiers bite gold (Indagatio & Emptio sheet): Terrible (Church trap) −15%, Apocalyptic
  // (Higher-Power agent) −80%. Bad (false lead) and any unfindable rarity fall through unchanged.
  if (tier === 'terrible') {
    return { state: loseGoldFraction(state, 0.15), surfaced: [] };
  }
  if (tier === 'apocalyptic') {
    return { state: loseGoldFraction(state, 0.8), surfaced: [] };
  }
  return { state, surfaced: [] };
}

/**
 * Emptio outcome: the gold cost has already been paid in `startAction`. Tier decides whether the
 * deal succeeds (item enters inventory, list entry consumed), falls through (refund, list keeps
 * the entry), or fails (cost stays gone, list may also lose the entry on the worst draws).
 */
export function resolveEmptio(
  state: GameState,
  tier: Tier,
  target: string | undefined,
): { state: GameState; acquired: string[]; lostFromList: string[] } {
  if (!target || !MALEFICIA[target]) return { state, acquired: [], lostFromList: [] };
  if (!state.lifetime.emptioList.includes(target)) {
    // The target vanished from the list mid-flight (theft, parallel hand). No item, no refund.
    return { state, acquired: [], lostFromList: [] };
  }
  const def = MALEFICIA[target];
  // Refunds are relative to the gold actually PAID at startAction — the in-band rolled price
  // (Maleficia sheet Randint per rarity), softened by the Amy Emptio-gold reduction — NOT the flat
  // catalog `def.cost`. Recompute it the same way startAction did (actions.ts ~166) so a Stellar
  // "full refund" truly zeroes the purchase and the partial tiers refund the right fraction of the
  // listed price. Falls back to `def.cost` for items surfaced before rolled pricing landed.
  const rolled = state.lifetime.maleficiaPrices[target] ?? def.cost;
  const costRed = sigilCostReductionByChannel(
    state,
    sigilEffectMultiplier(state.lifetime.maleficia),
  );
  const paid = costRed.emptioGold ? Math.ceil(rolled / costRed.emptioGold) : rolled;
  // Remove ONE matching entry from the list (stackable items can have multiple copies listed).
  const dropIndex = state.lifetime.emptioList.indexOf(target);
  const trimmedList = [
    ...state.lifetime.emptioList.slice(0, dropIndex),
    ...state.lifetime.emptioList.slice(dropIndex + 1),
  ];

  switch (tier) {
    case 'stellar': {
      // Acquired AND full refund — a once-in-a-lifetime steal.
      const next: GameState = {
        ...state,
        lifetime: {
          ...state.lifetime,
          gold: add(state.lifetime.gold, paid),
          maleficia: [...state.lifetime.maleficia, target],
          emptioList: trimmedList,
        },
      };
      return { state: next, acquired: [target], lostFromList: [] };
    }
    case 'excellent': {
      // Purchase at 25% of the listed price (sheet rev): three quarters refunded.
      const next: GameState = {
        ...state,
        lifetime: {
          ...state.lifetime,
          gold: add(state.lifetime.gold, Math.floor(paid * 0.75)),
          maleficia: [...state.lifetime.maleficia, target],
          emptioList: trimmedList,
        },
      };
      return { state: next, acquired: [target], lostFromList: [] };
    }
    case 'good': {
      // Purchase at half the listed price (sheet rev): half refunded.
      const next: GameState = {
        ...state,
        lifetime: {
          ...state.lifetime,
          gold: add(state.lifetime.gold, Math.floor(paid / 2)),
          maleficia: [...state.lifetime.maleficia, target],
          emptioList: trimmedList,
        },
      };
      return { state: next, acquired: [target], lostFromList: [] };
    }
    case 'neutral': {
      // Purchase at the listed price (Indagatio & Emptio sheet): the item enters the inventory,
      // cost as paid (already deducted at startAction), and the list entry is consumed.
      const next: GameState = {
        ...state,
        lifetime: {
          ...state.lifetime,
          maleficia: [...state.lifetime.maleficia, target],
          emptioList: trimmedList,
        },
      };
      return { state: next, acquired: [target], lostFromList: [] };
    }
    case 'bad': {
      // Gold lost (already paid), item stays on the list — try again with more.
      return { state, acquired: [], lostFromList: [] };
    }
    case 'terrible': {
      // Gold lost, item snatched away — leaves the list entirely.
      const next: GameState = {
        ...state,
        lifetime: { ...state.lifetime, emptioList: trimmedList },
      };
      return { state: next, acquired: [], lostFromList: [target] };
    }
    case 'apocalyptic': {
      // Bait (Indagatio & Emptio sheet): gold already lost, item gone, plus a 50%-of-total bite.
      const punished = loseGoldFraction(state, 0.5);
      const next: GameState = {
        ...punished,
        lifetime: { ...punished.lifetime, emptioList: trimmedList },
      };
      return { state: next, acquired: [], lostFromList: [target] };
    }
    default:
      return { state, acquired: [], lostFromList: [] };
  }
}
