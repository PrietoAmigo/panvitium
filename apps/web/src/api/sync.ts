/**
 * Web → API client for auth and save-sync (ADR-009 + ADR-010). Uses same-origin relative paths
 * (Caddy routes them to the API container in Docker; the dev/Vite-direct case would need a proxy)
 * and `credentials: 'include'` so the signed session cookie rides along.
 *
 * The shape of every call mirrors the Zod schemas in `@panvitium/shared/contracts/*`; we don't
 * re-validate on the way out (the server validates inputs) but we DO Zod-parse the responses we
 * care about so a malformed payload becomes a `SyncError` instead of a runtime crash deep in the
 * UI. Errors are surfaced as a tagged result (`{ ok: false, reason }`) rather than thrown — the
 * store can route them to the SyncPanel without try/catch ceremony at the call site.
 */
import {
  AUTH_PATHS,
  SAVE_SYNC_PATHS,
  getSaveResponseSchema,
  meResponseSchema,
  saveSyncResultSchema,
  type SaveBlob,
  type SaveSyncResult,
  type User,
} from '@panvitium/shared';

export type SyncResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Network/HTTP error envelope; not authenticated (401) is its own normalised case. */
export type FetchError =
  | { kind: 'unauthenticated' }
  | { kind: 'network'; reason: string }
  | { kind: 'http'; status: number; reason: string }
  | { kind: 'malformed'; reason: string };

const JSON_HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };

/**
 * Low-level fetch wrapper: 401 normalises to `{ kind: 'unauthenticated' }`; other non-2xx codes
 * become `{ kind: 'http' }`; network failures become `{ kind: 'network' }`. JSON parse failures
 * become `{ kind: 'malformed' }`. Successful responses return their JSON body as `unknown` for the
 * caller to Zod-parse.
 */
async function call(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; body: unknown } | { ok: false; err: FetchError }> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'include', ...init });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, err: { kind: 'network', reason } };
  }
  if (response.status === 401) {
    return { ok: false, err: { kind: 'unauthenticated' } };
  }
  if (!response.ok) {
    let reason = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === 'string') reason = body.error;
    } catch {
      /* fall through with the default reason */
    }
    return { ok: false, err: { kind: 'http', status: response.status, reason } };
  }
  try {
    const body: unknown = await response.json();
    return { ok: true, body };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, err: { kind: 'malformed', reason } };
  }
}

function describe(err: FetchError): string {
  if (err.kind === 'unauthenticated') return 'Sign in to sync to the cloud.';
  if (err.kind === 'network') return `Could not reach the server: ${err.reason}.`;
  if (err.kind === 'http') return err.reason;
  return `The server sent an unreadable reply: ${err.reason}.`;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

/** Send a magic link to the given email. The server logs the link outside production. */
export async function requestMagicLink(email: string): Promise<SyncResult<true>> {
  const r = await call(AUTH_PATHS.magicLinkRequest, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email }),
  });
  if (!r.ok) return { ok: false, reason: describe(r.err) };
  return { ok: true, value: true };
}

/** Get the currently signed-in user, or null when signed out. */
export async function getCurrentUser(): Promise<SyncResult<User | null>> {
  const r = await call(AUTH_PATHS.me);
  if (!r.ok) {
    if (r.err.kind === 'unauthenticated') return { ok: true, value: null };
    return { ok: false, reason: describe(r.err) };
  }
  const parsed = meResponseSchema.safeParse(r.body);
  if (!parsed.success) return { ok: false, reason: 'Malformed /auth/me response.' };
  return { ok: true, value: parsed.data.user };
}

/** End the current session. */
export async function signOut(): Promise<SyncResult<true>> {
  const r = await call(AUTH_PATHS.logout, { method: 'POST' });
  if (!r.ok) return { ok: false, reason: describe(r.err) };
  return { ok: true, value: true };
}

// ── Save sync ────────────────────────────────────────────────────────────────

/** Fetch the latest server-stored save (or null if the user has never synced). */
export async function getServerSave(): Promise<SyncResult<SaveBlob | null>> {
  const r = await call(SAVE_SYNC_PATHS.get);
  if (!r.ok) return { ok: false, reason: describe(r.err) };
  const parsed = getSaveResponseSchema.safeParse(r.body);
  if (!parsed.success) return { ok: false, reason: 'Malformed /save response.' };
  return { ok: true, value: parsed.data.save };
}

/** Push the local save to the server. Conflict-on-divergence per ADR-010 (server returns its own). */
export async function pushSave(save: SaveBlob): Promise<SyncResult<SaveSyncResult>> {
  const r = await call(SAVE_SYNC_PATHS.put, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ save }),
  });
  if (!r.ok) return { ok: false, reason: describe(r.err) };
  const parsed = saveSyncResultSchema.safeParse(r.body);
  if (!parsed.success) return { ok: false, reason: 'Malformed /save (PUT) response.' };
  return { ok: true, value: parsed.data };
}
