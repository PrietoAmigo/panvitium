import { useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import {
  ACTIONS,
  REPROBATE_SUBTYPES,
  INVOCATION_IDS,
  activeInvocationCount,
  invocationById,
  invocationRunnerEfficiency,
  runnerCycleDuration,
  actionOutcomeForecast,
  categoryEfficiency,
  computeModifiers,
  perSecondRates,
  playerEfficiency,
  reprobateRates,
  bn,
  gt,
  mul,
  ZERO,
  type ActionTimer,
  type GameState,
  type InvocationDef,
  type OutcomeForecast,
  type OutcomeMoment,
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';
import { actionProgress } from '../game/progress.js';
import { actionName } from '../game/labels.js';

type AnalyticsTab = 'main' | 'reprobates' | 'acolytes' | 'invocations';

const NO_TIMERS: readonly ActionTimer[] = [];

/** In-flight Opera timers with progress, so a queued rite is visible while it resolves. The bar
 *  fills 0→100% via the shared `actionProgress` rule (faster at higher efficiency, never offset). */
function ActiveActions(): ReactElement {
  const state = useGameStore((s) => s.state);
  const queue = state?.lifetime.actionQueue ?? NO_TIMERS;
  if (queue.length === 0) return <div className="active-actions idle">{strings.opera.idle}</div>;
  return (
    <div className="active-actions">
      {queue.map((t, i) => {
        const def = ACTIONS[t.actionId];
        const eff = state && def ? categoryEfficiency(state, def.category) : 1;
        const pct = actionProgress(t.actionId, t.remainingSeconds, eff);
        const name = actionName(t.actionId);
        return (
          <div className="action-progress" key={`${i}-${t.actionId}`}>
            <span className="action-progress-label">
              {name} · {Math.ceil(t.remainingSeconds)}s
            </span>
            <span className="action-progress-bar">
              <span
                className="action-progress-fill"
                style={{ width: `${(pct * 100).toFixed(0)}%` }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The vigil indicator: logical session time, advancing with the 10 Hz tick loop. */
function Vigil(): ReactElement {
  const lastTickAt = useGameStore((s) => s.state?.lastTickAt ?? 0);
  const seconds = Math.floor(lastTickAt / 1000) % 3600;
  const mm = Math.floor(seconds / 60);
  const ss = (seconds % 60).toString().padStart(2, '0');
  return (
    <div className="vigil" title="The tick loop is running">
      <span className="vigil-dot" />
      vigil kept · {mm}:{ss}
    </div>
  );
}

/** Player action efficiency (Sin levels / skills / invocations), as a labelled list value. */
function EfficiencyRow(): ReactElement {
  const eff = useGameStore((s) => (s.state ? playerEfficiency(s.state) : 1));
  const value = Number.isInteger(eff) ? `${eff}×` : `${eff.toFixed(1)}×`;
  return <StatRow label={strings.analytics.playerEfficiency} value={value} />;
}

/**
 * The Main tab (the old Main + Resources folded together, in this order): the live resource readouts
 * — Souls, Influence, Gold — then the in-flight player action as a 0→100% progress bar, the player's
 * action efficiency, and the vigil indicator.
 */
function MainTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const mods = computeModifiers(state);
  const rates = perSecondRates(state);
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const perSec = (v: string): string => `+${v}/s`;

  return (
    <div className="analytics-main">
      <div className="analytics-list">
        <StatRow label={strings.resources.souls} value={formatBigNum(state.souls)} />
        <StatRow
          label={strings.resources.influence}
          value={formatBigNum(state.lifetime.influence)}
          detail={`${strings.analytics.ofMax} ${formatBigNum(effectiveMax)}`}
          {...(gt(rates.influence, ZERO) ? { rate: perSec(formatBigNum(rates.influence)) } : {})}
        />
        <StatRow
          label={strings.resources.gold}
          value={formatBigNum(state.lifetime.gold)}
          {...(rates.gold > 0 ? { rate: perSec(formatBigNum(bn(rates.gold))) } : {})}
        />
      </div>
      <ActiveActions />
      <div className="analytics-list">
        <EfficiencyRow />
      </div>
      <Vigil />
    </div>
  );
}

/**
 * The PC's Analytics program (5.4): the live numeric readouts pulled out of the always-on HUD into
 * an on-demand panel. Four tabs — Main (resources + rates, the in-flight action, efficiency, vigil),
 * the reprobate population (unconverted vs converted by subtype) + dynamics rates, a per-acolyte
 * work board, and the bound invocations (count, runner channel efficiency / total effect).
 */
export function AnalyticsGroup(): ReactElement {
  const [tab, setTab] = useState<AnalyticsTab>('main');
  const present = useGameStore((s) => s.state !== null);
  if (!present) return <p className="pc-empty">{strings.opera.notYet}.</p>;

  const tabBtn = (id: AnalyticsTab, label: string): ReactElement => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      className={'kat-tab' + (tab === id ? ' kat-tab--active' : '')}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="kat-pager" role="tablist">
        {tabBtn('main', strings.analytics.main)}
        {tabBtn('reprobates', strings.analytics.reprobates)}
        {tabBtn('acolytes', strings.analytics.acolytes)}
        {tabBtn('invocations', strings.analytics.invocations)}
      </div>
      {tab === 'main' && <MainTab />}
      {tab === 'reprobates' && <ReprobatesTab />}
      {tab === 'acolytes' && <AcolytesTab />}
      {tab === 'invocations' && <InvocationsTab />}
    </>
  );
}

/** Row: a label, a primary value, and an optional per-second rate / suffix detail. */
function StatRow({
  label,
  value,
  rate,
  detail,
}: {
  label: string;
  value: string;
  rate?: string;
  detail?: string;
}): ReactElement {
  return (
    <div className="analytics-row">
      <span className="analytics-label">{label}</span>
      <span className="analytics-value">{value}</span>
      {detail !== undefined && <span className="analytics-detail">{detail}</span>}
      {rate !== undefined && <span className="analytics-rate">{rate}</span>}
    </div>
  );
}

function ReprobatesTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const mods = computeModifiers(state);
  const rates = reprobateRates(state, mods);
  const reps = state.lifetime.reprobates;
  const deaths = rates.suicidePerSecond + rates.murderPerSecond;
  const converted = REPROBATE_SUBTYPES.filter((t) => t !== 'reprobate' && reps[t] > 0);
  const totalConverted = converted.reduce((sum, t) => sum + reps[t], 0);
  const num = (n: number): string => Math.floor(n).toLocaleString('en-US');
  const perSec = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}/s`;

  return (
    <>
      <div className="analytics-rates">
        <StatRow label={strings.analytics.generation} value={perSec(rates.generationPerSecond)} />
        <StatRow label={strings.analytics.conversion} value={perSec(rates.conversionPerSecond)} />
        <StatRow label={strings.analytics.deaths} value={perSec(-deaths)} />
      </div>
      <div className="analytics-list">
        <StatRow label={strings.analytics.unconverted} value={num(reps.reprobate)} />
        {converted.length === 0 ? (
          <p className="pc-empty">{strings.analytics.noConverted}</p>
        ) : (
          <>
            {converted.map((t) => (
              <StatRow key={t} label={strings.subtypes[t]} value={num(reps[t])} />
            ))}
            <StatRow label={strings.analytics.totalConverted} value={num(totalConverted)} />
          </>
        )}
      </div>
    </>
  );
}

/** One acolyte per row: its current action and the remaining cycle time, with a progress bar. */
function AcolyteRow({ state, id }: { state: GameState; id: number }): ReactElement | null {
  const acolyte = state.lifetime.acolytes.find((a) => a.id === id);
  if (!acolyte) return null;
  const idle = acolyte.assignedAction === null;
  const name = idle ? strings.acolytes.idle : actionName(acolyte.assignedAction as string);

  let bar: ReactElement | null = null;
  let remaining = '';
  if (!idle && acolyte.remainingSeconds !== null) {
    const eff = Math.max(computeModifiers(state).acolyteEfficiencyMul, 1e-9);
    const pct = actionProgress(acolyte.assignedAction as string, acolyte.remainingSeconds, eff);
    remaining = formatDuration(Math.max(0, Math.ceil(acolyte.remainingSeconds)) * 1000);
    bar = (
      <span className="analytics-bar">
        <span className="analytics-bar-fill" style={{ width: `${(pct * 100).toFixed(0)}%` }} />
      </span>
    );
  }

  return (
    <div className={'analytics-acolyte' + (idle ? ' analytics-acolyte--idle' : '')}>
      <span className="analytics-acolyte-name">
        {strings.acolytes.acolyte} {id}
      </span>
      <span className="analytics-acolyte-action">{name}</span>
      {bar}
      {remaining !== '' && <span className="analytics-acolyte-time">{remaining}</span>}
    </div>
  );
}

function AcolytesTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const acolytes = state.lifetime.acolytes;
  if (acolytes.length === 0) return <p className="pc-empty">{strings.analytics.noAcolytes}</p>;
  return (
    <div className="analytics-acolytes">
      {acolytes.map((a) => (
        <AcolyteRow key={a.id} state={state} id={a.id} />
      ))}
    </div>
  );
}

/**
 * The live, quantified "total effect" of a passive invocation at its current bound count — computed
 * by diffing the real modifier bundle with vs without this invocation, so each contribution is
 * isolated exactly (composition is multiplicative/additive). Entities whose effect isn't a
 * modifier-bundle magnitude (Katabasis apexes, per-tick apexes, the conversion-bias Specunitas) fall
 * back to their qualitative line.
 */
function passiveEffectText(state: GameState, id: string): string {
  const L = strings.invocations.effectLabels;
  const w = computeModifiers(state);
  const b = computeModifiers({
    ...state,
    lifetime: {
      ...state.lifetime,
      invocations: { ...state.lifetime.invocations, [id]: 0 },
    },
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
    case 'harpy':
      return up(w.decimatioEfficiencyMul, b.decimatioEfficiencyMul, L.decimatioEff);
    case 'plutus':
      return up(w.vitiumMercaturaOutputMul, b.vitiumMercaturaOutputMul, L.vmOutput);
    case 'behemoth': {
      const ws = w.tierWeightMul.stellar ?? 0;
      const bs = b.tierWeightMul.stellar ?? 0;
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
      const wa = w.tierWeightMul.apocalyptic ?? 0;
      const ba = b.tierWeightMul.apocalyptic ?? 0;
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
function formatForecast(f: OutcomeForecast): string {
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
 * One bound invocation per row, a single line (no per-copy detail, for performance). Runners (the
 * autonomous channels — Familiar, Imp, Upir, Lamia) show their action, what one cycle yields, and the
 * current cycle time; passive invocations show their live quantified total effect at the current
 * bound count.
 */
function InvocationRow({
  state,
  id,
  def,
}: {
  state: GameState;
  id: string;
  def: InvocationDef;
}): ReactElement {
  const count = activeInvocationCount(state, id);
  const name = strings.invocations.names[id] ?? id;
  const countLabel = count > 1 ? `${name} \u00D7${count}` : name;
  const auto = def.autonomous;

  let detail: string;
  if (auto) {
    const action = actionName(auto.action);
    const eff = invocationRunnerEfficiency(state, def);
    const outcome = formatForecast(actionOutcomeForecast(state, auto.action, eff, auto.forcedTier));
    const dur = runnerCycleDuration(auto.action, eff);
    const cadence =
      Number.isFinite(dur) && dur > 0
        ? `${strings.invocations.every} ${formatDuration(dur * 1000)}`
        : '';
    detail = [action, outcome, cadence].filter((s) => s !== '').join(' \u00B7 ');
  } else {
    detail = passiveEffectText(state, id);
  }

  return (
    <div className={'analytics-invocation' + (auto ? '' : ' analytics-invocation--passive')}>
      <span className="analytics-inv-name">{countLabel}</span>
      {detail !== '' && <span className="analytics-inv-detail">{detail}</span>}
    </div>
  );
}

/** Bound invocations, one line each: action + outcome + cycle time (runners) or total effect (passive). */
function InvocationsTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const bound = INVOCATION_IDS.filter((id) => activeInvocationCount(state, id) > 0);
  if (bound.length === 0) return <p className="pc-empty">{strings.invocations.noneBound}</p>;
  return (
    <div className="analytics-invocations">
      {bound.map((id) => {
        const def = invocationById(id);
        return def ? <InvocationRow key={id} state={state} id={id} def={def} /> : null;
      })}
    </div>
  );
}
