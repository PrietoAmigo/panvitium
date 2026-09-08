import { useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';

/**
 * Depraedatio "Counting House" account (Claude Design redesign). A self-framed full-surface program
 * body rendered full-bleed inside the PC window (see FULLBLEED in PcWindow): the Faeneratio gold loop
 * presented as a calm, mundane private-bank / wealth-management dashboard. It is deliberately
 * non-thematic: no occult register, just money. Two left-nav sections (Portfolio and Contracts) over
 * one managed account; the Latin surfaces are relabelled in plain banking terms (Reserve, Loan Book,
 * Interest, Tier, Contracts; Yield/Origination/Custody branches), while the underlying sim ids are
 * unchanged (see the wrapper in ui/panels.tsx which feeds this the real store figures + actions).
 *
 * Purely presentational: the wrapper computes every figure from the sim and passes pre-formatted
 * strings for the money surfaces (game-consistent `formatBigNum`), plus raw numbers where the panel
 * does its own interaction math (deposit/withdraw validation, the recovery preview, the trailing
 * income figure). This component owns only UI-only state (ADR-003): the active view, the privacy
 * mask, the period select, the deposit/withdraw inputs and their confirm steps, and a session-local
 * "recent activity" ledger of the player's own moves (non-persisted, empty on open).
 */

/** One contract node's presentation state, computed by the wrapper. */
export type DepNodeState = 'signed' | 'available' | 'prior' | 'locked';

export interface DepNodeView {
  id: string;
  /** Display title, e.g. "Yield II" or "Compounding". */
  title: string;
  /** Effect line (numbers baked in). */
  effect: string;
  state: DepNodeState;
  /** One-time signing fee in gold. */
  fee: number;
  /** Pre-formatted fee, e.g. "500". */
  feeStr: string;
  /** cash >= fee (only meaningful when `state === 'available'`). */
  affordable: boolean;
  /** The prior node's title, for the "Sign {prior} first" hint. */
  priorTitle: string;
  /** The Avaritia level the node requires (node.gate), for the "Requires Avaritia N" hint. */
  gate: number;
}

export interface DepBranchView {
  /** Internal branch id (usura | faeneratio | custodia) — display name comes from strings. */
  id: string;
  nodes: readonly DepNodeView[];
}

export interface DepraedatioAccountProps {
  // ── Pre-formatted money surfaces (unmasked; this component applies the privacy mask) ──
  balanceStr: string;
  cashStr: string;
  interestStr: string;
  loanBookStr: string;
  incomeStr: string;
  debtorsStr: string;
  recoveryPct: string;
  nextThresholdStr: string;

  // ── Raw numbers for the panel's own interaction math ──
  /** Available cash (floored gold), for deposit validation + "All cash". */
  cash: number;
  /** Reserve balance (floored hoard), for withdraw validation. */
  balance: number;
  /** Withdrawal recovery fraction (0..1), for the returned/forfeited preview. */
  recovery: number;
  /** Total income per second (interest + loan book), for the trailing figure. */
  incomePerSecond: number;

  // ── Derived status ──
  tier: number;
  nextTierRoman: string;
  /** Foedus progress toward the next tier, 0..100. */
  progressPct: number;
  /** The effective yield multiplier (mods.fenusRateMul) for the "Yield x N" pill. */
  yieldMul: number;

  branches: readonly DepBranchView[];

  onDeposit: (amount: number) => void;
  onWithdraw: (amount: number) => void;
  onSign: (id: string) => void;

  /** Accent colour (curated: Pine #1E4638, Navy #1B3A5B, Bordeaux #5E2233). Default Pine. */
  accent?: string;
  /** Show the decorative balance sparkline. Default true. */
  showSparkline?: boolean;
  /** A transient store notice (e.g. a Morpheus refusal), shown as an unobtrusive banner. */
  notice?: string | null;
}

type View = 'portfolio' | 'contracts';
type Period = '24h' | '7d' | '30d';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'] as const;
const ACCENT_LIGHT = '#7CA98F';

/** Decorative 24-point balance series (diegetic chrome, not real history) for the sparkline. */
const SPARK = [
  2010, 2035, 2028, 2062, 2090, 2075, 2110, 2150, 2138, 2172, 2205, 2190, 2240, 2268, 2255, 2300,
  2330, 2318, 2360, 2402, 2388, 2430, 2465, 2486,
] as const;

/** Integer with thousands separators; large values fall back to short-scale suffixes. */
function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  return Math.round(n).toLocaleString('en-US');
}

/** Compact K/M/B/T… for the trailing-income flavour figure and tier thresholds (design's `compact`). */
function compact(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  const suf = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  if (a < 1000) return String(Math.round(n));
  const g = Math.min(Math.floor(Math.log10(a) / 3), suf.length - 1);
  const scaled = n / Math.pow(10, g * 3);
  const dp = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return `${scaled.toFixed(dp)}${suf[g]}`;
}

/** One session-local ledger entry (the player's own move this session; non-persisted). */
interface LedgerRow {
  key: number;
  desc: string;
  sub: string;
  amount: number;
  kind: 'credit' | 'debit';
}

export function DepraedatioAccount(props: DepraedatioAccountProps): ReactElement {
  const {
    balanceStr,
    cashStr,
    interestStr,
    loanBookStr,
    incomeStr,
    debtorsStr,
    recoveryPct,
    nextThresholdStr,
    cash,
    balance,
    recovery,
    incomePerSecond,
    tier,
    nextTierRoman,
    progressPct,
    yieldMul,
    branches,
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
  const [mask, setMask] = useState(false);
  const [period, setPeriod] = useState<Period>('24h');
  const [depText, setDepText] = useState('');
  const [wText, setWText] = useState('');
  const [wConfirm, setWConfirm] = useState(false);
  const [confirmNode, setConfirmNode] = useState<string | null>(null);
  const [ledger, setLedger] = useState<readonly LedgerRow[]>([]);
  const [ledgerSeq, setLedgerSeq] = useState(0);

  // Accent-derived tokens: soft fill + hairline border as 8-digit hex, exposed as CSS variables so
  // the whole surface themes from the one accent knob.
  const accentSoft = accent + '14';
  const accentBorder = accent + '3a';
  const rootVars = {
    '--ch-accent': accent,
    '--ch-accent-light': ACCENT_LIGHT,
    '--ch-accent-soft': accentSoft,
    '--ch-accent-border': accentBorder,
  } as CSSProperties;

  const maskStr = (s: string): string => (mask ? s.replace(/[0-9]/g, '•') : s);

  const tierRoman = ROMAN[tier] ?? '—';
  const perk = `${(tier * 12.5).toFixed(1).replace(/\.0$/, '')}% ${F.rebateSuffix}`;

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

  const signNode = (node: DepNodeView): void => {
    onSign(node.id);
    pushLedger({
      desc: F.ledgerContractFee,
      sub: `${node.title} ${F.ledgerSignedSuffix}`,
      amount: -node.fee,
      kind: 'debit',
    });
    setConfirmNode(null);
  };

  // Trailing "realised income" over the selected period (income/s x seconds), compact-formatted.
  const periodSecs: Record<Period, number> = { '24h': 86400, '7d': 604800, '30d': 2592000 };
  const periodLong: Record<Period, string> = {
    '24h': F.period24hLong,
    '7d': F.period7dLong,
    '30d': F.period30dLong,
  };
  const trailingStr = maskStr(compact(incomePerSecond * periodSecs[period]));

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
            <span className="ch-account-tier-val">
              {F.tier} {tierRoman}
            </span>
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

        <div className="ch-scroll">
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
                    <div className="ch-stat-label">{F.totalIncome}</div>
                    <div className="ch-stat-value">{maskStr(incomeStr)}</div>
                    <div className="ch-stat-caption">{F.perSecond}</div>
                  </div>
                  <div className="ch-stat">
                    <div className="ch-stat-label">{F.interest}</div>
                    <div className="ch-stat-value">{maskStr(interestStr)}</div>
                    <div className="ch-stat-caption">{F.perSecond}</div>
                  </div>
                  <div className="ch-stat">
                    <div className="ch-stat-label">{F.loanBookStat}</div>
                    <div className="ch-stat-value">{maskStr(loanBookStr)}</div>
                    <div className="ch-stat-caption">{F.perSecond}</div>
                  </div>
                </div>

                <div className="ch-balance-foot">
                  <span className="ch-realised">
                    {F.realisedIncome}{' '}
                    <b>
                      {trailingStr} {gold}
                    </b>{' '}
                    {F.over} {periodLong[period]}.
                  </span>
                  <div className="ch-period">
                    <span className="ch-eyebrow">{F.period}</span>
                    <select
                      className="ch-select"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value as Period)}
                      aria-label={F.period}
                    >
                      <option value="24h">{F.period24h}</option>
                      <option value="7d">{F.period7d}</option>
                      <option value="30d">{F.period30d}</option>
                    </select>
                  </div>
                </div>
              </section>

              <div className="ch-columns">
                {/* Left: holdings */}
                <div className="ch-col">
                  {/* Reserve Account */}
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
                          {F.surrenderCharge} {'·'} {recoveryPct} {F.returned}
                        </span>
                      </div>
                      <div className="ch-money-row">
                        <input
                          type="number"
                          min={0}
                          className="ch-input"
                          placeholder="0"
                          value={wText}
                          onChange={(e) => {
                            setWText(e.target.value);
                            setWConfirm(false);
                          }}
                          aria-label={F.withdrawFromReserve}
                        />
                        <button
                          type="button"
                          className="ch-withdraw"
                          disabled={wAmount < 1 || wAmount > balance}
                          onClick={onWithdrawAsk}
                          aria-label={F.withdraw}
                        >
                          {F.withdraw}
                        </button>
                      </div>
                      {wConfirm && (
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

                  {/* Loan Book */}
                  <section className="ch-card ch-loanbook">
                    <div className="ch-card-head">
                      <div>
                        <div className="ch-card-title">{F.loanBook}</div>
                        <div className="ch-card-sub">{F.loanBookSubtitle}</div>
                      </div>
                      <span className="ch-pill ch-pill--performing">{F.performing}</span>
                    </div>
                    <div className="ch-figures">
                      <div>
                        <div className="ch-stat-label">{F.takePerS}</div>
                        <div className="ch-figure ch-figure--pos">{maskStr(loanBookStr)}</div>
                      </div>
                      <div>
                        <div className="ch-stat-label">{F.activeDebtors}</div>
                        <div className="ch-figure">{debtorsStr}</div>
                      </div>
                    </div>
                    <p className="ch-body-text">{F.loanBookBody}</p>
                  </section>
                </div>

                {/* Right: tier + activity */}
                <div className="ch-col">
                  <section className="ch-status">
                    <div className="ch-eyebrow ch-eyebrow--dark">{F.accountStatus}</div>
                    <div className="ch-status-tier">
                      {F.tier} {tierRoman}
                    </div>
                    <div className="ch-status-perk">{perk}</div>
                    <div className="ch-progress">
                      <div className="ch-progress-head">
                        <span>
                          {progressPct.toFixed(1)}% {F.toTier} {nextTierRoman}
                        </span>
                        <span className="ch-mono">{nextThresholdStr}</span>
                      </div>
                      <div className="ch-progress-track">
                        <div
                          className="ch-progress-fill"
                          style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
                        />
                      </div>
                    </div>
                    <p className="ch-status-body">{F.tierBody}</p>
                  </section>

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
                            <span className={'ch-activity-amt ch-activity-amt--' + r.kind}>
                              {r.amount > 0 ? '+' : '−'}
                              {maskStr(fmtInt(Math.abs(r.amount)))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          ) : (
            <div className="ch-screen">
              <div className="ch-contracts-intro">
                <p className="ch-body-text ch-contracts-blurb">{F.contractsIntro}</p>
                <div className="ch-contracts-cash">
                  {F.availableCash}
                  <br />
                  <span className="ch-mono ch-contracts-cash-val">{maskStr(cashStr)}</span>
                </div>
              </div>

              <div className="ch-branches">
                {branches.map((branch) => (
                  <div className="ch-branch" key={branch.id}>
                    <div className="ch-branch-head">
                      <div className="ch-branch-name">{F.branches[branch.id]}</div>
                      <div className="ch-branch-sub">{F.branchSubs[branch.id]}</div>
                    </div>
                    {branch.nodes.map((node) => {
                      const meta =
                        node.state === 'signed'
                          ? `${F.signedMeta} · ${node.feeStr} ${gold} ${F.paid}`
                          : node.state === 'prior'
                            ? `${F.sign} ${node.priorTitle} ${F.signFirst}`
                            : node.state === 'locked'
                              ? `${F.requiresAvaritia} ${ROMAN[node.gate] ?? node.gate}`
                              : `${node.feeStr} ${gold} · ${F.eligible}`;
                      return (
                        <div className={'ch-node ch-node--' + node.state} key={node.id}>
                          <div className="ch-node-head">
                            <span className="ch-node-title">{node.title}</span>
                            {node.state === 'signed' && (
                              <span className="ch-node-badge">{F.active}</span>
                            )}
                          </div>
                          <p className="ch-node-effect">{node.effect}</p>
                          <div className="ch-node-meta">{meta}</div>
                          {node.state === 'available' &&
                            (confirmNode === node.id ? (
                              <div className="ch-node-actions">
                                <button
                                  type="button"
                                  className="ch-sign ch-sign--confirm"
                                  onClick={() => signNode(node)}
                                  aria-label={`${F.confirm} ${node.title}`}
                                >
                                  {F.confirm} {'·'} {node.feeStr}
                                </button>
                                <button
                                  type="button"
                                  className="ch-ghost"
                                  onClick={() => setConfirmNode(null)}
                                >
                                  {F.cancel}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={
                                  'ch-sign' + (node.affordable ? '' : ' ch-sign--disabled')
                                }
                                disabled={!node.affordable}
                                onClick={() => setConfirmNode(node.id)}
                                aria-label={`${F.sign} ${node.title}`}
                              >
                                {node.affordable
                                  ? `${F.sign} · ${node.feeStr} ${gold}`
                                  : F.insufficientCash}
                              </button>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
