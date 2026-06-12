/**
 * Vitium Compositum sim tests (03 §2.3 / 02 §3 / 02 §9). Pins:
 *   - catalog integrity for the wired subset
 *   - activate gates on Sin levels; rejects double-activate / unknown id
 *   - deactivate removes from the active set
 *   - advanceToggles deducts per-second cost; auto-deactivates when upkeep can't be paid
 *   - cost is deducted before income (a toggle never earns on a tick it can't afford)
 *   - active toggles contribute gold/influence income through the tick
 *   - active toggles feed generation + conversion pools and biasedSubtype weights
 *   - business + VC conversion sources aggregate together
 *   - tick surfaces a notice when a toggle auto-deactivates
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
  compositumGoldPerSecond,
  compositumInfluencePerSecond,
  compositumGenerationRateMul,
  compositumMurderRateMul,
  compositumSuicideRateMul,
  compositumUnlocked,
  createInitialState,
  deactivateToggle,
  isToggleActive,
  reprobateRates,
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

/** Meet the gate for a two-Sin VC at its minLevel. */
function unlock(s: GameState, def = COMPOSITA.bacchanal!): GameState {
  let out = s;
  for (const sin of def.sins) out = withSin(out, sin, def.minLevel);
  return out;
}

/** Lift all eight Sins to `level` (Vegas/Crusade four-Sin gates). */
function unlockAllSins(s: GameState, level: number): GameState {
  let out = s;
  for (const sin of Object.keys(s.devotion) as Sin[]) out = withSin(out, sin, level);
  return out;
}

function withGold(s: GameState, g: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, gold: bn(g) } };
}
function withInfluence(s: GameState, i: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, influence: bn(i) } };
}

describe('Vitium Compositum — catalog', () => {
  it('exposes the canonical nine (ADR-027): six pairs, Vegas, Crusade, Panvitium', () => {
    expect(COMPOSITUM_IDS).toEqual([
      'bacchanal',
      'charity',
      'gala',
      'doom-gathering',
      'enraging-broadcast',
      'dolce-far-niente',
      'vegas',
      'crusade',
      'panvitium',
    ]);
  });

  it('the two-Sin ceremonies are minLevel 1 over two Sins', () => {
    for (const id of [
      'bacchanal',
      'charity',
      'gala',
      'doom-gathering',
      'enraging-broadcast',
      'dolce-far-niente',
    ]) {
      const def = compositumById(id)!;
      expect(def.minLevel).toBe(1);
      expect(def.sins.length).toBe(2);
    }
  });

  it('Panvitium gates on all eight Sins at level 3 and forbids manual deactivation', () => {
    const p = compositumById('panvitium')!;
    expect(p.minLevel).toBe(3);
    expect(p.sins.length).toBe(8);
    expect(p.manualDeactivateForbidden).toBe(true);
    expect(p.costGrowthPerSecond).toBeGreaterThan(1);
  });

  it('every entry has at least one effect — no stubs survive ADR-027', () => {
    for (const id of COMPOSITUM_IDS) {
      const def = compositumById(id)!;
      const hasEffect =
        (def.goldPerSecond ?? 0) +
          (def.influencePerSecond ?? 0) +
          (def.generationPerSecond ?? 0) +
          (def.generationRateBoost ?? 0) +
          (def.suicideRateBoost ?? 0) +
          (def.murderRateBoost ?? 0) +
          (def.percentOutput?.fraction ?? 0) +
          (def.offlineGainBoost ?? 0) +
          (def.panvitiumRateBase ?? 0) >
        0;
      expect(hasEffect).toBe(true);
    }
  });

  it('Vegas and Crusade carry the percentage semantics (sheet rev 2026-06-12)', () => {
    const vegas = compositumById('vegas')!;
    expect(vegas.percentCost).toEqual({ base: 'goldGain', fraction: 0.5 });
    expect(vegas.percentOutput).toEqual({
      base: 'goldGain',
      resource: 'influence',
      fraction: 0.01,
    });
    const crusade = compositumById('crusade')!;
    expect(crusade.percentCost).toEqual({ base: 'influenceGain', fraction: 0.5 });
    expect(crusade.percentOutput).toEqual({
      base: 'influenceGain',
      resource: 'gold',
      fraction: 10,
    });
  });

  it('Charity pays 100 gold + 25 influence for 200 gold per second (sheet rev)', () => {
    const charity = compositumById('charity')!;
    expect(charity.costPerSecond).toEqual({ gold: 100, influence: 25 });
    expect(charity.goldPerSecond).toBe(200);
  });
});

describe('activateToggle / deactivateToggle', () => {
  it('rejects unknown ids', () => {
    expect(activateToggle(fresh(), 'nope').ok).toBe(false);
  });

  it('rejects activation when the Sin gates are not met', () => {
    const r = activateToggle(fresh(), 'bacchanal');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/gula 1 \+ luxuria 1/);
  });

  it('activates when both gates are met, adding to activeToggles', () => {
    const s = unlock(fresh());
    const r = activateToggle(s, 'bacchanal');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isToggleActive(r.state, 'bacchanal')).toBe(true);
    expect(r.state.lifetime.activeToggles).toContain('bacchanal');
  });

  it('rejects double-activation', () => {
    const s = unlock(fresh());
    const r1 = activateToggle(s, 'bacchanal');
    if (!r1.ok) throw new Error('first activate');
    const r2 = activateToggle(r1.state, 'bacchanal');
    expect(r2.ok).toBe(false);
  });

  it('deactivate removes it; fails if not active', () => {
    const s = unlock(fresh());
    const r = activateToggle(s, 'bacchanal');
    if (!r.ok) throw new Error('activate');
    const d = deactivateToggle(r.state, 'bacchanal');
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(isToggleActive(d.state, 'bacchanal')).toBe(false);
    expect(deactivateToggle(d.state, 'bacchanal').ok).toBe(false);
  });

  it('compositumUnlocked reflects the gate', () => {
    expect(compositumUnlocked(fresh(), COMPOSITA.bacchanal!)).toBe(false);
    expect(compositumUnlocked(unlock(fresh()), COMPOSITA.bacchanal!)).toBe(true);
  });
});

describe('advanceToggles — upkeep and auto-deactivation (02 §3)', () => {
  it('deducts the per-second gold cost while affordable', () => {
    // bacchanal costs 100 gold/s + 10 influence/s. With 1000 gold + 100 influence and 1 s delta →
    // 900 gold / 90 influence left, still active.
    let s = unlock(withInfluence(withGold(fresh(), 1000), 100));
    const a = activateToggle(s, 'bacchanal');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const r = advanceToggles(s, 1);
    expect(r.deactivated).toHaveLength(0);
    expect(r.state.lifetime.gold.toNumber()).toBe(900);
    expect(r.state.lifetime.influence.toNumber()).toBe(90);
    expect(isToggleActive(r.state, 'bacchanal')).toBe(true);
  });

  it('auto-deactivates a toggle that cannot pay its upkeep, with no partial deduction', () => {
    // bacchanal costs 100 gold/s. With only 10 gold and 1 s delta → cannot pay → deactivates,
    // and gold is untouched (no partial application).
    let s = unlock(withGold(fresh(), 10));
    const a = activateToggle(s, 'bacchanal');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const r = advanceToggles(s, 1);
    expect(r.deactivated).toEqual(['bacchanal']);
    expect(isToggleActive(r.state, 'bacchanal')).toBe(false);
    expect(r.state.lifetime.gold.toNumber()).toBe(10);
  });

  it('deducts influence upkeep for influence-cost toggles', () => {
    // enraging-broadcast costs 25 influence/s. 100 influence, 2 s → 50 left.
    let s = unlock(withInfluence(fresh(), 100), COMPOSITA['enraging-broadcast']!);
    const a = activateToggle(s, 'enraging-broadcast');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const r = advanceToggles(s, 2);
    expect(r.deactivated).toHaveLength(0);
    expect(r.state.lifetime.influence.toNumber()).toBe(50);
  });

  it('drops retired ceremony ids from old saves without billing them (ADR-027)', () => {
    const s: GameState = {
      ...fresh(),
      lifetime: {
        ...fresh().lifetime,
        activeToggles: ['loan-shark-op', 'outrage-cycle'],
        toggleDurations: { 'loan-shark-op': 5 },
      },
    };
    const r = advanceToggles(s, 1);
    expect(r.deactivated).toEqual(['loan-shark-op', 'outrage-cycle']);
    expect(r.state.lifetime.activeToggles).toEqual([]);
    expect(r.state.lifetime.toggleDurations).toEqual({});
  });

  it('Vegas pays 50% of the gold gain rate per second, in gold (ADR-027)', () => {
    let s = unlockAllSins(withInfluence(withGold(fresh(), 1000), 1000), 2);
    const a = activateToggle(s, 'vegas');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const rates = { goldGainPerSecond: 40, influenceGainPerSecond: 7 };
    const r = advanceToggles(s, 2, rates);
    expect(r.deactivated).toHaveLength(0);
    expect(r.state.lifetime.gold.toNumber()).toBe(1000 - 0.5 * 40 * 2); // 960
    expect(r.state.lifetime.influence.toNumber()).toBe(1000); // influence untouched
  });

  it('Crusade pays 50% of the influence gain rate per second, in influence (ADR-027)', () => {
    let s = unlockAllSins(withInfluence(withGold(fresh(), 1000), 1000), 2);
    const a = activateToggle(s, 'crusade');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const rates = { goldGainPerSecond: 40, influenceGainPerSecond: 8 };
    const r = advanceToggles(s, 1, rates);
    expect(r.deactivated).toHaveLength(0);
    expect(r.state.lifetime.influence.toNumber()).toBe(996); // 1000 − 0.5 × 8
    expect(r.state.lifetime.gold.toNumber()).toBe(1000);
  });
});

describe('tick — Vitium Compositum income and notices', () => {
  it('an active gold-income toggle adds its income on top of base (charity: 200 g/s)', () => {
    // Reaching avaritia/vanagloria gates inflates goldRateMul via skills, so assert the DELTA the
    // toggle adds rather than an absolute number: gold gain with the toggle minus without it is
    // 200 (VC g/s) × goldRateMul minus the 100 g/s upkeep (paid pre-income, unscaled) over 1 s.
    const base = unlock(withInfluence(withGold(fresh(), 1000), 1000), COMPOSITA.charity!);
    const a = activateToggle(base, 'charity');
    if (!a.ok) throw new Error('activate');
    const goldRateMul = computeModifiers(base).goldRateMul;
    const withoutGold = tick(base, 1).state.lifetime.gold.toNumber();
    const withCharity = tick(a.state, 1).state.lifetime.gold.toNumber();
    expect(withCharity - withoutGold).toBeCloseTo(200 * goldRateMul - 100, 3);
  });

  it('an active influence-income toggle adds its income (gala: 20 infl/s) under the cap', () => {
    // Likewise gala's superbia/vanagloria gate inflates influenceRateMul + the cap. Assert the
    // delta: influence gain with gala minus without should equal 20 (VC infl/s) × influenceRateMul,
    // provided we stay under the (now large) effective cap — start influence at 0.
    let base = unlock(withGold(fresh(), 1_000_000), COMPOSITA.gala!);
    base = withInfluence(base, 0);
    const a = activateToggle(base, 'gala');
    if (!a.ok) throw new Error('activate');
    const influenceRateMul = computeModifiers(base).influenceRateMul;
    const without = tick(base, 1).state.lifetime.influence.toNumber();
    const withGala = tick(a.state, 1).state.lifetime.influence.toNumber();
    expect(withGala - without).toBeCloseTo(20 * influenceRateMul, 3);
  });

  it('surfaces a notice when a toggle auto-deactivates mid-tick', () => {
    let s = unlock(withGold(fresh(), 10));
    const a = activateToggle(s, 'bacchanal');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const r = tick(s, 1);
    expect(r.notices.some((n) => n.includes('bacchanal'))).toBe(true);
    expect(isToggleActive(r.state, 'bacchanal')).toBe(false);
  });
});

describe('Vitium Compositum — income + generation sourcing', () => {
  it('an active income toggle reflects its gold/influence (charity)', () => {
    // charity: 200 gold/s income; 100 gold + 25 influence/s upkeep (sheet rev 2026-06-12).
    let s = unlock(withInfluence(withGold(fresh(), 1_000_000), 1_000_000), COMPOSITA.charity!);
    const a = activateToggle(s, 'charity');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    expect(compositumGoldPerSecond(s)).toBe(200);
    expect(compositumInfluencePerSecond(s)).toBe(0);
  });

  it('Bacchanal boosts the generation rate by 10% while active (sheet rev 2026-06-12)', () => {
    let s = unlock(withInfluence(withGold(fresh(), 1_000_000), 1_000_000)); // gula + luxuria L1
    s = { ...s, lifetime: { ...s.lifetime, mercatusDepths: { gula: 3 } } }; // a real birth rate
    const off = reprobateRates(s, computeModifiers(s)).generationPerSecond;
    const a = activateToggle(s, 'bacchanal');
    if (!a.ok) throw new Error('activate');
    expect(compositumGenerationRateMul(a.state)).toBeCloseTo(1.1, 9);
    const on = reprobateRates(a.state, computeModifiers(a.state)).generationPerSecond;
    expect(on / off).toBeCloseTo(1.1, 6);
  });
});

describe('Vegas / Crusade through the tick (ADR-027)', () => {
  it('Vegas drains ~50% of the gold gain and yields 1% of it as influence', () => {
    // All eight Sins at L2 meet Vegas' four-Sin gate. Control = same state without the toggle;
    // perSecondRates(control) IS the percentage base (no percent-VC active in the control).
    const base = unlockAllSins(withInfluence(withGold(fresh(), 1_000_000), 0), 2);
    const a = activateToggle(base, 'vegas');
    if (!a.ok) throw new Error('activate');
    const mods = computeModifiers(base);
    const goldRate = tick(base, 1).state.lifetime.gold.toNumber() - 1_000_000; // control gain/s
    const withVegas = tick(a.state, 1).state;
    // Gold: full income still accrues, minus the 50% upkeep leg.
    expect(withVegas.lifetime.gold.toNumber() - 1_000_000).toBeCloseTo(
      goldRate - 0.5 * goldRate,
      1,
    );
    // Influence: the control's gain plus 1% of the gold gain × VC output × influence rate muls.
    const controlInfl = tick(base, 1).state.lifetime.influence.toNumber();
    const vegasBonus = 0.01 * goldRate * mods.vitiumCompositumOutputMul * mods.influenceRateMul;
    expect(withVegas.lifetime.influence.toNumber()).toBeCloseTo(controlInfl + vegasBonus, 1);
  });

  it('Crusade converts the influence gain into a ×10 gold stream', () => {
    // Stock 50 influence — under the effective cap, enough to pay the 50%-of-gain upkeep.
    const base = unlockAllSins(withInfluence(withGold(fresh(), 1_000_000), 50), 2);
    const a = activateToggle(base, 'crusade');
    if (!a.ok) throw new Error('activate');
    const mods = computeModifiers(base);
    const control = tick(base, 1).state;
    const inflRate = control.lifetime.influence.toNumber() - 50; // control influence gain/s
    const withCrusade = tick(a.state, 1).state;
    const crusadeGold = 10 * inflRate * mods.vitiumCompositumOutputMul * mods.goldRateMul;
    expect(withCrusade.lifetime.gold.toNumber()).toBeCloseTo(
      control.lifetime.gold.toNumber() + crusadeGold,
      1,
    );
    // Influence: same accrual minus the 50% upkeep on the gain rate.
    expect(withCrusade.lifetime.influence.toNumber()).toBeCloseTo(50 + 0.5 * inflRate, 1);
  });
});

describe('Panvitium — the endgame ritual (03 §2.3)', () => {
  /** Unlock Panvitium: all eight Sins at level 3. */
  function unlockPanvitium(s: GameState): GameState {
    return unlock(s, COMPOSITA.panvitium!);
  }

  it('is gated behind all eight Sins at level 3', () => {
    expect(compositumUnlocked(fresh(), COMPOSITA.panvitium!)).toBe(false);
    // Seven of eight is not enough.
    let seven = fresh();
    const sins: Sin[] = ['gula', 'luxuria', 'avaritia', 'tristitia', 'ira', 'acedia', 'vanagloria'];
    for (const s of sins) seven = withSin(seven, s, 3);
    expect(compositumUnlocked(seven, COMPOSITA.panvitium!)).toBe(false);
    // All eight unlocks it.
    expect(compositumUnlocked(unlockPanvitium(fresh()), COMPOSITA.panvitium!)).toBe(true);
  });

  it('cannot be manually deactivated', () => {
    let s = unlockPanvitium(withGold(withInfluence(fresh(), 1e9), 1e9));
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const d = deactivateToggle(s, 'panvitium');
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toMatch(/cannot be stopped/i);
    expect(isToggleActive(s, 'panvitium')).toBe(true);
  });

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

  it('auto-deactivates once upkeep outgrows reserves; duration clears', () => {
    // Modest reserves: the exponential cost outpaces them within a reasonable burst.
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
    // Seed some unconverted reprobates so suicides/murders have fuel immediately.
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

describe('Vitium Compositum — dynamics-rate ceremonies (sheet rev 2026-06-12)', () => {
  it('Doom Gathering boosts the suicide rate by 10% while active', () => {
    let s = unlock(
      withInfluence(withGold(fresh(), 1_000_000), 1_000_000),
      COMPOSITA['doom-gathering']!,
    );
    s = { ...s, lifetime: { ...s.lifetime, reprobates: 100 } };
    const off = reprobateRates(s, computeModifiers(s)).suicidePerSecond;
    const a = activateToggle(s, 'doom-gathering');
    if (!a.ok) throw new Error('activate');
    expect(compositumSuicideRateMul(a.state)).toBeCloseTo(1.1, 9);
    const on = reprobateRates(a.state, computeModifiers(a.state)).suicidePerSecond;
    expect(on / off).toBeCloseTo(1.1, 6);
  });

  it('Enraging Broadcast boosts the murder rate by 10% while active', () => {
    let s = unlock(
      withInfluence(withGold(fresh(), 1_000_000), 1_000_000),
      COMPOSITA['enraging-broadcast']!,
    );
    s = { ...s, lifetime: { ...s.lifetime, reprobates: 1000 } };
    const off = reprobateRates(s, computeModifiers(s)).murderPerSecond;
    const a = activateToggle(s, 'enraging-broadcast');
    if (!a.ok) throw new Error('activate');
    expect(compositumMurderRateMul(a.state)).toBeCloseTo(1.1, 9);
    const on = reprobateRates(a.state, computeModifiers(a.state)).murderPerSecond;
    expect(on / off).toBeCloseTo(1.1, 6);
  });
});

describe('Vitium Compositum — offline ceremony (Dolce Far Niente)', () => {
  function withActive(s: GameState, id: string): GameState {
    return { ...s, lifetime: { ...s.lifetime, activeToggles: [id] } };
  }

  it('Dolce Far Niente lifts the offline-gain rate by 1% while active', () => {
    const base = fresh();
    const off = computeModifiers(base).offlineTimeMul;
    const on = computeModifiers(withActive(base, 'dolce-far-niente')).offlineTimeMul;
    expect(on).toBeCloseTo(off * 1.01, 9);
  });
});
