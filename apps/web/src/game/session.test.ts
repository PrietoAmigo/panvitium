import { describe, it, expect } from 'vitest';
import { bn, eq } from '@panvitium/sim';
import { startNewGame, resumeGame, MAX_OFFLINE_SECONDS } from './session.js';

describe('session', () => {
  it('starts a new game at the given time with empty resources', () => {
    const s = startNewGame(5000);
    expect(s.lastTickAt).toBe(5000);
    expect(eq(s.souls, bn(0))).toBe(true);
  });

  it('applies offline progression up to the elapsed time', () => {
    const s = startNewGame(0);
    const r = resumeGame(s, 10_000); // 10s later
    expect(r.lastTickAt).toBe(10_000);
  });

  it('caps offline time to MAX_OFFLINE_SECONDS', () => {
    const s = startNewGame(0);
    const farFuture = (MAX_OFFLINE_SECONDS + 100_000) * 1000;
    const r = resumeGame(s, farFuture);
    expect(r.lastTickAt).toBe(MAX_OFFLINE_SECONDS * 1000);
  });
});
