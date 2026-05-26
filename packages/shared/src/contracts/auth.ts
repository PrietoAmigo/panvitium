/**
 * Auth wire contracts (ADR-009): email magic links + Discord OAuth, signed HTTP-only cookie
 * sessions, no password storage. These paths and schemas are imported by both the API (to
 * register routes and validate input) and the web client (to call them with the same types).
 */
import { z } from 'zod';

export const AUTH_PATHS = {
  /** POST { email } — send a one-time magic link. */
  magicLinkRequest: '/auth/magic-link',
  /** GET ?token — verify a magic link, set the session cookie. */
  magicLinkCallback: '/auth/magic-link/callback',
  /** GET — begin Discord OAuth. */
  discordStart: '/auth/discord',
  /** GET ?code&state — Discord OAuth callback, set the session cookie. */
  discordCallback: '/auth/discord/callback',
  /** GET — the current session's user, or 401 if signed out. */
  me: '/auth/me',
  /** POST — clear the session. */
  logout: '/auth/logout',
} as const;

/** Generic success acknowledgement. */
export const okResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof okResponseSchema>;

export const magicLinkRequestSchema = z.object({
  email: z.string().email(),
});
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

/** An authenticated account. `email` may be null for Discord-only users (ADR-009). */
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  displayName: z.string(),
  createdAt: z.string(), // ISO 8601
});
export type User = z.infer<typeof userSchema>;

export const meResponseSchema = z.object({ user: userSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;
