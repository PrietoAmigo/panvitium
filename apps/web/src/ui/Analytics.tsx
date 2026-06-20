import { useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import {
  ACTIONS,
  INVOCATION_IDS,
  activeInvocationCount,
  invocationById,
  invocationRunnerEfficiency,
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

type AnalyticsTab = 'main' | 'actions';

/** An efficiency multiplier as a compact "N×" label (whole numbers bare, fractions to 2 decimals). */
function effLabel(eff: number): string {
  return Number.isInteger(eff) ? `${eff}×` : `${eff.toFixed(2)}×`;
}

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

/** Player action efficiency (Sin levels / skills / invocations), as a labelled list value. */
function EfficiencyRow(): ReactElement {
  const eff = useGameStore((s) => (s.state ? playerEfficiency(s.state) : 1));
  const value = Number.isInteger(eff) ? `${eff}×` : `${eff.toFixed(1)}×`;
  return <StatRow label={strings.analytics.playerEfficiency} value={value} />;
}

/**
 * The Main tab (Resources + Reprobates folded together, in this order): the live resource readouts —
 * Souls, Influence, Gold — then the reprobate population with its generation / death rates. The player
 * action + efficiency now live on the Actions tab (alongside the acolyte / invocation work boards), so
 * the same readout never appears twice.
 */
function MainTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const mods = computeModifiers(state);
  const rates = perSecondRates(state);
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const perSec = (v: string): string => `+${v}/s`;

  const repRates = reprobateRates(state, mods);
  const reps = state.lifetime.reprobates;
  const deaths = repRates.suicidePerSecond + repRates.murderPerSecond;
  const num = (n: number): string => Math.floor(n).toLocaleString('en-US');
  const repPerSec = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}/s`;

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
      <div className="analytics-rates">
        <StatRow label={strings.analytics.reprobates} value={num(reps)} />
        <StatRow
          label={strings.analytics.generation}
          value={repPerSec(repRates.generationPerSecond)}
        />
        <StatRow label={strings.analytics.deaths} value={repPerSec(-deaths)} />
        <StatRow
          label={strings.analytics.byMurder}
          value={repPerSec(-repRates.murderPerSecond)}
          indent
        />
        <StatRow
          label={strings.analytics.bySuicide}
          value={repPerSec(-repRates.suicidePerSecond)}
          indent
        />
      </div>
    </div>
  );
}

/**
 * The PC's Analytics program (5.4): the live numeric readouts pulled out of the always-on HUD into
 * an on-demand panel. Two tabs — Main (resources + the reprobate population + dynamics rates) and
 * Actions (the unified work board: the player's efficiency + in-flight rite, then each acolyte, then
 * each bound invocation, every one with its efficiency, current action, and progress bar).
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
        {tabBtn('actions', strings.analytics.actions)}
      </div>
      {tab === 'main' && <MainTab />}
      {tab === 'actions' && <ActionsTab />}
    </>
  );
}

/** Row: a label, a primary value, and an optional per-second rate / suffix detail. `indent` marks a
 *  sub-row (e.g. a death-cause breakdown nested under its total). */
function StatRow({
  label,
  value,
  rate,
  detail,
  indent,
}: {
  label: string;
  value: string;
  rate?: string;
  detail?: string;
  indent?: boolean;
}): ReactElement {
  return (
    <div className={'analytics-row' + (indent ? ' analytics-row--indent' : '')}>
      <span className="analytics-label">{label}</span>
      <span className="analytics-value">{value}</span>
      {detail !== undefined && <span className="analytics-detail">{detail}</span>}
      {rate !== undefined && <span className="analytics-rate">{rate}</span>}
    </div>
  );
}

/**
 * One acolyte per row: its action efficiency, its current action, the remaining cycle time, and a
 * progress bar. Idle acolytes still show their efficiency (it applies the moment they're assigned).
 */
function AcolyteRow({ state, id }: { state: GameState; id: number }): ReactElement | null {
  const acolyte = state.lifetime.acolytes.find((a) => a.id === id);
  if (!acolyte) return null;
  const idle = acolyte.assignedAction === null;
  const name = idle ? strings.acolytes.idle : actionName(acolyte.assignedAction as string);
  const eff = Math.max(computeModifiers(state).acolyteEfficiencyMul, 1e-9);

  let bar: ReactElement | null = null;
  let remaining = '';
  if (!idle && acolyte.remainingSeconds !== null) {
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
      <span className="analytics-acolyte-eff">{effLabel(eff)}</span>
      <span className="analytics-acolyte-action">{name}</span>
      {remaining !== '' && <span className="analytics-acolyte-time">{remaining}</span>}
      {bar}
    </div>
  );
}

/**
 * One bound invocation per row. Runners (the autonomous channels — Familiar, Imp, Upir, Lamia, Harpy,
 * Succubus, …) show their per-copy runner efficiency, their action, the primary channel's remaining
 * cycle time, and a 0→100% progress bar (the same `actionProgress` rule the player/acolyte bars use).
 * Passive invocations carry no action, so they keep their live quantified total-effect line instead.
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
  // Stackable invocations may hold multiple copies, but we never show the count \u2014 a stacked
  // invocation reads as a single bound entry, not "name \u00D7N".
  const countLabel = strings.invocations.names[id] ?? id;
  const auto = def.autonomous;

  // Passive invocation: no action/progress \u2014 show its modifier delta as before.
  if (!auto) {
    const detail = invocationEffectText(state, id);
    return (
      <div className="analytics-invocation analytics-invocation--passive">
        <span className="analytics-inv-name">{countLabel}</span>
        {detail !== '' && <span className="analytics-inv-detail">{detail}</span>}
      </div>
    );
  }

  // Runner invocation: efficiency + action + progress bar. The primary channel's timer keys off the
  // bare id (`invocationRunnerKey(id, 0)`); it's absent until the first cycle starts, so the bar reads
  // 0% until then.
  const eff = invocationRunnerEfficiency(state, def);
  const remaining = state.lifetime.invocationRunners[id] ?? null;
  const pct = remaining !== null ? actionProgress(auto.action, remaining, eff) : 0;
  const time = remaining !== null ? formatDuration(Math.max(0, Math.ceil(remaining)) * 1000) : '';

  return (
    <div className="analytics-invocation">
      <span className="analytics-inv-name">{countLabel}</span>
      <span className="analytics-inv-eff">{effLabel(eff)}</span>
      <span className="analytics-inv-action">{actionName(auto.action)}</span>
      {time !== '' && <span className="analytics-inv-time">{time}</span>}
      <span className="analytics-bar">
        <span className="analytics-bar-fill" style={{ width: `${(pct * 100).toFixed(0)}%` }} />
      </span>
    </div>
  );
}

/** Bound invocations ordered for the Actions tab: by required Cardinal Sin level (decreasing), then
 *  alphabetically by display name (increasing). The unaligned Familiar (no Sin level) sorts last. */
function orderedBoundInvocations(state: GameState): string[] {
  return INVOCATION_IDS.filter((id) => activeInvocationCount(state, id) > 0).sort((a, b) => {
    const la = invocationById(a)?.sinLevel ?? 0;
    const lb = invocationById(b)?.sinLevel ?? 0;
    if (la !== lb) return lb - la;
    const na = strings.invocations.names[a] ?? a;
    const nb = strings.invocations.names[b] ?? b;
    return na.localeCompare(nb);
  });
}

/**
 * The unified Actions board: three sections in order — the Player (efficiency + the in-flight rite and
 * its progress), each Acolyte's work, then each bound Invocation's work. Every section reads the same
 * efficiency / current-action / progress-bar shape so the player can see, at a glance, everything that
 * is acting on their behalf.
 */
function ActionsTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const acolytes = state.lifetime.acolytes;
  const bound = orderedBoundInvocations(state);

  return (
    <div className="analytics-actions">
      <section className="analytics-section">
        <h4 className="analytics-section-title">{strings.analytics.player}</h4>
        <div className="analytics-list">
          <EfficiencyRow />
        </div>
        <ActiveActions />
      </section>

      <section className="analytics-section">
        <h4 className="analytics-section-title">{strings.analytics.acolytes}</h4>
        {acolytes.length === 0 ? (
          <p className="pc-empty">{strings.analytics.noAcolytes}</p>
        ) : (
          <div className="analytics-acolytes">
            {acolytes.map((a) => (
              <AcolyteRow key={a.id} state={state} id={a.id} />
            ))}
          </div>
        )}
      </section>

      <section className="analytics-section">
        <h4 className="analytics-section-title">{strings.analytics.invocations}</h4>
        {bound.length === 0 ? (
          <p className="pc-empty">{strings.invocations.noneBound}</p>
        ) : (
          <div className="analytics-invocations">
            {bound.map((id) => {
              const def = invocationById(id);
              return def ? <InvocationRow key={id} state={state} id={id} def={def} /> : null;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
