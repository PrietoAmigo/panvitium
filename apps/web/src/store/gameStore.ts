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
  activateMaleficium as activateMaleficiumSim,
  isSignatureTier,
  unbindAllSigils,
  bindSigil as bindSigilSim,
  offerDevotion,
  offerEternal as offerEternalSim,
  eternalSinRevealed,
  commitKatabasis,
  enterKatabasis,
  markEmailRead as markEmailReadSim,
  markAllEmailsRead as markAllEmailsReadSim,
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
import {
  loadGame,
  saveGame,
  clearSave,
  writeSaveBlob,
  serializeSaveBlob,
  parseSaveBlob,
} from './persistence.js';
import { type OfflineRecap } from '../game/session.js';
import {
  CURRENT_SCHEMA_VERSION,
  serializeGameState,
  type SaveBlob,
  type User,
} from '@panvitium/shared';
import {
  getCurrentUser as apiGetCurrentUser,
  pushSave,
  requestMagicLink,
  signOut as apiSignOut,
} from '../api/sync.js';

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
  /**
   * True on launch — the title menu is showing and the sim is frozen behind it until the player
   * picks Continue (or starts a New Game). Set false by `dismissTitle`; never re-shown in-session.
   */
  titleOpen: boolean;
  /** True when the Settings overlay is open (gear button or the title menu's Settings entry). */
  settingsOpen: boolean;
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
   * Activate a single-use maleficium from the owned inventory (Hand of Glory, Defixio). Consumes one
   * copy and applies its effect via the sim's `activateMaleficium`. Sets a notice on failure (none
   * owned, or a defixio already at work). Like `act`, it relies on the debounced autosave (ADR-006).
   */
  activateMaleficium: (id: string) => void;
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
  /** Unbind every sigil at once, returning all bound souls to the pool. */
  unbindAll: () => void;
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
  /** The "while you were away" recap, shown once on load after a meaningful absence; null otherwise. */
  offlineRecap: OfflineRecap | null;
  /** Dismiss the welcome-back recap. */
  dismissOfflineRecap: () => void;
  /** Wipe the save and start a fresh game. */
  hardReset: () => void;
  /** Dismiss the launch title menu, unfreezing the sim. */
  dismissTitle: () => void;
  /** Open the Settings overlay (from the gear or the title menu). */
  openSettings: () => void;
  /** Close the Settings overlay. */
  closeSettings: () => void;
  /** Mark one inbox email read (Phase 5.2). Relies on the debounced autosave. */
  markEmailRead: (id: string) => void;
  /** Mark every unread inbox email read. */
  markAllEmailsRead: () => void;
  /** Serialize the current game to a portable save string, or null if no game is loaded. */
  exportSave: () => string | null;
  /** Replace the current game with a pasted save string. Returns false if it isn't a valid save. */
  importSave: (text: string) => boolean;

  // ── Cloud save sync (ADR-009 + ADR-010) ────────────────────────────────────
  /** The current signed-in user, or null when signed out. Populated by `refreshUser`. */
  user: User | null;
  /** True once the initial `refreshUser` has resolved (we know whether the user is signed in). */
  authReady: boolean;
  /** Coarse status of the most recent cloud-sync attempt. */
  syncStatus: 'idle' | 'syncing' | 'ok' | 'error';
  /** Last sync error message (network, server, malformed), or null. */
  syncError: string | null;
  /** Logical clock of the last accepted server push, or null if not yet synced. */
  lastSyncedAt: number | null;
  /** When set, the conflict-chooser modal (ADR-010) is open. */
  pendingConflict: { local: SaveBlob; server: SaveBlob } | null;
  /** Ask the server who we are; sets `user` and `authReady`. Idempotent. */
  refreshUser: () => Promise<void>;
  /** Email magic-link sign-in (ADR-009). The user clicks the link to complete; we just request it. */
  signIn: (email: string) => Promise<void>;
  /** End the session; clears `user`. */
  signOut: () => Promise<void>;
  /**
   * Push the current state to the server (ADR-010). No-op when signed out. On `conflict`, opens
   * the chooser. Used internally by `persist` and surfaced as a manual "Sync now" button too.
   */
  syncToServer: () => Promise<void>;
  /**
   * Resolve an open conflict by choosing the local save (force-promote it past the server's
   * version) or the server save (replace local state with it, then bounce the loop).
   */
  resolveConflict: (choice: 'local' | 'server') => Promise<void>;
  /** Clear the last sync error from the UI. */
  dismissSyncError: () => void;
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
  titleOpen: true,
  settingsOpen: false,
  recap: null,
  eternalReveal: false,
  offlineRecap: null,
  user: null,
  authReady: false,
  syncStatus: 'idle',
  syncError: null,
  lastSyncedAt: null,
  pendingConflict: null,

  init: () => {
    if (get().ready) return;
    const loaded = loadGame(Date.now());
    // A save written mid-descent (inKatabasis) reloads frozen; resume the allocation menu so the
    // player picks up where they left off rather than landing in a torn-down lifetime.
    const phasePatch = loaded.state.inKatabasis === true ? { katabasisPhase: 'menu' as const } : {};
    set({ ...loaded, ...phasePatch, ready: true });
  },

  advance: (deltaSeconds) => {
    const current = get().state;
    if (!current) return;
    // During the descent (menu open), the recap, and the launch title menu the lifetime is frozen
    // — the soul is in trance. Skip the sim entirely so nothing accrues (no suicides, no business
    // gold, no soul minting). The RAF accumulator drains harmlessly through these no-op calls, so
    // there is no catch-up burst when the screen closes.
    if (get().katabasisPhase !== null || get().titleOpen) return;
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
  activateMaleficium: (id) => {
    const current = get().state;
    if (!current) return;
    const result = activateMaleficiumSim(current, id);
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
    // Entering Katabasis tears down the lifetime's productive systems immediately (businesses,
    // toggles, actions, invocations — 02 §6). Sigil bindings PERSIST across the descent: bound souls
    // stay bound and must be released manually (the "unbind all" control or each seal's release).
    // The store then freezes ticking (see `advance`) so nothing accrues while the player allocates.
    // The carry-over rolls + lifetime reset happen at `confirmKatabasis`.
    set({
      state: enterKatabasis(current),
      katabasisPhase: 'menu',
      notice: null,
    });
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

  unbindAll: () => {
    const current = get().state;
    if (!current) return;
    set({ state: unbindAllSigils(current), notice: null });
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
    // Fire-and-forget cloud sync when signed in. Errors land in syncError / syncStatus rather than
    // throwing — local-first stays authoritative (ADR-006), the network round-trip is opportunistic.
    if (get().user !== null && get().pendingConflict === null) {
      void get().syncToServer();
    }
  },

  dismissSignature: () => set({ signature: null }),
  dismissAchievementToast: () => set({ achievementToast: null }),
  dismissNotice: () => set({ notice: null }),
  dismissOfflineRecap: () => set({ offlineRecap: null }),

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
      settingsOpen: false,
    });
  },

  dismissTitle: () => set({ titleOpen: false }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  markEmailRead: (id) => {
    const s = get().state;
    if (s) set({ state: markEmailReadSim(s, id, Date.now()) });
  },

  markAllEmailsRead: () => {
    const s = get().state;
    if (s) set({ state: markAllEmailsReadSim(s, Date.now()) });
  },

  exportSave: () => {
    const { state, saveVersion, deviceId } = get();
    if (!state) return null;
    return serializeSaveBlob(state, saveVersion, deviceId);
  },

  importSave: (text) => {
    let blob;
    try {
      blob = parseSaveBlob(text);
    } catch {
      return false;
    }
    // Mirror the conflict chooser's "adopt this blob" path: write it through, then re-init from disk
    // so the next load reconstructs the state (with offline progression) and resets transient UI.
    writeSaveBlob(blob);
    const loaded = loadGame(Date.now());
    set({
      ...loaded,
      ready: true,
      log: [],
      signature: null,
      notice: null,
      offlineRecap: null,
      recap: null,
      katabasisPhase: loaded.state.inKatabasis === true ? ('menu' as const) : null,
    });
    return true;
  },

  // ── Cloud save sync (ADR-009 + ADR-010) ────────────────────────────────────
  refreshUser: async () => {
    const r = await apiGetCurrentUser();
    if (r.ok) set({ user: r.value, authReady: true });
    else set({ authReady: true, syncError: r.reason, syncStatus: 'error' });
  },

  signIn: async (email) => {
    const r = await requestMagicLink(email);
    if (!r.ok) set({ syncError: r.reason, syncStatus: 'error' });
    else set({ syncError: null });
    // The user clicks the link in their email/log; refreshUser is called on return.
  },

  signOut: async () => {
    const r = await apiSignOut();
    if (!r.ok) {
      set({ syncError: r.reason, syncStatus: 'error' });
      return;
    }
    set({ user: null, syncError: null, lastSyncedAt: null, pendingConflict: null });
  },

  syncToServer: async () => {
    const { state, saveVersion, deviceId, user } = get();
    if (!state) return;
    if (user === null) return; // signed out → local-only, no error
    set({ syncStatus: 'syncing', syncError: null });
    const blob: SaveBlob = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      saveVersion,
      lastTickAt: state.lastTickAt,
      deviceId,
      state: serializeGameState(state),
    };
    const r = await pushSave(blob);
    if (!r.ok) {
      set({ syncStatus: 'error', syncError: r.reason });
      return;
    }
    if (r.value.status === 'conflict') {
      set({
        syncStatus: 'idle',
        pendingConflict: { local: blob, server: r.value.serverSave },
      });
      return;
    }
    // Accepted — the server agrees on this saveVersion; record success.
    set({ syncStatus: 'ok', lastSyncedAt: state.lastTickAt });
  },

  resolveConflict: async (choice) => {
    const pending = get().pendingConflict;
    if (!pending) return;
    if (choice === 'server') {
      // Replace local with the server save and clear the chooser. The next reload (or hardReset's
      // loadGame) would pick up the new localStorage payload; for an immediate effect we write it
      // through and re-init from disk.
      writeSaveBlob(pending.server);
      const loaded = loadGame(Date.now());
      set({
        ...loaded,
        pendingConflict: null,
        log: [],
        signature: null,
        notice: null,
        katabasisPhase: loaded.state.inKatabasis === true ? ('menu' as const) : null,
        syncStatus: 'ok',
        lastSyncedAt: loaded.state.lastTickAt,
      });
      return;
    }
    // 'local': force-promote local past the server. Bump saveVersion above the server's, write
    // through localStorage, and re-push.
    const forcedVersion = Math.max(get().saveVersion, pending.server.saveVersion) + 1;
    set({ saveVersion: forcedVersion, pendingConflict: null });
    const { state, deviceId } = get();
    if (!state) return;
    saveGame(state, forcedVersion, deviceId);
    await get().syncToServer();
  },

  dismissSyncError: () => set({ syncError: null, syncStatus: 'idle' }),
}));
