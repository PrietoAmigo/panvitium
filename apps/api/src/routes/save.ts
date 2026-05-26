import { type FastifyInstance } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { SAVE_SYNC_PATHS, putSaveRequestSchema } from '@panvitium/shared';
import { type ServerDeps } from '../server.js';
import { getCurrentUser } from '../auth/session.js';
import { decideSync } from '../save/sync.js';

const HISTORY_LIMIT = 10;

export function registerSaveRoutes(instance: FastifyInstance, deps: ServerDeps): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { repos } = deps;

  app.get(SAVE_SYNC_PATHS.get, async (request, reply) => {
    const user = await getCurrentUser(request, repos);
    if (!user) {
      reply.code(401);
      return { error: 'Not authenticated' };
    }
    const save = await repos.saveRepo.getLatest(user.id);
    return { save };
  });

  app.put(
    SAVE_SYNC_PATHS.put,
    { schema: { body: putSaveRequestSchema } },
    async (request, reply) => {
      const user = await getCurrentUser(request, repos);
      if (!user) {
        reply.code(401);
        return { error: 'Not authenticated' };
      }
      const stored = await repos.saveRepo.getLatest(user.id);
      const decision = decideSync(stored, request.body.save, Date.now());
      if (decision.kind === 'rejected') {
        reply.code(422);
        return { error: decision.reason };
      }
      if (decision.kind === 'conflict') {
        return { status: 'conflict', serverSave: decision.serverSave };
      }
      await repos.saveRepo.put(user.id, decision.blob);
      return { status: 'accepted', saveVersion: decision.blob.saveVersion };
    },
  );

  app.get(SAVE_SYNC_PATHS.history, async (request, reply) => {
    const user = await getCurrentUser(request, repos);
    if (!user) {
      reply.code(401);
      return { error: 'Not authenticated' };
    }
    const saves = await repos.saveRepo.history(user.id, HISTORY_LIMIT);
    return { saves };
  });
}
