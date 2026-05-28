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
  startBuild,
  shutdownBusiness,
  assignAcolyteToAction,
  unassignAcolyteFromAction,
  isSignatureTier,
  unbindAllSigils,
  offerDevotion,
  commitKatabasis,
  type BigNum,
  type GameState,
  type OutcomeEvent,
  type Sin,
  type KatabasisRecap,
} from '@panvitium/sim';
import { loadGame, saveGame, clearSave } from './persistence.js';

/** How many recent outcomes the PC log keeps (02 §10). */
const LOG_CAP = 100;

/** Which Katabasis screen is showing: the allocation menu, the recap, or neither. */
export type KatabasisPhase = 'menu' | 'recap' | null;

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
  /** Which Katabasis screen is open (null = none). */
  katabasisPhase: KatabasisPhase;
  /** The recap produced by the last descent, shown on the recap screen. */
  recap: KatabasisRecap | null;
  /** Load (or start) the game and offline-catch-up. Idempotent. */
  init: () => void;
  /** Advance the simulation by `deltaSeconds`, folding any outcomes into the log/signature. */
  advance: (deltaSeconds: number) => void;
  /** Begin an Opera action (pays its cost and queues it), or set a notice if it can't start. */
  act: (actionId: string, target?: string) => void;
  /**
   * Start a Vitium Mercatura build (03 §2.3). Pays the up-front gold cost and queues a build
   * timer. Builds run alongside the player slot — multiple may be in flight concurrently.
   * Sets a notice on failure (no level / not enough gold / unknown id).
   */
  build: (businessId: string) => void;
  /**
   * Manually shut down one owned business of `businessId` (03 §2.3). Instant; refunds the default
   * 50% of the buildCost into gold and decrements the owned count by one.
   */
  shutdown: (businessId: string) => void;
  /**
   * Assign one idle acolyte to a delegatable action (02 §10). Notice on failure (e.g. all
   * acolytes busy, or the action is not delegatable yet — Indagatio only in this slice).
   */
  assignAcolyte: (actionId: string) => void;
  /** Remove one acolyte from a delegated action (LIFO — most-recently-assigned first). */
  unassignAcolyte: (actionId: string) => void;
  /** Open the Katabasis menu (returns any bound souls to the pool first, 02 §5). */
  beginKatabasis: () => void;
  /** Offer Devotion souls to a Prince — permanent (02 §6). Any amount; clamped to the pool. */
  offer: (sin: Sin, amount: BigNum | number) => void;
  /** Commit the descent: reset the lifetime and show the recap. */
  confirmKatabasis: () => void;
  /** Close the Katabasis menu without descending. */
  closeKatabasis: () => void;
  /** Dismiss the recap and resume the game. */
  closeRecap: () => void;
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
  katabasisPhase: null,
  recap: null,

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

  act: (actionId, target) => {
    const current = get().state;
    if (!current) return;
    const result = startAction(current, actionId, target === undefined ? {} : { target });
    if (result.ok) set({ state: result.state, notice: null });
    else set({ notice: result.reason });
  },

  build: (businessId) => {
    const current = get().state;
    if (!current) return;
    const result = startBuild(current, businessId);
    if (result.ok) set({ state: result.state, notice: null });
    else set({ notice: result.reason });
  },

  shutdown: (businessId) => {
    const current = get().state;
    if (!current) return;
    const result = shutdownBusiness(current, businessId);
    if (result.ok) set({ state: result.state, notice: null });
    else set({ notice: result.reason });
  },

  assignAcolyte: (actionId) => {
    const current = get().state;
    if (!current) return;
    const result = assignAcolyteToAction(current, actionId);
    if (result.ok) set({ state: result.state, notice: null });
    else set({ notice: result.reason });
  },

  unassignAcolyte: (actionId) => {
    const current = get().state;
    if (!current) return;
    const result = unassignAcolyteFromAction(current, actionId);
    if (result.ok) set({ state: result.state, notice: null });
    else set({ notice: result.reason });
  },

  beginKatabasis: () => {
    const current = get().state;
    if (!current) return;
    // Bound souls return to the pool to be re-allocated (02 §5); no-op until binding exists.
    set({ state: unbindAllSigils(current), katabasisPhase: 'menu', notice: null });
  },

  offer: (sin, amount) => {
    const current = get().state;
    if (!current) return;
    // Offer any amount; offerDevotion floors and clamps to the available pool. Levels are reached
    // naturally as cumulative Devotion crosses each 180^X threshold (the continuous skill curve).
    set({ state: offerDevotion(current, sin, amount), notice: null });
  },

  confirmKatabasis: () => {
    const current = get().state;
    if (!current) return;
    const { state, recap } = commitKatabasis(current);
    set({ state, recap, katabasisPhase: 'recap', log: [], signature: null, notice: null });
    get().persist();
  },

  closeKatabasis: () => set({ katabasisPhase: null, notice: null }),
  closeRecap: () => set({ katabasisPhase: null, recap: null }),

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
    set({
      ...loaded,
      ready: true,
      log: [],
      signature: null,
      notice: null,
      katabasisPhase: null,
      recap: null,
    });
  },
}));
