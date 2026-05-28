/**
 * Achievements (03 §7). Each is a pure predicate over the current `GameState`; the first tick on
 * which a predicate is true records the unlock permanently in `state.achievements` (one-way, carried
 * across lifetimes). Most predicates derive entirely from current state; the two that need history
 * read the dedicated fields added for them (`katabasisCount`, `toggleDurations`).
 *
 * Evaluation runs as the last step of `tick` (see tick.ts), so unlocks happen at the 10 Hz cadence
 * and offline progression unlocks anything crossed while away. The newly-unlocked ids are returned
 * from the tick so the UI can surface a toast.
 *
 * Deferred: "The Goetia, Recited" (bind every one of the 72 sigils across one or more lifetimes) is
 * not wired — it is structurally unearnable until all 72 sigils exist (only a subset is bindable
 * today) and would need an ever-bound history field. It lands with the full Goetia.
 */
import { bn, gte, mul } from './bignum.js';
import { eternalSinRevealed } from './eternal.js';
import { MALEFICIA, countCopies, type MaleficiumRarity } from './maleficia.js';
import { computeModifiers } from './modifiers.js';
import { sinLevel } from './progression.js';
import { SINS, totalReprobates, type GameState } from './state.js';

export interface AchievementDef {
  readonly id: string;
  /** True once the achievement's condition holds. Pure; no side effects. */
  readonly earned: (state: GameState) => boolean;
}

const COURT_OF_SPIRES_INFLUENCE = 10_000;
const LONG_BURN_SECONDS = 60;

function everySinAtLeast(state: GameState, level: number): boolean {
  for (const s of SINS) if (sinLevel(state.devotion[s]) < level) return false;
  return true;
}
function anySinAtLeast(state: GameState, level: number): boolean {
  for (const s of SINS) if (sinLevel(state.devotion[s]) >= level) return true;
  return false;
}
function ownsRarity(state: GameState, rarity: MaleficiumRarity): boolean {
  for (const id of state.lifetime.maleficia) {
    if (MALEFICIA[id]?.rarity === rarity) return true;
  }
  return false;
}
function ownsEveryMaleficium(state: GameState): boolean {
  for (const id of Object.keys(MALEFICIA)) {
    if (countCopies(state.lifetime.maleficia, id) === 0) return false;
  }
  return true;
}

/** The catalog in pacing order (03 §7), minus the deferred "Goetia, Recited". */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first_stain', earned: (s) => totalReprobates(s) >= 1 },
  { id: 'first_harvest', earned: (s) => gte(s.souls, bn(1)) },
  { id: 'first_descent', earned: (s) => s.katabasisCount >= 1 },
  { id: 'first_bargain', earned: (s) => s.lifetime.maleficia.length >= 1 },
  { id: 'council_convenes', earned: (s) => everySinAtLeast(s, 1) },
  { id: 'profane_possession', earned: (s) => ownsRarity(s, 'profane') },
  { id: 'anathema', earned: (s) => ownsRarity(s, 'anathema') },
  {
    id: 'court_of_spires',
    earned: (s) =>
      gte(
        mul(s.lifetime.maxInfluence, computeModifiers(s).maxInfluenceMul),
        COURT_OF_SPIRES_INFLUENCE,
      ),
  },
  { id: 'single_minded', earned: (s) => anySinAtLeast(s, 4) },
  { id: 'eight_at_the_table', earned: (s) => everySinAtLeast(s, 3) },
  {
    id: 'the_long_burn',
    earned: (s) => (s.lifetime.toggleDurations.panvitium ?? 0) >= LONG_BURN_SECONDS,
  },
  { id: 'curator', earned: ownsEveryMaleficium },
  { id: 'crown_of_hell', earned: (s) => everySinAtLeast(s, 4) },
  { id: 'semet', earned: eternalSinRevealed },
] as const;

/** Catalog ids in pacing order. */
export const ACHIEVEMENT_IDS: readonly string[] = Object.freeze(ACHIEVEMENTS.map((a) => a.id));

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function isUnlocked(state: GameState, id: string): boolean {
  return state.achievements.includes(id);
}

/**
 * Evaluate the catalog against `state`. Returns the (possibly updated) state with any newly-earned
 * ids appended to `achievements`, plus the list of those newly-unlocked ids (in catalog order).
 * Returns the input state unchanged when nothing new is earned.
 */
export function evaluateAchievements(state: GameState): {
  state: GameState;
  unlocked: string[];
} {
  const have = new Set(state.achievements);
  const unlocked: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (have.has(def.id)) continue;
    if (def.earned(state)) unlocked.push(def.id);
  }
  if (unlocked.length === 0) return { state, unlocked };
  return {
    state: { ...state, achievements: [...state.achievements, ...unlocked] },
    unlocked,
  };
}
