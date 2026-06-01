/**
 * The impact-feedback email engine (Phase 5.2). Emails are delivered as the in-world consequences of
 * the player's actions: newsletters as corruption spreads, complaints and class-actions from people
 * harmed by their Vitium Mercatura businesses, and similar reactive mail. This module owns *which*
 * emails fire and *when* (pure, deterministic, sim-side); the sender/subject/body copy lives in the
 * strings catalog keyed by the same id, so content can change without touching the sim.
 *
 * Triggers are intentionally simple state predicates and are expected to be tuned during the 5.5
 * economy pass — they're the provisional v1 set, not final balance.
 */
import { gte, bn } from './bignum.js';
import { totalReprobates, type GameState, type ReceivedEmail } from './state.js';

/** A catalog email: its id (also the strings key) and the once-only condition that delivers it. */
export interface EmailTrigger {
  id: string;
  /** Delivered the first time this returns true for the live state. */
  trigger: (state: GameState) => boolean;
}

/** Total owned Vitium Mercatura businesses across all ids. */
function businessCount(state: GameState): number {
  let n = 0;
  for (const owned of Object.values(state.lifetime.businesses)) n += owned;
  return n;
}

/**
 * The provisional v1 catalog (content is a Claude Design topic; these triggers are tuneable). Ordered
 * roughly by when they unlock so a fresh inbox reads sensibly.
 */
export const EMAIL_TRIGGERS: readonly EmailTrigger[] = [
  { id: 'welcome', trigger: () => true },
  { id: 'first-reprobates', trigger: (s) => totalReprobates(s) >= 10 },
  { id: 'first-business', trigger: (s) => businessCount(s) >= 1 },
  { id: 'newsletter-influence', trigger: (s) => gte(s.lifetime.influence, bn(1000)) },
  { id: 'class-action', trigger: (s) => businessCount(s) >= 5 },
];

/**
 * Append any newly-triggered emails to the inbox, deduped by id (each catalog email is delivered at
 * most once per lifetime). Pure; returns the same reference when nothing new fires.
 */
export function deliverEmails(state: GameState, now: number): GameState {
  const have = new Set(state.lifetime.inbox.map((e) => e.id));
  const newly: ReceivedEmail[] = [];
  for (const email of EMAIL_TRIGGERS) {
    if (!have.has(email.id) && email.trigger(state)) {
      newly.push({ id: email.id, receivedAt: now, readAt: null });
    }
  }
  if (newly.length === 0) return state;
  return {
    ...state,
    lifetime: { ...state.lifetime, inbox: [...state.lifetime.inbox, ...newly] },
  };
}

/** Count of unread emails (readAt === null). */
export function unreadCount(state: GameState): number {
  let n = 0;
  for (const e of state.lifetime.inbox) if (e.readAt === null) n += 1;
  return n;
}

/** Mark a single email read (no-op if already read or absent). Pure. */
export function markEmailRead(state: GameState, id: string, now: number): GameState {
  if (!state.lifetime.inbox.some((e) => e.id === id && e.readAt === null)) return state;
  const inbox = state.lifetime.inbox.map((e) =>
    e.id === id && e.readAt === null ? { ...e, readAt: now } : e,
  );
  return { ...state, lifetime: { ...state.lifetime, inbox } };
}

/** Mark every unread email read (no-op if none unread). Pure. */
export function markAllEmailsRead(state: GameState, now: number): GameState {
  if (unreadCount(state) === 0) return state;
  const inbox = state.lifetime.inbox.map((e) => (e.readAt === null ? { ...e, readAt: now } : e));
  return { ...state, lifetime: { ...state.lifetime, inbox } };
}
