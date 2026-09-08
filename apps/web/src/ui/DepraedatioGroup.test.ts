/**
 * Render smoke tests for the redesigned Depraedatio menu, the "Counting House" private-bank account
 * (Claude Design). The old grimoire Thesaurus / Syngraphae tabs are retired: the panel is now a
 * sidebar nav (Portfolio + Contracts) over the mundane banking surfaces. These pin the wiring, the
 * nav switching the main view and the per-screen surfaces mounting against live store state (the
 * Reserve Account + Loan Book on Portfolio, the twelve-node contract tree on Contracts). The
 * Faeneratio / Syngraphae math and the store mutators are covered by their own suites.
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
    expect(text).toContain(F.loanBook); // "Loan Book"
  });

  it('shows the reserve balance, take readouts and deposit/withdraw controls', () => {
    const s0 = store().state as GameState;
    useGameStore.setState({
      state: {
        ...s0,
        lifetime: { ...s0.lifetime, gold: bn(1000), hoard: bn(250), reprobates: 10 },
      },
    });
    render();
    const F = strings.faeneratio;
    const text = container!.textContent ?? '';
    expect(text).toContain(F.reserveAccount);
    expect(text).toContain(F.loanBook);
    expect(text).toContain(F.activeDebtors); // the loan book's debtor figure label

    const deposit = container!.querySelector<HTMLButtonElement>(
      `button[aria-label="${F.deposit}"]`,
    );
    const withdraw = container!.querySelector<HTMLButtonElement>(
      `button[aria-label="${F.withdraw}"]`,
    );
    expect(deposit).not.toBeNull();
    expect(withdraw).not.toBeNull();
  });

  it('switches to Contracts and shows the twelve contracts in three branch columns', () => {
    render();
    const F = strings.faeneratio;
    clickNav(F.contracts);
    const text = container!.textContent ?? '';
    // Branch display names (Yield / Origination / Custody).
    expect(text).toContain(F.branches.usura);
    expect(text).toContain(F.branches.faeneratio);
    expect(text).toContain(F.branches.custodia);
    // The three named contracts (Compounding / Escheat / Retained Floor).
    expect(text).toContain(F.nodeNames['usura-4']);
    expect(text).toContain(F.nodeNames['faeneratio-2']);
    expect(text).toContain(F.nodeNames['custodia-4']);
    // The gating rebalance opens each branch's first node (gate 0) from the start: three signable
    // nodes (their buttons disabled while unaffordable), the rest gated on Avaritia levels.
    const signButtons = Array.from(container!.querySelectorAll<HTMLButtonElement>('button')).filter(
      (b) => (b.getAttribute('aria-label') ?? '').startsWith(F.sign),
    );
    expect(signButtons).toHaveLength(3);
  });
});
