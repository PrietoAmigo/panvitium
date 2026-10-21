import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  createInitialState,
  addReprobates,
  resourceFlows,
  type Acolyte,
  type GameState,
} from '@panvitium/sim';
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
  it('renders the Actions tab with no acolytes without looping', () => {
    seed([]);
    render();
    clickTab('Actions');
    expect(container!.textContent).toContain('No acolytes');
  });

  it('renders a row per acolyte with its current action on the Actions tab', () => {
    seed([
      { id: 1, assignedAction: 'suggestion', remainingSeconds: 30 },
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
    expect(tabLabels).toEqual(['Main', 'Actions']);
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
    expect(container!.querySelectorAll('.an-inv .an-bar').length).toBe(0);
  });

  it('lists a stackable invocation as a passive row (no runner bar/chip) with its live effect', () => {
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
    expect(text.toLowerCase()).toContain('murders/s'); // its live quantified effect (no runner channel)
    // No autonomous runner anymore \u2192 one entry (no per-copy rows), no progress bar, no buttons.
    expect(container!.querySelectorAll('.an-inv').length).toBe(1);
    expect(container!.querySelectorAll('.an-inv .an-bar').length).toBe(0);
    expect(container!.querySelectorAll('.an-invocations button').length).toBe(0);
  });

  it('orders bound invocations by required Sin level (desc) then name (asc)', () => {
    // imp (Ira L1), harpy (Ira L2), midas (Avaritia L3), doppelgaenger (Superbia L3): both L3 sort
    // first, alphabetical within the tier (Doppelg\u00e4nger before Midas), then Harpy (L2), then Imp.
    seedLifetime({ invocations: { imp: 1, harpy: 1, midas: 1, doppelgaenger: 1 } });
    render();
    clickTab('Actions');
    const names = Array.from(container!.querySelectorAll('.an-inv-name')).map(
      (n) => n.textContent ?? '',
    );
    const idx = (label: string): number => names.findIndex((n) => n.startsWith(label));
    expect(idx('Doppelg')).toBeLessThan(idx('Midas'));
    expect(idx('Midas')).toBeLessThan(idx('Harpy'));
    expect(idx('Harpy')).toBeLessThan(idx('Imp'));
  });
});

describe('AnalyticsGroup — Risk tab (the Depraedatio Risk algos contract)', () => {
  it('stays hidden until Risk algos is chosen', () => {
    seedLifetime({});
    render();
    const tabs = Array.from(container!.querySelectorAll('button')).map((b) => b.textContent);
    expect(tabs).toEqual(['Main', 'Actions']);
  });

  it('lists every action with the odds of all seven outcomes, in aligned columns', () => {
    seedLifetime({ syngraphae: ['risk-algos'] });
    render();
    clickTab('Risk');
    const table = container!.querySelector('.an-risk');
    expect(table).not.toBeNull();
    const text = table!.textContent ?? '';
    for (const name of ['Suggestion', 'Logismoi', 'Imperium']) {
      expect(text).toContain(name);
    }
    // The retired Decimatio category and its rites are gone (ADR-038).
    for (const name of ['Decimatio', 'Caedes', 'Pogrom', 'Purgatio']) {
      expect(text).not.toContain(name);
    }
    expect(text).toContain('Indagatio');
    expect(text).toContain('Emptio');
    for (const tier of [
      'Stellar',
      'Excellent',
      'Good',
      'Neutral',
      'Bad',
      'Terrible',
      'Apocalyptic',
    ]) {
      expect(text).toContain(tier);
    }
    // One header row + five action rows, each with a cell per tier (7) plus its label.
    expect(container!.querySelectorAll('.an-risk-cell').length).toBe(7 * 6);
    // Indagatio's base odds read through: Neutral 50%, Apocalyptic 0.1%.
    const indagatio = Array.from(table!.querySelectorAll('.an-risk-row')).find(
      (r) => r.querySelector('.an-risk-label')?.textContent === 'Indagatio',
    );
    const cells = Array.from(indagatio!.querySelectorAll('.an-risk-cell')).map(
      (c) => c.textContent,
    );
    expect(cells).toEqual(['0.1%', '4.9%', '25.0%', '50.0%', '15.0%', '4.9%', '0.1%']);
  });
});

describe('AnalyticsGroup — report layout (Claude Design rework)', () => {
  const subtitle = (): string => container!.querySelector('.an-subtitle')?.textContent ?? '';

  it('heads each tab with its subtitle and marks the selected tab', () => {
    seedLifetime({ syngraphae: ['risk-algos'] });
    render();
    expect(subtitle()).toBe('Resources, flows and the reprobate population');
    const selected = (): string[] =>
      Array.from(container!.querySelectorAll('[role="tab"][aria-selected="true"]')).map(
        (b) => b.textContent ?? '',
      );
    expect(selected()).toEqual(['Main']);
    clickTab('Actions');
    expect(subtitle()).toBe('Everything acting on your behalf, right now');
    expect(selected()).toEqual(['Actions']);
    clickTab('Risk');
    expect(subtitle()).toBe('The odds of every outcome of every action, as they stand right now.');
    expect(selected()).toEqual(['Risk']);
  });

  it('shows slow per-second rates to two decimals rather than flooring them', () => {
    seed([]);
    render();
    const state = useGameStore.getState().state!;
    const net = resourceFlows(state).influence.net;
    expect(Math.abs(net)).toBeLessThan(10); // a fresh game's influence flow is a slow one
    const kpiNets = Array.from(container!.querySelectorAll('.an-kpi-net')).map(
      (n) => n.textContent ?? '',
    );
    // Influence leads the KPI row; its net line carries the two-decimal rate.
    expect(kpiNets[0]).toBe(`${net < 0 ? '−' : '+'}${Math.abs(net).toFixed(2)}/s net`);
    expect(kpiNets).toHaveLength(3);
  });

  it('breaks the reprobate deaths down by cause with a total', () => {
    seed([]);
    render();
    const rows = Array.from(container!.querySelectorAll('.an-ledger-row')).map(
      (r) => r.firstElementChild?.textContent ?? '',
    );
    expect(rows).toEqual(['By murder', 'By suicide', 'Total']);
  });

  it('reads an idle player as a muted "Player · idle" block with an empty bar', () => {
    seed([]);
    render();
    clickTab('Actions');
    const rite = container!.querySelector('.an-rite');
    expect(rite!.classList.contains('an-rite--idle')).toBe(true);
    expect(rite!.textContent).toBe('Player · idle');
    expect((rite!.querySelector('.an-bar-fill') as HTMLElement).style.width).toBe('0%');
  });

  it("shows the player's in-flight rite with its time left", () => {
    const base = createInitialState('seed', 0);
    const state: GameState = {
      ...base,
      lifetime: {
        ...base.lifetime,
        actionQueue: [{ actionId: 'suggestion', remainingSeconds: 3.2 }],
      },
    };
    useGameStore.setState({ state });
    render();
    clickTab('Actions');
    const rite = container!.querySelector('.an-rite');
    expect(rite!.classList.contains('an-rite--idle')).toBe(false);
    expect(rite!.querySelector('.an-rite-label')!.textContent).toBe('Player · Suggestion');
    expect(rite!.querySelector('.an-rite-time')!.textContent).toBe('4s left');
  });

  it('greys out an idle acolyte with an empty remaining cell and bar', () => {
    seed([
      { id: 1, assignedAction: 'suggestion', remainingSeconds: 30 },
      { id: 2, assignedAction: null, remainingSeconds: null },
    ]);
    render();
    clickTab('Actions');
    const idle = container!.querySelectorAll('.an-acolytes .an-tr--idle');
    expect(idle).toHaveLength(1);
    const cells = Array.from(
      container!.querySelectorAll('.an-acolytes [role="row"]')[2]!.children,
    ).map((c) => c.textContent);
    expect(cells.slice(0, 4)).toEqual(['Acolyte 2', expect.stringMatching(/×$/), 'idle', '–']);
    const busy = Array.from(container!.querySelectorAll('.an-acolytes [role="row"]')[1]!.children);
    expect(busy[2]!.textContent).toBe('Suggestion');
    expect(busy[3]!.textContent).toBe('30s');
  });

  it('highlights the likeliest outcome of each action on the Risk tab', () => {
    seedLifetime({ syngraphae: ['risk-algos'] });
    render();
    clickTab('Risk');
    const rows = Array.from(container!.querySelectorAll('.an-risk-row')).filter(
      (r) => r.querySelector('.an-risk-label') !== null && !r.classList.contains('an-risk-head'),
    );
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.querySelectorAll('.an-risk-cell--top').length).toBeGreaterThanOrEqual(1);
    }
    const indagatio = rows.find(
      (r) => r.querySelector('.an-risk-label')?.textContent === 'Indagatio',
    );
    const top = Array.from(indagatio!.querySelectorAll('.an-risk-cell--top'));
    expect(top.map((c) => c.textContent)).toEqual(['50.0%']);
    expect(top[0]!.classList.contains('an-tier--neutral')).toBe(true);
    // The header row is never highlighted.
    expect(container!.querySelectorAll('.an-risk-head .an-risk-cell--top')).toHaveLength(0);
  });
});
