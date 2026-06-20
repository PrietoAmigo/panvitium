import { describe, it, expect, beforeEach } from 'vitest';
import { bn, eq } from '@panvitium/sim';
import { deserializeGameState } from '@panvitium/shared';
import {
  loadGame,
  saveGame,
  clearSave,
  getDeviceId,
  serializeSaveBlob,
  parseSaveBlob,
} from './persistence.js';
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

  it('serializeSaveBlob and parseSaveBlob round-trip a save (export/import)', () => {
    const state = { ...startNewGame(1000), souls: bn('1e40') };
    const text = serializeSaveBlob(state, 5, 'dev-xyz');
    const blob = parseSaveBlob(text);
    expect(blob.saveVersion).toBe(5);
    expect(blob.deviceId).toBe('dev-xyz');
    expect(blob.lastTickAt).toBe(1000);
    expect(eq(deserializeGameState(blob.state).souls, bn('1e40'))).toBe(true);
  });

  it('parseSaveBlob rejects non-JSON and schema-invalid input', () => {
    expect(() => parseSaveBlob('not json at all')).toThrow();
    expect(() => parseSaveBlob('{"foo":1}')).toThrow();
  });

  it('reports mail delivered by the offline catch-up so its SFX can replay on resume', () => {
    // Crossing 1e9 lifetime souls while away makes Fausto #5 ("Little pig") eligible; it delivers
    // during resumeGame's catch-up tick, whose result is otherwise discarded. loadGame surfaces it
    // so the store can replay the door-knock the live loop would have cued (05 / ADR-014).
    const saved = { ...startNewGame(1000), totalSoulsObtained: bn('1e9') };
    saveGame(saved, 1, getDeviceId());
    const loaded = loadGame(101000); // 100s later -> offline catch-up runs and delivers
    expect(loaded.deliveredOnResume).toContain('fausto-5');
  });

  it('reports no resume-delivered mail when nothing new arrives', () => {
    expect(loadGame(2000).deliveredOnResume).toEqual([]); // fresh game (no save) -> empty
    saveGame(startNewGame(1000), 1, getDeviceId());
    expect(loadGame(1000).deliveredOnResume).toEqual([]); // same "now" -> no offline advance
    expect(loadGame(60_000).deliveredOnResume).toEqual([]); // catch-up, but no email is eligible
  });
});
