// View-model adapter for the designed Maleficia cabinet: the player's *owned* maleficia (collapsing
// duplicate stackables into a ×N on the name), each merged from the authoritative sim catalog (name,
// rarity, description) with the design's specimen art + split flavour/effect where the handoff
// illustrated it. Items without bespoke art carry an empty `img`; the cabinet renders a text label.
//
// For the two single-use consumables (Hand of Glory, Defixio) it also derives the `use` affordance —
// the button-enabled state and the current-effect status line — from existing lifetime state
// (`handOfGloryRemaining`, `defixio`). No new sim: this only surfaces what `activateMaleficium` and
// the tick already maintain.
import { MALEFICIA as CATALOG, countCopies, type GameState } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { MALEFICIA as DESIGN } from '../menus/menus.data.js';
import type { Maleficium, MaleficiumUse, Rarity } from '../menus/types.js';
import { formatDuration } from './format.js';

const DESIGN_BY_ID: Record<string, Maleficium> = Object.fromEntries(DESIGN.map((m) => [m.id, m]));

/** Derive the Use affordance for the single-use consumables; `undefined` for ordinary maleficia. */
function makeAffordance(state: GameState): (id: string) => MaleficiumUse | undefined {
  const S = strings.maleficia;
  return (id) => {
    if (id === 'hand_of_glory') {
      // Stacking is always allowed (a fresh use extends the timer), so it is enabled whenever owned.
      const remaining = state.lifetime.handOfGloryRemaining;
      return {
        label: S.use,
        enabled: true,
        ...(remaining > 0
          ? { status: `${formatDuration(remaining * 1000)} ${S.handOfGloryLeft}` }
          : {}),
      };
    }
    if (id === 'defixio') {
      // Only one curse at a time (the sim refuses a second); disable with a status while one runs.
      const active = state.lifetime.defixio;
      if (!active) return { label: S.use, enabled: true };
      const status =
        active.target === null
          ? S.defixioRolling
          : `${S.defixioOn} ${strings.subtypes[active.target]}`;
      return { label: S.use, enabled: false, status };
    }
    return undefined;
  };
}

/** Build the cabinet's presentation items from the player's owned maleficia. */
export function buildCabinet(state: GameState): Maleficium[] {
  const owned = state.lifetime.maleficia;
  const order: string[] = [];
  const seen = new Set<string>();
  for (const id of owned) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  const affordanceFor = makeAffordance(state);
  const items: Maleficium[] = [];
  for (const id of order) {
    const def = CATALOG[id];
    if (!def) continue;
    const art = DESIGN_BY_ID[id];
    const count = countCopies(owned, id);
    const use = affordanceFor(id);
    items.push({
      id,
      name: count > 1 ? `${def.name} ×${count}` : def.name,
      rarity: def.rarity as Rarity,
      img: art?.img ?? '',
      desc: art?.desc ?? def.description,
      effect: art?.effect ?? '',
      ...(use ? { use } : {}),
    });
  }
  return items;
}
