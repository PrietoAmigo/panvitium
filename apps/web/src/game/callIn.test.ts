/**
 * Unit tests for the incoming-call view-model + weighted selection. These pin the catalogue↔strings
 * join (caller/tag derivation, typed vs. recorded line, choice count parity) and the class-bucketed
 * draw (weight, once-only eligibility, determinism off the injected RNG).
 */
import { describe, it, expect } from 'vitest';
import { buildCallInView, pickIncomingCall } from './callIn.js';
import { CALLS_IN, isOnceOnly } from '../menus/calls-in.data.js';
import { strings } from '@panvitium/shared';

/** A deterministic `random` that replays a fixed queue (then holds its last value). */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
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
    expect(v!.choices[0]!.sub).toBe('take the margin while it runs');
  });

  it('joins a typed call: kicker tag, the afflicted as caller, full line present', () => {
    const v = buildCallInView('dying-soul');
    expect(v!.audio).toBe(false);
    expect(v!.tag).toBe('no number · the afflicted');
    expect(v!.caller).toBe('the afflicted');
    expect(v!.line.length).toBeGreaterThan(0);
    expect(v!.choices.map((c) => c.dim)).toEqual([false, false, true]);
  });

  it('returns null for an unknown id', () => {
    expect(buildCallInView('no-such-call')).toBeNull();
  });

  it('every catalogue call has matching strings with the same choice count', () => {
    for (const data of CALLS_IN) {
      const copy = strings.phone.callIn.calls[data.id];
      expect(copy, `strings for ${data.id}`).toBeDefined();
      expect(copy!.choices.length, `choice count for ${data.id}`).toBe(data.choices.length);
      // The build must not throw and must yield one view per choice.
      const v = buildCallInView(data.id);
      expect(v, `view for ${data.id}`).not.toBeNull();
      expect(v!.choices).toHaveLength(data.choices.length);
    }
  });
});

describe('pickIncomingCall', () => {
  it('draws from the rolled class bucket, uniform within it', () => {
    // roll → buff-positive bucket (0.10*100 = 10 < 25), then index 0 of that bucket.
    expect(pickIncomingCall(seq([0.1, 0]))).toBe('the-cycle-turns');
    // roll → easter-egg bucket (0.995*100 = 99.5), its single call.
    expect(pickIncomingCall(seq([0.995, 0]))).toBe('tormented-soul');
  });

  it('never returns a once-only call that has already been received', () => {
    const seen = new Set(['tormented-soul']);
    // Even forcing the top of the roll (where the egg bucket would sit) skips it once seen.
    const id = pickIncomingCall(seq([0.999, 0]), seen);
    expect(id).not.toBe('tormented-soul');
    expect(id).not.toBeNull();
    // And a once-only lore call, once seen, is also excluded.
    const seenLore = new Set(CALLS_IN.filter((c) => isOnceOnly(c.class)).map((c) => c.id));
    for (let i = 0; i < 50; i++) {
      const drawn = pickIncomingCall(seq([Math.random(), Math.random()]), seenLore);
      expect(seenLore.has(drawn ?? '')).toBe(false);
    }
  });

  it('buffs are never excluded — selection keeps producing recurring calls', () => {
    const id = pickIncomingCall(seq([0, 0]));
    expect(id).not.toBeNull();
  });
});
