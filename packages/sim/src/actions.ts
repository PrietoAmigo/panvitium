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
import { type Tier, type TierWeights, applyTierModifiers, resolveTier } from './probability.js';
import { categoryEfficiency, categoryTierModifiers, computeModifiers } from './modifiers.js';
import {
  addReprobates,
  cullSubtypeFraction,
  loseConvertedReprobatesFraction,
  loseGoldFraction,
  loseReprobatesFraction,
  mintSouls,
  removeReprobatesRandom,
} from './population.js';
import {
  type ActionTimer,
  type GameState,
  type Sin,
  type ReprobateSubtype,
  REPROBATE_SUBTYPES,
  totalReprobates,
} from './state.js';
import { sinLevel } from './progression.js';
import { type OutcomeEvent } from './events.js';
import {
  MALEFICIA,
  findableIds,
  sigilEffectMultiplier,
  type MaleficiumRarity,
} from './maleficia.js';
import { sigilCostReductionByChannel, sigilIndagatioDoubleFindChance } from './sigils.js';

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

const SUGGESTION_WEIGHTS: TierWeights = {
  stellar: 0.001,
  excellent: 0.149,
  good: 0.6,
  neutral: 0.15,
  bad: 0.075,
  terrible: 0.025,
  apocalyptic: 0,
};

/** Logismoi (Suasio sheet): mid-game reprobate/soul source; richer than Suggestion. */
const LOGISMOI_WEIGHTS: TierWeights = {
  stellar: 0.025,
  excellent: 0.2,
  good: 0.575,
  neutral: 0.125,
  bad: 0.06,
  terrible: 0.015,
  apocalyptic: 0,
};

/** Imperium (Suasio sheet): no distribution — a single fixed Good outcome (player in control). */
const IMPERIUM_WEIGHTS: TierWeights = {
  stellar: 0,
  excellent: 0,
  good: 1,
  neutral: 0,
  bad: 0,
  terrible: 0,
  apocalyptic: 0,
};

const CAEDIS_WEIGHTS: TierWeights = {
  stellar: 0.01,
  excellent: 0.04,
  good: 0.66,
  neutral: 0.15,
  bad: 0.1,
  terrible: 0.03,
  apocalyptic: 0.01,
};

/** Pogrom (Decimatio sheet): same tier distribution as Caedis; a single-subtype mass cull. */
const POGROM_WEIGHTS: TierWeights = {
  stellar: 0.01,
  excellent: 0.04,
  good: 0.66,
  neutral: 0.15,
  bad: 0.1,
  terrible: 0.03,
  apocalyptic: 0.01,
};

/** Purgatio (Decimatio sheet): same tier distribution; culls every subtype at once. */
const PURGATIO_WEIGHTS: TierWeights = {
  stellar: 0.01,
  excellent: 0.04,
  good: 0.66,
  neutral: 0.15,
  bad: 0.1,
  terrible: 0.03,
  apocalyptic: 0.01,
};

/** Indagatio (03 §2.5): mostly Good/Neutral; Stellar surfaces a profane+, Excellent a rare. */
const INDAGATIO_WEIGHTS: TierWeights = {
  stellar: 0.001,
  excellent: 0.049,
  good: 0.2,
  neutral: 0.5,
  bad: 0.2,
  terrible: 0.045,
  apocalyptic: 0.005,
};

/** Emptio (03 §2.6): biased toward success since you've already committed the gold. Good/Bad are 0
 * in the current spreadsheet distribution — every non-failure outcome resolves the purchase. */
const EMPTIO_WEIGHTS: TierWeights = {
  stellar: 0.01,
  excellent: 0.04,
  good: 0,
  neutral: 0.9,
  bad: 0,
  terrible: 0.049,
  apocalyptic: 0.001,
};

/**
 * The actions implemented so far. Numbers are from the economy spreadsheet (Suasio / Decimatio /
 * Indagatio / Emptio). Indagatio is 1800 s baseline (acolyte delegation will lift the wait) and
 * Emptio is 600 s — both efficiency-mode `time`, so player efficiency divides the duration.
 */
export const ACTIONS: Record<string, ActionDef> = {
  suggestion: {
    id: 'suggestion',
    category: 'suasio',
    baseTimeSeconds: 5,
    cost: { influence: 5 },
    weights: SUGGESTION_WEIGHTS,
    efficiencyMode: 'cost-outcome',
    delegateUnlock: { sin: 'luxuria', level: 1 },
  },
  logismoi: {
    id: 'logismoi',
    category: 'suasio',
    baseTimeSeconds: 5,
    cost: { influence: 25 },
    weights: LOGISMOI_WEIGHTS,
    efficiencyMode: 'cost-outcome',
    unlock: { sin: 'luxuria', level: 2 },
    delegateUnlock: { sin: 'luxuria', level: 3 },
  },
  imperium: {
    id: 'imperium',
    // PLACEHOLDER time: the Suasio sheet defers Imperium's duration ("Fill Time"). 60s holds the
    // late-game big-payoff feel until the sheet pins it; cost/effect/gating are from the sheet.
    baseTimeSeconds: 60,
    category: 'suasio',
    cost: { influence: 100 },
    weights: IMPERIUM_WEIGHTS,
    efficiencyMode: 'cost-outcome',
    unlock: { sin: 'luxuria', level: 3 },
    delegateUnlock: { sin: 'luxuria', level: 4 },
  },
  caedis: {
    id: 'caedis',
    category: 'decimatio',
    baseTimeSeconds: 10,
    cost: { gold: 100 },
    weights: CAEDIS_WEIGHTS,
    efficiencyMode: 'cost-outcome',
    delegateUnlock: { sin: 'ira', level: 1 },
  },
  pogrom: {
    id: 'pogrom',
    category: 'decimatio',
    baseTimeSeconds: 60, // sheet: "~60s"
    // PLACEHOLDER cost: the sheet says "high gold" without a figure (Caedis is 100). Flagged until pinned.
    cost: { gold: 1000 },
    weights: POGROM_WEIGHTS,
    efficiencyMode: 'cost-outcome',
    unlock: { sin: 'ira', level: 2 },
    delegateUnlock: { sin: 'ira', level: 3 },
  },
  purgatio: {
    id: 'purgatio',
    category: 'decimatio',
    baseTimeSeconds: 3600, // sheet: "~3600s"
    // PLACEHOLDER cost: the sheet says "very high gold" without a figure. Flagged until pinned.
    cost: { gold: 10000 },
    weights: PURGATIO_WEIGHTS,
    efficiencyMode: 'cost-outcome',
    unlock: { sin: 'ira', level: 3 },
    delegateUnlock: { sin: 'ira', level: 4 },
  },
  indagatio: {
    id: 'indagatio',
    category: 'indagatio',
    baseTimeSeconds: 300,
    cost: {},
    weights: INDAGATIO_WEIGHTS,
    efficiencyMode: 'time',
  },
  emptio: {
    id: 'emptio',
    category: 'emptio',
    baseTimeSeconds: 60,
    cost: {}, // per-target — startEmptio reads the maleficium's cost dynamically.
    weights: EMPTIO_WEIGHTS,
    efficiencyMode: 'time',
  },
};

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

  // One player-driven action at a time (02 §3).
  if (state.lifetime.actionQueue.length > 0) {
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
    goldCost = costRed.emptioGold ? Math.ceil(malef.cost / costRed.emptioGold) : malef.cost;
    target = options.target;
  }
  if (actionId === 'pogrom') {
    // Pogrom purges one chosen reprobate subtype — it needs a valid target to act on.
    if (!options.target || !REPROBATE_SUBTYPES.includes(options.target as ReprobateSubtype)) {
      return { ok: false, reason: 'Choose a subtype to purge.' };
    }
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

export interface CycleCost {
  readonly gold: number;
  readonly influence: number;
}

/**
 * Per-cycle resource cost for a background runner of `actionId` at efficiency `eff`. Cost-outcome
 * actions (Suasio/Decimatio) scale their cost by eff (ceil, matching `startAction`). Time-mode
 * actions (Indagatio) have no per-cycle cost on the delegated path — Emptio's per-target gold is
 * not a delegated route, so it is excluded here.
 */
export function actionCycleCost(actionId: string, eff: number): CycleCost {
  const def = ACTIONS[actionId];
  if (!def || def.efficiencyMode !== 'cost-outcome') return { gold: 0, influence: 0 };
  return {
    gold: Math.ceil((def.cost.gold ?? 0) * eff),
    influence: Math.ceil((def.cost.influence ?? 0) * eff),
  };
}

/** Whether the lifetime can afford a cycle cost (floored comparison — resources are naturals). */
export function canAffordCycle(state: GameState, cost: CycleCost): boolean {
  return (
    gte(floor(state.lifetime.gold), cost.gold) &&
    gte(floor(state.lifetime.influence), cost.influence)
  );
}

/** Deduct a cycle cost from the lifetime resources. */
export function payCycle(state: GameState, cost: CycleCost): GameState {
  if (cost.gold === 0 && cost.influence === 0) return state;
  return {
    ...state,
    lifetime: {
      ...state.lifetime,
      gold: sub(state.lifetime.gold, cost.gold),
      influence: sub(state.lifetime.influence, cost.influence),
    },
  };
}

/**
 * Fresh-cycle duration for a runner of `actionId` at efficiency `eff`. Time-mode divides the base
 * by efficiency (floored at 1 s); cost-outcome leaves the base untouched (eff scales cost+outcome,
 * not duration). Mirrors the duration logic in `startAction`.
 */
export function runnerCycleDuration(actionId: string, eff: number): number {
  const def = ACTIONS[actionId];
  if (!def) return Infinity;
  return def.efficiencyMode === 'time' && eff > 0
    ? Math.max(1, def.baseTimeSeconds / eff)
    : def.baseTimeSeconds;
}

/** Draw the outcome tier for a completed action, apply its effect, and report what happened. */
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

  switch (def.id) {
    case 'suggestion':
      next = resolveSuggestion(state, tier, rng, eff);
      break;
    case 'logismoi':
      next = resolveLogismoi(state, tier, rng, eff);
      break;
    case 'imperium':
      next = resolveImperium(state, rng, eff);
      break;
    case 'caedis':
      next = resolveCaedis(state, tier, rng, eff);
      break;
    case 'pogrom':
      next = resolvePogrom(state, tier, rng, options.target, eff);
      break;
    case 'purgatio':
      next = resolvePurgatio(state, tier, rng, eff);
      break;
    case 'indagatio': {
      const r = resolveIndagatio(state, tier, rng);
      next = r.state;
      surfaced = r.surfaced;
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
      return addReprobates(state, 'reprobate', randint(rng, 4, 8) * units);
    case 'excellent':
      // target suicides → +1 soul (Suasio sheet); efficiency scales the soul count.
      return mintSouls(state, units);
    case 'good':
      return addReprobates(state, 'reprobate', units);
    case 'bad':
      return removeReprobatesRandom(state, units, rng).state; // rejects + redeems another
    case 'terrible':
      return loseReprobatesFraction(state, 0.09, rng).state; // Church intervention
    case 'neutral':
    case 'apocalyptic':
    default:
      return state;
  }
}

/** Logismoi outcome effects (Suasio sheet; exported for direct testing of each tier). */
export function resolveLogismoi(state: GameState, tier: Tier, rng: Rng, efficiency = 1): GameState {
  const units = Math.max(1, Math.floor(efficiency));
  switch (tier) {
    case 'stellar':
      // group suicides → +randint(10,29) souls; efficiency scales the soul count.
      return mintSouls(state, randint(rng, 10, 29) * units);
    case 'excellent':
    case 'good':
      // (major) sin → +randint(10,29) unconverted reprobates.
      return addReprobates(state, 'reprobate', randint(rng, 10, 29) * units);
    case 'bad':
      return removeReprobatesRandom(state, units, rng).state; // reject + redeem
    case 'terrible':
      return loseReprobatesFraction(state, 0.09, rng).state; // Church intervention
    case 'neutral':
    case 'apocalyptic':
    default:
      return state;
  }
}

/**
 * Imperium outcome (Suasio sheet): a single fixed result — the player is in control, so it resolves
 * the Good outcome regardless of the rolled tier: +randint(360,1260) unconverted reprobates.
 */
export function resolveImperium(state: GameState, rng: Rng, efficiency = 1): GameState {
  const units = Math.max(1, Math.floor(efficiency));
  return addReprobates(state, 'reprobate', randint(rng, 360, 1260) * units);
}

/** Caedis outcome effects (exported for direct testing of each tier). */
export function resolveCaedis(state: GameState, tier: Tier, rng: Rng, efficiency = 1): GameState {
  const scale = Math.max(1, Math.floor(efficiency));
  switch (tier) {
    case 'stellar': {
      const { state: next, removed } = removeReprobatesRandom(
        state,
        randint(rng, 15, 45) * scale,
        rng,
      );
      return mintSouls(next, removed);
    }
    case 'excellent': {
      const { state: next, removed } = removeReprobatesRandom(
        state,
        randint(rng, 3, 9) * scale,
        rng,
      );
      return mintSouls(next, removed);
    }
    case 'good': {
      const { state: next, removed } = removeReprobatesRandom(state, scale, rng);
      return mintSouls(next, removed);
    }
    case 'bad':
      return loseGoldFraction(state, 0.05);
    case 'terrible':
      return loseGoldFraction(state, 0.15);
    case 'apocalyptic': {
      // A Higher Power stops the assassination and campaigns against you (Decimatio sheet):
      // 66% current gold loss and 50% of all reprobates lost — taken from you, not harvested,
      // so no souls are minted (mirrors the Suggestion "Church" loss).
      const afterGold = loseGoldFraction(state, 0.66);
      return loseReprobatesFraction(afterGold, 0.5, rng).state;
    }
    case 'neutral':
    default:
      // The kill fails; gold was already spent, nothing else happens.
      return state;
  }
}

/**
 * Pogrom outcome (Decimatio sheet): a mass cull of one chosen subtype. Stellar/Excellent/Good kill
 * 25 / 10 / 5 % of that subtype and harvest a soul per death; positive culls scale with efficiency
 * (clamped to 100%). Bad/Apocalyptic burn gold; Terrible lets the Church seize converts. `target`
 * is the subtype id (validated at `startAction`).
 */
export function resolvePogrom(
  state: GameState,
  tier: Tier,
  _rng: Rng,
  target: string | undefined,
  efficiency = 1,
): GameState {
  // Efficiency lifts the positive cull share (02 §2: Decimatio efficiency modifies positive
  // outcomes), never beyond the whole subtype.
  const cullFrac = (base: number): number => Math.min(1, base * Math.max(0, efficiency));
  const purge = (frac: number): GameState => {
    if (!target || !REPROBATE_SUBTYPES.includes(target as ReprobateSubtype)) return state;
    const { state: next, removed } = cullSubtypeFraction(
      state,
      target as ReprobateSubtype,
      cullFrac(frac),
    );
    return mintSouls(next, removed);
  };
  switch (tier) {
    case 'stellar':
      return purge(0.25);
    case 'excellent':
      return purge(0.1);
    case 'good':
      return purge(0.05);
    case 'bad':
      return loseGoldFraction(state, 0.05); // mob turns
    case 'terrible':
      return loseConvertedReprobatesFraction(state, 0.15).state; // Church seizes converts
    case 'apocalyptic':
      return loseGoldFraction(state, 0.65); // a Higher Power smites the operation
    case 'neutral':
    default:
      return state; // mob disperses; gold already spent
  }
}

/**
 * Purgatio outcome (Decimatio sheet): culls every subtype at once — Stellar/Excellent/Good kill
 * 100 / 66 / 33 % of all reprobates, harvesting a soul per death (positive share scales with
 * efficiency, clamped to 100%). Bad burns gold; Terrible/Apocalyptic let the Church seize converts,
 * with Apocalyptic also taking 95 % of gold.
 */
export function resolvePurgatio(state: GameState, tier: Tier, rng: Rng, efficiency = 1): GameState {
  const harvest = (base: number): GameState => {
    const frac = Math.min(1, base * Math.max(0, efficiency));
    const k = Math.floor(totalReprobates(state) * frac);
    const { state: next, removed } = removeReprobatesRandom(state, k, rng);
    return mintSouls(next, removed);
  };
  switch (tier) {
    case 'stellar':
      return harvest(1);
    case 'excellent':
      return harvest(0.66);
    case 'good':
      return harvest(0.33);
    case 'bad':
      return loseGoldFraction(state, 0.05); // mob turns
    case 'terrible':
      return loseConvertedReprobatesFraction(state, 0.15).state; // Church seizes converts
    case 'apocalyptic':
      // Lose 95% of gold and a quarter of the converts.
      return loseConvertedReprobatesFraction(loseGoldFraction(state, 0.95), 0.25).state;
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
      return {
        state: {
          ...st,
          lifetime: { ...st.lifetime, emptioList: [...st.lifetime.emptioList, picked] },
        },
        picked,
      };
    }
    return null;
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
    return { state: working, surfaced };
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
          gold: add(state.lifetime.gold, def.cost),
          maleficia: [...state.lifetime.maleficia, target],
          emptioList: trimmedList,
        },
      };
      return { state: next, acquired: [target], lostFromList: [] };
    }
    case 'excellent': {
      // Acquired with half refund.
      const next: GameState = {
        ...state,
        lifetime: {
          ...state.lifetime,
          gold: add(state.lifetime.gold, Math.floor(def.cost / 2)),
          maleficia: [...state.lifetime.maleficia, target],
          emptioList: trimmedList,
        },
      };
      return { state: next, acquired: [target], lostFromList: [] };
    }
    case 'good':
    case 'neutral': {
      // Purchase at the listed price (Indagatio & Emptio sheet): the item enters the inventory,
      // cost as paid (already deducted at startAction), and the list entry is consumed. Neutral is
      // the common successful purchase; Good — currently zero-weight in the spreadsheet — resolves
      // identically as a straight buy.
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
