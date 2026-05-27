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
import { floor, gte, sub } from './bignum.js';
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
import { type GameState, type ReprobateSubtype, type Sin, SINS, totalReprobates } from './state.js';
import { type OutcomeEvent } from './events.js';

export interface ActionCost {
  readonly gold?: number;
  readonly influence?: number;
}

export interface ActionDef {
  readonly id: string;
  readonly category: 'suasio' | 'decimatio';
  readonly baseTimeSeconds: number;
  readonly cost: ActionCost;
  readonly weights: TierWeights;
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

/** The actions implemented so far. Numbers are from the economy spreadsheet (Suasio / Decimatio). */
export const ACTIONS: Record<string, ActionDef> = {
  suggestion: {
    id: 'suggestion',
    category: 'suasio',
    baseTimeSeconds: 10,
    cost: { influence: 5 },
    weights: SUGGESTION_WEIGHTS,
  },
  caedis: {
    id: 'caedis',
    category: 'decimatio',
    baseTimeSeconds: 10,
    cost: { gold: 100 },
    weights: CAEDIS_WEIGHTS,
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

/**
 * Pay an action's cost and queue it. Affordability compares the FLOORED resource (resources are
 * natural numbers; the bignum gotcha). Efficiency scales the cost (ceil so a fractional cost rounds
 * up). Time is not affected by efficiency for these actions.
 */
export function startAction(state: GameState, actionId: string, efficiency?: number): StartResult {
  const def = ACTIONS[actionId];
  if (!def) return { ok: false, reason: `unknown action: ${actionId}` };

  // One player-driven action at a time (02 §3). Every action in the queue is a single timed
  // action; toggles and delegated (acolyte/invocation) work are separate channels. So a non-empty
  // queue means a rite is already underway and a new one cannot be started by the player.
  if (state.lifetime.actionQueue.length > 0) {
    return { ok: false, reason: 'A rite is already underway.' };
  }

  // Efficiency = player (Gula) × category (Leviathan for Suasio, Satan for Decimatio).
  const eff = efficiency ?? categoryEfficiency(state, def.category);
  const goldCost = Math.ceil((def.cost.gold ?? 0) * eff);
  const influenceCost = Math.ceil((def.cost.influence ?? 0) * eff);
  if (!gte(floor(state.lifetime.gold), goldCost)) return { ok: false, reason: 'not enough gold' };
  if (!gte(floor(state.lifetime.influence), influenceCost)) {
    return { ok: false, reason: 'not enough influence' };
  }

  const lifetime = {
    ...state.lifetime,
    gold: sub(state.lifetime.gold, goldCost),
    influence: sub(state.lifetime.influence, influenceCost),
    actionQueue: [
      ...state.lifetime.actionQueue,
      { actionId: def.id, remainingSeconds: def.baseTimeSeconds },
    ],
  };
  return { ok: true, state: { ...state, lifetime } };
}

/** Draw the outcome tier for a completed action, apply its effect, and report what happened. */
export function resolveAction(
  state: GameState,
  actionId: string,
  rng: Rng,
  efficiency?: number,
): { state: GameState; event: OutcomeEvent | null } {
  const def = ACTIONS[actionId];
  if (!def) return { state, event: null };
  // One pass over the modifier engine: per-tier weight muls (Insatiability damps Terrible/
  // Apocalyptic, Morning Star lifts Stellar) AND per-action eff (player × category) come from the
  // same `Modifiers` bundle. resolveTier renormalizes internally.
  const mods = computeModifiers(state);
  const eff =
    efficiency ??
    mods.playerEfficiencyMul *
      (def.category === 'suasio' ? mods.suasioEfficiencyMul : mods.decimatioEfficiencyMul);
  const tier = resolveTier(applyTierModifiers(def.weights, mods.tierWeightMul), rng);
  const next =
    def.id === 'suggestion'
      ? resolveSuggestion(state, tier, rng, eff)
      : def.id === 'caedis'
        ? resolveCaedis(state, tier, rng, eff)
        : state;
  // `.toNumber()` of a zero BigNum can yield -0; normalize so consumers compare and render cleanly.
  const norm = (n: number): number => (n === 0 ? 0 : n);
  const event: OutcomeEvent = {
    actionId: def.id,
    tier,
    soulsDelta: norm(sub(floor(next.souls), floor(state.souls)).toNumber()),
    reprobateDelta: totalReprobates(next) - totalReprobates(state),
    goldDelta: norm(sub(floor(next.lifetime.gold), floor(state.lifetime.gold)).toNumber()),
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
