/**
 * The save *envelope* (ADR-010). Wraps the serialized gameplay state with the metadata the
 * sync protocol and anti-tamper checks need: a schema version, a monotonic save version, the
 * wall-clock of the last tick, and a per-device id.
 */
import { z } from 'zod';
import { serializedGameStateSchema } from './state-schema.js';

/** The current save schema version. Bump when the persisted shape changes; add a migration. */
export const CURRENT_SCHEMA_VERSION = 2;

export const saveBlobSchema = z.object({
  /** Persisted-shape version; gates migration on load (ADR-006). */
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  /** Monotonically increases on each cloud push; drives conflict resolution (ADR-010). */
  saveVersion: z.number().int().nonnegative(),
  /** Wall-clock ms of the last tick; mirrors state.lastTickAt. Read by the server for the
   *  plausibility check (ADR-011) without deserializing the whole state. */
  lastTickAt: z.number().int().nonnegative(),
  /** Identifies the originating device for multi-device divergence handling. */
  deviceId: z.string().min(1),
  state: serializedGameStateSchema,
});

/** A complete save as persisted to localStorage and synced to the server. */
export type SaveBlob = z.infer<typeof saveBlobSchema>;

/** Generate a fresh per-device id (Web Crypto; available in browsers and Node 19+). */
export function newDeviceId(): string {
  return crypto.randomUUID();
}

/**
 * A compact summary of a save, for the multi-device conflict chooser (ADR-010): enough to tell
 * two saves apart at a glance without rendering the full state. Sin-level display is deferred to
 * the UI step once the Devotion/level system exists.
 */
export interface SaveSummary {
  saveVersion: number;
  lastTickAt: number;
  souls: string;
}

export function summarizeSave(blob: SaveBlob): SaveSummary {
  return {
    saveVersion: blob.saveVersion,
    lastTickAt: blob.lastTickAt,
    souls: blob.state.souls,
  };
}
