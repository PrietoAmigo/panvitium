/**
 * Achievement tests (03 §7). Pins:
 *   - each predicate fires under the right condition (incl. effective max-influence, Long Burn, Semet)
 *   - evaluateAchievements returns only newly-unlocked ids and folds them in; idempotent thereafter
 *   - the tick surfaces achievementsUnlocked and persists them in state.achievements
 *   - commitKatabasis increments katabasisCount → First Descent unlocks on the next tick
 *   - the deferred "Goetia, Recited" is absent from the catalog
 */
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  achievementById,
  bn,
  commitKatabasis,
  createInitialState,
  evaluateAchievements,
  isUnlocked,
  MALEFICIA,
  SINS,
  tick,
  type GameState,
} from './index.js';

function fresh(seed = 'ach', t = 0): GameState {
  return createInitialState(seed, t);
}
function maxSinsTo(s: GameState, level: number): GameState {
  const devotion = { ...s.devotion };
  for (const sin of SINS) devotion[sin] = bn(180 ** level);
  return { ...s, devotion };
}
/** Run the evaluator and return the unlocked id set. */
function earned(s: GameState): Set<string> {
  return new Set(evaluateAchievements(s).unlocked);
}

describe('Achievement catalog', () => {
  it('exposes ids in pacing order and excludes the deferred Goetia achievement', () => {
    expect(ACHIEVEMENT_IDS).toContain('first_stain');
    expect(ACHIEVEMENT_IDS).toContain('semet');
    expect(ACHIEVEMENT_IDS).not.toContain('the_goetia_recited');
    expect(achievementById('crown_of_hell')).toBeDefined();
  });
});

describe('Predicates fire under the right condition', () => {
  it('First Harvest / First Stain on first soul / reprobate', () => {
    expect(earned(fresh()).has('first_harvest')).toBe(false);
    expect(earned({ ...fresh(), souls: bn(1) }).has('first_harvest')).toBe(true);
    const withReprobate = fresh();
    withReprobate.lifetime.reprobates = 1;
    expect(earned(withReprobate).has('first_stain')).toBe(true);
  });

  it('First Descent reads katabasisCount', () => {
    expect(earned(fresh()).has('first_descent')).toBe(false);
    expect(earned({ ...fresh(), katabasisCount: 1 }).has('first_descent')).toBe(true);
  });

  it('Sin-level achievements key off every / any Sin', () => {
    expect(earned(maxSinsTo(fresh(), 1)).has('council_convenes')).toBe(true);
    expect(earned(maxSinsTo(fresh(), 3)).has('eight_at_the_table')).toBe(true);
    expect(earned(maxSinsTo(fresh(), 4)).has('crown_of_hell')).toBe(true);
    const oneMaxed = fresh();
    oneMaxed.devotion.gula = bn(180 ** 4);
    expect(earned(oneMaxed).has('single_minded')).toBe(true);
    expect(earned(oneMaxed).has('crown_of_hell')).toBe(false);
  });

  it('maleficia rarity + Curator', () => {
    const anathemaId = Object.keys(MALEFICIA).find((id) => MALEFICIA[id]?.rarity === 'anathema')!;
    const withAnathema = fresh();
    withAnathema.lifetime.maleficia = [anathemaId];
    const set = earned(withAnathema);
    expect(set.has('anathema')).toBe(true);
    expect(set.has('first_bargain')).toBe(true);
    expect(set.has('curator')).toBe(false);

    const curator = fresh();
    curator.lifetime.maleficia = Object.keys(MALEFICIA);
    expect(earned(curator).has('curator')).toBe(true);
  });

  it('Court of Spires uses effective max influence', () => {
    const s = fresh();
    s.lifetime.maxInfluence = bn(10_000);
    expect(earned(s).has('court_of_spires')).toBe(true);
  });

  it('The Long Burn reads the Panvitium toggle duration', () => {
    const s = fresh();
    s.lifetime.toggleDurations = { panvitium: 60 };
    expect(earned(s).has('the_long_burn')).toBe(true);
    s.lifetime.toggleDurations = { panvitium: 59 };
    expect(earned(s).has('the_long_burn')).toBe(false);
  });

  it('Semet on the Eternal Sin reveal', () => {
    const s = { ...fresh(), eternalDevotion: bn('9000000000') }; // > threshold
    expect(earned(s).has('semet')).toBe(true);
  });
});

describe('evaluateAchievements folding + idempotence', () => {
  it('folds newly-unlocked ids into state.achievements and is idempotent', () => {
    const first = evaluateAchievements({ ...fresh(), souls: bn(1) });
    expect(first.unlocked).toContain('first_harvest');
    expect(first.state.achievements).toContain('first_harvest');
    const second = evaluateAchievements(first.state);
    expect(second.unlocked).toEqual([]);
    expect(second.state).toBe(first.state); // unchanged reference when nothing new
  });
});

describe('Tick integration', () => {
  it('surfaces achievementsUnlocked and persists them', () => {
    const s = { ...fresh(), souls: bn(1) };
    const r = tick(s, 0.1);
    expect(r.achievementsUnlocked).toContain('first_harvest');
    expect(r.state.achievements).toContain('first_harvest');
  });

  it('commitKatabasis bumps the counter so the next tick unlocks First Descent', () => {
    const s = fresh();
    const after = commitKatabasis(s).state;
    expect(after.katabasisCount).toBe(1);
    const r = tick(after, 0.1);
    expect(r.state.achievements).toContain('first_descent');
  });
});

describe('catalog wiring', () => {
  it('every catalog id has a predicate', () => {
    for (const a of ACHIEVEMENTS) expect(typeof a.earned).toBe('function');
  });

  it('isUnlocked reflects the stored list', () => {
    const s = { ...fresh(), achievements: ['semet'] };
    expect(isUnlocked(s, 'semet')).toBe(true);
    expect(isUnlocked(s, 'curator')).toBe(false);
  });
});
