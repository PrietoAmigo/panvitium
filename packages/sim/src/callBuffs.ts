/**
 * Call-in buffs (docs/PANVITIUM-CALLS-IN.md) — applying a chosen incoming-call option's effects to
 * the game state, plus the timed-modifier bookkeeping the tick and the modifier bundle read.
 *
 * The catalogue of which effects each call carries lives in the web app (`calls-in.data.ts`,
 * presentation + audio), but APPLYING an effect is game logic, so it lives here in the framework-free
 * core (ADR-022). The store, on answer, hands `applyCallEffects` the chosen option's `effects`.
 *
 * Two shapes of effect:
 *   - one-shot state changes applied at answer time (permanent maxInfluence raise, a gold cost, a
 *     reprobate cull/loss);
 *   - `timedMul` buffs, appended to `lifetime.callBuffs` and folded into the modifier bundle while
 *     they last. The tick decays them by `simDelta` (the Hand of Glory convention) and drops them at
 *     expiry — so a buff active at a tick's start lifts that whole tick, exactly like Hand of Glory.
 *
 * Determinism (ADR-011): none of this draws the seeded RNG (the cull is a deterministic percentage,
 * no per-reprobate roll), so answering a call never shifts the save's sequence.
 */
import { mul } from './bignum.js';
import { loseGoldFraction, loseReprobatesFraction, mintSouls } from './population.js';
import { type GameState } from './state.js';

/**
 * The multiplier fields a timed call buff can touch. Several are display-distinct but fold onto ONE
 * modifier: influence "gain" and influence "regeneration" are the same underlying influence rate
 * (the game has a single proportional influence/s), so both map to `influenceRateMul`. The nouns the
 * UI shows come from `strings.phone.callIn.fields`; the fold-target is `CALL_BUFF_TARGET` below.
 *
 * `desidiaGainMul` is the offline Desidia-generation rate (ADR-034) — where the retired
 * offline-progress buff (`doing-nothing`) now lands: a buff to how fast Desidia is banked while
 * away. It only bites offline (the sole time Desidia is generated); the timer, like every buff,
 * decays only while the game ticks (i.e. online), so a buff obtained then held through an absence
 * boosts that absence's accrual.
 */
export type CallBuffField =
  | 'goldGainMul'
  | 'reprobateGenMul'
  | 'influenceGainMul'
  | 'influenceRegenRate'
  | 'indagatioEfficiencyMul'
  | 'playerEfficiencyMul'
  | 'acolyteEfficiencyMul'
  | 'desidiaGainMul';

/** Every buff field, for validation on the wire (an unknown field from a newer save is dropped). */
export const CALL_BUFF_FIELDS: readonly CallBuffField[] = [
  'goldGainMul',
  'reprobateGenMul',
  'influenceGainMul',
  'influenceRegenRate',
  'indagatioEfficiencyMul',
  'playerEfficiencyMul',
  'acolyteEfficiencyMul',
  'desidiaGainMul',
];

/** Narrow an arbitrary string (a deserialized save field) to a known `CallBuffField`. */
export function isCallBuffField(s: string): s is CallBuffField {
  return (CALL_BUFF_FIELDS as readonly string[]).includes(s);
}

/**
 * One mechanical effect of a take-option (docs "-> effects"). The single source for both the
 * displayed explanation (`describeCallInEffects` in the web app) and the applied effect here. A
 * `factor` above 1 reads as a buff, below 1 as a debuff.
 */
export type CallInEffect =
  | { kind: 'timedMul'; field: CallBuffField; factor: number; durationSec: number }
  | { kind: 'permanentMul'; field: 'maxInfluence'; factor: number }
  | { kind: 'spendGoldPct'; pct: number }
  | { kind: 'loseReprobatesPct'; pct: number }
  | { kind: 'killReprobatesPct'; pct: number };

/** An active timed call buff on the lifetime: a multiplier on `field`, decaying to expiry. */
export interface CallBuff {
  readonly field: CallBuffField;
  readonly factor: number;
  /** Seconds of buff left; the tick decays it by `simDelta` and drops it at 0 (Hand of Glory rule). */
  remainingSeconds: number;
  /**
   * The call whose answer granted it (its catalogue id), so the buffs HUD can name the source and
   * read one answer's effects as a single ring. Presentation only: the modifier engine ignores it.
   * Absent on a buff granted before sources were recorded (additive-optional, ADR-023).
   */
  readonly sourceId?: string;
  /** The buff's full length in seconds, the HUD ring's denominator. Absent on the same older buffs. */
  readonly durationSec?: number;
}

/** The per-modifier-field product of the active call buffs — folded into `computeModifiers`. */
export interface CallBuffMultipliers {
  readonly goldRateMul: number;
  readonly reprobateGenerationRateMul: number;
  readonly influenceRateMul: number;
  readonly indagatioEfficiencyMul: number;
  readonly playerEfficiencyMul: number;
  readonly acolyteEfficiencyMul: number;
  readonly desidiaGainMul: number;
}

/** Which modifier-bundle field each buff field multiplies (influence gain/regen share one rate). */
const CALL_BUFF_TARGET: Record<CallBuffField, keyof CallBuffMultipliers> = {
  goldGainMul: 'goldRateMul',
  reprobateGenMul: 'reprobateGenerationRateMul',
  influenceGainMul: 'influenceRateMul',
  influenceRegenRate: 'influenceRateMul',
  indagatioEfficiencyMul: 'indagatioEfficiencyMul',
  playerEfficiencyMul: 'playerEfficiencyMul',
  acolyteEfficiencyMul: 'acolyteEfficiencyMul',
  desidiaGainMul: 'desidiaGainMul',
};

const NEUTRAL_CALL_BUFFS: CallBuffMultipliers = {
  goldRateMul: 1,
  reprobateGenerationRateMul: 1,
  influenceRateMul: 1,
  indagatioEfficiencyMul: 1,
  playerEfficiencyMul: 1,
  acolyteEfficiencyMul: 1,
  desidiaGainMul: 1,
};

/**
 * Aggregate the active call buffs into a per-field product (multiplicative composition, ADR-022).
 * Buffs whose timer has run out are ignored (the tick drops them on the next pass). Returns the
 * neutral bundle when nothing is active, so a save with no buffs behaves exactly as before.
 */
export function callBuffMultipliers(state: GameState): CallBuffMultipliers {
  const buffs = state.lifetime.callBuffs;
  if (buffs.length === 0) return NEUTRAL_CALL_BUFFS;
  const out = { ...NEUTRAL_CALL_BUFFS };
  for (const b of buffs) {
    if (b.remainingSeconds <= 0) continue;
    out[CALL_BUFF_TARGET[b.field]] *= b.factor;
  }
  return out;
}

/** Apply one effect to the state (pure). `sourceId` tags a timed buff with the call it came from. */
function applyEffect(state: GameState, e: CallInEffect, sourceId: string | undefined): GameState {
  switch (e.kind) {
    case 'timedMul': {
      // An inert factor or non-positive duration adds nothing — never store a dead buff.
      if (e.factor === 1 || e.durationSec <= 0) return state;
      const buff: CallBuff = {
        field: e.field,
        factor: e.factor,
        remainingSeconds: e.durationSec,
        durationSec: e.durationSec,
        ...(sourceId !== undefined ? { sourceId } : {}),
      };
      return {
        ...state,
        lifetime: { ...state.lifetime, callBuffs: [...state.lifetime.callBuffs, buff] },
      };
    }
    case 'permanentMul': {
      // Only maxInfluence. A permanent raise to the lifetime cap — "permanent" within the lifetime,
      // since maxInfluence itself resets at Katabasis (the cap is a per-lifetime quantity).
      if (e.factor === 1) return state;
      return {
        ...state,
        lifetime: { ...state.lifetime, maxInfluence: mul(state.lifetime.maxInfluence, e.factor) },
      };
    }
    case 'spendGoldPct':
      return loseGoldFraction(state, e.pct / 100);
    case 'loseReprobatesPct':
      // Lost, not culled: reprobates leave the pool but mint NO souls (only a cull yields souls, one
      // for one — docs "The cull is one for one, and nothing buffs it").
      return loseReprobatesFraction(state, e.pct / 100).state;
    case 'killReprobatesPct': {
      // A cull: each reprobate killed yields exactly one soul (03 §3, 1 person = 1 soul).
      const r = loseReprobatesFraction(state, e.pct / 100);
      return mintSouls(r.state, r.removed);
    }
  }
}

/**
 * Apply a chosen call option's effects to the state, in order (pure). One-shot effects mutate the
 * state immediately; `timedMul` effects append a buff to `lifetime.callBuffs`, each tagged with the
 * answered call's id (`sourceId`) and its full duration, so one answer's buffs sit together in the
 * list and the HUD can read them as one source. Called by the store when the player picks an option
 * on an answered incoming call.
 */
export function applyCallEffects(
  state: GameState,
  effects: readonly CallInEffect[],
  sourceId?: string,
): GameState {
  let working = state;
  for (const e of effects) working = applyEffect(working, e, sourceId);
  return working;
}

/**
 * Record that the player answered (picked up) the incoming call `callId` (pure). Appends the id to the
 * permanent `callsAnswered` list, which the web app's call draw reads to keep an answered once-only
 * call (lore, easter egg) from ever ringing again. Idempotent: an already-recorded id returns the
 * input state unchanged. Draws no RNG (ADR-011).
 */
export function markCallAnswered(state: GameState, callId: string): GameState {
  const answered = state.callsAnswered ?? [];
  if (answered.includes(callId)) return state;
  return { ...state, callsAnswered: [...answered, callId] };
}

/**
 * Decay the active call buffs by `deltaSeconds` and drop any that have expired (pure). Called by the
 * tick after income/dynamics have consumed this tick's buffs, mirroring the Hand of Glory decay: a
 * buff active at the tick's start lifts the whole tick, then falls to expiry. Decays by `simDelta`
 * (Desidia-accelerated), so a buff's total benefit is invariant to time acceleration.
 */
export function advanceCallBuffs(state: GameState, deltaSeconds: number): GameState {
  const buffs = state.lifetime.callBuffs;
  if (buffs.length === 0 || deltaSeconds <= 0) return state;
  const next: CallBuff[] = [];
  for (const b of buffs) {
    const remaining = b.remainingSeconds - deltaSeconds;
    // Spread so the source tag and duration ride along with the decayed timer.
    if (remaining > 0) next.push({ ...b, remainingSeconds: remaining });
  }
  return { ...state, lifetime: { ...state.lifetime, callBuffs: next } };
}
