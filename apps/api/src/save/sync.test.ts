import { describe, it, expect } from 'vitest';
import { createInitialState } from '@panvitium/sim';
import { serializeGameState, CURRENT_SCHEMA_VERSION, type SaveBlob } from '@panvitium/shared';
import { decideSync, CLOCK_SKEW_MS } from './sync.js';

function blob(saveVersion: number, lastTickAt: number): SaveBlob {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saveVersion,
    lastTickAt,
    deviceId: 'device-1',
    state: serializeGameState(createInitialState('seed', lastTickAt)),
  };
}

const NOW = 1_000_000;

describe('decideSync', () => {
  it('accepts the first save when nothing is stored', () => {
    const d = decideSync(null, blob(0, NOW), NOW);
    expect(d.kind).toBe('accepted');
  });

  it('accepts a newer or equal version', () => {
    expect(decideSync(blob(2, NOW), blob(3, NOW), NOW).kind).toBe('accepted');
    expect(decideSync(blob(2, NOW), blob(2, NOW), NOW).kind).toBe('accepted');
  });

  it('reports a conflict when the incoming version is behind the stored one', () => {
    const d = decideSync(blob(5, NOW), blob(3, NOW), NOW);
    expect(d.kind).toBe('conflict');
    if (d.kind === 'conflict') expect(d.serverSave.saveVersion).toBe(5);
  });

  it('rejects a lastTickAt implausibly in the future', () => {
    const d = decideSync(null, blob(0, NOW + CLOCK_SKEW_MS + 1), NOW);
    expect(d.kind).toBe('rejected');
  });

  it('rejects a lastTickAt that moves backwards', () => {
    const d = decideSync(blob(1, NOW), blob(2, NOW - 1000), NOW);
    expect(d.kind).toBe('rejected');
  });
});
