/**
 * Render smoke tests for the Suasio scroll's outcome ledger (the "logs at the foot" addition, mirroring
 * Decimatio's Index Opervm). The scroll's rites / sigils / dismissal are covered by SuasioPanel.test.ts;
 * this pins the ledger wiring the wrapper introduces: the heading + empty state before anything resolves,
 * and a real Suasio outcome surfacing as a tier chip beside its soul yield, filtered to this program's
 * rites (a Decimatio outcome in the same log must not leak in).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';
import { SuasioScroll } from './panels.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(SuasioScroll, { onClose: () => {} })));
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ state: null, ready: false, log: [] });
  store().init();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('SuasioScroll — outcome ledger', () => {
  it('shows the ledger heading and the empty-state line before any temptation resolves', () => {
    render();
    expect(container!.querySelector('.suasio-ledger-head')?.textContent).toBe(
      strings.opera.suasioLedgerHeading,
    );
    expect(container!.querySelector('.suasio-ledger-empty')?.textContent).toBe(
      strings.opera.suasioEmptyLedger,
    );
  });

  it('surfaces a resolved Suasio outcome as a tier chip beside its soul yield, filtered to its rites', () => {
    useGameStore.setState({
      log: [
        { actionId: 'suggestion', tier: 'good', soulsDelta: 5, reprobateDelta: 0, goldDelta: 0 },
        // A Decimatio rite in the same log must NOT leak into the Suasio ledger.
        { actionId: 'caedes', tier: 'stellar', soulsDelta: 9, reprobateDelta: -9, goldDelta: 0 },
      ],
    });
    render();
    const rows = Array.from(container!.querySelectorAll('.suasio-ledger-row'));
    expect(rows.length).toBe(1); // only the Suasio outcome
    expect(rows[0]!.querySelector('.suasio-ledger-tier')?.textContent).toBe(strings.tiers.good);
    const text = rows[0]!.querySelector('.suasio-ledger-text')?.textContent ?? '';
    expect(text).toContain(strings.opera.suggestion); // the rite name
    expect(text).toContain('+5'); // the soul yield
    expect(text).toContain(strings.resources.souls);
  });
});
