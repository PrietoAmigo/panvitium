// View-model adapter for the oracular reveals (Maleficia). Each oracular item, when examined in the
// cabinet, surfaces the live tier distribution of one Opera category's actions — the exact odds a
// cast would roll right now (via the sim's `actionTierDistribution`, which composes base weights ×
// global tier muls × the per-category success shift).
//
// The maleficia rework retired every reveal item (The Dadu, Hollow Effigy, Crossroads Dirt, Crow
// Feather, Obsidian Mirror were all repurposed to concrete enhancers), so no maleficium reveals a
// distribution today: `ORACLE_CATEGORIES` is empty and `buildOracle` returns `undefined` for all.
// The machinery is kept so a future reveal item is one entry in this map.
import { ACTIONS, actionTierDistribution, TIERS, type GameState } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { actionName } from './labels.js';
import type { OracleGroup } from '../menus/types.js';

type Category = 'suasio' | 'decimatio' | 'indagatio' | 'emptio';

const ORACLE_CATEGORIES: Record<string, Category[]> = {};

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
