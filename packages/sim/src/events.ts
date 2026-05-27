/**
 * Outcome events — the transient record of what an Opera action produced, surfaced to the UI for
 * the log and the Stellar/Apocalyptic pop-ups (02 §2). These are NOT part of the persisted state;
 * `tick` returns the events generated that tick and the caller decides what to show.
 */
import { type Tier } from './probability.js';

export interface OutcomeEvent {
  readonly actionId: string;
  readonly tier: Tier;
  /** Net change this outcome caused, for a one-line summary. */
  readonly soulsDelta: number;
  readonly reprobateDelta: number;
  readonly goldDelta: number;
}

/** Tiers dramatic enough to warrant a pop-up (02 §2). */
export function isSignatureTier(tier: Tier): boolean {
  return tier === 'stellar' || tier === 'apocalyptic';
}
