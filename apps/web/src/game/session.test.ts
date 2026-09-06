import { describe, it, expect } from 'vitest';
import {
  bn,
  BASE_GOLD_PER_SECOND,
  PLAYER_OFFLINE_EFFICIENCY,
  eq,
  gt,
  totalReprobates,
  type GameState,
} from '@panvitium/sim';
import {
  startNewGame,
  resumeGame,
  offlineRecap,
  offlineProjection,
  offlineFactors,
  ACEDIA_COMPOUND_CAP_SECONDS,
  MIN_OFFLINE_RECAP_SECONDS,
} from './session.js';

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

  it('runs offline progression uncapped over the full elapsed time (ADR-004 amended)', () => {
    const s = startNewGame(0);
    const farFuture = (ACEDIA_COMPOUND_CAP_SECONDS + 100_000) * 1000;
    const r = resumeGame(s, farFuture);
    // No cap: the full elapsed wall-clock advances the logical clock (a fresh game has neutral muls).
    expect(r.lastTickAt).toBe(farFuture);
  });

  it('bounds the Acedia time-compound at the saturation point while base accrual stays uncapped', () => {
    // Past the saturation point the Acedia multiplier is identical, but extra real time still earns
    // more — proving the base accrual is uncapped while only the exponential bonus is held.
    const base = startNewGame(0);
    const lifted: GameState = { ...base, devotion: { ...base.devotion, acedia: bn(180 ** 4) } };
    const g1 = resumeGame(
      lifted,
      (ACEDIA_COMPOUND_CAP_SECONDS + 1000) * 1000,
    ).lifetime.gold.toNumber();
    const g2 = resumeGame(
      lifted,
      (ACEDIA_COMPOUND_CAP_SECONDS + 2000) * 1000,
    ).lifetime.gold.toNumber();
    expect(g2).toBeGreaterThan(g1);
    expect(Number.isFinite(g2)).toBe(true);
  });

  it('Acedia per-level compounds offline gold gain (03 §1: 1.00002^(X·L²))', () => {
    // Same offline duration; with Acedia level 4 the catchup tick advances longer than baseline.
    // 1 hour offline = 60 min. With L=4 and BASE=1.00002, compound = 1.00002^(60·16) = 1.00002^960.
    const offlineMs = 60 * 60 * 1000; // 1 hour
    const base = startNewGame(0);
    // Level 4 = 180^4 Devotion to Acedia.
    const lifted: GameState = { ...base, devotion: { ...base.devotion, acedia: bn(180 ** 4) } };
    const rBase = resumeGame(base, offlineMs);
    const rLifted = resumeGame(lifted, offlineMs);
    const goldBase = rBase.lifetime.gold.toNumber();
    const goldLifted = rLifted.lifetime.gold.toNumber();
    // The lifted state accumulates MORE gold because the catchup tick ran on a stretched delta.
    expect(goldLifted).toBeGreaterThan(goldBase);
    // Baseline sanity: gold ≈ BASE_GOLD_PER_SECOND × 3600 × the 0.5 player offline efficiency
    // (Globals row 8). Allow drift from skills.
    expect(goldBase).toBeGreaterThan(BASE_GOLD_PER_SECOND * PLAYER_OFFLINE_EFFICIENCY * 3000);
    expect(goldBase).toBeLessThan(BASE_GOLD_PER_SECOND * 3600); // …and clearly below full rate
  });

  it('the Thesaurus interest takes the 0.5 offline efficiency like every other income (ADR-026)', () => {
    // The Mercatus Acediae exemption retired with the trades: an hour away accrues interest at
    // the halved clock, exactly like the base trickle.
    const base = startNewGame(0);
    const vaulted: GameState = {
      ...base,
      lifetime: { ...base.lifetime, hoard: bn(100_000) },
    };
    const hour = 3600 * 1000;
    const gained = resumeGame(vaulted, hour).lifetime.gold.toNumber();
    // (2 base + 0.0005 × 100,000 interest) gold/s × 3600 s × 0.5 offline efficiency.
    expect(gained).toBeCloseTo((BASE_GOLD_PER_SECOND + 50) * 3600 * PLAYER_OFFLINE_EFFICIENCY, 0);
  });

  it('zero offline time = no catchup, regardless of Acedia level (no NaN, no division)', () => {
    const base = startNewGame(0);
    const lifted: GameState = { ...base, devotion: { ...base.devotion, acedia: bn(180 ** 4) } };
    const r = resumeGame(lifted, 0); // now == lastTickAt → 0 elapsed
    expect(r.lifetime.gold.toNumber()).toBe(0);
    expect(r.lastTickAt).toBe(0);
  });

  it('Sallos #19 lifts offline gold gain specifically, without touching influence', () => {
    const offlineMs = 3600 * 1000; // 1 hour
    const base = startNewGame(0);
    const sallos: GameState = {
      ...base,
      sigilBindings: { ...base.sigilBindings, 19: bn(1_000_000) }, // ≈ ×2 offline gold
    };
    const goldBase = resumeGame(base, offlineMs).lifetime.gold.toNumber();
    const goldSallos = resumeGame(sallos, offlineMs).lifetime.gold.toNumber();
    expect(goldSallos).toBeGreaterThan(goldBase);
    // Sallos is gold-only — influence (Forneus's channel) is unchanged.
    const infBase = resumeGame(base, offlineMs).lifetime.influence.toNumber();
    const infSallos = resumeGame(sallos, offlineMs).lifetime.influence.toNumber();
    expect(infSallos).toBeCloseTo(infBase, 6);
  });
});

describe('offlineRecap (welcome-back, 5.4)', () => {
  it('returns null for a short absence (below the recap threshold)', () => {
    const saved = startNewGame(0);
    const now = (MIN_OFFLINE_RECAP_SECONDS - 5) * 1000;
    expect(offlineRecap(saved, resumeGame(saved, now), now)).toBeNull();
  });

  it('reports away time and net gains after a meaningful absence', () => {
    const saved = startNewGame(0);
    const now = 3600 * 1000; // 1 hour
    const recap = offlineRecap(saved, resumeGame(saved, now), now);
    expect(recap).not.toBeNull();
    expect(recap!.awaySeconds).toBe(3600);
    expect(gt(recap!.gold, bn(0))).toBe(true); // base gold accrues offline
  });

  it('reports the full away time uncapped (ADR-004 amended — no cap flag)', () => {
    const saved = startNewGame(0);
    const seconds = ACEDIA_COMPOUND_CAP_SECONDS + 100_000;
    const recap = offlineRecap(saved, resumeGame(saved, seconds * 1000), seconds * 1000);
    expect(recap!.awaySeconds).toBe(seconds);
    expect('capped' in recap!).toBe(false);
  });

  it('returns null while frozen mid-descent (the Katabasis menu reopens instead)', () => {
    const saved: GameState = { ...startNewGame(0), inKatabasis: true };
    const now = 3600 * 1000;
    expect(offlineRecap(saved, resumeGame(saved, now), now)).toBeNull();
  });
});

describe('offlineProjection (Analytics offline preview)', () => {
  it('projects positive gold over a one-hour window from the current state', () => {
    const proj = offlineProjection(startNewGame(0), 3600);
    expect(proj.windowSeconds).toBe(3600);
    expect(gt(proj.gold, bn(0))).toBe(true); // base gold accrues offline
  });

  it('matches the resumeGame diff over the same window (it IS the offline path)', () => {
    const s = startNewGame(0);
    const resumed = resumeGame(s, s.lastTickAt + 3600 * 1000);
    const proj = offlineProjection(s, 3600);
    expect(proj.gold.toNumber()).toBeCloseTo(
      resumed.lifetime.gold.toNumber() - s.lifetime.gold.toNumber(),
      6,
    );
    expect(proj.reprobates).toBe(totalReprobates(resumed) - totalReprobates(s));
  });

  it('projects nothing while frozen mid-descent (no offline sim runs)', () => {
    const proj = offlineProjection({ ...startNewGame(0), inKatabasis: true }, 3600);
    expect(eq(proj.gold, bn(0))).toBe(true);
    expect(proj.reprobates).toBe(0);
  });
});

describe('offlineFactors (Analytics offline scaling)', () => {
  it('scales a fresh window by the base offline efficiency alone', () => {
    const f = offlineFactors(startNewGame(0), 3600);
    expect(f.scaledSeconds).toBeCloseTo(3600 * PLAYER_OFFLINE_EFFICIENCY, 6);
    expect(f.goldMul).toBe(1);
    expect(f.influenceMul).toBe(1);
    expect(f.generationMul).toBe(1);
  });

  it('lists the base offline rate as the only active effect when nothing else is in play', () => {
    const f = offlineFactors(startNewGame(0), 3600);
    const base = f.buffs.find((b) => b.kind === 'baseRate');
    expect(base?.mul).toBe(PLAYER_OFFLINE_EFFICIENCY);
    expect(f.buffs).toHaveLength(1);
  });

  it('grows the scaled span super-linearly under the Acedia sloth compound', () => {
    // Acedia level 2 (Devotion 180^2) gives a positive time-compound exponent, so a longer window
    // accrues more than a straight multiple of a shorter one (the exponential term).
    const base = startNewGame(0);
    const slothful: GameState = {
      ...base,
      devotion: { ...base.devotion, acedia: bn(180 ** 2) },
    };
    const short = offlineFactors(slothful, 3600);
    const long = offlineFactors(slothful, 8 * 3600);
    expect(long.scaledSeconds / short.scaledSeconds).toBeGreaterThan(8);
    expect(long.buffs.some((b) => b.kind === 'acediaCompound')).toBe(true);
  });
});
