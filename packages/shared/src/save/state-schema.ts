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
  type ReprobateSubtype,
  type SigilId,
  type BigNum,
  SINS,
  REPROBATE_SUBTYPES,
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
});

const actionTimerSchema = z.object({
  actionId: z.string(),
  remainingSeconds: z.number(),
  target: z.string().optional(),
});

const lifetimeSchema = z.object({
  gold: bigNumString,
  influence: bigNumString,
  maxInfluence: bigNumString,
  reprobates: recordOf(REPROBATE_SUBTYPES, z.number().int().nonnegative()),
  acolytes: z.array(acolyteSchema),
  invocations: z.record(z.string(), z.number().int().nonnegative()),
  maleficia: z.array(z.string()),
  emptioList: z.array(z.string()),
  activeToggles: z.array(z.string()),
  actionQueue: z.array(actionTimerSchema),
});

/** Zod schema for the serialized gameplay state. */
export const serializedGameStateSchema = z.object({
  souls: bigNumString,
  devotion: recordOf(SINS, bigNumString),
  // sigil id -> bound souls. JSON object keys are strings; parsed back to numbers on load.
  sigilBindings: z.record(z.string(), bigNumString),
  lifetime: lifetimeSchema,
  rngState: z.number().int(),
  lastTickAt: z.number().int(),
});

/** The JSON-safe form of GameState. */
export type SerializedGameState = z.infer<typeof serializedGameStateSchema>;

/** Convert a runtime GameState into its JSON-safe form (BigNum -> string). */
export function serializeGameState(state: GameState): SerializedGameState {
  const devotion = {} as Record<Sin, string>;
  for (const s of SINS) devotion[s] = serializeBigNum(state.devotion[s]);

  const sigilBindings: Record<string, string> = {};
  for (const [id, bound] of Object.entries(state.sigilBindings)) {
    if (bound !== undefined) sigilBindings[id] = serializeBigNum(bound);
  }

  const reprobates = {} as Record<ReprobateSubtype, number>;
  for (const t of REPROBATE_SUBTYPES) reprobates[t] = state.lifetime.reprobates[t];

  return {
    souls: serializeBigNum(state.souls),
    devotion,
    sigilBindings,
    lifetime: {
      gold: serializeBigNum(state.lifetime.gold),
      influence: serializeBigNum(state.lifetime.influence),
      maxInfluence: serializeBigNum(state.lifetime.maxInfluence),
      reprobates,
      acolytes: state.lifetime.acolytes.map((a) => ({ ...a })),
      invocations: { ...state.lifetime.invocations },
      maleficia: [...state.lifetime.maleficia],
      emptioList: [...state.lifetime.emptioList],
      activeToggles: [...state.lifetime.activeToggles],
      actionQueue: state.lifetime.actionQueue.map((t) =>
        t.target === undefined
          ? { actionId: t.actionId, remainingSeconds: t.remainingSeconds }
          : { actionId: t.actionId, remainingSeconds: t.remainingSeconds, target: t.target },
      ),
    },
    rngState: state.rngState,
    lastTickAt: state.lastTickAt,
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

  const reprobates = {} as Record<ReprobateSubtype, number>;
  for (const t of REPROBATE_SUBTYPES) reprobates[t] = s.lifetime.reprobates[t];

  return {
    souls: deserializeBigNum(s.souls),
    devotion,
    sigilBindings,
    lifetime: {
      gold: deserializeBigNum(s.lifetime.gold),
      influence: deserializeBigNum(s.lifetime.influence),
      maxInfluence: deserializeBigNum(s.lifetime.maxInfluence),
      reprobates,
      acolytes: s.lifetime.acolytes.map((a) => ({ ...a })),
      invocations: { ...s.lifetime.invocations },
      maleficia: [...s.lifetime.maleficia],
      emptioList: [...s.lifetime.emptioList],
      activeToggles: [...s.lifetime.activeToggles],
      actionQueue: s.lifetime.actionQueue.map((t) =>
        t.target === undefined
          ? { actionId: t.actionId, remainingSeconds: t.remainingSeconds }
          : { actionId: t.actionId, remainingSeconds: t.remainingSeconds, target: t.target },
      ),
    },
    rngState: s.rngState,
    lastTickAt: s.lastTickAt,
  };
}
