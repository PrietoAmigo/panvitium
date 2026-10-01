import { describe, it, expect } from 'vitest';
import { bn, floor } from './bignum.js';
import { hashSeed, makeRng } from './rng.js';
import { createInitialState, totalReprobates, type GameState, type Sin } from './state.js';
import { addReprobates } from './population.js';
import {
  startAction,
  resolveAction,
  resolveSuggestion,
  resolveLogismoi,
  resolveImperium,
  resolveIndagatio,
  actionUnlocked,
  actionTierDistribution,
  actionOutcomeForecast,
  isAutoRepeatable,
  isAutoRepeating,
  setAutoRepeat,
  ensureAutoRepeatStarted,
  plannedActionCost,
  ACTIONS,
} from './actions.js';
import { categoryEfficiency } from './modifiers.js';
import { MALEFICIA, MALEFICIUM_PRICE_RANGE } from './maleficia.js';
import { tick } from './tick.js';

const fresh = (): GameState => createInitialState('seed', 0);
const rng = () => makeRng(hashSeed('test'));
const soulsOf = (s: GameState): number => floor(s.souls).toNumber();
const goldOf = (s: GameState): number => floor(s.lifetime.gold).toNumber();
const withGold = (s: GameState, g: number): GameState => ({
  ...s,
  lifetime: { ...s.lifetime, gold: bn(g) },
});
const withLuxuria = (s: GameState, level: number): GameState => ({
  ...s,
  devotion: { ...s.devotion, luxuria: bn(180 ** level) },
});
const withInfluence = (s: GameState, n: number): GameState => ({
  ...s,
  lifetime: { ...s.lifetime, influence: bn(n) },
});
const withIra = (s: GameState, level: number): GameState => ({
  ...s,
  devotion: { ...s.devotion, ira: bn(180 ** level) },
});
/** Set an arbitrary Sin to `level` (via its exact Devotion threshold) — for max-Sin-level gating. */
const withSin = (s: GameState, sin: Sin, level: number): GameState => ({
  ...s,
  devotion: { ...s.devotion, [sin]: bn(180 ** level) },
});
const withReprobates = (s: GameState, n: number): GameState => ({
  ...s,
  lifetime: { ...s.lifetime, reprobates: n },
});
const withSouls = (s: GameState, n: number): GameState => ({ ...s, souls: bn(n) });

describe('startAction', () => {
  it('refuses suggestion without enough influence and rejects unknown actions', () => {
    expect(startAction(fresh(), 'suggestion').ok).toBe(false);
    expect(startAction(fresh(), 'nope').ok).toBe(false);
  });

  it('the retired Decimatio rites are unknown actions (ADR-038)', () => {
    const rich = withInfluence(withGold(withIra(fresh(), 4), 10_000_000), 100);
    for (const id of ['caedes', 'pogrom', 'purgatio']) {
      expect(ACTIONS[id]).toBeUndefined();
      const r = startAction(rich, id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe(`unknown action: ${id}`);
    }
  });

  it('the action catalog holds only the Suasio rites and the two background channels', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(
      ['emptio', 'imperium', 'indagatio', 'logismoi', 'suggestion'].sort(),
    );
    expect(new Set(Object.values(ACTIONS).map((d) => d.category))).toEqual(
      new Set(['suasio', 'indagatio', 'emptio']),
    );
  });

  it('queues suggestion and deducts influence', () => {
    const s = { ...fresh(), lifetime: { ...fresh().lifetime, influence: bn(1) } };
    const r = startAction(s, 'suggestion');
    expect(r.ok).toBe(true);
    if (r.ok) expect(floor(r.state.lifetime.influence).toNumber()).toBe(0);
  });

  it('refuses a second action while one is already underway, then allows it once resolved', () => {
    const start = withInfluence(fresh(), 50);
    const first = startAction(start, 'suggestion');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const blocked = startAction(first.state, 'suggestion'); // a rite is underway
    expect(blocked.ok).toBe(false);
    const resolved = tick(first.state, 10).state; // the suggestion completes, queue empties
    expect(startAction(resolved, 'suggestion').ok).toBe(true);
  });
});

describe('action unlock gating (max Sin level, not a specific Sin)', () => {
  it('gates Logismoi at level 1 and Imperium at level 3, satisfied by ANY Sin', () => {
    expect(actionUnlocked(fresh(), ACTIONS.logismoi!)).toBe(false);
    // The gate reads the HIGHEST Sin level across all Sins (player tuning), so a non-Luxuria Sin
    // opens a Suasio rite: Tristitia I unlocks Logismoi as well as Luxuria I does.
    expect(actionUnlocked(withSin(fresh(), 'tristitia', 1), ACTIONS.logismoi!)).toBe(true);
    expect(actionUnlocked(withLuxuria(fresh(), 1), ACTIONS.logismoi!)).toBe(true);
    // Imperium needs level 3 from any Sin: level 2 is not enough, level 3 is.
    expect(actionUnlocked(withSin(fresh(), 'tristitia', 2), ACTIONS.imperium!)).toBe(false);
    expect(actionUnlocked(withSin(fresh(), 'tristitia', 3), ACTIONS.imperium!)).toBe(true);
    expect(actionUnlocked(fresh(), ACTIONS.suggestion!)).toBe(true); // ungated, always open
  });

  it('startAction refuses a locked action, then allows it once the Sin level is reached', () => {
    const withInf = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, influence: bn(100) },
    });
    expect(startAction(withInf(fresh()), 'logismoi').ok).toBe(false);
    const ok = startAction(withInf(withLuxuria(fresh(), 2)), 'logismoi');
    expect(ok.ok).toBe(true);
    // Luxuria L2 also lifts Suasio efficiency ×4 (sheet rev). Suasio influence cost scales by the
    // LOG of efficiency (playability retune): 25 × (1 + ln 4) = 25 × 2.386 → ceil 60 influence.
    if (ok.ok) expect(floor(ok.state.lifetime.influence).toNumber()).toBe(40); // 100 - 60
  });
});

describe('resolveLogismoi', () => {
  it('good adds 14..39 and excellent 41..74 reprobates (player tuning)', () => {
    const g = resolveLogismoi(fresh(), 'good', rng()).lifetime.reprobates;
    expect(g).toBeGreaterThanOrEqual(14);
    expect(g).toBeLessThanOrEqual(39);
    const e = resolveLogismoi(fresh(), 'excellent', rng()).lifetime.reprobates;
    expect(e).toBeGreaterThanOrEqual(41);
    expect(e).toBeLessThanOrEqual(74);
  });
  it('stellar adds +5% of the current population (player tuning)', () => {
    const seeded = withReprobates(fresh(), 1000);
    const after = resolveLogismoi(seeded, 'stellar', rng());
    expect(totalReprobates(after) - 1000).toBe(50); // floor(1000 × 0.05)
  });
  it('apocalyptic sheds 5% of the flock (player tuning)', () => {
    const seeded = withReprobates(fresh(), 1000);
    expect(totalReprobates(resolveLogismoi(seeded, 'apocalyptic', rng()))).toBe(950);
  });
  it('terrible culls reprobates; neutral does nothing', () => {
    const seeded = addReprobates(fresh(), 100);
    expect(totalReprobates(resolveLogismoi(seeded, 'terrible', rng()))).toBeLessThan(100);
    expect(totalReprobates(resolveLogismoi(seeded, 'neutral', rng()))).toBe(100);
  });
});

describe('resolveImperium', () => {
  it('takes the decided 10s to cast', () => {
    expect(ACTIONS.imperium!.baseTimeSeconds).toBe(10);
  });

  it('costs 40 influence (player tuning: the sheet 100, cut 2.5×)', () => {
    expect(ACTIONS.imperium!.cost).toEqual({ influence: 40 });
  });

  it('good adds 100–1000 reprobates (the fixed player-controlled outcome is retired)', () => {
    const n = resolveImperium(fresh(), 'good', rng()).lifetime.reprobates;
    expect(n).toBeGreaterThanOrEqual(100);
    expect(n).toBeLessThanOrEqual(1000);
  });

  it('stellar adds +25% and excellent +7% of the population; neither mints souls (player tuning)', () => {
    const seeded = withSouls(withReprobates(fresh(), 1000), 200);
    const stellar = resolveImperium(seeded, 'stellar', rng());
    expect(totalReprobates(stellar)).toBe(1250); // +floor(1000 × 0.25)
    expect(soulsOf(stellar)).toBe(200); // Stellar no longer mints souls
    expect(totalReprobates(resolveImperium(seeded, 'excellent', rng()))).toBe(1070); // +floor(1000 × 0.07)
  });

  it('terrible sheds 2.5% and apocalyptic 10% of the flock (player tuning)', () => {
    const seeded = withReprobates(fresh(), 1000);
    expect(totalReprobates(resolveImperium(seeded, 'terrible', rng()))).toBe(975);
    expect(totalReprobates(resolveImperium(seeded, 'apocalyptic', rng()))).toBe(900);
  });
});

describe('resolveSuggestion', () => {
  it('good adds one unconverted reprobate', () => {
    expect(resolveSuggestion(fresh(), 'good', rng()).lifetime.reprobates).toBe(1);
  });

  it('stellar adds 10..25 unconverted reprobates and mints no soul', () => {
    const s = resolveSuggestion(fresh(), 'stellar', rng());
    expect(soulsOf(s)).toBe(0);
    const n = s.lifetime.reprobates;
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(25);
    expect(totalReprobates(s)).toBe(n); // all unconverted
  });

  it('excellent adds 2..9 reprobates and mints no soul (player tuning)', () => {
    const s = resolveSuggestion(fresh(), 'excellent', rng());
    expect(soulsOf(s)).toBe(0);
    expect(totalReprobates(s)).toBeGreaterThanOrEqual(2);
    expect(totalReprobates(s)).toBeLessThanOrEqual(9);
  });

  it('apocalyptic sheds a quarter of the flock (player tuning)', () => {
    expect(
      totalReprobates(resolveSuggestion(addReprobates(fresh(), 100), 'apocalyptic', rng())),
    ).toBe(75);
  });

  it('bad removes a reprobate; terrible loses 5% of the population', () => {
    expect(totalReprobates(resolveSuggestion(addReprobates(fresh(), 3), 'bad', rng()))).toBe(2);
    expect(totalReprobates(resolveSuggestion(addReprobates(fresh(), 100), 'terrible', rng()))).toBe(
      95,
    );
  });

  it('neutral changes nothing', () => {
    const s = resolveSuggestion(fresh(), 'neutral', rng());
    expect(totalReprobates(s)).toBe(0);
    expect(soulsOf(s)).toBe(0);
  });
});

describe('tick — action resolution and events', () => {
  it('resolves a queued action only once its time elapses', () => {
    const started = startAction(withInfluence(fresh(), 5), 'suggestion');
    if (!started.ok) throw new Error('should start');
    const half = tick(started.state, 0.5);
    expect(half.state.lifetime.actionQueue).toHaveLength(1);
    expect(half.state.lifetime.actionQueue[0]?.remainingSeconds ?? 0).toBeCloseTo(0.5, 5);
    expect(half.events).toHaveLength(0);
    const done = tick(half.state, 0.5);
    expect(done.state.lifetime.actionQueue).toHaveLength(0);
    expect(done.events).toHaveLength(1);
    expect(done.events[0]?.actionId).toBe('suggestion');
  });

  it('resolves the corruption loop deterministically from the saved RNG state', () => {
    const seeded = withInfluence(addReprobates(fresh(), 10), 50);
    const started = startAction(seeded, 'suggestion');
    if (!started.ok) throw new Error('should start');
    const after = tick(started.state, 10);
    expect(after.state.lifetime.actionQueue).toHaveLength(0);
    expect(after.state.rngState).not.toBe(started.state.rngState); // the outcome consumed the RNG
    const again = tick(started.state, 10);
    expect(after.state.souls.toString()).toBe(again.state.souls.toString());
    expect(totalReprobates(after.state)).toBe(totalReprobates(again.state));
  });
});

describe('resolveAction', () => {
  it('returns an event describing the outcome', () => {
    const s0 = addReprobates(fresh(), 5);
    const { state, event } = resolveAction(s0, 'suggestion', rng());
    expect(event).not.toBeNull();
    if (event) {
      expect(event.actionId).toBe('suggestion');
      expect(event.soulsDelta).toBe(0); // a temptation corrupts; it never harvests
      expect(totalReprobates(state) - totalReprobates(s0)).toBe(event.reprobateDelta);
    }
  });

  it('returns a null event for an unknown action, a retired Decimatio rite included', () => {
    expect(resolveAction(fresh(), 'nope', rng()).event).toBeNull();
    const s0 = addReprobates(fresh(), 5);
    const r = resolveAction(s0, 'caedes', rng());
    expect(r.event).toBeNull();
    expect(r.state).toBe(s0); // untouched: no cull, no soul
  });
});

describe('modifier integration', () => {
  it('startAction defaults its efficiency to playerEfficiency(state) — Gula skill scales cost', () => {
    // Gula Devotion 32 400 → Insatiability intensity ≈ 1.6502 (sheet rev: skill, not level) →
    // playerEfficiencyMul ≈ 2.6502. Suasio cost scales by the LOG of efficiency (playability retune):
    // Suggestion costs ceil(1 × (1 + ln 2.6502)) = ceil(1.975) = 2 influence.
    const base = fresh();
    const state: GameState = {
      ...base,
      devotion: { ...base.devotion, gula: bn(32400) },
      lifetime: { ...base.lifetime, influence: bn(50) },
    };
    const r = startAction(state, 'suggestion');
    expect(r.ok).toBe(true);
    if (r.ok) expect(floor(r.state.lifetime.influence).toNumber()).toBe(48); // 50 - 2
  });

  it('startAction with Gula L2 and only enough influence for L0 cost is refused', () => {
    // 1 influence covers an unscaled (eff=1, cost 1) Suggestion but not the Gula-scaled cost 2.
    const base = fresh();
    const state: GameState = {
      ...base,
      devotion: { ...base.devotion, gula: bn(32400) },
      lifetime: { ...base.lifetime, influence: bn(1) },
    };
    const r = startAction(state, 'suggestion');
    expect(r.ok).toBe(false);
  });
});

describe('modifier integration — per-category efficiency', () => {
  it('Luxuria levels scale Suggestion cost but not the time-mode channels (sheet rev 2026-06-12)', () => {
    // Luxuria L1 → suasioEffMul = 2. Suggestion influence cost = ceil(1 × 2) = 2.
    const base = fresh();
    const state: GameState = {
      ...base,
      devotion: { ...base.devotion, luxuria: bn(180) },
      lifetime: { ...base.lifetime, influence: bn(100), gold: bn(500) },
    };
    const r1 = startAction(state, 'suggestion');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(floor(r1.state.lifetime.influence).toNumber()).toBe(98); // 100 − 2
    // The Suasio lift never reaches Indagatio or Emptio.
    expect(categoryEfficiency(state, 'indagatio')).toBe(1);
    expect(categoryEfficiency(state, 'emptio')).toBe(1);
  });

  it('Ira levels scale no action cost now that Decimatio is retired (ADR-038)', () => {
    const base = withInfluence(withGold(fresh(), 1000), 100);
    const ira = withIra(base, 3);
    for (const id of Object.keys(ACTIONS)) {
      expect(plannedActionCost(ira, id)).toEqual(plannedActionCost(base, id));
    }
    const r = startAction(withIra(base, 1), 'suggestion');
    expect(r.ok).toBe(true);
    if (r.ok) expect(floor(r.state.lifetime.influence).toNumber()).toBe(99); // 100 − 1
  });
});

describe('modifier integration — tier weight shifts reach resolveAction', () => {
  it('Lucifer (Morning Star) at L4 reliably shifts Logismoi tier choices on shared RNG seeds', () => {
    // At Lucifer L4 (intensity ≈ 6.60 / 1.317 ≈ 5.01), Stellar weight goes from 0.01 → ≈ 0.06
    // (pre-normalization); normalized Stellar share is ≈ 6 %. Across many identical seeds the same
    // draw lands on a different tier a few percent of the time. The bar here is non-zero: prove the
    // wiring is real.
    const trials = 200;
    let differing = 0;
    for (let i = 0; i < trials; i++) {
      const s0 = createInitialState(`tier-${i}`, 0);
      const sL: GameState = {
        ...s0,
        devotion: { ...s0.devotion, superbia: bn(1049760000) },
      };
      const seed = hashSeed(`wire-${i}`);
      const t0 = resolveAction(s0, 'logismoi', makeRng(seed)).event?.tier;
      const tL = resolveAction(sL, 'logismoi', makeRng(seed)).event?.tier;
      if (t0 !== tL) differing++;
    }
    expect(differing).toBeGreaterThan(5);
  });
});

describe('resolveAction — per-category success shift (Resignation, 02 §2)', () => {
  /** Roll `n` outcomes of `actionId` against a fixed seed and count success tiers (Good+). */
  function successesOf(state: GameState, actionId: string, n: number): number {
    const r = makeRng(hashSeed('shift-test'));
    let succ = 0;
    for (let i = 0; i < n; i++) {
      const { event } = resolveAction(state, actionId, r, {});
      if (
        event &&
        (event.tier === 'stellar' || event.tier === 'excellent' || event.tier === 'good')
      )
        succ++;
    }
    return succ;
  }

  it('high Tristitia yields more Suasio successes than none (same seed)', () => {
    const base = successesOf(fresh(), 'suggestion', 400);
    const withResignation = successesOf(
      { ...fresh(), devotion: { ...fresh().devotion, tristitia: bn(1_000_000) } },
      'suggestion',
      400,
    );
    expect(withResignation).toBeGreaterThan(base);
  });

  it('high Ira shifts no category: Retribution lost its Decimatio half (ADR-038)', () => {
    const ira = { ...fresh(), devotion: { ...fresh().devotion, ira: bn(1_000_000) } };
    // Same seed, same draws: Ira's skill leaves every surviving category's tier weights untouched.
    for (const id of ['suggestion', 'logismoi', 'indagatio']) {
      expect(successesOf(ira, id, 400)).toBe(successesOf(fresh(), id, 400));
    }
  });
});

describe('delegated (low-efficiency) resolutions scale their LOSSES by efficiency', () => {
  // Gold loss goes through a BigNum fraction multiply then a floor, so the kept amount can land a
  // coin under the arithmetic value; assertions on gold allow ±1 while the reprobate counts (integer
  // fractions of an integer pool) stay exact.
  const near = (n: number, target: number): void => {
    expect(n).toBeGreaterThanOrEqual(target - 1);
    expect(n).toBeLessThanOrEqual(target);
  };

  it('Indagatio Apocalyptic at efficiency 0.5 halves the gold bite', () => {
    const s = withGold(fresh(), 1_000_000);
    // Full: −80% gold. At 0.5: −40%.
    near(goldOf(resolveIndagatio(s, 'apocalyptic', rng(), 1).state), 200_000); // 1e6 × (1 − 0.8)
    near(goldOf(resolveIndagatio(s, 'apocalyptic', rng(), 0.5).state), 600_000); // 1e6 × (1 − 0.4)
  });

  it('Suggestion Terrible at efficiency 0.5 halves the flock loss', () => {
    const s = addReprobates(fresh(), 1000);
    expect(totalReprobates(resolveSuggestion(s, 'terrible', rng(), 1))).toBe(950); // −5%
    expect(totalReprobates(resolveSuggestion(s, 'terrible', rng(), 0.5))).toBe(975); // −2.5%
  });

  it('Suggestion Apocalyptic at invocation-runner efficiency 0.05 barely dents the flock', () => {
    const s = addReprobates(fresh(), 1000);
    expect(totalReprobates(resolveSuggestion(s, 'apocalyptic', rng(), 1))).toBe(750); // −25%
    // 0.25 × 0.05 = 1.25% loss → floor(1000 × 0.0125) = 12 removed.
    expect(totalReprobates(resolveSuggestion(s, 'apocalyptic', rng(), 0.05))).toBe(988);
  });

  it('a hand cast (efficiency ≥ 1) is unchanged — the clamp keeps losses at full strength', () => {
    const s = withGold(addReprobates(fresh(), 200), 1000);
    // eff 3 (a heavily-built player) still loses the full 15% — never more (the clamp caps at 1).
    near(goldOf(resolveIndagatio(s, 'terrible', rng(), 3).state), 850); // 1000 × (1 − 0.15)
  });
});

describe('rolled Emptio pricing (Maleficia sheet)', () => {
  it('rolls and stores an in-band price for each surfaced maleficium', () => {
    const r = resolveIndagatio(fresh(), 'stellar', makeRng(5)); // stellar → anathema chain
    expect(r.surfaced.length).toBeGreaterThan(0);
    for (const id of r.surfaced) {
      const price = r.state.lifetime.maleficiaPrices[id]!;
      const band = MALEFICIUM_PRICE_RANGE[MALEFICIA[id]!.rarity];
      expect(price).toBeGreaterThanOrEqual(band.min);
      expect(price).toBeLessThanOrEqual(band.max);
    }
  });

  it('Emptio charges the rolled price, not the catalog cost', () => {
    let s = resolveIndagatio(fresh(), 'good', makeRng(9)).state; // good → rare/common
    const id = Object.keys(s.lifetime.maleficiaPrices)[0]!;
    const price = s.lifetime.maleficiaPrices[id]!;
    s = withGold(s, price + 5000);
    const before = goldOf(s);
    const r = startAction(s, 'emptio', { target: id });
    expect(r.ok).toBe(true);
    if (r.ok) expect(before - goldOf(r.state)).toBe(price); // time-mode: cost paid up front, unscaled
  });
});

import { TIERS } from './probability.js';

describe('actionTierDistribution (oracular reveals, 5.1)', () => {
  it('returns a normalized distribution (sums to 1) for a real action', () => {
    const s = createInitialState('oracle-test', 0);
    const dist = actionTierDistribution(s, 'suggestion');
    const total = TIERS.reduce((acc, t) => acc + dist[t], 0);
    expect(total).toBeCloseTo(1, 10);
    for (const t of TIERS) expect(dist[t]).toBeGreaterThanOrEqual(0);
  });

  it('reflects the full Imperium distribution (the fixed-Good certainty is retired)', () => {
    const s = createInitialState('oracle-test', 0);
    const dist = actionTierDistribution(s, 'imperium');
    expect(dist.good).toBeCloseTo(0.45, 10);
    expect(dist.stellar).toBeCloseTo(0.05, 10);
    expect(dist.apocalyptic).toBeCloseTo(0.05, 10);
  });

  it('reflects the base weights for Suggestion (Good is the dominant tier)', () => {
    const s = createInitialState('oracle-test', 0);
    const dist = actionTierDistribution(s, 'suggestion');
    for (const t of TIERS) if (t !== 'good') expect(dist.good).toBeGreaterThan(dist[t]);
  });

  it('Behemoth adds a FLAT bump to the Stellar chance globally (post-normalization)', () => {
    const base = createInitialState('oracle-test', 0);
    const withBehemoth: GameState = {
      ...base,
      lifetime: { ...base.lifetime, invocations: { ...base.lifetime.invocations, behemoth: 4 } },
    };
    const b = actionTierDistribution(base, 'imperium');
    const w = actionTierDistribution(withBehemoth, 'imperium');
    // 4 copies × 0.00025 × invEff(1) = 0.001 added straight onto the Stellar chance.
    expect(w.stellar - b.stellar).toBeCloseTo(0.001, 6);
    expect(TIERS.reduce((acc, t) => acc + w[t], 0)).toBeCloseTo(1, 10); // still a valid distribution
  });

  it('falls back to all-Neutral for an unknown action id', () => {
    const s = createInitialState('oracle-test', 0);
    const dist = actionTierDistribution(s, 'not_an_action');
    expect(dist.neutral).toBe(1);
  });
});

describe('actionOutcomeForecast — expected outcome + variance', () => {
  // Monte-Carlo the REAL resolver at the same state/efficiency and assert the analytical forecast
  // matches its empirical moments — this pins the closed-form moments to the actual resolve logic,
  // so any drift in a resolve function fails here.
  function empirical(
    state: GameState,
    actionId: string,
    eff: number,
    forcedTier: 'good' | undefined,
    n: number,
  ): { repMean: number; repSd: number; soulMean: number; malMean: number } {
    const r = makeRng(hashSeed('forecast-mc'));
    let sumR = 0;
    let sumR2 = 0;
    let sumS = 0;
    let sumM = 0;
    for (let i = 0; i < n; i++) {
      const { event } = resolveAction(state, actionId, r, {
        efficiency: eff,
        ...(forcedTier ? { forcedTier } : {}),
      });
      const rd = event ? event.reprobateDelta : 0;
      sumR += rd;
      sumR2 += rd * rd;
      sumS += event ? event.soulsDelta : 0;
      sumM += event && event.maleficiaSurfaced ? event.maleficiaSurfaced.length : 0;
    }
    const repMean = sumR / n;
    return {
      repMean,
      repSd: Math.sqrt(Math.max(0, sumR2 / n - repMean * repMean)),
      soulMean: sumS / n,
      malMean: sumM / n,
    };
  }

  it('matches the real Suggestion resolver mean and variance (incl. the %-population Terrible tier)', () => {
    const state = addReprobates(fresh(), 200);
    const f = actionOutcomeForecast(state, 'suggestion', 1);
    const e = empirical(state, 'suggestion', 1, undefined, 40000);
    expect(Math.abs(f.reprobates.mean - e.repMean)).toBeLessThan(0.1);
    expect(Math.abs(f.souls.mean - e.soulMean)).toBeLessThan(0.05);
    expect(Math.abs(f.reprobates.sd - e.repSd)).toBeLessThan(0.3);
    expect(f.reprobates.sd).toBeGreaterThan(0); // stochastic outcome
  });

  it('is deterministic for forced-Good Suggestion: +units reprobates, no souls, sd 0', () => {
    const state = addReprobates(fresh(), 200);
    const f = actionOutcomeForecast(state, 'suggestion', 1, 'good');
    expect(f.reprobates.mean).toBeCloseTo(1, 6);
    expect(f.souls.mean).toBeCloseTo(0, 6);
    expect(f.reprobates.sd).toBeCloseTo(0, 6);
    const e = empirical(state, 'suggestion', 1, 'good', 2000);
    expect(e.repMean).toBeCloseTo(1, 6);
    expect(e.soulMean).toBeCloseTo(0, 6);
  });

  it('returns a zero forecast for a retired Decimatio rite (ADR-038)', () => {
    const f = actionOutcomeForecast(addReprobates(fresh(), 200), 'caedes', 1, 'good');
    expect(f.souls.mean).toBe(0);
    expect(f.reprobates.mean).toBe(0);
  });

  it('forecasts Indagatio as ~one maleficium surfaced per cycle, no soul/reprobate delta', () => {
    const state = fresh(); // full findable roster
    const f = actionOutcomeForecast(state, 'indagatio', 1);
    const e = empirical(state, 'indagatio', 1, undefined, 20000);
    expect(f.maleficia.mean).toBeGreaterThan(0);
    expect(f.maleficia.mean).toBeLessThanOrEqual(1);
    expect(Math.abs(f.maleficia.mean - e.malMean)).toBeLessThan(0.05);
    expect(f.souls.mean).toBe(0);
    expect(f.reprobates.mean).toBe(0);
  });

  it('returns a zero forecast for an unknown action', () => {
    const f = actionOutcomeForecast(fresh(), 'nope', 1);
    expect(f.souls.mean).toBe(0);
    expect(f.reprobates.sd).toBe(0);
  });
});

describe('auto-repeat (player-slot looping, 02 §3)', () => {
  it('gates on the action’s toggle level (delegateUnlock); never Indagatio/Emptio', () => {
    // Suggestion toggles at max Sin level 1: sealed at 0, open at 1 from ANY Sin (Ira included).
    expect(isAutoRepeatable(fresh(), 'suggestion')).toBe(false);
    expect(isAutoRepeatable(withIra(fresh(), 1), 'suggestion')).toBe(true);
    expect(isAutoRepeatable(withSin(fresh(), 'luxuria', 1), 'suggestion')).toBe(true);
    // Logismoi toggles at level 2 (player tuning; was 3) — still sealed at level 1.
    expect(isAutoRepeatable(withIra(fresh(), 1), 'logismoi')).toBe(false);
    expect(isAutoRepeatable(withIra(fresh(), 2), 'logismoi')).toBe(true);
    // No toggle level → never player-auto-repeatable.
    expect(isAutoRepeatable(withIra(fresh(), 3), 'indagatio')).toBe(false);
    expect(isAutoRepeatable(withIra(fresh(), 3), 'emptio')).toBe(false);
    // A retired Decimatio rite is never auto-repeatable (ADR-038).
    expect(isAutoRepeatable(withIra(fresh(), 4), 'caedes')).toBe(false);
  });

  it('enabling adds the id and starts the first cycle immediately', () => {
    // Ira opens the toggle without touching Suasio efficiency, so the cost stays the base 1.
    const s = withIra(withInfluence(fresh(), 100), 1);
    const next = setAutoRepeat(s, 'suggestion', true);
    expect(isAutoRepeating(next, 'suggestion')).toBe(true);
    expect(next.lifetime.autoRepeat).toEqual(['suggestion']);
    // The loop kicked off in the player's slot and paid its first cycle up front.
    expect(next.lifetime.actionQueue).toEqual([{ actionId: 'suggestion', remainingSeconds: 1 }]);
    expect(floor(next.lifetime.influence).toNumber()).toBe(99);
  });

  it('is a no-op when the action is not auto-repeatable yet', () => {
    const s = withInfluence(fresh(), 1000); // every Sin at 0 — suggestion not toggle-unlocked
    const next = setAutoRepeat(s, 'suggestion', true);
    expect(next).toBe(s);
  });

  it('enabling a retired Decimatio rite is a no-op (ADR-038)', () => {
    const s = withIra(withGold(fresh(), 1_000_000), 4);
    expect(setAutoRepeat(s, 'caedes', true)).toBe(s);
  });

  it('enabling one player rite is mutually exclusive with another (one slot)', () => {
    let s = withIra(withInfluence(fresh(), 5000), 3); // both suggestion and logismoi open
    s = setAutoRepeat(s, 'suggestion', true);
    expect(s.lifetime.autoRepeat).toEqual(['suggestion']);
    s = setAutoRepeat(s, 'logismoi', true);
    expect(s.lifetime.autoRepeat).toEqual(['logismoi']); // suggestion dropped — only one rite loops
  });

  it('disabling drops the id but leaves the in-flight cycle to finish', () => {
    let s = setAutoRepeat(withIra(withInfluence(fresh(), 1000), 1), 'suggestion', true);
    expect(s.lifetime.actionQueue).toHaveLength(1);
    s = setAutoRepeat(s, 'suggestion', false);
    expect(isAutoRepeating(s, 'suggestion')).toBe(false);
    expect(s.lifetime.actionQueue).toHaveLength(1); // the running cycle is not cancelled
  });

  it('the tick re-queues an auto-repeating rite after its cycle resolves', () => {
    const s = setAutoRepeat(
      withReprobates(withIra(withInfluence(fresh(), 5000), 1), 100),
      'suggestion',
      true,
    );
    expect(s.lifetime.actionQueue).toHaveLength(1);
    // Advance exactly one cycle: the running suggestion resolves, then a fresh one is queued.
    const after = tick(s, 1).state;
    const queued = after.lifetime.actionQueue.filter((t) => t.actionId === 'suggestion');
    expect(queued).toHaveLength(1);
    expect(queued[0]!.remainingSeconds).toBeCloseTo(1, 3); // a fresh full cycle
  });

  it('a stalled auto-repeat rite retries on a later tick once affordable', () => {
    // Ira 1 (toggle open) but no influence for suggestion's 1: enabling stalls (no timer).
    let s = setAutoRepeat(withIra(fresh(), 1), 'suggestion', true);
    expect(s.lifetime.autoRepeat).toEqual(['suggestion']);
    expect(s.lifetime.actionQueue).toHaveLength(0); // couldn't afford the first cycle
    // A tick while still broke does not start it (one second regenerates only half an influence).
    s = tick(s, 1).state;
    expect(s.lifetime.actionQueue).toHaveLength(0);
    // Fund it, then the next tick picks the loop back up.
    s = withInfluence(s, 1000);
    s = tick(s, 1).state;
    expect(s.lifetime.actionQueue.some((t) => t.actionId === 'suggestion')).toBe(true);
  });

  it('ensureAutoRepeatStarted is idempotent when the rite is already running', () => {
    const s = setAutoRepeat(withIra(withInfluence(fresh(), 1000), 1), 'suggestion', true);
    const again = ensureAutoRepeatStarted(s);
    expect(again.lifetime.actionQueue).toHaveLength(1); // not double-queued
    expect(floor(again.lifetime.influence).toNumber()).toBe(floor(s.lifetime.influence).toNumber()); // not double-charged
  });
});
