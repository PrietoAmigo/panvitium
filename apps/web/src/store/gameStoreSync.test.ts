/**
 * Store-level tests for the cloud-sync surface (ADR-009 + ADR-010). With fetch mocked, exercises:
 *   - refreshUser populates / clears `user`
 *   - signIn surfaces a server error
 *   - syncToServer is a no-op when signed out
 *   - syncToServer marks `ok` on accepted and bumps `lastSyncedAt`
 *   - syncToServer opens `pendingConflict` on conflict (no auto-overwrite)
 *   - resolveConflict('local') force-promotes past the server's saveVersion and re-pushes
 *   - resolveConflict('server') replaces local state with the server blob via localStorage round-trip
 *   - persist() fires the sync only when signed in
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bn, type GameState } from '@panvitium/sim';
import {
  CURRENT_SCHEMA_VERSION,
  serializeGameState,
  type SaveBlob,
  type User,
} from '@panvitium/shared';
import { useGameStore } from './gameStore.js';

type FetchMock = ReturnType<typeof vi.fn>;
const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const USER: User = {
  id: 'u1',
  email: 'soul@hell.example',
  displayName: 'Acolyte',
  createdAt: '2026-01-01T00:00:00.000Z',
};

let fetchMock: FetchMock;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  useGameStore.setState({
    state: null,
    saveVersion: 0,
    deviceId: '',
    ready: false,
    log: [],
    signature: null,
    notice: null,
    katabasisPhase: null,
    recap: null,
    user: null,
    authReady: false,
    syncStatus: 'idle',
    syncError: null,
    lastSyncedAt: null,
    pendingConflict: null,
  });
  store().init();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Build a SaveBlob for the server to "return" (e.g. for a conflict response). */
function serverBlob(state: GameState, saveVersion: number, deviceId = 'other-device'): SaveBlob {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saveVersion,
    lastTickAt: state.lastTickAt,
    deviceId,
    state: serializeGameState(state),
  };
}

describe('refreshUser', () => {
  it('populates the user on 200', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { user: USER }));
    await store().refreshUser();
    expect(store().user).toEqual(USER);
    expect(store().authReady).toBe(true);
  });

  it('leaves user null on 401, and authReady is true (the probe completed)', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: 'Not authenticated' }));
    await store().refreshUser();
    expect(store().user).toBeNull();
    expect(store().authReady).toBe(true);
  });
});

describe('signIn', () => {
  it('surfaces a server error into syncError', async () => {
    fetchMock.mockResolvedValueOnce(json(500, { error: 'mail provider down' }));
    await store().signIn('soul@hell.example');
    expect(store().syncError).toMatch(/mail/);
  });
});

describe('syncToServer', () => {
  it('is a no-op when signed out', async () => {
    await store().syncToServer();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks ok and bumps lastSyncedAt on accepted', async () => {
    useGameStore.setState({ user: USER, saveVersion: 2 });
    fetchMock.mockResolvedValueOnce(json(200, { status: 'accepted', saveVersion: 3 }));
    await store().syncToServer();
    expect(store().syncStatus).toBe('ok');
    expect(store().lastSyncedAt).toBe(store().state!.lastTickAt);
  });

  it('opens pendingConflict on conflict (no overwrite, no error)', async () => {
    useGameStore.setState({ user: USER, saveVersion: 2 });
    const sv = serverBlob(store().state!, 9);
    fetchMock.mockResolvedValueOnce(json(200, { status: 'conflict', serverSave: sv }));
    await store().syncToServer();
    expect(store().pendingConflict).not.toBeNull();
    expect(store().pendingConflict!.server.saveVersion).toBe(9);
    expect(store().syncError).toBeNull();
  });
});

describe('resolveConflict', () => {
  it('"local" force-promotes past the server version and re-pushes', async () => {
    useGameStore.setState({ user: USER, saveVersion: 4 });
    // First call: returns a conflict so pendingConflict gets seeded.
    const sv = serverBlob(store().state!, 10);
    fetchMock.mockResolvedValueOnce(json(200, { status: 'conflict', serverSave: sv }));
    await store().syncToServer();
    expect(store().pendingConflict).not.toBeNull();
    // Second call (the re-push from resolveConflict) accepts at the bumped version.
    fetchMock.mockResolvedValueOnce(json(200, { status: 'accepted', saveVersion: 11 }));
    await store().resolveConflict('local');
    expect(store().pendingConflict).toBeNull();
    // saveVersion is max(local, server) + 1 = max(4, 10) + 1 = 11.
    expect(store().saveVersion).toBe(11);
  });

  it('"server" replaces local state with the server blob and clears the chooser', async () => {
    useGameStore.setState({ user: USER, saveVersion: 4 });
    // Construct a server save that visibly differs from the live state (souls = 999_999).
    const lifted: GameState = { ...store().state!, souls: bn(999_999) };
    const sv = serverBlob(lifted, 9, 'other-device');
    fetchMock.mockResolvedValueOnce(json(200, { status: 'conflict', serverSave: sv }));
    await store().syncToServer();
    await store().resolveConflict('server');
    expect(store().pendingConflict).toBeNull();
    // Local state now mirrors the server's payload (souls lift across the boundary).
    expect(store().state!.souls.toNumber()).toBe(999_999);
    expect(store().saveVersion).toBe(9);
  });
});

describe('persist auto-sync', () => {
  it('does not call the server when signed out', () => {
    store().persist();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires the sync when signed in', async () => {
    useGameStore.setState({ user: USER });
    fetchMock.mockResolvedValueOnce(json(200, { status: 'accepted', saveVersion: 1 }));
    store().persist();
    // syncToServer is fire-and-forget; let the microtask flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/save');
  });
});
