import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
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
  sinLevel,
  MERCATUS_GEN_PER_DEPTH,
  mercatusGenerationClauseMul,
  type Sin,
  COMPOSITUM_IDS,
  compositumById,
  compositumUnlocked,
  isToggleActive,
  assignedCount,
  isDelegatable,
  isAutoRepeatable,
  isAutoRepeating,
  ACHIEVEMENTS,
  isUnlocked,
  unreadCount,
  dialCode,
  totalReprobates,
  type OutcomeEvent,
  type Tier,
} from '@panvitium/sim';
import { type PanelId } from '../menus/types.js';
import { SmartphoneDialer, type DialResult } from '../menus/SmartphoneDialer.js';
import { compositumCostLine, compositumOutcomesLine } from '../game/compositumText.js';
import { MaleficiaCabinet as DesignedCabinet } from '../menus/MaleficiaCabinet.js';
import { SuasioPanel as DesignedSuasio } from '../menus/SuasioPanel.js';
import { PcWindow as DesignedPc } from '../menus/PcWindow.js';
import { AnalyticsGroup } from './Analytics.js';
import { EmailsGroup } from './Emails.js';
import { buildCabinet } from '../game/maleficia.js';
import { formatBigNum } from '../game/format.js';
import { OrbisTenebrarum, type OrbisFind } from '../menus/orbis-tenebrarum/index.js';
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

/** A single outcome rendered as a terminal log line: "Caedes · Good — +1 Souls, -1 Reprobates". */
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

/**
 * Auto-repeat toggle for a player rite (02 §3). Appears once the rite passes its "toggle" Sin level
 * (`isAutoRepeatable`); flipping it on loops the rite in the player's own slot until flipped off.
 * Distinct from acolyte delegation — this is the player's hands, not a follower's.
 */
function AutoRepeatToggle({ actionId }: { actionId: string }): ReactElement | null {
  const state = useGameStore((s) => s.state);
  const toggleAutoRepeat = useGameStore((s) => s.toggleAutoRepeat);
  if (!state || !isAutoRepeatable(state, actionId)) return null;
  const on = isAutoRepeating(state, actionId);
  return (
    <button
      type="button"
      className={'auto-repeat-btn' + (on ? ' auto-repeat-btn--on' : '')}
      aria-pressed={on}
      onClick={() => toggleAutoRepeat(actionId, !on)}
      title={strings.autoRepeat.label}
      aria-label={strings.autoRepeat.label}
    >
      {'↻'} {on ? strings.autoRepeat.stop : strings.autoRepeat.start}
    </button>
  );
}

/**
 * The per-rite control cluster shown beneath an unlocked Opera action: the player's own auto-repeat
 * toggle plus the acolyte delegation `+/−`. Each piece self-hides when it doesn't apply, so this
 * renders nothing for a plain rite with neither unlocked.
 */
function RiteControls({ actionId }: { actionId: string }): ReactElement {
  return (
    <div className="rite-controls">
      <AutoRepeatToggle actionId={actionId} />
      <AcolyteControls actionId={actionId} />
    </div>
  );
}

/** True while a player-driven rite holds the slot (02 §3: one at a time). Indagatio scries in the
 * background and does NOT count, so Suasio/Decimatio/Emptio stay available while a search runs. */
function useUnderway(): boolean {
  return useGameStore((s) =>
    s.state ? s.state.lifetime.actionQueue.some((t) => t.actionId !== 'indagatio') : false,
  );
}

/** The three temptations in scroll order, with their alchemical sigils (☿ Mercury, ✴ the eight
 * voices, ☉ the crowned Sun) and Roman numerals. Suasio always presents exactly these three. */
const SUASIO_ORDER = ['suggestion', 'logismoi', 'imperium'] as const;
const SUASIO_GLYPHS: Record<string, string> = {
  suggestion: '\u263F',
  logismoi: '\u2734',
  imperium: '\u2609',
};
const SUASIO_NUMERALS = ['I', 'II', 'III'] as const;
/** Sin level → Roman numeral for inline "<Sin> <level>" gate labels (e.g. "Luxuria III"). */
const SIN_LEVEL_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const;
const romanLevel = (n: number): string => SIN_LEVEL_ROMAN[n] ?? String(n);

/**
 * The Suasio scroll (Studio) — "Opus Suasio, the Honeyed Tongue" (Claude Design rework). A
 * self-framed, full-surface overlay (mounted by App like Ars Goetia / the PC, NOT via PanelShell):
 * it feeds the designed parchment with the real action, cost, and live progress, and preserves
 * acolyte delegation per delegatable rite. A sealed (locked) rite shows redacted Latin + its Sin
 * gate. Resolved outcomes live in the PC's Logs program, not on the scroll.
 */
export function SuasioScroll({ onClose }: { onClose: () => void }): ReactElement {
  const state = useGameStore((s) => s.state);
  const act = useGameStore((s) => s.act);
  const head = useGameStore(
    (s) => s.state?.lifetime.actionQueue.find((t) => t.actionId !== 'indagatio') ?? null,
  );

  const headerProps = {
    eyebrow: strings.opera.suasioEyebrow,
    title: strings.opera.suasioTitle,
    maxim: strings.opera.suasioMaxim,
    closeLabel: strings.opera.suasioClose,
    onClose,
  };
  if (!state) return <DesignedSuasio {...headerProps} actions={[]} />;

  const influence = floor(state.lifetime.influence).toNumber();
  const eff = categoryEfficiency(state, 'suasio');
  const underway = state.lifetime.actionQueue.some((t) => t.actionId !== 'indagatio');
  const names: Record<string, string> = {
    suggestion: strings.opera.suggestion,
    logismoi: strings.opera.logismoi,
    imperium: strings.opera.imperium,
  };
  const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);

  const actions = SUASIO_ORDER.map((id, i) => {
    const def = ACTIONS[id]!;
    const influenceCost = Math.ceil((def.cost.influence ?? 0) * eff);
    const locked = !actionUnlocked(state, def);
    const active = head?.actionId === id;
    // Suasio is cost-outcome, so a rite's queued duration is exactly its baseTimeSeconds — which
    // lets us reconstruct progress from the remaining time with no sim/save change.
    const base = def.baseTimeSeconds;
    const remaining = head?.remainingSeconds ?? base;
    const progress =
      active && base > 0 ? Math.min(100, Math.max(0, ((base - remaining) / base) * 100)) : 0;
    const sealed = locked ? strings.opera.suasioSealed[id] : undefined;
    // The control cluster (auto-repeat toggle + acolyte delegation) shows on any unlocked rite that
    // has at least one of them available — the toggle needs no acolytes, delegation needs them.
    const hasControls =
      !locked &&
      (isAutoRepeatable(state, id) ||
        (state.lifetime.acolytes.length > 0 && isDelegatable(state, id)));
    return {
      id,
      numeral: SUASIO_NUMERALS[i] ?? '',
      glyph: SUASIO_GLYPHS[id] ?? '',
      name: locked ? (sealed?.name ?? '') : (names[id] ?? def.id),
      quote: locked ? (sealed?.maxim ?? '') : (strings.opera.suasioQuote[id] ?? ''),
      cost: `${influenceCost} ${strings.resources.influence} · ${def.baseTimeSeconds}s`,
      cta: strings.opera.suasioCta[id] ?? strings.opera.tempt,
      status: strings.opera.suasioStatus[id] ?? '',
      locked,
      active,
      progress,
      disabled: underway || locked || influence < influenceCost,
      onTempt: () => act(id),
      ...(def.unlock
        ? {
            lockLabel: `${strings.opera.suasioRequires} ${cap(def.unlock.sin)} ${romanLevel(
              def.unlock.level,
            )}`,
          }
        : {}),
      ...(hasControls ? { delegation: <RiteControls actionId={id} /> } : {}),
    };
  });

  return <DesignedSuasio {...headerProps} actions={actions} />;
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

/**
 * Decimatio — "The Breathing Dark" (Claude Design). Per-tier outcome colour for the Index Opervm
 * ledger row, keyed by the real `OutcomeEvent.tier`.
 */
const DECIMATIO_TIER_COLOR: Record<Tier, string> = {
  stellar: '#e8c46a',
  excellent: '#c98a36',
  good: '#b5772e',
  neutral: '#8a7a5e',
  bad: '#a85a2a',
  terrible: '#9e3a22',
  apocalyptic: '#cf3018',
};

/** The decimatio rites, in liturgical order, with their card chrome (numeral + accent class). */
const DECIMATIO_RITES = [
  { id: 'caedes', numeral: 'I', cardClass: 'i' },
  { id: 'pogrom', numeral: 'II', cardClass: 'ii' },
  { id: 'purgatio', numeral: 'III', cardClass: 'iii' },
] as const;

/** A rite's base duration as the design renders it ("1s", "60s", "6 min"). */
function decimatioTime(seconds: number): string {
  return seconds >= 120 ? `${seconds / 60} min` : `${seconds}s`;
}

/**
 * Re-skin one real Decimatio outcome into the ledger's second column. Souls minted always equal the
 * reprobates culled (1 soul per death), so a productive roll reads as one magnitude `X`; a net-loss
 * roll (the Church/Higher-Power tails take gold and/or the flock) reads as the rite backfiring; a
 * roll that changed nothing reads as tribute spent for no yield.
 */
function decimatioLedgerText(e: OutcomeEvent): string {
  const name = actionName(e.actionId);
  if (e.soulsDelta > 0) {
    return `${name} · ${e.soulsDelta.toLocaleString('en-US')} ${strings.opera.decimatioYield}`;
  }
  const losses: string[] = [];
  if (e.goldDelta < 0) {
    losses.push(`−${Math.abs(e.goldDelta).toLocaleString('en-US')} ${strings.resources.gold}`);
  }
  if (e.reprobateDelta < 0) {
    losses.push(`−${Math.abs(e.reprobateDelta).toLocaleString('en-US')} ${strings.reprobates}`);
  }
  if (losses.length > 0) {
    return `${name} · ${losses.join(' · ')} · ${strings.opera.decimatioBackfired}`;
  }
  return `${name} · ${strings.opera.decimatioNoYield}`;
}

/**
 * One rite card. Self-contained: it reads its delegation/auto-repeat state from the store and wires
 * the stepper / toggle / commission button to the real actions, matching the live `AcolyteControls`
 * and `AutoRepeatToggle` gating. The stepper only appears once the rite is delegatable and at least
 * one acolyte exists; the auto toggle only once the rite is auto-repeatable.
 */
function DecimatioRite({
  id,
  numeral,
  cardClass,
  cost,
  time,
  disabled,
}: {
  id: string;
  numeral: string;
  cardClass: 'i' | 'ii' | 'iii';
  cost: string;
  time: string;
  disabled: boolean;
}): ReactElement {
  const state = useGameStore((s) => s.state);
  const act = useGameStore((s) => s.act);
  const assignAcolyte = useGameStore((s) => s.assignAcolyte);
  const unassignAcolyte = useGameStore((s) => s.unassignAcolyte);
  const toggleAutoRepeat = useGameStore((s) => s.toggleAutoRepeat);
  if (!state) return <></>;

  const total = state.lifetime.acolytes.length;
  const showStepper = isDelegatable(state, id) && total > 0;
  const assigned = assignedCount(state, id);
  const idle = total - assigned;
  const showAuto = isAutoRepeatable(state, id);
  const auto = isAutoRepeating(state, id);

  return (
    <div className={`dec-card dec-card--${cardClass}`}>
      <div className="dec-card-head">
        <span className="dec-numeral">{numeral}</span>
        <span className="dec-name">{strings.opera[id as 'caedes' | 'pogrom' | 'purgatio']}</span>
      </div>
      <p className="dec-desc">{strings.opera.decimatioDesc[id]}</p>
      <div className="dec-controls">
        <span>
          {strings.opera.decimatioCostLabel} <b>{cost}</b>
        </span>
        <span>
          {strings.opera.decimatioTimeLabel} <b>{time}</b>
        </span>
        {showStepper && (
          <span className="dec-stepper-wrap">
            {strings.opera.decimatioAcolytesLabel}
            <span className="dec-stepper">
              <button
                type="button"
                className="dec-step-btn dec-step-btn--dec"
                disabled={assigned === 0}
                onClick={() => unassignAcolyte(id)}
                aria-label={strings.acolytes.unassign}
                title={strings.acolytes.unassign}
              >
                −
              </button>
              <span className="dec-step-count" title={strings.acolytes.delegationLabel}>
                {assigned}
              </span>
              <button
                type="button"
                className="dec-step-btn dec-step-btn--inc"
                disabled={idle === 0}
                onClick={() => assignAcolyte(id)}
                aria-label={strings.acolytes.assign}
                title={strings.acolytes.assign}
              >
                +
              </button>
            </span>
          </span>
        )}
        {showAuto && (
          <button
            type="button"
            className={'dec-auto' + (auto ? ' dec-auto--on' : '')}
            aria-pressed={auto}
            onClick={() => toggleAutoRepeat(id, !auto)}
            title={strings.autoRepeat.label}
          >
            {strings.opera.decimatioAuto}
          </button>
        )}
        <button
          type="button"
          className={'dec-commission' + (cardClass === 'iii' ? ' dec-commission--iii' : '')}
          disabled={disabled}
          onClick={() => act(id)}
        >
          {strings.opera.decimatioCta[id]}
        </button>
      </div>
    </div>
  );
}

/**
 * Decimatio program body — "The Breathing Dark" (Claude Design). Caedes is always open; Pogrom and
 * Purgatio gate on their Ira level. Purgatio, before its gate, shows a sealed card. The Index Opervm
 * ledger is the real player outcome log filtered to this program's rites, newest first.
 */
export function DecimatioGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const notice = useGameStore((s) => s.notice);
  const log = useGameStore((s) => s.log);
  const underway = useUnderway();
  if (!state) return <></>;

  const gold = floor(state.lifetime.gold).toNumber();
  const eff = categoryEfficiency(state, 'decimatio');
  const goldCost = (id: string): number => Math.ceil((ACTIONS[id]?.cost.gold ?? 0) * eff);
  const costLabel = (id: string): string =>
    `${goldCost(id).toLocaleString('en-US')} ${strings.opera.decimatioGoldUnit}`;
  const purgatioDef = ACTIONS.purgatio;
  const purgatioOpen = purgatioDef ? actionUnlocked(state, purgatioDef) : false;

  const ledger = log.filter((e) => DECIMATIO_RITES.some((r) => r.id === e.actionId));

  return (
    <div className="dec-root">
      <div className="dec-layer dec-glow" aria-hidden="true" />
      <div className="dec-layer dec-smoke-a" aria-hidden="true" />
      <div className="dec-layer dec-smoke-b" aria-hidden="true" />
      <div className="dec-layer dec-vignette" aria-hidden="true" />

      <div className="dec-content">
        <div className="dec-masthead">
          <h1 className="dec-title">{strings.opera.decimatio}</h1>
          <p className="dec-creed">{strings.opera.decimatioCreed}</p>
          <div className="dec-kpi">
            <div className="dec-kpi-box">
              <div className="dec-kpi-value">{totalReprobates(state).toLocaleString('en-US')}</div>
              <div className="dec-kpi-label">{strings.reprobates}</div>
            </div>
          </div>
        </div>

        <div className="dec-column">
          {DECIMATIO_RITES.map((r) => {
            const def = ACTIONS[r.id];
            // Purgatio sealed until its Ira gate is met.
            if (r.id === 'purgatio' && !purgatioOpen) {
              return (
                <div className="dec-sealed" key={r.id}>
                  <div className="dec-sealed-title">{strings.opera.decimatioSealedTitle}</div>
                  <p className="dec-sealed-line">{strings.opera.decimatioSealedLine}</p>
                </div>
              );
            }
            return (
              <DecimatioRite
                key={r.id}
                id={r.id}
                numeral={r.numeral}
                cardClass={r.cardClass}
                cost={costLabel(r.id)}
                time={decimatioTime(def?.baseTimeSeconds ?? 0)}
                disabled={
                  underway || gold < goldCost(r.id) || (def ? !actionUnlocked(state, def) : true)
                }
              />
            );
          })}

          <div className="dec-ledger-head">{strings.opera.decimatioLedgerHeading}</div>
          {ledger.length === 0 ? (
            <p className="dec-ledger-empty">{strings.opera.decimatioEmptyLedger}</p>
          ) : (
            <div>
              {ledger.map((e, i) => (
                <div className="dec-ledger-row" key={`${i}-${e.actionId}-${e.tier}`}>
                  <span className="dec-ledger-tier" style={{ color: DECIMATIO_TIER_COLOR[e.tier] }}>
                    {strings.tiers[e.tier]}
                  </span>
                  <span className="dec-ledger-text">{decimatioLedgerText(e)}</span>
                </div>
              ))}
            </div>
          )}

          {notice !== null && <p className="dec-notice">{notice}</p>}
        </div>
      </div>
    </div>
  );
}

type PcGroupId =
  | 'depraedatio'
  | 'decimatio'
  | 'indagatio'
  | 'analytics'
  | 'achievements'
  | 'emails'
  | 'logs';

/**
 * Indagatio × Emptio (03 §2.5–2.6), merged into one surface — the "Orbis Tenebrarum" globe (Claude
 * Design). Scry the world to surface maleficia, then bind them in the adjoining Emptio market.
 * Indagatio is one no-cost search whose duration scales with efficiency; Emptio buys a surfaced
 * relic for gold. The two were separate PC programs; this is the single replacement.
 */
export function IndagatioEmptioProgram(): ReactElement {
  const state = useGameStore((s) => s.state);
  const eff = useGameStore((s) => (s.state ? categoryEfficiency(s.state, 'indagatio') : 1));
  const emptioEff = useGameStore((s) => (s.state ? categoryEfficiency(s.state, 'emptio') : 1));
  const act = useGameStore((s) => s.act);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;

  const goldNum = floor(state.lifetime.gold).toNumber();
  const owned = state.lifetime.maleficia;
  const prices = state.lifetime.maleficiaPrices;

  const finds: OrbisFind[] = state.lifetime.emptioList.flatMap((id) => {
    const def = MALEFICIA[id];
    if (!def) return [];
    const price = prices?.[id] ?? def.cost;
    const acquired = owned.includes(id);
    return [
      {
        id,
        name: def.name,
        rarity: def.rarity,
        // Only surface the invoking-power line for relics that actually grant >= 1 (some are flavour).
        effect: def.invokingPower >= 1 ? `+${def.invokingPower} invoking power` : '',
        desc: def.description,
        costLabel: `${price} g`,
        acquired,
        affordable: !acquired && goldNum >= price,
      },
    ];
  });

  // Indagatio scries in the background (its own timer, not the player slot); Emptio is a foreground
  // buy. The globe spin + countdown read the Indagatio timer; a per-row bar reads the Emptio timer.
  const queue = state.lifetime.actionQueue;
  const indagatioTimer = queue.find((t) => t.actionId === 'indagatio') ?? null;
  const emptioTimer = queue.find((t) => t.actionId === 'emptio') ?? null;

  const baseSec = ACTIONS.indagatio?.baseTimeSeconds ?? 1800;
  const actualSec = Math.max(1, Math.floor(baseSec / Math.max(eff, 1e-9)));

  const emptioBase = ACTIONS.emptio?.baseTimeSeconds ?? 60;
  const emptioTotal = Math.max(1, emptioBase / Math.max(emptioEff, 1e-9));
  const emptioProgress = emptioTimer?.target
    ? {
        id: emptioTimer.target,
        fraction: Math.min(
          1,
          Math.max(0, (emptioTotal - emptioTimer.remainingSeconds) / emptioTotal),
        ),
      }
    : null;

  return (
    <OrbisTenebrarum
      finds={finds}
      gold={formatBigNum(floor(state.lifetime.gold))}
      searching={indagatioTimer !== null}
      searchDuration={formatDuration(actualSec)}
      searchRemaining={
        indagatioTimer ? formatDuration(Math.ceil(indagatioTimer.remainingSeconds)) : null
      }
      emptioProgress={emptioProgress}
      selectedId={selectedId}
      onCast={() => act('indagatio')}
      onSelect={setSelectedId}
      onAcquire={(id) => act('emptio', id)}
    />
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

/** Per-Sin accent hue — the "Sigil Grid" colour language for the Mercatura cards. */
const MERCATUS_HUE: Record<Sin, number> = {
  gula: 32,
  luxuria: 344,
  avaritia: 46,
  tristitia: 222,
  ira: 6,
  acedia: 188,
  vanagloria: 286,
  superbia: 266,
};

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Compact rate readout: 2 decimals under 100, whole numbers above. */
function formatRate(n: number): string {
  if (n >= 100) return String(Math.floor(n));
  return (Math.round(n * 100) / 100).toString();
}

type DepraedatioTab = 'mercatura' | 'compositum';

/**
 * Depraedatio (Mercatus system, Vitium Mercatura rework spec §1), reworked from the Claude Design
 * "merged proposal": Vitium Mercatura as a Sigil Grid of per-Sin trade cards, Vitium Compositum as a
 * Living Grimoire of rites, under one tab bar. All wiring is the real model — the eight Mercatūs via
 * `invest`/`divest` (instant gold purchases, demand-driven revenue), the ceremonies via
 * `activateCeremony`/`deactivateCeremony`, and the Panvitium endgame ritual with its two-step
 * safeguard. Rendered full-bleed inside the PC window (its own grimoire surface; the titlebar names
 * it).
 */

/** Vitium Mercatura — the Sigil Grid: one card per Sin (deepen / cut back / sell off). */
function MercaturaGrid(): ReactElement {
  const state = useGameStore((s) => s.state);
  const invest = useGameStore((s) => s.invest);
  const divest = useGameStore((s) => s.divest);
  if (!state) return <></>;
  const gold = floor(state.lifetime.gold).toNumber();
  const fraction = divestFraction(state);
  const baseCard: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 13,
    padding: 16,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,.08)',
    background: 'rgba(12,10,9,.6)',
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 13 }}>
      {SINS.map((sin) => {
        const name = strings.mercatus.names[sin] ?? sin;
        const unlocked = mercatusUnlocked(state, sin);
        const locked = !unlocked;
        const d = mercatusDepth(state, sin);
        const cap = mercatusDepthCap(state, sin);
        const atCap = unlocked && d >= cap;
        const nextCost = investCost(sin, d);
        const revenue = mercatusRevenuePerSecond(state, sin) * foedusRevenueMul(state, sin);
        const gen = MERCATUS_GEN_PER_DEPTH * d * mercatusGenerationClauseMul(sin);
        const tier = highestFoedusTierForSin(state, sin);
        const level = sinLevel(state.devotion[sin]);
        const pct = cap > 0 ? Math.round((d / cap) * 100) : 0;
        const cutBackRefund = Math.floor(
          fraction * (cumulativeInvestCost(sin, d) - cumulativeInvestCost(sin, d - 1)) + 1e-9,
        );
        const sellOffRefund = Math.floor(fraction * cumulativeInvestCost(sin, d) + 1e-9);
        const hue = MERCATUS_HUE[sin];
        const accent = `hsl(${hue} 60% 65%)`;
        const accentLine = `hsl(${hue} 52% 56% / 0.55)`;
        const nextLock = locked
          ? `Locked \u00B7 opens at ${capitalize(sin)} ${romanLevel(1)}`
          : `Depths beyond ${cap} require ${capitalize(sin)} ${romanLevel(level + 1)}`;
        return (
          <div
            key={sin}
            style={locked ? { ...baseCard, opacity: 0.55, borderStyle: 'dashed' } : baseCard}
          >
            {/* header */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                borderLeft: `3px solid ${accentLine}`,
                paddingLeft: 11,
              }}
            >
              <span
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: '1.06rem',
                  letterSpacing: '.02em',
                  color: '#ecd9a8',
                  lineHeight: 1.1,
                }}
                title={strings.mercatus.clauses[sin]}
              >
                {name}
              </span>
              {tier >= 1 && (
                <span
                  style={{
                    fontFamily: "'Ubuntu Mono', monospace",
                    fontSize: '.62rem',
                    letterSpacing: '.1em',
                    color: '#c49e4a',
                    textTransform: 'uppercase',
                  }}
                >
                  {strings.mercatus.foedus} {ROMAN_TIERS[tier]}
                </span>
              )}
            </div>

            {/* body */}
            <div style={{ display: 'flex', gap: 15, alignItems: 'stretch' }}>
              {!locked && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 5,
                    flex: '0 0 auto',
                    paddingTop: 3,
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: 9,
                      height: 64,
                      borderRadius: 5,
                      background: 'rgba(255,255,255,.07)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        bottom: 0,
                        width: '100%',
                        height: `${pct}%`,
                        background: accent,
                        boxShadow: `0 0 8px ${accentLine}`,
                        transition: 'height .35s cubic-bezier(.2,.8,.3,1)',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: "'Ubuntu Mono', monospace",
                      fontSize: '.62rem',
                      color: '#8a7e66',
                      letterSpacing: '.04em',
                    }}
                  >
                    {d}/{cap}
                  </span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 7,
                  minWidth: 0,
                  flex: 1,
                }}
              >
                <div style={{ lineHeight: 1 }}>
                  <span
                    style={{
                      fontFamily: "'Ubuntu Mono', monospace",
                      fontSize: '1.5rem',
                      color: '#e6a23c',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {locked ? '\u2014' : formatRate(revenue)}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Ubuntu Mono', monospace",
                      fontSize: '.7rem',
                      color: '#8a7e66',
                      marginLeft: 3,
                    }}
                  >
                    gold/s
                  </span>
                </div>
                <div style={{ lineHeight: 1 }}>
                  <span
                    style={{
                      fontFamily: "'Ubuntu Mono', monospace",
                      fontSize: '.92rem',
                      color: '#b59ad6',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {locked ? '\u2014' : String(Math.round(gen * 100) / 100)}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Ubuntu Mono', monospace",
                      fontSize: '.7rem',
                      color: '#8a7e66',
                      marginLeft: 3,
                    }}
                  >
                    reprobates/s
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "'Ubuntu Mono', monospace",
                    fontSize: '.72rem',
                    letterSpacing: '.03em',
                    color: '#c79f63',
                    lineHeight: 1.35,
                  }}
                >
                  {strings.mercatus.clauses[sin]}
                </span>
              </div>
            </div>

            {/* next-depth gate */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                paddingTop: 10,
                borderTop: '1px solid rgba(196,158,74,.12)',
              }}
            >
              <span style={{ color: '#7e7256', fontSize: '.8rem', flex: '0 0 auto' }}>
                {'\u2913'}
              </span>
              <span
                style={{
                  fontFamily: "'Ubuntu Mono', monospace",
                  fontSize: '.66rem',
                  letterSpacing: '.04em',
                  color: '#8a7e66',
                  lineHeight: 1.3,
                  textTransform: 'uppercase',
                }}
              >
                {nextLock}
              </span>
            </div>

            {/* actions */}
            <div style={{ display: 'flex', gap: 7, marginTop: 'auto' }}>
              <button
                type="button"
                className="dep-deepen"
                disabled={locked || atCap || gold < nextCost}
                onClick={() => invest(sin)}
                aria-label={`${strings.mercatus.deepen} ${name}`}
                title={atCap ? strings.mercatus.capped : undefined}
              >
                {atCap ? 'Capped' : strings.mercatus.deepen}
                {!locked && !atCap && (
                  <span style={{ opacity: 0.72 }}>
                    {' '}
                    {'\u00B7'} {nextCost} {strings.resources.gold.toLowerCase()}
                  </span>
                )}
              </button>
              {!locked && d > 0 && (
                <>
                  <button
                    type="button"
                    className="dep-mini"
                    onClick={() => divest(sin, 1)}
                    title={`${strings.mercatus.cutBack} \u00B7 +${cutBackRefund} ${strings.resources.gold.toLowerCase()}`}
                    aria-label={`${strings.mercatus.cutBack} ${name}`}
                  >
                    {'\u2212'}
                  </button>
                  <button
                    type="button"
                    className="dep-mini dep-mini--wide"
                    onClick={() => divest(sin, d)}
                    title={`${strings.mercatus.sellOff} \u00B7 +${sellOffRefund} ${strings.resources.gold.toLowerCase()}`}
                    aria-label={`${strings.mercatus.sellOff} ${name}`}
                  >
                    {strings.mercatus.sellOff}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Vitium Compositum — the Living Grimoire: a list of rite rows. */
function CompositumGrimoire(): ReactElement {
  const state = useGameStore((s) => s.state);
  const activate = useGameStore((s) => s.activateCeremony);
  const deactivate = useGameStore((s) => s.deactivateCeremony);
  if (!state) return <></>;
  const baseRite: CSSProperties = {
    position: 'relative',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
    padding: '15px 18px',
    borderRadius: 6,
    border: '1px solid rgba(196,158,74,.2)',
    background: 'rgba(12,10,9,.4)',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {COMPOSITUM_IDS.filter((id) => id !== 'panvitium').map((id) => {
        const def = compositumById(id);
        if (!def) return null;
        const unlocked = compositumUnlocked(state, def);
        const locked = !unlocked;
        const active = isToggleActive(state, id);
        const name = strings.compositum.names[id] ?? id;
        const gate = def.sins
          .map((s) => `${capitalize(s)} ${romanLevel(def.minLevel)}`)
          .join(' \u00B7 ');
        const dotColor = active ? '#e0934a' : locked ? '#7c1417' : 'rgba(200,180,138,.4)';
        const riteStyle: CSSProperties = locked
          ? { ...baseRite, opacity: 0.5, borderStyle: 'dashed' }
          : active
            ? {
                ...baseRite,
                border: '1px solid rgba(230,140,50,.55)',
                background: 'rgba(44,16,10,.55)',
                boxShadow: 'inset 0 0 16px rgba(230,120,40,.22)',
              }
            : baseRite;
        return (
          <div key={id} style={riteStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: dotColor,
                  boxShadow: `0 0 10px ${dotColor}`,
                  flex: '0 0 auto',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: '1.1rem',
                    letterSpacing: '.04em',
                    color: '#ecd9a8',
                  }}
                >
                  {name}
                </span>
                {unlocked ? (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '4px 12px',
                      fontFamily: "'Ubuntu Mono', monospace",
                      fontSize: '.7rem',
                      letterSpacing: '.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span style={{ color: '#9c8e74' }}>
                      Cost {'\u00B7'} {compositumCostLine(def)}
                    </span>
                    <span style={{ color: '#7fae7f' }}>
                      Effect {'\u00B7'} {compositumOutcomesLine(def)}
                    </span>
                  </div>
                ) : (
                  <span
                    style={{
                      fontFamily: "'Ubuntu Mono', monospace",
                      fontSize: '.7rem',
                      letterSpacing: '.04em',
                      color: '#c98a6a',
                      textTransform: 'uppercase',
                    }}
                  >
                    Requires {'\u00B7'} {gate}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              className={
                'dep-rite' + (active ? ' dep-rite--end' : locked ? ' dep-rite--locked' : '')
              }
              disabled={locked}
              onClick={() => (active ? deactivate(id) : activate(id))}
              aria-label={`${active ? strings.compositum.stop : strings.compositum.start} ${name}`}
            >
              {active
                ? strings.compositum.stop
                : locked
                  ? strings.opera.sinLocked
                  : strings.compositum.start}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Panvitium — the endgame ritual (Vitium Compositum gated on all eight Sins at Level 3). Shown as a
 * sealed teaser until the gate opens, then a pulsing altar with a two-step "Unleash" confirmation
 * (it cannot be turned off by hand and its cost ramps each second).
 */
function PanvitiumPanel(): ReactElement {
  const state = useGameStore((s) => s.state);
  const activate = useGameStore((s) => s.activateCeremony);
  const [confirming, setConfirming] = useState(false);
  const def = compositumById('panvitium');
  if (!state || !def) return <></>;
  const unlocked = compositumUnlocked(state, def);
  const active = isToggleActive(state, 'panvitium');

  if (!unlocked) {
    return (
      <div
        style={{
          position: 'relative',
          marginTop: 16,
          padding: '34px 24px',
          border: '1px dashed rgba(120,108,86,.4)',
          borderRadius: 10,
          background:
            'repeating-linear-gradient(45deg,rgba(10,8,7,.85),rgba(10,8,7,.85) 11px,rgba(20,16,12,.85) 11px,rgba(20,16,12,.85) 22px)',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontFamily: "'Cinzel', serif",
            fontWeight: 600,
            fontSize: '1rem',
            letterSpacing: '.16em',
            color: '#9c8e74',
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          {strings.compositum.panvitiumGate}
        </p>
      </div>
    );
  }

  return (
    <div
      className={active ? 'dep-pan dep-pan--active' : 'dep-pan'}
      style={{
        marginTop: 16,
        padding: 24,
        border: '1px solid rgba(212,72,72,.55)',
        borderRadius: 10,
        background: 'radial-gradient(circle at 50% 0%,rgba(80,16,12,.7),rgba(28,8,8,.7))',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: "'Cinzel', serif",
          fontWeight: 700,
          fontSize: '1.7rem',
          letterSpacing: '.1em',
          color: '#ff8a4a',
          textShadow: '0 0 18px rgba(255,110,50,.6)',
          marginBottom: 8,
        }}
      >
        {strings.compositum.names.panvitium ?? 'Panvitium'}
      </div>
      <p
        style={{
          fontFamily: "'EB Garamond', serif",
          fontStyle: 'italic',
          color: '#e0a684',
          fontSize: '1.1rem',
          letterSpacing: '.04em',
          margin: '0 auto 16px',
          maxWidth: 460,
        }}
      >
        {active
          ? strings.compositum.panvitiumActive
          : confirming
            ? strings.compositum.panvitiumReady
            : strings.menu.tagline}
      </p>
      {active ? (
        <div className="dep-pan-burning">{strings.compositum.panvitiumBurning}</div>
      ) : confirming ? (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            type="button"
            className="dep-unleash"
            onClick={() => {
              activate('panvitium');
              setConfirming(false);
            }}
          >
            {strings.compositum.panvitiumConfirm}
          </button>
          <button
            type="button"
            className="dep-unleash dep-unleash--cancel"
            onClick={() => setConfirming(false)}
          >
            {strings.compositum.panvitiumCancel}
          </button>
        </div>
      ) : (
        <button type="button" className="dep-unleash" onClick={() => setConfirming(true)}>
          {strings.compositum.panvitiumBegin}
        </button>
      )}
    </div>
  );
}

export function DepraedatioGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const notice = useGameStore((s) => s.notice);
  const [tab, setTab] = useState<DepraedatioTab>('mercatura');
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const blurb = tab === 'mercatura' ? strings.opera.mercaturaBlurb : strings.opera.compositumBlurb;
  return (
    <div className="dep-wallpaper">
      <div className="dep-grimoire">
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <h3
            style={{
              fontFamily: "'Cinzel', serif",
              fontWeight: 700,
              fontSize: '1.7rem',
              margin: 0,
              color: '#ecd9a8',
              letterSpacing: '.1em',
            }}
          >
            {strings.opera.depraedatio}
          </h3>
          <div
            style={{
              width: 130,
              height: 1,
              background: 'linear-gradient(90deg,transparent,rgba(196,158,74,.6),transparent)',
              margin: '12px auto 0',
            }}
          />
        </div>

        <div className="dep-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mercatura'}
            className={'dep-tab' + (tab === 'mercatura' ? ' dep-tab--active' : '')}
            onClick={() => setTab('mercatura')}
          >
            Vitium Mercatura
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'compositum'}
            className={'dep-tab' + (tab === 'compositum' ? ' dep-tab--active' : '')}
            onClick={() => setTab('compositum')}
          >
            {strings.compositum.heading}
          </button>
        </div>

        <p className="dep-blurb">{blurb}</p>

        {tab === 'mercatura' ? (
          <MercaturaGrid />
        ) : (
          <>
            <CompositumGrimoire />
            <PanvitiumPanel />
          </>
        )}

        {notice !== null && <p className="opera-notice dep-notice">{notice}</p>}
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
  if (group === 'indagatio') return <IndagatioEmptioProgram />;
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
 * The Studio desk smartphone (Claude Design, Direction A). A self-framed full-screen overlay (mounted
 * by App like Ars Goetia / the PC / the Suasio scroll, NOT via PanelShell): the player keys a code on
 * the dialer and submits it. The sim owns the valid-code set (`dialCode`); this wrapper turns the
 * sim's outcome into the toast the dialer renders, with copy from `strings`. The boon EFFECTS are a
 * documented empty hook awaiting the outgoing-call engine (docs/PANVITIUM-CALLS-OUT.md) — today a
 * recognized code only surfaces its placeholder copy and changes no game state.
 */
export function PhoneDialer({ onClose }: { onClose: () => void }): ReactElement {
  const onDial = (raw: string): DialResult => {
    const outcome = dialCode(raw);
    if (outcome.kind === 'error') {
      // A recognized joke number (e.g. 666) carries its own copy; an unknown number is rejected.
      const message = outcome.code
        ? (strings.phone.codes[outcome.code] ?? strings.phone.unrecognized)
        : strings.phone.unrecognized;
      return { kind: 'error', message };
    }
    // TODO(wire): apply the code's real effect through the store once the call engine lands.
    return { kind: outcome.kind, message: strings.phone.codes[outcome.code] ?? '' };
  };
  return <SmartphoneDialer onClose={onClose} onDial={onDial} />;
}

interface PanelContent {
  title: string;
  body: ReactNode;
}

/**
 * The framed-panel map. Only the Maleficia shelf is a framed Panel; Ars Goetia, the PC and the
 * Suasio scroll are self-framed full-surface overlays (see `GoetiaBook`, `PcDesk`, `SuasioScroll`)
 * mounted directly by App rather than through this map.
 */
export const PANELS: Partial<Record<PanelId, PanelContent>> = {
  maleficia: {
    title: 'The Maleficia Shelf',
    body: <MaleficiaShelf />,
  },
};
