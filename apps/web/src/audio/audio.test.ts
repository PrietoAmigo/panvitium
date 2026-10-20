import { describe, expect, it } from 'vitest';
import { BANSHEE_SCREAM_CHANCE, summonCue } from './audio.js';

describe('summonCue', () => {
  it('screams on a Banshee summon only when the roll lands under the 5% chance', () => {
    expect(BANSHEE_SCREAM_CHANCE).toBe(0.05);
    expect(summonCue('banshee', 0)).toBe('banshee-scream');
    expect(summonCue('banshee', 0.0499)).toBe('banshee-scream');
    expect(summonCue('banshee', 0.05)).toBeNull();
    expect(summonCue('banshee', 0.99)).toBeNull();
  });

  it('never cues for any other invocation', () => {
    expect(summonCue('erinyes', 0)).toBeNull();
    expect(summonCue('familiar', 0)).toBeNull();
  });
});
