/**
 * Unit tests for the incoming-call view-model, requirement gate, and weighted selection. These pin
 * the catalogue↔strings join (caller/tag derivation, choice-count parity), the per-call eligibility
 * predicate (docs "Requirements" — katabasisCount, the Fausto branch, received emails), and the
 * class-bucketed draw (weight, once-only + requirement gating, determinism off the injected RNG).
 */
import { describe, it, expect } from 'vitest';
import {
  buildCallInView,
  pickIncomingCall,
  isCallEligible,
  eligibleCallIds,
  describeCallInEffects,
  type CallEligibilityContext,
} from './callIn.js';
import type { CallInEffect } from '../menus/calls-in.data.js';
import { CALLS_IN, CALL_IN_BY_ID, isOnceOnly } from '../menus/calls-in.data.js';
import { strings } from '@panvitium/shared';

/** A deterministic `random` that replays a fixed queue (then holds its last value). */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

/** A permissive context (fresh game): no descents, Fausto friendly, no mail. */
function freshCtx(over: Partial<CallEligibilityContext> = {}): CallEligibilityContext {
  return { katabasisCount: 0, fcFriendly: true, receivedEmailIds: new Set(), ...over };
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

  it('every catalogue call has matching strings with the same choice count', () => {
    for (const data of CALLS_IN) {
      const copy = strings.phone.callIn.calls[data.id];
      expect(copy, `strings for ${data.id}`).toBeDefined();
      expect(copy!.choices.length, `choice count for ${data.id}`).toBe(data.choices.length);
      const v = buildCallInView(data.id);
      expect(v, `view for ${data.id}`).not.toBeNull();
      expect(v!.choices).toHaveLength(data.choices.length);
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
    expect(describeCallInEffects([timedMul('offlineRate', 3, 8 * 3600)])).toBe(
      'Offline progress triples for 8 hours',
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
    ).toBe('Reprobate generation doubles for 1 hour, but costs a third of your gold');
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
    ).toBe('Permanently raises maximum influence by 10%, but spends all your gold');
  });

  it('returns an empty string when there are no effects', () => {
    expect(describeCallInEffects([])).toBe('');
  });
});

describe('isCallEligible', () => {
  it('gates on katabasisCount (the-looting needs ≥1)', () => {
    const looting = CALL_IN_BY_ID['the-looting']!;
    expect(isCallEligible(freshCtx(), looting)).toBe(false);
    expect(isCallEligible(freshCtx({ katabasisCount: 1 }), looting)).toBe(true);
  });

  it('makes Succubus and Astiwihad mutually exclusive on the Fausto branch', () => {
    const succubus = CALL_IN_BY_ID['succubus']!;
    const astiwihad = CALL_IN_BY_ID['astiwihad']!;
    const friendly = freshCtx({ fcFriendly: true });
    const hostile = freshCtx({ fcFriendly: false });
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

  it('restricts the draw to the eligible set (gated calls never ring)', () => {
    const eligible = eligibleCallIds(freshCtx()); // fresh: friendly, no descents, no mail
    expect(eligible.has('succubus')).toBe(true);
    expect(eligible.has('astiwihad')).toBe(false);
    expect(eligible.has('the-looting')).toBe(false);
    expect(eligible.has('the-journalist')).toBe(false);
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
