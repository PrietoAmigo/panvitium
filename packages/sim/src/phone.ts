/**
 * The smartphone dialer's code resolver (design handoff: "The Smartphone — Dialer & Code Input").
 *
 * The phone is the one mundane object the player owns. Its outgoing "call" is a code submission: the
 * player keys digits on the number pad and presses call; the sim classifies the trimmed code and the
 * UI renders the matching toast, or, for a number that connects, raises the call stage.
 *
 * Scope note: the valid-code SET lives here (the sim is the source of truth, never the component).
 * The outgoing calls (`CALL_OUTS`, docs/PANVITIUM-CALLS-OUT.md) are dialled through `dialNumber`,
 * which records a connected call in the permanent `callsPlaced` list; what a call sets in motion
 * keys off that record (the rectory call arms Father Greaves's letter in `emails.ts`). The
 * remaining codes are classification only. Keep any future randomness RNG-gated per ADR-011 so an
 * un-triggered code leaves the seeded stream byte-identical.
 */
import type { GameState } from './state.js';

/** How a dialed code resolves — drives the toast colour and whether the field is cleared or kept. */
export type DialKind = 'boon' | 'info' | 'error';

/**
 * The classification of a submitted code. `call` is a number that connects to an outgoing call (the
 * UI raises the call stage for `callId`). `boon`/`info` carry the recognized code id so the UI can
 * look up its copy. `error` covers two cases: an UNRECOGNIZED number (no `code` — "Number does not
 * exist") and a RECOGNIZED joke number that answers in the same error fashion but with its own copy
 * (`code` present, e.g. `666`).
 */
export type DialOutcome =
  | { kind: 'call'; code: string; callId: string }
  | { kind: 'boon'; code: string }
  | { kind: 'info'; code: string }
  | { kind: 'error'; code?: string };

/**
 * The recognized codes and how each resolves. `666` is a recognized joke number — it answers in the
 * error fashion (red, field kept) with its own insult copy. A number in `CALL_OUTS` is not listed
 * here: it connects instead.
 */
export const PHONE_CODES: Record<string, DialKind> = {
  '666': 'error',
};

/** One dialable outgoing call (docs/PANVITIUM-CALLS-OUT.md). Its copy and recording live in the app. */
export interface CallOutDef {
  /** Id — also the strings key (`strings.phone.callOut.calls[id]`) and the recording's file name. */
  readonly id: string;
  /** The digits that reach it. */
  readonly number: string;
  /** A one-shot line connects once; dialled again after it was placed, nobody answers. */
  readonly oneShot: boolean;
}

/** The outgoing calls, in catalogue order. */
export const CALL_OUTS: readonly CallOutDef[] = [
  // Hidden: the two halves flash in the code plates (982, then 079). The rectory line young Father
  // Stahl gave the Ashby family; Clare wrote it on her walls. Father Greaves answers it once.
  { id: 'the-rectory', number: '982079', oneShot: true },
];

const CALL_OUT_BY_NUMBER: Readonly<Record<string, CallOutDef>> = Object.fromEntries(
  CALL_OUTS.map((c) => [c.number, c]),
);

/**
 * Resolve a dialed code to its outcome. Pure and total: any unrecognized (or empty) input is an
 * `error` with no `code`; a recognized code carries its id; a call-out number is a `call`. This only
 * classifies; `dialNumber` applies a call to the game state.
 */
export function dialCode(code: string): DialOutcome {
  const c = code.trim();
  const call = CALL_OUT_BY_NUMBER[c];
  if (call !== undefined) return { kind: 'call', code: c, callId: call.id };
  const kind = PHONE_CODES[c];
  if (kind === undefined) return { kind: 'error' };
  // The explicit branches keep the discriminated union honest without a cast.
  if (kind === 'boon') return { kind: 'boon', code: c };
  if (kind === 'info') return { kind: 'info', code: c };
  return { kind: 'error', code: c };
}

/** Whether the outgoing call `callId` has been placed (it sits in the permanent record). */
export function callPlaced(state: GameState, callId: string): boolean {
  return state.callsPlaced?.includes(callId) === true;
}

/**
 * Record the outgoing call `callId` as placed (pure). Appends it to the permanent `callsPlaced`
 * list; idempotent (an already-placed call returns the input state). Draws no RNG (ADR-011).
 */
export function placeCall(state: GameState, callId: string): GameState {
  const placed = state.callsPlaced ?? [];
  if (placed.includes(callId)) return state;
  return { ...state, callsPlaced: [...placed, callId] };
}

/**
 * Dial `code` against the game state (pure). A call-out number connects: the call is recorded as
 * placed and the outcome is `call`. A one-shot line dialled again after it was placed rings out
 * unanswered: an `info` outcome carrying the number, whose copy says so, and the state is unchanged.
 * Every other code classifies exactly as `dialCode` and leaves the state untouched.
 */
export function dialNumber(
  state: GameState,
  code: string,
): { state: GameState; outcome: DialOutcome } {
  const outcome = dialCode(code);
  if (outcome.kind !== 'call') return { state, outcome };
  const def = CALL_OUT_BY_NUMBER[outcome.code];
  if (def?.oneShot === true && callPlaced(state, outcome.callId)) {
    return { state, outcome: { kind: 'info', code: outcome.code } };
  }
  return { state: placeCall(state, outcome.callId), outcome };
}
