/**
 * Opera action TUNING DATA (02 §3, 03 §2) — the per-action numbers and tier-weight distributions,
 * separated from the engine in `actions.ts` so the economy knobs live in one editable place. Pure
 * data: types and behaviour stay in `actions.ts`. Numbers are from the economy spreadsheet (Suasio /
 * Decimatio / Indagatio / Emptio); the inline notes record each sheet reconciliation.
 */
import { type TierWeights } from './probability.js';
import { type ActionDef } from './actions.js';

const SUGGESTION_WEIGHTS: TierWeights = {
  stellar: 0.001,
  excellent: 0.099,
  good: 0.25,
  neutral: 0.35,
  bad: 0.2,
  terrible: 0.099,
  apocalyptic: 0.001,
};

/** Logismoi (Suasio sheet): mid-game reprobate/soul source; richer than Suggestion. */
const LOGISMOI_WEIGHTS: TierWeights = {
  stellar: 0.01,
  excellent: 0.15,
  good: 0.3,
  neutral: 0.3,
  bad: 0.17,
  terrible: 0.069,
  apocalyptic: 0.001,
};

/** Imperium (Suasio sheet rev 2026-06-12): a full distribution — the "player in control" fixed
 * outcome is retired; the late rite now risks real failure and pays in souls at Stellar. */
const IMPERIUM_WEIGHTS: TierWeights = {
  stellar: 0.035,
  excellent: 0.18,
  good: 0.21,
  neutral: 0.235,
  bad: 0.15,
  terrible: 0.155,
  apocalyptic: 0.035,
};

const CAEDES_WEIGHTS: TierWeights = {
  stellar: 0.01,
  excellent: 0.05,
  good: 0.66,
  neutral: 0.15,
  bad: 0.1,
  terrible: 0.02,
  apocalyptic: 0.01,
};

/** Pogrom (Decimatio sheet rev 2026-06-12): a riskier mass cull with fatter tails. */
const POGROM_WEIGHTS: TierWeights = {
  stellar: 0.015,
  excellent: 0.06,
  good: 0.6,
  neutral: 0.15,
  bad: 0.1,
  terrible: 0.06,
  apocalyptic: 0.015,
};

/** Purgatio (Decimatio sheet rev 2026-06-12): soul farming with heavy, gold-eating tails. */
const PURGATIO_WEIGHTS: TierWeights = {
  stellar: 0.025,
  excellent: 0.1,
  good: 0.3,
  neutral: 0.3,
  bad: 0.15,
  terrible: 0.1,
  apocalyptic: 0.025,
};

/** Indagatio (03 §2.5): mostly Good/Neutral; Stellar surfaces a profane+, Excellent a rare. */
const INDAGATIO_WEIGHTS: TierWeights = {
  stellar: 0.001,
  excellent: 0.049,
  good: 0.25,
  neutral: 0.5,
  bad: 0.15,
  terrible: 0.049,
  apocalyptic: 0.001,
};

/** Emptio (03 §2.6): biased toward success since you've already committed the gold; Good lands a
 * half-price deal, Bad merely wastes the attempt. */
const EMPTIO_WEIGHTS: TierWeights = {
  stellar: 0.01,
  excellent: 0.04,
  good: 0.1,
  neutral: 0.7,
  bad: 0.1,
  terrible: 0.049,
  apocalyptic: 0.001,
};

/**
 * The actions implemented so far. Numbers are from the economy spreadsheet (Suasio / Decimatio /
 * Indagatio / Emptio). Indagatio is 300 s baseline (sheet rev 2026-06-12) and
 * Emptio is 60 s — both efficiency-mode `time`, so player efficiency divides the duration.
 */
export const ACTIONS: Record<string, ActionDef> = {
  suggestion: {
    id: 'suggestion',
    category: 'suasio',
    // Tuning override (player request): the entry rite is now a 1 s, 1-influence cast so the
    // opening loop reads instantly. Overrides the Suasio sheet's 5 s / 5-influence baseline.
    baseTimeSeconds: 1,
    cost: { influence: 1 },
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
    // Action time decided at 10s (the Suasio sheet left it "Fill Time"); cost/effect/gating are
    // from the sheet. A full-distribution late rite (Stellar pays +3% souls, the tails shed the
    // flock) — a short cast for its big influence price.
    baseTimeSeconds: 10,
    category: 'suasio',
    cost: { influence: 100 },
    weights: IMPERIUM_WEIGHTS,
    efficiencyMode: 'cost-outcome',
    unlock: { sin: 'luxuria', level: 3 },
    delegateUnlock: { sin: 'luxuria', level: 4 },
  },
  caedes: {
    id: 'caedes',
    category: 'decimatio',
    // Tuning override (player request): the entry cull is a 1 s cast so the opening Decimatio loop
    // reads as briskly as Suggestion. Overrides the Decimatio sheet's 10 s baseline.
    baseTimeSeconds: 1,
    cost: { gold: 100 },
    weights: CAEDES_WEIGHTS,
    efficiencyMode: 'cost-outcome',
    delegateUnlock: { sin: 'ira', level: 1 },
  },
  pogrom: {
    id: 'pogrom',
    category: 'decimatio',
    baseTimeSeconds: 60, // sheet: "~60s"
    cost: { gold: 1000 }, // sheet-pinned
    weights: POGROM_WEIGHTS,
    efficiencyMode: 'cost-outcome',
    unlock: { sin: 'ira', level: 2 },
    delegateUnlock: { sin: 'ira', level: 3 },
  },
  purgatio: {
    id: 'purgatio',
    category: 'decimatio',
    baseTimeSeconds: 360, // sheet: "~360s" (rev 2026-06-12)
    cost: { gold: 1_000_000 }, // sheet-pinned (rev 2026-06-12)
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
