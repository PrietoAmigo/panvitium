/**
 * Save-blob signing (ADR-011 tamper detection). The server HMAC-signs each stored blob on write
 * and re-verifies on read, so a row mutated directly in the database (out-of-band tampering) is
 * detected rather than served back to the client as authoritative state. Kept pure and free of the
 * storage layer so the security-relevant logic is unit-testable without a database.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { type SaveBlob } from '@panvitium/shared';

/** HMAC-SHA256 over the canonical JSON of `blob`, hex-encoded. */
export function signBlob(blob: SaveBlob, secret: string): string {
  return createHmac('sha256', secret).update(JSON.stringify(blob)).digest('hex');
}

/** Constant-time check that `signature` is a valid signature of `blob` under `secret`. */
export function verifyBlob(blob: SaveBlob, signature: string, secret: string): boolean {
  const expected = signBlob(blob, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
