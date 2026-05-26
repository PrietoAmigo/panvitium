import { type FastifyInstance } from 'fastify';

/** Liveness endpoint for the reverse proxy, uptime monitor, and Docker healthcheck (ADR-016/019). */
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => ({ status: 'ok' as const }));
}
