/**
 * Syngraphae TUNING DATA (Depraedatio gold rework spec §4.3) — the twelve promissory notes signed
 * with the Hoarder Below, in three linear branches of four. Catalog data only (ids, names, branch
 * order, Avaritia gates, burned-gold costs, effect magnitudes); the behaviour lives in
 * `syngraphae.ts` and the modifier folds in `computeModifiers` (ADR-022). Costs and magnitudes are
 * spec placeholders pending the sheet's Faeneratio block; the sheet wins once settled.
 */
import { type SyngraphaDef } from './syngraphae.js';

export const SYNGRAPHAE: readonly SyngraphaDef[] = [
  // ── Usura branch (the yield) ──
  {
    id: 'usura-1',
    branch: 'usura',
    gate: 0,
    cost: 500,
    effect: { kind: 'fenusRateMul', mul: 1.5 },
  },
  {
    id: 'usura-2',
    branch: 'usura',
    gate: 1,
    cost: 5_000,
    effect: { kind: 'fenusRateMul', mul: 1.5 },
  },
  {
    id: 'usura-3',
    branch: 'usura',
    gate: 2,
    cost: 50_000,
    effect: { kind: 'fenusRateMul', mul: 2 },
  },
  {
    id: 'usura-4',
    name: 'Anatocismus',
    branch: 'usura',
    gate: 3,
    cost: 500_000,
    // Interest upon interest, by contract: half of each interest payment auto-deposits into the
    // hoard instead of paying out. Mechanism in tick.ts (the split is applied AFTER all multipliers).
    effect: { kind: 'anatocismus' },
  },

  // ── Faeneratio branch (the loan book) ──
  {
    id: 'faeneratio-1',
    branch: 'faeneratio',
    gate: 0,
    cost: 500,
    effect: { kind: 'mutuumPerCapitaMul', mul: 1.5 },
  },
  {
    id: 'faeneratio-2',
    name: 'Escheat',
    branch: 'faeneratio',
    gate: 1,
    cost: 5_000,
    // Death duties: the estates of the dead escheat to creditors unseen. Minted at the dynamics
    // step from the applied murders/suicides (the additive bundle fields compose with any future
    // murder-gold source on the same line).
    effect: { kind: 'escheat', goldPerMurder: 1, goldPerSuicide: 0.5 },
  },
  {
    id: 'faeneratio-3',
    branch: 'faeneratio',
    gate: 2,
    cost: 50_000,
    effect: { kind: 'mutuumPerCapitaMul', mul: 2 },
  },
  {
    id: 'faeneratio-4',
    branch: 'faeneratio',
    gate: 3,
    cost: 500_000,
    // The Katabasis hoard liquidation pays ×1.25 (katabasis.ts, at the enter-teardown).
    effect: { kind: 'liquidationMul', mul: 1.25 },
  },

  // ── Custodia branch (retention) ──
  {
    id: 'custodia-1',
    branch: 'custodia',
    gate: 0,
    cost: 500,
    // Base recovery 0.25 becomes 0.4.
    effect: { kind: 'thesaurusRecoveryMul', mul: 1.6 },
  },
  {
    id: 'custodia-2',
    branch: 'custodia',
    gate: 1,
    cost: 5_000,
    // Hoard milestones: +2% goldRateMul per decade of hoard at or above 1,000
    // (floor(log10(hoard/1000)) + 1 steps), capped at +20%. Folded into goldRateMul directly by
    // computeModifiers (a derived multiplier like any other — never persisted).
    effect: { kind: 'hoardMilestones', threshold: 1_000, bonusPerDecade: 0.02, cap: 0.2 },
  },
  {
    id: 'custodia-3',
    branch: 'custodia',
    gate: 2,
    cost: 50_000,
    // Stacks with custodia-1 to 0.6.
    effect: { kind: 'thesaurusRecoveryMul', mul: 1.5 },
  },
  {
    id: 'custodia-4',
    name: 'Peculium',
    branch: 'custodia',
    gate: 3,
    cost: 500_000,
    // At commitKatabasis the kept-gold result is floored at 10% of the hoard's value at descent —
    // a guaranteed remnant beneath the Avaritia roll (Erinyes still wins; katabasis.ts).
    effect: { kind: 'peculium', floorFraction: 0.1 },
  },
] as const;
