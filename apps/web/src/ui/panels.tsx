import { useState, type ReactElement, type ReactNode } from 'react';
import { strings } from '@panvitium/shared';
import {
  floor,
  ACTIONS,
  actionUnlocked,
  categoryEfficiency,
  MALEFICIA,
  SINS,
  mercatusDepth,
  mercatusDepthCap,
  mercatusUnlocked,
  mercatusRevenuePerSecond,
  foedusRevenueMul,
  highestFoedusTierForSin,
  investCost,
  cumulativeInvestCost,
  divestFraction,
  COMPOSITUM_IDS,
  compositumById,
  compositumUnlocked,
  isToggleActive,
  INVOCATION_IDS,
  invocationById,
  invocationVisible,
  invocationUnlocked,
  invocationSoulCost,
  activeInvocationCount,
  currentInvokingPower,
  assignedCount,
  isDelegatable,
  ACHIEVEMENTS,
  isUnlocked,
  unreadCount,
  type OutcomeEvent,
} from '@panvitium/sim';
import { type PanelId } from '../menus/types.js';
import { compositumCostLine, compositumOutcomesLine } from '../game/compositumText.js';
import { MaleficiaCabinet as DesignedCabinet } from '../menus/MaleficiaCabinet.js';
import { SuasioPanel as DesignedSuasio } from '../menus/SuasioPanel.js';
import { PcWindow as DesignedPc } from '../menus/PcWindow.js';
import { AnalyticsGroup } from './Analytics.js';
import { EmailsGroup } from './Emails.js';
import { buildCabinet } from '../game/maleficia.js';
import { useGameStore } from '../store/gameStore.js';
import { actionName } from '../game/labels.js';

interface PanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A diegetic modal styled as an aged grimoire page (02 §10). */
export function Panel({ title, onClose, children }: PanelProps): ReactElement {
  return (
    <div className="panel-overlay" onClick={onClose} role="presentation">
      <div className="panel" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="panel-header">
          <h2 className="panel-title">{title}</h2>
          <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}

/** A single outcome rendered as a terminal log line: "Caedis · Good — +1 Souls, -1 Reprobates". */
function describeOutcome(e: OutcomeEvent): string {
  const name = actionName(e.actionId);
  const parts: string[] = [];
  const sign = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
  if (e.soulsDelta !== 0) parts.push(`${sign(e.soulsDelta)} ${strings.resources.souls}`);
  if (e.reprobateDelta !== 0) parts.push(`${sign(e.reprobateDelta)} ${strings.reprobates}`);
  if (e.goldDelta !== 0) parts.push(`${sign(e.goldDelta)} ${strings.resources.gold}`);
  const effect = parts.length > 0 ? ` — ${parts.join(', ')}` : '';
  return `${name} · ${strings.tiers[e.tier]}${effect}`;
}

/** One Opera action row: name, cost, and a button that triggers it (disabled if unaffordable). */
function ActionRow({
  name,
  cost,
  cta,
  disabled,
  onAct,
  delegation,
}: {
  name: string;
  cost: string;
  cta: string;
  disabled: boolean;
  onAct: () => void;
  /** Optional acolyte assignment controls, rendered between cost and CTA. */
  delegation?: ReactNode;
}): ReactElement {
  return (
    <div className="opera-action">
      <div className="opera-meta">
        <span className="opera-name">{name}</span>
        <span className="opera-cost">{cost}</span>
      </div>
      {delegation}
      <button type="button" className="opera-btn" disabled={disabled} onClick={onAct}>
        {cta}
      </button>
    </div>
  );
}

/**
 * Acolyte assignment controls (02 §10). A pair of `-` / `+` buttons with the current assigned
 * count between them. The `+` button disables when no idle acolyte is available; `-` disables
 * when nothing is currently assigned to this action. The "ø / N" counter shows currently-assigned
 * over available, so the player can see capacity at a glance.
 */
function AcolyteControls({ actionId }: { actionId: string }): ReactElement | null {
  const state = useGameStore((s) => s.state);
  const assignAcolyte = useGameStore((s) => s.assignAcolyte);
  const unassignAcolyte = useGameStore((s) => s.unassignAcolyte);
  if (!state || !isDelegatable(state, actionId)) return null;
  const total = state.lifetime.acolytes.length;
  if (total === 0) return null; // no acolytes yet — no controls
  const assigned = assignedCount(state, actionId);
  const idle = total - assigned;
  return (
    <div className="acolyte-controls" aria-label={strings.acolytes.delegationLabel}>
      <button
        type="button"
        className="acolyte-btn"
        disabled={assigned === 0}
        onClick={() => unassignAcolyte(actionId)}
        aria-label={strings.acolytes.unassign}
        title={strings.acolytes.unassign}
      >
        −
      </button>
      <span className="acolyte-count" title={strings.acolytes.delegationLabel}>
        {assigned}
        <span className="acolyte-count-sep">/</span>
        {total}
      </span>
      <button
        type="button"
        className="acolyte-btn"
        disabled={idle === 0}
        onClick={() => assignAcolyte(actionId)}
        aria-label={strings.acolytes.assign}
        title={strings.acolytes.assign}
      >
        +
      </button>
    </div>
  );
}

/** The Suasio scroll (Studio): tempt ordinary humans into reprobates. */
/** True while a player-driven rite is in flight (02 §3: one action at a time). */
function useUnderway(): boolean {
  return useGameStore((s) => (s.state ? s.state.lifetime.actionQueue.length > 0 : false));
}

/** The Suasio scroll (Studio): tempt ordinary humans into reprobates. Renders the designed scroll
 * fed by the real action/cost, with acolyte delegation preserved beneath it. (Resolved outcomes
 * live in the PC's Logs program, not on the scroll.) */
function SuasioPanel(): ReactElement {
  const state = useGameStore((s) => s.state);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  if (!state) return <div className="opera" />;
  const influence = floor(state.lifetime.influence).toNumber();
  const eff = categoryEfficiency(state, 'suasio');
  const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);
  const names: Record<string, string> = {
    suggestion: strings.opera.suggestion,
    logismoi: strings.opera.logismoi,
    imperium: strings.opera.imperium,
  };
  // All three temptations live on the one scroll; locked ones show their Luxuria gate (02 §2.1).
  const actions = (['suggestion', 'logismoi', 'imperium'] as const).map((id) => {
    const def = ACTIONS[id]!;
    const influenceCost = Math.ceil((def.cost.influence ?? 0) * eff);
    const locked = !actionUnlocked(state, def);
    return {
      id,
      name: names[id] ?? def.id,
      cost: `${influenceCost} ${strings.resources.influence} · ${def.baseTimeSeconds}s`,
      locked,
      disabled: underway || locked || influence < influenceCost,
      ...(def.unlock ? { lockLabel: `${cap(def.unlock.sin)} ${def.unlock.level}` } : {}),
      onTempt: () => act(id),
    };
  });
  return (
    <div className="opera">
      <DesignedSuasio intro={strings.opera.suasioIntro} actions={actions} />
      <AcolyteControls actionId="suggestion" />
      {underway && <p className="opera-hint">{strings.opera.underway}</p>}
    </div>
  );
}

/** The terminal log (02 §10): the last hundred outcomes, newest first. */
function OutcomeLog(): ReactElement {
  const log = useGameStore((s) => s.log);
  if (log.length === 0) return <p className="pc-empty">{strings.opera.emptyLog}</p>;
  return (
    <ul className="pc-log">
      {log.map((e, i) => (
        <li className={`pc-log-line tier-${e.tier}`} key={`${i}-${e.actionId}-${e.tier}`}>
          {describeOutcome(e)}
        </li>
      ))}
    </ul>
  );
}

/** A gated Opera row shown before its Sin level is reached: name + the requirement, dimmed. */
function LockedRow({ name, gate }: { name: string; gate: string }): ReactElement {
  return (
    <div className="opera-action opera-action--locked">
      <div className="opera-meta">
        <span className="opera-name">{name}</span>
        <span className="opera-cost">{gate}</span>
      </div>
    </div>
  );
}

/** Decimatio actions: Caedis (always open), then Pogrom and Purgatio, each gated by their Ira level. */
function DecimatioGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const notice = useGameStore((s) => s.notice);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  if (!state) return <></>;
  const gold = floor(state.lifetime.gold).toNumber();
  const eff = categoryEfficiency(state, 'decimatio');
  const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);
  const goldCost = (id: 'caedis' | 'pogrom' | 'purgatio'): number =>
    Math.ceil((ACTIONS[id]?.cost.gold ?? 0) * eff);
  const pogromDef = ACTIONS.pogrom;
  const purgatioDef = ACTIONS.purgatio;
  const caedisCost = goldCost('caedis');
  return (
    <>
      <ActionRow
        name={strings.opera.caedis}
        cost={`${caedisCost} ${strings.resources.gold} · 10s`}
        cta={strings.opera.cull}
        disabled={underway || gold < caedisCost}
        onAct={() => act('caedis')}
        delegation={<AcolyteControls actionId="caedis" />}
      />
      {pogromDef &&
        (actionUnlocked(state, pogromDef) ? (
          <ActionRow
            name={strings.opera.pogrom}
            cost={`${goldCost('pogrom')} ${strings.resources.gold} · ${pogromDef.baseTimeSeconds}s`}
            cta={strings.opera.purge}
            disabled={underway || gold < goldCost('pogrom')}
            onAct={() => act('pogrom')}
            delegation={<AcolyteControls actionId="pogrom" />}
          />
        ) : (
          pogromDef.unlock && (
            <LockedRow
              name={strings.opera.pogrom}
              gate={`${cap(pogromDef.unlock.sin)} ${pogromDef.unlock.level}`}
            />
          )
        ))}
      {purgatioDef &&
        (actionUnlocked(state, purgatioDef) ? (
          <ActionRow
            name={strings.opera.purgatio}
            cost={`${goldCost('purgatio')} ${strings.resources.gold} · ${purgatioDef.baseTimeSeconds}s`}
            cta={strings.opera.purge}
            disabled={underway || gold < goldCost('purgatio')}
            onAct={() => act('purgatio')}
            delegation={<AcolyteControls actionId="purgatio" />}
          />
        ) : (
          purgatioDef.unlock && (
            <LockedRow
              name={strings.opera.purgatio}
              gate={`${cap(purgatioDef.unlock.sin)} ${purgatioDef.unlock.level}`}
            />
          )
        ))}
      {underway && <p className="opera-hint">{strings.opera.underway}</p>}
      {notice !== null && <p className="opera-notice">{notice}</p>}
    </>
  );
}

type PcGroupId =
  | 'depraedatio'
  | 'decimatio'
  | 'indagatio'
  | 'emptio'
  | 'analytics'
  | 'achievements'
  | 'emails'
  | 'logs';

const PC_GROUPS: { id: PcGroupId; label: string }[] = [
  { id: 'depraedatio', label: strings.opera.depraedatio },
  { id: 'decimatio', label: strings.opera.decimatio },
  { id: 'indagatio', label: strings.opera.indagatio },
  { id: 'emptio', label: strings.opera.emptio },
  { id: 'analytics', label: strings.analytics.title },
  { id: 'achievements', label: strings.achievements.ledger },
  { id: 'emails', label: strings.emails.title },
  { id: 'logs', label: strings.opera.logs },
];

/**
 * Inline summary of acolytes delegated to a given action — shown beneath the action row so the
 * player can see remaining cycle time per acolyte. A 5454-second Indagatio cycle is otherwise
 * invisible until something resolves; this is the feedback channel for "yes, they're working."
 */
function AcolyteSummary({ actionId }: { actionId: string }): ReactElement | null {
  const acolytes = useGameStore((s) => (s.state ? s.state.lifetime.acolytes : []));
  const filtered = acolytes.filter((a) => a.assignedAction === actionId);
  if (filtered.length === 0) return null;
  return (
    <ul className="acolyte-summary">
      {filtered.map((a) => (
        <li key={a.id} className="acolyte-summary-row">
          <span className="acolyte-summary-name">
            {strings.acolytes.acolyte} {a.id}
          </span>
          <span className="acolyte-summary-time">
            {a.remainingSeconds === null
              ? strings.acolytes.idle
              : formatDuration(Math.max(0, Math.ceil(a.remainingSeconds)))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Indagatio (03 §2.5): one long, no-cost search button. Duration scales with player efficiency. */
function IndagatioGroup(): ReactElement {
  const eff = useGameStore((s) => (s.state ? categoryEfficiency(s.state, 'indagatio') : 1));
  const notice = useGameStore((s) => s.notice);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  const baseSec = ACTIONS.indagatio?.baseTimeSeconds ?? 1800;
  const actualSec = Math.max(1, Math.floor(baseSec / Math.max(eff, 1e-9)));
  return (
    <>
      <p className="opera-intro">{strings.opera.indagatioIntro}</p>
      <ActionRow
        name={strings.opera.indagatio}
        cost={formatDuration(actualSec)}
        cta={strings.opera.indagatioCta}
        disabled={underway}
        onAct={() => act('indagatio')}
        delegation={<AcolyteControls actionId="indagatio" />}
      />
      <AcolyteSummary actionId="indagatio" />
      {underway && <p className="opera-hint">{strings.opera.underway}</p>}
      {notice !== null && <p className="opera-notice">{notice}</p>}
    </>
  );
}

/** Emptio (03 §2.6): the listed maleficia, each with a buy button at the listed gold cost. */
function EmptioGroup(): ReactElement {
  const list = useGameStore((s) => (s.state ? s.state.lifetime.emptioList : []));
  const prices = useGameStore((s) => s.state?.lifetime.maleficiaPrices);
  const gold = useGameStore((s) => (s.state ? floor(s.state.lifetime.gold).toNumber() : 0));
  const notice = useGameStore((s) => s.notice);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  if (list.length === 0) {
    return (
      <>
        <p className="opera-intro">{strings.opera.emptioIntro}</p>
        <p className="pc-empty">{strings.opera.emptioEmpty}</p>
      </>
    );
  }
  return (
    <>
      <p className="opera-intro">{strings.opera.emptioIntro}</p>
      <ul className="emptio-list">
        {list.map((id, idx) => {
          const def = MALEFICIA[id];
          if (!def) return null;
          const price = prices?.[id] ?? def.cost;
          return (
            <li key={`${idx}-${id}`} className="emptio-row">
              <span className={`rarity-badge rarity-${def.rarity}`}>
                {strings.maleficia.rarity[def.rarity]}
              </span>
              <span className="emptio-name">{def.name}</span>
              <span className="emptio-cost">
                {price} {strings.resources.gold}
              </span>
              <button
                type="button"
                className="opera-btn emptio-buy"
                disabled={underway || gold < price}
                onClick={() => act('emptio', id)}
              >
                {strings.opera.buy}
              </button>
            </li>
          );
        })}
      </ul>
      {underway && <p className="opera-hint">{strings.opera.underway}</p>}
      {notice !== null && <p className="opera-notice">{notice}</p>}
    </>
  );
}

/** Maleficia shelf: groups owned items by id; stackables show their count. */
function MaleficiaShelf(): ReactElement {
  const state = useGameStore((s) => s.state);
  const activate = useGameStore((s) => s.activateMaleficium);
  const items = state ? buildCabinet(state) : [];
  if (items.length === 0) {
    return <p className="pc-empty">{strings.maleficia.empty}</p>;
  }
  return <DesignedCabinet items={items} onUse={activate} />;
}

/** Format a duration in seconds as HH:MM:SS or MMm SS, etc. */
function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Depraedatio: the Mercatus system (Vitium Mercatura rework spec §1). Eight trades, exactly one
 * per Cardinal Sin, each a single integer depth. Deepening is an instant gold purchase (no build
 * times, no queue); revenue is demand-driven — spendPerCapita × reprobates × penetration(depth) —
 * so a trade's take grows with the living population and with its reach into it.
 */

/** Roman numerals for the Foedus tier badge (tiers 1..4). */
const ROMAN_TIERS = ['', 'I', 'II', 'III', 'IV'] as const;

/** The eight Mercatūs — deepen / cut back / sell off, gated by Sin level. */
function MercaturaList(): ReactElement {
  const state = useGameStore((s) => s.state);
  const invest = useGameStore((s) => s.invest);
  const divest = useGameStore((s) => s.divest);
  if (!state) return <></>;
  const gold = floor(state.lifetime.gold).toNumber();
  const fraction = divestFraction(state);
  return (
    <ul className="vitium-list">
      {SINS.map((sin) => {
        const name = strings.mercatus.names[sin] ?? sin;
        const unlocked = mercatusUnlocked(state, sin);
        const d = mercatusDepth(state, sin);
        const cap = mercatusDepthCap(state, sin);
        const atCap = unlocked && d >= cap;
        const nextCost = investCost(sin, d);
        const revenue = mercatusRevenuePerSecond(state, sin) * foedusRevenueMul(state, sin);
        const tier = highestFoedusTierForSin(state, sin);
        const cutBackRefund = Math.floor(
          fraction * (cumulativeInvestCost(sin, d) - cumulativeInvestCost(sin, d - 1)) + 1e-9,
        );
        const sellOffRefund = Math.floor(fraction * cumulativeInvestCost(sin, d) + 1e-9);
        return (
          <li key={sin} className={`vitium-row${unlocked ? '' : ' vitium-locked'}`}>
            <div className="vitium-meta">
              <span className="vitium-name" title={strings.mercatus.clauses[sin]}>
                {name}
                {tier >= 1 && (
                  <span className="foedus-badge" title={strings.mercatus.foedusTitle}>
                    {' '}
                    {strings.mercatus.foedus} {ROMAN_TIERS[tier]}
                  </span>
                )}
              </span>
              <span className="vitium-sub">
                {unlocked
                  ? `${strings.mercatus.roots} ${d} / ${cap}` +
                    (d > 0
                      ? ` · ${formatRate(revenue)} ${strings.resources.gold}${strings.mercatus.perSecond}`
                      : '')
                  : `${sin} · ${strings.mercatus.lockedHint}`}
              </span>
            </div>
            <div className="vitium-actions">
              <button
                type="button"
                className="opera-btn"
                disabled={!unlocked || atCap || gold < nextCost}
                onClick={() => invest(sin)}
                aria-label={`${strings.mercatus.deepen} ${name}`}
                title={atCap ? strings.mercatus.capped : undefined}
              >
                {unlocked
                  ? atCap
                    ? strings.mercatus.capped
                    : `${strings.mercatus.deepen} · ${nextCost} ${strings.resources.gold}`
                  : strings.opera.sinLocked}
              </button>
              {d > 0 && (
                <>
                  <button
                    type="button"
                    className="opera-btn opera-btn--stop"
                    onClick={() => divest(sin, 1)}
                    aria-label={`${strings.mercatus.cutBack} ${name}`}
                  >
                    {strings.mercatus.cutBack} · +{cutBackRefund} {strings.resources.gold}
                  </button>
                  <button
                    type="button"
                    className="opera-btn opera-btn--stop"
                    onClick={() => divest(sin, d)}
                    aria-label={`${strings.mercatus.sellOff} ${name}`}
                  >
                    {strings.mercatus.sellOff} · +{sellOffRefund} {strings.resources.gold}
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact rate readout: 2 decimals under 100, whole numbers above. */
function formatRate(n: number): string {
  if (n >= 100) return String(Math.floor(n));
  return (Math.round(n * 100) / 100).toString();
}

type DepraedatioTab = 'mercatura' | 'compositum';

function DepraedatioGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const notice = useGameStore((s) => s.notice);
  const [tab, setTab] = useState<DepraedatioTab>('mercatura');
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const tab_ = (id: DepraedatioTab, label: string): ReactElement => (
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
      <p className="opera-intro">{strings.opera.depraedatioIntro}</p>
      <div className="kat-pager" role="tablist">
        {tab_('mercatura', 'Vitium Mercatura')}
        {tab_('compositum', strings.compositum.heading)}
      </div>
      {tab === 'mercatura' && <MercaturaList />}
      {tab === 'compositum' && <CompositumSection />}
      {notice !== null && <p className="opera-notice">{notice}</p>}
    </>
  );
}

/**
 * Vitium Compositum (03 §2.3): multi-Sin ceremony toggles. Listed beneath the businesses in the
 * Depraedatio ledger. Each shows its Sin gate, cost→effect summary, and an activate/deactivate
 * button. Locked entries are dimmed with their gate spelled out.
 */
function CompositumSection(): ReactElement {
  const state = useGameStore((s) => s.state);
  const activate = useGameStore((s) => s.activateCeremony);
  const deactivate = useGameStore((s) => s.deactivateCeremony);
  if (!state) return <></>;
  return (
    <>
      <h3 className="vitium-heading">{strings.compositum.heading}</h3>
      <ul className="vitium-list">
        {COMPOSITUM_IDS.filter((id) => id !== 'panvitium').map((id) => {
          const def = compositumById(id);
          if (!def) return null;
          const unlocked = compositumUnlocked(state, def);
          const active = isToggleActive(state, id);
          const name = strings.compositum.names[id] ?? id;
          const gate = def.sins.map((s) => `${s} L${def.minLevel}`).join(' + ');
          return (
            <li
              key={id}
              className={`vitium-row${unlocked ? '' : ' vitium-locked'}${active ? ' vitium-active' : ''}`}
            >
              <div className="vitium-meta">
                <span className="vitium-name">{name}</span>
                {unlocked ? (
                  <>
                    <span className="vitium-sub">{compositumCostLine(def)}</span>
                    <span className="vitium-sub">{compositumOutcomesLine(def)}</span>
                  </>
                ) : (
                  <span className="vitium-sub">{gate}</span>
                )}
              </div>
              <div className="vitium-actions">
                {active ? (
                  <button
                    type="button"
                    className="opera-btn opera-btn--stop"
                    onClick={() => deactivate(id)}
                    aria-label={`${strings.compositum.stop} ${name}`}
                  >
                    {strings.compositum.stop}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="opera-btn"
                    disabled={!unlocked}
                    onClick={() => activate(id)}
                    aria-label={`${strings.compositum.start} ${name}`}
                  >
                    {unlocked ? strings.compositum.start : `${strings.opera.sinLocked} · ${gate}`}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <PanvitiumRow />
    </>
  );
}

/**
 * Panvitium (03 §2.3): the endgame ritual. A Vitium Compositum gated on all eight Sins at level 3,
 * with a two-step confirmation before activation (it cannot be turned off by hand and its cost
 * ramps exponentially). Always shown as a teaser, dimmed until unlocked; while active it pulses.
 */
function PanvitiumRow(): ReactElement {
  const state = useGameStore((s) => s.state);
  const activate = useGameStore((s) => s.activateCeremony);
  const [confirming, setConfirming] = useState(false);
  const def = compositumById('panvitium');
  if (!state || !def) return <></>;
  const unlocked = compositumUnlocked(state, def);
  const active = isToggleActive(state, 'panvitium');
  // Hidden until unlocked (all eight Sins ≥ 3). Sin levels never decrease, so once shown it stays.
  if (!unlocked) return <></>;
  const name = strings.compositum.names.panvitium ?? 'Panvitium';
  return (
    <div className={`panvitium-row${active ? ' panvitium-row--active' : ''}`}>
      <div className="vitium-meta">
        <span className="vitium-name panvitium-name">{name}</span>
        <span className="vitium-sub">
          {active
            ? strings.compositum.panvitiumActive
            : unlocked
              ? strings.compositum.panvitiumReady
              : strings.compositum.panvitiumGate}
        </span>
      </div>
      <div className="vitium-actions">
        {active ? (
          <span className="panvitium-burning">{strings.compositum.panvitiumBurning}</span>
        ) : confirming ? (
          <>
            <button
              type="button"
              className="opera-btn panvitium-btn"
              onClick={() => {
                activate('panvitium');
                setConfirming(false);
              }}
            >
              {strings.compositum.panvitiumConfirm}
            </button>
            <button
              type="button"
              className="opera-btn opera-btn--secondary"
              onClick={() => setConfirming(false)}
            >
              {strings.compositum.panvitiumCancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="opera-btn panvitium-btn"
            disabled={!unlocked}
            onClick={() => setConfirming(true)}
          >
            {unlocked ? strings.compositum.panvitiumBegin : strings.opera.sinLocked}
          </button>
        )}
      </div>
    </div>
  );
}

/** Achievements ledger (03 §7): the catalog with unlocked rows lit and locked rows dimmed. */
function AchievementsGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const unlockedCount = state
    ? ACHIEVEMENTS.reduce((n, a) => (isUnlocked(state, a.id) ? n + 1 : n), 0)
    : 0;
  return (
    <>
      <p className="opera-intro">{strings.achievements.intro}</p>
      <p className="achievement-count">
        {unlockedCount} / {ACHIEVEMENTS.length}
      </p>
      <ul className="achievement-list">
        {ACHIEVEMENTS.map((a) => {
          const got = state ? isUnlocked(state, a.id) : false;
          return (
            <li key={a.id} className={`achievement-row${got ? ' achievement-unlocked' : ''}`}>
              <span className="achievement-mark" aria-hidden="true">
                {got ? '◆' : '◇'}
              </span>
              <span className="achievement-meta">
                <span className="achievement-name">
                  {got ? strings.achievements.names[a.id] : strings.achievements.hiddenName}
                </span>
                <span className="achievement-desc">{strings.achievements.descriptions[a.id]}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Body for a selected PC group. */
function PcGroupBody({ group }: { group: PcGroupId }): ReactElement {
  if (group === 'depraedatio') return <DepraedatioGroup />;
  if (group === 'decimatio') return <DecimatioGroup />;
  if (group === 'indagatio') return <IndagatioGroup />;
  if (group === 'emptio') return <EmptioGroup />;
  if (group === 'analytics') return <AnalyticsGroup />;
  if (group === 'emails') return <EmailsGroup />;
  if (group === 'achievements') return <AchievementsGroup />;
  if (group === 'logs') return <OutcomeLog />;
  return <p className="pc-empty">{strings.opera.notYet}.</p>;
}

/**
 * The Studio desk PC (02 §10): the designed Ubuntu-style file manager whose "files" are the ritual
 * programs, each launching the real system body via `PcGroupBody`. A full-screen overlay (rendered
 * by App, not framed in a Panel). The designed program id ("Depraedatio") lower-cases to the group.
 */
export function PcDesk({ onClose }: { onClose: () => void }): ReactElement {
  const unread = useGameStore((s) => (s.state ? unreadCount(s.state) : 0));
  return (
    <DesignedPc
      onClose={onClose}
      badges={{ Emails: unread }}
      renderProgram={(id) => <PcGroupBody group={id.toLowerCase() as PcGroupId} />}
    />
  );
}

/**
 * The desk terminal (Studio, 02 §10): a simple Win95-style menu of action groups; selecting one
 * opens that group's actions, with a way back to the menu.
 */
function PcPanel(): ReactElement {
  const [group, setGroup] = useState<PcGroupId | null>(null);

  if (group === null) {
    return (
      <div className="pc">
        <p className="pc-prompt">
          {'C:\\LAIR> '}
          {strings.opera.selectLedger}
        </p>
        <div className="pc-menu">
          {PC_GROUPS.map((g) => (
            <button key={g.id} type="button" className="pc-menu-btn" onClick={() => setGroup(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const label = PC_GROUPS.find((g) => g.id === group)?.label ?? group;
  return (
    <div className="pc">
      <button type="button" className="pc-back" onClick={() => setGroup(null)}>
        ← {strings.opera.back}
      </button>
      <h3 className="pc-heading">{label}</h3>
      <PcGroupBody group={group} />
    </div>
  );
}

interface PanelContent {
  title: string;
  body: ReactNode;
}

/**
 * Ars Goetia (Invocation Room, 02 §12): the invocation list. An entry appears once invoking power
 * reaches half its requirement (a teaser). Each shows its gate, soul cost, and active count, with a
 * Summon button (gated) and a Dispel button when ≥1 active. Invoking power is shown at the top.
 */
function ArsGoetiaPanel(): ReactElement {
  const state = useGameStore((s) => s.state);
  const summon = useGameStore((s) => s.summon);
  const banish = useGameStore((s) => s.banish);
  const notice = useGameStore((s) => s.notice);
  if (!state) return <p className="pc-empty">{strings.invocations.empty}</p>;

  const power = currentInvokingPower(state);
  const souls = floor(state.souls).toNumber();
  const visible = INVOCATION_IDS.map(invocationById).filter(
    (def): def is NonNullable<typeof def> => !!def && invocationVisible(state, def),
  );

  return (
    <div className="invocations">
      <p className="invocations-power">
        {strings.invocations.power}: {power}
      </p>
      <p className="opera-intro">{strings.invocations.intro}</p>
      {visible.length === 0 ? (
        <p className="pc-empty">{strings.invocations.empty}</p>
      ) : (
        <ul className="vitium-list">
          {visible.map((def) => {
            const unlocked = invocationUnlocked(state, def);
            const count = activeInvocationCount(state, def.id);
            const cost = floor(invocationSoulCost(state, def)).toNumber();
            const name = strings.invocations.names[def.id] ?? def.id;
            const gate =
              def.sinLevel !== undefined && def.sin !== null
                ? `${def.invokingPower} ${strings.maleficia.invokingPower} · ${def.sin} L${def.sinLevel}`
                : `${def.invokingPower} ${strings.maleficia.invokingPower}`;
            const costLabel =
              cost > 0 ? `${cost} ${strings.resources.souls}` : strings.invocations.free;
            const atCap = def.maxActive !== undefined && count >= def.maxActive;
            return (
              <li
                key={def.id}
                className={`vitium-row${unlocked ? '' : ' vitium-locked'}${count > 0 ? ' vitium-active' : ''}`}
              >
                <div className="vitium-meta">
                  <span className="vitium-name">{name}</span>
                  <span className="vitium-sub">
                    {unlocked ? costLabel : gate}
                    {count > 0 ? ` · ${count} ${strings.invocations.active}` : ''}
                  </span>
                </div>
                <div className="vitium-actions">
                  <button
                    type="button"
                    className="opera-btn"
                    disabled={!unlocked || atCap || souls < cost}
                    onClick={() => summon(def.id)}
                    aria-label={`${strings.invocations.summon} ${name}`}
                  >
                    {unlocked ? strings.invocations.summon : `${strings.opera.sinLocked} · ${gate}`}
                  </button>
                  {count > 0 && (
                    <button
                      type="button"
                      className="opera-btn opera-btn--stop"
                      onClick={() => banish(def.id)}
                      aria-label={`${strings.invocations.dispel} ${name}`}
                    >
                      {strings.invocations.dispel}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {notice !== null && <p className="opera-notice">{notice}</p>}
    </div>
  );
}

/** Placeholder copy in the game's voice; each panel's real menu lands with its system. */
export const PANELS: Record<PanelId, PanelContent> = {
  'ars-goetia': {
    title: 'Ars Goetia',
    body: <ArsGoetiaPanel />,
  },
  maleficia: {
    title: 'The Maleficia Shelf',
    body: <MaleficiaShelf />,
  },
  pc: {
    title: 'The Desk',
    body: <PcPanel />,
  },
  suasio: {
    title: 'The Suasio Scroll',
    body: <SuasioPanel />,
  },
};
