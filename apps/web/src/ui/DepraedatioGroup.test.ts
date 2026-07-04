/**
 * Render smoke tests for the reworked Depraedatio menu: the Thesaurus tab (Mutuum + the hoard,
 * open from a fresh start since the gating rebalance) and the Syngraphae tab (the twelve-contract
 * tree in three branch columns). Vitium Compositum retired from this panel with ADR-031 —
 * Panvitium lives on the Suasio scroll now. These pin the wiring — the tab bar and the per-tab
 * surfaces mounting against live store state. The Faeneratio/Syngraphae math and the store
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

function clickTab(label: string): void {
  const btn = Array.from(container!.querySelectorAll<HTMLButtonElement>('.dep-tab')).find(
    (b) => (b.textContent ?? '').trim() === label,
  );
  if (!btn) throw new Error(`no tab "${label}"`);
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

describe('DepraedatioGroup — Thesaurus / Syngraphae', () => {
  it('renders the two tabs; the loan book is open from a fresh start (no Avaritia gate)', () => {
    render();
    const tabs = Array.from(container!.querySelectorAll('.dep-tab')).map((t) =>
      (t.textContent ?? '').trim(),
    );
    expect(tabs).toEqual(['Thesaurus', 'Syngraphae']);
    expect(container!.textContent ?? '').toContain(strings.faeneratio.mutuum);
    expect(container!.textContent ?? '').toContain('debtors');
  });

  it('shows the hoard, take readouts and deposit/withdraw controls', () => {
    const s0 = store().state as GameState;
    useGameStore.setState({
      state: {
        ...s0,
        lifetime: { ...s0.lifetime, gold: bn(1000), hoard: bn(250), reprobates: 10 },
      },
    });
    render();
    const text = container!.textContent ?? '';
    expect(text).toContain(strings.faeneratio.mutuum);
    expect(text).toContain(strings.faeneratio.thesaurus);
    expect(text).toContain('debtors');
    const deposit = container!.querySelector<HTMLButtonElement>(
      `button[aria-label="${strings.faeneratio.deposit}"]`,
    );
    const withdraw = container!.querySelector<HTMLButtonElement>(
      `button[aria-label="${strings.faeneratio.withdraw}"]`,
    );
    expect(deposit).not.toBeNull();
    expect(withdraw).not.toBeNull();
  });

  it('switches to Syngraphae and shows the twelve contracts in three branch columns', () => {
    render();
    clickTab('Syngraphae');
    const text = container!.textContent ?? '';
    expect(text).toContain(strings.faeneratio.branches.usura);
    expect(text).toContain(strings.faeneratio.branches.faeneratio);
    expect(text).toContain(strings.faeneratio.branches.custodia);
    expect(text).toContain('Anatocismus');
    expect(text).toContain('Escheat');
    expect(text).toContain('Peculium');
    // The gating rebalance opened each branch's first node from the start — three Sign buttons
    // (disabled while unaffordable), the rest still gated on Avaritia levels.
    const signButtons = Array.from(container!.querySelectorAll<HTMLButtonElement>('button')).filter(
      (b) => (b.getAttribute('aria-label') ?? '').startsWith(strings.faeneratio.sign),
    );
    expect(signButtons).toHaveLength(3);
  });
});
