// View-model adapter for the designed Altar ledger: maps live game state onto the presentation
// shapes it consumes. Per-Prince Devotion totals + Sin levels come straight from `state.devotion`
// via `sinLevel`; the bound-sigils list (which the prior placeholder never surfaced) is read from
// `state.sigilBindings` and named from the authoritative sigil catalog.
import { SINS, sinLevel, sigilById, floor, type GameState } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { formatBigNum } from './format.js';
import type { Sin } from '../menus/types.js';

export interface BoundSigil {
  readonly id: number;
  readonly name: string;
  readonly bound: string; // formatted soul count
}

export interface AltarView {
  readonly sins: Sin[];
  readonly boundSigils: BoundSigil[];
}

/** Build the Altar's presentation view (per-Prince devotion ledger + bound sigils) from sim state. */
export function buildAltar(state: GameState): AltarView {
  const sins: Sin[] = SINS.map((key) => {
    const info = strings.sins[key];
    return {
      prince: info.prince,
      latin: info.latin,
      english: info.english,
      level: sinLevel(state.devotion[key]),
      devotion: formatBigNum(state.devotion[key]),
    };
  });

  const boundSigils: BoundSigil[] = Object.entries(state.sigilBindings)
    .filter(([, amt]) => amt !== undefined && floor(amt).toNumber() > 0)
    .map(([idStr, amt]) => {
      const id = Number(idStr);
      return { id, name: sigilById(id)?.name ?? `Sigil #${id}`, bound: formatBigNum(amt!) };
    })
    .sort((a, b) => a.id - b.id);

  return { sins, boundSigils };
}
