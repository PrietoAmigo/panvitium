/**
 * The smartphone dialer's code resolver (design handoff: "The Smartphone — Dialer & Code Input").
 *
 * The phone is the one mundane object the player owns. Its outgoing "call" is a code submission: the
 * player keys digits on the number pad and presses call; the sim classifies the trimmed code and the
 * UI renders the matching toast.
 *
 * Scope note: the valid-code SET lives here (the sim is the source of truth, never the component),
 * but real code EFFECTS are a documented empty hook for a later pass — the full outgoing-call engine
 * (`docs/PANVITIUM-CALLS-OUT.md`) is not built yet. When it lands, route each code's effect through
 * here; keep any randomness RNG-gated per ADR-011 so an un-triggered code leaves the seeded stream
 * byte-identical.
 */

/** How a dialed code resolves — drives the toast colour and whether the field is cleared or kept. */
export type DialKind = 'boon' | 'info' | 'error';

/**
 * The classification of a submitted code. `boon`/`info` carry the recognized code id so the UI can
 * look up its copy. `error` covers two cases: an UNRECOGNIZED number (no `code` — "Number does not
 * exist") and a RECOGNIZED joke number that answers in the same error fashion but with its own copy
 * (`code` present, e.g. `666`).
 */
export type DialOutcome =
  | { kind: 'boon'; code: string }
  | { kind: 'info'; code: string }
  | { kind: 'error'; code?: string };

/**
 * The recognized codes and how each resolves. `666` is a recognized joke number — it answers in the
 * error fashion (red, field kept) with its own insult copy. The final boon/info set + effects arrive
 * with the call engine; until then this is the whole catalog.
 */
export const PHONE_CODES: Record<string, DialKind> = {
  '666': 'error',
};

/**
 * Resolve a dialed code to its outcome. Pure and total: any unrecognized (or empty) input is an
 * `error` with no `code`; a recognized code carries its id. Effects are deferred (see the module
 * note); this only decides which toast the dialer shows and whether the field clears (`boon`) or is
 * kept (`info`/`error`).
 */
export function dialCode(code: string): DialOutcome {
  const c = code.trim();
  const kind = PHONE_CODES[c];
  if (kind === undefined) return { kind: 'error' };
  // The explicit branches keep the discriminated union honest without a cast.
  if (kind === 'boon') return { kind: 'boon', code: c };
  if (kind === 'info') return { kind: 'info', code: c };
  return { kind: 'error', code: c };
}
