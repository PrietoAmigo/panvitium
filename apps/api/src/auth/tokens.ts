/**
 * Magic-link tokens (ADR-009): a self-contained, HMAC-signed, expiring token carrying the email.
 * No token store needed — validity is proven by the signature and the embedded expiry. The actual
 * email delivery is out of scope for the skeleton (the link is logged in dev); this is the
 * crypto that the request/callback routes rely on.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromB64url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Create a token encoding `email` and an absolute expiry (epoch ms). */
export function createMagicToken(email: string, expiresAt: number, secret: string): string {
  const payload = `${b64url(email)}.${expiresAt}`;
  return `${payload}.${signature(payload, secret)}`;
}

/** Verify a token; returns the email if the signature is valid and it has not expired, else null. */
export function verifyMagicToken(
  token: string,
  secret: string,
  now: number,
): { email: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [emailPart, expPart, sig] = parts as [string, string, string];
  const payload = `${emailPart}.${expPart}`;
  const expected = signature(payload, secret);

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiresAt = Number(expPart);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return null;

  return { email: fromB64url(emailPart) };
}
