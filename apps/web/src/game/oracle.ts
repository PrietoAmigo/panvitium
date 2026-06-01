// View-model adapter for the oracular reveals (Maleficia). Each oracular item, when examined in the
// cabinet, surfaces the live tier distribution of one Opera category's actions — the exact odds a
// cast would roll right now (via the sim's `actionTierDistribution`, which composes base weights ×
// global tier muls × the per-category success shift). The Obsidian Mirror reveals all four.
//
// The item → category mapping follows the catalog *descriptions* (the authoritative source), not the
// README prose, which had Crossroads Dirt and Crow Feather swapped: Crossroads Dirt reveals Emptio,
// Crow Feather reveals Indagatio.
import { ACTIONS, actionTierDistribution, TIERS, type GameState } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { actionName } from './labels.js';
import type { OracleGroup } from '../menus/types.js';

type Category = 'suasio' | 'decimatio' | 'indagatio' | 'emptio';

const ORACLE_CATEGORIES: Record<string, Category[]> = {
  hollow_effigy: ['suasio'],
  the_dadu: ['decimatio'],
  crossroads_dirt: ['emptio'],
  crow_feather: ['indagatio'],
  obsidian_mirror: ['suasio', 'decimatio', 'indagatio', 'emptio'],
};

const CATEGORY_LABEL: Record<Category, string> = {
  suasio: strings.opera.suasio,
  decimatio: strings.opera.decimatio,
  indagatio: strings.opera.indagatio,
  emptio: strings.opera.emptio,
};

/** Build the oracular reveal for an owned maleficium, or `undefined` if it is not an oracle. */
export function buildOracle(state: GameState, maleficiumId: string): OracleGroup[] | undefined {
  const categories = ORACLE_CATEGORIES[maleficiumId];
  if (!categories) return undefined;
  return categories.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    actions: Object.keys(ACTIONS)
      .filter((id) => ACTIONS[id]?.category === category)
      .map((id) => {
        const dist = actionTierDistribution(state, id);
        return {
          action: id,
          name: actionName(id),
          tiers: TIERS.map((t) => ({ tier: t, label: strings.tiers[t], pct: dist[t] })),
        };
      }),
  }));
}
