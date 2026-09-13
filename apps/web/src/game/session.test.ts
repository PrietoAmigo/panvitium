import { describe, it, expect } from 'vitest';
import { bn, eq, totalReprobates, type GameState } from '@panvitium/sim';
import { startNewGame, resumeGame } from './session.js';

describe('session', () => {
  it('starts a new game at the given time with empty resources', () => {
    const s = startNewGame(5000);
    expect(s.lastTickAt).toBe(5000);
    expect(eq(s.souls, bn(0))).toBe(true);
  });

  it('resumeGame advances the logical clock to now', () => {
    const s = startNewGame(0);
    const r = resumeGame(s, 10_000); // 10s later
    expect(r.lastTickAt).toBe(10_000);
  });

  it('resumeGame never moves the clock backwards (clock-skew guard)', () => {
    const s = startNewGame(10_000);
    const r = resumeGame(s, 5_000); // now < lastTickAt
    expect(r.lastTickAt).toBe(10_000);
  });

  it('freezes offline: no gold / souls / hoard / reprobates accrue over any span (ADR-032)', () => {
    // A state that WOULD earn while running: gold trickle, a hoard paying interest, a live reprobate.
    const base = startNewGame(0);
    const saved: GameState = {
      ...base,
      souls: bn(42),
      lifetime: { ...base.lifetime, gold: bn(1000), hoard: bn(100_000), reprobates: 5 },
    };
    const farFuture = 30 * 24 * 3600 * 1000; // 30 days away
    const r = resumeGame(saved, farFuture);
    expect(r.lastTickAt).toBe(farFuture); // the clock catches up
    // …but nothing was simulated: every resource is exactly as saved.
    expect(eq(r.souls, saved.souls)).toBe(true);
    expect(eq(r.lifetime.gold, saved.lifetime.gold)).toBe(true);
    expect(eq(r.lifetime.hoard, saved.lifetime.hoard)).toBe(true);
    expect(totalReprobates(r)).toBe(totalReprobates(saved));
  });

  it('restores the player where they were: a mid-descent save stays in Katabasis', () => {
    const saved: GameState = { ...startNewGame(0), inKatabasis: true };
    const r = resumeGame(saved, 3600 * 1000);
    expect(r.inKatabasis).toBe(true);
  });

  it('grants Desidia for the offline span (0.2/min), capped (ADR-033)', () => {
    const saved = startNewGame(0); // desidia 0, base cap 120
    // 10 minutes away = 600 s → 600 × 0.2/60 = 2 desidia.
    expect(resumeGame(saved, 600_000).desidia).toBeCloseTo(2, 6);
    // A long absence saturates at the cap.
    expect(resumeGame(saved, 1e12).desidia).toBe(120);
  });

  it('leaves every field untouched apart from the clock and the Desidia grant', () => {
    const saved = startNewGame(1000);
    const r = resumeGame(saved, 500_000);
    expect({ ...r, lastTickAt: saved.lastTickAt, desidia: saved.desidia }).toEqual(saved);
  });

  it('zero elapsed is a pure no-op', () => {
    const saved = startNewGame(1234);
    expect(resumeGame(saved, 1234)).toEqual(saved);
  });
});
