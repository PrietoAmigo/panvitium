/**
 * Render smoke tests for the Chthonic Logos's outcome ledger (the "logs at the foot" addition). The
 * scroll's rites / sigils / dismissal are covered by LogosPanel.test.ts; this pins the ledger wiring
 * the wrapper introduces: the heading + empty state before anything resolves, and a real Logos
 * outcome surfacing as a tier chip beside its soul yield, filtered to this program's rites (another
 * program's outcome in the same log must not leak in).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import { bn } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { ChthonicLogos } from './panels.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(ChthonicLogos, { onClose: () => {} })));
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

describe('ChthonicLogos — outcome ledger', () => {
  it('shows the ledger heading and the empty-state line before any temptation resolves', () => {
    render();
    expect(container!.querySelector('.logos-ledger-head')?.textContent).toBe(
      strings.opera.logosLedgerHeading,
    );
    expect(container!.querySelector('.logos-ledger-empty')?.textContent).toBe(
      strings.opera.logosEmptyLedger,
    );
  });

  it('sits in its own card below the scroll, outside the drifting Latin', () => {
    render();
    const ledger = container!.querySelector('.logos-ledger');
    expect(ledger?.closest('.logos-index')).not.toBeNull();
    expect(ledger?.closest('.logos-card')).toBeNull();
    expect(container!.querySelector('.logos-index .logos-drift')).toBeNull();
  });

  it('surfaces a resolved Logos outcome as a tier chip beside its soul yield, filtered to its rites', () => {
    useGameStore.setState({
      log: [
        { actionId: 'suggestion', tier: 'good', soulsDelta: 5, reprobateDelta: 0, goldDelta: 0 },
        // Another program's outcome in the same log must NOT leak into the Logos ledger.
        { actionId: 'indagatio', tier: 'stellar', soulsDelta: 0, reprobateDelta: 0, goldDelta: 0 },
      ],
    });
    render();
    const rows = Array.from(container!.querySelectorAll('.logos-ledger-row'));
    expect(rows.length).toBe(1); // only the Logos outcome
    expect(rows[0]!.querySelector('.logos-ledger-tier')?.textContent).toBe(strings.tiers.good);
    const text = rows[0]!.querySelector('.logos-ledger-text')?.textContent ?? '';
    expect(text).toContain(strings.opera.suggestion); // the rite name
    expect(text).toContain('+5'); // the soul yield
    expect(text).toContain(strings.resources.souls);
  });

  it('names a reprobate loss as a suicide (with its souls) or a plain loss', () => {
    useGameStore.setState({
      log: [
        { actionId: 'suggestion', tier: 'good', soulsDelta: 3, reprobateDelta: -3, goldDelta: 0 },
        {
          actionId: 'imperium',
          tier: 'terrible',
          soulsDelta: 0,
          reprobateDelta: -40,
          goldDelta: 0,
        },
      ],
    });
    render();
    const texts = Array.from(container!.querySelectorAll('.logos-ledger-text')).map(
      (el) => el.textContent,
    );
    expect(texts).toEqual([
      `${strings.opera.suggestion} · −3 ${strings.reprobates} ${strings.opera.logosSuicide}, +3 ${strings.resources.souls}`,
      `${strings.opera.imperium} · −40 ${strings.reprobates} ${strings.opera.logosLost}`,
    ]);
  });
});

describe('ChthonicLogos — sealed action names', () => {
  it('keeps each seal on its action as other rites unlock, including after relocking', () => {
    const initial = store().state!;
    render();

    function expectRites(names: string[], locked: boolean[]): void {
      const rows = Array.from(container!.querySelectorAll('.logos-row'));
      expect(rows.map((row) => row.querySelector('.logos-name')?.textContent)).toEqual(names);
      expect(rows.map((row) => row.classList.contains('logos-row--locked'))).toEqual(locked);
    }

    const sealedNames = [
      strings.opera.suggestion,
      'Vhorrus Exneth',
      'Xherum Oneytan',
      'Zvorpo Wermurn',
    ];
    expectRites(sealedNames, [false, true, true, true]);

    act(() => {
      useGameStore.setState({
        state: { ...initial, devotion: { ...initial.devotion, luxuria: bn(180) } },
      });
    });
    expectRites(
      [strings.opera.suggestion, strings.opera.logismoi, 'Xherum Oneytan', 'Zvorpo Wermurn'],
      [false, false, true, true],
    );

    act(() => {
      useGameStore.setState({
        state: { ...initial, devotion: { ...initial.devotion, luxuria: bn(180 ** 3) } },
      });
    });
    expectRites(
      [strings.opera.suggestion, strings.opera.logismoi, strings.opera.imperium, 'Zvorpo Wermurn'],
      [false, false, false, true],
    );

    act(() => {
      const devotion = { ...initial.devotion };
      for (const sin of Object.keys(devotion) as (keyof typeof devotion)[]) {
        devotion[sin] = bn(180 ** 3);
      }
      useGameStore.setState({ state: { ...initial, devotion } });
    });
    expectRites(
      [
        strings.opera.suggestion,
        strings.opera.logismoi,
        strings.opera.imperium,
        strings.opera.panvitium,
      ],
      [false, false, false, false],
    );

    act(() => useGameStore.setState({ state: initial }));
    expectRites(sealedNames, [false, true, true, true]);
  });
});
