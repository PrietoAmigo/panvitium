/**
 * Render smoke tests for the Depraedatio menu, the "Counting House" private-bank account (Claude
 * Design). The panel is a sidebar nav (Portfolio + Contracts) over the mundane banking surfaces.
 * These pin the wiring, the nav switching the main view and the per-screen surfaces mounting against
 * live store state (the four KPIs, the realised-income line since inception, the Reserve Account and
 * Account status on Portfolio; the three relationship-tier rows of contracts on Contracts), and that
 * the retired loan book and the period selector are gone. The reserve / contract math and the store
 * mutators are covered by their own suites.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { bn, type GameState } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';
import { DepraedatioGroup } from './panels.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(DepraedatioGroup)));
}

/** Click a sidebar nav button by its label (the button text also carries a leading glyph). */
function clickNav(label: string): void {
  const btn = Array.from(container!.querySelectorAll<HTMLButtonElement>('.ch-navbtn')).find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (!btn) throw new Error(`no nav "${label}"`);
  act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ state: null, ready: false });
  store().init();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('DepraedatioGroup — Counting House account', () => {
  it('renders the sidebar brand, the two live nav items, and the Portfolio surfaces', () => {
    render();
    const F = strings.faeneratio;
    const navLabels = Array.from(container!.querySelectorAll('.ch-navbtn')).map((b) =>
      (b.textContent ?? '').trim(),
    );
    expect(navLabels.some((l) => l.includes(F.portfolio))).toBe(true);
    expect(navLabels.some((l) => l.includes(F.contracts))).toBe(true);

    const text = container!.textContent ?? '';
    expect(text).toContain(F.brand); // "COUNTING HOUSE"
    expect(text).toContain(F.accountName); // "Depraedatio"
    expect(text).toContain(F.reserveAccount); // "Reserve Account"
    expect(text).toContain(F.accountStatus);
    // The loan book and its KPIs are retired.
    expect(text).not.toContain('Loan Book');
    expect(text).not.toContain('Active debtors');
    expect(container!.querySelector('.ch-loanbook')).toBeNull();
  });

  it('shows four aligned KPIs and the realised income since account inception (no period select)', () => {
    const s0 = store().state as GameState;
    useGameStore.setState({
      state: {
        ...s0,
        lifetime: { ...s0.lifetime, gold: bn(1000), hoard: bn(250), accountIncome: bn(1234) },
      },
    });
    render();
    const F = strings.faeneratio;
    const labels = Array.from(container!.querySelectorAll('.ch-stat-label')).map(
      (l) => l.textContent,
    );
    expect(labels.slice(0, 4)).toEqual([
      F.availableCash,
      F.income,
      F.interestRate,
      F.surrenderChargeStat,
    ]);
    expect(container!.querySelectorAll('.ch-stats .ch-stat')).toHaveLength(4);
    const realised = container!.querySelector('.ch-realised')?.textContent ?? '';
    expect(realised).toContain(F.realisedIncome);
    expect(realised).toContain('1,234');
    expect(realised).toContain(F.sinceInception);
    expect(container!.querySelector('select')).toBeNull(); // the period dropdown is gone
    // The base surrender charge is 15%, 85% returned.
    expect(container!.textContent).toContain('15%');
    expect(container!.textContent).toContain('85%');

    const deposit = container!.querySelector<HTMLButtonElement>(
      `button[aria-label="${F.deposit}"]`,
    );
    const withdraw = container!.querySelector<HTMLButtonElement>(
      `button[aria-label="${F.withdraw}"]`,
    );
    expect(deposit).not.toBeNull();
    expect(withdraw).not.toBeNull();
  });

  it('switches to Contracts and shows three tiers of three contracts, one choice per tier', () => {
    const s0 = store().state as GameState;
    // Tier II held (10,000 in reserve); Interest rate already chosen at Tier I.
    useGameStore.setState({
      state: {
        ...s0,
        lifetime: { ...s0.lifetime, hoard: bn(10_000), syngraphae: ['interest-rate'] },
      },
    });
    render();
    const F = strings.faeneratio;
    clickNav(F.contracts);
    expect(container!.querySelectorAll('.ch-tier')).toHaveLength(3);
    expect(container!.querySelectorAll('.ch-term')).toHaveLength(9);
    const text = container!.textContent ?? '';
    for (const name of Object.values(F.contractNames)) expect(text).toContain(name);
    // Tier I: one active, two foreclosed. Tier II: three available. Tier III: three locked.
    expect(container!.querySelectorAll('.ch-term--active')).toHaveLength(1);
    expect(container!.querySelectorAll('.ch-term--foreclosed')).toHaveLength(2);
    expect(container!.querySelectorAll('.ch-term--available')).toHaveLength(3);
    expect(container!.querySelectorAll('.ch-term--locked')).toHaveLength(3);
    const chooseButtons = Array.from(
      container!.querySelectorAll<HTMLButtonElement>('button'),
    ).filter((b) => (b.getAttribute('aria-label') ?? '').startsWith(F.choose));
    expect(chooseButtons).toHaveLength(3);
  });

  it('choosing is a two-step confirm and costs nothing', () => {
    const s0 = store().state as GameState;
    useGameStore.setState({
      state: { ...s0, lifetime: { ...s0.lifetime, gold: bn(0), hoard: bn(100) } },
    });
    render();
    const F = strings.faeneratio;
    clickNav(F.contracts);
    const choose = container!.querySelector<HTMLButtonElement>(
      `button[aria-label="${F.choose} ${F.contractNames['long-term']}"]`,
    );
    act(() => choose!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const confirm = container!.querySelector<HTMLButtonElement>(
      `button[aria-label="${F.confirm} ${F.contractNames['long-term']}"]`,
    );
    act(() => confirm!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const after = store().state as GameState;
    expect(after.lifetime.syngraphae).toEqual(['long-term']);
    expect(after.lifetime.gold.toNumber()).toBe(0);
  });
});
