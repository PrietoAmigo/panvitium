/**
 * The server factory (ADR-007). Repositories are injected so the same routes run against the
 * Drizzle store in production and in-memory in tests. The Zod type provider bridges the shared
 * Zod contracts to Fastify validation/serialization (superseding ADR-007's offhand Ajv mention).
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { type Config } from './config.js';
import { type Repositories } from './repos/types.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSaveRoutes } from './routes/save.js';

export interface ServerDeps {
  config: Config;
  repos: Repositories;
}

/**
 * Cap on request body size. A legitimate save is a few KB; this bounds the otherwise-unbounded
 * `z.record(...)` fields of the save state (tightening Fastify's implicit 1 MB default) so a
 * malicious client cannot bloat the stored JSONB. 512 KB leaves generous headroom for late-game saves.
 */
const BODY_LIMIT_BYTES = 512 * 1024;

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.config.NODE_ENV !== 'test', bodyLimit: BODY_LIMIT_BYTES });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cookie, { secret: deps.config.COOKIE_SECRET });
  // Opt-in rate limiting (`global: false`): only routes that declare `config.rateLimit` are
  // throttled. This targets the abusable auth endpoints (magic-link request/callback) without
  // capping the legitimate, frequent save-sync pushes (ADR-010 pushes on every persist).
  await app.register(rateLimit, { global: false });

  registerHealthRoutes(app);
  registerAuthRoutes(app, deps);
  registerSaveRoutes(app, deps);

  await app.ready();
  return app;
}
