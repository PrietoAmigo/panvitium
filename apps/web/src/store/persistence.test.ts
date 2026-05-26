import { describe, it, expect, beforeEach } from 'vitest';
import { bn, eq } from '@panvitium/sim';
import { loadGame, saveGame, clearSave, getDeviceId } from './persistence.js';
import { startNewGame } from '../game/session.js';

beforeEach(() => {
  localStorage.clear();
});

describe('persistence', () => {
  it('returns a fresh game when nothing is stored', () => {
    const { state, saveVersion } = loadGame(1000);
    expect(saveVersion).toBe(0);
    expect(state.lastTickAt).toBe(1000);
  });

  it('round-trips a saved game through localStorage', () => {
    const state = { ...startNewGame(2000), souls: bn('1e50') };
    const deviceId = getDeviceId();
    saveGame(state, 3, deviceId);

    const loaded = loadGame(2000); // same "now" -> no offline advance
    expect(loaded.saveVersion).toBe(3);
    expect(loaded.deviceId).toBe(deviceId);
    expect(eq(loaded.state.souls, bn('1e50'))).toBe(true);
  });

  it('keeps a stable device id across calls', () => {
    expect(getDeviceId()).toBe(getDeviceId());
  });

  it('clears the save but still loads a fresh game afterwards', () => {
    saveGame(startNewGame(0), 1, getDeviceId());
    clearSave();
    expect(loadGame(0).saveVersion).toBe(0);
  });
});
