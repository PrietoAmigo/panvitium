import { describe, it, expect } from 'vitest';
import { bn, floor } from './bignum.js';
import { hashSeed, makeRng } from './rng.js';
import { createInitialState, totalReprobates, type GameState } from './state.js';
import { addReprobates } from './population.js';
import {
  startAction,
  resolveAction,
  resolveSuggestion,
  resolveCaedes,
  resolveLogismoi,
  resolveImperium,
  resolvePogrom,
  resolvePurgatio,
  resolveIndagatio,
  actionUnlocked,
  actionTierDistribution,
  actionOutcomeForecast,
  isAutoRepeatable,
  isAutoRepeating,
  setAutoRepeat,
  ensureAutoRepeatStarted,
  ACTIONS,
} from './actions.js';
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
const withIra = (s: GameState, level: number): GameState => ({
  ...s,
  devotion: { ...s.devotion, ira: bn(180 ** level) },
});
const withReprobates = (s: GameState, n: number): GameState => ({
  ...s,
  lifetime: { ...s.lifetime, reprobates: n },
});
const withSouls = (s: GameState, n: number): GameState => ({ ...s, souls: bn(n) });

describe('startAction', () => {
  it('queues caedes and deducts its gold cost when affordable', () => {
    const r = startAction(withGold(fresh(), 150), 'caedes');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(goldOf(r.state)).toBe(50); // 150 - 100
      expect(r.state.lifetime.actionQueue).toEqual([{ actionId: 'caedes', remainingSeconds: 1 }]);
    }
  });

  it('refuses caedes without enough gold and rejects unknown actions', () => {
    expect(startAction(fresh(), 'caedes').ok).toBe(false);
    expect(startAction(fresh(), 'nope').ok).toBe(false);
  });

  it('queues suggestion and deducts influence', () => {
    const s = { ...fresh(), lifetime: { ...fresh().lifetime, influence: bn(1) } };
    const r = startAction(s, 'suggestion');
    expect(r.ok).toBe(true);
    if (r.ok) expect(floor(r.state.lifetime.influence).toNumber()).toBe(0);
  });

  it('refuses a second action while one is already underway, then allows it once resolved', () => {
    const start = {
      ...withGold(fresh(), 300),
      lifetime: { ...withGold(fresh(), 300).lifetime, influence: bn(50) },
    };
    const first = startAction(start, 'caedes');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const blocked = startAction(first.state, 'suggestion'); // a rite is underway
    expect(blocked.ok).toBe(false);
    const resolved = tick(first.state, 10).state; // caedes completes, queue empties
    expect(startAction(resolved, 'suggestion').ok).toBe(true);
  });
});

describe('action unlock gating (Suasio sheet)', () => {
  it('gates Logismoi at Luxuria 2 and Imperium at Luxuria 3; ungated actions are always open', () => {
    expect(actionUnlocked(fresh(), ACTIONS.logismoi!)).toBe(false);
    expect(actionUnlocked(withLuxuria(fresh(), 1), ACTIONS.logismoi!)).toBe(false);
    expect(actionUnlocked(withLuxuria(fresh(), 2), ACTIONS.logismoi!)).toBe(true);
    expect(actionUnlocked(withLuxuria(fresh(), 2), ACTIONS.imperium!)).toBe(false);
    expect(actionUnlocked(withLuxuria(fresh(), 3), ACTIONS.imperium!)).toBe(true);
    expect(actionUnlocked(fresh(), ACTIONS.suggestion!)).toBe(true);
  });

  it('startAction refuses a locked action, then allows it once the Sin level is reached', () => {
    const withInf = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, influence: bn(100) },
    });
    expect(startAction(withInf(fresh()), 'logismoi').ok).toBe(false);
    const ok = startAction(withInf(withLuxuria(fresh(), 2)), 'logismoi');
    expect(ok.ok).toBe(true);
    // Luxuria L2 also lifts Suasio efficiency ×4 (sheet rev), and cost-outcome mode scales the
    // cost with it: 25 × 4 = 100 influence.
    if (ok.ok) expect(floor(ok.state.lifetime.influence).toNumber()).toBe(0); // 100 - 100
  });
});

describe('resolveLogismoi', () => {
  it('good adds 10–29 and excellent 20–58 reprobates (sheet rev)', () => {
    const g = resolveLogismoi(fresh(), 'good', rng()).lifetime.reprobates;
    expect(g).toBeGreaterThanOrEqual(10);
    expect(g).toBeLessThanOrEqual(29);
    const e = resolveLogismoi(fresh(), 'excellent', rng()).lifetime.reprobates;
    expect(e).toBeGreaterThanOrEqual(20);
    expect(e).toBeLessThanOrEqual(58);
  });
  it('stellar adds +3% of the current population (sheet rev)', () => {
    const seeded = withReprobates(fresh(), 1000);
    const after = resolveLogismoi(seeded, 'stellar', rng());
    expect(totalReprobates(after) - 1000).toBe(30); // floor(1000 × 0.03)
  });
  it('apocalyptic sheds half the flock', () => {
    const seeded = withReprobates(fresh(), 1000);
    expect(totalReprobates(resolveLogismoi(seeded, 'apocalyptic', rng()))).toBe(500);
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

  it('good adds 100–1000 reprobates (the fixed player-controlled outcome is retired)', () => {
    const n = resolveImperium(fresh(), 'good', rng()).lifetime.reprobates;
    expect(n).toBeGreaterThanOrEqual(100);
    expect(n).toBeLessThanOrEqual(1000);
  });

  it('stellar pays +3% of current souls; excellent +3% of the population (sheet rev)', () => {
    const seeded = withSouls(withReprobates(fresh(), 1000), 200);
    expect(soulsOf(resolveImperium(seeded, 'stellar', rng()))).toBe(206); // +floor(200 × 0.03)
    expect(totalReprobates(resolveImperium(seeded, 'excellent', rng()))).toBe(1030);
  });

  it('terrible sheds 5% and apocalyptic half of the flock', () => {
    const seeded = withReprobates(fresh(), 1000);
    expect(totalReprobates(resolveImperium(seeded, 'terrible', rng()))).toBe(950);
    expect(totalReprobates(resolveImperium(seeded, 'apocalyptic', rng()))).toBe(500);
  });
});

describe('resolveSuggestion', () => {
  it('good adds one unconverted reprobate', () => {
    expect(resolveSuggestion(fresh(), 'good', rng()).lifetime.reprobates).toBe(1);
  });

  it('stellar adds 4..8 unconverted reprobates and mints no soul', () => {
    const s = resolveSuggestion(fresh(), 'stellar', rng());
    expect(soulsOf(s)).toBe(0);
    const n = s.lifetime.reprobates;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(8);
    expect(totalReprobates(s)).toBe(n); // all unconverted
  });

  it('excellent adds 2–4 reprobates and mints no soul (sheet rev)', () => {
    const s = resolveSuggestion(fresh(), 'excellent', rng());
    expect(soulsOf(s)).toBe(0);
    expect(totalReprobates(s)).toBeGreaterThanOrEqual(2);
    expect(totalReprobates(s)).toBeLessThanOrEqual(4);
  });

  it('apocalyptic sheds half the flock (sheet rev)', () => {
    expect(
      totalReprobates(resolveSuggestion(addReprobates(fresh(), 100), 'apocalyptic', rng())),
    ).toBe(50);
  });

  it('bad removes a reprobate; terrible loses 9% of the population', () => {
    expect(totalReprobates(resolveSuggestion(addReprobates(fresh(), 3), 'bad', rng()))).toBe(2);
    expect(totalReprobates(resolveSuggestion(addReprobates(fresh(), 100), 'terrible', rng()))).toBe(
      91,
    );
  });

  it('neutral changes nothing', () => {
    const s = resolveSuggestion(fresh(), 'neutral', rng());
    expect(totalReprobates(s)).toBe(0);
    expect(soulsOf(s)).toBe(0);
  });
});

describe('resolveCaedes', () => {
  it('good kills one reprobate and mints one soul', () => {
    const s = resolveCaedes(addReprobates(fresh(), 5), 'good', rng());
    expect(totalReprobates(s)).toBe(4);
    expect(soulsOf(s)).toBe(1);
  });

  it('mints nothing when there are no reprobates to kill', () => {
    expect(soulsOf(resolveCaedes(fresh(), 'good', rng()))).toBe(0);
  });

  it('never mints more souls than reprobates killed (population caps the kill)', () => {
    const s = resolveCaedes(addReprobates(fresh(), 5), 'stellar', rng()); // would kill 15..45
    expect(totalReprobates(s)).toBe(0);
    expect(soulsOf(s)).toBe(5);
  });

  it('bad and terrible lose 5% and 15% of current gold', () => {
    expect(goldOf(resolveCaedes(withGold(fresh(), 1000), 'bad', rng()))).toBe(950);
    expect(goldOf(resolveCaedes(withGold(fresh(), 1000), 'terrible', rng()))).toBe(850);
  });

  it('apocalyptic loses 33% gold and 25% of all reprobates, minting no souls (sheet rev)', () => {
    const s0 = withGold(addReprobates(fresh(), 100), 1000);
    const s = resolveCaedes(s0, 'apocalyptic', rng());
    expect(goldOf(s)).toBe(670); // 1000 → keep 67%
    expect(totalReprobates(s)).toBe(75); // 100 → lose 25%
    expect(soulsOf(s)).toBe(0); // taken by the Higher Power, not harvested
  });
});

describe('tick — action resolution and events', () => {
  it('resolves a queued action only once its time elapses', () => {
    const started = startAction(withGold(fresh(), 200), 'caedes');
    if (!started.ok) throw new Error('should start');
    const half = tick(started.state, 0.5);
    expect(half.state.lifetime.actionQueue).toHaveLength(1);
    expect(half.state.lifetime.actionQueue[0]?.remainingSeconds ?? 0).toBeCloseTo(0.5, 5);
    expect(half.events).toHaveLength(0);
    const done = tick(half.state, 0.5);
    expect(done.state.lifetime.actionQueue).toHaveLength(0);
    expect(done.events).toHaveLength(1);
    expect(done.events[0]?.actionId).toBe('caedes');
  });

  it('closes the corruption → cull → soul loop deterministically', () => {
    const seeded = withGold(addReprobates(fresh(), 10), 500);
    const started = startAction(seeded, 'caedes');
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
    const { state, event } = resolveAction(addReprobates(fresh(), 5), 'caedes', rng());
    expect(event).not.toBeNull();
    if (event) {
      expect(event.actionId).toBe('caedes');
      expect(event.soulsDelta + event.reprobateDelta).toBe(0); // souls minted == reprobates killed
      expect(soulsOf(state)).toBe(event.soulsDelta);
    }
  });

  it('returns a null event for an unknown action', () => {
    expect(resolveAction(fresh(), 'nope', rng()).event).toBeNull();
  });
});

describe('modifier integration', () => {
  it('startAction defaults its efficiency to playerEfficiency(state) — Gula skill scales cost', () => {
    // Gula Devotion 32 400 → Insatiability intensity ≈ 1.6502 (sheet rev: skill, not level) →
    // playerEfficiencyMul ≈ 2.6502. Suggestion costs ceil(1 × 2.6502) = 3 influence.
    const base = fresh();
    const state: GameState = {
      ...base,
      devotion: { ...base.devotion, gula: bn(32400) },
      lifetime: { ...base.lifetime, influence: bn(50) },
    };
    const r = startAction(state, 'suggestion');
    expect(r.ok).toBe(true);
    if (r.ok) expect(floor(r.state.lifetime.influence).toNumber()).toBe(47); // 50 - 3
  });

  it('startAction with Gula L2 and only enough influence for L0 cost is refused', () => {
    // 1 influence covers an unscaled (eff=1, cost 1) Suggestion but not the Gula-scaled cost 3.
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
  it('Luxuria levels scale Suggestion cost but not Caedes (sheet rev 2026-06-12)', () => {
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

    // Caedes on the same state pays base 100 gold (no Decimatio boost in play).
    const r2 = startAction(state, 'caedes');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(floor(r2.state.lifetime.gold).toNumber()).toBe(400); // 500 − 100
  });

  it('Ira levels scale Caedes cost but not Suggestion (sheet rev 2026-06-12)', () => {
    // Ira L1 → decimatioEffMul = 2. Caedes gold cost = ceil(100 × 2) = 200.
    const base = fresh();
    const state: GameState = {
      ...base,
      devotion: { ...base.devotion, ira: bn(180) },
      lifetime: { ...base.lifetime, influence: bn(100), gold: bn(1000) },
    };
    const r1 = startAction(state, 'caedes');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(floor(r1.state.lifetime.gold).toNumber()).toBe(800); // 1000 − 200

    const r2 = startAction(state, 'suggestion');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(floor(r2.state.lifetime.influence).toNumber()).toBe(99); // 100 − 1
  });
});

describe('modifier integration — tier weight shifts reach resolveAction', () => {
  it('Lucifer (Morning Star) at L4 reliably shifts Caedes tier choices on shared RNG seeds', () => {
    // At Lucifer L4 (intensity ≈ 66), Stellar weight goes from 0.01 → ≈ 0.67 (pre-normalization);
    // normalized Stellar share is ≈ 40 %. Across many identical seeds, the same draw lands on a
    // different tier ~40 % of the time. The bar here is non-zero: prove the wiring is real.
    const trials = 50;
    let differing = 0;
    for (let i = 0; i < trials; i++) {
      const s0 = createInitialState(`tier-${i}`, 0);
      const sL: GameState = {
        ...s0,
        devotion: { ...s0.devotion, superbia: bn(1049760000) },
      };
      const seed = hashSeed(`wire-${i}`);
      const t0 = resolveAction(s0, 'caedes', makeRng(seed)).event?.tier;
      const tL = resolveAction(sL, 'caedes', makeRng(seed)).event?.tier;
      if (t0 !== tL) differing++;
    }
    expect(differing).toBeGreaterThan(5);
  });
});

describe('resolveAction — per-category success shift (Resignation/Retribution, 02 §2)', () => {
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

  it('high Ira yields more Decimatio successes', () => {
    const baseDec = successesOf(fresh(), 'caedes', 400);
    const ira = { ...fresh(), devotion: { ...fresh().devotion, ira: bn(1_000_000) } };
    expect(successesOf(ira, 'caedes', 400)).toBeGreaterThan(baseDec);
    // (That Ira leaves Suasio's tier weights untouched is proven deterministically in
    // modifiers.test.ts via categoryTierModifiers(ira, 'suasio') === {}.)
  });
});

describe('Decimatio gating + Pogrom target', () => {
  it('gates Pogrom at Ira 2 and Purgatio at Ira 3', () => {
    expect(actionUnlocked(fresh(), ACTIONS.pogrom!)).toBe(false);
    expect(actionUnlocked(withIra(fresh(), 2), ACTIONS.pogrom!)).toBe(true);
    expect(actionUnlocked(withIra(fresh(), 2), ACTIONS.purgatio!)).toBe(false);
    expect(actionUnlocked(withIra(fresh(), 3), ACTIONS.purgatio!)).toBe(true);
    expect(actionUnlocked(fresh(), ACTIONS.caedes!)).toBe(true); // ungated
  });

  it('Pogrom starts without a target now (subtypes removed; it culls the pool)', () => {
    const ready = withGold(withIra(fresh(), 2), 100_000);
    const ok = startAction(ready, 'pogrom');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(goldOf(ok.state)).toBeLessThan(100_000); // gold was charged
  });
});

describe('resolvePogrom', () => {
  const seed = (): GameState => withGold(addReprobates(fresh(), 200), 1000);
  it('Stellar culls 2.5% of the pool and harvests a soul per death (sheet rev)', () => {
    const s = resolvePogrom(seed(), 'stellar', rng());
    expect(s.lifetime.reprobates).toBe(195); // 200 - floor(200×0.025)
    expect(soulsOf(s)).toBe(5);
  });
  it('Terrible lets the Church seize 15% (no souls); Apocalyptic burns 66% gold AND half the flock', () => {
    const terrible = resolvePogrom(seed(), 'terrible', rng());
    expect(terrible.lifetime.reprobates).toBe(170); // 200 - floor(200×0.15)
    expect(soulsOf(terrible)).toBe(0);
    const apoc = resolvePogrom(seed(), 'apocalyptic', rng());
    expect(goldOf(apoc)).toBe(340); // keep 34%
    expect(totalReprobates(apoc)).toBe(100); // lose half, unharvested
    expect(soulsOf(apoc)).toBe(0);
  });
  it('Neutral does nothing', () => {
    const s = resolvePogrom(seed(), 'neutral', rng());
    expect(totalReprobates(s)).toBe(200);
    expect(goldOf(s)).toBe(1000);
  });
});

describe('resolvePurgatio', () => {
  const seed = (): GameState => {
    let s = addReprobates(fresh(), 100);
    s = addReprobates(s, 100);
    return withGold(s, 1000);
  };
  it('Stellar kills a quarter of the flock and harvests a soul each (sheet rev)', () => {
    const s = resolvePurgatio(seed(), 'stellar', rng());
    expect(totalReprobates(s)).toBe(150); // 200 - floor(200×0.25)
    expect(soulsOf(s)).toBe(50);
  });
  it('Good culls 1% of all reprobates (sheet rev)', () => {
    const s = resolvePurgatio(seed(), 'good', rng());
    expect(totalReprobates(s)).toBe(198); // 200 - floor(200×0.01)
    expect(soulsOf(s)).toBe(2);
  });
  it('Terrible burns ALL gold; Apocalyptic burns all gold and the whole flock (sheet rev)', () => {
    const terrible = resolvePurgatio(seed(), 'terrible', rng());
    expect(goldOf(terrible)).toBe(0);
    expect(totalReprobates(terrible)).toBe(200); // the flock survives Terrible
    const apoc = resolvePurgatio(seed(), 'apocalyptic', rng());
    expect(goldOf(apoc)).toBe(0);
    expect(totalReprobates(apoc)).toBe(0);
    expect(soulsOf(apoc)).toBe(0); // none of it harvested
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
    expect(dist.good).toBeCloseTo(0.21, 10);
    expect(dist.stellar).toBeCloseTo(0.035, 10);
    expect(dist.apocalyptic).toBeCloseTo(0.035, 10);
  });

  it('reflects the base weights for Caedes (Good is the dominant tier)', () => {
    const s = createInitialState('oracle-test', 0);
    const dist = actionTierDistribution(s, 'caedes');
    for (const t of TIERS) if (t !== 'good') expect(dist.good).toBeGreaterThan(dist[t]);
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

  it('is deterministic for forced-Good Caedes: +units souls, −units reprobates, sd 0', () => {
    const state = addReprobates(fresh(), 200);
    const f = actionOutcomeForecast(state, 'caedes', 1, 'good');
    expect(f.reprobates.mean).toBeCloseTo(-1, 6);
    expect(f.souls.mean).toBeCloseTo(1, 6);
    expect(f.reprobates.sd).toBeCloseTo(0, 6);
    const e = empirical(state, 'caedes', 1, 'good', 2000);
    expect(e.repMean).toBeCloseTo(-1, 6);
    expect(e.soulMean).toBeCloseTo(1, 6);
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
    // Caedes toggles at Ira 1: sealed at Ira 0, open at Ira 1.
    expect(isAutoRepeatable(fresh(), 'caedes')).toBe(false);
    expect(isAutoRepeatable(withIra(fresh(), 1), 'caedes')).toBe(true);
    // Pogrom toggles at Ira 3 — still sealed at Ira 1.
    expect(isAutoRepeatable(withIra(fresh(), 1), 'pogrom')).toBe(false);
    expect(isAutoRepeatable(withIra(fresh(), 3), 'pogrom')).toBe(true);
    // No toggle level → never player-auto-repeatable.
    expect(isAutoRepeatable(withIra(fresh(), 3), 'indagatio')).toBe(false);
    expect(isAutoRepeatable(withIra(fresh(), 3), 'emptio')).toBe(false);
  });

  it('enabling adds the id and starts the first cycle immediately', () => {
    const s = withIra(withGold(fresh(), 1000), 1);
    const next = setAutoRepeat(s, 'caedes', true);
    expect(isAutoRepeating(next, 'caedes')).toBe(true);
    expect(next.lifetime.autoRepeat).toEqual(['caedes']);
    // The loop kicked off in the player's slot and paid its first cycle up front (cost is scaled by
    // the Ira-driven Decimatio efficiency, so just assert it was charged, not the exact amount).
    expect(next.lifetime.actionQueue).toEqual([{ actionId: 'caedes', remainingSeconds: 1 }]);
    expect(goldOf(next)).toBeLessThan(1000);
  });

  it('is a no-op when the action is not auto-repeatable yet', () => {
    const s = withGold(fresh(), 1000); // Ira 0 — caedes not toggle-unlocked
    const next = setAutoRepeat(s, 'caedes', true);
    expect(next).toBe(s);
  });

  it('enabling one player rite is mutually exclusive with another (one slot)', () => {
    let s = withIra(withGold(fresh(), 5000), 3); // both caedes and pogrom open
    s = setAutoRepeat(s, 'caedes', true);
    expect(s.lifetime.autoRepeat).toEqual(['caedes']);
    s = setAutoRepeat(s, 'pogrom', true);
    expect(s.lifetime.autoRepeat).toEqual(['pogrom']); // caedes dropped — only one rite loops
  });

  it('disabling drops the id but leaves the in-flight cycle to finish', () => {
    let s = setAutoRepeat(withIra(withGold(fresh(), 1000), 1), 'caedes', true);
    expect(s.lifetime.actionQueue).toHaveLength(1);
    s = setAutoRepeat(s, 'caedes', false);
    expect(isAutoRepeating(s, 'caedes')).toBe(false);
    expect(s.lifetime.actionQueue).toHaveLength(1); // the running cycle is not cancelled
  });

  it('the tick re-queues an auto-repeating rite after its cycle resolves', () => {
    const s = setAutoRepeat(
      withReprobates(withIra(withGold(fresh(), 5000), 1), 100),
      'caedes',
      true,
    );
    expect(s.lifetime.actionQueue).toHaveLength(1);
    // Advance exactly one cycle: the running caedes resolves, then a fresh one is queued.
    const after = tick(s, 1).state;
    const queued = after.lifetime.actionQueue.filter((t) => t.actionId === 'caedes');
    expect(queued).toHaveLength(1);
    expect(queued[0]!.remainingSeconds).toBeCloseTo(1, 3); // a fresh full cycle
  });

  it('a stalled auto-repeat rite retries on a later tick once affordable', () => {
    // Ira 1 (toggle open) but too poor to pay caedes's 100 gold: enabling stalls (no timer).
    let s = setAutoRepeat(withIra(withGold(fresh(), 50), 1), 'caedes', true);
    expect(s.lifetime.autoRepeat).toEqual(['caedes']);
    expect(s.lifetime.actionQueue).toHaveLength(0); // couldn't afford the first cycle
    // A tick while still broke does not start it.
    s = tick(s, 1).state;
    expect(s.lifetime.actionQueue).toHaveLength(0);
    // Fund it, then the next tick picks the loop back up.
    s = withGold(s, 1000);
    s = tick(s, 1).state;
    expect(s.lifetime.actionQueue.some((t) => t.actionId === 'caedes')).toBe(true);
  });

  it('ensureAutoRepeatStarted is idempotent when the rite is already running', () => {
    const s = setAutoRepeat(withIra(withGold(fresh(), 1000), 1), 'caedes', true);
    const again = ensureAutoRepeatStarted(s);
    expect(again.lifetime.actionQueue).toHaveLength(1); // not double-queued
    expect(goldOf(again)).toBe(goldOf(s)); // not double-charged
  });
});
