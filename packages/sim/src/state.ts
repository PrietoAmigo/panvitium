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
  /** Equipped maleficia by id; stackable ones may repeat. */
  maleficia: string[];
  /** Maleficia surfaced by Indagatio and available to buy via Emptio. Lost on Katabasis. */
  emptioList: string[];
  /** Toggle actions currently active (e.g. 'panvitium', 'bacchanal'). */
  activeToggles: string[];
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
}

/** The complete gameplay state. */
export interface GameState {
  /** Unspent soul pool — the meta-currency carried across lifetimes. */
  souls: BigNum;
  /** Total Devotion (souls offered, permanent) per Sin. Sin levels are derived from this. */
  devotion: Record<Sin, BigNum>;
  /** Souls currently bound to each sigil (recoverable). Absent key == unbound. */
  sigilBindings: Partial<Record<SigilId, BigNum>>;
  /** Current lifetime. */
  lifetime: LifetimeState;
  /** Serializable RNG state (ADR-011). */
  rngState: RngState;
  /** Logical clock in ms since epoch; advanced by `tick`, reconciled with wall-clock on load. */
  lastTickAt: number;
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
    sigilBindings: {},
    lifetime: {
      gold: ZERO,
      influence: ZERO,
      maxInfluence: bn(BASE_MAX_INFLUENCE),
      reprobates: zeroReprobates(),
      acolytes: [],
      invocations: {},
      maleficia: [],
      emptioList: [],
      activeToggles: [],
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
  };
}

/** Total living reprobates across all subtypes. */
export function totalReprobates(state: GameState): number {
  let sum = 0;
  for (const t of REPROBATE_SUBTYPES) sum += state.lifetime.reprobates[t];
  return sum;
}
