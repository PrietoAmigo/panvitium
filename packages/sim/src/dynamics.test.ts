/**
 * Reprobate dynamics tests (02 §9). Pins:
 *   - the canonical 0.01%/s population-wide suicide rate ("1 / 10 s at 1000 reprobates")
 *   - per-tick fractional accrual is preserved across ticks (no sub-1 loss)
 *   - Tristitia / Resignation skill multiplies the rate via the modifier engine
 *   - Tristitia LEVEL applies a 2^level multiplier on top
 *   - each death mints 1 soul
 *   - murder is a per-capita cull of the whole pool (subtypes removed)
 *   - generation is dormant without contribution
 */
import { describe, expect, it } from 'vitest';
import {
  applyReprobateDynamics,
  bn,
  computeModifiers,
  createInitialState,
  NEUTRAL_MODIFIERS,
  reprobateRates,
  totalReprobates,
  type GameState,
} from './index.js';

/** Helper: state with `n` reprobates in the single pool. */
function pop(n: number): GameState {
  const s = createInitialState('dyn-test', 0);
  return { ...s, lifetime: { ...s.lifetime, reprobates: n } };
}

describe('reprobate dynamics — suicide pool', () => {
  it('a fresh game has all three pools at 0', () => {
    const s = createInitialState('seed', 0);
    expect(s.lifetime.generationPool).toBe(0);
    expect(s.lifetime.suicidePool).toBe(0);
    expect(s.lifetime.murderPool).toBe(0);
  });

  it('rate × population × delta accumulates into the pool', () => {
    // 1000 reprobates × 0.0001 / s × 0.1 s = 0.01 per tick.
    const after = applyReprobateDynamics(pop(1000), 0.1);
    expect(after.lifetime.suicidePool).toBeCloseTo(0.01, 6);
    expect(totalReprobates(after)).toBe(1000);
  });

  it('worked example: ~10 s to the first natural suicide at 1000 reprobates', () => {
    // Suicide 0.0001/s → 1 at 10 s; murder 0.0002/s lands two by then (at 5 s and 10 s).
    const after = applyReprobateDynamics(pop(1000), 10.5);
    expect(totalReprobates(after)).toBe(997); // 1 suicide + 2 murders
    expect(after.souls.toNumber()).toBe(3);
    expect(after.lifetime.suicidePool).toBeCloseTo(0.05, 6);
  });

  it('long delta drains multiple deaths (suicides + murders) in one call', () => {
    const after = applyReprobateDynamics(pop(1000), 100);
    // rate computed once on entry; suicide ~10 + murder ~20 = 30 deaths, each minting a soul.
    const removed = 1000 - totalReprobates(after);
    expect(after.souls.toNumber()).toBe(removed);
    expect(removed).toBe(30);
  });

  it('fractional progress persists across short ticks (no sub-1 loss)', () => {
    let s = pop(1000);
    for (let i = 0; i < 49; i++) s = applyReprobateDynamics(s, 0.1);
    expect(totalReprobates(s)).toBe(1000);
    expect(s.lifetime.murderPool).toBeCloseTo(0.98, 4); // 49 × 0.02, no sub-1 loss

    s = applyReprobateDynamics(s, 0.1); // the 50th tick tips the murder pool over 1
    expect(totalReprobates(s)).toBe(999);
    expect(s.souls.toNumber()).toBe(1);
  });

  it('zero population: pool stays at 0, no deaths, no errors', () => {
    const after = applyReprobateDynamics(pop(0), 100);
    expect(totalReprobates(after)).toBe(0);
    expect(after.souls.toNumber()).toBe(0);
    expect(after.lifetime.suicidePool).toBe(0);
  });

  it('deltaSeconds <= 0 is a no-op', () => {
    const before = pop(1000);
    const after = applyReprobateDynamics(before, 0);
    expect(after).toBe(before);
  });
});

describe('reprobate dynamics — soul minting', () => {
  it('each death mints exactly one soul', () => {
    const after = applyReprobateDynamics(pop(1000), 100);
    const removed = 1000 - totalReprobates(after);
    expect(after.souls.toNumber()).toBe(removed);
  });

  it('deaths reduce the single reprobate pool', () => {
    const after = applyReprobateDynamics(pop(1000), 218);
    const killed = 1000 - totalReprobates(after);
    expect(killed).toBeGreaterThan(0);
    expect(after.lifetime.reprobates).toBeLessThan(1000);
  });
});

describe('reprobate dynamics — modifier wiring', () => {
  it('NEUTRAL_MODIFIERS leaves suicide rate at population × base', () => {
    const s = pop(1000);
    const rates = reprobateRates(s, NEUTRAL_MODIFIERS);
    expect(rates.suicidePerSecond).toBeCloseTo(0.1, 6);
    expect(rates.generationPerSecond).toBe(0);
    // Murder is per-capita on the whole population: 0.0002 × 1000 = 0.2/s.
    expect(rates.murderPerSecond).toBeCloseTo(0.2, 6);
  });

  it('Tristitia Devotion no longer scales the suicide rate (sheet rev 2026-06-12)', () => {
    // Resignation moved to acolyte efficiency; the per-level doubling is retired. Despair flows
    // through the Mercatus Tristitiae signature clause instead.
    const s = pop(1000);
    const withT1: GameState = { ...s, devotion: { ...s.devotion, tristitia: bn(180) } };
    const rates = reprobateRates(withT1, computeModifiers(withT1));
    expect(rates.suicidePerSecond).toBeCloseTo(0.1, 6); // unchanged from the 0.1 base
  });

  it('no Tristitia devotion -> suicide multiplier is exactly 1', () => {
    const s = pop(1000);
    const mods = computeModifiers(s);
    expect(mods.reprobateSuicideRateMul).toBe(1);
  });

  it('reprobateGenerationRateMul and murderRateMul start at 1', () => {
    const s = pop(1000);
    const mods = computeModifiers(s);
    expect(mods.reprobateGenerationRateMul).toBe(1);
    expect(mods.murderRateMul).toBe(1);
  });
});

describe('reprobate dynamics — generation pool (dormant for now)', () => {
  it('base rate is 0, no births accrue', () => {
    const after = applyReprobateDynamics(pop(0), 1000);
    expect(after.lifetime.generationPool).toBe(0);
    expect(totalReprobates(after)).toBe(0);
  });
});

describe('reprobate dynamics — murder pool (per-capita cull)', () => {
  it('no population: murder pool stays 0', () => {
    const after = applyReprobateDynamics(pop(0), 1000);
    expect(after.lifetime.murderPool).toBe(0);
  });

  it('with a population the murder pool drains, and souls = total deaths', () => {
    // pop 1000: suicide 0.23/s + murder 0.1/s. Over 200 s both pools drain; each death = 1 soul.
    const after = applyReprobateDynamics(pop(1000), 200);
    const totalDeaths = 1000 - after.lifetime.reprobates;
    expect(totalDeaths).toBeGreaterThan(0);
    expect(after.souls.toNumber()).toBe(totalDeaths);
    expect(after.lifetime.murderPool).toBeLessThan(1);
  });

  it('Panvitium-style murder multiplier scales the rate', () => {
    const s = pop(1000);
    const base = reprobateRates(s, NEUTRAL_MODIFIERS).murderPerSecond;
    const boosted = reprobateRates(s, { ...NEUTRAL_MODIFIERS, murderRateMul: 4 }).murderPerSecond;
    expect(boosted).toBeCloseTo(base * 4, 6);
  });
});

describe('reprobate dynamics — Vitium Mercatura output multiplier (Plutus / Vapula)', () => {
  /** A state with one trade at depth 5 (5 × 0.02 = 0.1 reprobate/s generation). */
  function withBusiness(): GameState {
    const s = createInitialState('vm-test', 0);
    return {
      ...s,
      lifetime: { ...s.lifetime, mercatusDepths: { gula: 5 } },
    };
  }

  it('mercatus generation scales with the VM-output multiplier (Plutus lifts it)', () => {
    const base = withBusiness();
    const baseRate = reprobateRates(base, computeModifiers(base)).generationPerSecond;
    expect(baseRate).toBeGreaterThan(0);

    const withPlutus: GameState = {
      ...base,
      lifetime: { ...base.lifetime, invocations: { ...base.lifetime.invocations, plutus: 1 } },
    };
    const vmMul = computeModifiers(withPlutus).vitiumMercaturaOutputMul;
    expect(vmMul).toBeGreaterThan(1);
    const plutusRate = reprobateRates(withPlutus, computeModifiers(withPlutus)).generationPerSecond;
    expect(plutusRate).toBeCloseTo(baseRate * vmMul, 6);
  });

  it('the multiplier does not touch the base generation rate (no business → unchanged)', () => {
    const noBiz = createInitialState('vm-empty', 0);
    const withPlutus: GameState = {
      ...noBiz,
      lifetime: { ...noBiz.lifetime, invocations: { plutus: 3 } },
    };
    expect(reprobateRates(withPlutus, computeModifiers(withPlutus)).generationPerSecond).toBe(0);
  });
});
