/**
 * Local-first persistence (ADR-006): the save is written to localStorage as the shared SaveBlob
 * envelope (ADR-010) and read back through the migrator. Cloud sync (ADR-006/010) layers on top
 * of this in a later step; for now localStorage is the single store of record.
 */
import { type GameState } from '@panvitium/sim';
import {
  CURRENT_SCHEMA_VERSION,
  migrateSave,
  newDeviceId,
  serializeGameState,
  deserializeGameState,
  type SaveBlob,
} from '@panvitium/shared';
import { resumeGame, startNewGame } from '../game/session.js';

const SAVE_KEY = 'panvitium:save';
const DEVICE_KEY = 'panvitium:deviceId';

/** The loaded session: the live state plus the metadata needed to write the next save. */
export interface LoadedGame {
  state: GameState;
  saveVersion: number;
  deviceId: string;
}

/** Get this device's stable id, creating and persisting one on first run. */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = newDeviceId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** Read and validate/migrate the stored save, or null if absent or unreadable. */
export function loadSaveBlob(): SaveBlob | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw === null) return null;
  try {
    return migrateSave(JSON.parse(raw));
  } catch {
    // A corrupt or unmigratable save should not brick the game; start fresh.
    return null;
  }
}

/** Load the game: resume the stored save (with offline progression) or start a new one. */
export function loadGame(now: number = Date.now()): LoadedGame {
  const deviceId = getDeviceId();
  const blob = loadSaveBlob();
  if (blob) {
    try {
      return {
        state: resumeGame(deserializeGameState(blob.state), now),
        saveVersion: blob.saveVersion,
        deviceId,
      };
    } catch (err) {
      // The blob validated against the schema but could not be resumed (deserialize or offline
      // tick threw). Don't brick the game on a single bad save — log and start fresh.
      console.error('Failed to resume saved game; starting fresh.', err);
    }
  }
  return { state: startNewGame(now), saveVersion: 0, deviceId };
}

/** Write the current state to localStorage as a SaveBlob. */
export function saveGame(state: GameState, saveVersion: number, deviceId: string): void {
  const blob: SaveBlob = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saveVersion,
    lastTickAt: state.lastTickAt,
    deviceId,
    state: serializeGameState(state),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
}

/**
 * Write a pre-built SaveBlob to localStorage verbatim (no re-serialise). Used by the ADR-010
 * conflict chooser when the player picks the server's save: the blob is replaced wholesale so
 * the next `loadGame` reconstructs the state from it.
 */
export function writeSaveBlob(blob: SaveBlob): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
}

/** Erase the stored save (keeps the device id). Used by a hard reset. */
export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
