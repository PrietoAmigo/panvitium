/**
 * The save-sync decision (ADR-010 conflict resolution + ADR-011 plausibility), kept pure and
 * unit-testable. The route layer fetches the stored save, calls this, and acts on the result.
 *
 * Conflict rule (ADR-010): accept iff the stored save's version is <= the incoming one; otherwise
 * the client is behind, so return the server's save for the chooser rather than overwriting.
 * Plausibility (ADR-011): reject saves whose lastTickAt is implausibly in the future or that move
 * backwards relative to the stored save.
 */
import { type SaveBlob } from '@panvitium/shared';

export type SyncDecision =
  | { kind: 'accepted'; blob: SaveBlob }
  | { kind: 'conflict'; serverSave: SaveBlob }
  | { kind: 'rejected'; reason: string };

/** Tolerance for clock skew between client and server when sanity-checking lastTickAt. */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function decideSync(stored: SaveBlob | null, incoming: SaveBlob, now: number): SyncDecision {
  if (incoming.lastTickAt > now + CLOCK_SKEW_MS) {
    return { kind: 'rejected', reason: 'lastTickAt is implausibly in the future' };
  }
  if (stored && incoming.lastTickAt < stored.lastTickAt) {
    return { kind: 'rejected', reason: 'lastTickAt moved backwards relative to the stored save' };
  }
  if (stored && stored.saveVersion > incoming.saveVersion) {
    return { kind: 'conflict', serverSave: stored };
  }
  return { kind: 'accepted', blob: incoming };
}
