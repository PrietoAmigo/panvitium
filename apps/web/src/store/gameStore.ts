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
  activateToggle,
  deactivateToggle,
  invoke,
  dispel,
  assignAcolyteToAction,
  unassignAcolyteFromAction,
  isSignatureTier,
  unbindAllSigils,
  bindSigil as bindSigilSim,
  offerDevotion,
  offerEternal as offerEternalSim,
  eternalSinRevealed,
  commitKatabasis,
  bn,
  add,
  sub,
  gte,
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
  /** The id of the most recently unlocked achievement (03 §7), for a toast; null when dismissed. */
  achievementToast: string | null;
  signature: OutcomeEvent | null;
  /** A transient message for a refused action (e.g. "not enough gold"), or null. */
  notice: string | null;
  /** Which Katabasis screen is open (null = none). */
  katabasisPhase: KatabasisPhase;
  /** The recap produced by the last descent, shown on the recap screen. */
  recap: KatabasisRecap | null;
  /**
   * True when an Eternal-Sin offering has just crossed the reveal threshold — the credits screen
   * is showing. Set once on the crossing; cleared by `dismissEternalReveal`. Revealed-ness itself
   * is derived from state (eternalSinRevealed), so this flag is only the one-time "show it now".
   */
  eternalReveal: boolean;
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
  /**
   * Activate a Vitium Compositum ceremony toggle (03 §2.3). Notice on failure (gate unmet, already
   * active). Upkeep is paid per-tick; the toggle auto-deactivates if it can't pay (02 §3).
   */
  activateCeremony: (vcId: string) => void;
  /** Manually deactivate a Vitium Compositum ceremony toggle. */
  deactivateCeremony: (vcId: string) => void;
  /**
   * Summon an invocation (02 §7, 03 §2.4). Pays the soul cost and increments the active count.
   * Notice on failure (gates unmet, at cap, not enough souls).
   */
  summon: (invocationId: string) => void;
  /** Dispel one active invocation of the given id. */
  banish: (invocationId: string) => void;
  /** Open the Katabasis menu (returns any bound souls to the pool first, 02 §5). */
  beginKatabasis: () => void;
  /** Offer Devotion souls to a Prince — permanent (02 §6). Any amount; clamped to the pool. */
  offer: (sin: Sin, amount: BigNum | number) => void;
  /**
   * Bind a sigil to an absolute target soul count (recoverable, 02 §5). The delta moves to/from the
   * unspent pool; clamped to (current binding + pool). Binding 0 clears it.
   */
  bind: (sigilId: number, targetAmount: BigNum | number) => void;
  /** Unbind a sigil entirely, returning its souls to the pool. */
  unbind: (sigilId: number) => void;
  /** Lock `delta` more souls onto a sigil (relative; clamped to the available pool). */
  bindMore: (sigilId: number, delta: BigNum | number) => void;
  /** Release `delta` souls from a sigil back to the pool (relative; clamped to what is bound). */
  bindLess: (sigilId: number, delta: BigNum | number) => void;
  /**
   * Offer souls to the Eternal Sin (03 §8). No-op until every Cardinal Sin is maxed. Crossing the
   * reveal threshold raises `eternalReveal` to trigger the credits screen.
   */
  offerEternal: (amount: BigNum | number) => void;
  /** Dismiss the Eternal-Sin reveal screen (the game continues in its post-reveal state). */
  dismissEternalReveal: () => void;
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
  /** Clear the achievement toast. */
  dismissAchievementToast: () => void;
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
  achievementToast: null,
  katabasisPhase: null,
  recap: null,
  eternalReveal: false,

  init: () => {
    if (get().ready) return;
    const loaded = loadGame(Date.now());
    set({ ...loaded, ready: true });
  },

  advance: (deltaSeconds) => {
    const current = get().state;
    if (!current) return;
    const { state, events, notices, achievementsUnlocked } = tick(current, deltaSeconds);
    // A toggle that auto-deactivated this tick surfaces as the transient notice (02 §3). The
    // sim has already removed it; this just tells the player. Latest wins if several fired.
    const noticePatch = notices.length > 0 ? { notice: notices[notices.length - 1]! } : {};
    // A newly-unlocked achievement raises a toast (latest wins if several fired this tick).
    const achievementPatch =
      achievementsUnlocked.length > 0
        ? { achievementToast: achievementsUnlocked[achievementsUnlocked.length - 1]! }
        : {};
    if (events.length === 0) {
      set({ state, ...noticePatch, ...achievementPatch });
      return;
    }
    set((s) => {
      const log = [...events].reverse().concat(s.log).slice(0, LOG_CAP);
      let signature = s.signature;
      for (const e of events) if (isSignatureTier(e.tier)) signature = e;
      return { state, log, signature, ...noticePatch, ...achievementPatch };
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

  activateCeremony: (vcId) => {
    const current = get().state;
    if (!current) return;
    const result = activateToggle(current, vcId);
    if (result.ok) set({ state: result.state, notice: null });
    else set({ notice: result.reason });
  },

  deactivateCeremony: (vcId) => {
    const current = get().state;
    if (!current) return;
    const result = deactivateToggle(current, vcId);
    if (result.ok) set({ state: result.state, notice: null });
    else set({ notice: result.reason });
  },

  summon: (invocationId) => {
    const current = get().state;
    if (!current) return;
    const result = invoke(current, invocationId);
    if (result.ok) set({ state: result.state, notice: null });
    else set({ notice: result.reason });
  },

  banish: (invocationId) => {
    const current = get().state;
    if (!current) return;
    const result = dispel(current, invocationId);
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

  bind: (sigilId, targetAmount) => {
    const current = get().state;
    if (!current) return;
    set({ state: bindSigilSim(current, sigilId, targetAmount), notice: null });
  },

  unbind: (sigilId) => {
    const current = get().state;
    if (!current) return;
    set({ state: bindSigilSim(current, sigilId, 0), notice: null });
  },

  bindMore: (sigilId, delta) => {
    const current = get().state;
    if (!current) return;
    const bound = current.sigilBindings[sigilId] ?? bn(0);
    const d = typeof delta === 'number' ? bn(delta) : delta;
    // bindSigil clamps the absolute target to (bound + pool), so over-asking simply pours in all.
    set({ state: bindSigilSim(current, sigilId, add(bound, d)), notice: null });
  },

  bindLess: (sigilId, delta) => {
    const current = get().state;
    if (!current) return;
    const bound = current.sigilBindings[sigilId] ?? bn(0);
    const d = typeof delta === 'number' ? bn(delta) : delta;
    const target = gte(bound, d) ? sub(bound, d) : bn(0);
    set({ state: bindSigilSim(current, sigilId, target), notice: null });
  },

  offerEternal: (amount) => {
    const current = get().state;
    if (!current) return;
    const before = eternalSinRevealed(current);
    const next = offerEternalSim(current, amount);
    const crossed = !before && eternalSinRevealed(next);
    set({ state: next, notice: null, ...(crossed ? { eternalReveal: true } : {}) });
  },

  dismissEternalReveal: () => set({ eternalReveal: false }),

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
  dismissAchievementToast: () => set({ achievementToast: null }),
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
