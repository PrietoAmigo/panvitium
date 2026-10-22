/**
 * Unit tests for the incoming-call view-model, requirement gate, and weighted selection. These pin
 * the catalogue↔strings join (caller/tag derivation, choice-count parity), the per-call eligibility
 * predicate (docs "Requirements" — katabasisCount, the Fausto branch, received emails), and the
 * class-bucketed draw (weight, once-only + requirement gating, determinism off the injected RNG).
 */
import { describe, it, expect } from 'vitest';
import {
  buildCallInView,
  buildCallOutView,
  callInSource,
  pickIncomingCall,
  isCallEligible,
  eligibleCallIds,
  describeCallBuff,
  describeCallInEffects,
  type CallEligibilityContext,
} from './callIn.js';
import type { CallInChoiceData, CallInEffect } from '../menus/calls-in.data.js';
import { CALLS_IN, CALL_IN_BY_ID, choiceAtPath, isOnceOnly } from '../menus/calls-in.data.js';
import { CALLS_OUT } from '../menus/calls-out.data.js';
import { CALL_OUTS } from '@panvitium/sim';
import { strings, type CallChoiceCopy } from '@panvitium/shared';

/** A deterministic `random` that replays a fixed queue (then holds its last value). */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

/** A permissive context (fresh game): no descents, Fausto friendly, no mail. */
function freshCtx(over: Partial<CallEligibilityContext> = {}): CallEligibilityContext {
  return {
    katabasisCount: 0,
    fcFriendly: true,
    receivedEmailIds: new Set(),
    unlockedActions: new Set(),
    ...over,
  };
}

describe('buildCallInView', () => {
  it('joins a recorded call: big caller name, no spoken line', () => {
    const v = buildCallInView('the-cycle-turns');
    expect(v).not.toBeNull();
    expect(v!.audio).toBe(true);
    expect(v!.caller).toBe('Gideon Reyes');
    expect(v!.tag).toBe('Gideon Reyes'); // "the line · " prefix stripped
    expect(v!.line).toBe(''); // recordings carry their words in the mp3
    expect(v!.choices).toHaveLength(3);
    expect(v!.choices[2]!.dim).toBe(true); // "Let it go"
    // The sub-label is generated from the effect (buff(goldGainMul, ×1.33, 1 hour)).
    expect(v!.choices[0]!.sub).toBe('Gold gain increases for 1 hour');
    expect(v!.choices[2]!.sub).toBeUndefined(); // decline option has no effect, no sub
  });

  it('joins an unknown-caller call and keeps a Latin label untranslated', () => {
    const v = buildCallInView('succubus');
    expect(v!.tag).toBe('unknown caller');
    expect(v!.caller).toBe('unknown caller');
    expect(v!.choices.map((c) => c.dim)).toEqual([true, false]);
    expect(v!.choices[1]!.label).toBe('Expello te, succube.');
  });

  it('returns null for an unknown id', () => {
    expect(buildCallInView('no-such-call')).toBeNull();
  });

  it('doing-nothing re-homes its retired offline buff onto Desidia generation', () => {
    const v = buildCallInView('doing-nothing');
    expect(v!.choices[0]!.sub).toBe('Desidia generation triples for 5 minutes');
    expect(v!.choices[1]!.sub).toBe('Kills 10% of your reprobates');
    expect(v!.choices[2]!.dim).toBe(true); // "Let it go"
  });

  it('every catalogue call has matching strings with the same choice count, at every beat', () => {
    for (const data of CALLS_IN) {
      const copy = strings.phone.callIn.calls[data.id];
      expect(copy, `strings for ${data.id}`).toBeDefined();
      expectParity(data.id, data.choices, copy!.choices);
      const v = buildCallInView(data.id);
      expect(v, `view for ${data.id}`).not.toBeNull();
      expect(v!.choices).toHaveLength(data.choices.length);
    }
  });

  it('opens on the call id as its recording and is skippable unless the catalogue says not', () => {
    const v = buildCallInView('the-cycle-turns')!;
    expect(v.recording).toBe('the-cycle-turns');
    expect(v.skippable).toBe(true);
    expect(buildCallInView('the-ward')!.skippable).toBe(false);
  });
});

/** Pin the strings to the catalogue choice for choice, down every beat a pick leads to. */
function expectParity(
  where: string,
  data: readonly CallInChoiceData[],
  copy: readonly CallChoiceCopy[],
): void {
  expect(copy.length, `choice count for ${where}`).toBe(data.length);
  data.forEach((c, i) => {
    const text = copy[i]!;
    expect(text.label.length, `label for ${where}[${i}]`).toBeGreaterThan(0);
    expect(text.next !== undefined, `next beat for ${where}[${i}]`).toBe(c.next !== undefined);
    if (c.next && text.next) expectParity(`${where}[${i}]`, c.next.choices, text.next.choices);
  });
}

describe('the ward (Father Stahl): Imperium', () => {
  const wardCtx = (emails: string[], imperium = true): CallEligibilityContext =>
    freshCtx({
      receivedEmailIds: new Set(['fr-stahl-2', 'parish-1', 'parish-2', ...emails]),
      unlockedActions: new Set(imperium ? ['suggestion', 'logismoi', 'imperium'] : ['suggestion']),
    });

  it('offers only "Hang up" until Father Greaves has written, keeping catalogue indices', () => {
    const before = buildCallInView('the-ward', wardCtx([]))!;
    expect(before.choices.map((c) => [c.index, c.label])).toEqual([[1, 'Hang up']]);

    const after = buildCallInView('the-ward', wardCtx(['fr-greaves-1']))!;
    expect(after.choices.map((c) => [c.index, c.label])).toEqual([
      [0, 'Memento Claram, Aemili'],
      [1, 'Hang up'],
    ]);
  });

  it('also needs the Imperium rite unlocked, letter or not', () => {
    const locked = buildCallInView('the-ward', wardCtx(['fr-greaves-1'], false))!;
    expect(locked.choices.map((c) => c.label)).toEqual(['Hang up']);
  });

  it('names Clare, holds three seconds of silence, then offers [IMPERIUM], which ends in its recording', () => {
    const memento = buildCallInView('the-ward', wardCtx(['fr-greaves-1']))!.choices[0]!;
    expect(memento.sub).toBeUndefined();
    expect(memento.next).toEqual({
      recording: null,
      silenceSec: 3,
      line: '',
      choices: [
        {
          index: 0,
          label: '[IMPERIUM]',
          dim: false,
          next: { recording: 'imperium', silenceSec: 0, line: '', choices: [] },
        },
      ],
    });
  });

  it('puts the story flag on [IMPERIUM] alone (catalogue path [0, 0])', () => {
    const ward = CALL_IN_BY_ID['the-ward']!;
    expect(choiceAtPath(ward.choices, [0])!.effects).toBeUndefined();
    expect(choiceAtPath(ward.choices, [0, 0])!.effects).toEqual([
      { kind: 'setFlag', flag: 'flagMarenDead' },
    ]);
    expect(choiceAtPath(ward.choices, [1])!.dim).toBe(true);
    expect(choiceAtPath(ward.choices, [0, 1])).toBeUndefined();
    expect(choiceAtPath(ward.choices, [2])).toBeUndefined();
  });

  it('shows every option with no context (no gate) and numbers ungated calls by position', () => {
    expect(buildCallInView('the-ward')!.choices).toHaveLength(2);
    expect(buildCallInView('eager-hands', freshCtx())!.choices.map((c) => c.index)).toEqual([
      0, 1, 2,
    ]);
  });
});

describe('buildCallOutView (calls placed from the dialer)', () => {
  it('joins the rectory call: Father Anselm twice, one answer each', () => {
    const v = buildCallOutView('the-rectory')!;
    expect(v.class).toBe('call-out');
    expect(v.audio).toBe(true);
    expect(v.recording).toBe('father_anselm_1');
    expect(v.caller).toBe('982 079');
    expect(v.line).toBe('Father Anselm speaking.');
    expect(v.choices).toHaveLength(1);
    const ask = v.choices[0]!;
    expect(ask.label).toBe('Scratches on a wall, tells you something?');
    expect(ask.next?.recording).toBe('father_anselm_2');
    expect(ask.next?.choices.map((c) => c.label)).toEqual([
      "Apologies. In case you have more information, here's my email [...]",
    ]);
    expect(ask.next?.choices[0]!.next).toBeUndefined(); // the last answer ends the call
  });

  it('returns null for an unknown id', () => {
    expect(buildCallOutView('no-such-call')).toBeNull();
  });

  it('every sim call-out has a stage entry and matching strings, at every beat', () => {
    for (const def of CALL_OUTS) {
      const data = CALLS_OUT.find((c) => c.id === def.id);
      expect(data, `stage entry for ${def.id}`).toBeDefined();
      const copy = strings.phone.callOut.calls[def.id];
      expect(copy, `strings for ${def.id}`).toBeDefined();
      expectParity(def.id, data!.choices, copy!.choices);
    }
  });
});

describe('describeCallInEffects', () => {
  const timedMul = (field: string, factor: number, durationSec = 3600): CallInEffect =>
    ({ kind: 'timedMul', field, factor, durationSec }) as CallInEffect;

  it('describes a small buff as "increases … for <duration>"', () => {
    expect(describeCallInEffects([timedMul('reprobateGenMul', 1.33)])).toBe(
      'Reprobate generation increases for 1 hour',
    );
  });

  it('names big multipliers (doubles / triples) instead of "increases"', () => {
    expect(describeCallInEffects([timedMul('indagatioEfficiencyMul', 2)])).toBe(
      'Search efficiency doubles for 1 hour',
    );
    expect(describeCallInEffects([timedMul('goldGainMul', 3, 8 * 3600)])).toBe(
      'Gold gain triples for 8 hours',
    );
    // The re-homed offline `doing-nothing` buff reads out of the same generator.
    expect(describeCallInEffects([timedMul('desidiaGainMul', 3, 8 * 3600)])).toBe(
      'Desidia generation triples for 8 hours',
    );
  });

  it('appends a cost as a "…, but …" clause (debuff / resource / cull)', () => {
    expect(
      describeCallInEffects([timedMul('reprobateGenMul', 2), timedMul('influenceRegenRate', 0.5)]),
    ).toBe('Reprobate generation doubles for 1 hour, but influence regeneration halves');
    expect(
      describeCallInEffects([timedMul('goldGainMul', 2), { kind: 'loseReprobatesPct', pct: 10 }]),
    ).toBe('Gold gain doubles for 1 hour, but you lose 10% of your reprobates');
    expect(
      describeCallInEffects([timedMul('reprobateGenMul', 2), { kind: 'spendGoldPct', pct: 33 }]),
    ).toBe('Reprobate generation doubles for 1 hour, but costs a third of your gold and reserve');
  });

  it('describes a standalone cull and a permanent boost', () => {
    expect(describeCallInEffects([{ kind: 'killReprobatesPct', pct: 10 }])).toBe(
      'Kills 10% of your reprobates',
    );
    expect(
      describeCallInEffects([
        { kind: 'permanentMul', field: 'maxInfluence', factor: 1.1 },
        { kind: 'spendGoldPct', pct: 100 },
      ]),
    ).toBe('Permanently raises maximum influence by 10%, but spends all your gold and reserve');
  });

  it('returns an empty string when there are no effects', () => {
    expect(describeCallInEffects([])).toBe('');
  });
});

describe('describeCallBuff (the buffs HUD effect line)', () => {
  it('names the round multipliers by their verb, with no duration', () => {
    expect(describeCallBuff('reprobateGenMul', 2)).toBe('Reprobate generation doubles');
    expect(describeCallBuff('desidiaGainMul', 3)).toBe('Desidia generation triples');
    expect(describeCallBuff('reprobateGenMul', 0.5)).toBe('Reprobate generation halves');
  });

  it('carries the percentage where the verb does not name it', () => {
    expect(describeCallBuff('goldGainMul', 1.33)).toBe('Gold gain increases by 33%');
    expect(describeCallBuff('goldGainMul', 1.25)).toBe('Gold gain increases by 25%');
    expect(describeCallBuff('influenceRegenRate', 1 / 1.5)).toBe(
      'Influence regeneration drops by 33%',
    );
  });
});

describe('callInSource', () => {
  it("gives a call's title and big caller name", () => {
    expect(callInSource('social-platform')).toEqual({ title: 'Social Platform', caller: 'Mai' });
    expect(callInSource('the-shipment')).toEqual({ title: 'The Shipment', caller: 'an acolyte' });
  });

  it('is null for an unknown id', () => {
    expect(callInSource('no-such-call')).toBeNull();
  });

  it('every catalogue call has a title', () => {
    for (const data of CALLS_IN) {
      expect(callInSource(data.id)?.title, `title for ${data.id}`).toBeTruthy();
    }
  });
});

describe('isCallEligible', () => {
  it('gates on katabasisCount (the-looting needs ≥1)', () => {
    const looting = CALL_IN_BY_ID['the-looting']!;
    expect(isCallEligible(freshCtx(), looting)).toBe(false);
    expect(isCallEligible(freshCtx({ katabasisCount: 1 }), looting)).toBe(true);
  });

  it('makes Succubus and Astiwihad mutually exclusive on the Fausto branch (both need his first letter)', () => {
    const succubus = CALL_IN_BY_ID['succubus']!;
    const astiwihad = CALL_IN_BY_ID['astiwihad']!;
    // Succubus is the friendly branch, but it only rings once Fausto's first letter (fausto-1) has
    // arrived — it never calls before the arc that summons her has begun.
    const friendlyNoMail = freshCtx({ fcFriendly: true });
    const friendly = freshCtx({ fcFriendly: true, receivedEmailIds: new Set(['fausto-1']) });
    const hostile = freshCtx({ fcFriendly: false, receivedEmailIds: new Set(['fausto-1']) });
    expect(isCallEligible(friendlyNoMail, succubus)).toBe(false); // no Fausto letter yet
    expect(isCallEligible(friendly, succubus)).toBe(true);
    expect(isCallEligible(friendly, astiwihad)).toBe(false);
    expect(isCallEligible(hostile, succubus)).toBe(false);
    expect(isCallEligible(hostile, astiwihad)).toBe(true);
  });

  it('gates the-ward on all three set-up emails being received', () => {
    const ward = CALL_IN_BY_ID['the-ward']!;
    expect(isCallEligible(freshCtx(), ward)).toBe(false);
    // Any subset is not enough.
    expect(
      isCallEligible(freshCtx({ receivedEmailIds: new Set(['fr-stahl-2', 'parish-1']) }), ward),
    ).toBe(false);
    // All three.
    expect(
      isCallEligible(
        freshCtx({ receivedEmailIds: new Set(['fr-stahl-2', 'parish-1', 'parish-2']) }),
        ward,
      ),
    ).toBe(true);
  });

  it('treats a requirement-free call as always eligible', () => {
    expect(isCallEligible(freshCtx(), CALL_IN_BY_ID['eager-hands']!)).toBe(true);
  });
});

describe('pickIncomingCall', () => {
  it('draws from the rolled class bucket, uniform within it', () => {
    // roll → buff-positive bucket (0.10*100 = 10 < 25), then index 0 of that bucket.
    expect(pickIncomingCall(seq([0.1, 0]))).toBe('the-cycle-turns');
    // roll → easter-egg bucket (0.995*100 = 99.5), its first call.
    expect(pickIncomingCall(seq([0.995, 0]))).toBe('tormented-soul');
  });

  it('never returns a once-only call that has already been received', () => {
    const seenLore = new Set(CALLS_IN.filter((c) => isOnceOnly(c.class)).map((c) => c.id));
    for (let i = 0; i < 50; i++) {
      const drawn = pickIncomingCall(seq([Math.random(), Math.random()]), seenLore);
      expect(seenLore.has(drawn ?? '')).toBe(false);
    }
  });

  it('never rings the Succubus again once answered, even when it is the only lore call left', () => {
    // Friendly Fausto branch with his first letter in: the Succubus is eligible and is the only lore
    // call, so it owns the whole 50% lore bucket. Answered (in the saved `callsAnswered`), it is gone.
    const eligible = eligibleCallIds(freshCtx({ receivedEmailIds: new Set(['fausto-1']) }));
    expect(eligible.has('succubus')).toBe(true);
    // roll → the lore bucket (0.5*100 = 50, past the 49 of buffs), its only call.
    expect(pickIncomingCall(seq([0.5, 0]), new Set(), eligible)).toBe('succubus');
    const answered = new Set(['succubus']);
    for (let i = 0; i < 200; i++) {
      const drawn = pickIncomingCall(seq([Math.random(), Math.random()]), answered, eligible);
      expect(drawn).not.toBe('succubus');
    }
  });

  it('restricts the draw to the eligible set (gated calls never ring)', () => {
    const eligible = eligibleCallIds(freshCtx()); // fresh: friendly, no descents, no mail
    expect(eligible.has('succubus')).toBe(false); // Fausto's first letter has not arrived yet
    expect(eligible.has('astiwihad')).toBe(false);
    expect(eligible.has('the-looting')).toBe(false);
    expect(eligible.has('the-journalist')).toBe(false);
    // Once fausto-1 is received (and the friendly branch is still open), the Succubus can ring.
    expect(
      eligibleCallIds(freshCtx({ receivedEmailIds: new Set(['fausto-1']) })).has('succubus'),
    ).toBe(true);
    for (let i = 0; i < 100; i++) {
      const drawn = pickIncomingCall(seq([Math.random(), Math.random()]), new Set(), eligible);
      expect(drawn).not.toBeNull();
      expect(eligible.has(drawn!)).toBe(true);
    }
  });

  it('applies the recency cooldown — a recently-received call is skipped', () => {
    // The same roll normally lands the-cycle-turns (positive bucket, index 0); with it "recent" the
    // draw must fall to the next call in that bucket instead.
    expect(pickIncomingCall(seq([0.1, 0]))).toBe('the-cycle-turns');
    const recent = new Set(['the-cycle-turns']);
    expect(pickIncomingCall(seq([0.1, 0]), new Set(), null, recent)).toBe('eager-hands');
    for (let i = 0; i < 100; i++) {
      const drawn = pickIncomingCall(seq([Math.random(), Math.random()]), new Set(), null, recent);
      expect(drawn).not.toBe('the-cycle-turns');
    }
  });

  it('drops the recency cooldown rather than starving the line', () => {
    // Only one call is eligible and it is also "recent" — the cooldown yields so it still rings.
    const only = new Set(['eager-hands']);
    const recent = new Set(['eager-hands']);
    expect(pickIncomingCall(seq([0.5, 0]), new Set(), only, recent)).toBe('eager-hands');
  });

  it('buffs are never excluded — selection keeps producing recurring calls', () => {
    expect(pickIncomingCall(seq([0, 0]))).not.toBeNull();
  });
});
