import { describe, it, expect } from 'vitest';
import {
  bn,
  computeModifiers,
  createInitialState,
  tick,
  desidiaMax,
  grantDesidiaForOffline,
  setDesidia,
  DESIDIA_BASE_MAX,
  DESIDIA_BASE_SPEED,
  type GameState,
} from './index.js';

const fresh = (): GameState => createInitialState('desidia', 0);
const withAcedia = (s: GameState, devotion: number): GameState => ({
  ...s,
  devotion: { ...s.devotion, acedia: bn(devotion) },
});

describe('desidiaMax — base 120, doubled per Acedia tier (ADR-033)', () => {
  it('is the base at Acedia 0 and doubles each Sin level', () => {
    expect(desidiaMax(fresh())).toBe(DESIDIA_BASE_MAX); // 120
    expect(desidiaMax(withAcedia(fresh(), 180))).toBe(240); // level 1 → ×2
    expect(desidiaMax(withAcedia(fresh(), 180 ** 2))).toBe(480); // level 2 → ×4
  });
});

describe('grantDesidiaForOffline — 0.2 per minute, clamped (ADR-033)', () => {
  it('grants 0.2/min and caps at the (Acedia-scaled) maximum', () => {
    const s = fresh();
    // 10 minutes away = 600 s → 600 × 0.2/60 = 2 desidia.
    expect(grantDesidiaForOffline(s, 600).desidia).toBeCloseTo(2, 6);
    // An enormous span saturates at the cap (120 base).
    expect(grantDesidiaForOffline(s, 1e9).desidia).toBe(120);
    // Acedia raises the ceiling the grant clamps to.
    expect(grantDesidiaForOffline(withAcedia(s, 180), 1e9).desidia).toBe(240);
  });

  it('is a no-op for a non-positive span or when already at the cap', () => {
    const s = fresh();
    expect(grantDesidiaForOffline(s, 0)).toBe(s);
    expect(grantDesidiaForOffline(s, -100)).toBe(s);
    const capped = { ...s, desidia: 120 };
    expect(grantDesidiaForOffline(capped, 1e9)).toBe(capped);
  });
});

describe('setDesidia — pure toggle', () => {
  it('sets, clears, and no-ops when already in the requested state', () => {
    const s = fresh();
    expect(setDesidia(s, true).desidiaActive).toBe(true);
    expect(setDesidia({ ...s, desidiaActive: true }, false).desidiaActive).toBe(false);
    expect(setDesidia(s, false)).toBe(s); // already off
  });
});

describe('Desidia modifier fields (ADR-033)', () => {
  it('Acedia Procrastination lifts desidiaSpeedMul by (1 + intensity)', () => {
    expect(computeModifiers(fresh()).desidiaSpeedMul).toBe(1);
    expect(computeModifiers(withAcedia(fresh(), 180)).desidiaSpeedMul).toBeGreaterThan(1);
  });

  it('Lemure lowers desidiaDrainMul ×0.9375 per copy', () => {
    const withLemure = (n: number): GameState => {
      const s = fresh();
      return { ...s, lifetime: { ...s.lifetime, invocations: { lemure: n } } };
    };
    expect(computeModifiers(withLemure(0)).desidiaDrainMul).toBeCloseTo(1, 6);
    expect(computeModifiers(withLemure(4)).desidiaDrainMul).toBeCloseTo(0.9375 ** 4, 6);
  });
});

describe('Desidia in the tick — accelerate the sim, drain desidia, honest clock (ADR-033)', () => {
  const seeded = (over: Partial<GameState> = {}): GameState => ({
    ...fresh(),
    desidia: 100,
    ...over,
  });

  it('accelerates the sim by DESIDIA_BASE_SPEED while active (base Acedia)', () => {
    const normal = tick(seeded(), 1).state.lifetime.gold.toNumber();
    const accel = tick(seeded({ desidiaActive: true }), 1).state.lifetime.gold.toNumber();
    expect(accel / normal).toBeCloseTo(DESIDIA_BASE_SPEED, 6); // 1.333× the gold over the same tick
  });

  it('drains 1 desidia/second (base) and advances lastTickAt by the REAL delta, not the accelerated one', () => {
    const after = tick(seeded({ desidiaActive: true }), 1).state;
    expect(after.desidia).toBeCloseTo(99, 6); // 1/s base drain
    expect(after.lastTickAt).toBe(1000); // wall-clock: 1 real second, NOT 1.333
  });

  it('Lemure cuts the drain (×0.9375 per copy)', () => {
    const oneLemure = seeded({ desidiaActive: true });
    oneLemure.lifetime = { ...oneLemure.lifetime, invocations: { lemure: 1 } };
    expect(tick(oneLemure, 1).state.desidia).toBeCloseTo(100 - 0.9375, 6);
  });

  it('auto-deactivates the tick it cannot pay, running that tick at normal speed', () => {
    const r = tick(seeded({ desidia: 0.5, desidiaActive: true }), 1).state;
    expect(r.desidiaActive).toBe(false);
    expect(r.desidia).toBe(0);
    // No acceleration on the shortfall tick: gold rises at the base rate only.
    expect(r.lifetime.gold.toNumber()).toBeCloseTo(
      tick(seeded(), 1).state.lifetime.gold.toNumber(),
      6,
    );
  });

  it('Acedia makes Desidia faster still (higher speed multiplier)', () => {
    const base = tick(seeded({ desidiaActive: true }), 1).state.lifetime.gold.toNumber();
    const slothful = tick(
      withAcedia(seeded({ desidiaActive: true }), 180),
      1,
    ).state.lifetime.gold.toNumber();
    expect(slothful).toBeGreaterThan(base);
  });
});
