/**
 * The global game store (ADR-003: Zustand, selector subscriptions). It owns the authoritative
 * GameState and the save metadata, and delegates all logic to the pure session/persistence
 * helpers and the sim's `tick`. UI-only state (current room, open panel) lives in components,
 * not here.
 */
import { create } from 'zustand';
import { tick, type GameState } from '@panvitium/sim';
import { loadGame, saveGame, clearSave } from './persistence.js';

interface GameStore {
  state: GameState | null;
  saveVersion: number;
  deviceId: string;
  ready: boolean;
  /** Load (or start) the game and offline-catch-up. Idempotent. */
  init: () => void;
  /** Advance the simulation by `deltaSeconds`. */
  advance: (deltaSeconds: number) => void;
  /** Persist the current state to localStorage, bumping the save version. */
  persist: () => void;
  /** Wipe the save and start a fresh game. */
  hardReset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  saveVersion: 0,
  deviceId: '',
  ready: false,

  init: () => {
    if (get().ready) return;
    const loaded = loadGame(Date.now());
    set({ ...loaded, ready: true });
  },

  advance: (deltaSeconds) => {
    const current = get().state;
    if (!current) return;
    set({ state: tick(current, deltaSeconds) });
  },

  persist: () => {
    const { state, saveVersion, deviceId } = get();
    if (!state) return;
    const nextVersion = saveVersion + 1;
    saveGame(state, nextVersion, deviceId);
    set({ saveVersion: nextVersion });
  },

  hardReset: () => {
    clearSave();
    const loaded = loadGame(Date.now());
    set({ ...loaded, ready: true });
  },
}));
