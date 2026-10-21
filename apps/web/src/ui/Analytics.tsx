import { useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import {
  ACTIONS,
  TIERS,
  actionTierDistribution,
  riskAnalyticsOpen,
  INVOCATION_IDS,
  activeInvocationCount,
  invocationById,
  categoryEfficiency,
  computeModifiers,
  reprobateRates,
  resourceFlows,
  playerEfficiency,
  bn,
  mul,
  type GameState,
  type Tier,
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';
import { actionProgress } from '../game/progress.js';
import { actionName } from '../game/labels.js';
import { invocationEffectText } from '../game/invocationEffect.js';

type AnalyticsTab = 'main' | 'actions' | 'risk';

/** An efficiency multiplier as a compact "N×" label (whole numbers bare, fractions to 2 decimals). */
function effLabel(eff: number): string {
  return Number.isInteger(eff) ? `${eff}×` : `${eff.toFixed(2)}×`;
}

/** The real minus sign (U+2212) used for signed rate/total readouts, matching the resource lines. */
const MINUS = '−';

/** The en dash an empty table cell reads as (an idle acolyte's remaining time). */
const EMPTY_CELL = '\u2013';

/** The middle-dot separator of headings and labels ("Flows · per second", "Player · Suggestion"). */
const SEP = ' \u00B7 ';

/** Below this, a rate or draw counts as zero (float noise from the flow arithmetic). */
const EPSILON = 1e-9;

/**
 * A per-second magnitude (already absolute): two decimals below 10/s so a slow flow still reads
 * ("1.95", not a floored "1"), grouped whole numbers from there up (`formatBigNum`, which also takes
 * the M/B/T suffixes once the flows grow).
 */
function rateMagnitude(n: number): string {
  return n < 9.995 ? n.toFixed(2) : formatBigNum(bn(n));
}

/** A signed per-second rate ("+1.95/s", "−36/s"), the sign taken from the value. */
function signedRate(n: number): string {
  return `${n < -EPSILON ? MINUS : '+'}${rateMagnitude(Math.abs(n))}/s`;
}

/** A per-second draw (upkeep, deaths) read as a loss ("−0.04/s"), or a bare 0 when nothing is drawn. */
function drawRate(n: number): string {
  return n > EPSILON ? `${MINUS}${rateMagnitude(n)}/s` : '0';
}

/** A {generation, upkeep, net} per-second flow (gold, influence, or the reprobate population). */
interface Flow {
  readonly generation: number;
  readonly upkeep: number;
  readonly net: number;
}

/** A resource / population row in the generation / upkeep / net flow table. */
interface FlowRow {
  readonly label: string;
  readonly flow: Flow;
}

/** One headline figure: a top rule, its label, the big number, an optional cap and a net rate. */
function Kpi({
  label,
  value,
  cap,
  net,
}: {
  label: string;
  value: string;
  cap?: string;
  net?: number;
}): ReactElement {
  return (
    <div className="an-kpi">
      <span className="an-kpi-label">{label}</span>
      <div className="an-kpi-line">
        <span className="an-kpi-value">{value}</span>
        {cap !== undefined && <span className="an-kpi-cap">{cap}</span>}
      </div>
      {net !== undefined && (
        <span className={'an-kpi-net' + (net < -EPSILON ? ' an-kpi-net--neg' : '')}>
          {signedRate(net)} {strings.analytics.netSuffix}
        </span>
      )}
    </div>
  );
}

/** A section heading with an optional muted mono note ("Flows · per second"). */
function SectionTitle({ title, note }: { title: string; note?: string }): ReactElement {
  return (
    <h2 className="an-h2">
      {title}
      {note !== undefined && <span className="an-h2-note">{`${SEP}${note}`}</span>}
    </h2>
  );
}

/** A 10px square progress bar, `pct` in 0..1. */
function Bar({ pct }: { pct: number }): ReactElement {
  return (
    <span className="an-bar">
      <span className="an-bar-fill" style={{ width: `${(pct * 100).toFixed(0)}%` }} />
    </span>
  );
}

/** The generation / upkeep / net breakdown table (Main tab, per second). */
function FlowTable({ rows }: { rows: readonly FlowRow[] }): ReactElement {
  const a = strings.analytics;
  return (
    <div className="an-table an-flows" role="table">
      <div className="an-tr" role="row">
        <span className="an-th" role="columnheader" />
        <span className="an-th an-r" role="columnheader">
          {a.generation}
        </span>
        <span className="an-th an-r" role="columnheader">
          {a.upkeep}
        </span>
        <span className="an-th an-r an-th--strong" role="columnheader">
          {a.net}
        </span>
      </div>
      {rows.map(({ label, flow }) => (
        <div className="an-tr" role="row" key={label}>
          <span className="an-td an-td--label" role="rowheader">
            {label}
          </span>
          <span className="an-td an-num" role="cell">
            {`+${rateMagnitude(Math.abs(flow.generation))}/s`}
          </span>
          <span className="an-td an-num" role="cell">
            {drawRate(flow.upkeep)}
          </span>
          <span
            className={'an-td an-num an-num--net' + (flow.net < -EPSILON ? ' an-num--neg' : '')}
            role="cell"
          >
            {signedRate(flow.net)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The Main tab: the three headline figures (Influence against its cap, Gold, the reprobate
 * population, each with its net rate), then the per-second generation / upkeep / net flows beside the
 * reprobate deaths by cause. Souls head the Status Quo Ledger and the player's efficiency lives on
 * the Actions tab, so neither repeats here.
 */
function MainTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="an-empty">{strings.opera.notYet}.</p>;
  const a = strings.analytics;
  const mods = computeModifiers(state);
  const flows = resourceFlows(state);
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);

  const repRates = reprobateRates(state, mods);
  const deaths = repRates.suicidePerSecond + repRates.murderPerSecond;
  const repFlow: Flow = {
    generation: repRates.generationPerSecond,
    upkeep: deaths,
    net: repRates.generationPerSecond - deaths,
  };

  const rows: FlowRow[] = [
    { label: strings.resources.gold, flow: flows.gold },
    { label: strings.resources.influence, flow: flows.influence },
    { label: a.reprobates, flow: repFlow },
  ];

  return (
    <div className="an-main">
      <div className="an-kpis">
        <Kpi
          label={strings.resources.influence}
          value={formatBigNum(state.lifetime.influence)}
          cap={`${a.ofMax} ${formatBigNum(effectiveMax)}`}
          net={flows.influence.net}
        />
        <Kpi
          label={strings.resources.gold}
          value={formatBigNum(state.lifetime.gold)}
          net={flows.gold.net}
        />
        <Kpi
          label={a.reprobates}
          value={Math.floor(state.lifetime.reprobates).toLocaleString('en-US')}
          net={repFlow.net}
        />
      </div>
      <div className="an-split">
        <section className="an-section">
          <SectionTitle title={a.flows} note={a.perSecond} />
          <FlowTable rows={rows} />
        </section>
        <section className="an-section">
          <SectionTitle title={a.reprobateDeaths} note={a.perSecond} />
          <div className="an-ledger">
            <div className="an-ledger-row">
              <span>{a.byMurder}</span>
              <span className="an-ledger-val">{drawRate(repRates.murderPerSecond)}</span>
            </div>
            <div className="an-ledger-row">
              <span>{a.bySuicide}</span>
              <span className="an-ledger-val">{drawRate(repRates.suicidePerSecond)}</span>
            </div>
            <div className="an-ledger-row an-ledger-row--total">
              <span>{a.total}</span>
              <span className="an-ledger-val">{drawRate(deaths)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * The player's in-flight work beside the efficiency figure: one ruled block per running timer (the
 * Logos rite, and a scrying or purchase running alongside it), each with its remaining time and a
 * progress bar filled 0→100% by the shared `actionProgress` rule. Idle, a muted "Player · idle" block
 * with an empty bar holds the row's shape.
 */
function PlayerRites({ state }: { state: GameState }): ReactElement {
  const a = strings.analytics;
  const queue = state.lifetime.actionQueue;
  if (queue.length === 0) {
    return (
      <div className="an-rites">
        <div className="an-rite an-rite--idle">
          <div className="an-rite-head">
            <span className="an-rite-label">{`${a.player}${SEP}${a.idle}`}</span>
          </div>
          <Bar pct={0} />
        </div>
      </div>
    );
  }
  return (
    <div className="an-rites">
      {queue.map((t, i) => {
        const def = ACTIONS[t.actionId];
        const eff = def ? categoryEfficiency(state, def.category) : 1;
        const left = formatDuration(Math.max(0, Math.ceil(t.remainingSeconds)) * 1000);
        return (
          <div className="an-rite" key={`${i}-${t.actionId}`}>
            <div className="an-rite-head">
              <span className="an-rite-label">{`${a.player}${SEP}${actionName(t.actionId)}`}</span>
              <span className="an-rite-time">{`${left} ${a.left}`}</span>
            </div>
            <Bar pct={actionProgress(t.actionId, t.remainingSeconds, eff)} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * The acolytes table: one row per acolyte with its action efficiency, its current action, the
 * remaining cycle time, and a progress bar. Idle acolytes still show their efficiency (it applies the
 * moment they're assigned) but read muted, with an empty bar.
 */
function AcolyteTable({ state }: { state: GameState }): ReactElement {
  const a = strings.analytics;
  const eff = Math.max(computeModifiers(state).acolyteEfficiencyMul, 1e-9);
  return (
    <div className="an-table an-acolytes" role="table">
      <div className="an-tr" role="row">
        <span className="an-th" role="columnheader">
          {strings.acolytes.acolyte}
        </span>
        <span className="an-th an-r" role="columnheader">
          {a.efficiency}
        </span>
        <span className="an-th" role="columnheader">
          {a.action}
        </span>
        <span className="an-th an-r" role="columnheader">
          {a.remaining}
        </span>
        <span className="an-th" role="columnheader">
          {a.progress}
        </span>
      </div>
      {state.lifetime.acolytes.map((acolyte) => {
        const action = acolyte.assignedAction;
        const remaining = action === null ? null : acolyte.remainingSeconds;
        return (
          <div
            className={'an-tr' + (action === null ? ' an-tr--idle' : '')}
            role="row"
            key={acolyte.id}
          >
            <span className="an-td an-td--name" role="rowheader">
              {`${strings.acolytes.acolyte} ${acolyte.id}`}
            </span>
            <span className="an-td an-num an-r" role="cell">
              {effLabel(eff)}
            </span>
            <span className="an-td an-td--action" role="cell">
              {action === null ? a.idle : actionName(action)}
            </span>
            <span className="an-td an-num an-r" role="cell">
              {remaining === null
                ? EMPTY_CELL
                : formatDuration(Math.max(0, Math.ceil(remaining)) * 1000)}
            </span>
            <span className="an-td an-td--bar" role="cell">
              <Bar
                pct={
                  action === null || remaining === null ? 0 : actionProgress(action, remaining, eff)
                }
              />
            </span>
          </div>
        );
      })}
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
 * The Actions tab: everything acting on the player's behalf. The player's efficiency beside their
 * in-flight work, then each acolyte's work, then each bound invocation with its live total effect.
 * Every invocation is passive (the autonomous-runner channel was removed, ADR-036), so invocations
 * carry no action or progress; stacked copies read as one entry, never "name ×N".
 */
function ActionsTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="an-empty">{strings.opera.notYet}.</p>;
  const a = strings.analytics;
  const eff = playerEfficiency(state);
  const bound = orderedBoundInvocations(state).filter((id) => invocationById(id) !== undefined);

  return (
    <div className="an-actions">
      <div className="an-actions-top">
        <Kpi
          label={a.playerEfficiency}
          value={Number.isInteger(eff) ? `${eff}×` : `${eff.toFixed(1)}×`}
        />
        <PlayerRites state={state} />
      </div>

      <section className="an-section">
        <SectionTitle title={a.acolytes} />
        {state.lifetime.acolytes.length === 0 ? (
          <p className="an-empty">{a.noAcolytes}</p>
        ) : (
          <AcolyteTable state={state} />
        )}
      </section>

      <section className="an-section">
        <SectionTitle title={a.invocations} note={a.invocationsNote} />
        {bound.length === 0 ? (
          <p className="an-empty">{strings.invocations.noneBound}</p>
        ) : (
          <div className="an-invocations">
            {bound.map((id) => {
              const effect = invocationEffectText(state, id);
              return (
                <div className="an-inv" key={id}>
                  <span className="an-inv-name">{strings.invocations.names[id] ?? id}</span>
                  {effect !== '' && <span className="an-inv-effect">{effect}</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** The Opera categories in reading order, for the Risk tab's grouping. */
const RISK_CATEGORIES = ['logos', 'indagatio', 'emptio'] as const;

/** An outcome probability (0..1) as a fixed-width percentage: "0%", "<0.1%", "12.5%". */
function riskPct(p: number): string {
  const pct = Math.max(0, p) * 100;
  if (pct === 0) return '0%';
  if (pct < 0.05) return '<0.1%';
  return `${pct.toFixed(1)}%`;
}

/** Risk-table cell classes: the tier's colour, plus the likeliest-outcome highlight. */
function riskCellClass(tier: Tier, top: boolean): string {
  return `an-risk-cell an-tier--${tier}` + (top ? ' an-risk-cell--top' : '');
}

/**
 * The Risk tab (the Depraedatio Risk algos contract): every action's live outcome distribution, one
 * row per action grouped by category, one column per outcome tier (Stellar → Apocalyptic), the
 * likeliest outcome of each row highlighted. Reads `actionTierDistribution`, the exact weights
 * `resolveAction` draws from, so the odds shown are the odds a cast would roll right now.
 */
function RiskTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <p className="an-empty">{strings.opera.notYet}.</p>;
  const a = strings.analytics;
  return (
    <div className="an-risk-wrap">
      <div className="an-risk" role="table" aria-label={a.risk}>
        <div className="an-risk-row an-risk-head" role="row">
          <span className="an-risk-label" role="columnheader">
            {a.action}
          </span>
          {TIERS.map((t) => (
            <span key={t} className={riskCellClass(t, false)} role="columnheader">
              {strings.tiers[t]}
            </span>
          ))}
        </div>
        {RISK_CATEGORIES.map((cat) => {
          const actions = Object.values(ACTIONS).filter((d) => d.category === cat);
          if (actions.length === 0) return null;
          return [
            <div className="an-risk-row" role="row" key={`group-${cat}`}>
              <span className="an-risk-group" role="rowheader">
                {strings.opera[cat]}
              </span>
            </div>,
            ...actions.map((def) => {
              const dist = actionTierDistribution(state, def.id);
              const odds = TIERS.map((t) => Math.max(0, dist[t] ?? 0));
              const likeliest = Math.max(...odds);
              return (
                <div className="an-risk-row" role="row" key={def.id}>
                  <span className="an-risk-label" role="rowheader">
                    {actionName(def.id)}
                  </span>
                  {TIERS.map((t, i) => {
                    const p = odds[i] ?? 0;
                    return (
                      <span
                        key={t}
                        className={riskCellClass(t, likeliest > 0 && p === likeliest)}
                        role="cell"
                      >
                        {riskPct(p)}
                      </span>
                    );
                  })}
                </div>
              );
            }),
          ];
        })}
      </div>
    </div>
  );
}

/**
 * The PC's Analytics program (5.4): the live numeric readouts, laid out as a plain printed-report
 * BI tool that fills the PC window (full-bleed, see FULLBLEED in PcWindow). A fixed header carries the
 * tab row and the current tab's subtitle over a scrolling page. Main holds the resources, their flows
 * and the reprobate population; Actions everything acting on the player's behalf (the player, each
 * acolyte, each bound invocation). A third tab, Risk (every action's live outcome odds), opens once
 * the Depraedatio Risk algos contract is chosen.
 */
export function AnalyticsGroup(): ReactElement {
  const [picked, setTab] = useState<AnalyticsTab>('main');
  const riskOpen = useGameStore((s) => (s.state ? riskAnalyticsOpen(s.state) : false));
  // A Risk tab left selected falls back to Main if the contract lapses (the account closed).
  const tab: AnalyticsTab = picked === 'risk' && !riskOpen ? 'main' : picked;
  const a = strings.analytics;
  const subtitle =
    tab === 'main' ? a.mainSubtitle : tab === 'actions' ? a.actionsSubtitle : a.riskIntro;

  const tabBtn = (id: AnalyticsTab, label: string): ReactElement => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      className={'an-tab' + (tab === id ? ' an-tab--active' : '')}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="an-root">
      <header className="an-header">
        <nav className="an-tabs" role="tablist">
          {tabBtn('main', a.main)}
          {tabBtn('actions', a.actions)}
          {riskOpen && tabBtn('risk', a.risk)}
        </nav>
        <span className="an-subtitle">{subtitle}</span>
      </header>
      <div className="an-scroll">
        <div className="an-page">
          {tab === 'main' && <MainTab />}
          {tab === 'actions' && <ActionsTab />}
          {tab === 'risk' && <RiskTab />}
        </div>
      </div>
    </div>
  );
}
