import { useState, type ReactElement, type ReactNode } from 'react';
import { strings } from '@panvitium/shared';
import {
  floor,
  SINS,
  sinLevel,
  MAX_SIN_LEVEL,
  ACTIONS,
  categoryEfficiency,
  MALEFICIA,
  countCopies,
  totalInvokingPower,
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
  type OutcomeEvent,
} from '@panvitium/sim';
import { type PanelId } from '../rooms/rooms.js';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum } from '../game/format.js';

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

const ACTION_NAME: Record<string, string> = {
  suggestion: strings.opera.suggestion,
  caedis: strings.opera.caedis,
};

/** A single outcome rendered as a terminal log line: "Caedis · Good — +1 Souls, -1 Reprobates". */
function describeOutcome(e: OutcomeEvent): string {
  const name = ACTION_NAME[e.actionId] ?? e.actionId;
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
  if (!state || !isDelegatable(actionId)) return null;
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

/** The Suasio scroll (Studio): tempt ordinary humans into reprobates. */
function SuasioPanel(): ReactElement {
  const influence = useGameStore((s) =>
    s.state ? floor(s.state.lifetime.influence).toNumber() : 0,
  );
  const eff = useGameStore((s) => (s.state ? categoryEfficiency(s.state, 'suasio') : 1));
  const notice = useGameStore((s) => s.notice);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  // Efficiency scales cost and outcome the same percentage (03 §2.1). Display the actual cost the
  // player will pay so the bump from Gula levels never silently surprises them.
  const cost = Math.ceil((ACTIONS.suggestion?.cost.influence ?? 0) * eff);
  return (
    <div className="opera">
      <p className="opera-intro">{strings.opera.suasioIntro}</p>
      <ActionRow
        name={strings.opera.suggestion}
        cost={`${cost} ${strings.resources.influence} · 10s`}
        cta={strings.opera.tempt}
        disabled={underway || influence < cost}
        onAct={() => act('suggestion')}
      />
      {underway && <p className="opera-hint">{strings.opera.underway}</p>}
      {notice !== null && <p className="opera-notice">{notice}</p>}
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

/** Decimatio actions (only Caedis wired so far). */
function DecimatioGroup(): ReactElement {
  const gold = useGameStore((s) => (s.state ? floor(s.state.lifetime.gold).toNumber() : 0));
  const eff = useGameStore((s) => (s.state ? categoryEfficiency(s.state, 'decimatio') : 1));
  const notice = useGameStore((s) => s.notice);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  const cost = Math.ceil((ACTIONS.caedis?.cost.gold ?? 0) * eff);
  return (
    <>
      <ActionRow
        name={strings.opera.caedis}
        cost={`${cost} ${strings.resources.gold} · 10s`}
        cta={strings.opera.cull}
        disabled={underway || gold < cost}
        onAct={() => act('caedis')}
      />
      {underway && <p className="opera-hint">{strings.opera.underway}</p>}
      {notice !== null && <p className="opera-notice">{notice}</p>}
    </>
  );
}

type PcGroupId = 'depraedatio' | 'decimatio' | 'indagatio' | 'emptio' | 'logs';

const PC_GROUPS: { id: PcGroupId; label: string }[] = [
  { id: 'depraedatio', label: strings.opera.depraedatio },
  { id: 'decimatio', label: strings.opera.decimatio },
  { id: 'indagatio', label: strings.opera.indagatio },
  { id: 'emptio', label: strings.opera.emptio },
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
          return (
            <li key={`${idx}-${id}`} className="emptio-row">
              <span className={`rarity-badge rarity-${def.rarity}`}>
                {strings.maleficia.rarity[def.rarity]}
              </span>
              <span className="emptio-name">{def.name}</span>
              <span className="emptio-cost">
                {def.cost} {strings.resources.gold}
              </span>
              <button
                type="button"
                className="opera-btn emptio-buy"
                disabled={underway || gold < def.cost}
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
  const owned = useGameStore((s) => (s.state ? s.state.lifetime.maleficia : []));
  if (owned.length === 0) {
    return <p className="pc-empty">{strings.maleficia.empty}</p>;
  }
  // Preserve first-acquired order while collapsing duplicates into counts.
  const order: string[] = [];
  const seen = new Set<string>();
  for (const id of owned) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  const totalPower = totalInvokingPower(owned);
  return (
    <div className="maleficia-shelf">
      <p className="opera-intro">{strings.maleficia.intro}</p>
      <p className="maleficia-power">
        {totalPower} {strings.maleficia.invokingPower}
      </p>
      <ul className="maleficia-list">
        {order.map((id) => {
          const def = MALEFICIA[id];
          if (!def) return null;
          const count = countCopies(owned, id);
          return (
            <li key={id} className="maleficium-row">
              <span className={`rarity-badge rarity-${def.rarity}`}>
                {strings.maleficia.rarity[def.rarity]}
              </span>
              <span className="maleficium-name">
                {def.name}
                {count > 1 ? ` ×${count}` : ''}
              </span>
              <span className="maleficium-desc">{def.description}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
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
 * Depraedatio (03 §2.3): Vitium Mercatura. Eight entry-tier businesses (one per Sin, gated at
 * Level 1). Each builds via the parallel buildQueue — does NOT occupy the player slot, so the
 * player can run a Studio rite simultaneously and queue multiple builds at once.
 */
function DepraedatioGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const notice = useGameStore((s) => s.notice);
  const build = useGameStore((s) => s.build);
  const shutdown = useGameStore((s) => s.shutdown);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;

  const gold = floor(state.lifetime.gold).toNumber();
  const buildQueue = state.lifetime.buildQueue;
  const owned = state.lifetime.businesses;

  return (
    <>
      <p className="opera-intro">{strings.opera.depraedatioIntro}</p>
      <ul className="vitium-list">
        {BUSINESS_IDS.map((id) => {
          const def = businessById(id);
          if (!def) return null;
          const have = sinLevel(state.devotion[def.sin]);
          const unlocked = have >= def.level;
          const ownedCount = owned[id] ?? 0;
          const refund = Math.floor(def.buildCost * SHUTDOWN_REFUND_FRACTION);
          const name = strings.businesses[id] ?? id;
          const buildCostLabel = `${def.buildCost} ${strings.resources.gold} · ${formatDuration(def.buildTimeSeconds)}`;
          return (
            <li key={id} className={`vitium-row${unlocked ? '' : ' vitium-locked'}`}>
              <div className="vitium-meta">
                <span className="vitium-name">{name}</span>
                <span className="vitium-sub">
                  {def.sin} L{def.level}
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
                    : `${strings.opera.sinLocked} · ${def.sin} L${def.level}`}
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
      {buildQueue.length > 0 && (
        <>
          <h3 className="vitium-heading">{strings.opera.inFlight}</h3>
          <ul className="vitium-queue">
            {buildQueue.map((t, idx) => {
              const def = businessById(t.businessId);
              const name = def ? (strings.businesses[t.businessId] ?? t.businessId) : t.businessId;
              return (
                <li key={`${idx}-${t.businessId}`} className="vitium-queue-row">
                  <span className="vitium-queue-name">{name}</span>
                  <span className="vitium-queue-time">
                    {formatDuration(Math.max(0, Math.ceil(t.remainingSeconds)))}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <CompositumSection />
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
        {COMPOSITUM_IDS.map((id) => {
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
    </>
  );
}

/** Body for a selected PC group. */
function PcGroupBody({ group }: { group: PcGroupId }): ReactElement {
  if (group === 'depraedatio') return <DepraedatioGroup />;
  if (group === 'decimatio') return <DecimatioGroup />;
  if (group === 'indagatio') return <IndagatioGroup />;
  if (group === 'emptio') return <EmptioGroup />;
  if (group === 'logs') return <OutcomeLog />;
  return <p className="pc-empty">{strings.opera.notYet}.</p>;
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

/** Four pips, `level` filled — a Sin's 0..4 progress. */
function altarPips(level: number): string {
  let out = '';
  for (let i = 0; i < MAX_SIN_LEVEL; i++) out += i < level ? '●' : '○';
  return out;
}

/** The altar menu (02 §10): Devotion and level per Prince, plus the descent trigger. */
function AltarPanel(): ReactElement {
  const state = useGameStore((s) => s.state);
  const begin = useGameStore((s) => s.beginKatabasis);
  if (!state) return <p>{strings.altar.intro}</p>;
  return (
    <div className="altar">
      <p className="altar-intro">{strings.altar.intro}</p>
      <ul className="devotion-list">
        {SINS.map((sin) => {
          const info = strings.sins[sin];
          return (
            <li className="devotion-row" key={sin}>
              <span className="devotion-name">
                {info.prince} · {info.latin}
              </span>
              <span className="devotion-pips">{altarPips(sinLevel(state.devotion[sin]))}</span>
              <span className="devotion-total">{formatBigNum(state.devotion[sin])}</span>
            </li>
          );
        })}
      </ul>
      <p className="altar-sigils">{strings.altar.sigilsNone}</p>
      <button type="button" className="opera-btn descend-btn" onClick={() => begin()}>
        {strings.altar.descend}
      </button>
    </div>
  );
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
