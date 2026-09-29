/**
 * Syngraphae TUNING DATA — the Depraedatio account's standing contracts, three per relationship
 * tier (the player chooses one per tier). Catalog data only (ids, tiers, effect magnitudes); the
 * behaviour lives in `syngraphae.ts` and the rate/charge folds in `computeModifiers` (ADR-022).
 * Display names and effect copy live in `strings.faeneratio.contractNames` / `contractEffects`.
 */
import { type SyngraphaDef } from './syngraphae.js';

export const SYNGRAPHAE: readonly SyngraphaDef[] = [
  // ── Relationship Tier I (100 gold in reserve) ──
  // Interest rate: interest rate ×1.33.
  { id: 'interest-rate', tier: 1, effect: { kind: 'fenusRateMul', mul: 1.33 } },
  // Long-term investing: interest rate +10% per hour since account inception (game time).
  { id: 'long-term', tier: 1, effect: { kind: 'fenusRatePerHour', perHour: 0.1 } },
  // Active management: 33% reduced surrender charge.
  { id: 'active-management', tier: 1, effect: { kind: 'surrenderChargeMul', mul: 0.67 } },

  // ── Relationship Tier II (10,000 gold in reserve) ──
  // Compounding: surrender charge +50%; 1% of interest is reinvested automatically.
  {
    id: 'compounding',
    tier: 2,
    effect: { kind: 'compounding', surrenderChargeMul: 1.5, reinvestFraction: 0.01 },
  },
  // Vesting: 1% of the reserve vests to cash per second as interest, free of surrender charge.
  { id: 'vesting', tier: 2, effect: { kind: 'vesting', fractionPerSecond: 0.01 } },
  // Annuity: manual surrender barred; interest rate ×1.1666.
  { id: 'annuity', tier: 2, effect: { kind: 'annuity', fenusRateMul: 1.1666 } },

  // ── Relationship Tier III (1,000,000 gold in reserve) ──
  // PI: automatic asset tracing, a free Indagatio every 2.5 minutes of game time.
  { id: 'pi', tier: 3, effect: { kind: 'assetTracing', intervalSeconds: 150 } },
  // Custody VIP: the private item safe.
  { id: 'custody-vip', tier: 3, effect: { kind: 'privateSafe' } },
  // Risk algos: the risk analytics tab.
  { id: 'risk-algos', tier: 3, effect: { kind: 'riskAnalytics' } },
] as const;
