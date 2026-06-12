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
  // Wired with the Mercatus signature clauses; Mercatus Acediae's revenue alone is exempt (the
  // tick dep below divides its term back out). offlineTimeMul (Procrastination, Dolce, Lemure,
  // Mercatus Acediae's per-depth lift) and the Acedia level compound stack on top as before.
  const scaled = elapsedSeconds * PLAYER_OFFLINE_EFFICIENCY * offlineMul * acediaCompound;
  // Offline-only sigils (sheet rev 2026-06-12): Sallos #19 gold, Eligos #15 influence, Zepar #16
  // reprobate generation, Marax #21 action-timer advancement. Online ticks pass nothing, so all
  // four apply only to this catch-up.
  const offlineRes = sigilOfflineResourceMul(saved);
  const resumed = tick(saved, scaled, {
    offlineGoldMul: offlineRes.gold,
    offlineInfluenceMul: offlineRes.influence,
    offlineGenerationMul: offlineRes.generation,
    offlineActionTimeMul: sigilOfflineActionEfficiencyMul(saved),
    offlineEfficiency: PLAYER_OFFLINE_EFFICIENCY,
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
