// View-model adapter for the designed Maleficia cabinet: the player's *owned* maleficia (collapsing
// duplicate stackables into a ×N on the name), each merged from the authoritative sim catalog (name,
// rarity, description) with the design's specimen art + split flavour/effect where the handoff
// illustrated it. Items without bespoke art carry an empty `img`; the cabinet renders a text label.
// Items without design copy split the sim description into flavour + effect, so the Loculi can set
// every item's effect as its headline number.
//
// For the two single-use consumables (Hand of Glory, Defixio) it also derives the `use` affordance —
// the button-enabled state and the current-effect status line — from existing lifetime state
// (`handOfGloryRemaining`, `defixio`). No new sim: this only surfaces what `activateMaleficium` and
// the tick already maintain.
import {
  MALEFICIA as CATALOG,
  countCopies,
  SINGLE_USE_MALEFICIA,
  type GameState,
} from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { MALEFICIA as DESIGN } from '../menus/menus.data.js';
import type { Maleficium, MaleficiumUse, Rarity } from '../menus/types.js';
import { formatDuration } from './format.js';
import { buildOracle } from './oracle.js';

const DESIGN_BY_ID: Record<string, Maleficium> = Object.fromEntries(DESIGN.map((m) => [m.id, m]));

/** Derive the Use affordance for the single-use consumables; `undefined` for ordinary maleficia. */
function makeAffordance(state: GameState): (id: string) => MaleficiumUse | undefined {
  const S = strings.maleficia;
  const buffs = state.lifetime.maleficiaBuffs;
  const single = new Set(SINGLE_USE_MALEFICIA);
  return (id) => {
    if (!single.has(id)) return undefined;
    // A single-use maleficium is always usable (a fresh use extends its one-hour timer); when the
    // buff is live, surface the remaining time as a status line.
    const remaining = buffs[id] ?? 0;
    return {
      label: S.use,
      enabled: true,
      ...(remaining > 0
        ? { status: `${formatDuration(remaining * 1000)} ${S.buffRemaining}` }
        : {}),
    };
  };
}

/**
 * Split a sim catalog description ("<flavour>. <effect>.") into its flavour and its effect line. The
 * effect is the trailing clause that opens with a signed magnitude or the `Single-use:` marker (the
 * copy rule bakes every magnitude into the text); a description with no such clause is all flavour.
 */
export function splitDescription(description: string): { desc: string; effect: string } {
  const m = /^([\s\S]*[.!?])\s+((?:Single-use:\s*)?[+-]\d[\s\S]*)$/.exec(description);
  if (!m) return { desc: description, effect: '' };
  return { desc: m[1] ?? description, effect: m[2] ?? '' };
}

/**
 * One maleficium's presentation by id, without the owned-stack count or the Use affordance: the
 * design's art and split copy where the handoff illustrated it, else the sim name and its description
 * split into flavour + effect. The Unveiling shows exactly this for a freshly obtained relic.
 */
export function maleficiumView(id: string): Maleficium | undefined {
  const def = CATALOG[id];
  if (!def) return undefined;
  const art = DESIGN_BY_ID[id];
  const copy = art ? { desc: art.desc, effect: art.effect } : splitDescription(def.description);
  return { id, name: def.name, rarity: def.rarity as Rarity, img: art?.img ?? '', ...copy };
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
    const view = maleficiumView(id);
    if (!view) continue;
    const count = countCopies(owned, id);
    const use = affordanceFor(id);
    const reveal = buildOracle(state, id);
    items.push({
      ...view,
      name: count > 1 ? `${view.name} ×${count}` : view.name,
      ...(use ? { use } : {}),
      ...(reveal ? { reveal } : {}),
    });
  }
  return items;
}
