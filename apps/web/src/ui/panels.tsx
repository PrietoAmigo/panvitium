import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { strings } from '@panvitium/shared';
import {
  floor,
  ACTIONS,
  actionUnlocked,
  categoryEfficiency,
  plannedActionCost,
  isStackable,
  countCopies,
  MALEFICIA,
  anatocismusDepositPerSecond,
  computeModifiers,
  foedusTier,
  mutuumGoldPerSecond,
  sinLevel,
  SYNGRAPHA_BRANCHES,
  syngraphaBranch,
  syngraphaSignable,
  syngraphaSigned,
  thesaurusInterestPerSecond,
  thesaurusRecoveryFraction,
  compositumById,
  compositumUnlocked,
  isToggleActive,
  assignedCount,
  isDelegatable,
  isAutoRepeatable,
  isAutoRepeating,
  occupiesPlayerSlot,
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
import { MaleficiaCabinet as DesignedCabinet } from '../menus/MaleficiaCabinet.js';
import { SuasioPanel as DesignedSuasio, type SuasioActionView } from '../menus/SuasioPanel.js';
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

/** Sin level → Roman numeral for inline "<Sin> <level>" gate labels (e.g. "Luxuria III"). */
const SIN_LEVEL_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const;
const romanLevel = (n: number): string => SIN_LEVEL_ROMAN[n] ?? String(n);

/** The rite's delegation Sin gate as a short label, e.g. "Ira I" — for the locked-control hint. */
function delegateGateLabel(actionId: string): string {
  const g = ACTIONS[actionId]?.delegateUnlock;
  if (!g) return '';
  return `${g.sin.charAt(0).toUpperCase()}${g.sin.slice(1)} ${romanLevel(g.level)}`;
}

/**
 * Acolyte assignment controls (02 §10). A pair of `-` / `+` buttons with the current assigned/total
 * count between them. The control is ALWAYS shown for a castable rite (design handoff), so the player
 * can see the delegation system exists before it is available: the count reads "0/0" until acolytes
 * are recruited, and the buttons render disabled (dimmed) while the rite is not yet delegatable or no
 * acolytes exist. The reason (Sin gate / "no acolytes yet") rides along as the control's hover hint.
 * Only when delegatable AND acolytes exist do the buttons act.
 */
function AcolyteControls({ actionId }: { actionId: string }): ReactElement | null {
  const state = useGameStore((s) => s.state);
  const assignAcolyte = useGameStore((s) => s.assignAcolyte);
  const unassignAcolyte = useGameStore((s) => s.unassignAcolyte);
  if (!state) return null;
  const delegatable = isDelegatable(state, actionId);
  const total = state.lifetime.acolytes.length;
  const assigned = assignedCount(state, actionId);
  const idle = total - assigned;
  const noAcolytes = delegatable && total === 0;
  const locked = !delegatable;
  const hint = locked
    ? `${strings.acolytes.delegateLocked} ${delegateGateLabel(actionId)}`
    : noAcolytes
      ? strings.acolytes.noAcolytes
      : strings.acolytes.delegationLabel;
  return (
    <div
      className={'acolyte-controls' + (locked || noAcolytes ? ' acolyte-controls--locked' : '')}
      aria-label={hint}
      title={hint}
    >
      <button
        type="button"
        className="acolyte-btn"
        disabled={locked || noAcolytes || assigned === 0}
        onClick={() => unassignAcolyte(actionId)}
        aria-label={strings.acolytes.unassign}
        title={strings.acolytes.unassign}
      >
        −
      </button>
      {/* Always the plain assigned/total count — a rite with no acolytes reads "0/0" rather than a
          lock glyph. The gate/no-acolytes reason still rides along as the control's hover hint. */}
      <span className="acolyte-count" title={hint}>
        {assigned}
        <span className="acolyte-count-sep">/</span>
        {total}
      </span>
      <button
        type="button"
        className="acolyte-btn"
        disabled={locked || noAcolytes || idle === 0}
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
 * Auto-repeat toggle for a player rite (02 §3). ALWAYS shown for a castable rite (design handoff):
 * before the rite passes its "toggle" Sin level it renders disabled with its gate; once past the gate,
 * flipping it on loops the rite in the player's own slot until flipped off. Distinct from acolyte
 * delegation — this is the player's hands, not a follower's.
 */
function AutoRepeatToggle({ actionId }: { actionId: string }): ReactElement | null {
  const state = useGameStore((s) => s.state);
  const toggleAutoRepeat = useGameStore((s) => s.toggleAutoRepeat);
  if (!state) return null;
  const available = isAutoRepeatable(state, actionId);
  const on = available && isAutoRepeating(state, actionId);
  if (!available) {
    const label = `${strings.autoRepeat.locked} ${delegateGateLabel(actionId)}`;
    return (
      <button
        type="button"
        className="auto-repeat-btn auto-repeat-btn--locked"
        disabled
        title={label}
        aria-label={label}
      >
        {'🔒'} {strings.autoRepeat.start}
      </button>
    );
  }
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
 * toggle plus the acolyte delegation `+/−`. Both are always rendered (each shows its own locked state
 * when not yet available), so the automation systems are visible from the first castable rite.
 */
function RiteControls({ actionId }: { actionId: string }): ReactElement {
  return (
    <div className="rite-controls">
      <AutoRepeatToggle actionId={actionId} />
      <AcolyteControls actionId={actionId} />
    </div>
  );
}

/** True while a player-driven rite (Suasio/Decimatio) holds the slot (02 §3: one at a time). The
 * background channels Indagatio and Emptio do NOT count, so a rite stays available while a scry or a
 * purchase runs (and neither of those disables a rite). */
function useUnderway(): boolean {
  return useGameStore((s) =>
    s.state ? s.state.lifetime.actionQueue.some((t) => occupiesPlayerSlot(t.actionId)) : false,
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

/** Per-tier colour for the Suasio ledger's outcome chip — the scroll's candle-gold palette fading to
 *  ash, mirroring how Decimatio tints its Index Opervm rows. Keyed by the real OutcomeEvent tier. */
const SUASIO_TIER_COLOR: Record<Tier, string> = {
  stellar: '#e6c04a',
  excellent: '#d2a63f',
  good: '#c9a227',
  neutral: '#a08a5e',
  bad: '#8a6a4a',
  terrible: '#7a4a3a',
  apocalyptic: '#8a3a2a',
};

/** Re-skin one resolved Suasio outcome into the ledger's second column: the rite and its net resource
 *  deltas (souls first), or a "no soul stirred" line when a temptation yielded nothing. */
function suasioLedgerText(e: OutcomeEvent): string {
  const name = actionName(e.actionId);
  const parts: string[] = [];
  const sign = (n: number): string => `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US')}`;
  if (e.soulsDelta !== 0) parts.push(`${sign(e.soulsDelta)} ${strings.resources.souls}`);
  if (e.reprobateDelta !== 0) parts.push(`${sign(e.reprobateDelta)} ${strings.reprobates}`);
  if (e.goldDelta !== 0) parts.push(`${sign(e.goldDelta)} ${strings.resources.gold}`);
  return parts.length > 0
    ? `${name} · ${parts.join(' · ')}`
    : `${name} · ${strings.opera.suasioNoYield}`;
}

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
  const activateCeremony = useGameStore((s) => s.activateCeremony);
  const log = useGameStore((s) => s.log);
  const [confirmingPanvitium, setConfirmingPanvitium] = useState(false);
  const head = useGameStore(
    (s) => s.state?.lifetime.actionQueue.find((t) => occupiesPlayerSlot(t.actionId)) ?? null,
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
  const underway = state.lifetime.actionQueue.some((t) => occupiesPlayerSlot(t.actionId));
  const names: Record<string, string> = {
    suggestion: strings.opera.suggestion,
    logismoi: strings.opera.logismoi,
    imperium: strings.opera.imperium,
  };
  const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);

  const actions: SuasioActionView[] = SUASIO_ORDER.map((id, i) => {
    const def = ACTIONS[id]!;
    // The exact influence the cast would take — the same pipeline startAction deducts (the log-scaled
    // Suasio cost and the Paimon #9 reduction), so the printed cost and the affordability gate match.
    const influenceCost = plannedActionCost(state, id, { efficiency: eff }).influence;
    const locked = !actionUnlocked(state, def);
    const active = head?.actionId === id;
    // Suasio is cost-outcome, so a rite's queued duration is exactly its baseTimeSeconds — which
    // lets us reconstruct progress from the remaining time with no sim/save change.
    const base = def.baseTimeSeconds;
    const remaining = head?.remainingSeconds ?? base;
    const progress =
      active && base > 0 ? Math.min(100, Math.max(0, ((base - remaining) / base) * 100)) : 0;
    const sealed = locked ? strings.opera.suasioSealed[id] : undefined;
    // The control cluster (auto-repeat toggle + acolyte delegation) shows on EVERY unlocked rite —
    // each sub-control renders its own locked/disabled state until it is available (design handoff),
    // so the automation systems are visible from the first castable rite onward.
    const hasControls = !locked;
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

  // Panvitium — the endgame ritual, the scroll's fourth and final temptation (ADR-031: the other
  // ceremonies retired, and the survivor moved here from the Depraedatio panel). A toggle, not a
  // timed rite: sealed exactly like the other rows until every Sin reaches level III, and armed
  // behind a second confirming press (it cannot be stopped by hand once it burns).
  const panvDef = compositumById('panvitium');
  if (panvDef) {
    const locked = !compositumUnlocked(state, panvDef);
    const burning = isToggleActive(state, 'panvitium');
    const sealed = locked ? strings.opera.suasioSealed.panvitium : undefined;
    actions.push({
      id: 'panvitium',
      numeral: 'IV',
      glyph: '\u2641',
      name: locked ? (sealed?.name ?? '') : (strings.opera.panvitium ?? 'Panvitium'),
      quote: locked ? (sealed?.maxim ?? '') : (strings.opera.suasioQuote.panvitium ?? ''),
      cost: `${(panvDef.costPerSecond.gold ?? 0).toLocaleString('en-US')} ${strings.resources.gold.toLowerCase()}/s \u00b7 ${strings.opera.panvitiumRising}`,
      cta: burning
        ? (strings.opera.suasioStatus.panvitium ?? '')
        : confirmingPanvitium
          ? (strings.opera.suasioConfirm ?? '')
          : (strings.opera.suasioCta.panvitium ?? ''),
      status: strings.opera.suasioStatus.panvitium ?? '',
      locked,
      active: burning,
      progress: burning ? 100 : 0,
      disabled: locked || burning,
      onTempt: () => {
        if (burning) return;
        if (!confirmingPanvitium) {
          setConfirmingPanvitium(true);
          return;
        }
        activateCeremony('panvitium');
        setConfirmingPanvitium(false);
      },
      lockLabel: `${strings.opera.suasioRequires} ${strings.opera.suasioPanvitiumGate}`,
    });
  }

  // The scroll's foot mirrors Decimatio's Index Opervm: the resolved temptations (this program's
  // rites only), newest first, each an outcome tier chip beside its net resource deltas.
  const ledgerRows = log.filter((e) => (SUASIO_ORDER as readonly string[]).includes(e.actionId));
  const ledger = (
    <div className="suasio-ledger">
      <div className="suasio-ledger-head">{strings.opera.suasioLedgerHeading}</div>
      {ledgerRows.length === 0 ? (
        <p className="suasio-ledger-empty">{strings.opera.suasioEmptyLedger}</p>
      ) : (
        <div>
          {ledgerRows.map((e, i) => (
            <div className="suasio-ledger-row" key={`${i}-${e.actionId}-${e.tier}`}>
              <span className="suasio-ledger-tier" style={{ color: SUASIO_TIER_COLOR[e.tier] }}>
                {strings.tiers[e.tier]}
              </span>
              <span className="suasio-ledger-text">{suasioLedgerText(e)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return <DesignedSuasio {...headerProps} actions={actions} ledger={ledger} />;
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
  const delegatable = isDelegatable(state, id);
  const assigned = assignedCount(state, id);
  const idle = total - assigned;
  const stepperLocked = !delegatable || total === 0; // shown but inert until delegatable + acolytes
  const stepperHint = !delegatable
    ? `${strings.acolytes.delegateLocked} ${delegateGateLabel(id)}`
    : total === 0
      ? strings.acolytes.noAcolytes
      : strings.acolytes.delegationLabel;
  const autoAvailable = isAutoRepeatable(state, id);
  const auto = autoAvailable && isAutoRepeating(state, id);

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
        {/* Delegation stepper — always shown; disabled with a lock hint until the rite is
            delegatable AND at least one acolyte exists (design handoff). */}
        <span
          className={'dec-stepper-wrap' + (stepperLocked ? ' dec-stepper-wrap--locked' : '')}
          title={stepperHint}
        >
          {strings.opera.decimatioAcolytesLabel}
          <span className="dec-stepper">
            <button
              type="button"
              className="dec-step-btn dec-step-btn--dec"
              disabled={stepperLocked || assigned === 0}
              onClick={() => unassignAcolyte(id)}
              aria-label={strings.acolytes.unassign}
              title={strings.acolytes.unassign}
            >
              −
            </button>
            <span className="dec-step-count" title={stepperHint}>
              {stepperLocked ? '🔒' : assigned}
            </span>
            <button
              type="button"
              className="dec-step-btn dec-step-btn--inc"
              disabled={stepperLocked || idle === 0}
              onClick={() => assignAcolyte(id)}
              aria-label={strings.acolytes.assign}
              title={strings.acolytes.assign}
            >
              +
            </button>
          </span>
        </span>
        {/* Auto-repeat toggle — always shown; disabled with its Sin gate until auto-repeatable. */}
        <button
          type="button"
          className={
            'dec-auto' + (auto ? ' dec-auto--on' : '') + (autoAvailable ? '' : ' dec-auto--locked')
          }
          disabled={!autoAvailable}
          aria-pressed={auto}
          onClick={() => autoAvailable && toggleAutoRepeat(id, !auto)}
          title={
            autoAvailable
              ? strings.autoRepeat.label
              : `${strings.autoRepeat.locked} ${delegateGateLabel(id)}`
          }
        >
          {autoAvailable ? strings.opera.decimatioAuto : `🔒 ${strings.opera.decimatioAuto}`}
        </button>
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
 * Purgatio gate on their Ira level, each showing a sealed card (no cost/time/commission) before its
 * gate. The Index Opervm ledger is the real player outcome log filtered to this program's rites,
 * newest first.
 */
export function DecimatioGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const notice = useGameStore((s) => s.notice);
  const log = useGameStore((s) => s.log);
  const underway = useUnderway();
  if (!state) return <></>;

  const gold = floor(state.lifetime.gold).toNumber();
  const eff = categoryEfficiency(state, 'decimatio');
  // Same pipeline startAction deducts, so the printed cost matches the actual charge.
  const goldCost = (id: string): number => plannedActionCost(state, id, { efficiency: eff }).gold;
  const costLabel = (id: string): string =>
    `${goldCost(id).toLocaleString('en-US')} ${strings.opera.decimatioGoldUnit}`;

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
            <div className="dec-kpi-box">
              <div className="dec-kpi-value">{gold.toLocaleString('en-US')}</div>
              <div className="dec-kpi-label">{strings.resources.gold}</div>
            </div>
          </div>
        </div>

        <div className="dec-column">
          {DECIMATIO_RITES.map((r) => {
            const def = ACTIONS[r.id];
            const locked = def ? !actionUnlocked(state, def) : true;
            // A gated rite (Pogrom, Purgatio) before its Ira gate shows a sealed card — no cost,
            // time, or commission control, just its name and the lock note.
            if (locked) {
              const name = strings.opera[r.id as 'caedes' | 'pogrom' | 'purgatio'];
              return (
                <div className="dec-sealed" key={r.id}>
                  <div className="dec-sealed-title">
                    {name} {strings.opera.decimatioSealedSuffix}
                  </div>
                  <p className="dec-sealed-line">{strings.opera.decimatioLocked[r.id]}</p>
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
                disabled={underway || gold < goldCost(r.id)}
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

  const finds: OrbisFind[] = state.lifetime.emptioList.flatMap((id) => {
    const def = MALEFICIA[id];
    if (!def) return [];
    // The actual gold the buy would take — the rolled price softened by the Amy #58 reduction, the
    // same amount startAction deducts (so the shown price and affordability match the sim).
    const price = plannedActionCost(state, 'emptio', { target: id, efficiency: emptioEff }).gold;
    // A STACKABLE relic can be bought again while owned + listed < its stackMax (the sim already
    // surfaces extra copies); only a non-stackable one is "acquired" and unbuyable once owned.
    const stackable = isStackable(def);
    const acquired =
      !stackable && owned.includes(id)
        ? true
        : stackable && countCopies(owned, id) >= (def.stackMax ?? Infinity);
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
 * Depraedatio: the Faeneratio loop (Depraedatio gold rework). The eight per-Sin Mercatūs
 * retired; in their place a single Avaritia-centric gold economy in two surfaces — the Thesaurus
 * tab (Mutuum, the loan book earning by the head of the damned, plus the hoard paying Fenus
 * interest) and the Syngraphae tab (the burned-gold contract tree). The framing is arm’s-length
 * usury: the damned never pay tribute and never learn the creditor’s name.
 */

/** Roman numerals for the Foedus tier badge and the Avaritia gates (1..4). */
const ROMAN_TIERS = ['', 'I', 'II', 'III', 'IV'] as const;

/** Compact rate readout: 2 decimals under 100, whole numbers above. */
function formatRate(n: number): string {
  if (n >= 100) return String(Math.floor(n));
  return (Math.round(n * 100) / 100).toString();
}

type DepraedatioTab = 'thesaurus' | 'syngraphae';

const depCard: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 16,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(12,10,9,.6)',
};
const depLabel: CSSProperties = {
  fontFamily: "'Ubuntu Mono', monospace",
  fontSize: '.66rem',
  letterSpacing: '.1em',
  color: '#8a7e66',
  textTransform: 'uppercase',
};
const depTitle: CSSProperties = {
  fontFamily: "'Cinzel', serif",
  fontSize: '1.06rem',
  letterSpacing: '.02em',
  color: '#ecd9a8',
  lineHeight: 1.1,
};
const depMono: CSSProperties = {
  fontFamily: "'Ubuntu Mono', monospace",
  fontVariantNumeric: 'tabular-nums',
};
const depFlavor: CSSProperties = {
  fontFamily: "'Ubuntu Mono', monospace",
  fontSize: '.72rem',
  letterSpacing: '.03em',
  color: '#c79f63',
  lineHeight: 1.35,
};

/** A big gold-rate readout: "12.5 gold/s". */
function RateReadout({ value, unit }: { value: string; unit: string }): ReactElement {
  return (
    <div style={{ lineHeight: 1 }}>
      <span style={{ ...depMono, fontSize: '1.5rem', color: '#e6a23c' }}>{value}</span>
      <span style={{ ...depMono, fontSize: '.7rem', color: '#8a7e66', marginLeft: 3 }}>{unit}</span>
    </div>
  );
}

/**
 * The Thesaurus tab: the Mutuum loan-book row (debtor count + take/s, locked flavour below
 * Avaritia I), the hoard with its Fenus interest and the global Foedus badge, the deposit control,
 * and the two-step withdraw (the recovery fraction and the forfeit are stated before confirming).
 */
function ThesaurusTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  const deposit = useGameStore((s) => s.depositThesaurus);
  const withdraw = useGameStore((s) => s.withdrawThesaurus);
  const [depositText, setDepositText] = useState('');
  const [withdrawText, setWithdrawText] = useState('');
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  if (!state) return <></>;
  const F = strings.faeneratio;
  const mods = computeModifiers(state);
  const gold = floor(state.lifetime.gold).toNumber();
  const hoard = state.lifetime.hoard;
  // Effective realised rates: the raw terms × faenerationOutputMul × goldRateMul, matching the
  // tick's gold line (spec §6). The Anatocismus deposit rate is already fully composed.
  const outMul = mods.faenerationOutputMul * mods.goldRateMul;
  const mutuumRate = mutuumGoldPerSecond(state, mods) * outMul;
  const interestRate = thesaurusInterestPerSecond(state, mods) * outMul;
  const anatocismusRate = anatocismusDepositPerSecond(state, mods);
  const tier = foedusTier(state);
  const recovery = thesaurusRecoveryFraction(mods);

  const depositAmount = Math.max(0, Math.floor(Number(depositText) || 0));
  const withdrawAmount = Math.max(0, Math.floor(Number(withdrawText) || 0));
  const hoardFloor = floor(hoard).toNumber();
  const returned = Math.floor(withdrawAmount * recovery);
  const forfeited = withdrawAmount - returned;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      {/* Mutuum — the loan book (open from the start; the gating rebalance removed the Avaritia
          gate the old Mercatūs carried) */}
      <div style={depCard}>
        <span style={depTitle} title={F.mutuumBlurb}>
          {F.mutuum}
        </span>
        <RateReadout value={formatRate(mutuumRate)} unit="gold/s" />
        <span style={{ ...depMono, fontSize: '.8rem', color: '#b59ad6' }}>
          {totalReprobates(state).toLocaleString('en-US')} {F.debtors}
        </span>
        <span style={depFlavor}>{F.mutuumBlurb}</span>
      </div>

      {/* Thesaurus — the hoard */}
      <div style={depCard}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={depTitle} title={F.thesaurusBlurb}>
            {F.thesaurus}
          </span>
          {tier >= 1 && (
            <span
              style={{ ...depLabel, color: '#c49e4a' }}
              title={F.foedusTitle}
              aria-label={`${F.foedus} ${ROMAN_TIERS[tier]}`}
            >
              {F.foedus} {ROMAN_TIERS[tier]}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div aria-label={F.hoard}>
            <span style={depLabel}>{F.hoard}</span>
            <RateReadout value={formatBigNum(floor(hoard))} unit="gold" />
          </div>
          <div aria-label={F.interest}>
            <span style={depLabel}>{F.interest}</span>
            <RateReadout value={formatRate(interestRate)} unit="gold/s" />
          </div>
          {anatocismusRate > 0 && (
            <div title={F.anatocismusRate}>
              <span style={depLabel}>{F.anatocismus}</span>
              <RateReadout value={formatRate(anatocismusRate)} unit="gold/s \u2192 hoard" />
            </div>
          )}
        </div>
        <span style={depFlavor}>{F.thesaurusBlurb}</span>

        {/* Deposit */}
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number"
            min={0}
            className="dep-amount"
            style={{ ...depMono, width: 110 }}
            value={depositText}
            onChange={(e) => setDepositText(e.target.value)}
            aria-label={`${F.deposit} amount`}
          />
          <button
            type="button"
            className="dep-deepen"
            disabled={depositAmount < 1 || depositAmount > gold}
            onClick={() => {
              deposit(depositAmount);
              setDepositText('');
            }}
            aria-label={F.deposit}
          >
            {F.deposit}
          </button>
          <button
            type="button"
            className="dep-mini dep-mini--wide"
            disabled={gold < 1}
            onClick={() => deposit(gold)}
            aria-label={`${F.deposit} ${F.depositAll}`}
          >
            {F.depositAll}
          </button>
        </div>

        {/* Withdraw — two-step: the loss is stated before the confirm. */}
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number"
            min={0}
            className="dep-amount"
            style={{ ...depMono, width: 110 }}
            value={withdrawText}
            onChange={(e) => {
              setWithdrawText(e.target.value);
              setConfirmingWithdraw(false);
            }}
            aria-label={`${F.withdraw} amount`}
          />
          {confirmingWithdraw ? (
            <>
              <span style={{ ...depFlavor, color: '#c98a6a' }}>
                {F.withdrawWarning} {F.withdrawRecovers} {returned}, {forfeited}{' '}
                {F.withdrawForfeits}.
              </span>
              <button
                type="button"
                className="dep-deepen"
                onClick={() => {
                  withdraw(withdrawAmount);
                  setWithdrawText('');
                  setConfirmingWithdraw(false);
                }}
                aria-label={`${F.confirm} ${F.withdraw}`}
              >
                {F.confirm}
              </button>
              <button
                type="button"
                className="dep-mini dep-mini--wide"
                onClick={() => setConfirmingWithdraw(false)}
                aria-label={F.cancel}
              >
                {F.cancel}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="dep-mini dep-mini--wide"
              disabled={withdrawAmount < 1 || withdrawAmount > hoardFloor}
              onClick={() => setConfirmingWithdraw(true)}
              title={`${F.withdrawRecovers} ${Math.round(recovery * 100)}%`}
              aria-label={F.withdraw}
            >
              {F.withdraw}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The Syngraphae tab: three branch columns (Usura / Faeneratio / Custodia), each a vertical chain
 * of four contracts showing name, effect, fee and gate. States: signed, available, gated (with the
 * Avaritia level required), unaffordable. Signing is a two-step confirm — the fee is burned.
 */
function SyngraphaeTab(): ReactElement {
  const state = useGameStore((s) => s.state);
  const sign = useGameStore((s) => s.signSyngrapha);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  if (!state) return <></>;
  const F = strings.faeneratio;
  const gold = floor(state.lifetime.gold).toNumber();
  const avaritiaLevel = sinLevel(state.devotion.avaritia);
  return (
    <div>
      <p className="dep-blurb">{F.syngraphaeIntro}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 13 }}>
        {SYNGRAPHA_BRANCHES.map((branch) => (
          <div key={branch} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ ...depLabel, textAlign: 'center', color: '#c49e4a' }}>
              {F.branches[branch]}
            </span>
            {syngraphaBranch(branch).map((node, idx) => {
              const signed = syngraphaSigned(state, node.id);
              const gate = syngraphaSignable(state, node);
              const signable = gate.signable;
              const affordable = gold >= node.cost;
              const name = F.nodeNames[node.id] ?? `${F.branches[branch]} ${ROMAN_TIERS[idx + 1]}`;
              const gatedByLevel = !signed && avaritiaLevel < node.gate;
              const cardStyle: CSSProperties = signed
                ? {
                    ...depCard,
                    border: '1px solid rgba(196,158,74,.5)',
                    background: 'rgba(44,32,10,.5)',
                  }
                : signable
                  ? depCard
                  : { ...depCard, opacity: 0.55, borderStyle: 'dashed' };
              return (
                <div key={node.id} style={cardStyle}>
                  <span style={{ ...depTitle, fontSize: '.95rem' }}>{name}</span>
                  <span style={depFlavor}>{F.nodeEffects[node.id]}</span>
                  {signed ? (
                    <span style={{ ...depLabel, color: '#c49e4a' }}>{F.signed}</span>
                  ) : (
                    <>
                      <span style={depLabel}>
                        {node.cost.toLocaleString('en-US')} {strings.resources.gold.toLowerCase()}
                        {' \u00b7 '}
                        {F.requiresAvaritia} {ROMAN_TIERS[node.gate]}
                      </span>
                      {gatedByLevel ? (
                        <span style={{ ...depLabel, color: '#c98a6a' }}>
                          {F.requiresAvaritia} {ROMAN_TIERS[node.gate]}
                        </span>
                      ) : !signable ? (
                        <span style={{ ...depLabel, color: '#c98a6a' }}>{F.requiresPrior}</span>
                      ) : confirmingId === node.id ? (
                        <div style={{ display: 'flex', gap: 7 }}>
                          <button
                            type="button"
                            className="dep-deepen"
                            disabled={!affordable}
                            onClick={() => {
                              sign(node.id);
                              setConfirmingId(null);
                            }}
                            aria-label={`${F.confirm} ${F.sign} ${name}`}
                          >
                            {F.confirm}
                          </button>
                          <button
                            type="button"
                            className="dep-mini dep-mini--wide"
                            onClick={() => setConfirmingId(null)}
                            aria-label={F.cancel}
                          >
                            {F.cancel}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="dep-deepen"
                          disabled={!affordable}
                          onClick={() => setConfirmingId(node.id)}
                          aria-label={`${F.sign} ${name}`}
                        >
                          {F.sign}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DepraedatioGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const notice = useGameStore((s) => s.notice);
  const [tab, setTab] = useState<DepraedatioTab>('thesaurus');
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const blurb = tab === 'thesaurus' ? strings.opera.thesaurusBlurb : strings.opera.syngraphaeBlurb;
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
            aria-selected={tab === 'thesaurus'}
            className={'dep-tab' + (tab === 'thesaurus' ? ' dep-tab--active' : '')}
            onClick={() => setTab('thesaurus')}
          >
            {strings.faeneratio.thesaurusTab}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'syngraphae'}
            className={'dep-tab' + (tab === 'syngraphae' ? ' dep-tab--active' : '')}
            onClick={() => setTab('syngraphae')}
          >
            {strings.faeneratio.syngraphaeTab}
          </button>
        </div>

        <p className="dep-blurb">{blurb}</p>

        {tab === 'thesaurus' ? <ThesaurusTab /> : <SyngraphaeTab />}

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
