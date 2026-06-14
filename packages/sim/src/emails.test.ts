import { describe, it, expect } from 'vitest';
import { bn } from './bignum.js';
import { createInitialState, type GameState } from './state.js';
import {
  deliverEmails,
  unreadCount,
  markEmailRead,
  markAllEmailsRead,
  answerEmail,
  deleteEmail,
  applyEmailReplyEffect,
} from './emails.js';

describe('emails (impact-feedback)', () => {
  it('delivers the welcome email on the first reconcile and never twice', () => {
    const s0 = createInitialState('seed', 1000);
    const s1 = deliverEmails(s0, 2000);
    expect(s1.lifetime.inbox.map((e) => e.id)).toContain('welcome');
    const s2 = deliverEmails(s1, 3000);
    expect(s2).toBe(s1); // dedup → same reference when nothing new fires
  });

  it('delivers trade / influence mail once their conditions are met', () => {
    const base = createInitialState('seed', 0);
    const rich: GameState = {
      ...base,
      lifetime: { ...base.lifetime, mercatusDepths: { gula: 3, ira: 2 }, influence: bn(2000) },
    };
    const ids = deliverEmails(rich, 10).lifetime.inbox.map((e) => e.id);
    expect(ids).toContain('first-business');
    expect(ids).toContain('class-action');
    expect(ids).toContain('newsletter-influence');
  });

  it('marks one and all emails read', () => {
    let s = deliverEmails(createInitialState('seed', 0), 1);
    expect(unreadCount(s)).toBeGreaterThan(0);
    const id = s.lifetime.inbox[0]!.id;
    s = markEmailRead(s, id, 5);
    expect(s.lifetime.inbox.find((e) => e.id === id)!.readAt).toBe(5);
    s = markAllEmailsRead(s, 9);
    expect(unreadCount(s)).toBe(0);
  });

  it('records a chosen reply, marking the email read, and is overwritable', () => {
    let s = deliverEmails(createInitialState('seed', 0), 1);
    const id = s.lifetime.inbox[0]!.id;
    s = answerEmail(s, id, 1, 7);
    const e = s.lifetime.inbox.find((x) => x.id === id)!;
    expect(e.answeredReply).toBe(1);
    expect(e.readAt).toBe(7); // answering an unread message reads it
    s = answerEmail(s, id, 0, 9);
    expect(s.lifetime.inbox.find((x) => x.id === id)!.answeredReply).toBe(0); // overwrite
    expect(answerEmail(s, 'no-such-id', 0, 9)).toBe(s); // unknown id → same reference
  });

  it('the reply-effect hook is a pure no-op until effects are defined', () => {
    const s = deliverEmails(createInitialState('seed', 0), 1);
    expect(applyEmailReplyEffect(s, s.lifetime.inbox[0]!.id, 0)).toBe(s);
  });

  it('deletes via a flag (kept in the inbox so it cannot re-trigger) and is hidden from unread', () => {
    let s = deliverEmails(createInitialState('seed', 0), 1);
    const before = unreadCount(s);
    const id = s.lifetime.inbox[0]!.id;
    s = deleteEmail(s, id);
    expect(s.lifetime.inbox.find((x) => x.id === id)!.deleted).toBe(true); // flag, not removal
    expect(s.lifetime.inbox.some((x) => x.id === id)).toBe(true);
    expect(unreadCount(s)).toBe(before - 1); // deleted unread no longer counts
    expect(deleteEmail(s, id)).toBe(s); // already deleted → same reference
    // Re-delivery still dedups on the (retained) id, so a deleted email never comes back.
    expect(deliverEmails(s, 2).lifetime.inbox.filter((x) => x.id === id)).toHaveLength(1);
  });
});
