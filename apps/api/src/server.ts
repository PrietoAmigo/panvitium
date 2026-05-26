/**
 * The server factory (ADR-007). Repositories are injected so the same routes run against the
 * Drizzle store in production and in-memory in tests. The Zod type provider bridges the shared
 * Zod contracts to Fastify validation/serialization (superseding ADR-007's offhand Ajv mention).
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
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

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.config.NODE_ENV !== 'test' });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cookie, { secret: deps.config.COOKIE_SECRET });

  registerHealthRoutes(app);
  registerAuthRoutes(app, deps);
  registerSaveRoutes(app, deps);

  await app.ready();
  return app;
}
