import { describe, it, expect } from 'vitest';
import { bn, floor } from './bignum.js';
import { hashSeed, makeRng } from './rng.js';
import { createInitialState, type GameState } from './state.js';
import { ACTIONS, resolveAction, resolveEmptio, resolveIndagatio, startAction } from './actions.js';
import { MALEFICIA } from './maleficia.js';
import { skillIntensity } from './progression.js';

const fresh = (): GameState => createInitialState('seed', 0);
const rng = () => makeRng(hashSeed('test'));

describe('resolveIndagatio (03 §2.5)', () => {
  it('Good surfaces a rare into the Emptio list', () => {
    const { state, surfaced } = resolveIndagatio(fresh(), 'good', rng());
    expect(surfaced.length).toBe(1);
    const id = surfaced[0]!;
    expect(MALEFICIA[id]!.rarity).toBe('rare');
    expect(state.lifetime.emptioList).toContain(id);
  });

  it('Excellent surfaces a profane/rare item', () => {
    const { surfaced } = resolveIndagatio(fresh(), 'excellent', rng());
    expect(surfaced.length).toBe(1);
    expect(['profane', 'rare']).toContain(MALEFICIA[surfaced[0]!]!.rarity);
  });

  it('Stellar surfaces an anathema (the rarest tier with findable candidates)', () => {
    const { surfaced } = resolveIndagatio(fresh(), 'stellar', rng());
    expect(surfaced.length).toBe(1);
    // Catalog has four anathema items; Stellar walks the chain anathema → ... and stops at the first
    // non-empty rarity. With a fresh state every rarity has candidates, so Stellar lands on anathema.
    expect(MALEFICIA[surfaced[0]!]!.rarity).toBe('anathema');
  });

  it('Neutral surfaces a common into the Emptio list', () => {
    const { state, surfaced } = resolveIndagatio(fresh(), 'neutral', rng());
    expect(surfaced.length).toBe(1);
    expect(MALEFICIA[surfaced[0]!]!.rarity).toBe('common');
    expect(state.lifetime.emptioList).toContain(surfaced[0]!);
  });

  it('Bad is a false lead — surfaces nothing and leaves state untouched', () => {
    const base = fresh();
    const r = resolveIndagatio(base, 'bad', rng());
    expect(r.surfaced).toEqual([]);
    expect(r.state).toBe(base);
  });

  it('Terrible bites 15% of current gold; Apocalyptic bites 80%', () => {
    const base = fresh();
    const seeded: GameState = { ...base, lifetime: { ...base.lifetime, gold: bn(1000) } };
    expect(floor(resolveIndagatio(seeded, 'terrible', rng()).state.lifetime.gold).toNumber()).toBe(
      850,
    );
    expect(
      floor(resolveIndagatio(seeded, 'apocalyptic', rng()).state.lifetime.gold).toNumber(),
    ).toBe(200);
  });

  it('caps the Emptio list at 20, dropping the oldest find (FIFO) on the 21st', () => {
    // Pre-fill the list with 20 sentinels — a stackable common so a fresh Neutral find can still
    // surface (the catalog item is never exhausted). 'marker-0' is the oldest.
    const base = fresh();
    const filled = Array.from({ length: 20 }, (_, i) =>
      i === 0 ? 'marker-0' : 'black_salt_pouch',
    );
    const seeded: GameState = {
      ...base,
      lifetime: { ...base.lifetime, emptioList: filled },
    };
    const { state, surfaced } = resolveIndagatio(seeded, 'neutral', rng());
    expect(surfaced.length).toBe(1);
    // Still exactly 20: the 21st find pushed the oldest ('marker-0') out the front.
    expect(state.lifetime.emptioList.length).toBe(20);
    expect(state.lifetime.emptioList).not.toContain('marker-0');
    expect(state.lifetime.emptioList[19]).toBe(surfaced[0]!);
  });

  it('falls back to a lower rarity when the picked one is exhausted', () => {
    // Owning every anathema item locks the Stellar pick away — it falls back to profane.
    const base = fresh();
    const allAnathema = Object.keys(MALEFICIA).filter((id) => MALEFICIA[id]!.rarity === 'anathema');
    const seeded: GameState = {
      ...base,
      lifetime: {
        ...base.lifetime,
        maleficia: allAnathema,
      },
    };
    const { surfaced } = resolveIndagatio(seeded, 'stellar', rng());
    expect(surfaced.length).toBe(1);
    expect(MALEFICIA[surfaced[0]!]!.rarity).toBe('profane');
  });
});

describe('resolveEmptio (03 §2.6)', () => {
  function listedWith(id: string, gold = 50000): GameState {
    const base = fresh();
    return {
      ...base,
      lifetime: {
        ...base.lifetime,
        gold: bn(gold),
        emptioList: [id],
      },
    };
  }

  it('Good acquires the item and consumes the list entry', () => {
    const r = resolveEmptio(listedWith('black_robe'), 'good', 'black_robe');
    expect(r.acquired).toEqual(['black_robe']);
    expect(r.state.lifetime.maleficia).toContain('black_robe');
    expect(r.state.lifetime.emptioList).not.toContain('black_robe');
  });

  it('Stellar acquires AND refunds the full cost (a steal)', () => {
    const state = listedWith('blackthorn_wand', 1000);
    const r = resolveEmptio(state, 'stellar', 'blackthorn_wand');
    expect(r.state.lifetime.maleficia).toContain('blackthorn_wand');
    // The item's cost is refunded into the 1000 base.
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(1000 + MALEFICIA.blackthorn_wand!.cost);
  });

  it('Excellent acquires at a quarter of the price — 75% refunded (sheet rev)', () => {
    const state = listedWith('ritual_dagger', 0);
    const r = resolveEmptio(state, 'excellent', 'ritual_dagger');
    expect(r.state.lifetime.maleficia).toContain('ritual_dagger');
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(
      Math.floor(MALEFICIA.ritual_dagger!.cost * 0.75),
    );
  });

  it('Good acquires at half the price — 50% refunded (sheet rev)', () => {
    const state = listedWith('ritual_dagger', 0);
    const r = resolveEmptio(state, 'good', 'ritual_dagger');
    expect(r.acquired).toEqual(['ritual_dagger']);
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(
      Math.floor(MALEFICIA.ritual_dagger!.cost / 2),
    );
  });

  it('Neutral acquires the item at the listed price — no refund, list entry consumed', () => {
    const state = listedWith('black_robe', 500);
    const r = resolveEmptio(state, 'neutral', 'black_robe');
    expect(r.acquired).toEqual(['black_robe']);
    expect(r.state.lifetime.maleficia).toContain('black_robe');
    expect(r.state.lifetime.emptioList).not.toContain('black_robe');
    // Cost was already paid at startAction; Neutral neither refunds nor charges again.
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(500);
  });

  it('Bad: cost stays gone, item stays on the list', () => {
    const state = listedWith('black_robe', 0);
    const r = resolveEmptio(state, 'bad', 'black_robe');
    expect(r.state.lifetime.maleficia).not.toContain('black_robe');
    expect(r.state.lifetime.emptioList).toContain('black_robe');
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(0);
  });

  it('Terrible snatches the item from the list (no refund, no acquisition)', () => {
    const state = listedWith('black_robe', 0);
    const r = resolveEmptio(state, 'terrible', 'black_robe');
    expect(r.lostFromList).toEqual(['black_robe']);
    expect(r.state.lifetime.emptioList).not.toContain('black_robe');
    expect(r.state.lifetime.maleficia).not.toContain('black_robe');
  });

  it('Apocalyptic snatches the item AND bites 50% of total gold (bait)', () => {
    const state = listedWith('black_robe', 1000);
    const r = resolveEmptio(state, 'apocalyptic', 'black_robe');
    expect(r.lostFromList).toEqual(['black_robe']);
    expect(floor(r.state.lifetime.gold).toNumber()).toBe(500); // 1000 → lose 50%
  });

  it('refuses to act on an item not on the list', () => {
    const r = resolveEmptio(fresh(), 'good', 'black_robe');
    expect(r.acquired).toEqual([]);
    expect(r.state).toEqual(fresh());
  });
});

describe('startAction — Indagatio / Emptio', () => {
  it('Indagatio queues a 1800 s timer at neutral efficiency (no cost)', () => {
    const r = startAction(fresh(), 'indagatio');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const t = r.state.lifetime.actionQueue[0]!;
      expect(t.actionId).toBe('indagatio');
      expect(t.remainingSeconds).toBe(ACTIONS.indagatio!.baseTimeSeconds);
      expect(t.target).toBeUndefined();
    }
  });

  it('Indagatio time is divided by player efficiency (Gula skill, sheet rev)', () => {
    const base = fresh();
    const state: GameState = { ...base, devotion: { ...base.devotion, gula: bn(32400) } };
    const eff = 1 + skillIntensity(bn(32400)); // Insatiability ≈ 2.6502
    const r = startAction(state, 'indagatio');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.lifetime.actionQueue[0]!.remainingSeconds).toBeCloseTo(
        ACTIONS.indagatio!.baseTimeSeconds / eff,
        6,
      );
    }
  });

  it('Emptio refuses without a target', () => {
    const r = startAction(fresh(), 'emptio');
    expect(r.ok).toBe(false);
  });

  it('Emptio refuses when the target is not on the Emptio list', () => {
    const r = startAction(fresh(), 'emptio', { target: 'black_robe' });
    expect(r.ok).toBe(false);
  });

  it('Emptio pays the maleficium’s gold cost up front and stores the target on the timer', () => {
    const base = fresh();
    const state: GameState = {
      ...base,
      lifetime: { ...base.lifetime, gold: bn(1000), emptioList: ['black_robe'] },
    };
    const r = startAction(state, 'emptio', { target: 'black_robe' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(floor(r.state.lifetime.gold).toNumber()).toBe(1000 - MALEFICIA.black_robe!.cost);
      const t = r.state.lifetime.actionQueue[0]!;
      expect(t.target).toBe('black_robe');
    }
  });

  it('Emptio refuses when gold is insufficient (cost is the maleficium’s, not the action def)', () => {
    const base = fresh();
    const state: GameState = {
      ...base,
      lifetime: { ...base.lifetime, gold: bn(100), emptioList: ['black_robe'] }, // need 500
    };
    const r = startAction(state, 'emptio', { target: 'black_robe' });
    expect(r.ok).toBe(false);
  });

  it('Indagatio scries in the background — it neither blocks nor is blocked by a player action', () => {
    const base = fresh();
    const funded: GameState = { ...base, lifetime: { ...base.lifetime, gold: bn(5000) } };

    // A player rite holds the slot, yet Indagatio still starts alongside it.
    const player = startAction(funded, 'caedis');
    expect(player.ok).toBe(true);
    if (player.ok) {
      const plusInd = startAction(player.state, 'indagatio');
      expect(plusInd.ok).toBe(true);
      if (plusInd.ok) {
        expect([...plusInd.state.lifetime.actionQueue].map((t) => t.actionId).sort()).toEqual([
          'caedis',
          'indagatio',
        ]);
      }
    }

    // Indagatio first: a player rite still starts; a SECOND scry is refused (single Cast control).
    const ind = startAction(funded, 'indagatio');
    expect(ind.ok).toBe(true);
    if (ind.ok) {
      expect(startAction(ind.state, 'caedis').ok).toBe(true);
      const secondInd = startAction(ind.state, 'indagatio');
      expect(secondInd.ok).toBe(false);
      if (!secondInd.ok) expect(secondInd.reason).toContain('scrying');
    }
  });
});

describe('resolveAction — dispatch wiring for Indagatio and Emptio', () => {
  it('Indagatio → an event reporting `maleficiaSurfaced` when an item is found', () => {
    // Pin to a deterministic seed and a tier likely to surface. We use resolveAction so the
    // tier itself is drawn from the action's weights via the modifier engine.
    let surfaced = false;
    for (let i = 0; i < 30; i++) {
      const r = resolveAction(fresh(), 'indagatio', makeRng(hashSeed(`ind-${i}`)));
      if (r.event?.maleficiaSurfaced?.length) {
        surfaced = true;
        break;
      }
    }
    expect(surfaced).toBe(true);
  });
});
