import { describe, it, expect } from 'vitest';
import { ACTIONS, runnerCycleDuration } from '@panvitium/sim';
import { actionProgress } from './progress.js';

describe('actionProgress', () => {
  it('always starts at 0% and ends at 100%, at any efficiency', () => {
    for (const id of ['caedes', 'indagatio']) {
      for (const eff of [0.5, 1, 4]) {
        const total = runnerCycleDuration(id, eff);
        expect(actionProgress(id, total, eff)).toBe(0); // remaining = total → just started
        expect(actionProgress(id, 0, eff)).toBe(1); // remaining 0 → finished
        expect(actionProgress(id, total / 2, eff)).toBeCloseTo(0.5, 6); // halfway
      }
    }
  });

  it('higher efficiency fills a time-mode bar faster (smaller total) but still from 0%', () => {
    const slow = runnerCycleDuration('indagatio', 1); // total = base
    const fast = runnerCycleDuration('indagatio', 4); // total = base / 4 → fills 4× faster
    expect(fast).toBeLessThan(slow);
    // One second in, the higher-efficiency bar is further along...
    expect(actionProgress('indagatio', slow - 1, 1)).toBeLessThan(
      actionProgress('indagatio', fast - 1, 4),
    );
    // ...yet both begin at 0% — efficiency never offsets the start.
    expect(actionProgress('indagatio', slow, 1)).toBe(0);
    expect(actionProgress('indagatio', fast, 4)).toBe(0);
  });

  it('cost-outcome duration is fixed — efficiency changes neither the total nor the start', () => {
    expect(ACTIONS['caedes']!.efficiencyMode).toBe('cost-outcome');
    expect(runnerCycleDuration('caedes', 1)).toBe(runnerCycleDuration('caedes', 8));
    expect(actionProgress('caedes', runnerCycleDuration('caedes', 8), 8)).toBe(0);
  });
});
