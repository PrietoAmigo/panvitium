// The incoming-call ("calls-in") catalogue — STRUCTURAL data only. The canonical content is
// `docs/PANVITIUM-CALLS-IN.md`: every call you can RECEIVE, its caller, class, requirements, and
// choices. This file mirrors that catalogue's structure; the user-facing English (caller tag, choice
// labels/sub-labels) lives in `strings.phone.callIn.calls` (ADR-020), joined here by id in
// `game/callIn.ts`. The real buff/effect logic is still the future calls-in engine the doc describes
// (CALL_TRIGGERS / INTERACTIONS, spreadsheet-pinned magnitudes) — answering applies no game state
// yet, the same documented-stub posture as the email replies and the dialer codes.
//
// Every call is a recording: its `<id>.mp3` lives in apps/web/public/assets/panvitium/music/. The
// choice arrays here carry only the structural `dim` marker (the decline / hang-up option) and MUST
// stay the same length and order as the matching `strings` choices — `callIn.test.ts` pins that.

import { ASSET_BASE } from './degrade.data.js';

/** Selection class (docs "Selection model"). Drives the weighted draw. */
export type CallInClass = 'buff-positive' | 'buff-tradeoff' | 'lore' | 'easter-egg';

/** Eligibility predicate for a call (docs "Requirements"). Absent fields impose no constraint. */
export interface CallRequirements {
  /** Minimum lifetime descents (`state.katabasisCount`). */
  katabasisCountMin?: number;
  /**
   * Whether the Fausto "friendly" branch must be open (`true`) or closed (`false`). Maps to the real
   * `flagFCThreatSent` flag: friendly ≡ the threat reply was never sent. Gates the mutually-exclusive
   * Succubus (friendly) / Astiwihad (hostile) lines, and the hostile-only Journalist / a-name-to-burn.
   */
  fcFriendly?: boolean;
  /** Email ids that must already sit in the inbox (e.g. Father Emil Stahl before he calls). */
  emails?: readonly string[];
}

/** Structural shape of one choice — only the decline/hang-up marker; the label/sub are strings. */
export interface CallInChoiceData {
  /** The "let it go" / "hang up" / "no, thanks" option — readable warm gold, never a faded grey. */
  dim?: boolean;
}

/** Structural shape of one incoming call. Text is joined from `strings` by `id`. */
export interface CallInData {
  id: string;
  /** A recording plays (`speaking`) vs. a typed line is written out (`type`). Every real call is a
   *  recording; the typed path stays supported for any future fileless call. */
  audio: boolean;
  /** Weighted-draw class. */
  class: CallInClass;
  /** Eligibility predicate; omitted ≡ always eligible. */
  requires?: CallRequirements;
  /** Ordered choices — index-aligned with the strings catalogue. */
  choices: readonly CallInChoiceData[];
}

/** Base path for the call recordings + the vibration loop (`<call-id>.mp3`). */
export const CALL_AUDIO_BASE = `${ASSET_BASE}/music/`;
/** The looped ring/haptic cue played while a call is incoming. */
export const VIBRATION_SRC = `${CALL_AUDIO_BASE}smartphone_vibration.mp3`;

// Background plates (crossfaded by phase, composited through the degradation pass). Base =
// resting/"call over"; call-in = ringing (room-level); answering = the answered "voice in the room".
export const CALL_PLATE_BASE = `${ASSET_BASE}/backgrounds/studio_complete.png`;
export const CALL_PLATE_RING = `${ASSET_BASE}/backgrounds/studio_complete_call-in.png`;
export const CALL_PLATE_ANSWERING = `${ASSET_BASE}/backgrounds/studio_complete_call-answering.png`;

/**
 * The incoming calls, in catalogue order (docs/PANVITIUM-CALLS-IN.md). Every call has a recording in
 * `music/`; the typed lines from the design prototype (`dying-soul`, `fausto-feeler`) are not part of
 * the canonical catalogue and are dropped.
 */
export const CALLS_IN: readonly CallInData[] = [
  // ── Positive buffs (clean upside) ──
  { id: 'the-cycle-turns', audio: true, class: 'buff-positive', choices: [{}, {}, { dim: true }] },
  { id: 'eager-hands', audio: true, class: 'buff-positive', choices: [{}, {}, { dim: true }] },
  { id: 'a-good-find', audio: true, class: 'buff-positive', choices: [{}, {}, { dim: true }] },
  {
    id: 'the-discipline-swells',
    audio: true,
    class: 'buff-positive',
    choices: [{}, {}, { dim: true }],
  },
  { id: 'doing-nothing', audio: true, class: 'buff-positive', choices: [{}, {}, { dim: true }] },

  // ── Tradeoff buffs (a strong buff bought with a real cost) ──
  {
    id: 'the-looting',
    audio: true,
    class: 'buff-tradeoff',
    requires: { katabasisCountMin: 1 },
    choices: [{}, { dim: true }],
  },
  { id: 'blood-in-the-cage', audio: true, class: 'buff-tradeoff', choices: [{}, { dim: true }] },
  { id: 'the-shipment', audio: true, class: 'buff-tradeoff', choices: [{}, { dim: true }] },
  {
    id: 'a-name-to-burn',
    audio: true,
    class: 'buff-tradeoff',
    requires: { fcFriendly: false },
    choices: [{}, { dim: true }],
  },
  { id: 'parish', audio: true, class: 'buff-tradeoff', choices: [{}, {}, { dim: true }] },
  { id: 'ministry', audio: true, class: 'buff-tradeoff', choices: [{}, {}, { dim: true }] },
  { id: 'social-platform', audio: true, class: 'buff-tradeoff', choices: [{}, {}, { dim: true }] },

  // ── Lore (narrative, no mechanical effect; once-only) ──
  {
    id: 'the-ward',
    audio: true,
    class: 'lore',
    requires: { emails: ['fr-stahl-1'] },
    choices: [{}, { dim: true }],
  },
  {
    id: 'the-journalist',
    audio: true,
    class: 'lore',
    requires: { katabasisCountMin: 5, fcFriendly: false },
    // Eight identical retorts — the joke is that every option is the same.
    choices: [{}, {}, {}, {}, {}, {}, {}, {}],
  },
  {
    id: 'succubus',
    audio: true,
    class: 'lore',
    requires: { fcFriendly: true },
    choices: [{ dim: true }, {}],
  },
  {
    id: 'astiwihad',
    audio: true,
    class: 'lore',
    requires: { fcFriendly: false },
    choices: [{ dim: true }, {}],
  },

  // ── Easter eggs (rare collectibles; once-only) ──
  { id: 'tormented-soul', audio: true, class: 'easter-egg', choices: [{ dim: true }] },
  { id: 'ISP-change', audio: true, class: 'easter-egg', choices: [{ dim: true }] },
] as const;

/** Catalogue order, by id — the stable bag the selector draws from. */
export const CALL_IN_ORDER: readonly string[] = CALLS_IN.map((c) => c.id);

/** Index by id for O(1) lookup in the view-model. */
export const CALL_IN_BY_ID: Record<string, CallInData> = Object.fromEntries(
  CALLS_IN.map((c) => [c.id, c]),
);

/** Lore + easter-egg calls are once-only (docs "Selection model"); buffs can recur. */
export function isOnceOnly(cls: CallInClass): boolean {
  return cls === 'lore' || cls === 'easter-egg';
}
