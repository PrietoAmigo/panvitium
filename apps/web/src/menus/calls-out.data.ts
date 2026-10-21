// The outgoing-call ("calls-out") catalogue — STRUCTURAL data only, the twin of `calls-in.data.ts`
// for the calls the player PLACES from the Studio dialer. The canonical content is
// `docs/PANVITIUM-CALLS-OUT.md`. Which number reaches which call, and what placing it records, is
// game logic owned by the sim (`CALL_OUTS` / `dialNumber` in `phone.ts`); this file holds what the
// call stage plays. The English (caller tag, typed fallback line, option labels) lives in
// `strings.phone.callOut.calls`, joined here by id in `game/callIn.ts` (`buildCallOutView`).
//
// A recorded call plays `<id>.mp3` from the same `music/` folder as the incoming calls. Until that file
// exists, the stage writes out the call's typed `line` instead (its fallback), so a call can ship
// before it is recorded. The choice arrays MUST stay the same length and order as the matching
// `strings` choices (`callIn.test.ts` pins that).

import type { CallInChoiceData } from './calls-in.data.js';

/** Structural shape of one outgoing call. Text is joined from `strings` by `id`. */
export interface CallOutData {
  /** The sim's call-out id (`CALL_OUTS`), also the strings key and the recording's file name. */
  id: string;
  /** A recording plays (falling back to the typed line while the mp3 is missing) vs. typed only. */
  audio: boolean;
  /** Ordered choices, index-aligned with the strings catalogue. */
  choices: readonly CallInChoiceData[];
}

/** The outgoing calls, in catalogue order (docs/PANVITIUM-CALLS-OUT.md). */
export const CALLS_OUT: readonly CallOutData[] = [
  // The rectory (982079, the code plates): Father Greaves will not speak of Clare Ashby down a
  // telephone line. The one option ends the call; his letter follows (`fr-greaves-1`), armed by the
  // sim the moment the call connected.
  { id: 'the-rectory', audio: true, choices: [{}] },
] as const;

/** Index by id for O(1) lookup in the view-model. */
export const CALL_OUT_BY_ID: Record<string, CallOutData> = Object.fromEntries(
  CALLS_OUT.map((c) => [c.id, c]),
);
