/**
 * Session lifecycle helpers — pure, framework-free, unit-testable.
 *
 * A new game seeds a fresh GameState; resuming a saved game applies offline progression as a single
 * tick (ADR-004: offline uses the same tick function as online). ADR-004 amended (2026-06-01):
 * offline progression is *uncapped* — the full elapsed wall-clock accrues — and only the Acedia
 * time-compound bonus is bounded, since it is the one term that is exponential in time.
 */
import {
  ACEDIA_OFFLINE_COMPOUND_BASE,
  computeModifiers,
  PLAYER_OFFLINE_EFFICIENCY,
  createInitialState,
  sigilOfflineAccrualWindowMul,
  sigilOfflineActionEfficiencyMul,
  sigilOfflineResourceMul,
  sinLevel,
  sub,
  tick,
  totalReprobates,
  type BigNum,
  type GameState,
} from '@panvitium/sim';

/**
 * The Acedia time-compound bonus `BASE^(offlineMinutes × L²)` is exponential in time, so its
 * `offlineMinutes` input saturates here (the former offline cap). Offline progression itself is no
 * longer capped (ADR-004 amended) — only this one explosive term is held at its seven-day maximum.
 */
export const ACEDIA_COMPOUND_CAP_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** A random seed for a brand-new game; keys the deterministic RNG (ADR-011). */
export function randomSeed(): string {
  return crypto.randomUUID();
}

/** Begin a fresh game. */
export function startNewGame(now: number = Date.now()): GameState {
  return createInitialState(randomSeed(), now);
}

/**
 * Resume a loaded game, applying offline progression over the *full* elapsed wall-clock since the
 * save's last tick (ADR-004 amended: no cap). The elapsed seconds are scaled by two Acedia / 03 §3
 * factors:
 *
 *   - **static**:  `mods.offlineTimeMul` — Glutton drags down (03 §3), Procrastination skill lifts
 *     (03 §1, continuous, intensity-driven). Linear in time, safe unbounded.
 *   - **dynamic**: `BASE ^ (offlineMinutes × acediaLevel²)` (03 §1, per-level, time-dependent). This
 *     is exponential in time, so its `offlineMinutes` input is clamped to ACEDIA_COMPOUND_CAP_SECONDS
 *     — the sloth bonus holds at its seven-day maximum while real time accrues without limit.
 *
 * The modifiers are sampled from the saved state — Glutton-count + Procrastination intensity +
 * Acedia level at descent govern the catchup, not whatever they become mid-catchup.
 */
export function resumeGame(saved: GameState, now: number = Date.now()): GameState {
  const elapsedSeconds = Math.max(0, (now - saved.lastTickAt) / 1000);
  const offlineMul = computeModifiers(saved).offlineTimeMul;
  const acediaLvl = sinLevel(saved.devotion.acedia);
  // Sheet rev 2026-06-12: the compound exponent is in SECONDS (base 1.0000002^(s·L²)), capped at
  // the seven-day saturation point — extended by Foras #31 (+offline accrual window).
  const accrualCapSeconds = ACEDIA_COMPOUND_CAP_SECONDS * sigilOfflineAccrualWindowMul(saved);
  const acediaSeconds = Math.min(elapsedSeconds, accrualCapSeconds);
  const acediaCompound =
    acediaLvl > 0 ? ACEDIA_OFFLINE_COMPOUND_BASE ** (acediaSeconds * acediaLvl * acediaLvl) : 1;
  // Player base offline efficiency (Globals: 0.5×) — the world runs at half rate while away.
  // Every income term takes it, the Thesaurus interest included (ADR-026; the Mercatus Acediae
  // exemption retired with the trades). offlineTimeMul (Procrastination, Dolce, Lemure) and the
  // Acedia level compound stack on top as before.
  const scaled = elapsedSeconds * PLAYER_OFFLINE_EFFICIENCY * offlineMul * acediaCompound;
  // Offline-only sigils (sheet rev 2026-06-12): Sallos #19 gold, Eligos #15 influence, Zepar #16
  // reprobate generation, Marax #21 action-timer advancement. Online ticks pass nothing, so all
  // four apply only to this catch-up.
  const offlineRes = sigilOfflineResourceMul(saved);
  const resumed = tick(saved, scaled, {
    offline: true, // lapse the duration-ramped systems (Panvitium, Aurevora) — see TickDeps.offline
    offlineGoldMul: offlineRes.gold,
    offlineInfluenceMul: offlineRes.influence,
    offlineGenerationMul: offlineRes.generation,
    offlineActionTimeMul: sigilOfflineActionEfficiencyMul(saved),
  }).state;
  // Reconcile the logical clock to wall-clock: the tick advanced `lastTickAt` by the SCALED delta,
  // which diverges from `now` whenever the offline scaling ≠ 1. Leaving it behind would re-count
  // the unconsumed span on the next reload (double gains at 0.5×); leaving it ahead (Acedia
  // compound > 1, the old quirk) silently ate the overshoot. After a resume the player is caught
  // up to now, by definition.
  return { ...resumed, lastTickAt: now };
}

/** Below this, a reload is treated as "still here" and no welcome-back recap is shown. */
export const MIN_OFFLINE_RECAP_SECONDS = 60;

/** What accrued while the player was away — the "welcome back" summary. */
export interface OfflineRecap {
  /** Real wall-clock time away, in seconds (uncapped — ADR-004 amended). */
  awaySeconds: number;
  /** Net gains over the catch-up (souls/gold/influence as BigNum; reprobates as a count). */
  souls: BigNum;
  gold: BigNum;
  influence: BigNum;
  reprobates: number;
}

/**
 * Build the "while you were away" recap by diffing the resumed state against the saved one. Returns
 * null for a short absence (a quick reload, below MIN_OFFLINE_RECAP_SECONDS) or while frozen
 * mid-descent (the Katabasis menu reopens instead of a recap). Pure — reads only the two states and
 * the clock — and intentionally separate from `resumeGame` so the resume path stays single-purpose.
 */
export function offlineRecap(
  saved: GameState,
  resumed: GameState,
  now: number = Date.now(),
): OfflineRecap | null {
  if (resumed.inKatabasis === true) return null;
  const elapsed = Math.max(0, (now - saved.lastTickAt) / 1000);
  if (elapsed < MIN_OFFLINE_RECAP_SECONDS) return null;
  return {
    awaySeconds: elapsed,
    souls: sub(resumed.souls, saved.souls),
    gold: sub(resumed.lifetime.gold, saved.lifetime.gold),
    influence: sub(resumed.lifetime.influence, saved.lifetime.influence),
    reprobates: totalReprobates(resumed) - totalReprobates(saved),
  };
}

/** A forward projection of what would accrue over `windowSeconds` offline from the CURRENT state. */
export interface OfflineProjection {
  /** The window projected over, in seconds. */
  windowSeconds: number;
  /** Net gains over the window (souls/gold/influence as BigNum; reprobates as a count). */
  souls: BigNum;
  gold: BigNum;
  influence: BigNum;
  reprobates: number;
}

/**
 * Project offline generation from the current state, for the Analytics "Offline" preview. Runs the
 * exact `resumeGame` catch-up over `windowSeconds` and diffs the result, so the numbers reflect every
 * offline effect (the reduced base offline rate, offline-only sigils, reprobate dynamics, invocation
 * runners, toggles) without re-deriving any of it. Pure — `resumeGame` returns a fresh state that is
 * discarded here. NOTE: the Acedia sloth compound is time-dependent, so a longer real absence accrues
 * a little faster than a straight multiple of this window; the window is a near-term estimate.
 */
export function offlineProjection(state: GameState, windowSeconds: number): OfflineProjection {
  const resumed = resumeGame(state, state.lastTickAt + windowSeconds * 1000);
  return {
    windowSeconds,
    souls: sub(resumed.souls, state.souls),
    gold: sub(resumed.lifetime.gold, state.lifetime.gold),
    influence: sub(resumed.lifetime.influence, state.lifetime.influence),
    reprobates: totalReprobates(resumed) - totalReprobates(state),
  };
}

/** One active offline modifier, for the Offline tab's "active effects" list. `mul` is the factor. */
export type OfflineBuffKind =
  | 'baseRate'
  | 'offlineTime'
  | 'acediaCompound'
  | 'gold'
  | 'influence'
  | 'generation';
export interface OfflineBuff {
  readonly kind: OfflineBuffKind;
  readonly mul: number;
}

/** The offline scaling factors over a window, plus the active offline effects that produced them. */
export interface OfflineFactors {
  /** Effective sim-seconds the window compresses to: window × 0.5 base × offlineTime × Acedia compound. */
  readonly scaledSeconds: number;
  /** Offline-only per-resource income multipliers (Sallos gold, Eligos influence, Zepar generation). */
  readonly goldMul: number;
  readonly influenceMul: number;
  readonly generationMul: number;
  /** The active offline effects (factors ≠ 1, plus the always-on base rate), for display. */
  readonly buffs: OfflineBuff[];
}

/**
 * The offline scaling for a given away-window, mirroring `resumeGame` exactly (base 0.5× player
 * offline efficiency × Procrastination/Dolce/Lemure `offlineTimeMul` × the Acedia time-compound,
 * whose exponent saturates at the accrual cap). Also surfaces the offline-only resource multipliers
 * and a list of the active offline effects so the Analytics Offline tab can both scale its estimate
 * and explain where the numbers come from. Pure.
 */
export function offlineFactors(state: GameState, windowSeconds: number): OfflineFactors {
  const mods = computeModifiers(state);
  const offlineMul = mods.offlineTimeMul;
  const acediaLvl = sinLevel(state.devotion.acedia);
  const accrualCap = ACEDIA_COMPOUND_CAP_SECONDS * sigilOfflineAccrualWindowMul(state);
  const acediaSeconds = Math.min(windowSeconds, accrualCap);
  const acediaCompound =
    acediaLvl > 0 ? ACEDIA_OFFLINE_COMPOUND_BASE ** (acediaSeconds * acediaLvl * acediaLvl) : 1;
  const scaledSeconds = windowSeconds * PLAYER_OFFLINE_EFFICIENCY * offlineMul * acediaCompound;
  const res = sigilOfflineResourceMul(state);
  const near1 = (x: number): boolean => Math.abs(x - 1) < 1e-9;
  const buffs: OfflineBuff[] = [{ kind: 'baseRate', mul: PLAYER_OFFLINE_EFFICIENCY }];
  if (!near1(offlineMul)) buffs.push({ kind: 'offlineTime', mul: offlineMul });
  if (acediaCompound > 1 + 1e-9) buffs.push({ kind: 'acediaCompound', mul: acediaCompound });
  if (res.gold > 1 + 1e-9) buffs.push({ kind: 'gold', mul: res.gold });
  if (res.influence > 1 + 1e-9) buffs.push({ kind: 'influence', mul: res.influence });
  if (res.generation > 1 + 1e-9) buffs.push({ kind: 'generation', mul: res.generation });
  return {
    scaledSeconds,
    goldMul: res.gold,
    influenceMul: res.influence,
    generationMul: res.generation,
    buffs,
  };
}
