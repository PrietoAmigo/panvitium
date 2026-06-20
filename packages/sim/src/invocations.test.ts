/**
 * Invocation tests (02 §7 / §12, 03 §2.4). Pins:
 *   - catalog integrity for the wired subset
 *   - invoking power = sum of equipped maleficia
 *   - visibility at ≥ half required invoking power; unlock at full + Sin level
 *   - soul cost = max(fraction × pool, minimum); free apexes cost 0
 *   - invoke deducts souls and increments the count; dispel decrements / deletes
 *   - maxActive cap on apex entities (Midas, Doppelgaenger)
 *   - modifier effects: Midas (3× gold, 100× apoc), Doppelgaenger (1.5× eff, ½ infl),
 *     Fama (+infl/stack), Nightmare (+5% suicide/stack), Harpy (+Decimatio eff/stack),
 *     Behemoth (+50% stellar/stack)
 *   - Mark of Cain ×3 murder rate (no longer zeroes apocalyptic)
 *   - Katabasis dispels everything
 */
import { describe, expect, it } from 'vitest';
import {
  activeInvocationCount,
  actionCycleCost,
  advanceInvocationRunners,
  bn,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  currentInvokingPower,
  dispel,
  INVOCATION_IDS,
  invocationById,
  invocationRunnerEfficiency,
  invocationRunnerKey,
  invocationSoulCost,
  invocationUnlocked,
  invocationUpkeep,
  invocationVisible,
  invoke,
  makeRng,
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
/** Give the player enough invoking power by equipping power-source maleficia. */
function withPower(s: GameState, ip: number): GameState {
  // Black Salt Pouch grants 1 invoking power each and is stackable — stack to the target.
  const maleficia = Array.from({ length: ip }, () => 'black_salt_pouch');
  return { ...s, lifetime: { ...s.lifetime, maleficia } };
}
/** Set an invocation's active count directly (bypasses gates) for effect tests. */
function withInvocation(s: GameState, id: string, count: number): GameState {
  return {
    ...s,
    lifetime: { ...s.lifetime, invocations: { ...s.lifetime.invocations, [id]: count } },
  };
}

describe('Invocation catalog', () => {
  it('exposes the wired subset', () => {
    expect(INVOCATION_IDS).toEqual([
      'familiar',
      'imp',
      'upir',
      'fama',
      'nightmare',
      'harpy',
      'lamia',
      'lemure',
      'behemoth',
      'midas',
      'plutus',
      'succubus',
      'doppelgaenger',
      'astiwihad',
      'aurevora',
      'erinyes',
      'morpheus',
      'specunitas',
    ]);
  });

  it('apex entities cap at 1; the rest are stackable', () => {
    expect(invocationById('midas')!.maxActive).toBe(1);
    expect(invocationById('doppelgaenger')!.maxActive).toBe(1);
    expect(invocationById('fama')!.maxActive).toBeUndefined();
  });

  it('only the Familiar (Special) caps among the runners; Normal runners stack', () => {
    // The Familiar is the lone Special — one only. The Normal-type runners (Imp/Upir/Lamia) have no
    // cap: each summoned copy runs its own channel, so stacking multiplies throughput.
    expect(invocationById('familiar')!.maxActive).toBe(1);
    for (const id of ['imp', 'upir', 'lamia']) {
      expect(invocationById(id)!.maxActive).toBeUndefined();
    }
  });

  it('the new per-tick apexes carry their gates and are free, max-1', () => {
    const astiwihad = invocationById('astiwihad')!;
    expect(astiwihad.invokingPower).toBe(10);
    expect(astiwihad.sin).toBe('tristitia');
    expect(astiwihad.sinLevel).toBe(3);
    expect(astiwihad.maxActive).toBe(1);
    expect(astiwihad.soulCost).toBeUndefined();
    const aurevora = invocationById('aurevora')!;
    expect(aurevora.invokingPower).toBe(7);
    expect(aurevora.sin).toBe('gula');
    expect(aurevora.sinLevel).toBe(3);
    expect(aurevora.maxActive).toBe(1);
    expect(aurevora.soulCost).toBeUndefined();
  });
});

describe('Invoking power + gates', () => {
  it('invoking power sums equipped maleficia', () => {
    expect(currentInvokingPower(fresh())).toBe(0);
    expect(currentInvokingPower(withPower(fresh(), 5))).toBe(5);
  });

  it('an invocation is visible at half its required invoking power', () => {
    const def = invocationById('behemoth')!; // requires 2
    expect(invocationVisible(withPower(fresh(), 0), def)).toBe(false); // 0 < 1
    expect(invocationVisible(withPower(fresh(), 1), def)).toBe(true); // 1 ≥ 1 (half of 2)
  });

  it('unlock requires full invoking power AND the Sin level', () => {
    const def = invocationById('behemoth')!; // IP 2, Superbia 1
    let s = withPower(fresh(), 2);
    expect(invocationUnlocked(s, def)).toBe(false); // Superbia 0
    s = withSin(s, 'superbia', 1);
    expect(invocationUnlocked(s, def)).toBe(true);
  });
});

describe('Soul cost (one-time, Morpheus only)', () => {
  it('is a fraction of the current pool (Morpheus 90%)', () => {
    const morpheus = invocationById('morpheus')!;
    // pool 2000 → 90% = 1800. Normals no longer carry a soul cost (per-second upkeep instead).
    expect(invocationSoulCost(withSouls(fresh(), 2000), morpheus).toNumber()).toBe(1800);
    expect(invocationById('fama')!.soulCost).toBeUndefined();
  });

  it('is zero for free apex invocations', () => {
    expect(invocationSoulCost(withSouls(fresh(), 1e9), invocationById('midas')!).toNumber()).toBe(
      0,
    );
  });
});

describe('Invocation upkeep (per-second, Invocatio sheet)', () => {
  it('aggregates flat, %-of-gain, and %-of-max-influence drains across active copies', () => {
    let s = withInvocation(fresh(), 'imp', 2); // 2 × 10 gold/s
    s = withInvocation(s, 'fama', 1); // 25% gold gain/s
    s = withInvocation(s, 'succubus', 1); // 99% gold gain/s → clamps total to 1
    s = withInvocation(s, 'lemure', 1); // 1% of max influence/s
    const up = invocationUpkeep(s, 100);
    expect(up.flatGoldPerSecond).toBe(20);
    expect(up.goldGainFraction).toBe(1); // 0.25 + 0.99 clamped to 1
    expect(up.flatInfluencePerSecond).toBeCloseTo(1, 6); // 1% of max 100
    expect(up.flatGoldDrainers).toContain('imp');
  });

  it('reduces the net per-second influence rate (perSecondRates), e.g. Plutus 3/s', () => {
    // High max influence so the gross gain dwarfs the upkeep (no clamp at 0). Plutus has a flat
    // 3 influence/s upkeep and no gold runner, so the net rate drops by exactly 3.
    const big: GameState = {
      ...fresh(),
      lifetime: { ...fresh().lifetime, maxInfluence: bn(1_000_000) },
    };
    const without = perSecondRates(big).influence.toNumber();
    const withPlutus = perSecondRates(withInvocation(big, 'plutus', 1)).influence.toNumber();
    expect(without - withPlutus).toBeCloseTo(3, 6);
  });

  it('dispels a flat-drain invocation the pool can’t sustain', () => {
    let s = withSin(withPower(fresh(), 2), 'ira', 1);
    s = { ...s, lifetime: { ...s.lifetime, gold: bn(3), invocations: { imp: 1 } } };
    const r = tick(s, 1); // 3 + 2 income − 10 upkeep < 0 → Imp dispels, gold keeps the income
    expect(r.state.lifetime.invocations.imp ?? 0).toBe(0);
    expect(r.state.lifetime.gold.toNumber()).toBeCloseTo(5, 6); // 3 + 2 income, flat not paid
    expect(r.notices.some((n) => n.includes('imp'))).toBe(true);
  });
});

describe('invoke / dispel', () => {
  it('rejects when gates are unmet', () => {
    const r = invoke(withSouls(fresh(), 1e6), 'behemoth'); // no power, no Superbia
    expect(r.ok).toBe(false);
  });

  it('summons a normal with no souls — normals have no upfront cost (upkeep is per-tick)', () => {
    const s = withSin(withPower(fresh(), 2), 'superbia', 1); // 0 souls
    const r = invoke(s, 'behemoth');
    expect(r.ok).toBe(true);
  });

  it('summons a free normal and increments the count without deducting souls', () => {
    let s = withSin(withPower(fresh(), 2), 'superbia', 1);
    s = withSouls(s, 1000);
    const r = invoke(s, 'behemoth');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(activeInvocationCount(r.state, 'behemoth')).toBe(1);
    expect(r.state.souls.toNumber()).toBe(1000); // no upfront soul cost
  });

  it('stacks a stackable invocation', () => {
    let s = withSin(withPower(fresh(), 3), 'superbia', 1);
    s = withSouls(s, 1_000_000);
    const r1 = invoke(s, 'behemoth');
    if (!r1.ok) throw new Error('r1');
    const r2 = invoke(r1.state, 'behemoth');
    if (!r2.ok) throw new Error('r2');
    expect(activeInvocationCount(r2.state, 'behemoth')).toBe(2);
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

describe('Invocation modifier effects', () => {
  it('Midas: 3× gold and 100× apocalyptic weight', () => {
    const base = computeModifiers(fresh());
    const mid = computeModifiers(withInvocation(fresh(), 'midas', 1));
    expect(mid.goldRateMul).toBeCloseTo(base.goldRateMul * 3, 6);
    expect(mid.tierWeightMul.apocalyptic).toBeCloseTo(100, 6);
  });

  it('Mark of Cain triples murder rate and no longer zeroes apocalyptic (Midas ×100 stands)', () => {
    let s = withInvocation(fresh(), 'midas', 1);
    s = { ...s, lifetime: { ...s.lifetime, maleficia: ['mark_of_cain'] } };
    const m = computeModifiers(s);
    expect(m.tierWeightMul.apocalyptic).toBeCloseTo(100, 6); // Midas hundredfold; no Cain lock
    expect(m.murderRateMul).toBeCloseTo(3, 6); // Mark of Cain ×3 murder (sheet rev 2026-06-12)
  });

  it('Doppelgaenger: +50% player efficiency; its influence cost is now per-tick upkeep', () => {
    const base = computeModifiers(fresh());
    const dop = computeModifiers(withInvocation(fresh(), 'doppelgaenger', 1));
    expect(dop.playerEfficiencyMul).toBeCloseTo(base.playerEfficiencyMul * 1.5, 6);
    expect(dop.influenceRateMul).toBeCloseTo(base.influenceRateMul, 6); // no longer halved here
    expect(invocationById('doppelgaenger')!.upkeep).toEqual({ influenceGainFraction: 0.5 });
  });

  it('Specunitas (apex Vanagloria): ×2 influence gain/s', () => {
    const base = computeModifiers(fresh()).influenceRateMul;
    const spec = computeModifiers(withInvocation(fresh(), 'specunitas', 1)).influenceRateMul;
    expect(spec).toBeCloseTo(base * 2, 6);
  });

  it('Fama: additive influence increase scaled by player efficiency (0.05/stack at baseline)', () => {
    const two = computeModifiers(withInvocation(fresh(), 'fama', 2));
    // Baseline playerEff = invEff = 1, so each Fama adds 0.05 to the influence-rate multiplier.
    expect(two.influenceRateMul).toBeCloseTo(1 + 0.05 * 2, 6);
  });

  it('Nightmare: additive increase to base suicide rate, not the multiplier', () => {
    const three = computeModifiers(withInvocation(fresh(), 'nightmare', 3));
    // Baseline playerEff = invEff = 1, so each Nightmare adds 5e-5 to the per-capita base rate (sheet).
    expect(three.flatBaseSuicideRatePerSecond).toBeCloseTo(5e-5 * 3, 9);
    expect(three.reprobateSuicideRateMul).toBe(NEUTRAL_MODIFIERS.reprobateSuicideRateMul); // mul untouched
  });

  it('Harpy no longer lifts Decimatio efficiency — its effect is now a Pogrom runner (#8)', () => {
    const two = computeModifiers(withInvocation(fresh(), 'harpy', 2));
    expect(two.decimatioEfficiencyMul).toBeCloseTo(1, 6); // blanket Decimatio boost retired
    expect(two.murderRateMul).toBe(NEUTRAL_MODIFIERS.murderRateMul); // murder untouched
    expect(invocationById('harpy')!.autonomous).toEqual({
      action: 'pogrom',
      efficiency: 0.05,
      forcedTier: 'good',
    });
  });

  it('Behemoth: additive increase to Stellar weight (efficiency-scaled, 0.0005/stack baseline)', () => {
    const two = computeModifiers(withInvocation(fresh(), 'behemoth', 2));
    expect(two.tierWeightMul.stellar).toBeCloseTo(1 + 0.0005 * 2, 6); // baseline playerEff/invEff = 1
  });

  it('no invocations → bundle matches the neutral baseline for the affected fields', () => {
    const m = computeModifiers(fresh());
    expect(m.murderRateMul).toBe(NEUTRAL_MODIFIERS.murderRateMul);
    expect(m.tierWeightMul.apocalyptic).toBeUndefined();
    expect(m.tierWeightMul.stellar).toBeUndefined();
  });
});

describe('Katabasis dispels all invocations (02 §7)', () => {
  it('invocations reset to empty on rebirth', () => {
    let s = withInvocation(fresh(), 'fama', 3);
    s = withInvocation(s, 'midas', 1);
    const { state } = commitKatabasis(s);
    expect(Object.keys(state.lifetime.invocations)).toHaveLength(0);
  });

  it('autonomous runners are cleared on rebirth too', () => {
    const s = {
      ...withInvocation(fresh(), 'familiar', 1),
      lifetime: {
        ...withInvocation(fresh(), 'familiar', 1).lifetime,
        invocationRunners: { familiar: 1234 },
      },
    };
    const { state } = commitKatabasis(s);
    expect(Object.keys(state.lifetime.invocationRunners)).toHaveLength(0);
  });
});

describe('Familiar — the hybrid (02 §3)', () => {
  it('caps at 1, costs nothing, gates on invoking power only (no Sin)', () => {
    const def = invocationById('familiar')!;
    expect(def.maxActive).toBe(1);
    expect(def.sin).toBeNull();
    expect(def.autonomous).toEqual({ action: 'indagatio', efficiency: 0.01 });
    expect(invocationSoulCost(fresh(), def).toNumber()).toBe(0);
    expect(invocationUnlocked(withPower(fresh(), 2), def)).toBe(true);
    expect(invocationUnlocked(withPower(fresh(), 1), def)).toBe(false);
  });

  it('lifts player efficiency by +33% while active', () => {
    const base = computeModifiers(fresh()).playerEfficiencyMul;
    const withFam = computeModifiers(withInvocation(fresh(), 'familiar', 1)).playerEfficiencyMul;
    expect(withFam).toBeCloseTo(base * 1.33, 6);
  });

  it('runs Indagatio in its own channel without touching the player slot', () => {
    const s = withInvocation(fresh(), 'familiar', 1);
    const r = advanceInvocationRunners(s, 0.1, makeRng(1));
    // A runner timer is lazily started; the player's action queue is untouched.
    expect(r.state.lifetime.invocationRunners.familiar).toBeGreaterThan(0);
    expect(r.state.lifetime.actionQueue).toHaveLength(0);
  });

  it('resolves Indagatio cycles at 1% of player efficiency over a large (offline) delta', () => {
    const s = withInvocation(fresh(), 'familiar', 1);
    // Cycle time = 300 / (0.01 × playerEff). playerEff = 1.33 (Familiar boost) → ~22.6k s/cycle.
    // A 7-day delta resolves ~26 cycles; assert it produced at least a handful of events.
    const r = advanceInvocationRunners(s, 604_800, makeRng(7));
    expect(r.events.length).toBeGreaterThanOrEqual(5);
    expect(r.events.every((e) => e.actionId === 'indagatio')).toBe(true);
    expect(r.state.lifetime.invocationRunners.familiar).toBeGreaterThan(0); // mid next cycle
  });

  it('drops the runner timer once the Familiar is dispelled', () => {
    const s = {
      ...fresh(),
      lifetime: { ...fresh().lifetime, invocationRunners: { familiar: 1000 } },
    };
    // No active familiar → the stale timer is cleared on the next advance.
    const r = advanceInvocationRunners(s, 0.1, makeRng(0));
    expect(Object.keys(r.state.lifetime.invocationRunners)).toHaveLength(0);
    expect(r.events).toHaveLength(0);
  });
});

describe('Imp — autonomous Good-only Decimatio (03 §2.4)', () => {
  const withGold = (s: GameState, v: number): GameState => ({
    ...s,
    lifetime: { ...s.lifetime, gold: bn(v) },
  });
  const withReprobates = (s: GameState, n: number): GameState => ({
    ...s,
    lifetime: { ...s.lifetime, reprobates: n },
  });
  /** The Imp's per-cycle gold cost at its effective efficiency (0.05 × player efficiency). */
  const impGold = (s: GameState): number =>
    actionCycleCost('caedis', 0.05 * computeModifiers(s).playerEfficiencyMul).gold;

  it('is gated on power 2 + Ira 1, stackable, and runs a Good-only Caedis channel', () => {
    const def = invocationById('imp')!;
    expect(def.sin).toBe('ira');
    expect(def.invokingPower).toBe(2);
    expect(def.sinLevel).toBe(1);
    expect(def.maxActive).toBeUndefined(); // Normal type → stacks (one channel per copy)
    expect(def.autonomous).toEqual({ action: 'caedis', efficiency: 0.05, forcedTier: 'good' });
    expect(def.upkeep).toEqual({ gold: 10 }); // 10 gold/s upkeep
  });

  it('Upir is the Gula counterpart — power 3 + Gula 1, a stackable Good-only Caedis channel', () => {
    const def = invocationById('upir')!;
    expect(def.sin).toBe('gula');
    expect(def.invokingPower).toBe(3);
    expect(def.sinLevel).toBe(1);
    expect(def.maxActive).toBeUndefined(); // Normal type → stacks
    expect(def.autonomous).toEqual({ action: 'caedis', efficiency: 0.05, forcedTier: 'good' });
    expect(def.upkeep).toEqual({ influence: 1 }); // 1 influence/s upkeep
  });

  it('Lamia is the Luxuria Logismoi runner — power 4 + Luxuria 2, stackable', () => {
    const def = invocationById('lamia')!;
    expect(def.sin).toBe('luxuria');
    expect(def.invokingPower).toBe(4);
    expect(def.sinLevel).toBe(2);
    // Normal type → no cap. Each summoned copy runs its own channel, so stacking scales throughput.
    expect(def.maxActive).toBeUndefined();
    expect(def.autonomous).toEqual({ action: 'logismoi', efficiency: 0.05 }); // background Suasio runner (#8)
    expect(def.upkeep).toEqual({ influence: 3 }); // 3 influence/s upkeep
  });

  it('Lamia runs a background Suasio (logismoi) channel without touching the player slot', () => {
    let s = withInvocation(fresh(), 'lamia', 1);
    s = { ...s, lifetime: { ...s.lifetime, influence: bn(1000) } }; // afford the logismoi cost
    const r = advanceInvocationRunners(s, 0.1, makeRng(1));
    expect(r.state.lifetime.invocationRunners.lamia).toBeGreaterThan(0); // a runner timer started
    expect(r.state.lifetime.actionQueue).toHaveLength(0); // player action slot untouched
  });

  it('Plutus is a stackable Avaritia output booster — power 5 + Avaritia 2', () => {
    const def = invocationById('plutus')!;
    expect(def.sin).toBe('avaritia');
    expect(def.invokingPower).toBe(5);
    expect(def.sinLevel).toBe(2);
    expect(def.maxActive).toBeUndefined(); // stackable
    expect(def.autonomous).toBeUndefined();
    expect(def.upkeep).toEqual({ influence: 3 }); // 3 influence/s upkeep
  });

  it('Succubus is the apex Luxuria — power 9 + Luxuria 3, capped at 1, free', () => {
    const def = invocationById('succubus')!;
    expect(def.sin).toBe('luxuria');
    expect(def.invokingPower).toBe(9);
    expect(def.sinLevel).toBe(3);
    expect(def.maxActive).toBe(1);
    expect(def.soulCost).toBeUndefined(); // no one-time soul cost (its cost is upkeep)
    expect(invocationSoulCost(withSouls(fresh(), 100_000), def).toNumber()).toBe(0);
    expect(def.upkeep).toEqual({ goldGainFraction: 0.99 }); // 99% gold gain/s upkeep
    expect(def.autonomous).toEqual({ action: 'imperium', efficiency: 0.99 }); // #8: Imperium runner
  });

  it('Succubus runs an autonomous Imperium channel (pays influence, leaves the player slot free)', () => {
    let s = withInvocation(fresh(), 'succubus', 1);
    // A big influence cushion so the 100-influence Imperium cycles can pay; high max so it isn't capped.
    s = {
      ...s,
      lifetime: { ...s.lifetime, influence: bn(1_000_000), maxInfluence: bn(10_000_000) },
    };
    // 25 s over ~10 s cost-outcome cycles → a couple of Imperium resolutions plus a partial timer.
    const r = advanceInvocationRunners(s, 25, makeRng(3));
    expect(r.state.lifetime.invocationRunners.succubus).toBeGreaterThan(0); // a runner timer started
    expect(r.state.lifetime.actionQueue).toHaveLength(0); // player action slot untouched
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.events.every((e) => e.actionId === 'imperium')).toBe(true);
  });

  it('Lemure is a stackable Acedia influence source — power 3 + Acedia 1', () => {
    const def = invocationById('lemure')!;
    expect(def.sin).toBe('acedia');
    expect(def.invokingPower).toBe(3);
    expect(def.sinLevel).toBe(1);
    expect(def.maxActive).toBeUndefined(); // stackable
    expect(def.autonomous).toBeUndefined();
    expect(def.upkeep).toEqual({ maxInfluenceFraction: 0.01 }); // 1% max influence/s upkeep
  });

  it('runs Decimatio in its own channel — pays gold, mints souls, leaves the player slot free', () => {
    const s = withReprobates(withGold(withInvocation(fresh(), 'imp', 1), 1000), 100);
    const cost = impGold(s);
    const soulsBefore = s.souls.toNumber();
    // 25 s ≈ 2 full 10 s cycles + a partial third (cost-outcome cycle = base 10 s).
    const r = advanceInvocationRunners(s, 25, makeRng(3));
    expect(r.events.length).toBeGreaterThanOrEqual(2);
    expect(r.events.every((e) => e.actionId === 'caedis')).toBe(true);
    expect(r.state.souls.toNumber()).toBe(soulsBefore + r.events.length); // 1 kill → 1 soul each
    expect(r.state.lifetime.reprobates).toBe(100 - r.events.length);
    // Cost is paid at each cycle's START, so a paid-but-in-flight cycle means paid ≥ resolved.
    const paid = 1000 - r.state.lifetime.gold.toNumber();
    expect(paid % cost).toBe(0);
    expect(paid).toBeGreaterThanOrEqual(r.events.length * cost);
    expect(r.state.lifetime.actionQueue).toHaveLength(0);
  });

  it('Good-only: over many cycles gold drops by cost alone (never a gold-loss tier)', () => {
    const s = withReprobates(withGold(withInvocation(fresh(), 'imp', 1), 1000), 1000);
    const cost = impGold(s);
    const soulsBefore = s.souls.toNumber();
    const r = advanceInvocationRunners(s, 100, makeRng(9)); // 10 cycles of 10 s
    expect(r.events).toHaveLength(10);
    expect(r.state.lifetime.gold.toNumber()).toBe(1000 - 10 * cost); // pure cost, no Bad/Terrible
    expect(r.state.souls.toNumber()).toBe(soulsBefore + 10);
    expect(r.state.lifetime.reprobates).toBe(990);
  });

  it('stalls when gold runs out — no key persisted, no further kills', () => {
    const s = withReprobates(withGold(withInvocation(fresh(), 'imp', 1), 12), 1000);
    const r = advanceInvocationRunners(s, 1000, makeRng(4)); // affords only 2 cycles (5 each)
    expect(r.events).toHaveLength(2);
    expect(r.state.lifetime.gold.toNumber()).toBe(2);
    expect(r.state.lifetime.invocationRunners.imp).toBeUndefined(); // stalled ⇒ key omitted
  });

  it('stacking a runner multiplies throughput — two imps cull ~2× one (independent channels)', () => {
    const base = withReprobates(withGold(fresh(), 100_000), 1000);
    // 105 s → 10 full 10 s cycles per channel, plus an in-flight 11th (so a timer key persists).
    const one = advanceInvocationRunners(withInvocation(base, 'imp', 1), 105, makeRng(9));
    const two = advanceInvocationRunners(withInvocation(base, 'imp', 2), 105, makeRng(9));
    // The cost-outcome cycle is a fixed 10 s, so each channel resolves 10 cycles regardless of eff —
    // a second copy means a second channel, i.e. double the kills.
    expect(one.events).toHaveLength(10);
    expect(two.events).toHaveLength(20);
    const oneSouls = one.state.souls.toNumber() - base.souls.toNumber();
    const twoSouls = two.state.souls.toNumber() - base.souls.toNumber();
    expect(twoSouls).toBe(2 * oneSouls); // 1 soul per Good kill, scaled by the copy count
    // Copy 0 keeps the bare id key; the extra copy runs on its own suffixed channel.
    expect(two.state.lifetime.invocationRunners.imp).toBeGreaterThan(0);
    expect(two.state.lifetime.invocationRunners['imp#1']).toBeGreaterThan(0);
    expect(one.state.lifetime.invocationRunners['imp#1']).toBeUndefined(); // one copy ⇒ no suffix
  });
});

describe('Analytics surface: runner key + channel efficiency', () => {
  it('keys copy 0 bare and stacked copies suffixed', () => {
    expect(invocationRunnerKey('imp', 0)).toBe('imp');
    expect(invocationRunnerKey('imp', 1)).toBe('imp#1');
    expect(invocationRunnerKey('imp', 2)).toBe('imp#2');
  });

  it('channel efficiency = autonomous.efficiency × the modifier terms (the value the advance uses)', () => {
    const s = withInvocation(fresh(), 'familiar', 1);
    const fam = invocationById('familiar')!;
    const mods = computeModifiers(s);
    // Familiar has no Sin, so no per-Sin term; it is its own +33% playerEfficiency source.
    expect(invocationRunnerEfficiency(s, fam)).toBeCloseTo(
      fam.autonomous!.efficiency * mods.playerEfficiencyMul * mods.invocationEfficiencyMul,
      10,
    );
  });

  it('folds the runner Sin effectiveness term for a Sin-aligned runner (Imp → Ira)', () => {
    const s = withInvocation(fresh(), 'imp', 1);
    const imp = invocationById('imp')!;
    const mods = computeModifiers(s);
    expect(invocationRunnerEfficiency(s, imp)).toBeCloseTo(
      imp.autonomous!.efficiency *
        mods.playerEfficiencyMul *
        mods.invocationEfficiencyMul *
        mods.invocationSinEffectivenessMul.ira,
      10,
    );
  });

  it('returns 0 for a passive invocation (no autonomous channel)', () => {
    expect(invocationRunnerEfficiency(fresh(), invocationById('fama')!)).toBe(0);
  });
});

describe('tick outcome source tagging (player-only PC log)', () => {
  it('tags acolyte and invocation-runner outcomes; player outcomes stay untagged', () => {
    const base = fresh('source-tag', 0);
    const s: GameState = {
      ...base,
      lifetime: {
        ...base.lifetime,
        // A player Indagatio about to complete (time-mode, free) → an untagged player outcome.
        actionQueue: [{ actionId: 'indagatio', remainingSeconds: 0.05 }],
        // An acolyte mid-Indagatio about to complete → an outcome tagged 'acolyte'.
        acolytes: [{ id: 1, assignedAction: 'indagatio', remainingSeconds: 0.05 }],
        // A bound Familiar whose Indagatio channel is about to complete → tagged 'invocation'.
        invocations: { ...base.lifetime.invocations, familiar: 1 },
        invocationRunners: { familiar: 0.05 },
      },
    };
    const { events } = tick(s, 2); // 2s completes all three channels
    const sources = events.map((e) => e.source);
    expect(events.some((e) => e.source === undefined)).toBe(true); // player
    expect(sources).toContain('acolyte');
    expect(sources).toContain('invocation');
  });
});

describe('markDoppelgaengerSeen — one-time jumpscare flag (pure + idempotent)', () => {
  it('sets the permanent flag without mutating the input, and is idempotent once set', () => {
    const base = fresh('doppel-seen', 0);
    expect(base.flagDoppelgaengerSeen).toBeUndefined();

    const seen = markDoppelgaengerSeen(base);
    expect(seen.flagDoppelgaengerSeen).toBe(true);
    expect(base.flagDoppelgaengerSeen).toBeUndefined(); // input untouched (purity)

    // Idempotent: a second mark returns the same reference (no needless new state).
    expect(markDoppelgaengerSeen(seen)).toBe(seen);
  });

  it('survives Katabasis (a once-seen scare never replays in a later lifetime)', () => {
    const seen = markDoppelgaengerSeen(fresh('doppel-katabasis', 0));
    const { state: descended } = commitKatabasis(seen);
    expect(descended.flagDoppelgaengerSeen).toBe(true);
  });
});
