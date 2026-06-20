/**
 * Autonomous-cycle engine (02 §3) shared by acolyte delegation (`acolytes.ts`) and invocation
 * runners (`invocations.ts`). A runner repeatedly performs one action in its own channel — never
 * the player's slot — at its own efficiency:
 *
 *   - Time-mode actions (Indagatio): cycle duration = base / efficiency.
 *   - Cost-outcome actions (Suasio/Decimatio): resolve `max(1, floor(efficiency))` outcome units
 *     over the action's base duration.
 *
 * Delegated runners DO NOT spend resources to carry out their actions: unlike the player's own
 * `startAction`, a runner cycle pays no gold/influence cost, so a channel never stalls on an empty
 * treasury — it always holds an active cycle and keeps looping. (Invocations still pay their
 * per-second summon UPKEEP separately in `tick.ts`; that is the price of staying active, not of
 * carrying out an action.)
 *
 * `remaining` is the seconds left on the in-flight cycle, or null when between cycles. The loop
 * counts down and catches up multiple cycles within one (possibly offline) delta, so offline
 * progression and online ticks share this single code path.
 */
import { resolveAction, runnerCycleDuration } from './actions.js';
import { type Tier } from './probability.js';
import { type Rng } from './rng.js';
import { type GameState } from './state.js';
import { type OutcomeEvent } from './events.js';

export interface RunnerCycleResult {
  readonly state: GameState;
  /** Seconds left on the current cycle, or null when between cycles. */
  readonly remaining: number | null;
  readonly events: OutcomeEvent[];
  /** True when a cycle resolved this call AND `oneShot` stopped further cycles (caller may retire). */
  readonly completed: boolean;
}

/** Hard cap on cycles resolved in one call — guards against a pathological zero-duration loop. */
const MAX_CYCLES_PER_CALL = 100_000;

/**
 * Advance one runner channel by `deltaSeconds`. Starts a (free) cycle when `remaining` is null,
 * counts it down, and on completion resolves the outcome at `efficiency` then starts the next cycle
 * with any leftover budget. Pass `deltaSeconds = 0` to (lazily) start the first cycle at assignment
 * time without advancing it. `forcedTier` pins the outcome tier (the Imp's Caedis). `oneShot` stops
 * after the first cycle resolves and reports `completed` so a caller can retire the channel;
 * persistent runners (acolyte delegation and invocations) leave it false and loop.
 */
export function advanceRunnerCycles(
  state: GameState,
  actionId: string,
  efficiency: number,
  remaining: number | null,
  deltaSeconds: number,
  rng: Rng,
  forcedTier?: Tier,
  oneShot = false,
): RunnerCycleResult {
  const events: OutcomeEvent[] = [];
  let working = state;
  let rem = remaining;
  let budget = Math.max(0, deltaSeconds);
  let completed = false;
  const resolveOpts = forcedTier === undefined ? { efficiency } : { efficiency, forcedTier };

  for (let guard = 0; guard < MAX_CYCLES_PER_CALL; guard++) {
    if (rem === null) {
      // Start a fresh cycle. Delegated runners carry out their actions for free — no per-cycle
      // gold/influence cost — so a channel never stalls on resources; it always has a live cycle.
      rem = runnerCycleDuration(actionId, efficiency);
    }
    if (rem > budget) {
      rem -= budget;
      break;
    }
    // Cycle completes within the remaining budget.
    budget -= rem;
    const r = resolveAction(working, actionId, rng, resolveOpts);
    working = r.state;
    if (r.event) events.push(r.event);
    rem = null; // closed out; the next cycle starts fresh on the next loop pass
    completed = true;
    if (oneShot) break; // a single task, then the caller retires the runner
    if (budget <= 0) break; // no time left this tick to start another
  }

  return { state: working, remaining: rem, events, completed };
}
