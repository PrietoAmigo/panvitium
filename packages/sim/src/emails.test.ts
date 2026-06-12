import { describe, it, expect } from 'vitest';
import { bn } from './bignum.js';
import { createInitialState, type GameState } from './state.js';
import { deliverEmails, unreadCount, markEmailRead, markAllEmailsRead } from './emails.js';

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
});
