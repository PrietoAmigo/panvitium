// View-model adapter for the PC's Decimatio program. Pogrom purges one *chosen* reprobate subtype,
// so the player needs a picker — this surfaces the subtypes currently present (count > 0) as the
// valid targets, each with its display label and live count. Purging an absent subtype is a wasted
// cast (it still incurs the bad-tier penalties), so the picker offers only what is actually there.
import { REPROBATE_SUBTYPES, type GameState, type ReprobateSubtype } from '@panvitium/sim';
import { strings } from '@panvitium/shared';

export interface PogromTarget {
  subtype: ReprobateSubtype;
  label: string;
  count: number;
}

/** The reprobate subtypes currently present, as Pogrom targets with display labels and counts. */
export function pogromTargets(state: GameState): PogromTarget[] {
  return REPROBATE_SUBTYPES.filter((t) => state.lifetime.reprobates[t] > 0).map((t) => ({
    subtype: t,
    label: strings.subtypes[t],
    count: state.lifetime.reprobates[t],
  }));
}
