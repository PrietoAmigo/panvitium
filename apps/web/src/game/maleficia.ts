// View-model adapter for the designed Maleficia cabinet: the player's *owned* maleficia (collapsing
// duplicate stackables into a ×N on the name), each merged from the authoritative sim catalog (name,
// rarity, description) with the design's specimen art + split flavour/effect where the handoff
// illustrated it. Items without bespoke art carry an empty `img`; the cabinet renders a text label.
import { MALEFICIA as CATALOG, countCopies, type GameState } from '@panvitium/sim';
import { MALEFICIA as DESIGN } from '../menus/menus.data.js';
import type { Maleficium, Rarity } from '../menus/types.js';

const DESIGN_BY_ID: Record<string, Maleficium> = Object.fromEntries(DESIGN.map((m) => [m.id, m]));

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
  const items: Maleficium[] = [];
  for (const id of order) {
    const def = CATALOG[id];
    if (!def) continue;
    const art = DESIGN_BY_ID[id];
    const count = countCopies(owned, id);
    items.push({
      id,
      name: count > 1 ? `${def.name} ×${count}` : def.name,
      rarity: def.rarity as Rarity,
      img: art?.img ?? '',
      desc: art?.desc ?? def.description,
      effect: art?.effect ?? '',
    });
  }
  return items;
}
