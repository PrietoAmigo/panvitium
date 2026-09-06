import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createInitialState, addReprobates, type Acolyte, type GameState } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { offlineProjection } from '../game/session.js';
import { AnalyticsGroup } from './Analytics.js';

// The Offline tab's projection is the one expensive call (a full resumeGame catch-up over the window).
// Wrap it so a test can count how often the tab recomputes it; it calls through to the real
// implementation, so every rendered number stays correct.
vi.mock('../game/session.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../game/session.js')>();
  return { ...actual, offlineProjection: vi.fn(actual.offlineProjection) };
});

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
  it('renders the Actions tab with no acolytes without looping', () => {
    seed([]);
    render();
    clickTab('Actions');
    expect(container!.textContent).toContain('No acolytes');
  });

  it('renders a row per acolyte with its current action on the Actions tab', () => {
    seed([
      { id: 1, assignedAction: 'caedes', remainingSeconds: 30 },
      { id: 2, assignedAction: null, remainingSeconds: null },
    ]);
    render();
    clickTab('Actions');
    expect(container!.textContent).toContain('Acolyte 1');
    expect(container!.textContent).toContain('Acolyte 2');
  });

  it('defaults to the Main tab with resources and reprobates folded in', () => {
    seed([]);
    render();
    // Main now carries the resources and the reprobate readouts. Souls moved to the Status Quo Ledger,
    // so it must NOT appear here; the player action + efficiency moved to the Actions tab, so they must
    // NOT appear here either (no overlapping information). There is no longer a separate Reprobates tab
    // or a vigil line.
    expect(container!.textContent).toContain('Influence');
    expect(container!.textContent).toContain('Reprobates');
    expect(container!.textContent).not.toContain('Souls');
    expect(container!.textContent).not.toContain('Player action efficiency');
    expect(container!.textContent).not.toContain('vigil kept');
    const tabLabels = Array.from(container!.querySelectorAll('button')).map((b) => b.textContent);
    expect(tabLabels).toEqual(['Main', 'Actions', 'Offline']);
  });

  it('shows the player efficiency on the Actions tab, not the Main tab', () => {
    seed([]);
    render();
    clickTab('Actions');
    expect(container!.textContent).toContain('Player action efficiency');
  });

  it('breaks resources into generation / upkeep / net columns on the Main tab', () => {
    seed([]);
    render();
    const text = container!.textContent ?? '';
    expect(text).toContain('Generation');
    expect(text).toContain('Upkeep');
    expect(text).toContain('Net');
  });

  it('shows an Offline tab that summarises projected offline generation (souls included)', () => {
    seed([]);
    render();
    clickTab('Offline');
    const text = container!.textContent ?? '';
    // The projection lists every offline-generated resource, including Souls (which the Main tab omits).
    expect(text).toContain('Gold');
    expect(text).toContain('Influence');
    expect(text).toContain('Reprobates');
    expect(text).toContain('Souls');
    // The same generation / upkeep / net breakdown as the Main tab, over the chosen window.
    expect(text).toContain('Generation');
    expect(text).toContain('Upkeep');
    expect(text).toContain('Net');
    expect(text.toLowerCase()).toContain('hour'); // the window checks (1 hour / 8 hours / 24 hours)
  });

  it('offers 1h / 8h / 24h offline window checks and lists the active offline effects', () => {
    seed([]);
    render();
    clickTab('Offline');
    const labels = Array.from(container!.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toContain('1 hour');
    expect(labels).toContain('8 hours');
    expect(labels).toContain('24 hours');
    // The reduced offline base rate is always in effect, so the active-effects list is never empty.
    expect(container!.textContent).toContain('Active offline effects');
    expect(container!.textContent).toContain('Offline base rate');
  });

  it('switches the projected offline window when a different check is chosen', () => {
    seed([]);
    render();
    clickTab('Offline');
    const btn = (label: string): HTMLButtonElement =>
      Array.from(container!.querySelectorAll('button')).find(
        (b) => b.textContent === label,
      ) as HTMLButtonElement;
    expect(btn('1 hour').getAttribute('aria-pressed')).toBe('true'); // default window
    act(() => btn('8 hours').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(btn('8 hours').getAttribute('aria-pressed')).toBe('true');
    expect(btn('1 hour').getAttribute('aria-pressed')).toBe('false');
  });

  it('memoizes the offline projection instead of re-running it on every 10 Hz tick', () => {
    const projMock = vi.mocked(offlineProjection);
    projMock.mockClear();
    seed([]); // createInitialState('seed', 0) => lastTickAt 0, so the refresh bucket starts at 0
    render();
    clickTab('Offline');
    const afterOpen = projMock.mock.calls.length;
    expect(afterOpen).toBeGreaterThan(0); // computed once on mount

    // Five 10 Hz ticks (each replaces `state` with a new reference and advances the clock 100 ms) that
    // stay inside one refresh bucket. Without the memo this re-ran the whole catch-up on every render.
    for (let i = 0; i < 5; i++) {
      act(() => {
        const cur = useGameStore.getState().state!;
        useGameStore.setState({ state: { ...cur, lastTickAt: cur.lastTickAt + 100 } });
      });
    }
    expect(projMock.mock.calls.length).toBe(afterOpen); // no recompute within the bucket

    // Crossing the refresh bucket (>= 2 s of game time) recomputes exactly once.
    act(() => {
      const cur = useGameStore.getState().state!;
      useGameStore.setState({ state: { ...cur, lastTickAt: cur.lastTickAt + 2000 } });
    });
    expect(projMock.mock.calls.length).toBe(afterOpen + 1);
  });
});

/** Seed arbitrary lifetime fields (invocations) for the Invocations tab tests. */
function seedLifetime(over: Partial<GameState['lifetime']>): void {
  const base = createInitialState('seed', 0);
  const state: GameState = { ...base, lifetime: { ...base.lifetime, ...over } };
  useGameStore.setState({ state });
}

describe('AnalyticsGroup — Actions tab invocations', () => {
  it('shows the empty state when nothing is bound', () => {
    seed([]);
    render();
    clickTab('Actions');
    expect(container!.textContent).toContain('No invocations are bound');
  });

  it('lists a passive invocation (no copy count) with a live quantified total effect', () => {
    seedLifetime({ invocations: { fama: 2 } });
    render();
    clickTab('Actions');
    const text = container!.textContent ?? '';
    expect(text).toContain('Fama');
    expect(text).not.toContain('\u00D72'); // stacked copies are not advertised
    expect(text).toContain('influence gain'); // the effect label
    expect(/[+\-\u2212]\d+%/.test(text)).toBe(true); // a computed magnitude, not a static phrase
    // Passive ⇒ no progress bar (those belong to runner channels).
    expect(
      container!.querySelectorAll('.analytics-invocation--passive .analytics-bar').length,
    ).toBe(0);
  });

  it('lists a runner with its efficiency, action, and a progress bar — no dropdown/buttons', () => {
    const base = createInitialState('seed', 0);
    const withReps = addReprobates(base, 200);
    const state: GameState = {
      ...withReps,
      lifetime: { ...withReps.lifetime, invocations: { imp: 2 } },
    };
    useGameStore.setState({ state });
    render();
    clickTab('Actions');
    const text = container!.textContent ?? '';
    expect(text).toContain('Imp');
    expect(text).not.toContain('\u00D72'); // stacked copies are not advertised (the only \u00D7 is the eff chip)
    expect(text).toContain('Caedes'); // the action it runs
    expect(/\d\u00d7|\u00d7\d/.test(text)).toBe(true); // the efficiency chip (e.g. "0.05\u00d7")
    // A runner row carries a progress bar (the same shape the player/acolyte rows use).
    expect(container!.querySelectorAll('.analytics-invocation .analytics-bar').length).toBe(1);
    // Still no expandable head button or per-copy channel rows.
    expect(container!.querySelectorAll('.analytics-inv-channel').length).toBe(0);
    expect(container!.querySelectorAll('.analytics-invocations button').length).toBe(0);
  });

  it('orders bound invocations by required Sin level (desc) then name (asc)', () => {
    // imp (Ira L1), harpy (Ira L2), midas (Avaritia L3), doppelgaenger (Superbia L3): both L3 sort
    // first, alphabetical within the tier (Doppelg\u00e4nger before Midas), then Harpy (L2), then Imp.
    seedLifetime({ invocations: { imp: 1, harpy: 1, midas: 1, doppelgaenger: 1 } });
    render();
    clickTab('Actions');
    const names = Array.from(container!.querySelectorAll('.analytics-inv-name')).map(
      (n) => n.textContent ?? '',
    );
    const idx = (label: string): number => names.findIndex((n) => n.startsWith(label));
    expect(idx('Doppelg')).toBeLessThan(idx('Midas'));
    expect(idx('Midas')).toBeLessThan(idx('Harpy'));
    expect(idx('Harpy')).toBeLessThan(idx('Imp'));
  });
});
