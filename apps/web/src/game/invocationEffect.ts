// Single source of truth for an invocation's human-readable EFFECT line, derived from the
// authoritative sim — used by both the Analytics "Invocations" tab and the Ars Goetia grimoire so the
// two can never drift. Each line is the LIVE quantified magnitude, computed by diffing
// `computeModifiers` with and without the invocation, so it reflects the REAL CURRENT effect after
// every invocation-efficiency increase/decrease (Ira's Retribution, Black Candles, the per-Sin
// sigils). Effects that are not modifier-bundle magnitudes (Astiwihad's world-still carry-over,
// Erinyes's kill-all) fall back to the static, number-baked catalog string.
import { strings } from '@panvitium/shared';
import {
  activeInvocationCount,
  computeModifiers,
  invocationById,
  type GameState,
} from '@panvitium/sim';

/**
 * The live quantified effect line for a passive/modifier invocation, by diffing `computeModifiers`
 * with `max(1, boundCount)` copies against 0 copies — for a bound invocation this is its full current
 * contribution; for an unbound one it is what a single copy would add now (so the grimoire shows a
 * real magnitude before you summon it). Structural apexes (astiwihad/erinyes) fall through to the
 * static catalog string.
 */
function passiveEffectText(state: GameState, id: string): string {
  const L = strings.invocations.effectLabels;
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
  const fmtNum = (x: number): string =>
    String(Number(Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(3)));
  const up = (a: number, c: number, label: string): string =>
    `+${fmtPct((a / c - 1) * 100)}% ${label}`;
  const down = (a: number, c: number, label: string): string =>
    `−${fmtPct((1 - a / c) * 100)}% ${label}`;
  const times = (a: number, c: number, label: string): string =>
    `×${Number((a / c).toFixed(1))} ${label}`;
  const flat = (a: number, c: number, label: string): string => `+${fmtNum(a - c)} ${label}`;
  const tier = (m: typeof w, t: 'stellar' | 'bad'): number => m.tierWeightMul[t] ?? 1;

  switch (id) {
    // ── Player efficiency ──────────────────────────────────────────────────────────────────────
    case 'familiar':
    case 'wendigo':
    case 'doppelgaenger':
      return ok(b.playerEfficiencyMul)
        ? up(w.playerEfficiencyMul, b.playerEfficiencyMul, L.playerEff)
        : '';
    // ── Income multipliers ─────────────────────────────────────────────────────────────────────
    case 'fama':
      return ok(b.influenceRateMul) ? up(w.influenceRateMul, b.influenceRateMul, L.influence) : '';
    case 'specunitas':
      return ok(b.influenceRateMul)
        ? times(w.influenceRateMul, b.influenceRateMul, L.influence)
        : '';
    case 'plutus':
      return ok(b.faenerationOutputMul)
        ? up(w.faenerationOutputMul, b.faenerationOutputMul, L.faeneratioOutput)
        : '';
    // ── Flat per-second income (efficiency-scaled) ─────────────────────────────────────────────
    case 'kobold':
      return flat(w.flatGoldPerSecond, b.flatGoldPerSecond, L.goldPerSecond);
    case 'arachne':
      return flat(w.flatInfluencePerSecond, b.flatInfluencePerSecond, L.influencePerSecond);
    // ── Reprobate dynamics ─────────────────────────────────────────────────────────────────────
    case 'imp':
      return flat(w.flatMurdersPerSecond, b.flatMurdersPerSecond, L.murders);
    case 'banshee':
      return flat(w.flatSuicidesPerSecond, b.flatSuicidesPerSecond, L.suicides);
    case 'empusa':
    case 'lamia':
    case 'succubus':
      return flat(w.flatGenerationPerSecond, b.flatGenerationPerSecond, L.reprobates);
    case 'harpy':
      return `+${fmtNum(w.flatBaseMurderRatePerSecond - b.flatBaseMurderRatePerSecond)}/s ${L.baseMurder}`;
    case 'nightmare':
      return `+${fmtNum(w.flatBaseSuicideRatePerSecond - b.flatBaseSuicideRatePerSecond)}/s ${L.baseSuicide}`;
    // ── Stagnation ─────────────────────────────────────────────────────────────────────────────
    case 'blob':
    case 'morpheus':
      return flat(w.flatStagnationPerSecond, b.flatStagnationPerSecond, L.stagnation);
    // ── Outcome-tier shifts ────────────────────────────────────────────────────────────────────
    case 'behemoth':
      return ok(tier(b, 'stellar')) ? up(tier(w, 'stellar'), tier(b, 'stellar'), L.stellar) : '';
    case 'narcissus':
      return ok(tier(b, 'stellar'))
        ? up(tier(w, 'stellar'), tier(b, 'stellar'), L.positiveChances)
        : '';
    case 'upir':
      return ok(tier(b, 'bad')) ? down(tier(w, 'bad'), tier(b, 'bad'), L.negativeChances) : '';
    // ── Desidia ────────────────────────────────────────────────────────────────────────────────
    case 'lemure':
      return ok(b.desidiaDrainMul)
        ? down(w.desidiaDrainMul, b.desidiaDrainMul, L.desidiaDrain)
        : '';
    // ── Midas: two effects on one line ─────────────────────────────────────────────────────────
    case 'midas': {
      const gold = times(w.goldRateMul, b.goldRateMul, L.gold);
      const wa = w.tierWeightMul.apocalyptic ?? 1;
      const ba = b.tierWeightMul.apocalyptic ?? 1;
      const apoc = ok(ba) ? times(wa, ba, L.apocalyptic) : L.apocLocked;
      return `${gold} · ${apoc}`;
    }
    // ── Aurevora: live ramping efficiency plus the paired gold drain that self-dispels it ───────
    case 'aurevora':
      return `${up(w.playerEfficiencyMul, b.playerEfficiencyMul, L.playerEff)} · ${strings.invocations.aurevoraDrain}`;
    // Structural apex effects (world-still carry-over, kill-all) are not bundle magnitudes.
    default:
      return strings.invocations.effects[id] ?? '';
  }
}

/**
 * The authoritative effect line for an invocation, by id. Returns '' for an unknown id or an effect
 * with no measurable magnitude.
 */
export function invocationEffectText(state: GameState, id: string): string {
  const def = invocationById(id);
  if (!def) return '';
  return passiveEffectText(state, id);
}
