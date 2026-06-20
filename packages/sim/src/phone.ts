/**
 * The smartphone dialer's code resolver (design handoff: "The Smartphone — Dialer & Code Input").
 *
 * The phone is the one mundane object the player owns. Its outgoing "call" is a code submission: the
 * player keys digits on the number pad and presses call; the sim classifies the trimmed code as a
 * boon, an info readout, or an unrecognized error, and the UI renders the matching toast.
 *
 * Scope note: the valid-code SET lives here (the sim is the source of truth, never the component),
 * but the code EFFECTS are a documented empty hook for a later pass — the full outgoing-call engine
 * (`docs/PANVITIUM-CALLS-OUT.md`) is not built yet, so a recognized boon today only surfaces its
 * (placeholder) copy and changes no game state. When that engine lands, route each code's effect
 * through here; keep any randomness RNG-gated per ADR-011 so an un-triggered code leaves the seeded
 * stream byte-identical.
 */

/** How a dialed code resolves — drives the toast colour and whether the field is cleared or kept. */
export type DialKind = 'boon' | 'info' | 'error';

/**
 * The classification of a submitted code. `boon`/`info` carry the recognized code id so the UI can
 * look up its copy; `error` (unrecognized) carries nothing.
 */
export type DialOutcome =
  | { kind: 'boon'; code: string }
  | { kind: 'info'; code: string }
  | { kind: 'error' };

/**
 * The recognized codes and how each resolves. PLACEHOLDER set, themed as real Android MMI codes
 * (e.g. `*#1450#` is decimal leetspeak for "ISO" — isolate). `*#06#` is a real-phone Easter egg: the
 * IMEI readout, an info result with no game effect. The final set + effects arrive with the call
 * engine; until then these only classify the toast.
 */
export const PHONE_CODES: Record<string, DialKind> = {
  '*#1450#': 'boon',
  '*#2206#': 'boon',
  '*#0666#': 'boon',
  '*#06#': 'info',
};

/**
 * Resolve a dialed code to its outcome. Pure and total: any unrecognized (or empty) input is an
 * `error`. Effects are deferred (see the module note); this only decides which toast the dialer
 * shows and whether the field clears (`boon`) or is kept (`info`/`error`).
 */
export function dialCode(code: string): DialOutcome {
  const c = code.trim();
  const kind = PHONE_CODES[c];
  if (kind === undefined) return { kind: 'error' };
  // The narrowed assignment keeps the discriminated union honest without a cast.
  return kind === 'info' ? { kind: 'info', code: c } : { kind: 'boon', code: c };
}
