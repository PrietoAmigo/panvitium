import { describe, it, expect } from 'vitest';
import { bn, gt } from './bignum.js';
import { createInitialState, SINS, type GameState } from './state.js';
import { devotionForLevel } from './progression.js';
import {
  deliverEmails,
  unreadCount,
  markEmailRead,
  markAllEmailsRead,
  answerEmail,
  deleteEmail,
  applyEmailReplyEffect,
  totalSinLevel,
} from './emails.js';
import { computeModifiers } from './modifiers.js';

const MIN = 60_000; // one minute in ms

/** A state with every Cardinal Sin pushed to exactly level `n` (each via its Devotion threshold). */
function withAllSins(base: GameState, n: number): GameState {
  const devotion = { ...base.devotion };
  for (const s of SINS) devotion[s] = devotionForLevel(n);
  return { ...base, devotion };
}

describe('emails — immediate triggers', () => {
  it('delivers a soul-threshold parish bulletin once the tally is reached, and never twice', () => {
    const base = createInitialState('seed', 0);
    const rich: GameState = { ...base, totalSoulsObtained: bn(2e6) };
    const r1 = deliverEmails(rich, 1000);
    expect(r1.delivered).toContain('parish-1');
    expect(r1.state.lifetime.inbox.map((e) => e.id)).toContain('parish-1');
    // Already in the inbox → dedup keeps it from re-delivering (same reference when nothing else fires).
    const r2 = deliverEmails(r1.state, 2000);
    expect(r2.delivered).not.toContain('parish-1');
  });

  it('routes Father Stahl by the flagFatherMad branch', () => {
    const base = createInitialState('seed', 0);
    // All sins level 3, priest NOT mad → Stahl #1 fires.
    const sane = withAllSins(base, 3);
    expect(deliverEmails(sane, 1).delivered).toContain('fr-stahl-1');
    // All sins only level 2, priest NOT mad → Stahl #1 does NOT fire yet.
    const low = withAllSins(base, 2);
    expect(deliverEmails(low, 1).delivered).not.toContain('fr-stahl-1');
    // …but at level 2 WITH the priest mad, the early branch fires.
    const lowMad: GameState = { ...low, flagFatherMad: true };
    expect(deliverEmails(lowMad, 1).delivered).toContain('fr-stahl-1');
  });

  it('gates the Bishop on an un-maddened priest', () => {
    const base = withAllSins(createInitialState('seed', 0), 2);
    expect(deliverEmails(base, 1).delivered).toContain('bishop-crane');
    const mad: GameState = { ...base, flagFatherMad: true };
    expect(deliverEmails(mad, 1).delivered).not.toContain('bishop-crane');
  });
});

describe('emails — timed triggers', () => {
  it('arms on first eligibility and fires only after the delay elapses', () => {
    const base = createInitialState('seed', 1_000_000);
    // Father Tom #2 fires on Avaritia level 2 — but it is immediate, so use a TIMED one: gideon-1
    // arms at katabasisCount >= 1 and fires 2 minutes later.
    const returned: GameState = { ...base, katabasisCount: 1 };
    const armed = deliverEmails(returned, 1_000_000);
    // Armed this tick, not yet delivered.
    expect(armed.delivered).not.toContain('gideon-1');
    expect(armed.state.lifetime.emailArmedAt['gideon-1']).toBe(1_000_000);
    // Still too early one minute on.
    const early = deliverEmails(armed.state, 1_000_000 + 1 * MIN);
    expect(early.delivered).not.toContain('gideon-1');
    // Past the 2-minute delay → delivered.
    const late = deliverEmails(armed.state, 1_000_000 + 3 * MIN);
    expect(late.delivered).toContain('gideon-1');
  });

  it('re-checks the fire gate at delivery (Gideon #3 only if Plutus is still active)', () => {
    const base = createInitialState('seed', 0);
    const withPlutus: GameState = {
      ...base,
      lifetime: { ...base.lifetime, invocations: { plutus: 1 } },
    };
    const armed = deliverEmails(withPlutus, 0); // arms gideon-3
    expect(armed.state.lifetime.emailArmedAt['gideon-3']).toBe(0);
    // Plutus dispelled before the 5-minute mark → the gate fails, no delivery.
    const dispelled: GameState = {
      ...armed.state,
      lifetime: { ...armed.state.lifetime, invocations: {} },
    };
    expect(deliverEmails(dispelled, 6 * MIN).delivered).not.toContain('gideon-3');
    // Still active at the mark → delivered.
    expect(deliverEmails(armed.state, 6 * MIN).delivered).toContain('gideon-3');
  });
});

describe('emails — random newsletters', () => {
  it('arms an always-eligible newsletter and delivers it deterministically within the window', () => {
    const base = createInitialState('seed', 0);
    const armed = deliverEmails(base, 0);
    // newsletter-local has no gate → armed immediately.
    expect(armed.state.lifetime.emailArmedAt['newsletter-local']).toBe(0);
    // Far past the 10-minute window → certainly delivered, and the schedule is reproducible.
    const a = deliverEmails(armed.state, 20 * MIN).delivered;
    const b = deliverEmails(armed.state, 20 * MIN).delivered;
    expect(a).toContain('newsletter-local');
    expect(a).toEqual(b);
  });
});

describe('emails — reply effects', () => {
  it('Father Tom #2 reply (2) maddens the priest; reply (1) does not', () => {
    const s = createInitialState('seed', 0);
    expect(applyEmailReplyEffect(s, 'fr-tom-2', 0).flagFatherMad).toBeUndefined();
    expect(applyEmailReplyEffect(s, 'fr-tom-2', 1).flagFatherMad).toBe(true);
  });

  it('agreeing to meet Reuben mints exactly one soul and is idempotent', () => {
    const s = createInitialState('seed', 0);
    const once = applyEmailReplyEffect(s, 'reuben-2', 1);
    expect(once.flagReubenDead).toBe(true);
    expect(gt(once.souls, s.souls)).toBe(true);
    expect(once.souls.toNumber()).toBe(1);
    // Re-answering (or answering reuben-3 too) does not mint again.
    const twice = applyEmailReplyEffect(once, 'reuben-3', 1);
    expect(twice.souls.toNumber()).toBe(1);
  });

  it('Fausto #1 threat reply closes the friendly branch (#2/#3 suppressed)', () => {
    const base = createInitialState('seed', 0);
    const threatened = applyEmailReplyEffect(base, 'fausto-1', 0);
    expect(threatened.lifetime.flagFCThreatSent).toBe(true);
    // High enough total sin level for Fausto #2's gate, but with the threat sent it must not arm.
    const high = withAllSins(threatened, 4); // total sin level 32
    expect(totalSinLevel(high)).toBeGreaterThanOrEqual(20);
    const r = deliverEmails(high, 0);
    expect(r.state.lifetime.emailArmedAt['fausto-2']).toBeUndefined();
  });
});

describe('emails — the Fausto curse', () => {
  it('lays the ×0.67 curse on delivery and lifts it on delete', () => {
    const base = withAllSins(createInitialState('seed', 1_000_000), 4); // total sin level 32 ≥ 31
    const armed = deliverEmails(base, 1_000_000); // arms fausto-4 (and others)
    const delivered = deliverEmails(armed.state, 1_000_000 + 8 * MIN);
    expect(delivered.delivered).toContain('fausto-4');
    expect(delivered.state.lifetime.flagFaustoCurse).toBe(true);
    // The curse cuts gold / influence / generation to 0.67×.
    const cursed = computeModifiers(delivered.state);
    const clean = computeModifiers(armed.state);
    expect(cursed.goldRateMul / clean.goldRateMul).toBeCloseTo(0.67, 5);
    // Deleting the letter lifts the curse.
    const cleared = deleteEmail(delivered.state, 'fausto-4');
    expect(cleared.lifetime.flagFaustoCurse).toBe(false);
    expect(computeModifiers(cleared).goldRateMul).toBeCloseTo(clean.goldRateMul, 5);
  });
});

describe('emails — inbox bookkeeping', () => {
  it('marks one and all emails read', () => {
    let s = deliverEmails(
      { ...createInitialState('seed', 0), totalSoulsObtained: bn(2e6) },
      1,
    ).state;
    expect(unreadCount(s)).toBeGreaterThan(0);
    const id = s.lifetime.inbox[0]!.id;
    s = markEmailRead(s, id, 5);
    expect(s.lifetime.inbox.find((e) => e.id === id)!.readAt).toBe(5);
    s = markAllEmailsRead(s, 9);
    expect(unreadCount(s)).toBe(0);
  });

  it('records a chosen reply, marking the email read, and is overwritable', () => {
    let s = deliverEmails(
      { ...createInitialState('seed', 0), totalSoulsObtained: bn(2e6) },
      1,
    ).state;
    const id = 'parish-1';
    s = answerEmail(s, id, 0, 7);
    const e = s.lifetime.inbox.find((x) => x.id === id)!;
    expect(e.answeredReply).toBe(0);
    expect(e.readAt).toBe(7);
    expect(answerEmail(s, 'no-such-id', 0, 9)).toBe(s); // unknown id → same reference
  });

  it('deletes via a flag and hides it from unread, and a deleted email never re-triggers', () => {
    const r = deliverEmails({ ...createInitialState('seed', 0), totalSoulsObtained: bn(2e6) }, 1);
    let s = r.state;
    const before = unreadCount(s);
    const id = 'parish-1';
    s = deleteEmail(s, id);
    expect(s.lifetime.inbox.find((x) => x.id === id)!.deleted).toBe(true);
    expect(unreadCount(s)).toBe(before - 1);
    expect(deleteEmail(s, id)).toBe(s); // already deleted → same reference
    expect(deliverEmails(s, 2).state.lifetime.inbox.filter((x) => x.id === id)).toHaveLength(1);
  });
});
