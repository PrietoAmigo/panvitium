import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';

/**
 * Depraedatio "Counting House" account (Claude Design redesign). A self-framed full-surface program
 * body rendered full-bleed inside the PC window (see FULLBLEED in PcWindow): the Depraedatio gold
 * loop presented as a calm, mundane private-bank / wealth-management dashboard. It is deliberately
 * non-thematic: no occult register, just money. Two left-nav sections (Portfolio and Contracts) over
 * one managed account; the Latin surfaces are relabelled in plain banking terms (Reserve, Interest,
 * Relationship tier, Contracts), while the underlying sim ids are unchanged (see the wrapper in
 * ui/panels.tsx which feeds this the real store figures + actions).
 *
 * Layout: Portfolio is the balance summary (four KPI tiles in one row, then the realised-income line
 * since account inception), then the Reserve Account beside the Account status card (stretched to
 * one height), then the recent-activity ledger across the full width. Contracts is three
 * relationship-tier rows of three equal-height contract cards; one contract per tier, held for the
 * lifetime once chosen (the tier gates only the choice).
 *
 * Purely presentational: the wrapper computes every figure from the sim and passes pre-formatted
 * strings for the money surfaces (game-consistent `formatBigNum`), plus raw numbers where the panel
 * does its own interaction math (deposit/withdraw validation, the surrender preview). This component
 * owns only UI-only state (ADR-003): the active view, the privacy mask, the deposit/withdraw inputs
 * and their confirm steps, and a session-local "recent activity" ledger of the player's own moves
 * (non-persisted, empty on open).
 */

/**
 * One contract card's presentation state, computed by the wrapper: chosen (active for the life of
 * the account), available to choose, locked (tier not reached), or foreclosed (another contract
 * holds the tier).
 */
export type DepContractState = 'active' | 'available' | 'locked' | 'foreclosed';

export interface DepContractView {
  id: string;
  /** Display title, e.g. "Compounding". */
  title: string;
  /** Effect line (numbers baked in). */
  effect: string;
  state: DepContractState;
  /** A live magnitude readout for a contract whose effect scales (Long-term investing's "Now x1.25"). */
  live?: string;
}

export interface DepTierView {
  /** The relationship tier (1..3). */
  tier: number;
  /** Pre-formatted threshold, e.g. "10,000". */
  thresholdStr: string;
  /** Whether the reserve holds this tier right now. */
  held: boolean;
  contracts: readonly DepContractView[];
}

export interface DepraedatioAccountProps {
  // ── Pre-formatted money surfaces (unmasked; this component applies the privacy mask) ──
  balanceStr: string;
  cashStr: string;
  /** Interest per second (after all multipliers). */
  interestStr: string;
  /** Vesting per second, or null while Vesting is not in force. */
  vestingStr: string | null;
  /** Account income per second (interest + vesting). */
  incomeStr: string;
  /** Realised income since account inception. */
  realisedStr: string;
  /** The effective interest rate per second, e.g. "0.0665%". */
  interestRateStr: string;
  /** The effective surrender charge, e.g. "15%". */
  surrenderChargeStr: string;
  /** The fraction returned on a withdrawal, e.g. "85%". */
  recoveryPct: string;
  /** Next-tier threshold, e.g. "10,000 gold" (or "max tier"). */
  nextThresholdStr: string;
  /** The account's age since inception, e.g. "1h 12m", or null before the first deposit. */
  accountAgeStr: string | null;

  // ── Raw numbers for the panel's own interaction math ──
  /** Available cash (floored gold), for deposit validation + "All cash". */
  cash: number;
  /** Reserve balance (floored), for withdraw validation. */
  balance: number;
  /** Withdrawal recovery fraction (0..1), for the returned/forfeited preview. */
  recovery: number;
  /** True while an Annuity bars manual surrender. */
  surrenderBarred: boolean;

  // ── Derived status ──
  tier: number;
  nextTierRoman: string;
  /** Progress toward the next tier, 0..100. */
  progressPct: number;
  /** The effective interest multiplier (mods.fenusRateMul) for the "Yield x N" pill. */
  yieldMul: number;
  /** How many chosen contracts are in force right now. */
  contractsInForce: number;

  tiers: readonly DepTierView[];

  onDeposit: (amount: number) => void;
  onWithdraw: (amount: number) => void;
  onSign: (id: string) => void;

  /** Accent colour (curated: Pine #1E4638, Navy #1B3A5B, Bordeaux #5E2233). Default Pine. */
  accent?: string;
  /** Show the decorative balance sparkline. Default true. */
  showSparkline?: boolean;
  /** A transient store notice (e.g. an Astiwihad refusal), shown as an unobtrusive banner. */
  notice?: string | null;
}

type View = 'portfolio' | 'contracts';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'] as const;
const ACCENT_LIGHT = '#7CA98F';

/** Decorative 24-point balance series (diegetic chrome, not real history) for the sparkline. */
const SPARK = [
  2010, 2035, 2028, 2062, 2090, 2075, 2110, 2150, 2138, 2172, 2205, 2190, 2240, 2268, 2255, 2300,
  2330, 2318, 2360, 2402, 2388, 2430, 2465, 2486,
] as const;

/** Integer with thousands separators. */
function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  return Math.round(n).toLocaleString('en-US');
}

/** One session-local ledger entry (the player's own move this session; non-persisted). */
interface LedgerRow {
  key: number;
  desc: string;
  sub: string;
  /** Signed gold amount; absent for a note row (a contract choice moves no gold). */
  amount?: number;
  kind: 'credit' | 'debit' | 'note';
}

export function DepraedatioAccount(props: DepraedatioAccountProps): ReactElement {
  const {
    balanceStr,
    cashStr,
    interestStr,
    vestingStr,
    incomeStr,
    realisedStr,
    interestRateStr,
    surrenderChargeStr,
    recoveryPct,
    nextThresholdStr,
    accountAgeStr,
    cash,
    balance,
    recovery,
    surrenderBarred,
    tier,
    nextTierRoman,
    progressPct,
    yieldMul,
    contractsInForce,
    tiers,
    onDeposit,
    onWithdraw,
    onSign,
    accent = '#1E4638',
    showSparkline = true,
    notice = null,
  } = props;

  const F = strings.faeneratio;
  const gold = strings.resources.gold.toLowerCase();

  const [view, setView] = useState<View>('portfolio');
  // Each view opens at its top: the shared scroll area would otherwise carry one view's scroll
  // offset into the other (e.g. opening Contracts halfway down after scrolling the Portfolio).
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [view]);
  const [mask, setMask] = useState(false);
  const [depText, setDepText] = useState('');
  const [wText, setWText] = useState('');
  const [wConfirm, setWConfirm] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<readonly LedgerRow[]>([]);
  const [ledgerSeq, setLedgerSeq] = useState(0);

  // Accent-derived tokens: soft fill + hairline border as 8-digit hex, exposed as CSS variables so
  // the whole surface themes from the one accent knob.
  const rootVars = {
    '--ch-accent': accent,
    '--ch-accent-light': ACCENT_LIGHT,
    '--ch-accent-soft': accent + '14',
    '--ch-accent-border': accent + '3a',
  } as CSSProperties;

  const maskStr = (s: string): string => (mask ? s.replace(/[0-9]/g, '•') : s);

  const tierLabel = tier > 0 ? `${F.tier} ${ROMAN[tier] ?? tier}` : F.noTier;
  const maxTier = tiers.length;

  const pushLedger = (row: Omit<LedgerRow, 'key'>): void => {
    setLedger((prev) => [{ ...row, key: ledgerSeq }, ...prev].slice(0, 8));
    setLedgerSeq((n) => n + 1);
  };

  const depAmount = Math.max(0, Math.floor(Number(depText) || 0));
  const depDisabled = depAmount < 1 || depAmount > cash;
  const doDeposit = (amount: number): void => {
    const amt = Math.min(Math.max(0, Math.floor(amount)), cash);
    if (amt < 1) return;
    onDeposit(amt);
    pushLedger({ desc: F.ledgerDeposit, sub: F.ledgerDepositSub, amount: amt, kind: 'credit' });
    setDepText('');
  };

  const wAmount = Math.max(0, Math.floor(Number(wText) || 0));
  const wReturned = Math.floor(wAmount * recovery);
  const wForfeit = wAmount - wReturned;
  const onWithdrawAsk = (): void => {
    if (wAmount >= 1 && wAmount <= balance) setWConfirm(true);
  };
  const onWithdrawConfirm = (): void => {
    if (wAmount < 1 || wAmount > balance) {
      setWConfirm(false);
      return;
    }
    onWithdraw(wAmount);
    pushLedger({
      desc: F.ledgerWithdrawal,
      sub: F.ledgerWithdrawalSub,
      amount: -wAmount,
      kind: 'debit',
    });
    setWText('');
    setWConfirm(false);
  };

  const choose = (c: DepContractView): void => {
    onSign(c.id);
    pushLedger({
      desc: F.ledgerContract,
      sub: `${c.title} · ${F.ledgerContractSub}`,
      kind: 'note',
    });
    setConfirmId(null);
  };

  // Decorative sparkline path + area + a trailing delta, all from the fixed SPARK series.
  const spark = useMemo(() => {
    const w = 264;
    const h = 66;
    const pad = 6;
    const d = SPARK;
    const mn = Math.min(...d);
    const mx = Math.max(...d);
    const xs = (i: number): number => pad + (i / (d.length - 1)) * (w - 2 * pad);
    const ys = (v: number): number => pad + (1 - (v - mn) / (mx - mn || 1)) * (h - 2 * pad);
    let path = `M${xs(0).toFixed(1)} ${ys(d[0]!).toFixed(1)}`;
    for (let i = 1; i < d.length; i++) path += ` L${xs(i).toFixed(1)} ${ys(d[i]!).toFixed(1)}`;
    const area = `${path} L${xs(d.length - 1).toFixed(1)} ${h - pad} L${xs(0).toFixed(1)} ${h - pad} Z`;
    const delta = `${((d[d.length - 1]! / d[0]! - 1) * 100).toFixed(1)}%`;
    return { path, area, delta };
  }, []);

  const viewTitle = view === 'portfolio' ? F.portfolio : F.contracts;
  const viewSub = view === 'portfolio' ? F.portfolioSubtitle : F.contractsSubtitle;

  /** The meta line under a contract card, by state. */
  const contractMeta = (c: DepContractView, t: DepTierView): string => {
    const tierRoman = ROMAN[t.tier] ?? String(t.tier);
    switch (c.state) {
      case 'active':
        return F.inForce;
      case 'locked':
        return `${F.requiresTier} ${tierRoman} · ${t.thresholdStr} ${F.inReserve}`;
      case 'foreclosed':
        return F.otherChosen;
      default:
        return F.finalNote;
    }
  };

  return (
    <div className="ch-root" style={rootVars}>
      {/* ─────────────── SIDEBAR ─────────────── */}
      <aside className="ch-sidebar">
        <div className="ch-brand">
          <div className="ch-monogram">{F.monogram}</div>
          <div className="ch-brand-text">
            <span className="ch-brand-name">{F.brand}</span>
            <span className="ch-brand-sub">{F.brandSub}</span>
          </div>
        </div>

        <div className="ch-account">
          <div className="ch-eyebrow">{F.managedAccount}</div>
          <div className="ch-account-name">{F.accountName}</div>
          <div className="ch-account-no">{F.accountNo}</div>
          <div className="ch-account-tier">
            <span className="ch-account-tier-val">{tierLabel}</span>
            <span className="ch-account-tier-label">{F.relationshipTier}</span>
          </div>
        </div>

        <nav className="ch-nav">
          <div className="ch-nav-group">{F.navAccounts}</div>
          <button
            type="button"
            className={'ch-navbtn' + (view === 'portfolio' ? ' ch-navbtn--active' : '')}
            onClick={() => setView('portfolio')}
          >
            <span className="ch-navbtn-glyph" aria-hidden="true">
              {'◨'}
            </span>
            {F.portfolio}
          </button>
          <button
            type="button"
            className={'ch-navbtn' + (view === 'contracts' ? ' ch-navbtn--active' : '')}
            onClick={() => setView('contracts')}
          >
            <span className="ch-navbtn-glyph" aria-hidden="true">
              {'❏'}
            </span>
            {F.contracts}
          </button>
          <div className="ch-nav-group ch-nav-group--service">{F.navService}</div>
          <div className="ch-nav-inert" aria-hidden="true">
            <span className="ch-navbtn-glyph">{'⛃'}</span>
            {F.statements}
          </div>
          <div className="ch-nav-inert" aria-hidden="true">
            <span className="ch-navbtn-glyph">{'☰'}</span>
            {F.documents}
          </div>
          <div className="ch-nav-inert" aria-hidden="true">
            <span className="ch-navbtn-glyph">{'⚙'}</span>
            {F.settings}
          </div>
        </nav>

        <div className="ch-side-foot">
          <span className="ch-eyebrow">{F.relationshipManager}</span>
          <span className="ch-manager">{F.managerName}</span>
          <span className="ch-statement">{F.statementLine}</span>
        </div>
      </aside>

      {/* ─────────────── MAIN ─────────────── */}
      <main className="ch-main">
        <header className="ch-topbar">
          <div className="ch-topbar-titles">
            <span className="ch-view-title">{viewTitle}</span>
            <span className="ch-view-sub">{viewSub}</span>
          </div>
          <div className="ch-topbar-actions">
            <button
              type="button"
              className="ch-privacy"
              onClick={() => setMask((m) => !m)}
              title={F.togglePrivacy}
              aria-label={F.togglePrivacy}
              aria-pressed={mask}
            >
              {mask ? '◉' : '◎'}
            </button>
            <button type="button" className="ch-primary" onClick={() => setView('portfolio')}>
              {F.transferFunds}
            </button>
          </div>
        </header>

        <div className="ch-scroll" ref={scrollRef}>
          {notice !== null && <div className="ch-notice">{notice}</div>}

          {view === 'portfolio' ? (
            <div className="ch-screen">
              {/* Balance summary */}
              <section className="ch-card ch-balance">
                <div className="ch-balance-head">
                  <div className="ch-balance-figure">
                    <div className="ch-eyebrow">{F.totalBalance}</div>
                    <div className="ch-balance-row">
                      <span className="ch-balance-value">{maskStr(balanceStr)}</span>
                      <span className="ch-balance-unit">{gold}</span>
                    </div>
                    <div className="ch-balance-delta">
                      <span className="ch-delta-pct">
                        {'▲'} {spark.delta}
                      </span>
                      <span className="ch-delta-label">{F.trailing12}</span>
                    </div>
                  </div>
                  {showSparkline && (
                    <div className="ch-spark">
                      <svg width="264" height="66" viewBox="0 0 264 66" aria-hidden="true">
                        <defs>
                          <linearGradient id="chSpark" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor={accent} stopOpacity="0.16" />
                            <stop offset="1" stopColor={accent} stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d={spark.area} fill="url(#chSpark)" />
                        <path
                          d={spark.path}
                          fill="none"
                          stroke={accent}
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="ch-stats">
                  <div className="ch-stat">
                    <div className="ch-stat-label">{F.availableCash}</div>
                    <div className="ch-stat-value">{maskStr(cashStr)}</div>
                    <div className="ch-stat-caption">{F.availableCashCaption}</div>
                  </div>
                  <div className="ch-stat">
                    <div className="ch-stat-label">{F.income}</div>
                    <div className="ch-stat-value">{maskStr(incomeStr)}</div>
                    <div className="ch-stat-caption">{F.perSecond}</div>
                  </div>
                  <div className="ch-stat">
                    <div className="ch-stat-label">{F.interestRate}</div>
                    <div className="ch-stat-value">{interestRateStr}</div>
                    <div className="ch-stat-caption">{F.interestRateCaption}</div>
                  </div>
                  <div className="ch-stat">
                    <div className="ch-stat-label">{F.surrenderChargeStat}</div>
                    <div className="ch-stat-value">
                      {surrenderBarred ? F.surrenderBarred : surrenderChargeStr}
                    </div>
                    <div className="ch-stat-caption">
                      {surrenderBarred ? F.surrenderBarredCaption : F.surrenderChargeCaption}
                    </div>
                  </div>
                </div>

                <p className="ch-realised">
                  {F.realisedIncome}{' '}
                  <b>
                    {maskStr(realisedStr)} {gold}
                  </b>{' '}
                  {F.sinceInception}
                </p>
              </section>

              <div className="ch-columns">
                {/* Left: the Reserve Account */}
                <section className="ch-card ch-reserve">
                  <div className="ch-card-head">
                    <div>
                      <div className="ch-card-title">{F.reserveAccount}</div>
                      <div className="ch-card-sub">{F.reserveSubtitle}</div>
                    </div>
                    <span className="ch-pill ch-pill--yield">
                      {F.yieldPill} {'×'}
                      {yieldMul.toFixed(2)}
                    </span>
                  </div>
                  <div className="ch-figures">
                    <div>
                      <div className="ch-stat-label">{F.balance}</div>
                      <div className="ch-figure">{maskStr(balanceStr)}</div>
                    </div>
                    <div>
                      <div className="ch-stat-label">{F.interestPerS}</div>
                      <div className="ch-figure ch-figure--pos">{maskStr(interestStr)}</div>
                    </div>
                    {vestingStr !== null && (
                      <div>
                        <div className="ch-stat-label">{F.vestingPerS}</div>
                        <div className="ch-figure ch-figure--pos">{maskStr(vestingStr)}</div>
                      </div>
                    )}
                  </div>

                  {/* Deposit */}
                  <div className="ch-money-block ch-money-block--top">
                    <div className="ch-money-head">
                      <span className="ch-money-label">{F.depositToReserve}</span>
                      <span className="ch-money-avail">
                        {F.available} <span className="ch-mono">{maskStr(cashStr)}</span>
                      </span>
                    </div>
                    <div className="ch-money-row">
                      <input
                        type="number"
                        min={0}
                        className="ch-input"
                        placeholder="0"
                        value={depText}
                        onChange={(e) => setDepText(e.target.value)}
                        aria-label={F.depositToReserve}
                      />
                      <button
                        type="button"
                        className="ch-ghost"
                        disabled={cash < 1}
                        onClick={() => doDeposit(cash)}
                      >
                        {F.allCash}
                      </button>
                      <button
                        type="button"
                        className="ch-deposit"
                        disabled={depDisabled}
                        onClick={() => doDeposit(depAmount)}
                        aria-label={F.deposit}
                      >
                        {F.deposit}
                      </button>
                    </div>
                  </div>

                  {/* Withdraw */}
                  <div className="ch-money-block">
                    <div className="ch-money-head">
                      <span className="ch-money-label">{F.withdrawFromReserve}</span>
                      <span className="ch-money-charge">
                        {surrenderBarred
                          ? F.surrenderBarredNote
                          : `${F.surrenderCharge} ${surrenderChargeStr} · ${recoveryPct} ${F.returned}`}
                      </span>
                    </div>
                    <div className="ch-money-row">
                      <input
                        type="number"
                        min={0}
                        className="ch-input"
                        placeholder="0"
                        value={wText}
                        disabled={surrenderBarred}
                        onChange={(e) => {
                          setWText(e.target.value);
                          setWConfirm(false);
                        }}
                        aria-label={F.withdrawFromReserve}
                      />
                      <button
                        type="button"
                        className="ch-withdraw"
                        disabled={surrenderBarred || wAmount < 1 || wAmount > balance}
                        onClick={onWithdrawAsk}
                        aria-label={F.withdraw}
                      >
                        {F.withdraw}
                      </button>
                    </div>
                    {wConfirm && !surrenderBarred && (
                      <div className="ch-confirm">
                        <span className="ch-confirm-text">
                          {F.withdrawReturns} <b className="ch-mono">{fmtInt(wReturned)}</b>{' '}
                          {F.withdrawToCash} <b className="ch-mono">{fmtInt(wForfeit)}</b>{' '}
                          {F.withdrawForfeit}
                        </span>
                        <div className="ch-confirm-actions">
                          <button
                            type="button"
                            className="ch-ghost"
                            onClick={() => setWConfirm(false)}
                          >
                            {F.cancel}
                          </button>
                          <button
                            type="button"
                            className="ch-confirm-go"
                            onClick={onWithdrawConfirm}
                            aria-label={F.confirmWithdrawal}
                          >
                            {F.confirmWithdrawal}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Right: the relationship tier (stretched to the Reserve card's height) */}
                <section className="ch-status">
                  <div className="ch-eyebrow ch-eyebrow--dark">{F.accountStatus}</div>
                  <div className="ch-status-tier">{tierLabel}</div>
                  <div className="ch-status-perk">
                    {contractsInForce} {F.of} {maxTier} {F.contractsInForce}
                  </div>
                  <div className="ch-progress">
                    <div className="ch-progress-head">
                      <span>
                        {tier >= maxTier
                          ? F.maxTier
                          : `${progressPct.toFixed(1)}% ${F.toTier} ${nextTierRoman}`}
                      </span>
                      {tier < maxTier && <span className="ch-mono">{nextThresholdStr}</span>}
                    </div>
                    <div className="ch-progress-track">
                      <div
                        className="ch-progress-fill"
                        style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
                      />
                    </div>
                  </div>
                  <div className="ch-status-row">
                    <span>{F.accountAge}</span>
                    <span className="ch-mono">{accountAgeStr ?? F.notOpened}</span>
                  </div>
                  <p className="ch-status-body">{F.tierBody}</p>
                </section>
              </div>

              <section className="ch-card ch-activity">
                <div className="ch-card-title ch-activity-title">{F.recentActivity}</div>
                {ledger.length === 0 ? (
                  <p className="ch-activity-empty">{F.noActivity}</p>
                ) : (
                  <div className="ch-activity-list">
                    {ledger.slice(0, 4).map((r) => (
                      <div className="ch-activity-row" key={r.key}>
                        <div className="ch-activity-desc">
                          <div className="ch-activity-name">{r.desc}</div>
                          <div className="ch-activity-sub">{r.sub}</div>
                        </div>
                        {r.amount !== undefined && (
                          <span className={'ch-activity-amt ch-activity-amt--' + r.kind}>
                            {r.amount > 0 ? '+' : '−'}
                            {maskStr(fmtInt(Math.abs(r.amount)))}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="ch-screen">
              <div className="ch-contracts-intro">
                <p className="ch-body-text ch-contracts-blurb">{F.contractsIntro}</p>
                <div className="ch-contracts-cash">
                  {F.reserveBalance} {'·'} {tierLabel}
                  <br />
                  <span className="ch-mono ch-contracts-cash-val">
                    {maskStr(balanceStr)} {gold}
                  </span>
                </div>
              </div>

              {tiers.map((t) => (
                <section className="ch-tier" key={t.tier} aria-label={`${F.tierHeading} ${t.tier}`}>
                  <div className="ch-tier-head">
                    <div className="ch-tier-titles">
                      <span className="ch-tier-name">
                        {F.tierHeading} {ROMAN[t.tier] ?? t.tier}
                      </span>
                      <span className="ch-tier-sub">
                        {t.thresholdStr} {F.inReserve}
                      </span>
                    </div>
                    <span className={'ch-tier-pill' + (t.held ? ' ch-tier-pill--held' : '')}>
                      {t.held ? F.tierHeld : F.tierNotHeld}
                    </span>
                  </div>
                  <div className="ch-terms">
                    {t.contracts.map((c) => (
                      <div className={'ch-term ch-term--' + c.state} key={c.id}>
                        <div className="ch-term-head">
                          <span className="ch-term-title">{c.title}</span>
                          {c.state === 'active' && (
                            <span className="ch-term-badge">{F.active}</span>
                          )}
                        </div>
                        <p className="ch-term-effect">{c.effect}</p>
                        {c.live !== undefined && <div className="ch-term-live">{c.live}</div>}
                        <div className="ch-term-foot">
                          <div className="ch-term-meta">{contractMeta(c, t)}</div>
                          {c.state === 'available' &&
                            (confirmId === c.id ? (
                              <div className="ch-term-actions">
                                <button
                                  type="button"
                                  className="ch-sign ch-sign--confirm"
                                  onClick={() => choose(c)}
                                  aria-label={`${F.confirm} ${c.title}`}
                                >
                                  {F.confirm} {'·'} {F.noFee}
                                </button>
                                <button
                                  type="button"
                                  className="ch-ghost"
                                  onClick={() => setConfirmId(null)}
                                >
                                  {F.cancel}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="ch-sign"
                                onClick={() => setConfirmId(c.id)}
                                aria-label={`${F.choose} ${c.title}`}
                              >
                                {F.choose}
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
