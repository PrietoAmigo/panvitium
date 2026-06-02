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
  /**
   * Who produced this outcome. Absent ⇒ the player's own action (the default). Acolyte delegations
   * and autonomous invocation-runner channels tag their outcomes so a consumer can separate them —
   * the PC Logs program shows player outcomes only. Transient (events are not persisted).
   */
  readonly source?: EventSource;
  /** Maleficium ids surfaced into the Emptio list this outcome (Indagatio). */
  readonly maleficiaSurfaced?: readonly string[];
  /** Maleficium ids added to the player's inventory this outcome (Emptio purchase). */
  readonly maleficiaAcquired?: readonly string[];
  /** Maleficium ids dropped from the Emptio list (Emptio failure terrible/apocalyptic). */
  readonly maleficiaLost?: readonly string[];
}

/** The origin of an outcome event. */
export type EventSource = 'player' | 'acolyte' | 'invocation';

/** Tiers dramatic enough to warrant a pop-up (02 §2). */
export function isSignatureTier(tier: Tier): boolean {
  return tier === 'stellar' || tier === 'apocalyptic';
}
