import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createInitialState, type Acolyte, type GameState } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { AnalyticsGroup } from './Analytics.js';

/**
 * Guards the Analytics panel against the "Maximum update depth exceeded" loop that a selector
 * returning a fresh array each render would cause (useSyncExternalStore re-reads the snapshot after
 * every render). Rendering the Acolytes tab with such a selector throws during `act`, so these
 * render tests fail loudly if the bug returns.
 */
function seed(acolytes: Acolyte[]): void {
  const base = createInitialState('seed', 0);
  const state: GameState = { ...base, lifetime: { ...base.lifetime, acolytes } };
  useGameStore.setState({ state });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
});

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(AnalyticsGroup)));
}

function clickTab(label: string): void {
  const btn = Array.from(container!.querySelectorAll('button')).find(
    (b) => b.textContent === label,
  );
  if (!btn) throw new Error(`tab not found: ${label}`);
  act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('AnalyticsGroup', () => {
  it('renders the Acolytes tab with no acolytes without looping', () => {
    seed([]);
    render();
    clickTab('Acolytes');
    expect(container!.textContent).toContain('No acolytes');
  });

  it('renders a row per acolyte with its current action', () => {
    seed([
      { id: 1, assignedAction: 'caedis', remainingSeconds: 30 },
      { id: 2, assignedAction: null, remainingSeconds: null },
    ]);
    render();
    clickTab('Acolytes');
    expect(container!.textContent).toContain('Acolyte 1');
    expect(container!.textContent).toContain('Acolyte 2');
  });

  it('defaults to the Main tab and can switch to Resources and Reprobates', () => {
    seed([]);
    render();
    expect(container!.textContent).toContain('vigil kept'); // Main is the default tab
    clickTab('Resources');
    expect(container!.textContent).toContain('Souls');
    clickTab('Reprobates');
    expect(container!.textContent).toContain('Unconverted');
  });
});
