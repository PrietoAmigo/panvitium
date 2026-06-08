import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createInitialState, addReprobates, type Acolyte, type GameState } from '@panvitium/sim';
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
    expect(container!.textContent).toContain('Reprobates');
  });
});

/** Seed arbitrary lifetime fields (invocations) for the Invocations tab tests. */
function seedLifetime(over: Partial<GameState['lifetime']>): void {
  const base = createInitialState('seed', 0);
  const state: GameState = { ...base, lifetime: { ...base.lifetime, ...over } };
  useGameStore.setState({ state });
}

describe('AnalyticsGroup — Invocations tab', () => {
  it('shows the empty state when nothing is bound', () => {
    seed([]);
    render();
    clickTab('Invocations');
    expect(container!.textContent).toContain('No invocations are bound');
  });

  it('lists a passive invocation with its count and a live quantified total effect', () => {
    seedLifetime({ invocations: { fama: 2 } });
    render();
    clickTab('Invocations');
    const text = container!.textContent ?? '';
    expect(text).toContain('Fama');
    expect(text).toContain('\u00D72'); // number bound
    expect(text).toContain('influence gain'); // the effect label
    expect(/[+\-\u2212]\d+%/.test(text)).toBe(true); // a computed magnitude, not a static phrase
    expect(text).not.toContain('every'); // passive ⇒ no action/cadence
  });

  it('lists a runner with its expected per-cycle outcome (mean) and cadence — no bars/dropdown', () => {
    const base = createInitialState('seed', 0);
    const withReps = addReprobates(base, 200);
    const state: GameState = {
      ...withReps,
      lifetime: { ...withReps.lifetime, invocations: { imp: 2 } },
    };
    useGameStore.setState({ state });
    render();
    clickTab('Invocations');
    const text = container!.textContent ?? '';
    expect(text).toContain('Imp');
    expect(text).toContain('\u00D72'); // number bound
    expect(text).toContain('Caedis'); // the action
    // The expected outcome, not a qualitative phrase: forced-Good Caedis culls 1 / mints 1 per cycle.
    expect(text).toContain('soul');
    expect(text).toContain('reprobate');
    expect(/[+\u2212]\d/.test(text)).toBe(true); // a signed expected magnitude
    expect(text).not.toContain('culls reprobates'); // qualitative phrase replaced
    expect(text).toContain('every'); // cadence
    // The performance change: no expandable head button, no per-copy channel rows/bars.
    expect(container!.querySelectorAll('.analytics-inv-channel').length).toBe(0);
    expect(container!.querySelectorAll('.analytics-invocations button').length).toBe(0);
  });
});
