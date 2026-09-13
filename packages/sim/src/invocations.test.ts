/**
 * Invocation tests (02 §7 / §12, 03 §2.4). Pins the reworked roster:
 *   - catalog integrity (the full id list, gates, caps, upkeep shapes)
 *   - invoking power = sum of equipped maleficia; visibility at ≥ half; unlock at full + Sin level
 *   - every invocation is free to summon (no upfront soul/gold cost); the cost is per-second upkeep
 *   - upkeep aggregation across copies: flat + %-of-gain + reprobate (flat + fraction) + stagnation;
 *     %-costs are additive (4 copies at 25% zero the gain) and clamp at 1; flat drains dispel
 *   - modifier effects at baseline (invocation efficiency = 1): player-eff (Familiar/Wendigo/Doppel),
 *     income muls (Fama/Specunitas/Plutus/Midas), flat dynamics (Imp/Banshee/Empusa/Lamia/Succubus/
 *     Kobold/Arachne/Harpy/Nightmare), stagnation (Blob/Morpheus), outcome tiers (Behemoth/Narcissus/
 *     Upir), and that invocation effects DON'T scale with player efficiency
 *   - dynamics integration: Imp murders mint souls through the tick
 *   - Katabasis dispels everything
 */
import { describe, expect, it } from 'vitest';
import {
  activeInvocationCount,
  bn,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  currentInvokingPower,
  dispel,
  INVOCATION_IDS,
  invocationById,
  invocationSoulCost,
  invocationUnlocked,
  invocationUpkeep,
  invocationVisible,
  invoke,
  markDoppelgaengerSeen,
  NEUTRAL_MODIFIERS,
  perSecondRates,
  tick,
  type GameState,
  type Sin,
} from './index.js';

function fresh(seed = 'invocations', t = 0): GameState {
  return createInitialState(seed, t);
}
function withSouls(s: GameState, v: number): GameState {
  return { ...s, souls: bn(v) };
}
function withSin(s: GameState, sin: Sin, level: number): GameState {
  return { ...s, devotion: { ...s.devotion, [sin]: bn(180 ** level) } };
}
/** Give the player enough invoking power by equipping power-source maleficia (Black Salt Pouch, +1). */
function withPower(s: GameState, ip: number): GameState {
  return {
    ...s,
    lifetime: { ...s.lifetime, maleficia: Array.from({ length: ip }, () => 'black_salt_pouch') },
  };
}
/** Set an invocation's active count directly (bypasses gates) for effect tests. */
function withInvocation(s: GameState, id: string, count: number): GameState {
  return {
    ...s,
    lifetime: { ...s.lifetime, invocations: { ...s.lifetime.invocations, [id]: count } },
  };
}

describe('Invocation catalog', () => {
  it('exposes the full roster clustered by Sin level then invoking power', () => {
    expect(INVOCATION_IDS).toEqual([
      'familiar',
      'wendigo',
      'blob',
      'empusa',
      'kobold',
      'imp',
      'banshee',
      'narcissus',
      'arachne',
      'upir',
      'lamia',
      'behemoth',
      'harpy',
      'plutus',
      'nightmare',
      'fama',
      'lemure',
      'midas',
      'aurevora',
      'doppelgaenger',
      'succubus',
      'specunitas',
      'astiwihad',
      'erinyes',
      'morpheus',
    ]);
  });

  it('gates and caps match the spec for representative entries', () => {
    const cases: Array<[string, Sin | null, number, number | undefined, number | undefined]> = [
      // id, sin, invokingPower, sinLevel, maxActive
      ['familiar', null, 1, undefined, 1],
      ['wendigo', 'gula', 2, 1, 10],
      ['imp', 'ira', 3, 1, 20],
      ['narcissus', 'superbia', 3, 1, 10],
      ['upir', 'gula', 4, 2, undefined], // stackable
      ['behemoth', 'superbia', 4, 2, 10],
      ['lemure', 'acedia', 6, 2, 4],
      ['midas', 'avaritia', 7, 3, 1],
      ['doppelgaenger', 'superbia', 8, 3, 1],
      ['morpheus', 'acedia', 10, 3, 1],
    ];
    for (const [id, sin, ip, lvl, cap] of cases) {
      const def = invocationById(id)!;
      expect(def.sin).toBe(sin);
      expect(def.invokingPower).toBe(ip);
      expect(def.sinLevel).toBe(lvl);
      expect(def.maxActive).toBe(cap);
    }
  });

  it('upkeep shapes: the new cost dimensions (compound, reprobate, fraction, stagnation)', () => {
    expect(invocationById('imp')!.upkeep).toEqual({ gold: 10, goldGainFraction: 0.01 });
    expect(invocationById('arachne')!.upkeep).toEqual({ reprobate: 50 });
    expect(invocationById('upir')!.upkeep).toEqual({ stagnation: 0.2 });
    expect(invocationById('morpheus')!.upkeep).toEqual({ reprobateFraction: 0.05 });
    expect(invocationById('behemoth')!.upkeep).toEqual({
      goldGainFraction: 0.00625,
      influenceGainFraction: 0.00625,
    });
  });
});

describe('Invoking power + gates', () => {
  it('invoking power sums equipped maleficia', () => {
    expect(currentInvokingPower(fresh())).toBe(0);
    expect(currentInvokingPower(withPower(fresh(), 5))).toBe(5);
  });

  it('an invocation is visible at half its required invoking power', () => {
    const def = invocationById('wendigo')!; // requires 2
    expect(invocationVisible(withPower(fresh(), 0), def)).toBe(false); // 0 < 1
    expect(invocationVisible(withPower(fresh(), 1), def)).toBe(true); // 1 ≥ 1 (half of 2)
  });

  it('unlock requires full invoking power AND the Sin level', () => {
    const def = invocationById('wendigo')!; // IP 2, Gula 1
    let s = withPower(fresh(), 2);
    expect(invocationUnlocked(s, def)).toBe(false); // Gula 0
    s = withSin(s, 'gula', 1);
    expect(invocationUnlocked(s, def)).toBe(true);
  });
});

describe('No upfront cost — every invocation is free to summon', () => {
  it('invocationSoulCost is 0 for every invocation (cost is per-second upkeep)', () => {
    for (const id of INVOCATION_IDS) {
      expect(invocationSoulCost(withSouls(fresh(), 1e9), invocationById(id)!).toNumber()).toBe(0);
    }
    expect(invocationById('morpheus')!.soulCost).toBeUndefined();
    expect(invocationById('morpheus')!.goldCost).toBeUndefined();
  });
});

describe('Invocation upkeep (per-second, Invocatio sheet)', () => {
  it('aggregates flat, %-of-gain, reprobate (flat + fraction) and stagnation drains across copies', () => {
    let s = withInvocation(fresh(), 'imp', 2); // 2 × (10 gold/s + 1% gold gain)
    s = withInvocation(s, 'fama', 1); // 25% gold gain/s
    s = withInvocation(s, 'succubus', 1); // 99% gold gain/s → clamps the gold-gain total to 1
    s = withInvocation(s, 'lemure', 2); // 2 × 25% influence gain/s
    s = withInvocation(s, 'arachne', 1); // 50 reprobates/s (flat)
    s = withInvocation(s, 'morpheus', 1); // 5% of the reprobate pool/s
    s = withInvocation(s, 'upir', 3); // 3 × 0.2 stagnation/s
    const up = invocationUpkeep(s, 100);
    expect(up.flatGoldPerSecond).toBe(20);
    expect(up.goldGainFraction).toBe(1); // 0.02 + 0.25 + 0.99 clamped to 1
    expect(up.influenceGainFraction).toBeCloseTo(0.5, 6); // 2 × 0.25
    expect(up.flatReprobatesPerSecond).toBe(50);
    expect(up.reprobateFraction).toBeCloseTo(0.05, 6);
    expect(up.flatStagnationPerSecond).toBeCloseTo(0.6, 6); // 3 × 0.2
    expect(up.flatGoldDrainers).toContain('imp');
    expect(up.flatReprobateDrainers).toContain('arachne');
    expect(up.flatStagnationDrainers).toContain('upir');
  });

  it('%-of-gain costs are additive: four Fama zero the gold gain (clamped at 1)', () => {
    const four = invocationUpkeep(withInvocation(fresh(), 'fama', 4), 100);
    expect(four.goldGainFraction).toBe(1); // 4 × 0.25 = 1.0 → all gold gain consumed
  });

  it('reduces the net per-second influence rate (perSecondRates), e.g. Plutus 3/s', () => {
    const big: GameState = {
      ...fresh(),
      lifetime: { ...fresh().lifetime, maxInfluence: bn(1_000_000) },
    };
    const without = perSecondRates(big).influence.toNumber();
    const withPlutus = perSecondRates(withInvocation(big, 'plutus', 1)).influence.toNumber();
    expect(without - withPlutus).toBeCloseTo(3, 6);
  });

  it('dispels a flat-gold-drain invocation the pool can’t sustain', () => {
    let s = withSin(withPower(fresh(), 3), 'ira', 1);
    s = { ...s, lifetime: { ...s.lifetime, gold: bn(3), invocations: { imp: 1 } } };
    const r = tick(s, 1); // 3 + 2 income − 10 flat < 0 → Imp dispels; only the tiny fraction is paid
    expect(r.state.lifetime.invocations.imp ?? 0).toBe(0);
    expect(r.state.lifetime.gold.toNumber()).toBeCloseTo(4.98, 2); // 5 − 1% of the 2 gained; flat unpaid
    expect(r.notices.some((n) => n.includes('imp'))).toBe(true);
  });

  it('dispels a flat-reprobate-drain invocation the population can’t sustain (no souls minted)', () => {
    const s: GameState = {
      ...fresh(),
      souls: bn(0),
      lifetime: { ...fresh().lifetime, reprobates: 3, invocations: { arachne: 1 } },
    };
    const r = tick(s, 1); // Arachne needs 50 reprobates this tick; only 3 alive → dispel, take none
    expect(r.state.lifetime.invocations.arachne ?? 0).toBe(0);
    expect(r.state.lifetime.reprobates).toBe(3);
    expect(r.state.souls.toNumber()).toBe(0); // a cost mints no souls, and none were taken anyway
  });
});

describe('invoke / dispel', () => {
  it('rejects when gates are unmet', () => {
    expect(invoke(withSouls(fresh(), 1e6), 'behemoth').ok).toBe(false); // no power, no Superbia
  });

  it('summons a free invocation and increments the count without deducting souls', () => {
    let s = withSin(withPower(fresh(), 2), 'gula', 1);
    s = withSouls(s, 1000);
    const r = invoke(s, 'wendigo');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(activeInvocationCount(r.state, 'wendigo')).toBe(1);
    expect(r.state.souls.toNumber()).toBe(1000); // no upfront soul cost
  });

  it('stacks an uncapped invocation', () => {
    const s = withSin(withPower(fresh(), 5), 'avaritia', 2);
    const r1 = invoke(s, 'plutus');
    if (!r1.ok) throw new Error('r1');
    const r2 = invoke(r1.state, 'plutus');
    if (!r2.ok) throw new Error('r2');
    expect(activeInvocationCount(r2.state, 'plutus')).toBe(2);
  });

  it('enforces the maxActive cap on apex entities', () => {
    const s = withSin(withPower(fresh(), 12), 'superbia', 3);
    const r1 = invoke(s, 'doppelgaenger'); // free, max 1
    if (!r1.ok) throw new Error('r1');
    const r2 = invoke(r1.state, 'doppelgaenger');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toMatch(/limit/);
  });

  it('dispel decrements then deletes the key', () => {
    const s = withInvocation(fresh(), 'fama', 2);
    const d1 = dispel(s, 'fama');
    if (!d1.ok) throw new Error('d1');
    expect(activeInvocationCount(d1.state, 'fama')).toBe(1);
    const d2 = dispel(d1.state, 'fama');
    if (!d2.ok) throw new Error('d2');
    expect(activeInvocationCount(d2.state, 'fama')).toBe(0);
    expect('fama' in d2.state.lifetime.invocations).toBe(false);
    expect(dispel(d2.state, 'fama').ok).toBe(false);
  });
});

describe('Invocation modifier effects (baseline invocation efficiency = 1)', () => {
  it('Midas: ×10 gold and ×10 apocalyptic weight', () => {
    const base = computeModifiers(fresh());
    const mid = computeModifiers(withInvocation(fresh(), 'midas', 1));
    expect(mid.goldRateMul).toBeCloseTo(base.goldRateMul * 10, 6);
    expect(mid.tierWeightMul.apocalyptic).toBeCloseTo(10, 6);
  });

  it('Doppelgaenger: +100% player efficiency; Wendigo: +2%/copy; both flat (no invEff scaling)', () => {
    const base = computeModifiers(fresh()).playerEfficiencyMul;
    expect(
      computeModifiers(withInvocation(fresh(), 'doppelgaenger', 1)).playerEfficiencyMul,
    ).toBeCloseTo(base * 2, 6);
    expect(computeModifiers(withInvocation(fresh(), 'wendigo', 5)).playerEfficiencyMul).toBeCloseTo(
      base * (1 + 0.02 * 5),
      6,
    );
  });

  it('Specunitas ×3 influence; Fama +7.5%/copy; Plutus +15%/copy Faeneratio output', () => {
    const base = computeModifiers(fresh());
    expect(computeModifiers(withInvocation(fresh(), 'specunitas', 1)).influenceRateMul).toBeCloseTo(
      base.influenceRateMul * 3,
      6,
    );
    expect(computeModifiers(withInvocation(fresh(), 'fama', 2)).influenceRateMul).toBeCloseTo(
      base.influenceRateMul * (1 + 0.075 * 2),
      6,
    );
    expect(computeModifiers(withInvocation(fresh(), 'plutus', 2)).faenerationOutputMul).toBeCloseTo(
      1 + 0.15 * 2,
      6,
    );
  });

  it('flat dynamics contributions: Imp murders, Banshee suicides, generation, gold, influence', () => {
    expect(computeModifiers(withInvocation(fresh(), 'imp', 3)).flatMurdersPerSecond).toBeCloseTo(
      3,
      6,
    );
    expect(
      computeModifiers(withInvocation(fresh(), 'banshee', 4)).flatSuicidesPerSecond,
    ).toBeCloseTo(4, 6);
    expect(
      computeModifiers(withInvocation(fresh(), 'empusa', 2)).flatGenerationPerSecond,
    ).toBeCloseTo(2, 6);
    expect(
      computeModifiers(withInvocation(fresh(), 'lamia', 2)).flatGenerationPerSecond,
    ).toBeCloseTo(100, 6); // 2 × 50
    expect(
      computeModifiers(withInvocation(fresh(), 'succubus', 1)).flatGenerationPerSecond,
    ).toBeCloseTo(10000, 6);
    expect(computeModifiers(withInvocation(fresh(), 'kobold', 3)).flatGoldPerSecond).toBeCloseTo(
      300,
      6,
    );
    expect(
      computeModifiers(withInvocation(fresh(), 'arachne', 2)).flatInfluencePerSecond,
    ).toBeCloseTo(0.5, 6); // 2 × 0.25
  });

  it('per-capita base rate shifts: Harpy murder + Nightmare suicide (mul untouched)', () => {
    const harpy = computeModifiers(withInvocation(fresh(), 'harpy', 2));
    expect(harpy.flatBaseMurderRatePerSecond).toBeCloseTo(0.005 * 2, 9);
    expect(harpy.murderRateMul).toBe(NEUTRAL_MODIFIERS.murderRateMul);
    const nightmare = computeModifiers(withInvocation(fresh(), 'nightmare', 3));
    expect(nightmare.flatBaseSuicideRatePerSecond).toBeCloseTo(0.005 * 3, 9);
    expect(nightmare.reprobateSuicideRateMul).toBe(NEUTRAL_MODIFIERS.reprobateSuicideRateMul);
  });

  it('stagnation generation: Blob flat, Morpheus population-scaled', () => {
    expect(
      computeModifiers(withInvocation(fresh(), 'blob', 2)).flatStagnationPerSecond,
    ).toBeCloseTo(0.00625 * 2, 6);
    const withPop: GameState = {
      ...withInvocation(fresh(), 'morpheus', 1),
      lifetime: { ...withInvocation(fresh(), 'morpheus', 1).lifetime, reprobates: 1000 },
    };
    // 0.05 × 1000 × 0.001 = 0.05/s
    expect(computeModifiers(withPop).flatStagnationPerSecond).toBeCloseTo(0.05, 6);
  });

  it('outcome tiers: Behemoth flat Stellar chance, Narcissus +1% positives, Upir softens negatives', () => {
    // Behemoth is now a FLAT additive to the Stellar chance (post-normalization), not a weight mul.
    const beh = computeModifiers(withInvocation(fresh(), 'behemoth', 1));
    expect(beh.flatStellarChance).toBeCloseTo(0.00025, 8);
    expect(beh.tierWeightMul.stellar).toBeUndefined();
    const narc = computeModifiers(withInvocation(fresh(), 'narcissus', 1)).tierWeightMul;
    expect(narc.stellar).toBeCloseTo(1.01, 6);
    expect(narc.excellent).toBeCloseTo(1.01, 6);
    expect(narc.good).toBeCloseTo(1.01, 6);
    const upir = computeModifiers(withInvocation(fresh(), 'upir', 2)).tierWeightMul;
    expect(upir.bad).toBeCloseTo(1 / (1 + 0.01 * 2), 6); // asymptotic softening, never negative
    expect(upir.terrible).toBeCloseTo(1 / (1 + 0.01 * 2), 6);
  });

  it('invocation effects do NOT scale with player efficiency', () => {
    // A Doppelgänger (×2 player efficiency) alongside an Imp leaves the Imp's murders unchanged.
    const imp = computeModifiers(withInvocation(fresh(), 'imp', 1)).flatMurdersPerSecond;
    const both = computeModifiers(
      withInvocation(withInvocation(fresh(), 'imp', 1), 'doppelgaenger', 1),
    ).flatMurdersPerSecond;
    expect(both).toBeCloseTo(imp, 6);
  });
});

describe('Dynamics integration through the tick', () => {
  it('Imp murders mint one soul each (a kill, unlike the reprobate upkeep cost)', () => {
    const s: GameState = {
      ...fresh(),
      souls: bn(0),
      lifetime: {
        ...fresh().lifetime,
        gold: bn(1_000_000), // cover the Imp's gold upkeep so it isn't dispelled
        reprobates: 1000,
        invocations: { imp: 3 },
      },
    };
    const r = tick(s, 1);
    // 3 Imp murders/s + base murder (0.2) → 3 whole murders; base suicide pool (0.1) < 1 → none.
    expect(r.state.souls.toNumber()).toBe(3);
    expect(r.state.lifetime.reprobates).toBe(997);
  });
});

describe('Katabasis dispels all invocations (02 §7)', () => {
  it('invocations reset to empty on rebirth', () => {
    let s = withInvocation(fresh(), 'fama', 3);
    s = withInvocation(s, 'midas', 1);
    const { state } = commitKatabasis(s);
    expect(Object.keys(state.lifetime.invocations)).toHaveLength(0);
  });
});

describe('tick outcome source tagging (player-only PC log)', () => {
  it('tags acolyte outcomes; player outcomes stay untagged', () => {
    const base = fresh('source-tag', 0);
    const s: GameState = {
      ...base,
      lifetime: {
        ...base.lifetime,
        actionQueue: [{ actionId: 'indagatio', remainingSeconds: 0.05 }], // player → untagged
        acolytes: [{ id: 1, assignedAction: 'indagatio', remainingSeconds: 0.05 }], // → 'acolyte'
      },
    };
    const { events } = tick(s, 2);
    expect(events.some((e) => e.source === undefined)).toBe(true); // player
    expect(events.map((e) => e.source)).toContain('acolyte');
  });
});

describe('markDoppelgaengerSeen — one-time jumpscare flag (pure + idempotent)', () => {
  it('sets the permanent flag without mutating the input, and is idempotent once set', () => {
    const base = fresh('doppel-seen', 0);
    expect(base.flagDoppelgaengerSeen).toBeUndefined();
    const seen = markDoppelgaengerSeen(base);
    expect(seen.flagDoppelgaengerSeen).toBe(true);
    expect(base.flagDoppelgaengerSeen).toBeUndefined(); // input untouched (purity)
    expect(markDoppelgaengerSeen(seen)).toBe(seen); // idempotent
  });

  it('survives Katabasis (a once-seen scare never replays in a later lifetime)', () => {
    const seen = markDoppelgaengerSeen(fresh('doppel-katabasis', 0));
    const { state: descended } = commitKatabasis(seen);
    expect(descended.flagDoppelgaengerSeen).toBe(true);
  });
});
