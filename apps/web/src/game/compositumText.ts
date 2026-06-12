// Vitium Compositum toggle copy: the two explanatory lines shown under each ceremony in the PC —
// a clear per-second cost, and a specific, quantified "Expected outcomes:" line. Pure string
// builders over the sim's authoritative `CompositumDef`, so they're unit-testable on their own.
import { strings } from '@panvitium/shared';
import type { CompositumDef } from '@panvitium/sim';

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
  if (def.percentCost) {
    const src =
      def.percentCost.base === 'goldGain'
        ? strings.compositum.ofGoldGain
        : strings.compositum.ofInfluenceGain;
    parts.push(`${pctStr(def.percentCost.fraction)} ${src}`);
  }
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
  if (def.percentOutput) {
    const src =
      def.percentOutput.base === 'goldGain'
        ? strings.compositum.ofGoldGain
        : strings.compositum.ofInfluenceGain;
    const dst = def.percentOutput.resource === 'gold' ? gold : inf;
    e.push(`+${pctStr(def.percentOutput.fraction)} ${src} \u2192 ${dst}/s`);
  }
  if (def.generationRateBoost)
    e.push(`+${pctStr(def.generationRateBoost)} ${strings.compositum.toBreeding}`);
  if (def.suicideRateBoost)
    e.push(`+${pctStr(def.suicideRateBoost)} ${strings.compositum.toDespair}`);
  if (def.murderRateBoost) e.push(`+${pctStr(def.murderRateBoost)} ${strings.compositum.toKnives}`);
  if (def.offlineGainBoost)
    e.push(`+${pctStr(def.offlineGainBoost)} ${strings.compositum.offlineGain}`);
  if (def.panvitiumRateBase) e.push(strings.compositum.panvitiumEffect);
  const body = e.length > 0 ? e.join(' \u00B7 ') : strings.compositum.noOutcome;
  return `${strings.compositum.outcomes}: ${body}`;
}
