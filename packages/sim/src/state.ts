/**
 * GameState — the complete gameplay state the simulation operates on (02 §9).
 *
 * This is the gameplay core only. The save *envelope* (schemaVersion, saveVersion,
 * lastTickAt-as-wall-clock, deviceId — ADR-010) wraps this and lives in @panvitium/shared.
 *
 * Unbounded values are BigNum (ADR-005). Naturally-bounded integer counts are plain numbers.
 * Derived quantities (Sin *levels* from Devotion totals, Skill *intensities*, max acolytes
 * from influence) are computed on demand, not stored, so they can never drift from their source.
 */
import { type BigNum, bn, ZERO } from './bignum.js';
import { BASE_MAX_INFLUENCE } from './constants.js';
import { hashSeed, type RngState } from './rng.js';

/** The eight Cardinal Sins, keyed by their Latin name (03 §1). */
export type Sin =
  | 'gula'
  | 'luxuria'
  | 'avaritia'
  | 'tristitia'
  | 'ira'
  | 'acedia'
  | 'vanagloria'
  | 'superbia';

export const SINS: readonly Sin[] = [
  'gula',
  'luxuria',
  'avaritia',
  'tristitia',
  'ira',
  'acedia',
  'vanagloria',
  'superbia',
] as const;

/**
 * Reprobates are a single undifferentiated pool (03 §3). Subtypes and the Vitium conversion
 * mechanic were removed: every reprobate is identical, counted by one integer on the lifetime.
 */

/** Sigils are referenced by their canonical Goetia number, 1..72. */
export type SigilId = number;

/** A pending or running timed action (Opera). Resolves when `remainingSeconds` hits 0. */
export interface ActionTimer {
  /** Identifier of the action being performed (e.g. 'suasio', 'caedis'). */
  readonly actionId: string;
  /** Seconds of work left, given the combined efficiency assigned to it. */
  remainingSeconds: number;
  /** Action-specific payload — e.g. the maleficium id targeted by an Emptio purchase. */
  readonly target?: string;
}

/**
 * An acolyte and the action it is currently delegated to (02 §10). When `assignedAction` is null
 * the acolyte is idle. When set, the acolyte runs the action in its own autonomous channel; the
 * tick decrements `remainingSeconds` and, on reaching 0, resolves the action and immediately
 * starts the next cycle (delegation loops until the player un-assigns).
 *
 * `remainingSeconds` is additive-optional on the wire (per ADR-023): a save predating acolyte
 * timers loads with the timer at null, and a freshly-assigned acolyte initialises it from the
 * action's catalog duration divided by the acolyte's efficiency.
 */
export interface Acolyte {
  readonly id: number;
  assignedAction: string | null;
  /** Seconds left in the current cycle; null when idle or between cycles waiting on resources. */
  remainingSeconds: number | null;
}

/** State scoped to a single lifetime — reset (mostly) on Katabasis. */
export interface LifetimeState {
  gold: BigNum;
  influence: BigNum;
  maxInfluence: BigNum;
  /** Living reprobates — a single undifferentiated pool. Plain integer (1 person = 1 soul). */
  reprobates: number;
  acolytes: Acolyte[];
  /** Active invocations as type -> count (most stack; the apex ones are capped at 1). */
  invocations: Record<string, number>;
  /**
   * Autonomous-channel runners for invocations that run an action in the background (02 §3) —
   * keyed by invocation id, value is the remaining seconds on the current cycle. The Familiar runs
   * Indagatio here. This does NOT occupy the player's action slot. Lazily started/cleared by the
   * tick from the active-invocation set; additive-optional on the wire (ADR-023), empty by default.
   */
  invocationRunners: Record<string, number>;
  /**
   * Seconds each duration-scaled invocation has been active, keyed by invocation id (mirrors
   * `toggleDurations`). Used by apex invocations whose effect ramps with how long they have been
   * summoned — Aurevora's exponential gold-drain ↔ rising-efficiency (03 §2.4). Accrued each tick
   * while active, cleared on dispel and on Katabasis. Additive-optional on the wire (ADR-023),
   * empty by default.
   */
  invocationDurations: Record<string, number>;
  /** Equipped maleficia by id; stackable ones may repeat. */
  maleficia: string[];
  /** Maleficia surfaced by Indagatio and available to buy via Emptio. Lost on Katabasis. */
  emptioList: string[];
  /**
   * Rolled Emptio price (gold) per surfaced maleficium id (Maleficia sheet: `Randint(band)` per
   * rarity, rolled at discovery so the price is fixed before purchase). Additive-optional (ADR-023);
   * Emptio falls back to the catalog `cost` for any id without a rolled price.
   */
  maleficiaPrices: Record<string, number>;
  /** Toggle actions currently active (e.g. 'panvitium', 'bacchanal'). */
  activeToggles: string[];
  /**
   * Seconds each active toggle has been running, keyed by toggle id. Used by toggles whose cost
   * ramps with duration (Panvitium's exponential upkeep). Survivors accrue, deactivated ones are
   * cleared. Additive-optional on the wire (ADR-023); empty by default.
   */
  toggleDurations: Record<string, number>;
  /** In-flight timed actions. */
  actionQueue: ActionTimer[];
  /**
   * Player-driven actions the player has set to AUTO-REPEAT (02 §3: the "toggle" variant a one-shot
   * rite gains once its Sin reaches the sheet's toggle level). While an id is here the tick keeps a
   * cycle of it running in the player's own slot — re-queuing it on completion and retrying after a
   * stall — until the player toggles it off (or it can no longer be afforded). Because only one
   * player-driven rite occupies the slot at a time (02 §3), at most one non-Indagatio id is active
   * here. Reset on Katabasis with the rest of the lifetime. Additive-optional on the wire (ADR-023);
   * empty by default — old saves load with nothing auto-repeating.
   *
   * Online-only: like any player-slot rite, an auto-repeating one advances only while the game is
   * open (the tick re-queues at most one cycle per tick, including the single offline catch-up tick).
   * Unattended progress is what acolyte delegation and invocation runners are for — they loop and
   * catch up across a long absence; the player's own slot does not.
   */
  autoRepeat: string[];
  /**
   * Mercatus depths (Vitium Mercatura rework): one trade per Cardinal Sin, each a single integer
   * depth ≥ 0 (spec §1). Sparse — an absent Sin means depth 0, and the serializer omits the whole
   * record when empty. Reset to {} on Katabasis after the liquidation refund.
   */
  mercatusDepths: Partial<Record<Sin, number>>;
  /**
   * Reprobate-dynamics accrual pools (02 §9). Each tick the per-second rate × deltaSeconds is
   * added to the matching pool; while the pool ≥ 1 it is decremented and an integer event applied
   * (a birth / suicide / murder). Pools persist across ticks and save/load so fractional progress
   * is never lost. Always defined at runtime (default 0); on the wire they are additive-optional
   * fields per ADR-023 — old saves load with the pools at 0.
   */
  generationPool: number;
  suicidePool: number;
  murderPool: number;
  /**
   * Seconds remaining on the Hand of Glory buff (+100% reprobate generation while > 0; Maleficia
   * sheet). Refilled by activating a Hand of Glory; decays in real time each tick. Additive-optional
   * (ADR-023), default 0.
   */
  handOfGloryRemaining: number;
  /**
   * Active Defixio curse (Maleficia), or absent when none runs. Cast single-use; it culls the
   * reprobate pool at eᵗ per second (`elapsed` = seconds the curse has run) until the pool is
   * empty, then the field is dropped. Additive-optional (ADR-023); one curse at a time.
   */
  defixio?: { elapsed: number };
  /**
   * Apex-invocation pending Katabasis modifiers (03 §2.4). Set the moment Erinyes/Morpheus is
   * summoned; consumed by `commitKatabasis` to override the carry-over rolls (Erinyes zeroes the
   * gold + maleficia fractions and stacks a permanent player-efficiency double; Morpheus maxes both
   * and preserves the Emptio list). Erinyes's invoke clears any prior `pendingMorpheus` and sets
   * `morpheusLockedOut`. All additive-optional on the wire; absent / false round-trips identically
   * to a pre-feature save (ADR-023).
   */
  pendingErinyes?: boolean;
  pendingMorpheus?: boolean;
  /** Set by an Erinyes invoke; blocks any further Morpheus invoke for the rest of the lifetime. */
  morpheusLockedOut?: boolean;
  /**
   * The impact-feedback inbox (Phase 5.2): emails delivered as the in-world consequences of the
   * player's actions accrue here, newest appended last. Each entry records which catalog email was
   * delivered, when, and when it was read (null = unread). Mail history is permanent — the inbox
   * persists across Katabasis (it is never wiped), so `deliverEmails`' per-id dedup also holds across
   * lifetimes and a once-earned beat never replays on a later return. Always defined at runtime
   * (default []); additive-optional on the wire per ADR-023 — pre-inbox saves load with an empty inbox.
   */
  inbox: ReceivedEmail[];
  /**
   * Arm timestamps (wall-clock ms) for the timed/random impact-feedback emails (05 §triggers):
   * the moment each delayed email's precondition FIRST held. A timed email fires `delaySeconds`
   * after its arm; a random newsletter fires after a deterministic offset past it. Keyed by email id;
   * an absent key means "not yet eligible". Persists across Katabasis with the inbox, so a mid-arming
   * email keeps its schedule. Always defined at runtime ({}); additive-optional on the wire (ADR-023).
   */
  emailArmedAt: Record<string, number>;
  /**
   * True once the player has sent the threat reply to Fausto Cescru #1 (05, the adversary). Closes
   * the "friendly" branch — Fausto #2/#3 never fire — and routes the arc straight to #4/#5. Persists
   * across Katabasis with the inbox it gates (Fausto #1 stays delivered, so the branch stays closed).
   * Additive-optional (ADR-023); absent ≡ the friendly branch is still open.
   */
  flagFCThreatSent?: boolean;
  /**
   * True while Fausto Cescru #4's curse is in force (05): set on its delivery, cleared by deleting
   * that email. While true, reprobate generation, influence gain and gold gain are each ×0.33
   * (folded in by `computeModifiers`). Travels with the letter that carries it — the inbox persists
   * across Katabasis, so the curse holds until the email is deleted ("as long as these words remain").
   * Additive-optional (ADR-023); absent ≡ no curse.
   */
  flagFaustoCurse?: boolean;
}

/** One delivered email in the player's inbox (Phase 5.2). Content (sender/subject/body) is keyed by
 * `id` in the strings catalog; this record is just the delivery + read bookkeeping. */
export interface ReceivedEmail {
  id: string;
  /** Wall-clock ms when the email was delivered (the tick's lastTickAt). */
  receivedAt: number;
  /** Wall-clock ms when first opened, or null while unread. */
  readAt: number | null;
  /**
   * Index of the reply the player chose (into the catalog email's `replies`), or null/absent if the
   * message is unanswered. Persisted so a reply (and its eventual effect) sticks across reloads.
   * Additive-optional on the wire (ADR-023): pre-reply saves load with every email unanswered.
   */
  answeredReply?: number | null;
  /**
   * True once the player deletes the email. A *flag*, not a removal: `deliverEmails` dedups by inbox
   * id, so dropping the entry would free the id to re-trigger. Deleted mail is hidden in the client
   * and skipped by `unreadCount`. Additive-optional (ADR-023): absent → not deleted.
   */
  deleted?: boolean;
}

/** The complete gameplay state. */
export interface GameState {
  /** Unspent soul pool — the meta-currency carried across lifetimes. */
  souls: BigNum;
  /**
   * Monotonic, never-decreasing running total of every soul ever MINTED across the whole game
   * (spans lifetimes) — bumped wherever souls are minted (`mintSouls`, the Panvitium harvest), never
   * decremented by spending. Drives the parish / adversary soul-threshold emails (05). Permanent.
   * Additive-optional on the wire (ADR-023); old saves default it to the current `souls`.
   */
  totalSoulsObtained: BigNum;
  /** Total Devotion (souls offered, permanent) per Sin. Sin levels are derived from this. */
  devotion: Record<Sin, BigNum>;
  /**
   * Cumulative souls offered to the Eternal Sin (03 §8). Offerable only once every Cardinal Sin
   * is at MAX_SIN_LEVEL; reaching ETERNAL_SIN_THRESHOLD reveals Semet. Permanent, carried across
   * lifetimes. Additive-optional on the wire (ADR-023); ZERO by default.
   */
  eternalDevotion: BigNum;
  /** Souls currently bound to each sigil (recoverable). Absent key == unbound. */
  sigilBindings: Partial<Record<SigilId, BigNum>>;
  /** Current lifetime. */
  lifetime: LifetimeState;
  /** Serializable RNG state (ADR-011). */
  rngState: RngState;
  /** Logical clock in ms since epoch; advanced by `tick`, reconciled with wall-clock on load. */
  lastTickAt: number;
  /**
   * Logical clock at which this game was first created (03 §8). `lastTickAt - startedAt` is the
   * total game runtime — the score shown on the Eternal Sin reveal. Never changes after creation.
   * Additive-optional on the wire; old saves default it to their `lastTickAt` (runtime starts now).
   */
  startedAt: number;
  /**
   * Ids of achievements unlocked so far (03 §7). Permanent, carried across lifetimes; an unlock is
   * one-way. Additive-optional on the wire (ADR-023); old saves default to an empty list and
   * re-evaluate against current state on the next tick.
   */
  achievements: string[];
  /**
   * Number of Katabases completed. Permanent. Used by the "First Descent" achievement and as light
   * telemetry. Additive-optional; defaults to 0.
   */
  katabasisCount: number;
  /**
   * Set true once the player sends Father Tom Brennan #2's cruel reply (05, the Church). Reroutes
   * the Church/adversary arc: it gates the Bishop Crane / Father Stahl branches and the late
   * Fausto #5 / Parish #3 beats. Permanent (a game-long story flag), carried across lifetimes.
   * Additive-optional on the wire (ADR-023); absent ≡ false.
   */
  flagFatherMad?: boolean;
  /**
   * Set true once the player agrees to "meet and explain" to Reuben Marsh (05, the madman) — a reply
   * that also mints one soul. Stops the later Reuben letters and feeds the Fausto #5 gate. Permanent
   * (a game-long story flag), carried across lifetimes. Additive-optional (ADR-023); absent ≡ false.
   */
  flagReubenDead?: boolean;
  /**
   * Number of Katabases on which Erinyes was pending — each one stacks a ×2 player-efficiency
   * multiplier folded in by `computeModifiers`. Permanent, carried across lifetimes; only ever
   * increments. Additive-optional on the wire (ADR-023), defaults to 0.
   */
  erinyesEfficiencyStacks?: number;
  /**
   * Set true once the Doppelgänger jumpscare has fired (the one-time scare that replaces the player's
   * next interaction the first time a Doppelgänger is bound and the player enters the Studio). Purely
   * presentational bookkeeping owned by the web app: it gates the scare to a single occurrence ever.
   * Permanent (carried across lifetimes — a once-seen scare never replays), additive-optional on the
   * wire (ADR-023); absent ≡ false.
   */
  flagDoppelgaengerSeen?: boolean;
  /**
   * True while the player is mid-descent — the Katabasis menu is open and allocation is underway
   * (02 §6). The lifetime is frozen: `tick` runs no simulation when this is set, so nothing accrues
   * online OR offline (a reload mid-descent resumes the menu rather than fast-forwarding a torn-down
   * lifetime). Set by `enterKatabasis`, cleared by `commitKatabasis`. Additive-optional; defaults to
   * false (ADR-023).
   */
  inKatabasis?: boolean;
}

function zeroDevotion(): Record<Sin, BigNum> {
  const out = {} as Record<Sin, BigNum>;
  for (const s of SINS) out[s] = ZERO;
  return out;
}

/**
 * Create a fresh starting state for a brand-new game.
 *
 * `seed` keys the RNG (ADR-011). `now` is the starting logical clock (defaults to wall-clock).
 * Starting resource amounts are placeholders pending the economy constants; treat as tuning inputs.
 */
export function createInitialState(seed: string, now: number = Date.now()): GameState {
  return {
    souls: ZERO,
    totalSoulsObtained: ZERO,
    devotion: zeroDevotion(),
    eternalDevotion: ZERO,
    sigilBindings: {},
    lifetime: {
      gold: ZERO,
      influence: ZERO,
      maxInfluence: bn(BASE_MAX_INFLUENCE),
      reprobates: 0,
      acolytes: [],
      invocations: {},
      invocationRunners: {},
      invocationDurations: {},
      maleficia: [],
      emptioList: [],
      maleficiaPrices: {},
      activeToggles: [],
      toggleDurations: {},
      actionQueue: [],
      autoRepeat: [],
      mercatusDepths: {},
      generationPool: 0,
      suicidePool: 0,
      murderPool: 0,
      handOfGloryRemaining: 0,
      inbox: [],
      emailArmedAt: {},
    },
    rngState: hashSeed(seed),
    lastTickAt: now,
    startedAt: now,
    achievements: [],
    katabasisCount: 0,
  };
}

/** Total living reprobates (the single pool). */
export function totalReprobates(state: GameState): number {
  return state.lifetime.reprobates;
}
