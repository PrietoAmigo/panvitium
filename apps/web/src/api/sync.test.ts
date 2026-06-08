/**
 * Sync client tests. Pins:
 *   - happy paths (magic-link request, /auth/me returning a user, save-sync accepted/conflict)
 *   - 401 normalises (`getCurrentUser` → null; other calls → `unauthenticated`-derived reason)
 *   - network failures and HTTP errors surface a readable reason
 *   - malformed payloads do not crash the caller — they return a SyncResult with reason
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser, getServerSave, pushSave, requestMagicLink, signOut } from './sync.js';
import type { SaveBlob, User } from '@panvitium/shared';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const USER: User = {
  id: 'u1',
  email: 'soul@hell.example',
  displayName: 'Acolyte',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function makeBlob(overrides: Partial<SaveBlob> = {}): SaveBlob {
  return {
    schemaVersion: 2,
    saveVersion: 3,
    lastTickAt: 1_700_000_000_000,
    deviceId: 'dev-1',
    state: {
      souls: '0',
      devotion: {
        gula: '0',
        luxuria: '0',
        avaritia: '0',
        tristitia: '0',
        ira: '0',
        acedia: '0',
        vanagloria: '0',
        superbia: '0',
      },
      sigilBindings: {},
      lifetime: {
        gold: '0',
        influence: '0',
        maxInfluence: '100',
        reprobates: 0,
        acolytes: [],
        invocations: {},
        maleficia: [],
        emptioList: [],
        activeToggles: [],
        actionQueue: [],
      },
      rngState: 1,
      lastTickAt: 1_700_000_000_000,
    },
    ...overrides,
  };
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestMagicLink', () => {
  it('POSTs to /auth/magic-link with the email body and credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const r = await requestMagicLink('soul@hell.example');
    expect(r.ok).toBe(true);
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/auth/magic-link');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'soul@hell.example' });
  });

  it('surfaces an HTTP error reason from the server body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'oh dear' }));
    const r = await requestMagicLink('soul@hell.example');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('oh dear');
  });

  it('handles a network failure as a readable reason', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    const r = await requestMagicLink('soul@hell.example');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('network down');
  });
});

describe('getCurrentUser', () => {
  it('returns the user on 200', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: USER }));
    const r = await getCurrentUser();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual(USER);
  });

  it('returns null on 401 (signed out is not an error)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Not authenticated' }));
    const r = await getCurrentUser();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeNull();
  });

  it('flags a malformed response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: { id: 1 } })); // id wrong type
    const r = await getCurrentUser();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/Malformed/);
  });
});

describe('signOut', () => {
  it('POSTs /auth/logout and acknowledges', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const r = await signOut();
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toBe('/auth/logout');
  });
});

describe('getServerSave', () => {
  it('returns the parsed save', async () => {
    const blob = makeBlob();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { save: blob }));
    const r = await getServerSave();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).not.toBeNull();
    expect(r.value!.saveVersion).toBe(3);
  });

  it('returns null when the user has no stored save', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { save: null }));
    const r = await getServerSave();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeNull();
  });
});

describe('pushSave', () => {
  it('PUTs the blob and parses an accepted result', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'accepted', saveVersion: 4 }));
    const r = await pushSave(makeBlob());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe('accepted');
    if (r.value.status !== 'accepted') return;
    expect(r.value.saveVersion).toBe(4);
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/save');
    expect(init.method).toBe('PUT');
  });

  it('parses a conflict result with the server save', async () => {
    const serverSave = makeBlob({ saveVersion: 9 });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'conflict', serverSave }));
    const r = await pushSave(makeBlob({ saveVersion: 3 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe('conflict');
    if (r.value.status !== 'conflict') return;
    expect(r.value.serverSave.saveVersion).toBe(9);
  });

  it('returns a reason on a 422 plausibility rejection', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(422, { error: 'lastTickAt moves backwards' }));
    const r = await pushSave(makeBlob());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/backwards/);
  });
});
