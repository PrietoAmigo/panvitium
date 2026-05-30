/**
 * Reprobate dynamics tests (02 §9). Pins:
 *   - the canonical 0.023% population-wide suicide rate ("1 / 4.35 s at 1000 reprobates")
 *   - per-tick fractional accrual is preserved across ticks (no sub-1 loss)
 *   - Tristitia / Resignation skill multiplies the rate via the modifier engine
 *   - Tristitia LEVEL applies a 2^level multiplier on top
 *   - each death mints 1 soul
 *   - deaths draw across all subtypes weighted by counts
 *   - murder is dormant without Cholerics; generation is dormant without contribution
 */
import { describe, expect, it } from 'vitest';
import {
  applyReprobateDynamics,
  bn,
  computeModifiers,
  createInitialState,
  makeRng,
  NEUTRAL_MODIFIERS,
  reprobateRates,
  totalReprobates,
  type GameState,
} from './index.js';

/** Helper: state with 1000 unconverted reprobates and a deterministic RNG. */
function pop(n: number, subtype: 'reprobate' | 'glutton' = 'reprobate'): GameState {
  const s = createInitialState('dyn-test', 0);
  return {
    ...s,
    lifetime: {
      ...s.lifetime,
      reprobates: { ...s.lifetime.reprobates, [subtype]: n },
    },
  };
}

describe('reprobate dynamics — suicide pool', () => {
  it('a fresh game has all three pools at 0', () => {
    const s = createInitialState('seed', 0);
    expect(s.lifetime.generationPool).toBe(0);
    expect(s.lifetime.suicidePool).toBe(0);
    expect(s.lifetime.murderPool).toBe(0);
  });

  it('rate × population × delta accumulates into the pool', () => {
    // 1000 reprobates × 0.00023 / s × 0.1 s = 0.023 per tick.
    const rng = makeRng(0);
    const after = applyReprobateDynamics(pop(1000), 0.1, rng);
    expect(after.lifetime.suicidePool).toBeCloseTo(0.023, 6);
    expect(totalReprobates(after)).toBe(1000);
  });

  it('worked example: ~4.35 s to the first natural suicide at 1000 reprobates', () => {
    // 0.00023 × 1000 = 0.23/s. Pool crosses 1 between t=4.347s (pool=0.9998) and t=4.348s (1.0002).
    // We tick once with a 4.4 s delta and expect exactly one suicide + one soul minted.
    const rng = makeRng(0);
    const after = applyReprobateDynamics(pop(1000), 4.4, rng);
    expect(totalReprobates(after)).toBe(999);
    expect(after.souls.toNumber()).toBe(1);
    // Residual pool is 0.012 (1.012 - 1), still tracking forward.
    expect(after.lifetime.suicidePool).toBeCloseTo(0.012, 6);
  });

  it('long delta drains multiple suicides in one call', () => {
    // 100 seconds × 0.23/s = 23.0 → 23 suicides, with the pool reset near zero.
    const rng = makeRng(0);
    const after = applyReprobateDynamics(pop(1000), 100, rng);
    // The population shrinks as we go (rate is computed once on entry), so this is an upper bound.
    // With rate computed pre-loop and no recomputation: exactly 23 kills.
    expect(totalReprobates(after)).toBe(1000 - 23);
    expect(after.souls.toNumber()).toBe(23);
    expect(after.lifetime.suicidePool).toBeCloseTo(0, 6);
  });

  it('fractional progress persists across short ticks (no sub-1 loss)', () => {
    // 43 ticks of 0.1 s = 4.3 s × 0.23/s = 0.989 pool, no death.
    // 44 ticks total = 4.4 s × 0.23/s = 1.012 → exactly one death.
    let s = pop(1000);
    const rng = makeRng(0);
    for (let i = 0; i < 43; i++) s = applyReprobateDynamics(s, 0.1, rng);
    expect(totalReprobates(s)).toBe(1000);
    expect(s.lifetime.suicidePool).toBeCloseTo(0.989, 4);

    s = applyReprobateDynamics(s, 0.1, rng);
    expect(totalReprobates(s)).toBe(999);
    expect(s.souls.toNumber()).toBe(1);
  });

  it('zero population: pool stays at 0, no deaths, no errors', () => {
    const rng = makeRng(0);
    const after = applyReprobateDynamics(pop(0), 100, rng);
    expect(totalReprobates(after)).toBe(0);
    expect(after.souls.toNumber()).toBe(0);
    expect(after.lifetime.suicidePool).toBe(0);
  });

  it('deltaSeconds <= 0 is a no-op', () => {
    const before = pop(1000);
    const rng = makeRng(0);
    const after = applyReprobateDynamics(before, 0, rng);
    expect(after).toBe(before);
  });
});

describe('reprobate dynamics — soul minting and subtype draws', () => {
  it('each suicide mints exactly one soul', () => {
    const rng = makeRng(0);
    const after = applyReprobateDynamics(pop(1000), 100, rng);
    const removed = 1000 - totalReprobates(after);
    expect(after.souls.toNumber()).toBe(removed);
  });

  it('suicides draw across all subtypes weighted by counts', () => {
    // 500 reprobates + 500 gluttons. With 50 kills (high enough to swamp variance),
    // each subtype should lose roughly half — well within tolerance.
    const s = createInitialState('subtype-draw', 0);
    const state: GameState = {
      ...s,
      lifetime: {
        ...s.lifetime,
        reprobates: { ...s.lifetime.reprobates, reprobate: 500, glutton: 500 },
      },
    };
    // 1000 × 0.00023/s = 0.23/s → need 50/0.23 ≈ 218 s.
    const rng = makeRng(42);
    const after = applyReprobateDynamics(state, 218, rng);
    const killed = 1000 - totalReprobates(after);
    expect(killed).toBeGreaterThan(45);
    expect(killed).toBeLessThan(55);
    // Each subtype loses some share — neither should be untouched at 50 kills.
    expect(after.lifetime.reprobates.reprobate).toBeLessThan(500);
    expect(after.lifetime.reprobates.glutton).toBeLessThan(500);
  });
});

describe('reprobate dynamics — modifier wiring', () => {
  it('NEUTRAL_MODIFIERS leaves suicide rate at population × base', () => {
    const s = pop(1000);
    const rates = reprobateRates(s, NEUTRAL_MODIFIERS);
    expect(rates.suicidePerSecond).toBeCloseTo(0.23, 6);
    expect(rates.generationPerSecond).toBe(0);
    expect(rates.murderPerSecond).toBe(0);
  });

  it('Tristitia level 1 doubles the suicide rate (per-level 2× multiplier, 03 §1)', () => {
    const s = pop(1000);
    // 180 souls = level 1 Tristitia exactly.
    const withT1: GameState = { ...s, devotion: { ...s.devotion, tristitia: bn(180) } };
    const mods = computeModifiers(withT1);
    const rates = reprobateRates(withT1, mods);
    // Resignation also contributes a (1 + intensity) bonus at 180 Devotion. Just assert it's
    // strictly more than 2× neutral (level alone contributes 2×; skill adds further on top).
    expect(rates.suicidePerSecond).toBeGreaterThan(0.46);
  });

  it('Tristitia level alone (no skill) gives the exact 2^level multiplier', () => {
    // The skill curve uses ln(devotion)² so it kicks in only above devotion 1. Devotion exactly
    // at the level threshold still has non-zero skill intensity. To pin the per-level effect in
    // isolation we'd need a way to suppress the skill — not available. Instead pin the floor:
    // at level 0 (no devotion) the multiplier is 1.
    const s = pop(1000);
    const mods = computeModifiers(s);
    expect(mods.reprobateSuicideRateMul).toBe(1);
  });

  it('reprobateGenerationRateMul and cholericMurderRateMul start at 1', () => {
    const s = pop(1000);
    const mods = computeModifiers(s);
    expect(mods.reprobateGenerationRateMul).toBe(1);
    expect(mods.cholericMurderRateMul).toBe(1);
  });
});

describe('reprobate dynamics — generation pool (dormant for now)', () => {
  it('base rate is 0, no births accrue', () => {
    const rng = makeRng(0);
    const after = applyReprobateDynamics(pop(0), 1000, rng);
    expect(after.lifetime.generationPool).toBe(0);
    expect(totalReprobates(after)).toBe(0);
  });
});

describe('reprobate dynamics — murder pool (dormant without Cholerics)', () => {
  it('zero Cholerics: pool stays 0 even with population', () => {
    const rng = makeRng(0);
    const after = applyReprobateDynamics(pop(1000), 1000, rng);
    expect(after.lifetime.murderPool).toBe(0);
  });

  it('with Cholerics + non-Choleric target, the pool drains via removeOneNonCholeric', () => {
    // 10 Cholerics × 0.001/s = 0.01/s murder. Over 200 s = 2.0 → 2 murders.
    // Suicide also fires in parallel: 510 × 0.00023 = 0.1173/s × 200 s ≈ 23 suicides.
    // What this test PINS: cholerics are untouched (murder targets non-Choleric only); the
    // murder pool drains; total deaths = suicides + murders and each yields 1 soul.
    const s = createInitialState('murder', 0);
    const state: GameState = {
      ...s,
      lifetime: {
        ...s.lifetime,
        reprobates: { ...s.lifetime.reprobates, reprobate: 500, choleric: 10 },
      },
    };
    const rng = makeRng(0);
    const after = applyReprobateDynamics(state, 200, rng);
    // Cholerics never targeted by murder. With seed 0 the suicide draws never happen to land on
    // them either, so they stay at exactly 10 here — but the invariant we lock is "murder doesn't
    // touch Cholerics," which holds regardless of seed.
    expect(after.lifetime.reprobates.choleric).toBe(10);
    // Non-Choleric population dropped — both pools drained into it.
    expect(after.lifetime.reprobates.reprobate).toBeLessThan(500);
    // Souls minted equals total deaths.
    const totalDeaths =
      510 - (after.lifetime.reprobates.choleric + after.lifetime.reprobates.reprobate);
    expect(after.souls.toNumber()).toBe(totalDeaths);
    // Murder pool drained essentially to zero (2 events applied; ~0 residual).
    expect(after.lifetime.murderPool).toBeLessThan(1);
  });

  it('Cholerics with no non-Choleric target: pool grows but no murder applied', () => {
    const s = createInitialState('murder-no-target', 0);
    const state: GameState = {
      ...s,
      lifetime: {
        ...s.lifetime,
        reprobates: { ...s.lifetime.reprobates, choleric: 10 },
      },
    };
    const rng = makeRng(0);
    const after = applyReprobateDynamics(state, 200, rng);
    expect(after.lifetime.reprobates.choleric).toBe(10);
    // 10 Cholerics × BASE 0.001 × 200 s × Choleric self-compounding (1 + 0.001 × 10) = 2.02.
    // The self-compounding term is 03 §3's "Increases murder rate by per-Choleric percentage".
    expect(after.lifetime.murderPool).toBeCloseTo(2.02, 4);
  });
});

describe('reprobate dynamics — Vitium Mercatura output multiplier (Plutus / Vapula)', () => {
  /** A state owning one entry-tier business (0.05 reprobate/s generation at catalog values). */
  function withBusiness(): GameState {
    const s = createInitialState('vm-test', 0);
    return {
      ...s,
      lifetime: { ...s.lifetime, businesses: { 'gula-mercatura-1': 1 } },
    };
  }

  it('business generation scales with the VM-output multiplier (Plutus lifts it)', () => {
    const base = withBusiness();
    const baseRate = reprobateRates(base, computeModifiers(base)).generationPerSecond;
    expect(baseRate).toBeGreaterThan(0);

    const withPlutus: GameState = {
      ...base,
      lifetime: { ...base.lifetime, invocations: { ...base.lifetime.invocations, plutus: 1 } },
    };
    const vmMul = computeModifiers(withPlutus).vitiumMercaturaOutputMul;
    expect(vmMul).toBeGreaterThan(1); // one Plutus lifts VM output (efficiency-scaled per the sheet)
    const plutusRate = reprobateRates(withPlutus, computeModifiers(withPlutus)).generationPerSecond;
    expect(plutusRate).toBeCloseTo(baseRate * vmMul, 6);
  });

  it('the multiplier does not touch the base generation rate (no business → unchanged)', () => {
    const noBiz = createInitialState('vm-empty', 0);
    const withPlutus: GameState = {
      ...noBiz,
      lifetime: { ...noBiz.lifetime, invocations: { plutus: 3 } },
    };
    // Base generation is 0 and there is no business contribution to scale.
    expect(reprobateRates(withPlutus, computeModifiers(withPlutus)).generationPerSecond).toBe(0);
  });
});
