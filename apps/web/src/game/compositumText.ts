// Vitium Compositum toggle copy: the two explanatory lines shown under each ceremony in the PC —
// a clear per-second cost, and a specific, quantified "Expected outcomes:" line. Pure string
// builders over the sim's authoritative `CompositumDef`, so they're unit-testable on their own.
import { strings } from '@panvitium/shared';
import type { CompositumDef, ReprobateSubtype } from '@panvitium/sim';

/** Display names for the subtypes in a list, e.g. 'Gamblers & Cholerics'. */
function subtypeNames(subtypes: readonly ReprobateSubtype[], sep: string): string {
  return subtypes.map((s) => strings.subtypes[s]).join(sep);
}

/** The subtypes a conversion bias actually favours (weight > 0). */
function biasSubtypes(bias: Partial<Record<ReprobateSubtype, number>>): ReprobateSubtype[] {
  return (Object.keys(bias) as ReprobateSubtype[]).filter((k) => (bias[k] ?? 0) > 0);
}

/** A fraction as a tidy percent: 0.1 → '10%', 0.001 → '0.1%', 0.01 → '1%'. */
function pctStr(x: number): string {
  return `${parseFloat((x * 100).toFixed(4))}%`;
}

/** Line 1 — the per-second upkeep a toggle must keep paying (it auto-ends if it can't). */
export function compositumCostLine(def: CompositumDef): string {
  const parts: string[] = [];
  if (def.costPerSecond.gold) parts.push(`${def.costPerSecond.gold} ${strings.resources.gold}/s`);
  if (def.costPerSecond.influence)
    parts.push(`${def.costPerSecond.influence} ${strings.resources.influence}/s`);
  let body = parts.length > 0 ? parts.join(' \u00B7 ') : strings.compositum.noCost;
  if (def.costGrowthPerSecond) body += ` (${strings.compositum.rising})`;
  return `${strings.compositum.cost}: ${body}`;
}

/** Line 2 — the specific per-second effects while the toggle is active. */
export function compositumOutcomesLine(def: CompositumDef): string {
  const e: string[] = [];
  const gold = strings.resources.gold;
  const inf = strings.resources.influence;
  if (def.goldPerSecond) e.push(`+${def.goldPerSecond} ${gold}/s`);
  if (def.influencePerSecond) e.push(`+${def.influencePerSecond} ${inf}/s`);
  if (def.conversionPerSecond && def.subtypeBias) {
    const subs = biasSubtypes(def.subtypeBias);
    const only = subs.length === 1 ? ` ${strings.compositum.only}` : '';
    e.push(
      `${strings.compositum.converts} ${def.conversionPerSecond}/s \u2192 ${subtypeNames(subs, ' & ')}${only}`,
    );
  }
  if (def.populationGeneration) {
    const list = subtypeNames(def.populationGeneration.subtypes, ' + ');
    e.push(
      `${strings.compositum.breeds} ${pctStr(def.populationGeneration.fraction)} ${strings.compositum.of} ${list}/s`,
    );
  }
  if ((def.flatGenerationPerSecond ?? 0) < 0)
    e.push(`${strings.compositum.slowsBirths} ${Math.abs(def.flatGenerationPerSecond!)}/s`);
  if (def.flatBaseSuicideRatePerSecond)
    e.push(`${strings.compositum.raisesSuicide} ${def.flatBaseSuicideRatePerSecond}/s`);
  if (def.flatBaseCholericMurderRatePerSecond)
    e.push(`${strings.compositum.raisesMurder} ${def.flatBaseCholericMurderRatePerSecond}/s`);
  if (def.deathFractionPerSecond)
    e.push(
      `${strings.compositum.culls} ${pctStr(def.deathFractionPerSecond)} ${strings.compositum.ofAll}`,
    );
  if (def.penaltyIncrease)
    e.push(
      `${strings.compositum.deepens} ${subtypeNames(def.penaltyIncrease.subtypes, ', ')} ${strings.compositum.penaltiesBy} ${def.penaltyIncrease.amount}`,
    );
  if (def.offlineGainBoost)
    e.push(`+${pctStr(def.offlineGainBoost)} ${strings.compositum.offlineGain}`);
  const body = e.length > 0 ? e.join(' \u00B7 ') : strings.compositum.noOutcome;
  return `${strings.compositum.outcomes}: ${body}`;
}
