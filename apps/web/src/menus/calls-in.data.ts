// The incoming-call ("calls-in") catalogue — STRUCTURAL data only (Claude Design handoff,
// "Smartphone Call-In System"). One row per call you can RECEIVE on the Studio smartphone. Mechanics
// and copy live elsewhere by the repo's split (DEVELOPMENT.md "Tuning the economy"):
//
//   - the user-facing English (caller tag, typed line, choice labels/sub-labels) is in
//     `strings.phone.callIn.calls` (ADR-020), joined here by id in `game/callIn.ts`;
//   - the real buff/effect logic + weighted firing engine is the future calls-in engine described in
//     `docs/PANVITIUM-CALLS-IN.md` (CALL_TRIGGERS / INTERACTIONS, spreadsheet-pinned weights). Until
//     it lands, answering a call surfaces its message + options but applies no game state — the same
//     documented-stub posture as the email replies and the dialer's code effects.
//
// What stays here is purely structural: whether a call is a recording or a typed line, its selection
// class, an optional hard-coded audio duration (the safety-reveal fallback when the mp3 is absent),
// and the per-choice `dim` marker (the decline / hang-up option). The choice arrays MUST stay the
// same length and order as the matching `strings.phone.callIn.calls.<id>.choices` — `callIn.test.ts`
// pins that.

import { ASSET_BASE } from './degrade.data.js';

/** Selection class (docs/PANVITIUM-CALLS-IN.md "Selection model"). Drives the weighted draw. */
export type CallInClass = 'buff-positive' | 'buff-tradeoff' | 'lore' | 'easter-egg';

/** Structural shape of one choice — only the decline/hang-up marker; the label/sub are strings. */
export interface CallInChoiceData {
  /** The "let it go" / "hang up" / "say nothing" option — rendered in readable warm gold, not grey. */
  dim?: boolean;
}

/** Structural shape of one incoming call. Text is joined from `strings` by `id`. */
export interface CallInData {
  id: string;
  /** A recording plays (`speaking`) vs. a typed line is written out (`type`). */
  audio: boolean;
  /** Weighted-draw class. */
  class: CallInClass;
  /**
   * Hard-coded recording length in seconds, used only as the audio safety-reveal fallback when the
   * mp3's real duration is unavailable (e.g. the file is missing in a test/preview). The live app
   * reveals options off the real `ended` event; this just keeps a fileless run flowing.
   */
  dur?: number;
  /** Ordered choices — index-aligned with the strings catalogue. */
  choices: readonly CallInChoiceData[];
}

/** Base path for the call recordings + the vibration loop (`<call-id>.mp3`). */
export const CALL_AUDIO_BASE = `${ASSET_BASE}/music/`;
/** The looped ring/haptic cue played while a call is incoming. */
export const VIBRATION_SRC = `${CALL_AUDIO_BASE}smartphone_vibration.mp3`;

// Background plates (crossfaded by phase). Base = resting/"call over"; call-in = ringing; answering =
// the answered "voice in the room". Sourced from apps/web/public/assets/panvitium/backgrounds/.
export const CALL_PLATE_BASE = `${ASSET_BASE}/backgrounds/studio_complete.png`;
export const CALL_PLATE_RING = `${ASSET_BASE}/backgrounds/studio_complete_call-in.png`;
export const CALL_PLATE_ANSWERING = `${ASSET_BASE}/backgrounds/studio_complete_call-answering.png`;

/**
 * The 13 designed calls, in catalogue order. Eleven are recordings; two (`dying-soul`,
 * `fausto-feeler`) are typed. The `dim` markers and `dur` overrides match the design prototype.
 */
export const CALLS_IN: readonly CallInData[] = [
  // — Positive buffs (clean upside) —
  {
    id: 'the-cycle-turns',
    audio: true,
    class: 'buff-positive',
    choices: [{}, {}, { dim: true }],
  },
  { id: 'eager-hands', audio: true, class: 'buff-positive', choices: [{}, {}, { dim: true }] },
  { id: 'a-good-find', audio: true, class: 'buff-positive', choices: [{}, {}, { dim: true }] },
  {
    id: 'the-discipline-swells',
    audio: true,
    class: 'buff-positive',
    choices: [{}, {}, { dim: true }],
  },
  // — Tradeoff buffs (a strong buff bought with a real cost) —
  { id: 'the-looting', audio: true, class: 'buff-tradeoff', choices: [{}, { dim: true }] },
  { id: 'blood-in-the-cage', audio: true, class: 'buff-tradeoff', choices: [{}, { dim: true }] },
  { id: 'the-shipment', audio: true, class: 'buff-tradeoff', choices: [{}, { dim: true }] },
  { id: 'a-name-to-burn', audio: true, class: 'buff-tradeoff', choices: [{}, { dim: true }] },
  { id: 'parish', audio: true, class: 'buff-tradeoff', choices: [{}, {}, { dim: true }] },
  // — Lore (narrative, no mechanical effect) —
  { id: 'the-ward', audio: true, class: 'lore', dur: 14, choices: [{}, { dim: true }] },
  {
    id: 'fausto-feeler',
    audio: false,
    class: 'lore',
    choices: [{}, {}, { dim: true }],
  },
  // — Easter egg (rare collectible) —
  { id: 'tormented-soul', audio: true, class: 'easter-egg', dur: 4, choices: [{ dim: true }] },
  // — The afflicted: a typed plea that resolves by culling a reprobate one-for-one (docs §"the cull"). —
  { id: 'dying-soul', audio: false, class: 'buff-positive', choices: [{}, {}, { dim: true }] },
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
