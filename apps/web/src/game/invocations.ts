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
  invocationGoldCost,
  activeInvocationCount,
  currentInvokingPower,
  floor,
  gte,
  type GameState,
  type InvocationDef,
} from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import type { GoetiaEntry } from '../menus/ars-goetia.types.js';
import { INVOCATION_BY_ID, ASSET_BASE } from '../menus/menus.data.js';
import { invocationEffectText } from './invocationEffect.js';

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
function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

/** The invoking-power (+ optional Sin level) requirement, shown as the "Seal" on a locked leaf. */
function gateLabel(def: InvocationDef): string {
  return def.sinLevel !== undefined && def.sin !== null
    ? `${def.invokingPower} ${strings.maleficia.invokingPower} \u00B7 ${def.sin} ${roman(def.sinLevel)}`
    : `${def.invokingPower} ${strings.maleficia.invokingPower}`;
}

export interface GoetiaView {
  /** Current invoking power (maleficia + Andrealphus sigil), pre-formatted for display. */
  readonly invokingPower: string;
  /** Visible invocations (≥ half their invoking-power requirement, 02 §12), as grimoire entries. */
  readonly entries: GoetiaEntry[];
}

/**
 * The grimoire's cost line. Morpheus carries a one-time %-of-pool cost (soulCost/goldCost); every
 * other paid invocation carries per-second upkeep (Invocatio sheet). Free invocations read "free".
 */
function invocationCostLabel(def: InvocationDef): string {
  const r = strings.resources;
  const pct = (x: number): number => Math.round(x * 100);
  if (def.soulCost || def.goldCost) {
    const parts: string[] = [];
    if (def.soulCost) parts.push(`${pct(def.soulCost.fraction)}% ${r.souls}`);
    if (def.goldCost) parts.push(`${pct(def.goldCost.fraction)}% ${r.gold}`);
    return parts.join(' + ');
  }
  const u = def.upkeep;
  if (!u) return strings.invocations.free;
  const parts: string[] = [];
  if (u.gold) parts.push(`${u.gold} ${r.gold}/s`);
  if (u.influence) parts.push(`${u.influence} ${r.influence}/s`);
  if (u.goldGainFraction && u.goldGainFraction === u.influenceGainFraction) {
    parts.push(`${pct(u.goldGainFraction)}% ${r.gold} + ${r.influence} gain/s`);
  } else {
    if (u.goldGainFraction) parts.push(`${pct(u.goldGainFraction)}% ${r.gold} gain/s`);
    if (u.influenceGainFraction)
      parts.push(`${pct(u.influenceGainFraction)}% ${r.influence} gain/s`);
  }
  if (u.maxInfluenceFraction) parts.push(`${pct(u.maxInfluenceFraction)}% max ${r.influence}/s`);
  return parts.length > 0 ? parts.join(' · ') : strings.invocations.free;
}

/** Build the grimoire's presentation view from authoritative sim state. */
export function buildGoetia(state: GameState): GoetiaView {
  const power = currentInvokingPower(state);
  const entries: GoetiaEntry[] = [];
  INVOCATION_IDS.forEach((id, i) => {
    const def = invocationById(id);
    if (!def || !invocationVisible(state, def)) return;
    const unlocked = invocationUnlocked(state, def);
    const soulCost = invocationSoulCost(state, def);
    const goldCost = invocationGoldCost(state, def);
    const active = activeInvocationCount(state, def.id);
    const atCap = def.maxActive !== undefined && active >= def.maxActive;
    const affordable =
      gte(floor(state.souls), soulCost) && gte(floor(state.lifetime.gold), goldCost);
    const bound =
      active <= 0
        ? undefined
        : active === 1
          ? strings.invocations.active
          : `${strings.invocations.active} \u00D7${active}`;
    const flavour = INVOCATION_BY_ID[id]; // design art/lore for the illustrated entries
    // Effect is a MECHANIC, so it comes from the authoritative sim (same source as the Analytics
    // Invocations tab) — never the static menus.data.ts copy, which went stale. Lore/art stay flavour.
    const effect = invocationEffectText(state, id);
    const lore = flavour?.lore ?? '';
    entries.push({
      id,
      name: strings.invocations.names[id] ?? flavour?.name ?? id,
      // The Familiar is the base creature, not one of the ranked seals — it carries no numeral.
      rank: id === 'familiar' ? '' : (flavour?.rank ?? roman(i + 1)),
      cost: invocationCostLabel(def),
      unlocked,
      active,
      atCap,
      affordable,
      // Optional fields omitted (not set to undefined) per exactOptionalPropertyTypes: a locked
      // entry carries its real gate; the effect/lore/bound lines degrade to absent.
      ...(unlocked ? {} : { gate: gateLabel(def) }),
      ...(bound ? { bound } : {}),
      ...(effect ? { effect } : {}),
      ...(lore ? { lore } : {}),
      // Book drawings (not the photorealistic creature art) live in their own folder, keyed by id.
      // A seal without a drawing yet 404s and the book shows a text plate (handled in the component).
      illus: `${ASSET_BASE}/invocations-ars-goetia/${id}.png`,
    });
  });
  return { invokingPower: String(power), entries };
}
