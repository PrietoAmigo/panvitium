/**
 * Vitium Compositum sim tests (03 §2.3 / 02 §3) — the toggle engine, now serving Panvitium alone
 * (ADR-031: the eight lesser ceremonies retired). Pins:
 *   - catalog integrity: Panvitium is the whole roster
 *   - activate gates on Sin levels; rejects double-activate / unknown id
 *   - manual deactivation forbidden for Panvitium
 *   - advanceToggles deducts the per-second cost; auto-deactivates when upkeep can't be paid,
 *     with no partial deduction; retired ceremony ids from old saves drop unbilled
 *   - the eᵗ cost ramp; the Foedus discount reaches the ramped cost
 *   - the tick surfaces a notice on auto-deactivation
 *   - the churn multipliers, the soul harvest, and the Katabasis duration reset
 */
import { describe, expect, it } from 'vitest';
import {
  activateToggle,
  advanceToggles,
  bn,
  COMPOSITA,
  COMPOSITUM_IDS,
  commitKatabasis,
  compositumById,
  compositumUnlocked,
  createInitialState,
  deactivateToggle,
  isToggleActive,
  computeModifiers,
  tick,
  type GameState,
  type Sin,
} from './index.js';

function fresh(seed = 'compositum', t = 0): GameState {
  return createInitialState(seed, t);
}

/** Set a Sin to exactly `level` via 180^level Devotion. */
function withSin(s: GameState, sin: Sin, level: number): GameState {
  return { ...s, devotion: { ...s.devotion, [sin]: bn(180 ** level) } };
}

/** Unlock Panvitium: all eight Sins at level 3. */
function unlockPanvitium(s: GameState): GameState {
  let out = s;
  for (const sin of COMPOSITA.panvitium!.sins) out = withSin(out, sin, 3);
  return out;
}

function withGold(s: GameState, g: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, gold: bn(g) } };
}
function withInfluence(s: GameState, i: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, influence: bn(i) } };
}

describe('Vitium Compositum — catalog (ADR-031)', () => {
  it('the roster is Panvitium alone — the lesser ceremonies retired', () => {
    expect(COMPOSITUM_IDS).toEqual(['panvitium']);
  });

  it('Panvitium gates on all eight Sins at level 3 and forbids manual deactivation', () => {
    const p = compositumById('panvitium')!;
    expect(p.minLevel).toBe(3);
    expect(p.sins.length).toBe(8);
    expect(p.manualDeactivateForbidden).toBe(true);
    expect(p.costGrowthPerSecond).toBeGreaterThan(1);
    expect(p.costPerSecond).toEqual({ gold: 1000, influence: 100 });
    expect(p.panvitiumRateBase).toBeGreaterThan(0);
  });
});

describe('activateToggle / deactivateToggle', () => {
  it('rejects unknown ids (the retired ceremonies included)', () => {
    expect(activateToggle(fresh(), 'nope').ok).toBe(false);
    expect(activateToggle(unlockPanvitium(fresh()), 'bacchanal').ok).toBe(false);
  });

  it('rejects activation when the Sin gates are not met', () => {
    const r = activateToggle(fresh(), 'panvitium');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/requires/);
  });

  it('activates when the gates are met, adding to activeToggles; rejects double-activation', () => {
    const s = unlockPanvitium(fresh());
    const r = activateToggle(s, 'panvitium');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isToggleActive(r.state, 'panvitium')).toBe(true);
    expect(activateToggle(r.state, 'panvitium').ok).toBe(false);
  });

  it('compositumUnlocked reflects the eight-Sin gate (seven of eight is not enough)', () => {
    expect(compositumUnlocked(fresh(), COMPOSITA.panvitium!)).toBe(false);
    let seven = fresh();
    const sins: Sin[] = ['gula', 'luxuria', 'avaritia', 'tristitia', 'ira', 'acedia', 'vanagloria'];
    for (const s of sins) seven = withSin(seven, s, 3);
    expect(compositumUnlocked(seven, COMPOSITA.panvitium!)).toBe(false);
    expect(compositumUnlocked(unlockPanvitium(fresh()), COMPOSITA.panvitium!)).toBe(true);
  });

  it('Panvitium cannot be manually deactivated', () => {
    let s = unlockPanvitium(withGold(withInfluence(fresh(), 1e9), 1e9));
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const d = deactivateToggle(s, 'panvitium');
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toMatch(/cannot be stopped/i);
    expect(isToggleActive(s, 'panvitium')).toBe(true);
  });
});

describe('advanceToggles — upkeep and auto-deactivation (02 §3)', () => {
  it('deducts the per-second gold + influence cost while affordable (t = 0, growth 1)', () => {
    // Panvitium costs 1000 gold/s + 100 influence/s at the ramp's foot (e⁰ = 1).
    let s = unlockPanvitium(withInfluence(withGold(fresh(), 10_000), 1_000));
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const r = advanceToggles(s, 1);
    expect(r.deactivated).toHaveLength(0);
    expect(r.state.lifetime.gold.toNumber()).toBe(9_000);
    expect(r.state.lifetime.influence.toNumber()).toBe(900);
    expect(isToggleActive(r.state, 'panvitium')).toBe(true);
  });

  it('auto-deactivates a toggle that cannot pay its upkeep, with no partial deduction', () => {
    let s = unlockPanvitium(withInfluence(withGold(fresh(), 10), 1_000));
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const r = advanceToggles(s, 1);
    expect(r.deactivated).toEqual(['panvitium']);
    expect(isToggleActive(r.state, 'panvitium')).toBe(false);
    expect(r.state.lifetime.gold.toNumber()).toBe(10);
    expect(r.state.lifetime.influence.toNumber()).toBe(1_000);
  });

  it('drops retired ceremony ids from old saves without billing them (ADR-027 / ADR-031)', () => {
    const s: GameState = {
      ...fresh(),
      lifetime: {
        ...fresh().lifetime,
        activeToggles: ['bacchanal', 'vegas', 'loan-shark-op'],
        toggleDurations: { bacchanal: 5 },
      },
    };
    const r = advanceToggles(s, 1);
    expect(r.deactivated).toEqual(['bacchanal', 'vegas', 'loan-shark-op']);
    expect(r.state.lifetime.activeToggles).toEqual([]);
    expect(r.state.lifetime.toggleDurations).toEqual({});
  });
});

describe('tick — upkeep notices', () => {
  it('surfaces a notice when a toggle auto-deactivates mid-tick', () => {
    let s = unlockPanvitium(withGold(fresh(), 10));
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const r = tick(s, 1);
    expect(r.notices.some((n) => n.includes('panvitium'))).toBe(true);
    expect(isToggleActive(r.state, 'panvitium')).toBe(false);
  });
});

describe('Panvitium — the endgame ritual (03 §2.3)', () => {
  it('cost ramps exponentially (eᵗ) with active duration', () => {
    // Base ~1000 g/s; eᵗ growth means a few seconds later the same 1 s delta costs far more.
    let s = unlockPanvitium(withGold(withInfluence(fresh(), 1e18), 1e18));
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const goldStart = s.lifetime.gold.toNumber();
    const r1 = advanceToggles(s, 1);
    const firstCost = goldStart - r1.state.lifetime.gold.toNumber();
    expect(r1.state.lifetime.toggleDurations.panvitium).toBeCloseTo(1, 6);
    // Advance a few seconds (still affordable on a huge reserve), then one more 1 s tick costs far
    // more than the first: at duration ~6, growth is e^6 ≈ 403×.
    let later = r1.state;
    for (let i = 0; i < 5; i++) later = advanceToggles(later, 1).state;
    expect(isToggleActive(later, 'panvitium')).toBe(true);
    const beforeLate = later.lifetime.gold.toNumber();
    const rLate = advanceToggles(later, 1);
    const lateCost = beforeLate - rLate.state.lifetime.gold.toNumber();
    expect(lateCost).toBeGreaterThan(firstCost * 50);
  });

  it('the Foedus discount reaches the ramped cost (hoard tier 4 → half price)', () => {
    // Two states differing only in hoard tier; the first-second gold cost halves at tier 4.
    const base = (hoard: number): GameState => {
      let s = unlockPanvitium(withGold(withInfluence(fresh(), 1e9), 1e9));
      s = { ...s, lifetime: { ...s.lifetime, hoard: bn(hoard) } };
      const a = activateToggle(s, 'panvitium');
      if (!a.ok) throw new Error('activate');
      return a.state;
    };
    const costOf = (s: GameState): number =>
      s.lifetime.gold.toNumber() - advanceToggles(s, 1).state.lifetime.gold.toNumber();
    const full = costOf(base(0));
    const discounted = costOf(base(10_000_000)); // tier 4 → ×0.5
    expect(full).toBeCloseTo(1000, 6);
    expect(discounted).toBeCloseTo(500, 6);
  });

  it('auto-deactivates once upkeep outgrows reserves; duration clears', () => {
    let s = unlockPanvitium(withGold(withInfluence(fresh(), 1_000_000), 1_000_000));
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    let ended = false;
    for (let i = 0; i < 600 && !ended; i++) {
      const r = advanceToggles(s, 1);
      s = r.state;
      if (r.deactivated.includes('panvitium')) ended = true;
    }
    expect(ended).toBe(true);
    expect(isToggleActive(s, 'panvitium')).toBe(false);
    expect(s.lifetime.toggleDurations.panvitium).toBeUndefined();
  });

  it('drives enormous churn while active: generation/suicide/murder multipliers', () => {
    const s = unlockPanvitium(fresh());
    const a = activateToggle(withGold(withInfluence(s, 1e9), 1e9), 'panvitium');
    if (!a.ok) throw new Error('activate');
    const base = computeModifiers(s); // unlocked but NOT active
    const live = computeModifiers(a.state); // active
    expect(live.reprobateGenerationRateMul).toBeGreaterThan(base.reprobateGenerationRateMul);
    expect(live.reprobateSuicideRateMul).toBeGreaterThan(base.reprobateSuicideRateMul);
    expect(live.murderRateMul).toBeGreaterThan(base.murderRateMul);
  });

  it('through the tick, a brief Panvitium burst mints souls', () => {
    let s = unlockPanvitium(withGold(withInfluence(fresh(), 1e12), 1e12));
    // Seed some reprobates so suicides/murders have fuel immediately.
    s = {
      ...s,
      lifetime: { ...s.lifetime, reprobates: 500 },
    };
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const soulsBefore = s.souls.toNumber();
    // Run a few seconds of burst.
    for (let i = 0; i < 50; i++) s = tick(s, 0.1).state;
    expect(s.souls.toNumber()).toBeGreaterThan(soulsBefore);
  });

  it('soul harvest compounds the existing soul hoard (souls/s ∝ current souls)', () => {
    let s = unlockPanvitium(withGold(withInfluence(fresh(), 1e18), 1e18));
    // Seed a soul hoard so the harvest term R(t) × souls is non-trivial. With ~1e6 souls the first
    // 0.1 s alone mints 0.01 × 1e6 × 0.1 = 1000 souls — far beyond any incidental death souls.
    s = { ...s, souls: bn(1_000_000) };
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const before = s.souls.toNumber();
    for (let i = 0; i < 20; i++) s = tick(s, 0.1).state; // ~2 s burst
    expect(s.souls.toNumber()).toBeGreaterThan(before + 1000);
  });

  it('Katabasis clears toggleDurations', () => {
    let s = unlockPanvitium(withGold(withInfluence(fresh(), 1e12), 1e12));
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = advanceToggles(a.state, 5).state; // accrue some duration
    expect(s.lifetime.toggleDurations.panvitium).toBeGreaterThan(0);
    const { state } = commitKatabasis(s);
    expect(Object.keys(state.lifetime.toggleDurations)).toHaveLength(0);
    expect(state.lifetime.activeToggles).toHaveLength(0);
  });
});
