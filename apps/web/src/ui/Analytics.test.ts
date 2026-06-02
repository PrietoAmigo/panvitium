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

  it('defaults to the Main tab (resources folded in) and can switch to Reprobates', () => {
    seed([]);
    render();
    // Main now carries the resources, the player action efficiency, and the vigil, in one tab.
    expect(container!.textContent).toContain('Souls');
    expect(container!.textContent).toContain('Player action efficiency');
    expect(container!.textContent).toContain('vigil kept');
    clickTab('Reprobates');
    expect(container!.textContent).toContain('Unconverted');
  });
});

/** Seed arbitrary lifetime fields (invocations, runner timers) for the Invocations tab tests. */
function seedLifetime(over: Partial<GameState['lifetime']>): void {
  const base = createInitialState('seed', 0);
  const state: GameState = { ...base, lifetime: { ...base.lifetime, ...over } };
  useGameStore.setState({ state });
}

/** Click the first button whose text contains `substr` (an invocation row head, not a tab). */
function clickName(substr: string): void {
  const btn = Array.from(container!.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(substr),
  );
  if (!btn) throw new Error(`row not found: ${substr}`);
  act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('AnalyticsGroup — Invocations tab', () => {
  it('shows the empty state when nothing is bound', () => {
    seed([]);
    render();
    clickTab('Invocations');
    expect(container!.textContent).toContain('No invocations are bound');
  });

  it('lists a passive invocation with its count and total effect (no efficiency line)', () => {
    seedLifetime({ invocations: { fama: 2 } });
    render();
    clickTab('Invocations');
    expect(container!.textContent).toContain('Fama');
    expect(container!.textContent).toContain('\u00D72'); // number bound
    expect(container!.textContent).toContain('Raises influence gain');
    expect(container!.textContent).not.toContain('action efficiency'); // passive ⇒ effect, not eff
  });

  it('shows a runner invocation efficiency and expands per-copy bars on name click', () => {
    seedLifetime({
      invocations: { imp: 2 },
      invocationRunners: { imp: 5, 'imp#1': 5 },
    });
    render();
    clickTab('Invocations');
    expect(container!.textContent).toContain('Imp');
    expect(container!.textContent).toContain('action efficiency'); // runner ⇒ channel efficiency
    // Collapsed: no per-copy channel rows yet.
    expect(container!.querySelectorAll('.analytics-inv-channel').length).toBe(0);
    // Click the invocation name to expand; one channel per summoned copy appears.
    clickName('Imp');
    expect(container!.querySelectorAll('.analytics-inv-channel').length).toBe(2);
    expect(container!.textContent).toContain('#1');
    expect(container!.textContent).toContain('#2');
  });
});
