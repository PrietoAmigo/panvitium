// Single source of truth for an invocation's human-readable EFFECT line, derived from the
// authoritative sim — used by both the Analytics "Invocations" tab and the Ars Goetia grimoire so the
// two can never drift (the grimoire previously read hand-authored copy from menus.data.ts that went
// stale). Runners describe their action + expected per-cycle outcome (mean ± sd) + cadence; passives
// describe their live quantified modifier delta at the current bound count (or one copy, if unbound,
// so the catalog still reads meaningfully before you summon it).
import { strings } from '@panvitium/shared';
import {
  activeInvocationCount,
  actionOutcomeForecast,
  computeModifiers,
  invocationById,
  invocationRunnerEfficiency,
  runnerCycleDuration,
  type GameState,
  type OutcomeForecast,
  type OutcomeMoment,
} from '@panvitium/sim';
import { formatDuration } from './format.js';
import { actionName } from './labels.js';

/** Live quantified modifier delta of a passive invocation, by diffing computeModifiers with/without it. */
function passiveEffectText(state: GameState, id: string): string {
  const L = strings.invocations.effectLabels;
  // Describe the marginal effect of at least ONE copy: for a bound invocation this is its full current
  // contribution; for an unbound one (count 0) it's what a single copy would do, so the grimoire still
  // shows a real magnitude instead of "+0%".
  const n = Math.max(1, activeInvocationCount(state, id));
  const w = computeModifiers({
    ...state,
    lifetime: { ...state.lifetime, invocations: { ...state.lifetime.invocations, [id]: n } },
  });
  const b = computeModifiers({
    ...state,
    lifetime: { ...state.lifetime, invocations: { ...state.lifetime.invocations, [id]: 0 } },
  });
  const ok = (x: number): boolean => Number.isFinite(x) && x > 0;
  const fmtPct = (p: number): string => {
    const a = Math.abs(p);
    const s = a >= 10 ? a.toFixed(0) : a >= 1 ? a.toFixed(1) : a.toFixed(2);
    return String(Number(s)); // trim trailing zeros: 0.10 → 0.1, 10.0 → 10
  };
  const up = (a: number, c: number, label: string): string =>
    `+${fmtPct((a / c - 1) * 100)}% ${label}`;
  const down = (a: number, c: number, label: string): string =>
    `\u2212${fmtPct((1 - a / c) * 100)}% ${label}`;
  const times = (a: number, c: number, label: string): string =>
    `\u00D7${Number((a / c).toFixed(1))} ${label}`;

  switch (id) {
    case 'fama':
      return ok(b.influenceRateMul) ? up(w.influenceRateMul, b.influenceRateMul, L.influence) : '';
    case 'specunitas':
      return ok(b.influenceRateMul)
        ? times(w.influenceRateMul, b.influenceRateMul, L.influence)
        : '';
    case 'harpy':
      return up(w.decimatioEfficiencyMul, b.decimatioEfficiencyMul, L.decimatioEff);
    case 'plutus':
      return up(w.vitiumMercaturaOutputMul, b.vitiumMercaturaOutputMul, L.vmOutput);
    case 'behemoth': {
      const ws = w.tierWeightMul.stellar ?? 1;
      const bs = b.tierWeightMul.stellar ?? 1;
      return ok(bs) ? up(ws, bs, L.stellar) : '';
    }
    case 'lemure':
      return ok(b.offlineTimeMul) ? up(w.offlineTimeMul, b.offlineTimeMul, L.offline) : '';
    case 'nightmare': {
      const d = w.flatBaseSuicideRatePerSecond - b.flatBaseSuicideRatePerSecond;
      return `+${Number(d.toFixed(3))}/s ${L.baseSuicide}`;
    }
    case 'succubus':
      return `${up(w.suasioEfficiencyMul, b.suasioEfficiencyMul, L.suasioEff)} \u00B7 ${down(w.goldRateMul, b.goldRateMul, L.gold)}`;
    case 'doppelgaenger':
      return `${up(w.playerEfficiencyMul, b.playerEfficiencyMul, L.playerEff)} \u00B7 ${down(w.influenceRateMul, b.influenceRateMul, L.influence)}`;
    case 'midas': {
      const gold = times(w.goldRateMul, b.goldRateMul, L.gold);
      const wa = w.tierWeightMul.apocalyptic ?? 1;
      const ba = b.tierWeightMul.apocalyptic ?? 1;
      const apoc = ok(ba) ? times(wa, ba, L.apocalyptic) : L.apocLocked;
      return `${gold} \u00B7 ${apoc}`;
    }
    case 'aurevora':
      return up(w.playerEfficiencyMul, b.playerEfficiencyMul, L.playerEff);
    default:
      return strings.invocations.effects[id] ?? '';
  }
}

/** Signed mean: integer-rounded for large magnitudes, 2 decimals otherwise, with a real minus sign. */
function fmtSigned(n: number): string {
  const r = Math.abs(n) >= 10 ? Math.round(n) : Number(n.toFixed(2));
  return `${r < 0 ? '\u2212' : '+'}${Math.abs(r)}`;
}
/** Unsigned magnitude for the ± sd term. */
function fmtNum(n: number): string {
  return String(Number(n >= 10 ? n.toFixed(0) : n.toFixed(2)));
}

/**
 * One runner cycle's expected outcome as "mean ± sd unit" per non-trivial dimension, e.g.
 * "+1 soul, −1 reprobate" (deterministic, sd 0) or "+0.31 ±0.7 reprobates, +0.15 souls". The sd is
 * the listable deviation (√variance); it's omitted when ~0 (a deterministic outcome).
 */
export function formatForecast(f: OutcomeForecast): string {
  const U = strings.invocations.outcomeUnits;
  const parts: string[] = [];
  const add = (m: OutcomeMoment, one: string, many: string): void => {
    if (Math.abs(m.mean) < 0.005 && m.sd < 0.005) return;
    const unit = Math.abs(m.mean) === 1 ? one : many;
    const pm = m.sd >= 0.005 ? ` \u00B1${fmtNum(m.sd)}` : '';
    parts.push(`${fmtSigned(m.mean)}${pm} ${unit}`);
  };
  add(f.souls, U.soul, U.souls);
  add(f.reprobates, U.reprobate, U.reprobates);
  add(f.gold, U.gold, U.gold);
  add(f.maleficia, U.maleficium, U.maleficia);
  return parts.join(', ');
}

/**
 * The authoritative effect line for an invocation, by id. Runner invocations (Familiar, Imp, Upir,
 * Lamia) read as "Action · expected outcome · every <cadence>"; passives read as their live modifier
 * delta. Returns '' for an unknown id or an effect with no measurable magnitude.
 */
export function invocationEffectText(state: GameState, id: string): string {
  const def = invocationById(id);
  if (!def) return '';
  const auto = def.autonomous;
  if (!auto) return passiveEffectText(state, id);
  const action = actionName(auto.action);
  const eff = invocationRunnerEfficiency(state, def);
  const outcome = formatForecast(actionOutcomeForecast(state, auto.action, eff, auto.forcedTier));
  const dur = runnerCycleDuration(auto.action, eff);
  const cadence =
    Number.isFinite(dur) && dur > 0
      ? `${strings.invocations.every} ${formatDuration(dur * 1000)}`
      : '';
  return [action, outcome, cadence].filter((s) => s !== '').join(' \u00B7 ');
}
