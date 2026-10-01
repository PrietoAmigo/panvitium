/**
 * Opera action TUNING DATA (02 §3, 03 §2) — the per-action numbers and tier-weight distributions,
 * separated from the engine in `actions.ts` so the economy knobs live in one editable place. Pure
 * data: types and behaviour stay in `actions.ts`. Numbers are from the economy spreadsheet (Suasio /
 * Indagatio / Emptio); the inline notes record each sheet reconciliation. (The Decimatio culling
 * rites, Caedes / Pogrom / Purgatio, are retired: ADR-038.)
 */
import { type TierWeights } from './probability.js';
import { type ActionDef } from './actions.js';

// Suggestion (player tuning): Good raised to 0.5 and Neutral cut to 0.15 so the entry rite lands a
// gain far more often; Terrible trimmed to 0.049 to keep the column summing to 1.
const SUGGESTION_WEIGHTS: TierWeights = {
  stellar: 0.001,
  excellent: 0.099,
  good: 0.5,
  neutral: 0.15,
  bad: 0.2,
  terrible: 0.049,
  apocalyptic: 0.001,
};

// Logismoi (Suasio sheet, retuned by player request): mid-game reprobate/soul source, richer than
// Suggestion. Neutral removed (0) so the rite almost always moves the flock; the tails (Terrible,
// Apocalyptic) are fattened to offset the heavier Excellent/Good mass. Column still sums to 1.
const LOGISMOI_WEIGHTS: TierWeights = {
  stellar: 0.01,
  excellent: 0.24,
  good: 0.4,
  neutral: 0,
  bad: 0.1,
  terrible: 0.24,
  apocalyptic: 0.01,
};

// Imperium (Suasio sheet, retuned by player request): the late rite's full distribution, reweighted
// toward a dominant Good (0.45) with Neutral removed (0) so a cast almost always swells the flock;
// the tails stay live. Column sums to 1.
const IMPERIUM_WEIGHTS: TierWeights = {
  stellar: 0.05,
  excellent: 0.15,
  good: 0.45,
  neutral: 0,
  bad: 0.15,
  terrible: 0.15,
  apocalyptic: 0.05,
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
 * The actions implemented so far. Numbers are from the economy spreadsheet (Suasio / Indagatio /
 * Emptio). Indagatio is 150 s baseline (player tuning: half the sheet's 300 s, rev
 * 2026-06-12) and Emptio is 120 s (player tuning: double the former 60 s); both efficiency-mode
 * `time`, so player efficiency divides the duration.
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
    delegateUnlock: 1, // auto/delegate unlocks at max Sin level I
  },
  logismoi: {
    id: 'logismoi',
    category: 'suasio',
    baseTimeSeconds: 5,
    cost: { influence: 25 },
    weights: LOGISMOI_WEIGHTS,
    efficiencyMode: 'cost-outcome',
    unlock: 1, // 2nd Suasio rite opens at max Sin level I (player tuning; was Luxuria II)
    delegateUnlock: 2, // auto/delegate at max Sin level II (player tuning; was Luxuria III)
  },
  imperium: {
    id: 'imperium',
    // Action time decided at 10s (the Suasio sheet left it "Fill Time"); cost/effect/gating are
    // from the sheet. A full-distribution late rite (Stellar pays +3% souls, the tails shed the
    // flock) — a short cast for its big influence price.
    baseTimeSeconds: 10,
    category: 'suasio',
    cost: { influence: 40 }, // sheet 100; cut 2.5× (player tuning request)
    weights: IMPERIUM_WEIGHTS,
    efficiencyMode: 'cost-outcome',
    unlock: 3, // opens at max Sin level III
    delegateUnlock: 4, // auto/delegate at max Sin level IV
  },
  indagatio: {
    id: 'indagatio',
    category: 'indagatio',
    baseTimeSeconds: 150, // player tuning: halved from the sheet's 300 s
    cost: {},
    weights: INDAGATIO_WEIGHTS,
    efficiencyMode: 'time',
  },
  emptio: {
    id: 'emptio',
    category: 'emptio',
    baseTimeSeconds: 120, // player tuning: doubled from 60 s
    cost: {}, // per-target — startEmptio reads the maleficium's cost dynamically.
    weights: EMPTIO_WEIGHTS,
    efficiencyMode: 'time',
  },
};
