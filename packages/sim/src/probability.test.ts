import { describe, it, expect } from 'vitest';
import { hashSeed, makeRng } from './rng.js';
import {
  TIERS,
  type Tier,
  type TierWeights,
  applyTierModifiers,
  normalizeTierWeights,
  resolveTier,
} from './probability.js';

function weights(partial: Partial<TierWeights>): TierWeights {
  const base: TierWeights = {
    stellar: 0,
    excellent: 0,
    good: 0,
    neutral: 0,
    bad: 0,
    terrible: 0,
    apocalyptic: 0,
  };
  return { ...base, ...partial };
}

function sum(w: TierWeights): number {
  return TIERS.reduce((acc, t) => acc + w[t], 0);
}

describe('normalizeTierWeights', () => {
  it('scales arbitrary weights to sum to 1', () => {
    const norm = normalizeTierWeights(weights({ good: 3, neutral: 1 }));
    expect(sum(norm)).toBeCloseTo(1, 10);
    expect(norm.good).toBeCloseTo(0.75, 10);
    expect(norm.neutral).toBeCloseTo(0.25, 10);
  });

  it('falls back to all-neutral when the total is zero', () => {
    const norm = normalizeTierWeights(weights({}));
    expect(norm.neutral).toBe(1);
    expect(sum(norm)).toBe(1);
  });
});

describe('applyTierModifiers', () => {
  it('multiplies per tier, treats missing as 1 and zero as a hard zero', () => {
    const base = weights({ good: 0.5, neutral: 0.4, terrible: 0.1 });
    const out = applyTierModifiers(base, { good: 2, terrible: 0 });
    expect(out.good).toBeCloseTo(1.0, 10); // doubled
    expect(out.neutral).toBeCloseTo(0.4, 10); // unchanged
    expect(out.terrible).toBe(0); // zeroed
  });

  it('ignores negative or non-finite modifiers (treats them as 1)', () => {
    const base = weights({ good: 0.5 });
    expect(applyTierModifiers(base, { good: -3 }).good).toBeCloseTo(0.5, 10);
    expect(applyTierModifiers(base, { good: Number.NaN }).good).toBeCloseTo(0.5, 10);
  });
});

describe('resolveTier', () => {
  it('is deterministic for a given RNG state', () => {
    const w = weights({ good: 0.6, neutral: 0.4 });
    const a = resolveTier(w, makeRng(hashSeed('same')));
    const b = resolveTier(w, makeRng(hashSeed('same')));
    expect(a).toBe(b);
  });

  it('never returns a zero-weight tier', () => {
    const w = weights({ good: 0.7, neutral: 0.3 }); // apocalyptic et al. are 0
    const rng = makeRng(hashSeed('zero-weight'));
    for (let i = 0; i < 5000; i++) {
      const tier = resolveTier(w, rng);
      expect(tier === 'good' || tier === 'neutral').toBe(true);
    }
  });

  it('approximates the normalized distribution over many draws', () => {
    const w = weights({ stellar: 1, good: 6, neutral: 3 }); // → 0.1 / 0.6 / 0.3
    const rng = makeRng(hashSeed('distribution'));
    const counts: Record<Tier, number> = weights({}) as Record<Tier, number>;
    const N = 20000;
    for (let i = 0; i < N; i++) counts[resolveTier(w, rng)] += 1;
    expect(counts.stellar / N).toBeCloseTo(0.1, 1);
    expect(counts.good / N).toBeCloseTo(0.6, 1);
    expect(counts.neutral / N).toBeCloseTo(0.3, 1);
  });
});
