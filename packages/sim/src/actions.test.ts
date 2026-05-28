import { describe, it, expect } from 'vitest';
import { bn, floor } from './bignum.js';
import { hashSeed, makeRng } from './rng.js';
import { createInitialState, totalReprobates, type GameState } from './state.js';
import { addReprobates } from './population.js';
import { startAction, resolveAction, resolveSuggestion, resolveCaedis } from './actions.js';
import { tick } from './tick.js';

const fresh = (): GameState => createInitialState('seed', 0);
const rng = () => makeRng(hashSeed('test'));
const soulsOf = (s: GameState): number => floor(s.souls).toNumber();
const goldOf = (s: GameState): number => floor(s.lifetime.gold).toNumber();
const withGold = (s: GameState, g: number): GameState => ({
  ...s,
  lifetime: { ...s.lifetime, gold: bn(g) },
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

describe('resolveSuggestion', () => {
  it('good adds one unconverted reprobate', () => {
    expect(resolveSuggestion(fresh(), 'good', rng()).lifetime.reprobates.reprobate).toBe(1);
  });

  it('stellar mints a soul and adds no reprobate', () => {
    const s = resolveSuggestion(fresh(), 'stellar', rng());
    expect(soulsOf(s)).toBe(1);
    expect(totalReprobates(s)).toBe(0);
  });

  it('excellent stays unconverted with no Sin developed, converts toward a developed one', () => {
    expect(resolveSuggestion(fresh(), 'excellent', rng()).lifetime.reprobates.reprobate).toBe(1);
    const developed = { ...fresh(), devotion: { ...fresh().devotion, gula: bn(180) } }; // Gula L1
    const s = resolveSuggestion(developed, 'excellent', rng());
    expect(s.lifetime.reprobates.glutton).toBe(1);
    expect(s.lifetime.reprobates.reprobate).toBe(0);
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
