import { describe, it, expect } from 'vitest';
import {
  advanceCallBuffs,
  applyCallEffects,
  createInitialState,
  tick,
  type CallBuff,
  type GameState,
} from '@panvitium/sim';
import { CALL_IN_BY_ID } from '../menus/calls-in.data.js';
import { buffAriaLabel, buffKindLabel, buildBuffs, ringFraction, type BuffView } from './buffs.js';

function withLifetime(patch: Partial<GameState['lifetime']>): GameState {
  const s = createInitialState('buffs-test', 0);
  return { ...s, lifetime: { ...s.lifetime, ...patch } };
}

/** Answer a call's take-option exactly as the store does (`answerCall`). */
function answer(state: GameState, callId: string, choice = 0): GameState {
  const effects = CALL_IN_BY_ID[callId]?.choices[choice]?.effects ?? [];
  return applyCallEffects(state, effects, callId);
}

function only(rings: BuffView[]): BuffView {
  expect(rings).toHaveLength(1);
  return rings[0]!;
}

describe('buildBuffs: the single-use maleficia', () => {
  it('is empty when nothing is running', () => {
    expect(buildBuffs(createInitialState('buffs-test', 0))).toEqual([]);
  });

  it('reads a live consumable as a ring with its art and its catalog effect clause', () => {
    const ring = only(buildBuffs(withLifetime({ maleficiaBuffs: { black_salt_pouch: 2537 } })));
    expect(ring).toMatchObject({
      id: 'maleficium:black_salt_pouch',
      kind: 'maleficium',
      name: 'Black Salt Pouch',
      rarity: 'common',
      glyph: '+10%',
      remainingSec: 2537,
      durationSec: 3600,
    });
    expect(ring.img).toContain('black_salt_pouch.png');
    // "Single-use:" and "for an hour" drop away; the number stays.
    expect(ring.effects).toEqual([{ text: '+10% reprobate generation', debuff: false }]);
    expect(ring.caller).toBeUndefined();
  });

  it('sets a reduction with a true minus sign, as the Loculi does', () => {
    const ring = only(buildBuffs(withLifetime({ maleficiaBuffs: { crossroads_dirt: 411 } })));
    expect(ring.effects[0]!.text).toBe('−15% Indagatio time');
  });

  it('gives Hand of Glory, which has no art, its magnitude as the glyph', () => {
    const ring = only(buildBuffs(withLifetime({ maleficiaBuffs: { hand_of_glory: 900 } })));
    expect(ring.img).toBeUndefined();
    expect(ring.glyph).toBe('+33%');
    expect(ring.effects[0]!.text).toBe('+33% reprobate generation');
  });

  it('skips a spent timer and an id the catalog does not know', () => {
    const rings = buildBuffs(withLifetime({ maleficiaBuffs: { defixio: 0, iron_nails: 500 } }));
    expect(rings).toEqual([]);
  });
});

describe('buildBuffs: the answered calls', () => {
  it('names a call ring from the catalogue, with its caller and dominant multiplier', () => {
    const ring = only(buildBuffs(answer(withLifetime({}), 'the-shipment')));
    expect(ring).toMatchObject({
      kind: 'call',
      name: 'The Shipment',
      caller: 'an acolyte',
      glyph: '×2',
      remainingSec: 3600,
      durationSec: 3600,
    });
    expect(ring.img).toBeUndefined();
    expect(ring.effects).toEqual([{ text: 'Reprobate generation doubles', debuff: false }]);
  });

  it("reads one answer's two effects as one ring, the cut in the debuff colour", () => {
    const ring = only(buildBuffs(answer(withLifetime({}), 'social-platform')));
    expect(ring.name).toBe('Social Platform');
    expect(ring.caller).toBe('Mai');
    expect(ring.glyph).toBe('×2'); // the buff dominates the halving
    expect(ring.effects).toEqual([
      { text: 'Influence regeneration doubles', debuff: false },
      { text: 'Reprobate generation halves', debuff: true },
    ]);
  });

  it('states the number whenever the verb does not name it', () => {
    const cycle = only(buildBuffs(answer(withLifetime({}), 'the-cycle-turns')));
    expect(cycle.glyph).toBe('×1.33');
    expect(cycle.effects[0]!.text).toBe('Gold gain increases by 33%');
    const looting = only(buildBuffs(answer(withLifetime({}), 'the-looting')));
    expect(looting.effects).toEqual([
      { text: 'Acolyte efficiency doubles', debuff: false },
      { text: 'Influence regeneration drops by 33%', debuff: true },
    ]);
  });

  it('reads the short Desidia buff against its own five minutes', () => {
    const ring = only(buildBuffs(answer(withLifetime({}), 'doing-nothing')));
    expect(ring.durationSec).toBe(300);
    expect(ring.effects[0]!.text).toBe('Desidia generation triples');
  });

  it('shows the same call answered twice as two rings', () => {
    let s = answer(withLifetime({}), 'social-platform');
    s = advanceCallBuffs(s, 600);
    s = answer(s, 'social-platform');
    const rings = buildBuffs(s);
    expect(rings).toHaveLength(2);
    expect(new Set(rings.map((r) => r.id)).size).toBe(2);
    expect(rings.map((r) => r.remainingSec)).toEqual([3000, 3600]);
    expect(rings.every((r) => r.effects.length === 2)).toBe(true);
  });

  it('keeps two answers apart even when their timers are equal (the world held still)', () => {
    const s = answer(answer(withLifetime({}), 'the-shipment'), 'the-shipment');
    const rings = buildBuffs(s);
    expect(rings).toHaveLength(2);
    expect(rings.every((r) => r.effects.length === 1)).toBe(true);
  });

  it('reads a buff kept from before calls were named as an unnamed call', () => {
    const legacy: CallBuff[] = [
      { field: 'influenceRegenRate', factor: 2, remainingSeconds: 1200 },
      { field: 'reprobateGenMul', factor: 0.5, remainingSeconds: 1200 },
    ];
    const ring = only(buildBuffs(withLifetime({ callBuffs: legacy })));
    expect(ring.name).toBe('The line');
    expect(ring.caller).toBeUndefined();
    expect(ring.effects).toHaveLength(2); // one old answer still reads as one ring
    expect(ring.durationSec).toBe(3600);
  });
});

describe('buildBuffs: order and identity', () => {
  it('puts the maleficia first, then the calls, each soonest to expire first', () => {
    let s = withLifetime({
      maleficiaBuffs: { black_salt_pouch: 2537, defixio: 1084, crossroads_dirt: 411 },
    });
    s = answer(s, 'social-platform');
    s = advanceCallBuffs(s, 1368);
    s = answer(s, 'the-shipment');
    expect(buildBuffs(s).map((r) => r.name)).toEqual([
      'Crossroads Dirt',
      'Defixio',
      'Black Salt Pouch',
      'Social Platform',
      'The Shipment',
    ]);
  });

  it('keeps each ring id from one tick to the next', () => {
    let s = withLifetime({ maleficiaBuffs: { defixio: 1084 } });
    s = answer(answer(s, 'the-shipment'), 'social-platform');
    const before = buildBuffs(s).map((r) => r.id);
    const after = buildBuffs(tick(s, 0.1).state).map((r) => r.id);
    expect(after).toEqual(before);
  });

  it('drops a ring on the tick its buff runs out', () => {
    const s = withLifetime({ maleficiaBuffs: { defixio: 0.05 } });
    expect(buildBuffs(s)).toHaveLength(1);
    expect(buildBuffs(tick(s, 0.1).state)).toEqual([]);
  });
});

describe('ringFraction', () => {
  it('is remaining over duration', () => {
    const ring = only(buildBuffs(withLifetime({ maleficiaBuffs: { defixio: 1800 } })));
    expect(ringFraction(ring)).toBe(0.5);
  });

  it('holds a stacked relic (two uses, two hours) at a full ring', () => {
    const ring = only(buildBuffs(withLifetime({ maleficiaBuffs: { defixio: 7200 } })));
    expect(ringFraction(ring)).toBe(1);
  });
});

describe('the hover card and accessible name', () => {
  it('labels the source kind', () => {
    const [mal, call] = buildBuffs(
      answer(withLifetime({ maleficiaBuffs: { defixio: 1084 } }), 'social-platform'),
    );
    expect(buffKindLabel(mal!)).toBe('Maleficium');
    expect(buffKindLabel(call!)).toBe('Call · Mai');
    const legacy = only(
      buildBuffs(
        withLifetime({ callBuffs: [{ field: 'goldGainMul', factor: 2, remainingSeconds: 60 }] }),
      ),
    );
    expect(buffKindLabel(legacy)).toBe('Call');
  });

  it('names a ring by its source, every effect and the short time left', () => {
    const ring = only(buildBuffs(answer(withLifetime({}), 'social-platform')));
    expect(buffAriaLabel(ring)).toBe(
      'Social Platform, Influence regeneration doubles, Reprobate generation halves, 1h 0m remaining',
    );
  });
});
