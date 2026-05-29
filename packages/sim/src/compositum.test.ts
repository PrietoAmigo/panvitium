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
  biasedSubtype,
  bn,
  COMPOSITA,
  COMPOSITUM_IDS,
  commitKatabasis,
  compositumById,
  compositumConversionPerSecond,
  compositumConversionSources,
  compositumGoldPerSecond,
  compositumInfluencePerSecond,
  compositumPopulationGenerationPerSecond,
  compositumUnlocked,
  createInitialState,
  deactivateToggle,
  isToggleActive,
  makeRng,
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

function withGold(s: GameState, g: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, gold: bn(g) } };
}
function withInfluence(s: GameState, i: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, influence: bn(i) } };
}

describe('Vitium Compositum — catalog', () => {
  it('exposes the four two-Sin entries plus the apex Panvitium', () => {
    expect(COMPOSITUM_IDS).toEqual([
      'bacchanal',
      'loan-shark-op',
      'charity',
      'gala',
      'outrage-cycle',
      'no-babies-movement',
      'doom-gathering',
      'ethnocentric-revolt',
      'enraging-broadcast',
      'panvitium',
    ]);
  });

  it('the two-Sin ceremonies are minLevel 1 over two Sins', () => {
    for (const id of [
      'bacchanal',
      'loan-shark-op',
      'charity',
      'gala',
      'outrage-cycle',
      'no-babies-movement',
      'doom-gathering',
      'ethnocentric-revolt',
      'enraging-broadcast',
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

  it('every entry has at least one effect (some ceremonies are free of upkeep)', () => {
    for (const id of COMPOSITUM_IDS) {
      const def = compositumById(id)!;
      const hasEffect =
        (def.goldPerSecond ?? 0) +
          (def.influencePerSecond ?? 0) +
          (def.generationPerSecond ?? 0) +
          (def.conversionPerSecond ?? 0) +
          Math.abs(def.flatGenerationPerSecond ?? 0) +
          (def.flatBaseSuicideRatePerSecond ?? 0) +
          (def.flatBaseCholericMurderRatePerSecond ?? 0) +
          (def.populationGeneration?.fraction ?? 0) +
          (def.deathFractionPerSecond ?? 0) >
        0;
      expect(hasEffect).toBe(true);
    }
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
    // loan-shark-op costs 10 influence/s. 100 influence, 2 s → 80 left.
    let s = unlock(withInfluence(fresh(), 100), COMPOSITA['loan-shark-op']!);
    const a = activateToggle(s, 'loan-shark-op');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const r = advanceToggles(s, 2);
    expect(r.deactivated).toHaveLength(0);
    expect(r.state.lifetime.influence.toNumber()).toBe(80);
  });
});

describe('tick — Vitium Compositum income and notices', () => {
  it('an active gold-income toggle adds its income on top of base (loan-shark-op: 100 g/s)', () => {
    // Reaching avaritia/ira level 2 inflates goldRateMul via the Golden Hand skill, so assert the
    // DELTA the toggle adds rather than an absolute number: gold gain with the toggle minus
    // without it should equal 8 (VC g/s) × goldRateMul over 1 s.
    const base = unlock(withInfluence(withGold(fresh(), 0), 1000), COMPOSITA['loan-shark-op']!);
    const a = activateToggle(base, 'loan-shark-op');
    if (!a.ok) throw new Error('activate');
    const goldRateMul = computeModifiers(base).goldRateMul;
    const withoutGold = tick(base, 1).state.lifetime.gold.toNumber();
    const withGoldVal = tick(a.state, 1).state.lifetime.gold.toNumber();
    expect(withGoldVal - withoutGold).toBeCloseTo(100 * goldRateMul, 3);
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

describe('Vitium Compositum — conversion + generation sourcing', () => {
  it('compositum conversion helpers reflect an active standard-conversion toggle', () => {
    // loan-shark-op: conv 0.01 (gambler+choleric), 100 gold/s income, 10 influence/s upkeep.
    let s = unlock(
      withInfluence(withGold(fresh(), 1_000_000), 1_000_000),
      COMPOSITA['loan-shark-op']!,
    );
    const a = activateToggle(s, 'loan-shark-op');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    expect(compositumConversionPerSecond(s)).toBeCloseTo(0.01, 6);
    expect(compositumGoldPerSecond(s)).toBe(100);
    expect(compositumInfluencePerSecond(s)).toBe(0);
    expect(compositumConversionSources(s)).toHaveLength(1);
  });

  it('Bacchanal generation is 10% of (Gluttons + Degenerates), folded into the generation rate', () => {
    let s = unlock(withInfluence(withGold(fresh(), 1_000_000), 1_000_000)); // gula + luxuria L1
    s = {
      ...s,
      lifetime: {
        ...s.lifetime,
        reprobates: { ...s.lifetime.reprobates, glutton: 40, degenerate: 60 },
      },
    };
    const a = activateToggle(s, 'bacchanal');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    expect(compositumPopulationGenerationPerSecond(s)).toBeCloseTo(0.1 * 100, 6); // 10/s
    expect(compositumConversionPerSecond(s)).toBe(0); // Bacchanal no longer converts
    const mods = computeModifiers(s);
    expect(reprobateRates(s, mods).generationPerSecond).toBeCloseTo(
      10 * mods.reprobateGenerationRateMul,
      6,
    );
  });

  it('reprobateRates folds standard VC conversion into the totals', () => {
    let s = unlock(
      withInfluence(withGold(fresh(), 1_000_000), 1_000_000),
      COMPOSITA['loan-shark-op']!,
    );
    const a = activateToggle(s, 'loan-shark-op');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    expect(reprobateRates(s, computeModifiers(s)).conversionPerSecond).toBeCloseTo(0.01, 6);
  });

  it('biasedSubtype draws from the active toggle bias (loan-shark-op: gambler/choleric only)', () => {
    let s = unlock(
      withInfluence(withGold(fresh(), 1_000_000), 1_000_000),
      COMPOSITA['loan-shark-op']!,
    );
    const a = activateToggle(s, 'loan-shark-op');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const rng = makeRng(7);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(biasedSubtype(s, rng));
    // Only gambler/choleric should ever be drawn (50/50 bias, no reprobate leakage here).
    expect([...seen].sort()).toEqual(['choleric', 'gambler']);
  });

  it('Outrage Cycle restricts conversion to Choleric only (sheet effect)', () => {
    let s = unlock(withGold(fresh(), 1_000_000), COMPOSITA['outrage-cycle']!);
    const a = activateToggle(s, 'outrage-cycle');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const rng = makeRng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(biasedSubtype(s, rng));
    expect([...seen]).toEqual(['choleric']); // celebrity is themed but never converted
  });

  it('an active toggle converts unconverted reprobates over time through the tick', () => {
    // 100 unconverted + loan-shark-op (0.01 conv/s) over 300 s → ~3 conversions to gambler/choleric.
    let s = unlock(
      withInfluence(withGold(fresh(), 1_000_000), 1_000_000),
      COMPOSITA['loan-shark-op']!,
    );
    s = {
      ...s,
      lifetime: { ...s.lifetime, reprobates: { ...s.lifetime.reprobates, reprobate: 100 } },
    };
    const a = activateToggle(s, 'loan-shark-op');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const after = tick(s, 300).state;
    const converted = after.lifetime.reprobates.gambler + after.lifetime.reprobates.choleric;
    expect(converted).toBeGreaterThanOrEqual(1);
    expect(converted).toBeLessThanOrEqual(4);
  });
});

describe('Vitium Compositum + Vitium Mercatura conversion sources aggregate', () => {
  it('biasedSubtype mixes business and toggle biases (gula business + loan-shark-op toggle)', () => {
    // gula-mercatura-1: glutton 0.85 / reprobate 0.15, conv 0.001.
    // loan-shark-op: gambler 0.5 / choleric 0.5, conv 0.01 (dominates the mix).
    let s = unlock(
      withInfluence(withGold(fresh(), 1_000_000), 1_000_000),
      COMPOSITA['loan-shark-op']!,
    );
    s = {
      ...s,
      lifetime: {
        ...s.lifetime,
        businesses: { 'gula-mercatura-1': 1 },
        activeToggles: ['loan-shark-op'],
      },
    };
    const rng = makeRng(11);
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) seen.add(biasedSubtype(s, rng));
    expect(seen.has('glutton')).toBe(true); // from the gula business
    expect(seen.has('gambler') || seen.has('choleric')).toBe(true); // from loan-shark-op
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

  it('cost ramps exponentially with active duration', () => {
    // First tick at base (~10000 g/s); a later tick costs strictly more for the same delta.
    let s = unlockPanvitium(withGold(withInfluence(fresh(), 1e12), 1e12));
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const goldStart = s.lifetime.gold.toNumber();
    const r1 = advanceToggles(s, 1);
    const firstCost = goldStart - r1.state.lifetime.gold.toNumber();
    expect(r1.state.lifetime.toggleDurations.panvitium).toBeCloseTo(1, 6);
    // Advance the duration substantially, then a single 1s tick should cost more than the first.
    let later = r1.state;
    for (let i = 0; i < 30; i++) later = advanceToggles(later, 1).state;
    const beforeLate = later.lifetime.gold.toNumber();
    const rLate = advanceToggles(later, 1);
    const lateCost = beforeLate - rLate.state.lifetime.gold.toNumber();
    expect(lateCost).toBeGreaterThan(firstCost);
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
    expect(live.cholericMurderRateMul).toBeGreaterThan(base.cholericMurderRateMul);
  });

  it('through the tick, a brief Panvitium burst mints souls', () => {
    let s = unlockPanvitium(withGold(withInfluence(fresh(), 1e12), 1e12));
    // Seed some unconverted reprobates so suicides/murders have fuel immediately.
    s = {
      ...s,
      lifetime: { ...s.lifetime, reprobates: { ...s.lifetime.reprobates, reprobate: 500 } },
    };
    const a = activateToggle(s, 'panvitium');
    if (!a.ok) throw new Error('activate');
    s = a.state;
    const soulsBefore = s.souls.toNumber();
    // Run a few seconds of burst.
    for (let i = 0; i < 50; i++) s = tick(s, 0.1).state;
    expect(s.souls.toNumber()).toBeGreaterThan(soulsBefore);
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

describe('Vitium Compositum — flat dynamics-rate ceremonies', () => {
  it('Doom Gathering adds a flat increase to the base suicide rate', () => {
    let s = unlock(withGold(fresh(), 1_000_000), COMPOSITA['doom-gathering']!);
    s = {
      ...s,
      lifetime: { ...s.lifetime, reprobates: { ...s.lifetime.reprobates, reprobate: 100 } },
    };
    const off = reprobateRates(s, computeModifiers(s)).suicidePerSecond;
    const a = activateToggle(s, 'doom-gathering');
    if (!a.ok) throw new Error('activate');
    const on = reprobateRates(a.state, computeModifiers(a.state)).suicidePerSecond;
    const mul = computeModifiers(s).reprobateSuicideRateMul;
    expect(on - off).toBeCloseTo(0.001 * 100 * mul, 6); // flat 0.001 added to the base per-capita rate
  });

  it('Ethnocentric Revolt adds a flat increase to the base Choleric murder rate', () => {
    let s = unlock(withGold(fresh(), 1_000_000), COMPOSITA['ethnocentric-revolt']!);
    s = {
      ...s,
      lifetime: { ...s.lifetime, reprobates: { ...s.lifetime.reprobates, choleric: 50 } },
    };
    const off = reprobateRates(s, computeModifiers(s)).murderPerSecond;
    const a = activateToggle(s, 'ethnocentric-revolt');
    if (!a.ok) throw new Error('activate');
    const on = reprobateRates(a.state, computeModifiers(a.state)).murderPerSecond;
    const mul = computeModifiers(s).cholericMurderRateMul;
    expect(on - off).toBeCloseTo(0.001 * 50 * mul, 6);
  });

  it('No-babies Movement flatly decreases generation and never charges upkeep', () => {
    let s = unlock(withGold(fresh(), 1_000_000), COMPOSITA['no-babies-movement']!);
    s = { ...s, lifetime: { ...s.lifetime, businesses: { 'gula-mercatura-1': 1 } } }; // 0.05 gen/s
    const genMul = computeModifiers(s).reprobateGenerationRateMul;
    const off = reprobateRates(s, computeModifiers(s)).generationPerSecond;
    const a = activateToggle(s, 'no-babies-movement');
    if (!a.ok) throw new Error('activate');
    const on = reprobateRates(a.state, computeModifiers(a.state)).generationPerSecond;
    expect(on - off).toBeCloseTo(-0.01 * genMul, 6);

    // Free upkeep: stays active with 0 gold and 0 influence.
    const broke = activateToggle(
      withGold(unlock(fresh(), COMPOSITA['no-babies-movement']!), 0),
      'no-babies-movement',
    );
    if (!broke.ok) throw new Error('activate broke');
    expect(advanceToggles(broke.state, 1).deactivated).not.toContain('no-babies-movement');
  });

  it('generation never goes negative — No-babies on a state with no births clamps at 0', () => {
    const s = unlock(withGold(fresh(), 1_000_000), COMPOSITA['no-babies-movement']!);
    const a = activateToggle(s, 'no-babies-movement');
    if (!a.ok) throw new Error('activate');
    expect(reprobateRates(a.state, computeModifiers(a.state)).generationPerSecond).toBe(0);
  });

  it('Enraging Broadcast culls a flat fraction of the whole population per second', () => {
    let s = unlock(
      withInfluence(withGold(fresh(), 1_000_000), 1_000_000),
      COMPOSITA['enraging-broadcast']!,
    );
    s = {
      ...s,
      lifetime: { ...s.lifetime, reprobates: { ...s.lifetime.reprobates, reprobate: 1000 } },
    };
    const off = reprobateRates(s, computeModifiers(s)).suicidePerSecond;
    const a = activateToggle(s, 'enraging-broadcast');
    if (!a.ok) throw new Error('activate');
    const on = reprobateRates(a.state, computeModifiers(a.state)).suicidePerSecond;
    // 0.1% of 1000 = 1 death/s, added on top of the rate-driven suicides (not scaled by the mul).
    expect(on - off).toBeCloseTo(0.001 * 1000, 6);
  });
});
