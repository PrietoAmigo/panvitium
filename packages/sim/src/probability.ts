/**
 * The seven-tier probability outcome system (02 §2). Tiers run best→worst for the player. An action
 * declares base weights; Sin levels, sigils, and invocations contribute MULTIPLICATIVE modifiers per
 * tier; the weighted distribution is renormalized to sum 1.0 (never negative, never >1), then a tier
 * is drawn from the seeded RNG (ADR-011). This is the engine — the per-action base weights and which
 * modifiers apply live in the economy spreadsheet and arrive with each Opera action.
 */
import { type Rng } from './rng.js';

export const TIERS = [
  'stellar',
  'excellent',
  'good',
  'neutral',
  'bad',
  'terrible',
  'apocalyptic',
] as const;

export type Tier = (typeof TIERS)[number];

/** A weight (pre-normalization) or probability (post-normalization) per tier. */
export type TierWeights = Record<Tier, number>;

/** Per-tier multiplicative modifiers; a missing or invalid entry means 1 (no change). */
export type TierModifiers = Partial<Record<Tier, number>>;

function zeroTierRecord(): TierWeights {
  return { stellar: 0, excellent: 0, good: 0, neutral: 0, bad: 0, terrible: 0, apocalyptic: 0 };
}

/**
 * Apply multiplicative modifiers to base weights. Each tier's base is multiplied by its modifier
 * (default 1); a modifier of 0 zeroes the tier. Negative or non-finite modifiers are ignored
 * (treated as 1) so a bad input can't drive a weight negative.
 */
export function applyTierModifiers(base: TierWeights, modifiers: TierModifiers): TierWeights {
  const out = zeroTierRecord();
  for (const tier of TIERS) {
    const m = modifiers[tier];
    const factor = typeof m === 'number' && Number.isFinite(m) && m >= 0 ? m : 1;
    out[tier] = Math.max(0, base[tier]) * factor;
  }
  return out;
}

/** Renormalize weights so they sum to 1.0. A zero (or all-negative) total falls back to all-neutral. */
export function normalizeTierWeights(weights: TierWeights): TierWeights {
  let total = 0;
  for (const tier of TIERS) total += Math.max(0, weights[tier]);
  if (total <= 0) {
    const fallback = zeroTierRecord();
    fallback.neutral = 1;
    return fallback;
  }
  const out = zeroTierRecord();
  for (const tier of TIERS) out[tier] = Math.max(0, weights[tier]) / total;
  return out;
}

/**
 * Draw a tier from (possibly unnormalized) weights using the seeded RNG. Weights are normalized
 * internally; floating-point remainder at the tail falls back to the last positive-weight tier, so
 * a zero-weight tier is never returned.
 */
export function resolveTier(weights: TierWeights, rng: Rng): Tier {
  const norm = normalizeTierWeights(weights);
  const roll = rng.float();
  let cumulative = 0;
  let lastPositive: Tier = 'neutral';
  for (const tier of TIERS) {
    if (norm[tier] > 0) lastPositive = tier;
    cumulative += norm[tier];
    if (roll < cumulative) return tier;
  }
  return lastPositive;
}
