import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BANSHEE_SCREAM_CHANCE, BANSHEE_SCREAM_EVERY, bansheeScream, summonCue } from './audio.js';

const KEY = 'panvitium:banshee-scream';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bansheeScream', () => {
  it('screams, once ready, only when the roll lands under the 10% chance', () => {
    expect(BANSHEE_SCREAM_CHANCE).toBe(0.1);
    expect(bansheeScream(32, 0)).toEqual({ scream: true, summonsSinceScream: 0 });
    expect(bansheeScream(32, 0.0999)).toEqual({ scream: true, summonsSinceScream: 0 });
    expect(bansheeScream(32, 0.1)).toEqual({ scream: false, summonsSinceScream: 32 });
    expect(bansheeScream(32, 0.99)).toEqual({ scream: false, summonsSinceScream: 32 });
  });

  it('stays silent for the 32 summons after a scream, whatever the roll', () => {
    expect(BANSHEE_SCREAM_EVERY).toBe(33);
    for (let n = 0; n < 32; n++) {
      expect(bansheeScream(n, 0)).toEqual({ scream: false, summonsSinceScream: n + 1 });
    }
  });
});

describe('summonCue', () => {
  it('lets the first ever Banshee summon scream', () => {
    expect(summonCue('banshee', 0)).toBe('banshee-scream');
    expect(localStorage.getItem(KEY)).toBe('0');
  });

  it('screams at most once in any 33 Banshee summons, remembered on this device', () => {
    const cues = Array.from({ length: 67 }, () => summonCue('banshee', 0));
    const screams = cues.flatMap((c, i) => (c === 'banshee-scream' ? [i] : []));
    // Every roll would scream: the lockout alone spaces them 33 summons apart.
    expect(screams).toEqual([0, 33, 66]);
  });

  it('counts silent summons toward the lockout too', () => {
    expect(summonCue('banshee', 0)).toBe('banshee-scream');
    for (let i = 0; i < 31; i++) expect(summonCue('banshee', 0.99)).toBeNull();
    expect(summonCue('banshee', 0)).toBeNull(); // the 32nd after the scream: still locked
    expect(summonCue('banshee', 0)).toBe('banshee-scream'); // the 33rd
  });

  it('reads an absent, corrupt or blocked store as ready', () => {
    localStorage.setItem(KEY, 'not a number');
    expect(summonCue('banshee', 0)).toBe('banshee-scream');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(summonCue('banshee', 0)).toBe('banshee-scream');
  });

  it('never cues for any other invocation, and leaves the Banshee count alone', () => {
    expect(summonCue('erinyes', 0)).toBeNull();
    expect(summonCue('familiar', 0)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
