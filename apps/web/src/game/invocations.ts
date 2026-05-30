// View-model adapter: maps the authoritative `packages/sim` invocation catalog + live game state
// onto the presentation `Invocation` shape the designed Ars Goetia grimoire consumes. The dynamic
// fields (name, gate, soul cost, unlocked, bound count, invoking power) are all real; the design's
// art / lore / rank are reused where the handoff illustrated an entry, with a graceful fallback
// (the Ars Goetia plate + a computed rank, and an omitted effect/lore line) for the rest. No flavour
// is fabricated — un-illustrated entries simply show their real gate, cost and name.
import {
  INVOCATION_IDS,
  invocationById,
  invocationVisible,
  invocationUnlocked,
  invocationSoulCost,
  activeInvocationCount,
  currentInvokingPower,
  floor,
  type GameState,
  type InvocationDef,
} from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import type { Invocation } from '../menus/types.js';
import { INVOCATION_BY_ID, ASSET_BASE } from '../menus/menus.data.js';

const ROMAN = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV',
  'XVI',
  'XVII',
  'XVIII',
];
const FALLBACK_IMG = `${ASSET_BASE}/items/ars_goetia.png`;

function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

/** The invoking-power (+ optional Sin level) requirement, shown as the "Seal" on a locked leaf. */
function gateLabel(def: InvocationDef): string {
  return def.sinLevel !== undefined && def.sin !== null
    ? `${def.invokingPower} ${strings.maleficia.invokingPower} \u00B7 ${def.sin} L${def.sinLevel}`
    : `${def.invokingPower} ${strings.maleficia.invokingPower}`;
}

export interface GoetiaView {
  /** Current invoking power (maleficia + Andrealphus sigil). */
  readonly power: number;
  /** Visible invocations (≥ half their invoking-power requirement, 02 §12), as presentation rows. */
  readonly entries: Invocation[];
  /** Active count per invocation id, for the "N bound" hint and the Dispel button. */
  readonly counts: Record<string, number>;
}

/** Build the grimoire's presentation view from authoritative sim state. */
export function buildGoetia(state: GameState): GoetiaView {
  const power = currentInvokingPower(state);
  const counts: Record<string, number> = {};
  const entries: Invocation[] = [];
  INVOCATION_IDS.forEach((id, i) => {
    const def = invocationById(id);
    if (!def || !invocationVisible(state, def)) return;
    const unlocked = invocationUnlocked(state, def);
    const cost = floor(invocationSoulCost(state, def)).toNumber();
    counts[id] = activeInvocationCount(state, def.id);
    const flavour = INVOCATION_BY_ID[id]; // design art/lore for the illustrated entries
    entries.push({
      id,
      name: strings.invocations.names[id] ?? flavour?.name ?? id,
      rank: flavour?.rank ?? roman(i + 1),
      sub: '',
      cost: cost > 0 ? `${cost} ${strings.resources.souls}` : strings.invocations.free,
      gate: unlocked ? null : gateLabel(def),
      unlocked,
      img: flavour?.img ?? FALLBACK_IMG,
      effect: flavour?.effect ?? '',
      lore: flavour?.lore ?? '',
    });
  });
  return { power, entries, counts };
}
