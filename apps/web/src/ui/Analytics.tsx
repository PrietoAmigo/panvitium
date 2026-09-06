import { useMemo, useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import {
  ACTIONS,
  INVOCATION_IDS,
  activeInvocationCount,
  invocationById,
  invocationRunnerEfficiency,
  categoryEfficiency,
  computeModifiers,
  reprobateRates,
  resourceFlows,
  playerEfficiency,
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
import { offlineFactors, offlineProjection, type OfflineBuff } from '../game/session.js';

type AnalyticsTab = 'main' | 'actions' | 'offline';

/** The away-windows the Offline tab can project over: one hour (default), eight hours, one day. */
const OFFLINE_WINDOWS: readonly { readonly seconds: number; readonly label: string }[] = [
  { seconds: 3600, label: strings.analytics.window1h },
  { seconds: 8 * 3600, label: strings.analytics.window8h },
  { seconds: 24 * 3600, label: strings.analytics.window24h },
];

/**
 * How often (ms of logical game time) the Offline projection is allowed to recompute. The projection
 * runs a full `resumeGame` catch-up, so it is memoized on a QUANTIZED clock bucket (below) rather than
 * on the live `lastTickAt` — which advances every 10 Hz tick and would defeat the memo. The estimate
 * refreshes at most once per this interval (and immediately when the away-window changes).
 */
const OFFLINE_REFRESH_MS = 2000;

/** An efficiency multiplier as a compact "N×" label (whole numbers bare, fractions to 2 decimals). */
function effLabel(eff: number): string {
  return Number.isInteger(eff) ? `${eff}×` : `${eff.toFixed(2)}×`;
}

/** The real minus sign (U+2212) used for signed rate/total readouts, matching the resource lines. */
const MINUS = '−';

/** One generation/upkeep/net cell trio, pre-formatted for the FlowTable. */
interface FlowCells {
  readonly generation: string;
  readonly upkeep: string;
  readonly net: string;
}

/**
 * Format a {generation, upkeep, net} flow into signed display cells: generation always reads as a
 * gain (+), upkeep as a draw (−, or a bare 0 when nothing is drawn), net signed by its sign. `fmt`
 * renders the magnitude (already absolute) and `suffix` is appended to each ("/s" on the Main tab,
 * empty for offline window totals).
 */
function flowCells(
  flow: { generation: number; upkeep: number; net: number },
  fmt: (magnitude: number) => string,
  suffix: string,
): FlowCells {
  return {
    generation: `+${fmt(Math.abs(flow.generation))}${suffix}`,
    upkeep: flow.upkeep > 1e-9 ? `${MINUS}${fmt(flow.upkeep)}${suffix}` : '0',
    net: `${flow.net < 0 ? MINUS : '+'}${fmt(Math.abs(flow.net))}${suffix}`,
  };
}

/** A resource / population row in the generation / upkeep / net flow table. */
interface FlowRow extends FlowCells {
  readonly label: string;
}

/** The generation / upkeep / net breakdown table (Main: per-second; Offline: totals over the window). */
function FlowTable({ rows }: { rows: readonly FlowRow[] }): ReactElement {
  const a = strings.analytics;
  return (
    <div className="analytics-flow" role="table">
      <div className="analytics-flow-row analytics-flow-head" role="row">
        <span className="analytics-flow-label" />
        <span className="analytics-flow-cell">{a.generation}</span>
        <span className="analytics-flow-cell">{a.upkeep}</span>
        <span className="analytics-flow-cell">{a.net}</span>
      </div>
      {rows.map((r) => (
        <div className="analytics-flow-row" role="row" key={r.label}>
          <span className="analytics-flow-label">{r.label}</span>
          <span className="analytics-flow-cell analytics-flow-gen">{r.generation}</span>
          <span className="analytics-flow-cell analytics-flow-up">{r.upkeep}</span>
          <span className="analytics-flow-cell analytics-flow-net">{r.net}</span>
        </div>
      ))}
    </div>
  );
}

/** The Offline tab's active-effects list: every offline modifier in play, as a multiplier chip. */
function OfflineBuffs({ buffs }: { buffs: readonly OfflineBuff[] }): ReactElement | null {
  if (buffs.length === 0) return null;
  const labels = strings.analytics.offlineBuffLabels;
  const buffMul = (m: number): string => `×${m >= 10 ? m.toFixed(0) : m.toFixed(2)}`;
  return (
    <section className="analytics-section analytics-buffs">
      <h4 className="analytics-section-title">{strings.analytics.offlineBuffs}</h4>
      <div className="analytics-list">
        {buffs.map((b) => (
          <StatRow key={b.kind} label={labels[b.kind]} value={buffMul(b.mul)} />
        ))}
      </div>
    </section>
  );
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
 * Influence and Gold (the Souls total now heads the Status Quo Ledger) — then the reprobate population
 * with its generation / death rates. The player
 * action + efficiency now live on the Actions tab (alongside the acolyte / invocation work boards), so
 * the same readout never appears twice.
 */
function MainTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const mods = computeModifiers(state);
  const flows = resourceFlows(state);
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);

  const repRates = reprobateRates(state, mods);
  const deaths = repRates.suicidePerSecond + repRates.murderPerSecond;
  const reps = state.lifetime.reprobates;
  const num = (n: number): string => Math.floor(n).toLocaleString('en-US');

  // Magnitude formatters (values already absolute): gold/influence as BigNum, reprobates to 2 dp.
  const big = (n: number): string => formatBigNum(bn(n));
  const rep = (n: number): string => n.toFixed(2);
  const repFlow = {
    generation: repRates.generationPerSecond,
    upkeep: deaths,
    net: repRates.generationPerSecond - deaths,
  };

  const rows: FlowRow[] = [
    { label: strings.resources.gold, ...flowCells(flows.gold, big, '/s') },
    { label: strings.resources.influence, ...flowCells(flows.influence, big, '/s') },
    { label: strings.analytics.reprobates, ...flowCells(repFlow, rep, '/s') },
  ];

  return (
    <div className="analytics-main">
      <div className="analytics-list">
        <StatRow
          label={strings.resources.influence}
          value={formatBigNum(state.lifetime.influence)}
          detail={`${strings.analytics.ofMax} ${formatBigNum(effectiveMax)}`}
        />
        <StatRow label={strings.resources.gold} value={formatBigNum(state.lifetime.gold)} />
        <StatRow label={strings.analytics.reprobates} value={num(reps)} />
      </div>
      <FlowTable rows={rows} />
      <div className="analytics-rates">
        <StatRow
          label={strings.analytics.byMurder}
          value={`${MINUS}${rep(repRates.murderPerSecond)}/s`}
          indent
        />
        <StatRow
          label={strings.analytics.bySuicide}
          value={`${MINUS}${rep(repRates.suicidePerSecond)}/s`}
          indent
        />
      </div>
    </div>
  );
}

/** The Offline tab's whole derived readout for one window: the flow rows, the active offline effects,
 *  and the net soul gain (pre-formatted). Pure, and the single expensive call site — it wraps the
 *  `offlineProjection` catch-up (plus the closed-form flows) so the component can memoize it wholesale
 *  and keep every cell on one refresh cadence. Souls carry no upkeep (deaths mint them), so they read
 *  as a single signed net gain. */
interface OfflineView {
  readonly rows: FlowRow[];
  readonly buffs: readonly OfflineBuff[];
  readonly souls: string;
}

function offlineView(state: GameState, windowSeconds: number): OfflineView {
  const factors = offlineFactors(state, windowSeconds);
  const proj = offlineProjection(state, windowSeconds);
  const grossFlows = resourceFlows(state, {
    offlineGoldMul: factors.goldMul,
    offlineInfluenceMul: factors.influenceMul,
  });
  const scaled = factors.scaledSeconds;
  const repRates = reprobateRates(state, computeModifiers(state));

  const big = (n: number): string => formatBigNum(bn(n));
  const repTot = (n: number): string => Math.floor(n).toLocaleString('en-US');
  // Gross generation over the window; net from the real catch-up; upkeep = the gap (never negative:
  // net can only be ≤ gross, so this is the total drawn against generation over the window).
  const flowFrom = (
    grossPerSecond: number,
    net: number,
  ): { generation: number; upkeep: number; net: number } => {
    const generation = grossPerSecond * scaled;
    return { generation, upkeep: Math.max(0, generation - net), net };
  };
  const rows: FlowRow[] = [
    {
      label: strings.resources.gold,
      ...flowCells(flowFrom(grossFlows.gold.generation, proj.gold.toNumber()), big, ''),
    },
    {
      label: strings.resources.influence,
      ...flowCells(flowFrom(grossFlows.influence.generation, proj.influence.toNumber()), big, ''),
    },
    {
      label: strings.analytics.reprobates,
      ...flowCells(
        flowFrom(repRates.generationPerSecond * factors.generationMul, proj.reprobates),
        repTot,
        '',
      ),
    },
  ];
  const souls = gt(ZERO, proj.souls)
    ? `${MINUS}${formatBigNum(mul(proj.souls, -1))}`
    : `+${formatBigNum(proj.souls)}`;
  return { rows, buffs: factors.buffs, souls };
}

/**
 * The Offline tab: what would accrue over the chosen away-window (1h / 8h / 24h), run through the
 * real offline catch-up (`offlineProjection`) so the NET column matches what returning actually banks
 * — the reduced offline base rate, offline-only sigils, reprobate dynamics, invocation runners and
 * toggles all included. Generation is the gross throughput over the window (`resourceFlows` under the
 * offline income multipliers × the scaled seconds), and upkeep is the gap generation − net, so each
 * row stays consistent (net = generation − upkeep) while the net stays accurate.
 *
 * The catch-up is expensive (a full `resumeGame` over up to 24h) and the store ticks at 10 Hz,
 * replacing `state` each tick — so a naive render would re-simulate the whole window ~10×/s. The
 * derivation (`offlineView`) is therefore memoized on the window plus a COARSE `lastTickAt` bucket
 * (OFFLINE_REFRESH_MS): it recomputes at most once per that interval, and immediately when the window
 * changes. Bucketing is essential — the raw `lastTickAt` advances every tick, so it would defeat the memo.
 */
function OfflineTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  const [windowSeconds, setWindowSeconds] = useState<number>(OFFLINE_WINDOWS[0]?.seconds ?? 3600);
  // `state` is intentionally sampled through this quantized bucket, not tracked by reference.
  const clockBucket = Math.floor((state?.lastTickAt ?? 0) / OFFLINE_REFRESH_MS);
  const view = useMemo(
    () => (state ? offlineView(state, windowSeconds) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- coarse key by design (see clockBucket)
    [windowSeconds, clockBucket],
  );
  if (!state || !view) return <p className="pc-empty">{strings.opera.notYet}.</p>;

  return (
    <div className="analytics-main">
      <p className="analytics-offline-note">{strings.analytics.offlineNote}</p>
      <div className="analytics-offline-windows" role="group">
        {OFFLINE_WINDOWS.map((w) => (
          <button
            key={w.seconds}
            type="button"
            aria-pressed={windowSeconds === w.seconds}
            className={'kat-tab' + (windowSeconds === w.seconds ? ' kat-tab--active' : '')}
            onClick={() => setWindowSeconds(w.seconds)}
          >
            {w.label}
          </button>
        ))}
      </div>
      <FlowTable rows={view.rows} />
      <div className="analytics-list">
        <StatRow label={strings.resources.souls} value={view.souls} />
      </div>
      <OfflineBuffs buffs={view.buffs} />
    </div>
  );
}

/**
 * The PC's Analytics program (5.4): the live numeric readouts pulled out of the always-on HUD into
 * an on-demand panel. Three tabs — Main (resources + the reprobate population + dynamics rates),
 * Actions (the unified work board: the player's efficiency + in-flight rite, then each acolyte, then
 * each bound invocation, every one with its efficiency, current action, and progress bar), and
 * Offline (the projected gains over a chosen away-window, with the active offline effects).
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
        {tabBtn('offline', strings.analytics.offline)}
      </div>
      {tab === 'main' && <MainTab />}
      {tab === 'actions' && <ActionsTab />}
      {tab === 'offline' && <OfflineTab />}
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
