/**
 * Vitium Mercatura build mechanics (03 §2.3 / 02 §3 parallelism). Builds live in their own queue
 * separate from the player action queue:
 *   - Builds do NOT occupy the player slot — multiple builds run concurrently with the player's
 *     own action and each other.
 *   - Builds cannot be delegated (acolytes / invocations don't speed them).
 *   - Builds are not subject to action efficiency. The duration is the catalog `buildTimeSeconds`
 *     verbatim.
 *   - The build cost (gold) is paid up-front at start; build success is deterministic — no tier
 *     roll, no probability of failure (03 §2.3: "These actions are deterministic — no tier roll").
 *
 * Manual shutdown is instant (no timer) and refunds a fraction of the original buildCost. The
 * default is `SHUTDOWN_REFUND_FRACTION` (0.5); Vine #45 raises it in a future sigil-effects slice.
 * Auto-shutdown at Katabasis uses the same refund into the gold pool BEFORE the carry-over roll
 * (see `katabasis.ts`).
 */
import { add, floor, gte, sub } from './bignum.js';
import { businessById, SHUTDOWN_REFUND_FRACTION } from './businesses.js';
import { sinLevel } from './progression.js';
import { type BuildTimer, type GameState, type VitiumConversionSource } from './state.js';

export type StartBuildResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Begin building a business. Checks: the id is known, the player has the Sin level the business
 * requires (Level 1 for the entry tier), and enough gold to pay the buildCost. On success: gold
 * is deducted and a BuildTimer is appended to the buildQueue. Multiple in-flight builds of the
 * same id are allowed.
 */
export function startBuild(state: GameState, businessId: string): StartBuildResult {
  const def = businessById(businessId);
  if (!def) return { ok: false, reason: `unknown business: ${businessId}` };

  // Sin-level gate. The spreadsheet's "Sin-lvl unlock" column is (tier − 1): the entry tier
  // (level 1) unlocks at Sin level 0, tier 2 at level 1, tier 3 at level 2, tier 4 at level 3.
  const required = def.level - 1;
  const haveLevel = sinLevel(state.devotion[def.sin]);
  if (haveLevel < required) {
    return { ok: false, reason: `requires ${def.sin} level ${required}` };
  }

  if (!gte(floor(state.lifetime.gold), def.buildCost)) {
    return { ok: false, reason: 'not enough gold' };
  }

  const timer: BuildTimer = {
    businessId: def.id,
    remainingSeconds: def.buildTimeSeconds,
  };
  return {
    ok: true,
    state: {
      ...state,
      lifetime: {
        ...state.lifetime,
        gold: sub(state.lifetime.gold, def.buildCost),
        buildQueue: [...state.lifetime.buildQueue, timer],
      },
    },
  };
}

export type ShutdownResult =
  | { readonly ok: true; readonly state: GameState; readonly refund: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Manually shut down one owned business of `businessId`. Instant; refunds
 * `floor(buildCost × SHUTDOWN_REFUND_FRACTION)` gold and decrements the owned count by 1.
 * If the count hits 0 the key is deleted from the businesses map so empty-state stays clean.
 */
export function shutdownBusiness(state: GameState, businessId: string): ShutdownResult {
  const def = businessById(businessId);
  if (!def) return { ok: false, reason: `unknown business: ${businessId}` };

  const count = state.lifetime.businesses[businessId] ?? 0;
  if (count <= 0) return { ok: false, reason: 'no such business owned' };

  const refund = Math.floor(def.buildCost * SHUTDOWN_REFUND_FRACTION);
  const businesses = { ...state.lifetime.businesses };
  if (count === 1) delete businesses[businessId];
  else businesses[businessId] = count - 1;

  return {
    ok: true,
    state: {
      ...state,
      lifetime: {
        ...state.lifetime,
        gold: add(state.lifetime.gold, refund),
        businesses,
      },
    },
    refund,
  };
}

/**
 * Advance every BuildTimer by `deltaSeconds`. Completed builds (remaining ≤ 0) increment the
 * owned count on the businesses map. Multiple completions in one large (offline) delta are
 * handled in a single pass.
 */
export function advanceBuilds(state: GameState, deltaSeconds: number): GameState {
  if (deltaSeconds <= 0 || state.lifetime.buildQueue.length === 0) return state;

  const remaining: BuildTimer[] = [];
  const businesses = { ...state.lifetime.businesses };
  let completed = 0;
  for (const t of state.lifetime.buildQueue) {
    const left = t.remainingSeconds - deltaSeconds;
    if (left > 0) {
      remaining.push({ businessId: t.businessId, remainingSeconds: left });
    } else {
      businesses[t.businessId] = (businesses[t.businessId] ?? 0) + 1;
      completed += 1;
    }
  }
  if (completed === 0) {
    return {
      ...state,
      lifetime: { ...state.lifetime, buildQueue: remaining },
    };
  }
  return {
    ...state,
    lifetime: { ...state.lifetime, buildQueue: remaining, businesses },
  };
}

/** Sum of `goldPerSecond` across all owned businesses (catalog-driven; unknown ids ignored). */
export function businessGoldPerSecond(state: GameState): number {
  let s = 0;
  for (const [bid, count] of Object.entries(state.lifetime.businesses)) {
    const def = businessById(bid);
    if (!def || !count) continue;
    s += def.goldPerSecond * count;
  }
  return s;
}

/** Sum of `reprobateGenPerSecond` across all owned businesses. Fed into the generation pool. */
export function businessGenerationPerSecond(state: GameState): number {
  let s = 0;
  for (const [bid, count] of Object.entries(state.lifetime.businesses)) {
    const def = businessById(bid);
    if (!def || !count) continue;
    s += def.reprobateGenPerSecond * count;
  }
  return s;
}

/** Sum of `conversionPerSecond` across all owned businesses. Fed into the conversion pool. */
export function businessConversionPerSecond(state: GameState): number {
  let s = 0;
  for (const [bid, count] of Object.entries(state.lifetime.businesses)) {
    const def = businessById(bid);
    if (!def || !count) continue;
    s += def.conversionPerSecond * count;
  }
  return s;
}

/** Owned businesses as Vitium conversion sources (for biasedSubtype / the conversion pool). */
export function businessConversionSources(state: GameState): VitiumConversionSource[] {
  const out: VitiumConversionSource[] = [];
  for (const [bid, count] of Object.entries(state.lifetime.businesses)) {
    const def = businessById(bid);
    if (!def || !count) continue;
    out.push({
      conversionPerSecond: def.conversionPerSecond * count,
      subtypeBias: def.subtypeBias,
    });
  }
  return out;
}
