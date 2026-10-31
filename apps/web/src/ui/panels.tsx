import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { strings } from '@panvitium/shared';
import {
  bn,
  floor,
  ACTIONS,
  actionUnlocked,
  actionTierDistribution,
  TIERS,
  categoryEfficiency,
  plannedActionCost,
  isStackable,
  countCopies,
  MALEFICIA,
  computeModifiers,
  indagatioInvestmentCost,
  INDAGATIO_INVEST_MAX_PERCENT,
  FENUS_RATE,
  MAX_RELATIONSHIP_TIER,
  accountAgeHours,
  chosenSyngraphaOfTier,
  realisedInterestPerSecond,
  relationshipTier,
  relationshipTierThreshold,
  surrenderBarred,
  surrenderCharge,
  syngraphaChosen,
  syngraphaeInForce,
  syngraphaeOfTier,
  thesaurusRecoveryFraction,
  vestingPerSecond,
  assignedCount,
  isDelegatable,
  isAutoRepeatable,
  isAutoRepeating,
  occupiesPlayerSlot,
  ACHIEVEMENTS,
  isUnlocked,
  unreadCount,
  type OutcomeEvent,
  type Tier,
} from '@panvitium/sim';
import { SmartphoneDialer, type DialResult } from '../menus/SmartphoneDialer.js';
import { MaleficiaCabinet as DesignedCabinet } from '../menus/MaleficiaCabinet.js';
import { LogosPanel as DesignedLogos, type LogosActionView } from '../menus/LogosPanel.js';
import { PcWindow as DesignedPc } from '../menus/PcWindow.js';
import { CalculatorProgram } from '../menus/Calculator.js';
import {
  DepraedatioAccount,
  type DepContractState,
  type DepTierView,
} from '../menus/DepraedatioAccount.js';
import { AnalyticsGroup } from './Analytics.js';
import { EmailsGroup } from './Emails.js';
import { buildCabinet, invokingPowerText } from '../game/maleficia.js';
import { formatBigNum } from '../game/format.js';
import { OrbisTenebrarum, type OrbisFind } from '../menus/orbis-tenebrarum/index.js';
import { useGameStore } from '../store/gameStore.js';
import { actionName } from '../game/labels.js';
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js';

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

/** A single outcome rendered as a terminal log line: "Suggestion · Good — +1 Reprobates". */
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

/** The rite's delegation gate as a short label, e.g. "Any Sin I" — for the locked-control hint. */
function delegateGateLabel(actionId: string): string {
  const g = ACTIONS[actionId]?.delegateUnlock;
  if (g === undefined) return '';
  return `${strings.opera.anySin} ${romanLevel(g)}`;
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

/** The three temptations in scroll order, with their alchemical sigils (☿ Mercury, ✴ the eight
 * voices, ☉ the crowned Sun) and Roman numerals. Logos always presents exactly these three. */
const LOGOS_ORDER = ['suggestion', 'logismoi', 'imperium'] as const;
const LOGOS_GLYPHS: Record<string, string> = {
  suggestion: '\u263F',
  logismoi: '\u2734',
  imperium: '\u2609',
};
const LOGOS_NUMERALS = ['I', 'II', 'III'] as const;

/** Per-tier colour for the Logos ledger's outcome chip — the scroll's candle-gold palette fading to
 *  ash. Keyed by the real OutcomeEvent tier. */
const LOGOS_TIER_COLOR: Record<Tier, string> = {
  stellar: '#e6c04a',
  excellent: '#d2a63f',
  good: '#c9a227',
  neutral: '#a08a5e',
  bad: '#8a6a4a',
  terrible: '#7a4a3a',
  apocalyptic: '#8a3a2a',
};

/** The success tiers. On a Logos rite, a reprobate loss at one of these is a suicide (Suggestion's
 *  Good); a loss at any failure tier is a plain loss to the Church. */
const LOGOS_SUCCESS_TIERS: ReadonlySet<Tier> = new Set<Tier>(['stellar', 'excellent', 'good']);

/** Re-skin one resolved Logos outcome into the ledger's second column: the rite and its net resource
 *  deltas, or a "no soul stirred" line when a temptation yielded nothing. A reprobate loss names its
 *  fate: a suicide with the souls it minted ("−3 Reprobates, +3 Souls (suicide)") or a plain loss
 *  ("−1 Reprobates (lost)"). Murder never comes from a rite. */
function logosLedgerText(e: OutcomeEvent): string {
  const name = actionName(e.actionId);
  const parts: string[] = [];
  const sign = (n: number): string => `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US')}`;
  if (e.reprobateDelta < 0) {
    const flock = `${sign(e.reprobateDelta)} ${strings.reprobates}`;
    // The fate follows the tier, not the soul delta: a few souls added to a vast hoard round away in
    // the BigNum event delta, which would misread a suicide as a loss. Each suicide mints exactly 1
    // soul, so the death count is the soul yield.
    parts.push(
      LOGOS_SUCCESS_TIERS.has(e.tier)
        ? `${flock}, ${sign(-e.reprobateDelta)} ${strings.resources.souls} (${strings.opera.logosSuicide})`
        : `${flock} (${strings.opera.logosLost})`,
    );
  } else {
    if (e.soulsDelta !== 0) parts.push(`${sign(e.soulsDelta)} ${strings.resources.souls}`);
    if (e.reprobateDelta !== 0) parts.push(`${sign(e.reprobateDelta)} ${strings.reprobates}`);
  }
  if (e.goldDelta !== 0) parts.push(`${sign(e.goldDelta)} ${strings.resources.gold}`);
  return parts.length > 0
    ? `${name} · ${parts.join(' · ')}`
    : `${name} · ${strings.opera.logosNoYield}`;
}

/**
 * The Chthonic Logos (Studio), the Logos rites' scroll (Claude Design rework).
 * The Chthonic Logos is the scroll on the Studio table that holds the Logos rites. The player is
 * writing it themselves, from their notes on worldly and otherworldly experience (the Katabasis
 * descents among them); its purpose is the mastery of eloquence and persuasion.
 *
 * A self-framed, full-surface overlay (mounted by App like Magna Goetia / the PC, NOT via PanelShell):
 * it feeds the designed parchment with the real action, cost, and live progress, and preserves
 * acolyte delegation per delegatable rite. A sealed (locked) rite shows redacted Latin + its Sin
 * gate. Resolved outcomes live in the PC's Logs program, not on the scroll.
 */
export function ChthonicLogos({ onClose }: { onClose: () => void }): ReactElement {
  const state = useGameStore((s) => s.state);
  const act = useGameStore((s) => s.act);
  const log = useGameStore((s) => s.log);
  const head = useGameStore(
    (s) => s.state?.lifetime.actionQueue.find((t) => occupiesPlayerSlot(t.actionId)) ?? null,
  );

  const headerProps = {
    title: strings.opera.logosTitle,
    maxim: strings.opera.logosMaxim,
    closeLabel: strings.opera.logosClose,
    onClose,
  };
  if (!state) return <DesignedLogos {...headerProps} actions={[]} />;

  const influence = floor(state.lifetime.influence).toNumber();
  const eff = categoryEfficiency(state, 'logos');
  const underway = state.lifetime.actionQueue.some((t) => occupiesPlayerSlot(t.actionId));
  const names: Record<string, string> = {
    suggestion: strings.opera.suggestion,
    logismoi: strings.opera.logismoi,
    imperium: strings.opera.imperium,
  };

  const actions: LogosActionView[] = LOGOS_ORDER.map((id, i) => {
    const def = ACTIONS[id]!;
    // The exact influence the cast would take — the same pipeline startAction deducts (the log-scaled
    // Logos cost and the Paimon #9 reduction), so the printed cost and the affordability gate match.
    const influenceCost = plannedActionCost(state, id, { efficiency: eff }).influence;
    const locked = !actionUnlocked(state, def);
    const active = head?.actionId === id;
    // Logos is cost-outcome, so a rite's queued duration is exactly its baseTimeSeconds — which
    // lets us reconstruct progress from the remaining time with no sim/save change.
    const base = def.baseTimeSeconds;
    const remaining = head?.remainingSeconds ?? base;
    const progress =
      active && base > 0 ? Math.min(100, Math.max(0, ((base - remaining) / base) * 100)) : 0;
    const sealed = locked ? strings.opera.logosSealed[id] : undefined;
    // The control cluster (auto-repeat toggle + acolyte delegation) shows on EVERY unlocked rite —
    // each sub-control renders its own locked/disabled state until it is available (design handoff),
    // so the automation systems are visible from the first castable rite onward.
    const hasControls = !locked;
    return {
      id,
      numeral: LOGOS_NUMERALS[i] ?? '',
      glyph: LOGOS_GLYPHS[id] ?? '',
      name: locked ? (sealed?.name ?? '') : (names[id] ?? def.id),
      quote: locked ? (sealed?.maxim ?? '') : (strings.opera.logosQuote[id] ?? ''),
      cost: `${influenceCost} ${strings.resources.influence} · ${def.baseTimeSeconds}s`,
      cta: strings.opera.logosCta[id] ?? strings.opera.tempt,
      status: strings.opera.logosStatus[id] ?? '',
      locked,
      active,
      progress,
      disabled: underway || locked || influence < influenceCost,
      onTempt: () => act(id),
      ...(def.unlock !== undefined
        ? {
            lockLabel: `${strings.opera.logosRequires} ${strings.opera.anySin} ${romanLevel(
              def.unlock,
            )}`,
          }
        : {}),
      ...(hasControls ? { delegation: <RiteControls actionId={id} /> } : {}),
    };
  });

  // The scroll's foot is its ledger: the resolved temptations (this program's rites only), newest
  // first, each an outcome tier chip beside its net resource deltas.
  const ledgerRows = log.filter((e) => (LOGOS_ORDER as readonly string[]).includes(e.actionId));
  const ledger = (
    <div className="logos-ledger">
      <div className="logos-ledger-head">{strings.opera.logosLedgerHeading}</div>
      {ledgerRows.length === 0 ? (
        <p className="logos-ledger-empty">{strings.opera.logosEmptyLedger}</p>
      ) : (
        <div>
          {ledgerRows.map((e, i) => (
            <div className="logos-ledger-row" key={`${i}-${e.actionId}-${e.tier}`}>
              <span className="logos-ledger-tier" style={{ color: LOGOS_TIER_COLOR[e.tier] }}>
                {strings.tiers[e.tier]}
              </span>
              <span className="logos-ledger-text">{logosLedgerText(e)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return <DesignedLogos {...headerProps} actions={actions} ledger={ledger} />;
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

type PcGroupId =
  | 'depraedatio'
  | 'indagatio'
  | 'analytics'
  | 'achievements'
  | 'emails'
  | 'logs'
  | 'calculator';

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
  const invest = useGameStore((s) => s.investIndagatio);
  const divest = useGameStore((s) => s.divestIndagatio);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;

  const goldNum = floor(state.lifetime.gold).toNumber();
  const owned = state.lifetime.maleficia;

  // The Emptio list can carry several copies of one stackable maleficium (older saves; a fresh find
  // no longer duplicates). Collapse them to ONE row per id, with the copy count baked into the name,
  // so the ledger shows each relic once. A row per raw copy gave every duplicate the same React key
  // and the same select/acquire/progress id, so buying or selecting one lit up all of them ("buys
  // all at once") even though the sim only ever consumes a single copy per purchase.
  const listedCounts = new Map<string, number>();
  for (const id of state.lifetime.emptioList) {
    listedCounts.set(id, (listedCounts.get(id) ?? 0) + 1);
  }
  const finds: OrbisFind[] = [...listedCounts].flatMap(([id, count]) => {
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
        name: count > 1 ? `${def.name} ×${count}` : def.name,
        rarity: def.rarity,
        // The invoking-power line ("+4 invoking power"); a relic that grants none shows no line.
        effect: invokingPowerText(def.invokingPower),
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

  // The Investment meter shows the default percentage every Search pours into itself, then the gold
  // the next Cast would spend on it right now (that share of the treasury, less Ipos #22's cut).
  // Invest/Divest step the percentage (+2 / -1 points); disable each at its bound.
  const investPercent = state.lifetime.indagatioInvestPercent;

  // The live per-tier odds of a Search (base weights × the player's current tier modifiers), so the
  // globe shows how likely each outcome — and thus each rarity of find — is right now.
  const indagatioDist = actionTierDistribution(state, 'indagatio');
  const tierChances = TIERS.map((t) => ({
    tier: t,
    label: strings.tiers[t],
    chance: formatTierPct(indagatioDist[t]),
  }));

  return (
    <OrbisTenebrarum
      finds={finds}
      tierChances={tierChances}
      investmentPercent={`${investPercent}%`}
      investmentGold={formatBigNum(indagatioInvestmentCost(state))}
      gold={formatBigNum(state.lifetime.gold)}
      searching={indagatioTimer !== null}
      searchDuration={formatDuration(actualSec)}
      searchRemaining={
        indagatioTimer ? formatDuration(Math.ceil(indagatioTimer.remainingSeconds)) : null
      }
      emptioProgress={emptioProgress}
      selectedId={selectedId}
      canInvest={investPercent < INDAGATIO_INVEST_MAX_PERCENT}
      canDivest={investPercent > 0}
      onCast={() => act('indagatio')}
      onInvest={invest}
      onDivest={divest}
      onSelect={setSelectedId}
      onAcquire={(id) => act('emptio', id)}
    />
  );
}

/**
 * The Loculi reliquary (Invocation Room): a self-framed, full-surface overlay (mounted by App like
 * Magna Goetia / the Chthonic Logos, NOT via PanelShell). Owned items grouped by id, stackables showing
 * their count; the single-use rites wired to `activateMaleficium`, and (while the Depraedatio private
 * item safe is open) every relic's "Store in safe" toggle wired to `toggleSafeItem`. It opens on the newest relic
 * Emptio brought home (else the rarest), whether or not its Unveiling played, and forgets that
 * focus when it closes.
 */
export function Loculi({ onClose }: { onClose: () => void }): ReactElement {
  const state = useGameStore((s) => s.state);
  const activate = useGameStore((s) => s.activateMaleficium);
  const toggleSafe = useGameStore((s) => s.toggleSafeItem);
  const focus = useGameStore((s) => s.lastObtained);
  const clearFocus = useGameStore((s) => s.clearLastObtained);
  const reducedMotion = usePrefersReducedMotion();
  useEffect(() => clearFocus, [clearFocus]);
  const items = state ? buildCabinet(state) : [];
  return (
    <DesignedCabinet
      items={items}
      onUse={activate}
      onSafe={toggleSafe}
      onClose={onClose}
      focus={focus}
      reducedMotion={reducedMotion}
    />
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

/** Format an outcome-tier probability (0..1) as a percentage for the Indagatio odds readout. */
function formatTierPct(p: number): string {
  const pct = Math.max(0, p) * 100;
  if (pct === 0) return '0%';
  if (pct < 0.1) return '<0.1%';
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/**
 * Depraedatio: the account presented as the "Counting House" private-bank dashboard (Claude Design
 * redesign). This wrapper reads the store, composes every figure from the sim (the realised interest
 * and Vesting drawdown, the realised income since account inception, the relationship tier and its
 * progress, the surrender charge, the effective interest multiplier, and the nine tiered contracts),
 * then feeds the presentational `DepraedatioAccount` surface and wires its deposit / withdraw /
 * choose controls to the real store actions. The mundane banking copy lives in `strings.faeneratio`;
 * the sim ids (thesaurus/syngraphae) are unchanged. The loan book is retired.
 */

/**
 * The account accent (code-level knob, curated by the design): Pine (default), Navy `#1B3A5B`, or
 * Bordeaux `#5E2233`. `CH_SHOW_SPARKLINE` toggles the decorative balance sparkline.
 */
const CH_ACCENT = '#1E4638';
const CH_SHOW_SPARKLINE = true;

/** Roman numerals for the relationship-tier badge. */
const DEP_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'] as const;

/**
 * A gold-rate readout: two decimals under 100, grouped/suffixed integers above (the game's own
 * `formatBigNum`), so an early fractional interest (reserve * 0.0005) still reads rather than
 * rounding to zero, while a fat realised rate stays legible.
 */
function formatRateStr(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (Math.abs(n) < 100) return (Math.round(n * 100) / 100).toString();
  return formatBigNum(bn(Math.floor(n)));
}

/** A fraction as a compact percentage: "15%", "10.05%", "0.0665%" (up to 4 significant digits). */
function formatPct(fraction: number): string {
  const pct = fraction * 100;
  if (!Number.isFinite(pct)) return '∞';
  return `${Number(pct.toPrecision(4)).toString()}%`;
}

/** The account's age as "Xh Ym" (or "Ym", "Xs" when short). */
function formatAccountAge(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

export function DepraedatioGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const deposit = useGameStore((s) => s.depositThesaurus);
  const withdraw = useGameStore((s) => s.withdrawThesaurus);
  const sign = useGameStore((s) => s.signSyngrapha);
  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;

  const F = strings.faeneratio;
  const goldUnit = strings.resources.gold.toLowerCase();
  const mods = computeModifiers(state);
  const gold = floor(state.lifetime.gold).toNumber();
  const balance = floor(state.lifetime.hoard).toNumber();
  // Realised rates: the interest x faenerationOutputMul x goldRateMul (the tick's gold line), plus
  // the Vesting drawdown while it is in force.
  const interestRate = realisedInterestPerSecond(state, mods);
  const vesting = vestingPerSecond(state);
  const income = interestRate + vesting;
  const tier = relationshipTier(state);
  const charge = surrenderCharge(mods);
  const recovery = thesaurusRecoveryFraction(mods);
  const inForce = syngraphaeInForce(state);

  // Tier progress: position between the current tier's threshold and the next.
  let progressPct = 100;
  let nextTierRoman: string = DEP_ROMAN[MAX_RELATIONSHIP_TIER] ?? 'III';
  let nextThresholdStr: string = F.maxTier;
  if (tier < MAX_RELATIONSHIP_TIER) {
    const prev = relationshipTierThreshold(tier);
    const next = relationshipTierThreshold(tier + 1);
    progressPct = Math.max(0, Math.min(100, ((balance - prev) / (next - prev)) * 100));
    nextTierRoman = DEP_ROMAN[tier + 1] ?? String(tier + 1);
    nextThresholdStr = `${formatBigNum(bn(next))} ${goldUnit}`;
  }

  // The three tier rows of three contracts. Per card: active (chosen: it holds for the lifetime,
  // whatever the reserve does), available (tier held, nothing chosen in the tier), locked (tier not
  // held, nothing chosen), or foreclosed (another contract holds the tier). Mirrors
  // `syngraphaSignable`.
  const tiers: DepTierView[] = [];
  for (let t = 1; t <= MAX_RELATIONSHIP_TIER; t++) {
    const held = tier >= t;
    const chosen = chosenSyngraphaOfTier(state, t);
    const contracts = syngraphaeOfTier(t).map((def) => {
      let cState: DepContractState;
      if (syngraphaChosen(state, def.id)) cState = 'active';
      else if (chosen) cState = 'foreclosed';
      else cState = held ? 'available' : 'locked';
      // Long-term investing's magnitude scales live: surface the current multiplier alongside the
      // baked "+10% per hour" line (hard copy rule 1).
      const live =
        def.effect.kind === 'fenusRatePerHour'
          ? `${F.liveNow} ×${(1 + def.effect.perHour * accountAgeHours(state)).toFixed(2)}`
          : undefined;
      return {
        id: def.id,
        title: F.contractNames[def.id] ?? def.id,
        effect: F.contractEffects[def.id] ?? '',
        state: cState,
        ...(live !== undefined ? { live } : {}),
      };
    });
    tiers.push({
      tier: t,
      thresholdStr: relationshipTierThreshold(t).toLocaleString('en-US'),
      held,
      contracts,
    });
  }

  const age = state.lifetime.accountAge;
  return (
    <DepraedatioAccount
      balanceStr={formatBigNum(floor(state.lifetime.hoard))}
      cashStr={formatBigNum(floor(state.lifetime.gold))}
      interestStr={formatRateStr(interestRate)}
      vestingStr={inForce.some((d) => d.effect.kind === 'vesting') ? formatRateStr(vesting) : null}
      incomeStr={formatRateStr(income)}
      realisedStr={formatBigNum(floor(state.lifetime.accountIncome ?? bn(0)))}
      interestRateStr={formatPct(FENUS_RATE * mods.fenusRateMul)}
      surrenderChargeStr={formatPct(charge)}
      recoveryPct={formatPct(recovery)}
      nextThresholdStr={nextThresholdStr}
      accountAgeStr={age === undefined ? null : formatAccountAge(age)}
      cash={gold}
      balance={balance}
      recovery={recovery}
      surrenderBarred={surrenderBarred(state)}
      tier={tier}
      nextTierRoman={nextTierRoman}
      progressPct={progressPct}
      yieldMul={mods.fenusRateMul}
      contractsInForce={inForce.length}
      tiers={tiers}
      onDeposit={deposit}
      onWithdraw={withdraw}
      onSign={sign}
      accent={CH_ACCENT}
      showSparkline={CH_SHOW_SPARKLINE}
    />
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
  if (group === 'indagatio') return <IndagatioEmptioProgram />;
  if (group === 'analytics') return <AnalyticsGroup />;
  if (group === 'emails') return <EmailsGroup />;
  if (group === 'achievements') return <AchievementsGroup />;
  if (group === 'logs') return <OutcomeLog />;
  if (group === 'calculator') return <CalculatorProgram />;
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
 * by App like Magna Goetia / the PC / the Chthonic Logos, NOT via PanelShell): the player keys a code on
 * the dialer and submits it. The sim owns the valid-code set and the outgoing calls; the store's
 * `dial` applies a number to the game. A number that connects hands its call to `onCall` (App closes
 * the dialer and raises the call stage, docs/PANVITIUM-CALLS-OUT.md); anything else becomes the toast
 * the dialer renders, with copy from `strings`. The boon EFFECTS of plain codes are still a
 * documented empty hook: a recognized code only surfaces its copy.
 */
export function PhoneDialer({
  onClose,
  onCall,
}: {
  onClose: () => void;
  /** A dialled number connected: place the outgoing call `callId`. */
  onCall: (callId: string) => void;
}): ReactElement {
  const dial = useGameStore((s) => s.dial);
  const onDial = (raw: string): DialResult => {
    const outcome = dial(raw);
    if (outcome.kind === 'call') {
      onCall(outcome.callId);
      return { kind: 'boon', message: '' };
    }
    if (outcome.kind === 'error') {
      // A recognized joke number (e.g. 666) carries its own copy; an unknown number is rejected.
      const message = outcome.code
        ? (strings.phone.codes[outcome.code] ?? strings.phone.unrecognized)
        : strings.phone.unrecognized;
      return { kind: 'error', message };
    }
    // A one-shot line dialled again rings out (`info`, its own copy keyed by the number). A plain
    // boon code still only shows its copy: its effect is a hook for the outgoing-call engine.
    return { kind: outcome.kind, message: strings.phone.codes[outcome.code] ?? '' };
  };
  return <SmartphoneDialer onClose={onClose} onDial={onDial} />;
}
