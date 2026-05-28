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

/** Reprobate subtypes (03 §3). `reprobate` is the unconverted default. */
export type ReprobateSubtype =
  | 'reprobate'
  | 'glutton'
  | 'degenerate'
  | 'gambler'
  | 'nihilist'
  | 'choleric'
  | 'husk'
  | 'celebrity'
  | 'sigma';

export const REPROBATE_SUBTYPES: readonly ReprobateSubtype[] = [
  'reprobate',
  'glutton',
  'degenerate',
  'gambler',
  'nihilist',
  'choleric',
  'husk',
  'celebrity',
  'sigma',
] as const;

/**
 * The "themed" subtype for each Cardinal Sin (03 §3): a Gula business biases conversion toward
 * Gluttons, an Ira business toward Cholerics, and so on. Used by the conversion-bias draw and by
 * the per-subtype Vitium Mercatura gold boost in `computeModifiers`.
 */
export const SUBTYPE_OF_SIN: Record<Sin, ReprobateSubtype> = {
  gula: 'glutton',
  luxuria: 'degenerate',
  avaritia: 'gambler',
  tristitia: 'nihilist',
  ira: 'choleric',
  acedia: 'husk',
  vanagloria: 'celebrity',
  superbia: 'sigma',
} as const;

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
 * A Vitium Mercatura business build in progress (03 §2.3). Builds live in their own queue
 * separate from `actionQueue` — they don't occupy the player slot and multiple can be in flight
 * at once. They cannot be delegated to acolytes or invocations.
 */
export interface BuildTimer {
  readonly businessId: string;
  remainingSeconds: number;
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

/**
 * A Vitium conversion source — the unit that feeds `biasedSubtype` and the conversion pool
 * (02 §9). Both Vitium Mercatura businesses and active Vitium Compositum toggles produce these;
 * the dynamics layer concatenates them so conversion bias reflects the player's whole Vitium
 * footprint, not Sin level (per the design correction). `conversionPerSecond` is the source's
 * throughput; `subtypeBias` is its per-subtype weighting (need not sum to 1 — renormalized at
 * draw).
 */
export interface VitiumConversionSource {
  readonly conversionPerSecond: number;
  readonly subtypeBias: Partial<Record<ReprobateSubtype, number>>;
}

/** State scoped to a single lifetime — reset (mostly) on Katabasis. */
export interface LifetimeState {
  gold: BigNum;
  influence: BigNum;
  maxInfluence: BigNum;
  /** Living reprobate counts by subtype. Plain integers (1 person = 1 soul). */
  reprobates: Record<ReprobateSubtype, number>;
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
   * Owned Vitium Mercatura businesses by id (03 §2.3). Multiple owned copies stack — fungible
   * (no per-instance state). Empty by default.
   */
  businesses: Record<string, number>;
  /**
   * In-flight Vitium Mercatura builds. Multiple builds run concurrently and do NOT occupy the
   * player's action slot (02 §3 / user correction). Empty by default.
   */
  buildQueue: BuildTimer[];
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
   * Conversion pool (02 §9 / 03 §2.3). Vitium Mercatura businesses (and later Vitium Compositum
   * toggles, Panvitium) contribute conversion attempts per second. While the pool ≥ 1, one
   * unconverted reprobate is converted to a subtype picked by `biasedSubtype` (which weights by
   * the active Vitium sources). If no unconverted reprobate exists when the pool crosses, the
   * pool is left intact so progress isn't wasted.
   */
  conversionPool: number;
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
}

/** The complete gameplay state. */
export interface GameState {
  /** Unspent soul pool — the meta-currency carried across lifetimes. */
  souls: BigNum;
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
   * Number of Katabases on which Erinyes was pending — each one stacks a ×2 player-efficiency
   * multiplier folded in by `computeModifiers`. Permanent, carried across lifetimes; only ever
   * increments. Additive-optional on the wire (ADR-023), defaults to 0.
   */
  erinyesEfficiencyStacks?: number;
  /**
   * True while the player is mid-descent — the Katabasis menu is open and allocation is underway
   * (02 §6). The lifetime is frozen: `tick` runs no simulation when this is set, so nothing accrues
   * online OR offline (a reload mid-descent resumes the menu rather than fast-forwarding a torn-down
   * lifetime). Set by `enterKatabasis`, cleared by `commitKatabasis`. Additive-optional; defaults to
   * false (ADR-023).
   */
  inKatabasis?: boolean;
}

function zeroReprobates(): Record<ReprobateSubtype, number> {
  const out = {} as Record<ReprobateSubtype, number>;
  for (const t of REPROBATE_SUBTYPES) out[t] = 0;
  return out;
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
    devotion: zeroDevotion(),
    eternalDevotion: ZERO,
    sigilBindings: {},
    lifetime: {
      gold: ZERO,
      influence: ZERO,
      maxInfluence: bn(BASE_MAX_INFLUENCE),
      reprobates: zeroReprobates(),
      acolytes: [],
      invocations: {},
      invocationRunners: {},
      invocationDurations: {},
      maleficia: [],
      emptioList: [],
      activeToggles: [],
      toggleDurations: {},
      actionQueue: [],
      businesses: {},
      buildQueue: [],
      generationPool: 0,
      suicidePool: 0,
      murderPool: 0,
      conversionPool: 0,
    },
    rngState: hashSeed(seed),
    lastTickAt: now,
    startedAt: now,
    achievements: [],
    katabasisCount: 0,
  };
}

/** Total living reprobates across all subtypes. */
export function totalReprobates(state: GameState): number {
  let sum = 0;
  for (const t of REPROBATE_SUBTYPES) sum += state.lifetime.reprobates[t];
  return sum;
}
