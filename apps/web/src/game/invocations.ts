// View-model adapter: maps the authoritative `packages/sim` invocation catalog + live game state
// onto the presentation `Invocation` shape the designed Ars Goetia grimoire consumes. The dynamic
// fields (name, gate, upkeep cost, unlocked, bound count, invoking power) are all real; the design's
// lore is reused where the handoff wrote one (the line is omitted otherwise), the rank numeral is the
// entry's place in the index, and every entry carries its painted plate. No flavour is fabricated.
import {
  INVOCATION_IDS,
  invocationById,
  invocationVisible,
  invocationUnlocked,
  activeInvocationCount,
  currentInvokingPower,
  isApexInvocation,
  invocationCostMul,
  type GameState,
  type InvocationDef,
} from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import type { GoetiaEntry } from '../menus/ars-goetia.types.js';
import { INVOCATION_BY_ID, ASSET_BASE } from '../menus/menus.data.js';
import { aurevoraDrainText, invocationEffectText } from './invocationEffect.js';
import { roman } from './format.js';

/** The invoking-power (+ optional Sin level) requirement, shown as the "Seal" on a locked leaf. */
function gateLabel(def: InvocationDef): string {
  return def.sinLevel !== undefined && def.sin !== null
    ? `${def.invokingPower} ${strings.maleficia.invokingPower} \u00B7 ${def.sin} ${roman(def.sinLevel)}`
    : `${def.invokingPower} ${strings.maleficia.invokingPower}`;
}

export interface GoetiaView {
  /** Current invoking power (maleficia + Forneus sigil), pre-formatted for display. */
  readonly invokingPower: string;
  /** Visible invocations (≥ half their invoking-power requirement, 02 §12), as grimoire entries. */
  readonly entries: GoetiaEntry[];
}

/**
 * The grimoire's cost line, showing the REAL CURRENT per-copy upkeep — every amount is softened by
 * the live invocation cost cuts (`invocationCostMul`: the Orobas #55 / Zepar #16 / Andrealphus #65
 * channel and Black Vessel), exactly as `invocationUpkeep` charges it, so what the grimoire shows is
 * what a copy actually costs now. Aurevora's cost is its exponential gold drain (apex.ts), softened
 * the same way; free invocations read "free".
 */
function invocationCostLabel(state: GameState, def: InvocationDef): string {
  const r = strings.resources;
  const U = strings.invocations.outcomeUnits;
  if (def.id === 'aurevora') return aurevoraDrainText(state);
  const u = def.upkeep;
  if (!u) return strings.invocations.free;
  const costMul = invocationCostMul(state);
  const soften = (x: number): number => x * costMul;
  const pct = (x: number): number => Math.round(soften(x) * 100);
  const num = (x: number): string => {
    const v = soften(x);
    return String(Number(v >= 10 ? v.toFixed(0) : v.toFixed(2)));
  };
  const parts: string[] = [];
  if (u.gold) parts.push(`${num(u.gold)} ${r.gold}/s`);
  if (u.influence) parts.push(`${num(u.influence)} ${r.influence}/s`);
  if (u.goldGainFraction && u.goldGainFraction === u.influenceGainFraction) {
    parts.push(`${pct(u.goldGainFraction)}% ${r.gold} + ${r.influence} gain/s`);
  } else {
    if (u.goldGainFraction) parts.push(`${pct(u.goldGainFraction)}% ${r.gold} gain/s`);
    if (u.influenceGainFraction)
      parts.push(`${pct(u.influenceGainFraction)}% ${r.influence} gain/s`);
  }
  if (u.reprobate) parts.push(`${num(u.reprobate)} ${U.reprobates}/s`);
  if (u.reprobateFraction) parts.push(`${pct(u.reprobateFraction)}% ${U.reprobates}/s`);
  if (u.desidia) parts.push(`${num(u.desidia)} ${r.desidia}/s`);
  return parts.length > 0 ? parts.join(' · ') : strings.invocations.free;
}

/** Build the grimoire's presentation view from authoritative sim state. The index is CLUSTERED by
 *  Cardinal Sin level (the unaligned Familiar first), and ordered by required invoking power within
 *  each cluster — the same reading order the design's Ars Goetia expects. */
export function buildGoetia(state: GameState): GoetiaView {
  const power = currentInvokingPower(state);
  const entries: GoetiaEntry[] = [];
  const ordered = INVOCATION_IDS.filter((id) => {
    const def = invocationById(id);
    return def !== undefined && invocationVisible(state, def);
  }).sort((a, b) => {
    const da = invocationById(a)!;
    const db = invocationById(b)!;
    const la = da.sinLevel ?? 0;
    const lb = db.sinLevel ?? 0;
    if (la !== lb) return la - lb; // cluster by Sin level (Familiar, no level, first)
    if (da.invokingPower !== db.invokingPower) return da.invokingPower - db.invokingPower; // then by IP
    return INVOCATION_IDS.indexOf(a) - INVOCATION_IDS.indexOf(b); // stable within a cluster
  });
  let rankNo = 0; // sequential index numeral for the ranked seals (the Familiar carries none)
  ordered.forEach((id) => {
    const def = invocationById(id)!;
    const unlocked = invocationUnlocked(state, def);
    const active = activeInvocationCount(state, def.id);
    const atCap = def.maxActive !== undefined && active >= def.maxActive;
    // The "Bound" field shows the live count of summoned entities (player request): e.g. "3" while
    // three copies are active (was a generic "bound" badge that hid the count). Absent when none.
    const bound = active > 0 ? String(active) : undefined;
    const flavour = INVOCATION_BY_ID[id]; // design art/lore for the illustrated entries
    // Effect is a MECHANIC, so it comes from the authoritative sim (same source as the Analytics
    // Invocations tab) — never the static menus.data.ts copy, which went stale. Lore/art stay flavour.
    const effect = invocationEffectText(state, id);
    const lore = flavour?.lore ?? '';
    entries.push({
      id,
      name: strings.invocations.names[id] ?? flavour?.name ?? id,
      // The Familiar is the base creature, not one of the ranked seals — it carries no numeral. Every
      // other seal gets a sequential Roman numeral by its position in the index (not the design's
      // per-id flavour rank), so the index reads I, II, III, … with no Arabic fallthrough.
      rank: id === 'familiar' ? '' : roman(++rankNo),
      cost: invocationCostLabel(state, def),
      // Max simultaneously active: the number, or "Unlimited" for the stackable (uncapped) entries.
      cap: def.maxActive === undefined ? strings.invocations.capUnlimited : String(def.maxActive),
      // Apex entities (Sin level 3) are one-kind-per-lifetime — flagged so the UI can distinguish them.
      isApex: isApexInvocation(def),
      unlocked,
      active,
      atCap,
      // Optional fields omitted (not set to undefined) per exactOptionalPropertyTypes: a locked
      // entry carries its real gate; the effect/lore/bound lines degrade to absent.
      ...(unlocked ? {} : { gate: gateLabel(def) }),
      ...(bound ? { bound } : {}),
      ...(effect ? { effect } : {}),
      ...(lore ? { lore } : {}),
      // The painted plate (Claude Design, "Invocation Plates"), not the photorealistic creature
      // art: one baked PNG per invocation in its own folder, keyed by id (src/art holds the source
      // and scripts/bake-invocation-plates.ts bakes it). A plate that fails to load is hidden.
      illus: `${ASSET_BASE}/invocations-ars-goetia/${id}.png`,
    });
  });
  return { invokingPower: String(power), entries };
}
