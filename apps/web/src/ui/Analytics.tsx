import { useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import {
  ACTIONS,
  INVOCATION_IDS,
  activeInvocationCount,
  invocationById,
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
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';
import { actionProgress } from '../game/progress.js';
import { actionName } from '../game/labels.js';
import { invocationEffectText } from '../game/invocationEffect.js';

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
  const num = (n: number): string => Math.floor(n).toLocaleString('en-US');
  const perSec = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}/s`;

  return (
    <>
      <div className="analytics-rates">
        <StatRow label={strings.analytics.generation} value={perSec(rates.generationPerSecond)} />
        <StatRow label={strings.analytics.deaths} value={perSec(-deaths)} />
      </div>
      <div className="analytics-list">
        <StatRow label={strings.analytics.reprobates} value={num(reps)} />
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
  const detail = invocationEffectText(state, id);

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
