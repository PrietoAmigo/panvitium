import { describe, it, expect, beforeEach } from 'vitest';
import { type FastifyInstance } from 'fastify';
import { createInitialState } from '@panvitium/sim';
import {
  AUTH_PATHS,
  SAVE_SYNC_PATHS,
  serializeGameState,
  CURRENT_SCHEMA_VERSION,
  type SaveBlob,
} from '@panvitium/shared';
import { loadConfig, type Config } from './config.js';
import { createMemoryRepositories } from './repos/memory.js';
import { buildServer } from './server.js';
import { createMagicToken } from './auth/tokens.js';

const config: Config = loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);

function blob(saveVersion: number, lastTickAt = 1000): SaveBlob {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saveVersion,
    lastTickAt,
    deviceId: 'device-1',
    state: serializeGameState(createInitialState('seed', lastTickAt)),
  };
}

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildServer({ config, repos: createMemoryRepositories() });
});

/** Run the magic-link callback and return the signed session cookie value. */
async function login(email: string): Promise<string> {
  const token = createMagicToken(email, Date.now() + 60_000, config.MAGIC_LINK_SECRET);
  const res = await app.inject({
    method: 'GET',
    url: `${AUTH_PATHS.magicLinkCallback}?token=${encodeURIComponent(token)}`,
  });
  expect(res.statusCode).toBe(302);
  const sid = res.cookies.find((c) => c.name === 'sid');
  if (!sid) throw new Error('no session cookie set');
  return sid.value;
}

describe('health', () => {
  it('reports ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('auth', () => {
  it('returns 401 from /me when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: AUTH_PATHS.me });
    expect(res.statusCode).toBe(401);
  });

  it('logs in via magic link and exposes the user at /me, then logs out', async () => {
    const sid = await login('soul@hell.example');

    const me = await app.inject({ method: 'GET', url: AUTH_PATHS.me, cookies: { sid } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('soul@hell.example');

    await app.inject({ method: 'POST', url: AUTH_PATHS.logout, cookies: { sid } });
    const after = await app.inject({ method: 'GET', url: AUTH_PATHS.me, cookies: { sid } });
    expect(after.statusCode).toBe(401);
  });

  it('rejects an unconfigured Discord login with 501', async () => {
    const res = await app.inject({ method: 'GET', url: AUTH_PATHS.discordStart });
    expect(res.statusCode).toBe(501);
  });
});

describe('save sync', () => {
  it('stores, retrieves, and conflict-resolves saves', async () => {
    const sid = await login('player@hell.example');
    const cookies = { sid };

    const accepted = await app.inject({
      method: 'PUT',
      url: SAVE_SYNC_PATHS.put,
      cookies,
      payload: { save: blob(1) },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ status: 'accepted', saveVersion: 1 });

    const got = await app.inject({ method: 'GET', url: SAVE_SYNC_PATHS.get, cookies });
    expect(got.json().save.saveVersion).toBe(1);

    // A stale push (lower version) must come back as a conflict, not overwrite.
    const conflict = await app.inject({
      method: 'PUT',
      url: SAVE_SYNC_PATHS.put,
      cookies,
      payload: { save: blob(0) },
    });
    expect(conflict.json().status).toBe('conflict');
    expect(conflict.json().serverSave.saveVersion).toBe(1);

    const history = await app.inject({ method: 'GET', url: SAVE_SYNC_PATHS.history, cookies });
    expect(history.json().saves.length).toBe(1);
  });

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: SAVE_SYNC_PATHS.get });
    expect(res.statusCode).toBe(401);
  });
});
