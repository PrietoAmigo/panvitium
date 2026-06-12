import { describe, it, expect } from 'vitest';
import {
  bn,
  BASE_GOLD_PER_SECOND,
  PLAYER_OFFLINE_EFFICIENCY,
  eq,
  gt,
  type GameState,
} from '@panvitium/sim';
import {
  startNewGame,
  resumeGame,
  offlineRecap,
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
    // (Globals row 8, wired with the Mercatus signature clauses). Allow drift from skills.
    expect(goldBase).toBeGreaterThan(BASE_GOLD_PER_SECOND * PLAYER_OFFLINE_EFFICIENCY * 3000);
    expect(goldBase).toBeLessThan(BASE_GOLD_PER_SECOND * 3600); // …and clearly below full rate
  });

  it('Mercatus Acediae: its take is exempt from the 0.5 offline efficiency on resume', () => {
    // Two saves, identical but for which trade holds the depth. Offline, the Acediae trade earns
    // double the Tristitiae one (its revenue is restored to full wall-clock rate while everything
    // else — including the base trickle — accrues at the halved clock).
    const base = startNewGame(0);
    const populated = (depths: Record<string, number>): GameState => ({
      ...base,
      lifetime: { ...base.lifetime, reprobates: 1000, mercatusDepths: depths },
    });
    const hour = 3600 * 1000;
    const viaAcedia = resumeGame(populated({ acedia: 10 }), hour).lifetime.gold.toNumber();
    const viaTristitia = resumeGame(populated({ tristitia: 10 }), hour).lifetime.gold.toNumber();
    // Strip the shared base-gold trickle (2/s × 1800 effective seconds) before comparing trades.
    // The Acediae save also carries its per-depth offline lift (+0.825%/depth on the gain rate),
    // so its margin over the doubled Tristitiae take is strictly positive.
    const baseTrickle = BASE_GOLD_PER_SECOND * 3600 * PLAYER_OFFLINE_EFFICIENCY;
    expect(viaAcedia - baseTrickle).toBeGreaterThan((viaTristitia - baseTrickle) * 2);
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
