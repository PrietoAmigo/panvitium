/**
 * The impact-feedback email engine (Phase 5.2, content authored in 05). Emails are delivered as the
 * in-world consequences of the player's descent: the household steward reacting to the float, world
 * newsletters surfacing the corruption the player is selling, the parish and the diocese sharpening
 * toward the endgame, the adversary who shares the secret, and the madman who built the room. This
 * module owns *which* emails fire and *when* (pure, deterministic, sim-side); the sender / subject /
 * body / replies copy lives in the strings catalog keyed by the same id, so content can change
 * without touching the sim.
 *
 * Trigger kinds (05 §triggers):
 *   - IMMEDIATE: delivered the first tick `eligible` holds (soul thresholds, Sin-level gates, …).
 *   - TIMED: armed the first tick `eligible` holds, delivered `delaySeconds` later (the "X minutes
 *     after returning from the Nth katabasis / after Plutus / after a Sin-level threshold" beats).
 *   - RANDOM: armed on eligibility, delivered a *deterministic* per-lifetime offset later (within
 *     `randomWindow`). The offset is derived from a side hash of stable per-lifetime keys, so it
 *     consumes NONE of the shared mulberry32 stream — existing saves keep their RNG sequence
 *     byte-identical (ADR-011), and the schedule is still reproducible across reload.
 *
 * Arm timestamps live on `lifetime.emailArmedAt` and reset each Katabasis with the inbox.
 */
import { gte, bn } from './bignum.js';
import { sinLevel } from './progression.js';
import { mintSouls } from './population.js';
import { mercatusDepth } from './mercatus.js';
import { SINS, type GameState, type ReceivedEmail } from './state.js';

/** A catalog email and the (id-keyed) conditions that schedule it. */
export interface EmailDef {
  /** Id — also the strings-catalog key (`strings.emails.catalog[id]`). */
  id: string;
  /** The email is armed (timed/random) or delivered (immediate) the first tick this holds. */
  eligible: (state: GameState) => boolean;
  /** Fixed delay in seconds after arming before delivery. Omitted / 0 = immediate (no arming). */
  delaySeconds?: number;
  /**
   * When set, a random once-per-run newsletter: delivered a deterministic offset (drawn from this
   * [minSeconds, maxSeconds] window) after the eligibility arm, rather than a fixed delay.
   */
  randomWindow?: readonly [number, number];
  /**
   * Extra condition re-checked AT FIRE TIME (after the delay/offset elapses). The email delivers
   * only while this also holds — e.g. Plutus still active. Defaults to always-true.
   */
  fireGate?: (state: GameState) => boolean;
}

// ── Trigger helpers (05 derived values) ───────────────────────────────────────

/** Sum of the eight Cardinal-Sin levels (each `sinLevel` floored). */
export function totalSinLevel(state: GameState): number {
  let n = 0;
  for (const s of SINS) n += sinLevel(state.devotion[s]);
  return n;
}

/** True when every one of the eight Cardinal Sins is at level `n` or higher. */
function allSinsAtLeast(state: GameState, n: number): boolean {
  return SINS.every((s) => sinLevel(state.devotion[s]) >= n);
}

/** Living count of an invocation (0 when absent). */
const invCount = (state: GameState, id: string): number => state.lifetime.invocations[id] ?? 0;

/** Seconds the named toggle has been continuously active this run (0 when off). */
const toggleSeconds = (state: GameState, id: string): number =>
  state.lifetime.toggleDurations[id] ?? 0;

const soulsAtLeast = (state: GameState, threshold: number): boolean =>
  gte(state.totalSoulsObtained, bn(threshold));

const fatherMad = (state: GameState): boolean => state.flagFatherMad === true;
const reubenDead = (state: GameState): boolean => state.flagReubenDead === true;
const fcThreatSent = (state: GameState): boolean => state.lifetime.flagFCThreatSent === true;

/**
 * Deterministic per-lifetime delivery offset (seconds) for a random newsletter. Derived from a FNV-1a
 * hash of stable per-lifetime keys (game start, katabasis count, email id) — NOT from the shared RNG
 * stream — so the schedule is reproducible and the mulberry32 sequence stays byte-identical (ADR-011).
 */
function randomDelaySeconds(
  state: GameState,
  id: string,
  [min, max]: readonly [number, number],
): number {
  const key = `${state.startedAt}:${state.katabasisCount}:${id}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const frac = (h >>> 0) / 0x100000000;
  return min + frac * (max - min);
}

// ── The catalog (05) ──────────────────────────────────────────────────────────

const MIN = 60;
/** Random-newsletter delivery window: any time in the first ~10 minutes after it becomes eligible. */
const NEWSLETTER_WINDOW: readonly [number, number] = [1 * MIN, 10 * MIN];

/**
 * Total-Sin-level gates for the Fausto and Reuben arcs. The 05 doc writes these as 10/20/30/40
 * (Fausto) and 5/15/25/35 (Reuben), assuming a higher Sin cap; the live MAX_SIN_LEVEL is 4, so the
 * eight Cardinal Sins sum to at most 32. We rescale the ladders to fit that ceiling while preserving
 * the staging (each beat strictly later than the last, the finale near — not beyond — the cap).
 */
const FAUSTO_SIN_GATE = { one: 10, two: 18, three: 25, four: 31 } as const;
const REUBEN_SIN_GATE = { one: 5, two: 13, three: 21, four: 28 } as const;

/**
 * The authored email catalog (05). Ordered roughly by the arc — household, world newsletters, the
 * Church, the adversary, the madman — so a full inbox reads sensibly. World-newsletter eligibility
 * maps the doc's legacy "own a tier-N business" gates onto the Mercatus rework's per-Sin DEPTH
 * (tier N ≈ depth N), consistent with how the provisional catalog was re-keyed.
 */
export const EMAIL_DEFS: readonly EmailDef[] = [
  // ── Household — Gideon Reyes, the steward ──
  { id: 'gideon-1', eligible: (s) => s.katabasisCount >= 1, delaySeconds: 2 * MIN },
  { id: 'gideon-2', eligible: (s) => s.katabasisCount >= 2, delaySeconds: 2 * MIN },
  {
    id: 'gideon-3',
    eligible: (s) => invCount(s, 'plutus') > 0,
    delaySeconds: 5 * MIN,
    fireGate: (s) => invCount(s, 'plutus') > 0, // only if Plutus is still active at the 5-min mark
  },
  {
    id: 'gideon-4',
    eligible: (s) => s.lifetime.maleficia.includes('thirty_pieces_of_silver'),
    delaySeconds: 5 * MIN,
  },

  // ── The world / commerce — random, once per run; depth gates land them as consequences ──
  {
    id: 'newsletter-markets',
    eligible: (s) => mercatusDepth(s, 'avaritia') >= 3,
    randomWindow: NEWSLETTER_WINDOW,
  },
  {
    id: 'newsletter-class-action',
    eligible: (s) => mercatusDepth(s, 'gula') >= 3,
    randomWindow: NEWSLETTER_WINDOW,
  },
  {
    id: 'newsletter-health',
    eligible: (s) => mercatusDepth(s, 'acedia') >= 2,
    randomWindow: NEWSLETTER_WINDOW,
  },
  { id: 'newsletter-local', eligible: () => true, randomWindow: NEWSLETTER_WINDOW },
  { id: 'newsletter-broker', eligible: () => true, randomWindow: NEWSLETTER_WINDOW },
  {
    id: 'newsletter-outrage',
    eligible: (s) => mercatusDepth(s, 'vanagloria') >= 2,
    randomWindow: NEWSLETTER_WINDOW,
  },
  { id: 'newsletter-charity', eligible: () => true, randomWindow: NEWSLETTER_WINDOW },
  { id: 'newsletter-wealth', eligible: () => true, randomWindow: NEWSLETTER_WINDOW },
  {
    id: 'newsletter-crime',
    eligible: (s) => mercatusDepth(s, 'ira') >= 2,
    randomWindow: NEWSLETTER_WINDOW,
  },
  {
    id: 'newsletter-attention',
    eligible: (s) => mercatusDepth(s, 'acedia') >= 3,
    randomWindow: NEWSLETTER_WINDOW,
  },
  {
    id: 'newsletter-discipline',
    eligible: (s) => mercatusDepth(s, 'superbia') >= 2,
    randomWindow: NEWSLETTER_WINDOW,
  },
  { id: 'newsletter-seismic', eligible: () => true, randomWindow: NEWSLETTER_WINDOW },

  // ── The Church — Father Tom, the parish bulletins, the diocese ──
  { id: 'fr-tom-1', eligible: (s) => s.katabasisCount >= 1, delaySeconds: 12 * MIN },
  { id: 'parish-1', eligible: (s) => soulsAtLeast(s, 1e6) },
  { id: 'fr-tom-2', eligible: (s) => sinLevel(s.devotion.avaritia) >= 2 },
  { id: 'bishop-crane', eligible: (s) => allSinsAtLeast(s, 2) && !fatherMad(s) },
  {
    id: 'fr-stahl-1',
    eligible: (s) =>
      (allSinsAtLeast(s, 3) && !fatherMad(s)) || (allSinsAtLeast(s, 2) && fatherMad(s)),
  },
  { id: 'parish-2', eligible: (s) => soulsAtLeast(s, 1e7) },
  { id: 'fr-stahl-2', eligible: (s) => toggleSeconds(s, 'panvitium') >= 3 },
  { id: 'parish-3', eligible: (s) => soulsAtLeast(s, 1e8) && fatherMad(s) },

  // ── The adversary — Fausto Cescru ──
  {
    id: 'fausto-1',
    eligible: (s) => totalSinLevel(s) >= FAUSTO_SIN_GATE.one,
    delaySeconds: 7 * MIN,
  },
  {
    id: 'fausto-2',
    eligible: (s) => totalSinLevel(s) >= FAUSTO_SIN_GATE.two && !fcThreatSent(s),
    delaySeconds: 7 * MIN,
  },
  {
    id: 'fausto-3',
    eligible: (s) => totalSinLevel(s) >= FAUSTO_SIN_GATE.three && !fcThreatSent(s),
    delaySeconds: 7 * MIN,
  },
  {
    id: 'fausto-4',
    eligible: (s) => totalSinLevel(s) >= FAUSTO_SIN_GATE.four,
    delaySeconds: 7 * MIN,
  },
  {
    id: 'fausto-5',
    eligible: (s) => soulsAtLeast(s, 1e9) && (fatherMad(s) || !reubenDead(s)),
  },

  // ── The madman — Reuben Marsh ──
  {
    id: 'reuben-1',
    eligible: (s) => totalSinLevel(s) >= REUBEN_SIN_GATE.one,
    delaySeconds: 39 * MIN,
  },
  {
    id: 'reuben-2',
    eligible: (s) => totalSinLevel(s) >= REUBEN_SIN_GATE.two,
    delaySeconds: 39 * MIN,
  },
  {
    id: 'reuben-3',
    eligible: (s) => totalSinLevel(s) >= REUBEN_SIN_GATE.three && !reubenDead(s),
    delaySeconds: 39 * MIN,
  },
  {
    id: 'reuben-4',
    eligible: (s) =>
      totalSinLevel(s) >= REUBEN_SIN_GATE.four && !soulsAtLeast(s, 1e9) && !reubenDead(s),
    delaySeconds: 39 * MIN,
  },
];

/** Email ids whose DELIVERY carries a side effect on the state (resolved in `deliverEmails`). */
const CURSE_ON_DELIVERY = 'fausto-4';

/** The result of a delivery pass: the (possibly) new state and the ids delivered THIS pass. */
export interface DeliverResult {
  readonly state: GameState;
  /** Ids delivered on this pass, in catalog order — surfaced so the UI can cue per-email SFX (05). */
  readonly delivered: string[];
}

/**
 * Arm and deliver the impact-feedback catalog against the fully-advanced state. Immediate emails
 * fire as soon as eligible; timed/random emails arm on first eligibility (recorded in
 * `emailArmedAt`) and fire once their delay/offset elapses and any `fireGate` still holds. Each
 * email is delivered at most once per lifetime (deduped by inbox id). Pure; returns the same state
 * reference and an empty `delivered` when nothing arms or fires.
 */
export function deliverEmails(state: GameState, now: number): DeliverResult {
  const have = new Set(state.lifetime.inbox.map((e) => e.id));
  let armed = state.lifetime.emailArmedAt;
  let armedChanged = false;
  const fired: string[] = [];

  for (const def of EMAIL_DEFS) {
    if (have.has(def.id)) continue;
    if (!def.eligible(state)) continue;

    const immediate = (def.delaySeconds ?? 0) <= 0 && def.randomWindow === undefined;
    if (immediate) {
      if (def.fireGate === undefined || def.fireGate(state)) fired.push(def.id);
      continue;
    }

    // Timed / random: arm on first eligibility, then fire once the delay/offset has elapsed.
    const armedAt = armed[def.id];
    if (armedAt === undefined) {
      if (!armedChanged) {
        armed = { ...armed };
        armedChanged = true;
      }
      armed[def.id] = now;
      continue; // armed this tick; the earliest possible delivery is a later tick
    }
    const delaySec = def.randomWindow
      ? randomDelaySeconds(state, def.id, def.randomWindow)
      : (def.delaySeconds ?? 0);
    if (now >= armedAt + delaySec * 1000 && (def.fireGate === undefined || def.fireGate(state))) {
      fired.push(def.id);
    }
  }

  if (fired.length === 0 && !armedChanged) return { state, delivered: [] };

  const inbox =
    fired.length > 0
      ? [...state.lifetime.inbox, ...fired.map((id) => mkReceived(id, now))]
      : state.lifetime.inbox;
  // Fausto #4's delivery lays the curse (lifted later by deleting the email).
  const curseLaid = fired.includes(CURSE_ON_DELIVERY);
  const next: GameState = {
    ...state,
    lifetime: {
      ...state.lifetime,
      inbox,
      emailArmedAt: armed,
      ...(curseLaid ? { flagFaustoCurse: true } : {}),
    },
  };
  return { state: next, delivered: fired };
}

/** A fresh, unread inbox entry. */
function mkReceived(id: string, now: number): ReceivedEmail {
  return { id, receivedAt: now, readAt: null };
}

/** Count of unread emails (readAt === null), excluding deleted mail. */
export function unreadCount(state: GameState): number {
  let n = 0;
  for (const e of state.lifetime.inbox) if (e.readAt === null && !e.deleted) n += 1;
  return n;
}

/**
 * Apply the persistent consequence of answering an email (05 reply effects). Pure and deterministic;
 * idempotent where it mutates permanent flags / mints souls, so re-answering the same email never
 * double-applies. The human-readable spec for each branch is the reply's `effect` string in the
 * strings catalog (`strings.emails.catalog[id].replies[idx].effect`).
 */
export function applyEmailReplyEffect(state: GameState, id: string, replyIdx: number): GameState {
  switch (id) {
    // Father Tom #2, answer (2): the cruel reply turns the priest mad against the player.
    case 'fr-tom-2':
      return replyIdx === 1 ? { ...state, flagFatherMad: true } : state;
    // Reuben #2 / #3, answer (2): agreeing to "meet and explain" ends the mason — +1 soul minted,
    // and the flag stops the later Reuben letters. Guarded so re-answering can't mint twice.
    case 'reuben-2':
    case 'reuben-3':
      return replyIdx === 1 ? meetReuben(state) : state;
    // Fausto #1, answer (1): the threat reply closes the friendly branch (#2/#3 never fire).
    case 'fausto-1':
      return replyIdx === 0
        ? { ...state, lifetime: { ...state.lifetime, flagFCThreatSent: true } }
        : state;
    default:
      return state;
  }
}

/** Agreeing to meet Reuben: mint one soul and set the flag, once. Idempotent on the flag. */
function meetReuben(state: GameState): GameState {
  if (reubenDead(state)) return state; // already resolved — no double-mint on a re-answer
  return { ...mintSouls(state, 1), flagReubenDead: true };
}

/**
 * Record the player's chosen reply to an email: store the reply index, mark the message read if it
 * wasn't, then apply the reply effect. Idempotent — re-answering overwrites the recorded index and
 * re-runs the (guarded) effect. No-op (same reference) if the id isn't a live inbox entry.
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
 * `deliverEmails` (which keys off inbox ids) can't be defeated by deleting then re-triggering.
 * Deleting Fausto #4 also lifts its curse (`flagFaustoCurse`) — the in-fiction "as long as these
 * words remain" tell. No-op (same reference) if the id is absent or already deleted.
 */
export function deleteEmail(state: GameState, id: string): GameState {
  if (!state.lifetime.inbox.some((e) => e.id === id && !e.deleted)) return state;
  const inbox = state.lifetime.inbox.map((e) => (e.id === id ? { ...e, deleted: true } : e));
  const lifetime =
    id === CURSE_ON_DELIVERY && state.lifetime.flagFaustoCurse === true
      ? { ...state.lifetime, inbox, flagFaustoCurse: false }
      : { ...state.lifetime, inbox };
  return { ...state, lifetime };
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
