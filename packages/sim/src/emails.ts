/**
 * The impact-feedback email engine (Phase 5.2). Emails are delivered as the in-world consequences of
 * the player's actions: newsletters as corruption spreads, complaints and class-actions from people
 * harmed by their Vitium Mercatura trades, and similar reactive mail. This module owns *which*
 * emails fire and *when* (pure, deterministic, sim-side); the sender/subject/body copy lives in the
 * strings catalog keyed by the same id, so content can change without touching the sim.
 *
 * Triggers are intentionally simple state predicates and are expected to be tuned during the 5.5
 * economy pass — they're the provisional v1 set, not final balance.
 */
import { gte, bn } from './bignum.js';
import { totalMercatusDepth } from './mercatus.js';
import { totalReprobates, type GameState, type ReceivedEmail } from './state.js';

/** A catalog email: its id (also the strings key) and the once-only condition that delivers it. */
export interface EmailTrigger {
  id: string;
  /** Delivered the first time this returns true for the live state. */
  trigger: (state: GameState) => boolean;
}

/**
 * The provisional v1 catalog (content is a Claude Design topic; these triggers are tuneable). Ordered
 * roughly by when they unlock so a fresh inbox reads sensibly.
 */
export const EMAIL_TRIGGERS: readonly EmailTrigger[] = [
  { id: 'welcome', trigger: () => true },
  { id: 'first-reprobates', trigger: (s) => totalReprobates(s) >= 10 },
  // Re-keyed from the legacy owned-business counts to Mercatus depth (rework spec): the first
  // deepening of any trade, and a total reach of five depths across the eight trades.
  { id: 'first-business', trigger: (s) => totalMercatusDepth(s) >= 1 },
  { id: 'newsletter-influence', trigger: (s) => gte(s.lifetime.influence, bn(1000)) },
  { id: 'class-action', trigger: (s) => totalMercatusDepth(s) >= 5 },
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

/** Count of unread emails (readAt === null), excluding deleted mail. */
export function unreadCount(state: GameState): number {
  let n = 0;
  for (const e of state.lifetime.inbox) if (e.readAt === null && !e.deleted) n += 1;
  return n;
}

/**
 * Reply-effect hook — INTENTIONALLY EMPTY, to be defined in a later iteration.
 *
 * `answerEmail` calls this with the email id and the chosen reply index so that answering a letter can
 * carry a real, persistent consequence for the run — e.g. Gideon shielding capital from katabasis, a
 * parish tithe resuming, a rival noting your silence. The human-readable spec for each branch is the
 * reply's `effect` string in the strings catalog (`strings.emails.catalog[id].replies[idx].effect`).
 *
 * Today it is a pure pass-through: replies are recorded and shown, but move no resources. To wire the
 * economy, switch on `id` (then `replyIdx`) and return the mutated state. Keep it pure (no I/O, no
 * Date.now) so saves stay deterministic.
 */
export function applyEmailReplyEffect(state: GameState, _id: string, _replyIdx: number): GameState {
  // No effects defined yet. See the per-reply `effect` annotations in strings.emails.catalog.
  return state;
}

/**
 * Record the player's chosen reply to an email: store the reply index, mark the message read if it
 * wasn't, then run the (currently empty) reply-effect hook. Idempotent — re-answering overwrites the
 * recorded index and re-runs the hook. No-op (same reference) if the id isn't a live inbox entry.
 */
export function answerEmail(
  state: GameState,
  id: string,
  replyIdx: number,
  now: number,
): GameState {
  if (!state.lifetime.inbox.some((e) => e.id === id && !e.deleted)) return state;
  const inbox = state.lifetime.inbox.map((e) =>
    e.id === id ? { ...e, answeredReply: replyIdx, readAt: e.readAt ?? now } : e,
  );
  const answered: GameState = { ...state, lifetime: { ...state.lifetime, inbox } };
  return applyEmailReplyEffect(answered, id, replyIdx);
}

/**
 * Flag an email as deleted. A flag rather than a removal so the once-only delivery dedup in
 * `deliverEmails` (which keys off inbox ids) can't be defeated by deleting then re-triggering. No-op
 * (same reference) if the id is absent or already deleted.
 */
export function deleteEmail(state: GameState, id: string): GameState {
  if (!state.lifetime.inbox.some((e) => e.id === id && !e.deleted)) return state;
  const inbox = state.lifetime.inbox.map((e) => (e.id === id ? { ...e, deleted: true } : e));
  return { ...state, lifetime: { ...state.lifetime, inbox } };
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
