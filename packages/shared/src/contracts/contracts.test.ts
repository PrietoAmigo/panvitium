import { describe, it, expect } from 'vitest';
import { createInitialState } from '@panvitium/sim';
import { serializeGameState } from '../save/state-schema.js';
import { CURRENT_SCHEMA_VERSION, newDeviceId, type SaveBlob } from '../save/schema.js';
import { AUTH_PATHS, magicLinkRequestSchema, userSchema, meResponseSchema } from './auth.js';
import { SAVE_SYNC_PATHS, putSaveRequestSchema, saveSyncResultSchema } from './save-sync.js';

function blob(): SaveBlob {
  const state = createInitialState('seed', 1000);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saveVersion: 1,
    lastTickAt: state.lastTickAt,
    deviceId: newDeviceId(),
    state: serializeGameState(state),
  };
}

describe('auth contracts', () => {
  it('exposes stable paths', () => {
    expect(AUTH_PATHS.me).toBe('/auth/me');
    expect(AUTH_PATHS.magicLinkRequest).toBe('/auth/magic-link');
  });

  it('validates a magic-link request and rejects a bad email', () => {
    expect(magicLinkRequestSchema.safeParse({ email: 'soul@hell.example' }).success).toBe(true);
    expect(magicLinkRequestSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('allows a null email (Discord-only users) but requires a displayName', () => {
    const base = { id: 'u1', displayName: 'Damned', createdAt: '2026-01-01T00:00:00Z' };
    expect(userSchema.safeParse({ ...base, email: null }).success).toBe(true);
    expect(userSchema.safeParse({ ...base, email: 'a@b.com' }).success).toBe(true);
    expect(meResponseSchema.safeParse({ user: { ...base, email: null } }).success).toBe(true);
  });
});

describe('save-sync contracts', () => {
  it('exposes stable paths', () => {
    expect(SAVE_SYNC_PATHS.get).toBe('/save');
    expect(SAVE_SYNC_PATHS.history).toBe('/save/history');
  });

  it('validates a put-save request', () => {
    expect(putSaveRequestSchema.safeParse({ save: blob() }).success).toBe(true);
    expect(putSaveRequestSchema.safeParse({ save: { nonsense: true } }).success).toBe(false);
  });

  it('discriminates accepted from conflict results', () => {
    expect(saveSyncResultSchema.safeParse({ status: 'accepted', saveVersion: 4 }).success).toBe(
      true,
    );
    expect(saveSyncResultSchema.safeParse({ status: 'conflict', serverSave: blob() }).success).toBe(
      true,
    );
    expect(saveSyncResultSchema.safeParse({ status: 'unknown' }).success).toBe(false);
  });
});
