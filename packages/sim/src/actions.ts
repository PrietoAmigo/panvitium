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
import { categoryEfficiency, computeModifiers } from './modifiers.js';
import { sinLevel } from './progression.js';
import {
  addReprobates,
  loseGoldFraction,
  loseReprobatesFraction,
  mintSouls,
  removeReprobatesRandom,
} from './population.js';
import {
  type ActionTimer,
  type GameState,
  type ReprobateSubtype,
  type Sin,
  SINS,
  totalReprobates,
} from './state.js';
import { type OutcomeEvent } from './events.js';
import { MALEFICIA, findableIds, type MaleficiumRarity } from './maleficia.js';

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
}

const SUGGESTION_WEIGHTS: TierWeights = {
  stellar: 0.001,
  excellent: 0.149,
  good: 0.5,
  neutral: 0.2,
  bad: 0.125,
  terrible: 0.025,
  apocalyptic: 0,
};

const CAEDIS_WEIGHTS: TierWeights = {
  stellar: 0.01,
  excellent: 0.04,
  good: 0.5,
  neutral: 0.25,
  bad: 0.15,
  terrible: 0.04,
  apocalyptic: 0.01,
};

/** Indagatio (03 §2.5): mostly Good/Neutral; Stellar surfaces a profane+, Excellent a rare. */
const INDAGATIO_WEIGHTS: TierWeights = {
  stellar: 0.005,
  excellent: 0.05,
  good: 0.4,
  neutral: 0.4,
  bad: 0.1,
  terrible: 0.04,
  apocalyptic: 0.005,
};

/** Emptio (03 §2.6): biased toward success since you've already committed the gold. */
const EMPTIO_WEIGHTS: TierWeights = {
  stellar: 0.02,
  excellent: 0.08,
  good: 0.6,
  neutral: 0.2,
  bad: 0.06,
  terrible: 0.03,
  apocalyptic: 0.01,
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
    baseTimeSeconds: 10,
    cost: { influence: 5 },
    weights: SUGGESTION_WEIGHTS,
    efficiencyMode: 'cost-outcome',
  },
  caedis: {
    id: 'caedis',
    category: 'decimatio',
    baseTimeSeconds: 10,
    cost: { gold: 100 },
    weights: CAEDIS_WEIGHTS,
    efficiencyMode: 'cost-outcome',
  },
  indagatio: {
    id: 'indagatio',
    category: 'indagatio',
    baseTimeSeconds: 1800,
    cost: {},
    weights: INDAGATIO_WEIGHTS,
    efficiencyMode: 'time',
  },
  emptio: {
    id: 'emptio',
    category: 'emptio',
    baseTimeSeconds: 600,
    cost: {}, // per-target — startEmptio reads the maleficium's cost dynamically.
    weights: EMPTIO_WEIGHTS,
    efficiencyMode: 'time',
  },
};

const SUBTYPE_OF_SIN: Record<Sin, ReprobateSubtype> = {
  gula: 'glutton',
  luxuria: 'degenerate',
  avaritia: 'gambler',
  tristitia: 'nihilist',
  ira: 'choleric',
  acedia: 'husk',
  vanagloria: 'celebrity',
  superbia: 'sigma',
};

/** Inclusive integer in [lo, hi] from the seeded RNG. */
function randint(rng: Rng, lo: number, hi: number): number {
  return lo + rng.int(hi - lo + 1);
}

/**
 * The subtype a conversion biases toward, weighted by Sin levels (03). With no Sin developed yet,
 * there's nothing to convert toward, so the reprobate stays unconverted.
 */
function biasedSubtype(state: GameState, rng: Rng): ReprobateSubtype {
  const entries: { subtype: ReprobateSubtype; weight: number }[] = [];
  let total = 0;
  for (const sin of SINS) {
    const level = sinLevel(state.devotion[sin]);
    if (level > 0) {
      entries.push({ subtype: SUBTYPE_OF_SIN[sin], weight: level });
      total += level;
    }
  }
  if (total === 0) return 'reprobate';
  let r = rng.int(total);
  for (const entry of entries) {
    if (r < entry.weight) return entry.subtype;
    r -= entry.weight;
  }
  return 'reprobate';
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
  if (actionId === 'emptio') {
    if (!options.target) return { ok: false, reason: 'No maleficium chosen.' };
    if (!state.lifetime.emptioList.includes(options.target)) {
      return { ok: false, reason: 'Not in the Emptio list.' };
    }
    const malef = MALEFICIA[options.target];
    if (!malef) return { ok: false, reason: 'Unknown maleficium.' };
    goldCost = malef.cost;
    target = options.target;
  }
  if (def.efficiencyMode === 'cost-outcome') {
    goldCost = Math.ceil(goldCost * eff);
    influenceCost = Math.ceil(influenceCost * eff);
  }

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

/** Draw the outcome tier for a completed action, apply its effect, and report what happened. */
export function resolveAction(
  state: GameState,
  actionId: string,
  rng: Rng,
  options: { target?: string; efficiency?: number } = {},
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
  const tier = resolveTier(applyTierModifiers(def.weights, mods.tierWeightMul), rng);

  let next: GameState = state;
  let surfaced: string[] = [];
  let acquired: string[] = [];
  let lostFromList: string[] = [];

  switch (def.id) {
    case 'suggestion':
      next = resolveSuggestion(state, tier, rng, eff);
      break;
    case 'caedis':
      next = resolveCaedis(state, tier, rng, eff);
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
      return mintSouls(state, units); // target dies in sin → soul, no reprobate
    case 'excellent':
      return addReprobates(state, biasedSubtype(state, rng), units);
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
    case 'neutral':
    case 'apocalyptic':
    default:
      // neutral: the kill fails, gold already spent. apocalyptic: a Higher Power stops it.
      // TODO: apocalyptic should freeze influence regen for 300 s — needs a freeze field on state.
      return state;
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
  // Walks rarities best→worst, stopping at the first one with at least one findable candidate.
  const fallbackChain: MaleficiumRarity[] =
    tier === 'stellar'
      ? ['anathema', 'profane', 'rare', 'common']
      : tier === 'excellent'
        ? ['profane', 'rare', 'common']
        : tier === 'good'
          ? ['common']
          : [];
  for (const rarity of fallbackChain) {
    const ids = findableIds(rarity, state.lifetime.maleficia, state.lifetime.emptioList);
    if (ids.length === 0) continue;
    const picked = ids[rng.int(ids.length)];
    if (!picked) continue; // defensive: rng.int could (in theory) land out of range
    const next: GameState = {
      ...state,
      lifetime: { ...state.lifetime, emptioList: [...state.lifetime.emptioList, picked] },
    };
    return { state: next, surfaced: [picked] };
  }

  // Negative tiers: small gold-loss bites that scale with severity. Neutral / unfindable tiers fall
  // through with no state change.
  if (tier === 'terrible') {
    return { state: loseGoldFraction(state, 0.05), surfaced: [] };
  }
  if (tier === 'apocalyptic') {
    return { state: loseGoldFraction(state, 0.2), surfaced: [] };
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
    case 'good': {
      // Straight purchase: item enters the inventory, cost as paid.
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
    case 'neutral': {
      // Deal falls through; refund cost; item stays on the list for another attempt.
      const next: GameState = {
        ...state,
        lifetime: { ...state.lifetime, gold: add(state.lifetime.gold, def.cost) },
      };
      return { state: next, acquired: [], lostFromList: [] };
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
      // Gold lost, item gone, plus a punishing additional gold bite.
      const punished = loseGoldFraction(state, 0.3);
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
