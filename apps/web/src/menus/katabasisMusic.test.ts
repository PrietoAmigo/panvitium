import { describe, expect, it } from 'vitest';
import { fadeVolume } from './katabasisMusic.js';

describe('fadeVolume (the Katabasis score fade)', () => {
  it('sits exactly at its start before the fade and exactly at its end after it', () => {
    expect(fadeVolume(0, 0.4, 0)).toBe(0);
    expect(fadeVolume(0, 0.4, -1)).toBe(0);
    expect(fadeVolume(0, 0.4, 1)).toBe(0.4);
    expect(fadeVolume(0, 0.4, 2)).toBe(0.4);
    expect(fadeVolume(0.4, 0, 0)).toBe(0.4);
    expect(fadeVolume(0.4, 0, 1)).toBe(0);
    expect(fadeVolume(0.13, 0.4, 1)).toBe(0.4);
  });

  it('rises out of the silence slowly and swells late', () => {
    expect(fadeVolume(0, 0.4, 0.25)).toBeCloseTo(0.025, 10);
    expect(fadeVolume(0, 0.4, 0.5)).toBeCloseTo(0.1, 10);
    expect(fadeVolume(0, 0.4, 0.75)).toBeCloseTo(0.225, 10);
  });

  it('falls as the time-reverse of the rise: early to give way, slow into the silence', () => {
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(fadeVolume(0.4, 0, t)).toBeCloseTo(fadeVolume(0, 0.4, 1 - t), 10);
    }
  });

  it('moves steadily one way, never overshooting either end', () => {
    let up = -1;
    let down = 2;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const u = fadeVolume(0, 0.4, t);
      const d = fadeVolume(0.4, 0, t);
      expect(u).toBeGreaterThanOrEqual(up);
      expect(d).toBeLessThanOrEqual(down);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(0.4);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(0.4);
      up = u;
      down = d;
    }
  });
});
