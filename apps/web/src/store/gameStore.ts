/**
 * The global game store (ADR-003: Zustand, selector subscriptions). It owns the authoritative
 * GameState and the save metadata, and delegates all logic to the pure session/persistence
 * helpers and the sim's `tick` / `startAction`. UI-only state (current room, open panel) lives in
 * components, not here.
 *
 * It also keeps two transient, NON-persisted channels surfaced from the sim each tick: a rolling
 * outcome `log` (the PC's game log, 02 §10) and the latest `signature` outcome — a Stellar or
 * Apocalyptic result that earns a pop-up (02 §2). Neither is part of the save.
 */
import { create } from 'zustand';
import {
  tick,
  startAction,
  isSignatureTier,
  type GameState,
  type OutcomeEvent,
} from '@panvitium/sim';
import { loadGame, saveGame, clearSave } from './persistence.js';

/** How many recent outcomes the PC log keeps (02 §10). */
const LOG_CAP = 100;

interface GameStore {
  state: GameState | null;
  saveVersion: number;
  deviceId: string;
  ready: boolean;
  /** Recent outcomes, newest first (transient; not persisted). */
  log: OutcomeEvent[];
  /** The latest Stellar/Apocalyptic outcome awaiting its pop-up, or null. */
  signature: OutcomeEvent | null;
  /** A transient message for a refused action (e.g. "not enough gold"), or null. */
  notice: string | null;
  /** Load (or start) the game and offline-catch-up. Idempotent. */
  init: () => void;
  /** Advance the simulation by `deltaSeconds`, folding any outcomes into the log/signature. */
  advance: (deltaSeconds: number) => void;
  /** Begin an Opera action (pays its cost and queues it), or set a notice if it can't start. */
  act: (actionId: string) => void;
  /** Persist the current state to localStorage, bumping the save version. */
  persist: () => void;
  /** Dismiss the active signature pop-up. */
  dismissSignature: () => void;
  /** Clear the active notice. */
  dismissNotice: () => void;
  /** Wipe the save and start a fresh game. */
  hardReset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  saveVersion: 0,
  deviceId: '',
  ready: false,
  log: [],
  signature: null,
  notice: null,

  init: () => {
    if (get().ready) return;
    const loaded = loadGame(Date.now());
    set({ ...loaded, ready: true });
  },

  advance: (deltaSeconds) => {
    const current = get().state;
    if (!current) return;
    const { state, events } = tick(current, deltaSeconds);
    if (events.length === 0) {
      set({ state });
      return;
    }
    set((s) => {
      const log = [...events].reverse().concat(s.log).slice(0, LOG_CAP);
      let signature = s.signature;
      for (const e of events) if (isSignatureTier(e.tier)) signature = e;
      return { state, log, signature };
    });
  },

  act: (actionId) => {
    const current = get().state;
    if (!current) return;
    const result = startAction(current, actionId);
    if (result.ok) set({ state: result.state, notice: null });
    else set({ notice: result.reason });
  },

  persist: () => {
    const { state, saveVersion, deviceId } = get();
    if (!state) return;
    const nextVersion = saveVersion + 1;
    saveGame(state, nextVersion, deviceId);
    set({ saveVersion: nextVersion });
  },

  dismissSignature: () => set({ signature: null }),
  dismissNotice: () => set({ notice: null }),

  hardReset: () => {
    clearSave();
    const loaded = loadGame(Date.now());
    set({ ...loaded, ready: true, log: [], signature: null, notice: null });
  },
}));
