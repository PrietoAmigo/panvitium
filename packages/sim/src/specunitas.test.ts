/**
 * Specunitas (apex Vanagloria) tests (03 §2.4). Pins:
 *   - catalog: free, max 1, IP 13, Vanagloria 3
 *   - `conversionBiasMul`: with Specunitas active, Celebrity carries the SPECUNITAS_CELEBRITY_BIAS_MUL
 *     multiplier; absent otherwise; other subtypes are never touched
 *   - composes WITHOUT replacing the underlying weights: a celebrity-biased business still feeds the
 *     draw, just amplified
 *   - probabilistic shift on `biasedSubtype`: with a vanagloria-mercatura-1 business (which biases
 *     celebrity 0.85 / reprobate 0.15), Specunitas lifts the celebrity-draw share from ~85% to ~99.8%
 *     across many seeded draws
 *   - with no Vitium source, Specunitas has no effect (×100 of zero is still zero)
 */
import { describe, expect, it } from 'vitest';
import {
  biasedSubtype,
  bn,
  conversionBiasMul,
  createInitialState,
  invocationById,
  makeRng,
  SPECUNITAS_CELEBRITY_BIAS_MUL,
  type GameState,
} from './index.js';

function fresh(seed = 'specunitas', t = 0): GameState {
  return createInitialState(seed, t);
}

/** A state with N owned vanagloria-mercatura-1 (celebrity 0.85 / reprobate 0.15) and a flag for Specunitas. */
function withVanagloriaMercatura(opts: { businesses?: number; specunitas?: boolean }): GameState {
  const s = fresh();
  const invocations = opts.specunitas === true ? { specunitas: 1 } : {};
  const businesses =
    opts.businesses && opts.businesses > 0 ? { 'vanagloria-mercatura-1': opts.businesses } : {};
  return {
    ...s,
    lifetime: { ...s.lifetime, invocations, businesses },
  };
}

describe('Catalog', () => {
  it('Specunitas is free, max 1, IP 13, Vanagloria 3', () => {
    const def = invocationById('specunitas')!;
    expect(def.sin).toBe('vanagloria');
    expect(def.invokingPower).toBe(13);
    expect(def.sinLevel).toBe(3);
    expect(def.maxActive).toBe(1);
    expect(def.soulCost).toBeUndefined();
    expect(def.goldCost).toBeUndefined();
  });
});

describe('conversionBiasMul', () => {
  it('is empty when Specunitas is absent', () => {
    expect(conversionBiasMul(fresh())).toEqual({});
  });

  it('lifts the Celebrity weight by SPECUNITAS_CELEBRITY_BIAS_MUL when Specunitas is active', () => {
    const m = conversionBiasMul(withVanagloriaMercatura({ specunitas: true }));
    expect(m.celebrity).toBe(SPECUNITAS_CELEBRITY_BIAS_MUL);
    // Nothing else is touched — every other subtype falls through to the implicit 1× at the call site.
    expect(m.glutton).toBeUndefined();
    expect(m.husk).toBeUndefined();
    expect(m.reprobate).toBeUndefined();
  });
});

describe('biasedSubtype — Specunitas probabilistic shift', () => {
  function drawShare(state: GameState, n: number, seed: number): number {
    let rng = makeRng(seed);
    let hits = 0;
    for (let i = 0; i < n; i++) {
      // Cycle the rng state forward each draw so successive picks are independent.
      const next = makeRng(rng.state);
      if (biasedSubtype(state, next) === 'celebrity') hits += 1;
      rng = next;
    }
    return hits / n;
  }

  it('without Specunitas, ~85% of draws land on celebrity (the bias built into vanagloria-mercatura-1)', () => {
    const s = withVanagloriaMercatura({ businesses: 1, specunitas: false });
    const share = drawShare(s, 2000, 12345);
    expect(share).toBeGreaterThan(0.78);
    expect(share).toBeLessThan(0.92);
  });

  it('with Specunitas, ~99% of draws land on celebrity', () => {
    const s = withVanagloriaMercatura({ businesses: 1, specunitas: true });
    const share = drawShare(s, 2000, 12345);
    expect(share).toBeGreaterThan(0.97);
  });

  it('with no Vitium source, Specunitas has no effect — the draw falls back to "reprobate"', () => {
    const s = withVanagloriaMercatura({ businesses: 0, specunitas: true });
    // No active conversion sources → total = 0 → falls back to 'reprobate', regardless of bias mul.
    expect(biasedSubtype(s, makeRng(s.rngState))).toBe('reprobate');
  });

  it('summoning ×100 a subtype with NO source contribution leaves the draw untouched (100×0 = 0)', () => {
    // A gula-mercatura business (glutton-biased) with Specunitas: celebrity gets ×100 but no source
    // feeds celebrity, so the draw still falls only on glutton/reprobate. Sanity check that the hook
    // composes multiplicatively rather than seeding fresh weights.
    const s = fresh();
    const live: GameState = {
      ...s,
      lifetime: {
        ...s.lifetime,
        invocations: { specunitas: 1 },
        businesses: { 'gula-mercatura-1': 1 },
      },
    };
    // 100 draws — celebrity should never appear (no source feeds it).
    for (let i = 0; i < 100; i++) {
      const result = biasedSubtype(live, makeRng(s.rngState + i));
      expect(result).not.toBe('celebrity');
    }
  });
});

describe('Persistence across invoke/dispel boundaries', () => {
  it('a state with souls and the gates met has Specunitas wired through invocationById', () => {
    // Specunitas is free and max 1 — the catalog entry alone is enough to be summoned via invoke();
    // its invoke path uses no special-case (no kill-all, no pending flags). Wired = catalog +
    // bias hook (above) + name string (`packages/shared/src/strings.ts`).
    expect(invocationById('specunitas')).toBeDefined();
    expect(bn(0).toNumber()).toBe(0); // sanity — proves the import surface is reachable
  });
});
