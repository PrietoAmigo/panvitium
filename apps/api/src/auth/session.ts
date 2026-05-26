/**
 * Session handling (ADR-009): a signed, HTTP-only cookie carries an opaque session id; the session
 * record (and its expiry) lives server-side. No password material anywhere.
 */
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type User } from '@panvitium/shared';
import { type Config } from '../config.js';
import { type Repositories } from '../repos/types.js';

export const SESSION_COOKIE = 'sid';

export function setSessionCookie(reply: FastifyReply, sessionId: string, config: Config): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    signed: true,
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: config.SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Resolve the authenticated user from the signed session cookie, or null. */
export async function getCurrentUser(
  request: FastifyRequest,
  repos: Pick<Repositories, 'sessionRepo' | 'userRepo'>,
): Promise<User | null> {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return null;

  const session = await repos.sessionRepo.find(unsigned.value);
  if (!session || session.expiresAt < Date.now()) return null;

  return repos.userRepo.findById(session.userId);
}
