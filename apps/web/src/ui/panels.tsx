import { useState, type ReactElement, type ReactNode } from 'react';
import { strings } from '@panvitium/shared';
import {
  floor,
  sinLevel,
  ACTIONS,
  actionUnlocked,
  categoryEfficiency,
  MALEFICIA,
  BUSINESS_IDS,
  businessById,
  SHUTDOWN_REFUND_FRACTION,
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
  type OutcomeEvent,
} from '@panvitium/sim';
import { type PanelId } from '../menus/types.js';
import { AltarPanel as DesignedAltar } from '../menus/AltarPanel.js';
import { MaleficiaCabinet as DesignedCabinet } from '../menus/MaleficiaCabinet.js';
import { SuasioPanel as DesignedSuasio } from '../menus/SuasioPanel.js';
import { PcWindow as DesignedPc } from '../menus/PcWindow.js';
import { AnalyticsGroup } from './Analytics.js';
import { EmailsGroup } from './Emails.js';
import { buildAltar } from '../game/altar.js';
import { buildCabinet } from '../game/maleficia.js';
import { pogromTargets } from '../game/decimatio.js';
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

/**
 * Pogrom (Decimatio): purges one *chosen* reprobate subtype, so it carries a subtype picker. The
 * picker offers only present subtypes (via `pogromTargets`); casting wires the chosen subtype through
 * `act('pogrom', subtype)`. No acolyte delegation here on purpose — a delegated Pogrom runs with no
 * target (it would purge nothing yet still risk the bad-tier penalties), so automating it waits on a
 * target-selection design for acolytes.
 */
function PogromRow({ cost, disabled }: { cost: number; disabled: boolean }): ReactElement {
  const state = useGameStore((s) => s.state);
  const act = useGameStore((s) => s.act);
  const [target, setTarget] = useState<string>('');
  const targets = state ? pogromTargets(state) : [];
  const none = targets.length === 0;
  // Keep the selection valid as the population shifts (a culled subtype can vanish mid-view).
  const selected = targets.some((t) => t.subtype === target) ? target : (targets[0]?.subtype ?? '');
  return (
    <div className="opera-action">
      <div className="opera-meta">
        <span className="opera-name">{strings.opera.pogrom}</span>
        <span className="opera-cost">
          {cost} {strings.resources.gold} · {ACTIONS.pogrom?.baseTimeSeconds ?? 0}s
        </span>
      </div>
      <select
        className="pogrom-target"
        aria-label={strings.opera.pogromTarget}
        value={selected}
        disabled={none}
        onChange={(e) => setTarget(e.target.value)}
      >
        {none ? (
          <option value="">{strings.opera.pogromEmpty}</option>
        ) : (
          targets.map((t) => (
            <option key={t.subtype} value={t.subtype}>
              {t.label} ({t.count})
            </option>
          ))
        )}
      </select>
      <button
        type="button"
        className="opera-btn"
        disabled={disabled || none || selected === ''}
        onClick={() => act('pogrom', selected)}
      >
        {strings.opera.purge}
      </button>
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
          <PogromRow cost={goldCost('pogrom')} disabled={underway || gold < goldCost('pogrom')} />
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
 * Depraedatio (03 §2.3): Vitium Mercatura. Thirty-two businesses (eight Sins × four tiers); each
 * tier unlocks at Sin level `tier − 1`, with locked rows shown dimmed. Each builds via the parallel
 * buildQueue — does NOT occupy the player slot, so the player can run a Studio rite simultaneously
 * and queue multiple builds at once.
 */
/** The Vitium Mercatura businesses — build / shut down, gated by Sin level. */
function MercaturaList(): ReactElement {
  const state = useGameStore((s) => s.state);
  const build = useGameStore((s) => s.build);
  const shutdown = useGameStore((s) => s.shutdown);
  if (!state) return <></>;
  const gold = floor(state.lifetime.gold).toNumber();
  const owned = state.lifetime.businesses;
  return (
    <ul className="vitium-list">
      {BUSINESS_IDS.map((id) => {
        const def = businessById(id);
        if (!def) return null;
        const have = sinLevel(state.devotion[def.sin]);
        const required = def.level - 1; // spreadsheet "Sin-lvl unlock" column is (tier − 1)
        const unlocked = have >= required;
        const ownedCount = owned[id] ?? 0;
        const refund = Math.floor(def.buildCost * SHUTDOWN_REFUND_FRACTION);
        const name = strings.businesses[id] ?? id;
        const buildCostLabel = `${def.buildCost} ${strings.resources.gold} · ${formatDuration(def.buildTimeSeconds)}`;
        return (
          <li key={id} className={`vitium-row${unlocked ? '' : ' vitium-locked'}`}>
            <div className="vitium-meta">
              <span className="vitium-name">{name}</span>
              <span className="vitium-sub">
                {def.sin}
                {required > 0 ? ` L${required}` : ''}
                {ownedCount > 0 ? ` · ${ownedCount} ${strings.opera.owned}` : ''}
              </span>
            </div>
            <div className="vitium-actions">
              <button
                type="button"
                className="opera-btn"
                disabled={!unlocked || gold < def.buildCost}
                onClick={() => build(id)}
                aria-label={`${strings.opera.build} ${name}`}
              >
                {unlocked
                  ? `${strings.opera.build} · ${buildCostLabel}`
                  : `${strings.opera.sinLocked} · ${def.sin} L${required}`}
              </button>
              {ownedCount > 0 && (
                <button
                  type="button"
                  className="opera-btn opera-btn--secondary"
                  onClick={() => shutdown(id)}
                  aria-label={`${strings.opera.shutdown} ${name}`}
                >
                  {strings.opera.shutdown} · +{refund} {strings.resources.gold}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Businesses currently under construction. Identical builds are collapsed into one row with a count
 * ("6× Street food stand") rather than six separate rows; the time shown is the soonest to finish.
 */
function InFlightList(): ReactElement {
  const state = useGameStore((s) => s.state);
  if (!state) return <></>;
  const buildQueue = state.lifetime.buildQueue;
  if (buildQueue.length === 0) {
    return <p className="pc-empty">{strings.opera.depraedatioEmpty}</p>;
  }
  const groups = new Map<string, { count: number; soonest: number }>();
  for (const t of buildQueue) {
    const g = groups.get(t.businessId);
    if (g) {
      g.count += 1;
      g.soonest = Math.min(g.soonest, t.remainingSeconds);
    } else {
      groups.set(t.businessId, { count: 1, soonest: t.remainingSeconds });
    }
  }
  return (
    <ul className="vitium-queue">
      {[...groups.entries()].map(([id, g]) => {
        const name = strings.businesses[id] ?? id;
        return (
          <li key={id} className="vitium-queue-row">
            <span className="vitium-queue-name">
              {g.count > 1 ? `${g.count}\u00D7 ${name}` : name}
            </span>
            <span className="vitium-queue-time">
              {formatDuration(Math.max(0, Math.ceil(g.soonest)))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type DepraedatioTab = 'mercatura' | 'compositum' | 'inflight';

function DepraedatioGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const notice = useGameStore((s) => s.notice);
  const [tab, setTab] = useState<DepraedatioTab>('mercatura');
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const inFlight = state.lifetime.buildQueue.length;
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
        {tab_('inflight', `${strings.opera.inFlight}${inFlight > 0 ? ` · ${inFlight}` : ''}`)}
      </div>
      {tab === 'mercatura' && <MercaturaList />}
      {tab === 'compositum' && <CompositumSection />}
      {tab === 'inflight' && <InFlightList />}
      {notice !== null && <p className="opera-notice">{notice}</p>}
    </>
  );
}

/** Build a short "cost → effect" label for a Vitium Compositum entry. */
function compositumSummary(id: string): string {
  const def = compositumById(id);
  if (!def) return '';
  const costs: string[] = [];
  if (def.costPerSecond.gold) costs.push(`${def.costPerSecond.gold} ${strings.resources.gold}/s`);
  if (def.costPerSecond.influence)
    costs.push(`${def.costPerSecond.influence} ${strings.resources.influence}/s`);
  const effects: string[] = [];
  if (def.goldPerSecond) effects.push(`+${def.goldPerSecond} ${strings.resources.gold}/s`);
  if (def.influencePerSecond)
    effects.push(`+${def.influencePerSecond} ${strings.resources.influence}/s`);
  if (def.generationPerSecond) effects.push(strings.compositum.generates);
  if (def.conversionPerSecond) effects.push(strings.compositum.converts);
  if ((def.flatGenerationPerSecond ?? 0) > 0) effects.push(strings.compositum.generates);
  if ((def.flatGenerationPerSecond ?? 0) < 0) effects.push(strings.compositum.slowsGeneration);
  if (def.populationGeneration) effects.push(strings.compositum.generates);
  if (def.deathFractionPerSecond) effects.push(strings.compositum.culls);
  if (def.flatBaseSuicideRatePerSecond) effects.push(strings.compositum.raisesSuicide);
  if (def.flatBaseCholericMurderRatePerSecond) effects.push(strings.compositum.raisesMurder);
  if (def.penaltyIncrease) effects.push(strings.compositum.sharpensVices);
  if (def.offlineGainBoost) effects.push(strings.compositum.idleGains);
  const costStr = costs.length > 0 ? costs.join(' · ') : strings.compositum.noCost;
  return `${costStr} \u2192 ${effects.join(' · ')}`;
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
                <span className="vitium-sub">{unlocked ? compositumSummary(id) : gate}</span>
              </div>
              <div className="vitium-actions">
                {active ? (
                  <button
                    type="button"
                    className="opera-btn opera-btn--secondary"
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
  return (
    <DesignedPc
      onClose={onClose}
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

/** The altar menu (02 §10): Devotion and level per Prince, bound sigils, plus the descent trigger.
 * Renders the designed Altar ledger fed by the real `buildAltar` view-model; the designed component
 * owns the two-tap arm/confirm and calls `beginKatabasis` on commit. */
function AltarPanel(): ReactElement {
  const state = useGameStore((s) => s.state);
  const begin = useGameStore((s) => s.beginKatabasis);
  if (!state) return <p>{strings.altar.intro}</p>;
  const { sins, boundSigils } = buildAltar(state);
  return <DesignedAltar sins={sins} boundSigils={boundSigils} onDescend={begin} />;
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
                      className="opera-btn opera-btn--secondary"
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
  'altar-menu': {
    title: 'The Altar',
    body: <AltarPanel />,
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
