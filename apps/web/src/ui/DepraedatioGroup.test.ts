/**
 * Render smoke tests for the reworked Depraedatio menu (Depraedatio gold rework): the Thesaurus
 * tab (Mutuum + the hoard, locked at a fresh start), the Syngraphae tab (the twelve-contract
 * tree in three branch columns), and Vitium Compositum as the Living Grimoire of rites with the
 * Panvitium teaser. These pin the wiring — the tab bar and the per-tab surfaces mounting against
 * live store state. The Faeneratio/Syngraphae math and the store mutators are covered by their
 * own suites.
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

describe('DepraedatioGroup — Thesaurus / Syngraphae / Compositum', () => {
  it('renders the three tabs and the locked loan book at a fresh start', () => {
    render();
    const tabs = Array.from(container!.querySelectorAll('.dep-tab')).map((t) =>
      (t.textContent ?? '').trim(),
    );
    expect(tabs).toContain('Thesaurus');
    expect(tabs).toContain('Syngraphae');
    expect(tabs).toContain('Vitium Compositum');
    // Fresh start: Avaritia is level 0, so the surface shows the locked-broker flavour.
    expect(container!.textContent ?? '').toContain(strings.faeneratio.mutuumLocked);
  });

  it('shows the hoard, take readouts and deposit/withdraw controls once Avaritia I opens it', () => {
    const s0 = store().state as GameState;
    useGameStore.setState({
      state: {
        ...s0,
        devotion: { ...s0.devotion, avaritia: bn(180) },
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
    // Fresh start: every node is gated on Avaritia — nothing is signable.
    const signButtons = Array.from(container!.querySelectorAll<HTMLButtonElement>('button')).filter(
      (b) => (b.getAttribute('aria-label') ?? '').startsWith(strings.faeneratio.sign),
    );
    expect(signButtons).toHaveLength(0);
  });

  it('switches to Compositum and shows rites plus the sealed Panvitium gate', () => {
    render();
    clickTab('Vitium Compositum');
    expect(container!.querySelectorAll('.dep-rite').length).toBeGreaterThan(0);
    // Panvitium is sealed until every Sin reaches Level III.
    expect(container!.textContent ?? '').toContain('Requires every Sin at Level III');
  });
});
