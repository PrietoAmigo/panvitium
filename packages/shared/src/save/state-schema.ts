/**
 * The JSON-safe ("wire") form of the sim's GameState, plus the bridge between the runtime
 * state (BigNum = Decimal) and this serialized form (BigNum = string). break_infinity's string
 * form round-trips exactly, so no precision is lost across save/load (ADR-005/006/010).
 *
 * GameState itself lives in @panvitium/sim; this module owns how it crosses the wire.
 */
import { z } from 'zod';
import {
  type GameState,
  type Sin,
  type SigilId,
  type BigNum,
  SINS,
  serializeBigNum,
  deserializeBigNum,
} from '@panvitium/sim';

/** A BigNum on the wire: break_infinity's exact string form (e.g. "0", "1.5e300"). */
const bigNumString = z.string().min(1);

/** Build a Zod object schema with one entry per key in `keys`, all sharing `value`. */
function recordOf<K extends string, V extends z.ZodTypeAny>(
  keys: readonly K[],
  value: V,
): z.ZodObject<Record<K, V>> {
  const shape = {} as Record<K, V>;
  for (const k of keys) shape[k] = value;
  return z.object(shape);
}

const acolyteSchema = z.object({
  id: z.number().int(),
  assignedAction: z.string().nullable(),
  /**
   * Cycle timer for a delegated action (02 §10). Additive-optional per ADR-023: old saves
   * without this field load with the timer at null (idle). Serialized only when non-null to
   * keep the wire compact.
   */
  remainingSeconds: z.number().nullable().optional(),
});

const actionTimerSchema = z.object({
  actionId: z.string(),
  remainingSeconds: z.number(),
  target: z.string().optional(),
});

const inboxEntrySchema = z.object({
  id: z.string(),
  receivedAt: z.number().int(),
  readAt: z.number().int().nullable(),
  // Reply/delete bookkeeping. Additive-optional (ADR-023): absent on pre-reply saves.
  answeredReply: z.number().int().nullable().optional(),
  deleted: z.boolean().optional(),
});

const lifetimeSchema = z.object({
  gold: bigNumString,
  influence: bigNumString,
  maxInfluence: bigNumString,
  reprobates: z.number().int().nonnegative(),
  acolytes: z.array(acolyteSchema),
  invocations: z.record(z.string(), z.number().int().nonnegative()),
  // Autonomous-runner timers (Familiar's background Indagatio, 02 §3): invocation id -> remaining
  // seconds. Additive-optional (ADR-023): absent in old saves → {} at runtime; omitted when empty.
  invocationRunners: z.record(z.string(), z.number().nonnegative()).optional(),
  // Per-invocation active-duration counters for duration-scaled apex effects (Aurevora's ramp,
  // 03 §2.4). Additive-optional (ADR-023): absent in old saves → {} at runtime; omitted when empty.
  invocationDurations: z.record(z.string(), z.number().nonnegative()).optional(),
  maleficia: z.array(z.string()),
  emptioList: z.array(z.string()),
  maleficiaPrices: z.record(z.string(), z.number().int().nonnegative()).optional(),
  activeToggles: z.array(z.string()),
  // Per-toggle active-duration counters for duration-scaled cost (Panvitium). Additive-optional
  // (ADR-023): absent in old saves → {} at runtime; omitted from the wire when empty.
  toggleDurations: z.record(z.string(), z.number().nonnegative()).optional(),
  actionQueue: z.array(actionTimerSchema),
  // Player rites set to auto-repeat (02 §3). Additive-optional (ADR-023): absent → [] at runtime;
  // omitted from the wire when empty.
  autoRepeat: z.array(z.string()).optional(),
  // Reprobate-dynamics accrual pools (02 §9). Optional for back-compat with v1 saves predating
  // their existence — when absent, the deserializer defaults each to 0 (ADR-023). New saves
  // round-trip them when non-zero, omit them when 0 to keep wire size minimal for fresh games.
  generationPool: z.number().nonnegative().optional(),
  suicidePool: z.number().nonnegative().optional(),
  murderPool: z.number().nonnegative().optional(),
  // Vitium Mercatura — Mercatus depths (rework spec §4): one integer depth per Cardinal Sin,
  // sparse (absent Sin ≡ depth 0). Optional; omitted when empty so a fresh game's wire form stays
  // minimal. (The legacy `businesses` / `buildQueue` fields were REMOVED in schema v3; v2 saves
  // are migrated by `v2-to-v3.ts` — gold credit + drop.)
  mercatusDepths: z.record(z.string(), z.number().int().nonnegative()).optional(),
  handOfGloryRemaining: z.number().nonnegative().optional(),
  // Impact-feedback inbox (Phase 5.2). Additive-optional (ADR-023): absent → empty inbox at load.
  inbox: z.array(inboxEntrySchema).optional(),
  // Email arm timers (05): email id -> wall-clock ms its delayed trigger first became eligible.
  // Additive-optional (ADR-023): absent → {} at runtime; omitted from the wire when empty.
  emailArmedAt: z.record(z.string(), z.number().int()).optional(),
  // Fausto-arc per-lifetime flags (05): the threat reply was sent (#2/#3 suppressed), and the #4
  // curse is in force. Additive-optional (ADR-023): absent ≡ false; omitted from the wire when false.
  flagFCThreatSent: z.boolean().optional(),
  flagFaustoCurse: z.boolean().optional(),
  defixio: z.object({ elapsed: z.number().nonnegative() }).optional(),
  // Apex Katabasis-modifier pending flags + Morpheus lockout (03 §2.4). Additive-optional
  // (ADR-023): absent in old saves → false at runtime; omitted when false.
  pendingErinyes: z.boolean().optional(),
  pendingMorpheus: z.boolean().optional(),
  morpheusLockedOut: z.boolean().optional(),
});

/** Zod schema for the serialized gameplay state. */
export const serializedGameStateSchema = z.object({
  souls: bigNumString,
  // Monotonic lifetime-spanning souls-minted tally (05 soul-threshold emails). Additive-optional
  // (ADR-023): absent → defaults to `souls` at load (the best lower bound for a pre-feature save).
  totalSoulsObtained: bigNumString.optional(),
  devotion: recordOf(SINS, bigNumString),
  // Cumulative Eternal-Sin devotion (03 §8). Additive-optional (ADR-023): absent → ZERO at load.
  eternalDevotion: bigNumString.optional(),
  // sigil id -> bound souls. JSON object keys are strings; parsed back to numbers on load.
  sigilBindings: z.record(z.string(), bigNumString),
  lifetime: lifetimeSchema,
  rngState: z.number().int(),
  lastTickAt: z.number().int(),
  // Game-start clock for the runtime score. Additive-optional; old saves default to lastTickAt.
  startedAt: z.number().int().optional(),
  // Unlocked achievement ids (03 §7). Additive-optional; old saves default to []. Re-evaluated
  // against current state on the next tick, so absence never loses an already-earned unlock.
  achievements: z.array(z.string()).optional(),
  // Completed-Katabasis counter. Additive-optional; old saves default to 0.
  katabasisCount: z.number().int().nonnegative().optional(),
  // Permanent story flags (05): Father Tom turned against the player, Reuben Marsh resolved.
  // Additive-optional (ADR-023): absent ≡ false; omitted from the wire when false.
  flagFatherMad: z.boolean().optional(),
  flagReubenDead: z.boolean().optional(),
  // Permanent ×2-per-stack player-efficiency multiplier from past Erinyes commits (03 §2.4).
  // Additive-optional (ADR-023); old saves default to 0.
  erinyesEfficiencyStacks: z.number().int().nonnegative().optional(),
  // True while mid-descent (menu open, lifetime frozen). Additive-optional; defaults to false.
  inKatabasis: z.boolean().optional(),
});

/** The JSON-safe form of GameState. */
export type SerializedGameState = z.infer<typeof serializedGameStateSchema>;

/** Narrow a wire mercatusDepths record to the eight Sin keys (drops anything else). */
function pickSinDepths(depths: Record<string, number> | undefined): Partial<Record<Sin, number>> {
  if (!depths) return {};
  const out: Partial<Record<Sin, number>> = {};
  for (const sin of SINS) {
    const d = depths[sin];
    if (typeof d === 'number' && d > 0) out[sin] = d;
  }
  return out;
}

/** Convert a runtime GameState into its JSON-safe form (BigNum -> string). */
export function serializeGameState(state: GameState): SerializedGameState {
  const devotion = {} as Record<Sin, string>;
  for (const s of SINS) devotion[s] = serializeBigNum(state.devotion[s]);

  const sigilBindings: Record<string, string> = {};
  for (const [id, bound] of Object.entries(state.sigilBindings)) {
    if (bound !== undefined) sigilBindings[id] = serializeBigNum(bound);
  }

  return {
    souls: serializeBigNum(state.souls),
    // Monotonic souls-minted tally (05): omit when zero so fresh saves keep the prior wire form.
    ...(state.totalSoulsObtained.gt(0)
      ? { totalSoulsObtained: serializeBigNum(state.totalSoulsObtained) }
      : {}),
    devotion,
    // Omit eternalDevotion when zero so fresh / pre-Eternal saves keep the prior wire form.
    ...(state.eternalDevotion.gt(0)
      ? { eternalDevotion: serializeBigNum(state.eternalDevotion) }
      : {}),
    sigilBindings,
    lifetime: {
      gold: serializeBigNum(state.lifetime.gold),
      influence: serializeBigNum(state.lifetime.influence),
      maxInfluence: serializeBigNum(state.lifetime.maxInfluence),
      reprobates: state.lifetime.reprobates,
      acolytes: state.lifetime.acolytes.map((a) => ({
        id: a.id,
        assignedAction: a.assignedAction,
        // ADR-023: omit remainingSeconds when null so fresh-game wire matches the pre-acolyte
        // form. When set, include it verbatim so a re-loaded save resumes mid-cycle.
        ...(a.remainingSeconds === null ? {} : { remainingSeconds: a.remainingSeconds }),
      })),
      invocations: { ...state.lifetime.invocations },
      ...(Object.keys(state.lifetime.invocationRunners).length > 0
        ? { invocationRunners: { ...state.lifetime.invocationRunners } }
        : {}),
      ...(Object.keys(state.lifetime.invocationDurations).length > 0
        ? { invocationDurations: { ...state.lifetime.invocationDurations } }
        : {}),
      maleficia: [...state.lifetime.maleficia],
      emptioList: [...state.lifetime.emptioList],
      ...(Object.keys(state.lifetime.maleficiaPrices).length > 0
        ? { maleficiaPrices: { ...state.lifetime.maleficiaPrices } }
        : {}),
      activeToggles: [...state.lifetime.activeToggles],
      ...(Object.keys(state.lifetime.toggleDurations).length > 0
        ? { toggleDurations: { ...state.lifetime.toggleDurations } }
        : {}),
      actionQueue: state.lifetime.actionQueue.map((t) =>
        t.target === undefined
          ? { actionId: t.actionId, remainingSeconds: t.remainingSeconds }
          : { actionId: t.actionId, remainingSeconds: t.remainingSeconds, target: t.target },
      ),
      // Auto-repeat set: omit when empty (additive-optional per ADR-023).
      ...(state.lifetime.autoRepeat.length > 0
        ? { autoRepeat: [...state.lifetime.autoRepeat] }
        : {}),
      // Only emit pool fields when non-zero (additive-optional per ADR-023): keeps fresh-game
      // saves identical to their pre-pool wire form, and only spends bytes when there's progress.
      ...(state.lifetime.generationPool > 0
        ? { generationPool: state.lifetime.generationPool }
        : {}),
      ...(state.lifetime.suicidePool > 0 ? { suicidePool: state.lifetime.suicidePool } : {}),
      ...(state.lifetime.murderPool > 0 ? { murderPool: state.lifetime.murderPool } : {}),
      ...(state.lifetime.handOfGloryRemaining > 0
        ? { handOfGloryRemaining: state.lifetime.handOfGloryRemaining }
        : {}),
      ...(state.lifetime.inbox.length > 0
        ? {
            inbox: state.lifetime.inbox.map((e) => ({
              id: e.id,
              receivedAt: e.receivedAt,
              readAt: e.readAt,
              ...(e.answeredReply != null ? { answeredReply: e.answeredReply } : {}),
              ...(e.deleted ? { deleted: true } : {}),
            })),
          }
        : {}),
      // Email arm timers (05): omit when empty so fresh games keep a minimal wire form (ADR-023).
      ...(Object.keys(state.lifetime.emailArmedAt).length > 0
        ? { emailArmedAt: { ...state.lifetime.emailArmedAt } }
        : {}),
      // Fausto-arc per-lifetime flags (05): omit when false (additive-optional, ADR-023).
      ...(state.lifetime.flagFCThreatSent === true ? { flagFCThreatSent: true } : {}),
      ...(state.lifetime.flagFaustoCurse === true ? { flagFaustoCurse: true } : {}),
      ...(state.lifetime.defixio ? { defixio: { elapsed: state.lifetime.defixio.elapsed } } : {}),
      // Apex Katabasis-modifier flags + Morpheus lockout: omit when false so fresh / pre-apex
      // saves keep the prior wire form (ADR-023 additive-optional discipline).
      ...(state.lifetime.pendingErinyes === true ? { pendingErinyes: true } : {}),
      ...(state.lifetime.pendingMorpheus === true ? { pendingMorpheus: true } : {}),
      ...(state.lifetime.morpheusLockedOut === true ? { morpheusLockedOut: true } : {}),
      // Mercatus depths: omit when empty so fresh games keep a minimal wire form (ADR-023).
      ...(Object.keys(state.lifetime.mercatusDepths).length > 0
        ? { mercatusDepths: { ...state.lifetime.mercatusDepths } }
        : {}),
    },
    rngState: state.rngState,
    lastTickAt: state.lastTickAt,
    startedAt: state.startedAt,
    // Omit when empty/zero so fresh and pre-achievements saves keep the prior wire form.
    ...(state.achievements.length > 0 ? { achievements: [...state.achievements] } : {}),
    ...(state.katabasisCount > 0 ? { katabasisCount: state.katabasisCount } : {}),
    // Permanent story flags (05): omit when false (additive-optional, ADR-023).
    ...(state.flagFatherMad === true ? { flagFatherMad: true } : {}),
    ...(state.flagReubenDead === true ? { flagReubenDead: true } : {}),
    ...(typeof state.erinyesEfficiencyStacks === 'number' && state.erinyesEfficiencyStacks > 0
      ? { erinyesEfficiencyStacks: state.erinyesEfficiencyStacks }
      : {}),
    ...(state.inKatabasis === true ? { inKatabasis: true } : {}),
  };
}

/** Reconstruct a runtime GameState from its JSON-safe form (string -> BigNum). */
export function deserializeGameState(s: SerializedGameState): GameState {
  const devotion = {} as Record<Sin, BigNum>;
  for (const sin of SINS) devotion[sin] = deserializeBigNum(s.devotion[sin]);

  const sigilBindings: Partial<Record<SigilId, BigNum>> = {};
  for (const [id, bound] of Object.entries(s.sigilBindings)) {
    sigilBindings[Number(id)] = deserializeBigNum(bound);
  }

  return {
    souls: deserializeBigNum(s.souls),
    // Monotonic souls-minted tally (05): absent in pre-feature saves → default to the soul pool,
    // the tightest lower bound we have (anything spent is already gone, so this never overcounts).
    totalSoulsObtained: deserializeBigNum(s.totalSoulsObtained ?? s.souls),
    devotion,
    // Additive-optional: absent → ZERO. (Decimal from string; deserializeBigNum handles it.)
    eternalDevotion: s.eternalDevotion
      ? deserializeBigNum(s.eternalDevotion)
      : deserializeBigNum('0'),
    sigilBindings,
    lifetime: {
      gold: deserializeBigNum(s.lifetime.gold),
      influence: deserializeBigNum(s.lifetime.influence),
      maxInfluence: deserializeBigNum(s.lifetime.maxInfluence),
      reprobates: s.lifetime.reprobates,
      acolytes: s.lifetime.acolytes.map((a) => ({
        id: a.id,
        assignedAction: a.assignedAction,
        remainingSeconds: a.remainingSeconds ?? null,
      })),
      invocations: { ...s.lifetime.invocations },
      invocationRunners: { ...(s.lifetime.invocationRunners ?? {}) },
      invocationDurations: { ...(s.lifetime.invocationDurations ?? {}) },
      maleficia: [...s.lifetime.maleficia],
      emptioList: [...s.lifetime.emptioList],
      maleficiaPrices: { ...(s.lifetime.maleficiaPrices ?? {}) },
      activeToggles: [...s.lifetime.activeToggles],
      toggleDurations: { ...(s.lifetime.toggleDurations ?? {}) },
      actionQueue: s.lifetime.actionQueue.map((t) =>
        t.target === undefined
          ? { actionId: t.actionId, remainingSeconds: t.remainingSeconds }
          : { actionId: t.actionId, remainingSeconds: t.remainingSeconds, target: t.target },
      ),
      // Auto-repeat set is additive-optional (ADR-023): missing in old saves means [] at runtime.
      autoRepeat: [...(s.lifetime.autoRepeat ?? [])],
      // Pool fields are additive-optional (ADR-023): missing in old saves means 0 at runtime.
      generationPool: s.lifetime.generationPool ?? 0,
      suicidePool: s.lifetime.suicidePool ?? 0,
      murderPool: s.lifetime.murderPool ?? 0,
      handOfGloryRemaining: s.lifetime.handOfGloryRemaining ?? 0,
      inbox: (s.lifetime.inbox ?? []).map((e) => ({
        id: e.id,
        receivedAt: e.receivedAt,
        readAt: e.readAt,
        ...(e.answeredReply != null ? { answeredReply: e.answeredReply } : {}),
        ...(e.deleted ? { deleted: true } : {}),
      })),
      // Email arm timers (05): additive-optional (ADR-023) — absent in old saves means {}.
      emailArmedAt: { ...(s.lifetime.emailArmedAt ?? {}) },
      // Fausto-arc per-lifetime flags: conditional spread keeps them optional under EOPT.
      ...(s.lifetime.flagFCThreatSent === true ? { flagFCThreatSent: true } : {}),
      ...(s.lifetime.flagFaustoCurse === true ? { flagFaustoCurse: true } : {}),
      ...(s.lifetime.defixio ? { defixio: { elapsed: s.lifetime.defixio.elapsed } } : {}),
      // Apex Katabasis-modifier flags + Morpheus lockout: conditional spread keeps them optional
      // under exactOptionalPropertyTypes (assigning undefined would type-error).
      ...(s.lifetime.pendingErinyes === true ? { pendingErinyes: true } : {}),
      ...(s.lifetime.pendingMorpheus === true ? { pendingMorpheus: true } : {}),
      ...(s.lifetime.morpheusLockedOut === true ? { morpheusLockedOut: true } : {}),
      // Mercatus depths: absent → {} (depth 0 everywhere). Keys are restricted to the eight
      // Cardinal Sins on the way in, so a hand-edited or future-version blob can't smuggle
      // arbitrary keys into the runtime record.
      mercatusDepths: pickSinDepths(s.lifetime.mercatusDepths),
    },
    rngState: s.rngState,
    lastTickAt: s.lastTickAt,
    // Old saves predating the runtime score default startedAt to lastTickAt (runtime starts now).
    startedAt: s.startedAt ?? s.lastTickAt,
    // Old saves predating achievements default to none / zero; the next tick re-evaluates.
    achievements: s.achievements ? [...s.achievements] : [],
    katabasisCount: s.katabasisCount ?? 0,
    // Permanent story flags (05): conditional spread keeps them optional under EOPT (absent ≡ false).
    ...(s.flagFatherMad === true ? { flagFatherMad: true } : {}),
    ...(s.flagReubenDead === true ? { flagReubenDead: true } : {}),
    ...(typeof s.erinyesEfficiencyStacks === 'number' && s.erinyesEfficiencyStacks > 0
      ? { erinyesEfficiencyStacks: s.erinyesEfficiencyStacks }
      : {}),
    // Frozen-descent flag: present only when true (conditional spread keeps it optional). A save
    // written mid-descent reloads frozen and the store re-opens the menu (see gameStore init).
    ...(s.inKatabasis === true ? { inKatabasis: true } : {}),
  };
}
