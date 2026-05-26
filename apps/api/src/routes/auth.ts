import { type FastifyInstance } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AUTH_PATHS, magicLinkRequestSchema } from '@panvitium/shared';
import { type ServerDeps } from '../server.js';
import { createMagicToken, verifyMagicToken } from '../auth/tokens.js';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  getCurrentUser,
  setSessionCookie,
} from '../auth/session.js';

function displayNameFromEmail(email: string): string {
  return email.split('@')[0] ?? 'Acolyte';
}

export function registerAuthRoutes(instance: FastifyInstance, deps: ServerDeps): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { config, repos } = deps;

  app.post(
    AUTH_PATHS.magicLinkRequest,
    { schema: { body: magicLinkRequestSchema } },
    async (request) => {
      const { email } = request.body;
      const existing = await repos.userRepo.findByEmail(email);
      if (!existing) {
        await repos.userRepo.create({ email, displayName: displayNameFromEmail(email) });
      }
      const expiresAt = Date.now() + config.MAGIC_LINK_TTL_SECONDS * 1000;
      const token = createMagicToken(email, expiresAt, config.MAGIC_LINK_SECRET);
      const link = `${config.PUBLIC_URL}${AUTH_PATHS.magicLinkCallback}?token=${encodeURIComponent(token)}`;
      // Skeleton: no mail provider yet — surface the link in the log outside production.
      if (config.NODE_ENV !== 'production') request.log.info({ link }, 'magic link issued');
      return { ok: true };
    },
  );

  app.get(
    AUTH_PATHS.magicLinkCallback,
    { schema: { querystring: z.object({ token: z.string() }) } },
    async (request, reply) => {
      const verified = verifyMagicToken(request.query.token, config.MAGIC_LINK_SECRET, Date.now());
      if (!verified) {
        reply.code(401);
        return { error: 'Invalid or expired link' };
      }
      const user =
        (await repos.userRepo.findByEmail(verified.email)) ??
        (await repos.userRepo.create({
          email: verified.email,
          displayName: displayNameFromEmail(verified.email),
        }));
      const expiresAt = Date.now() + config.SESSION_TTL_SECONDS * 1000;
      const sessionId = await repos.sessionRepo.create(user.id, expiresAt);
      setSessionCookie(reply, sessionId, config);
      return reply.redirect(config.PUBLIC_URL);
    },
  );

  // Discord OAuth is contracted but not configured in the skeleton (needs client credentials).
  app.get(AUTH_PATHS.discordStart, async (_request, reply) => {
    reply.code(501);
    return { error: 'Discord OAuth is not configured yet' };
  });
  app.get(AUTH_PATHS.discordCallback, async (_request, reply) => {
    reply.code(501);
    return { error: 'Discord OAuth is not configured yet' };
  });

  app.get(AUTH_PATHS.me, async (request, reply) => {
    const user = await getCurrentUser(request, repos);
    if (!user) {
      reply.code(401);
      return { error: 'Not authenticated' };
    }
    return { user };
  });

  app.post(AUTH_PATHS.logout, async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE];
    if (raw) {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && unsigned.value !== null) {
        await repos.sessionRepo.delete(unsigned.value);
      }
    }
    clearSessionCookie(reply);
    return { ok: true };
  });
}
