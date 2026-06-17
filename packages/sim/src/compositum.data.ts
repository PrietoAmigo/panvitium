/**
 * Vitium Compositum TUNING DATA (03 §2.3) — the ceremony catalog (`COMPOSITA`): per-second costs,
 * incomes, rate boosts, percentage semantics, and the Panvitium ramp. Separated from the toggle
 * engine in `compositum.ts` so the economy knobs live in one editable place. Pure data; types and
 * behaviour stay in `compositum.ts`.
 */
import { PANVITIUM_RATE_BASE } from './constants.js';
import { type CompositumDef } from './compositum.js';

/** The wired subset of the Vitium Compositum catalog (03 §2.3). Keyed by id. */
export const COMPOSITA: Readonly<Record<string, CompositumDef>> = {
  bacchanal: {
    id: 'bacchanal',
    sins: ['gula', 'luxuria'],
    minLevel: 1,
    costPerSecond: { gold: 100, influence: 10 },
    // Sheet rev 2026-06-12: +10% to the online reprobate generation rate while active.
    generationRateBoost: 0.1,
  },
  charity: {
    id: 'charity',
    sins: ['avaritia', 'vanagloria'],
    minLevel: 1,
    // Sheet rev 2026-06-12: 100 gold + 25 influence per second buys 200 gold per second back —
    // an influence-to-gold pump with a thin margin.
    costPerSecond: { gold: 100, influence: 25 },
    goldPerSecond: 200,
  },
  gala: {
    id: 'gala',
    sins: ['superbia', 'vanagloria'],
    minLevel: 1,
    costPerSecond: { gold: 250 },
    influencePerSecond: 20,
    // Conversion effect removed with subtypes; kept as an influence-income toggle pending Slice 3.
  },
  // Sheet rev 2026-06-12: the four subtype-era pairs (Loan Shark Op, Outrage Cycle, No-babies
  // Movement, Ethnocentric Revolt) are RETIRED — the canonical roster is nine (ADR-027).
  // `advanceToggles` drops their ids from old saves gracefully (unknown-id path).
  'doom-gathering': {
    id: 'doom-gathering',
    sins: ['tristitia', 'acedia'],
    minLevel: 1,
    costPerSecond: { gold: 100, influence: 10 },
    // Sheet rev 2026-06-12: +10% to the suicide rate while active.
    suicideRateBoost: 0.1,
  },
  'enraging-broadcast': {
    id: 'enraging-broadcast',
    sins: ['ira', 'tristitia'],
    minLevel: 1,
    costPerSecond: { influence: 25 },
    // Sheet rev 2026-06-12: +10% to the murder rate while active.
    murderRateBoost: 0.1,
  },
  'dolce-far-niente': {
    id: 'dolce-far-niente',
    sins: ['gula', 'acedia'],
    minLevel: 1,
    costPerSecond: {},
    // Sheet: "the conversion rate instead applies to offline gain rate" — +1% offline gain while active.
    offlineGainBoost: 0.01,
  },
  vegas: {
    id: 'vegas',
    sins: ['luxuria', 'avaritia', 'gula', 'acedia'],
    minLevel: 2,
    costPerSecond: {},
    // Sheet rev 2026-06-12: the casino converts wealth into renown — pays 50% of the current
    // gold income (in gold) and yields 1% of that income as influence per second.
    percentCost: { base: 'goldGain', fraction: 0.5 },
    percentOutput: { base: 'goldGain', resource: 'influence', fraction: 0.01 },
  },
  crusade: {
    id: 'crusade',
    sins: ['superbia', 'ira', 'vanagloria', 'tristitia'],
    minLevel: 2,
    costPerSecond: {},
    // Sheet rev 2026-06-12: the holy war converts renown into plunder — pays 50% of the current
    // influence income (in influence) and yields 1000% (×10) of that income as gold per second.
    percentCost: { base: 'influenceGain', fraction: 0.5 },
    percentOutput: { base: 'influenceGain', resource: 'gold', fraction: 10 },
  },
  // The endgame ritual (03 §2.3). Gated on ALL eight Sins at level 3. Cannot be turned off by
  // hand; its cost ramps exponentially with active duration so it can't become a steady state —
  // "flipped on for a glorious, expensive minute or two." With conversion removed, R(t) = 0.01·eᵗ
  // still drives the soul harvest (∝ current souls, in the tick) and a flat generation increase
  // (in dynamics); suicide/murder are amplified via the modifier bundle (see modifiers.ts).
  panvitium: {
    id: 'panvitium',
    sins: ['gula', 'luxuria', 'avaritia', 'tristitia', 'ira', 'acedia', 'vanagloria', 'superbia'],
    minLevel: 3,
    // Sheet: gold 10×(Base VC gold cost 100)=1000, influence 10×(Base VC influence cost 10)=100,
    // each × eᵗ; rate base 1×(Base VC rate 0.01)=0.01 × eᵗ. t = seconds active.
    costPerSecond: { gold: 1000, influence: 100 },
    panvitiumRateBase: PANVITIUM_RATE_BASE,
    manualDeactivateForbidden: true,
    costGrowthPerSecond: Math.E,
  },
} as const;
