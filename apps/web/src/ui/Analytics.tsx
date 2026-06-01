import { useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import {
  ACTIONS,
  REPROBATE_SUBTYPES,
  computeModifiers,
  perSecondRates,
  reprobateRates,
  bn,
  gt,
  mul,
  ZERO,
  type GameState,
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';
import { actionName } from '../game/labels.js';

type AnalyticsTab = 'resources' | 'reprobates' | 'acolytes';

/**
 * The PC's Analytics program (5.4): the live numeric readouts pulled out of the always-on HUD into
 * an on-demand panel. Three tabs — current resources + rates, the reprobate population (unconverted
 * vs converted by subtype) + dynamics rates, and a per-acolyte work board.
 */
export function AnalyticsGroup(): ReactElement {
  const [tab, setTab] = useState<AnalyticsTab>('resources');
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
        {tabBtn('resources', strings.analytics.resources)}
        {tabBtn('reprobates', strings.analytics.reprobates)}
        {tabBtn('acolytes', strings.analytics.acolytes)}
      </div>
      {tab === 'resources' && <ResourcesTab />}
      {tab === 'reprobates' && <ReprobatesTab />}
      {tab === 'acolytes' && <AcolytesTab />}
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

function ResourcesTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const mods = computeModifiers(state);
  const rates = perSecondRates(state);
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const perSec = (v: string): string => `+${v}/s`;

  return (
    <div className="analytics-list">
      <StatRow label={strings.resources.souls} value={formatBigNum(state.souls)} />
      <StatRow
        label={strings.resources.gold}
        value={formatBigNum(state.lifetime.gold)}
        {...(rates.gold > 0 ? { rate: perSec(formatBigNum(bn(rates.gold))) } : {})}
      />
      <StatRow
        label={strings.resources.influence}
        value={formatBigNum(state.lifetime.influence)}
        detail={`${strings.analytics.ofMax} ${formatBigNum(effectiveMax)}`}
        {...(gt(rates.influence, ZERO) ? { rate: perSec(formatBigNum(rates.influence)) } : {})}
      />
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
    const base = ACTIONS[acolyte.assignedAction as string]?.baseTimeSeconds ?? 1;
    const total = base / eff;
    const pct = Math.max(0, Math.min(1, 1 - acolyte.remainingSeconds / total));
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
  const ids = useGameStore((s) => (s.state ? s.state.lifetime.acolytes.map((a) => a.id) : []));
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  if (ids.length === 0) return <p className="pc-empty">{strings.analytics.noAcolytes}</p>;
  return (
    <div className="analytics-acolytes">
      {ids.map((id) => (
        <AcolyteRow key={id} state={state} id={id} />
      ))}
    </div>
  );
}
