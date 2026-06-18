import { describe, it, expect } from 'vitest';
import { createInitialState } from '@panvitium/sim';
import { serializeGameState, CURRENT_SCHEMA_VERSION, type SaveBlob } from '@panvitium/shared';
import { signBlob, verifyBlob } from './signing.js';

const SECRET = 'unit-test-signing-secret-0123';

function blob(saveVersion = 1, lastTickAt = 1000): SaveBlob {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saveVersion,
    lastTickAt,
    deviceId: 'device-1',
    state: serializeGameState(createInitialState('seed', lastTickAt)),
  };
}

describe('save signing', () => {
  it('verifies a signature it produced', () => {
    const b = blob();
    expect(verifyBlob(b, signBlob(b, SECRET), SECRET)).toBe(true);
  });

  it('rejects a tampered blob', () => {
    const b = blob();
    const signature = signBlob(b, SECRET);
    const tampered: SaveBlob = { ...b, saveVersion: b.saveVersion + 1 };
    expect(verifyBlob(tampered, signature, SECRET)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const b = blob();
    expect(verifyBlob(b, signBlob(b, SECRET), 'a-different-secret-0123456789')).toBe(false);
  });

  it('rejects a malformed signature without throwing', () => {
    const b = blob();
    expect(verifyBlob(b, 'not-a-real-hex-signature', SECRET)).toBe(false);
  });
});
