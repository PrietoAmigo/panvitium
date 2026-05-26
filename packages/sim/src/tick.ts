/**
 * The tick function (ADR-004).
 *
 * One pure function advances the whole game by a span of seconds. The same function serves
 * BOTH the live 10 Hz loop (called with delta ≈ 0.1s each logical tick) and offline
 * progression (called once on load with a large, capped delta). Keeping a single code path
 * means online and offline gains can never drift apart.
 *
 * Purity contract: no DOM access, no `Math.random`, no mutation of the input `state`. All
 * randomness comes from the injected seeded RNG (ADR-011); its advanced state is written back
 * into the returned state.
 *
 * Step 2 is the skeleton: it advances the logical clock and establishes the RNG read/write
 * boundary. Resource generation, action-timer resolution, and probability-tier outcomes land
 * with their respective systems in later steps, slotted in where marked.
 */
import { makeRng } from './rng.js';
import { type GameState } from './state.js';

/**
 * Injected dependencies for a tick (economy constants, tuning tables). Empty for now;
 * systems that need data will receive it here rather than importing it, to keep `tick`
 * deterministic and testable in isolation.
 */
export interface TickDeps {
  readonly _reserved?: never;
}

/** Advance `state` by `deltaSeconds`. Returns a new state; never mutates the input. */
export function tick(state: GameState, deltaSeconds: number, _deps: TickDeps = {}): GameState {
  if (deltaSeconds <= 0) return state;

  const rng = makeRng(state.rngState);

  // --- system steps land here, each consuming `rng` for any random outcomes ---
  // 1. passive generation (gold, influence, reprobates)        [step: Depraedatio/resources]
  // 2. resolve in-flight action timers                          [step: Opera]
  // 3. probability-tier outcomes (Suasio / Decimatio / ...)     [step: outcomes]
  // 4. toggles per-second effects & costs (incl. Panvitium)     [step: toggles]
  // 5. reprobate suicide / murder population effects            [step: reprobates]
  // No draws happen yet, so rng.state is unchanged this step.

  return {
    ...state,
    lastTickAt: state.lastTickAt + Math.round(deltaSeconds * 1000),
    rngState: rng.state,
  };
}
