import { describe, it, expect } from 'vitest';
import { bn, floor } from './bignum.js';
import { hashSeed, makeRng } from './rng.js';
import { createInitialState, totalReprobates, type GameState } from './state.js';
import { addReprobates } from './population.js';
import {
  startAction,
  resolveAction,
  resolveSuggestion,
  resolveCaedis,
  resolveLogismoi,
  resolveImperium,
  resolvePogrom,
  resolvePurgatio,
  actionUnlocked,
  ACTIONS,
} from './actions.js';
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

describe('startAction', () => {
  it('queues caedis and deducts its gold cost when affordable', () => {
    const r = startAction(withGold(fresh(), 150), 'caedis');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(goldOf(r.state)).toBe(50); // 150 - 100
      expect(r.state.lifetime.actionQueue).toEqual([{ actionId: 'caedis', remainingSeconds: 10 }]);
    }
  });

  it('refuses caedis without enough gold and rejects unknown actions', () => {
    expect(startAction(fresh(), 'caedis').ok).toBe(false);
    expect(startAction(fresh(), 'nope').ok).toBe(false);
  });

  it('queues suggestion and deducts influence', () => {
    const s = { ...fresh(), lifetime: { ...fresh().lifetime, influence: bn(5) } };
    const r = startAction(s, 'suggestion');
    expect(r.ok).toBe(true);
    if (r.ok) expect(floor(r.state.lifetime.influence).toNumber()).toBe(0);
  });

  it('refuses a second action while one is already underway, then allows it once resolved', () => {
    const start = {
      ...withGold(fresh(), 300),
      lifetime: { ...withGold(fresh(), 300).lifetime, influence: bn(50) },
    };
    const first = startAction(start, 'caedis');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const blocked = startAction(first.state, 'suggestion'); // a rite is underway
    expect(blocked.ok).toBe(false);
    const resolved = tick(first.state, 10).state; // caedis completes, queue empties
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
    if (ok.ok) expect(floor(ok.state.lifetime.influence).toNumber()).toBe(75); // 100 - 25
  });
});

describe('resolveLogismoi', () => {
  it('good and excellent each mint 10–29 unconverted reprobates', () => {
    for (const tier of ['good', 'excellent'] as const) {
      const n = resolveLogismoi(fresh(), tier, rng()).lifetime.reprobates.reprobate;
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(29);
    }
  });
  it('stellar mints 10–29 souls', () => {
    const s = soulsOf(resolveLogismoi(fresh(), 'stellar', rng()));
    expect(s).toBeGreaterThanOrEqual(10);
    expect(s).toBeLessThanOrEqual(29);
  });
  it('terrible culls reprobates; neutral does nothing', () => {
    const seeded = addReprobates(fresh(), 'reprobate', 100);
    expect(totalReprobates(resolveLogismoi(seeded, 'terrible', rng()))).toBeLessThan(100);
    expect(totalReprobates(resolveLogismoi(seeded, 'neutral', rng()))).toBe(100);
  });
});

describe('resolveImperium', () => {
  it('always adds 360–1260 unconverted reprobates (fixed, player-controlled outcome)', () => {
    const n = resolveImperium(fresh(), rng()).lifetime.reprobates.reprobate;
    expect(n).toBeGreaterThanOrEqual(360);
    expect(n).toBeLessThanOrEqual(1260);
  });
});

describe('resolveSuggestion', () => {
  it('good adds one unconverted reprobate', () => {
    expect(resolveSuggestion(fresh(), 'good', rng()).lifetime.reprobates.reprobate).toBe(1);
  });

  it('stellar adds 4..8 unconverted reprobates and mints no soul', () => {
    const s = resolveSuggestion(fresh(), 'stellar', rng());
    expect(soulsOf(s)).toBe(0);
    const n = s.lifetime.reprobates.reprobate;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(8);
    expect(totalReprobates(s)).toBe(n); // all unconverted
  });

  it('excellent mints a soul (target suicides) and adds no reprobate', () => {
    const s = resolveSuggestion(fresh(), 'excellent', rng());
    expect(soulsOf(s)).toBe(1);
    expect(totalReprobates(s)).toBe(0);
  });

  it('bad removes a reprobate; terrible loses 9% of the population', () => {
    expect(
      totalReprobates(resolveSuggestion(addReprobates(fresh(), 'reprobate', 3), 'bad', rng())),
    ).toBe(2);
    expect(
      totalReprobates(
        resolveSuggestion(addReprobates(fresh(), 'reprobate', 100), 'terrible', rng()),
      ),
    ).toBe(91);
  });

  it('neutral changes nothing', () => {
    const s = resolveSuggestion(fresh(), 'neutral', rng());
    expect(totalReprobates(s)).toBe(0);
    expect(soulsOf(s)).toBe(0);
  });
});

describe('resolveCaedis', () => {
  it('good kills one reprobate and mints one soul', () => {
    const s = resolveCaedis(addReprobates(fresh(), 'reprobate', 5), 'good', rng());
    expect(totalReprobates(s)).toBe(4);
    expect(soulsOf(s)).toBe(1);
  });

  it('mints nothing when there are no reprobates to kill', () => {
    expect(soulsOf(resolveCaedis(fresh(), 'good', rng()))).toBe(0);
  });

  it('never mints more souls than reprobates killed (population caps the kill)', () => {
    const s = resolveCaedis(addReprobates(fresh(), 'reprobate', 5), 'stellar', rng()); // would kill 15..45
    expect(totalReprobates(s)).toBe(0);
    expect(soulsOf(s)).toBe(5);
  });

  it('bad and terrible lose 5% and 15% of current gold', () => {
    expect(goldOf(resolveCaedis(withGold(fresh(), 1000), 'bad', rng()))).toBe(950);
    expect(goldOf(resolveCaedis(withGold(fresh(), 1000), 'terrible', rng()))).toBe(850);
  });

  it('apocalyptic loses 66% gold and 50% of all reprobates, minting no souls', () => {
    const s0 = withGold(addReprobates(fresh(), 'reprobate', 100), 1000);
    const s = resolveCaedis(s0, 'apocalyptic', rng());
    expect(goldOf(s)).toBe(340); // 1000 → keep 34%
    expect(totalReprobates(s)).toBe(50); // 100 → lose 50%
    expect(soulsOf(s)).toBe(0); // taken by the Higher Power, not harvested
  });
});

describe('tick — action resolution and events', () => {
  it('resolves a queued action only once its time elapses', () => {
    const started = startAction(withGold(fresh(), 200), 'caedis');
    if (!started.ok) throw new Error('should start');
    const half = tick(started.state, 5);
    expect(half.state.lifetime.actionQueue).toHaveLength(1);
    expect(half.state.lifetime.actionQueue[0]?.remainingSeconds ?? 0).toBeCloseTo(5, 5);
    expect(half.events).toHaveLength(0);
    const done = tick(half.state, 5);
    expect(done.state.lifetime.actionQueue).toHaveLength(0);
    expect(done.events).toHaveLength(1);
    expect(done.events[0]?.actionId).toBe('caedis');
  });

  it('closes the corruption → cull → soul loop deterministically', () => {
    const seeded = withGold(addReprobates(fresh(), 'reprobate', 10), 500);
    const started = startAction(seeded, 'caedis');
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
    const { state, event } = resolveAction(addReprobates(fresh(), 'reprobate', 5), 'caedis', rng());
    expect(event).not.toBeNull();
    if (event) {
      expect(event.actionId).toBe('caedis');
      expect(event.soulsDelta + event.reprobateDelta).toBe(0); // souls minted == reprobates killed
      expect(soulsOf(state)).toBe(event.soulsDelta);
    }
  });

  it('returns a null event for an unknown action', () => {
    expect(resolveAction(fresh(), 'nope', rng()).event).toBeNull();
  });
});

describe('modifier integration', () => {
  it('startAction defaults its efficiency to playerEfficiency(state) — Gula scales cost', () => {
    // Gula L2 (Devotion 32 400) → playerEfficiencyMul = 4. Suggestion costs 5 × 4 = 20 influence.
    const base = fresh();
    const state: GameState = {
      ...base,
      devotion: { ...base.devotion, gula: bn(32400) },
      lifetime: { ...base.lifetime, influence: bn(50) },
    };
    const r = startAction(state, 'suggestion');
    expect(r.ok).toBe(true);
    if (r.ok) expect(floor(r.state.lifetime.influence).toNumber()).toBe(30); // 50 - 20
  });

  it('startAction with Gula L2 and only enough influence for L0 cost is refused', () => {
    // 5 influence covers a L0 (eff=1) Suggestion but not a L2 (eff=4, cost 20) one.
    const base = fresh();
    const state: GameState = {
      ...base,
      devotion: { ...base.devotion, gula: bn(32400) },
      lifetime: { ...base.lifetime, influence: bn(5) },
    };
    const r = startAction(state, 'suggestion');
    expect(r.ok).toBe(false);
  });
});

describe('modifier integration — per-category efficiency', () => {
  it('Leviathan (Resignation) scales Suggestion cost but not Caedis', () => {
    // Tristitia 180 → suasioEffMul ≈ 1.4125. Suggestion influence cost = ceil(5 × 1.4125) = 8.
    const base = fresh();
    const state: GameState = {
      ...base,
      devotion: { ...base.devotion, tristitia: bn(180) },
      lifetime: { ...base.lifetime, influence: bn(100), gold: bn(500) },
    };
    const r1 = startAction(state, 'suggestion');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(floor(r1.state.lifetime.influence).toNumber()).toBe(92); // 100 − 8

    // Caedis on the same state pays base 100 gold (no Decimatio boost in play).
    const r2 = startAction(state, 'caedis');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(floor(r2.state.lifetime.gold).toNumber()).toBe(400); // 500 − 100
  });

  it('Satan (Retribution) scales Caedis cost but not Suggestion', () => {
    // Ira 180 → decimatioEffMul ≈ 1.4125. Caedis gold cost = ceil(100 × 1.4125) = 142.
    const base = fresh();
    const state: GameState = {
      ...base,
      devotion: { ...base.devotion, ira: bn(180) },
      lifetime: { ...base.lifetime, influence: bn(100), gold: bn(1000) },
    };
    const r1 = startAction(state, 'caedis');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(floor(r1.state.lifetime.gold).toNumber()).toBe(858); // 1000 − 142

    const r2 = startAction(state, 'suggestion');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(floor(r2.state.lifetime.influence).toNumber()).toBe(95); // 100 − 5
  });
});

describe('modifier integration — tier weight shifts reach resolveAction', () => {
  it('Lucifer (Morning Star) at L4 reliably shifts Caedis tier choices on shared RNG seeds', () => {
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
      const t0 = resolveAction(s0, 'caedis', makeRng(seed)).event?.tier;
      const tL = resolveAction(sL, 'caedis', makeRng(seed)).event?.tier;
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
    const baseDec = successesOf(fresh(), 'caedis', 400);
    const ira = { ...fresh(), devotion: { ...fresh().devotion, ira: bn(1_000_000) } };
    expect(successesOf(ira, 'caedis', 400)).toBeGreaterThan(baseDec);
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
    expect(actionUnlocked(fresh(), ACTIONS.caedis!)).toBe(true); // ungated
  });

  it('Pogrom needs a valid subtype target to start', () => {
    const ready = withGold(withIra(fresh(), 2), 100_000);
    expect(startAction(ready, 'pogrom').ok).toBe(false); // no target
    expect(startAction(ready, 'pogrom', { target: 'not-a-subtype' }).ok).toBe(false);
    const ok = startAction(ready, 'pogrom', { target: 'gambler' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(goldOf(ok.state)).toBeLessThan(100_000); // gold was charged
  });
});

describe('resolvePogrom', () => {
  const seed = (): GameState => {
    let s = addReprobates(fresh(), 'gambler', 100);
    s = addReprobates(s, 'choleric', 100);
    return withGold(s, 1000);
  };
  it('Good culls 5% of the chosen subtype and harvests a soul per death', () => {
    const s = resolvePogrom(seed(), 'good', rng(), 'gambler');
    expect(s.lifetime.reprobates.gambler).toBe(95); // 100 - floor(100*0.05)
    expect(s.lifetime.reprobates.choleric).toBe(100); // untouched
    expect(soulsOf(s)).toBe(5);
  });
  it('Terrible lets the Church seize 15% of converts (no souls); Apocalyptic burns 65% gold', () => {
    const terrible = resolvePogrom(seed(), 'terrible', rng(), 'gambler');
    expect(terrible.lifetime.reprobates.gambler).toBe(85);
    expect(terrible.lifetime.reprobates.choleric).toBe(85);
    expect(soulsOf(terrible)).toBe(0);
    expect(goldOf(resolvePogrom(seed(), 'apocalyptic', rng(), 'gambler'))).toBe(350);
  });
  it('Neutral does nothing', () => {
    const s = resolvePogrom(seed(), 'neutral', rng(), 'gambler');
    expect(totalReprobates(s)).toBe(200);
    expect(goldOf(s)).toBe(1000);
  });
});

describe('resolvePurgatio', () => {
  const seed = (): GameState => {
    let s = addReprobates(fresh(), 'gambler', 100);
    s = addReprobates(s, 'reprobate', 100);
    return withGold(s, 1000);
  };
  it('Stellar kills every reprobate and harvests a soul each', () => {
    const s = resolvePurgatio(seed(), 'stellar', rng());
    expect(totalReprobates(s)).toBe(0);
    expect(soulsOf(s)).toBe(200);
  });
  it('Good culls a third of all reprobates', () => {
    const s = resolvePurgatio(seed(), 'good', rng());
    expect(totalReprobates(s)).toBe(134); // 200 - floor(200*0.33)
    expect(soulsOf(s)).toBe(66);
  });
  it('Apocalyptic burns 95% gold and seizes 25% of converts', () => {
    const s = resolvePurgatio(seed(), 'apocalyptic', rng());
    expect(goldOf(s)).toBe(50); // 1000 * 0.05
    expect(s.lifetime.reprobates.gambler).toBe(75); // converts: lose 25%
    expect(s.lifetime.reprobates.reprobate).toBe(100); // unconverted untouched
  });
});
