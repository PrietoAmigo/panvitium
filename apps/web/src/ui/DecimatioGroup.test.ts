/**
 * Render smoke tests for the reworked Decimatio menu (Claude Design "The Breathing Dark"): the
 * masthead + creed, the live Reprobates KPI, the three rite cards (Caedes always open, Pogrom and
 * Purgatio sealed until their Ira gate), and the "Index Opervm" ledger. These pin the wiring the rework
 * introduced; the action math and store mutators are covered by their own suites — this is purely
 * that the surface mounts against live store state with the real catalog numbers.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';
import { DecimatioGroup } from './panels.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(DecimatioGroup)));
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

describe('DecimatioGroup — "The Breathing Dark"', () => {
  it('renders the masthead, creed, and the Reprobates KPI', () => {
    render();
    const text = container!.textContent ?? '';
    expect(container!.querySelector('.dec-title')?.textContent).toBe(strings.opera.decimatio);
    expect(text).toContain(strings.opera.decimatioCreed);
    expect(container!.querySelector('.dec-kpi-label')?.textContent).toBe(strings.reprobates);
  });

  it('shows the Caedes card with its real cost, and seals Pogrom and Purgatio at a fresh start', () => {
    render();
    const names = Array.from(container!.querySelectorAll('.dec-name')).map((n) =>
      (n.textContent ?? '').trim(),
    );
    // Caedes is always open; Pogrom (Ira II) and Purgatio (Ira III) are sealed at a fresh start.
    expect(names).toContain(strings.opera.caedes);
    expect(names).not.toContain(strings.opera.pogrom);
    expect(names).not.toContain(strings.opera.purgatio);

    // Both gated rites show a sealed card: "<name> · sealed" plus their lock note.
    const sealedTitles = Array.from(container!.querySelectorAll('.dec-sealed-title')).map((n) =>
      (n.textContent ?? '').trim(),
    );
    expect(sealedTitles).toContain(
      `${strings.opera.pogrom} ${strings.opera.decimatioSealedSuffix}`,
    );
    expect(sealedTitles).toContain(
      `${strings.opera.purgatio} ${strings.opera.decimatioSealedSuffix}`,
    );
    const text = container!.textContent ?? '';
    expect(text).toContain(strings.opera.decimatioLocked.pogrom);
    expect(text).toContain(strings.opera.decimatioLocked.purgatio);

    // Only Caedes surfaces a real catalog cost ("100 g") and a commission CTA.
    expect(text).toContain('100 g');
    const ctas = Array.from(container!.querySelectorAll('.dec-commission')).map((b) =>
      (b.textContent ?? '').trim(),
    );
    expect(ctas).toContain(strings.opera.decimatioCta.caedes);
    expect(ctas).not.toContain(strings.opera.decimatioCta.pogrom);
  });

  it('shows the Index Opervm ledger heading and an empty-state line before any rite is worked', () => {
    render();
    expect(container!.querySelector('.dec-ledger-head')?.textContent).toBe(
      strings.opera.decimatioLedgerHeading,
    );
    expect(container!.querySelector('.dec-ledger-empty')?.textContent).toBe(
      strings.opera.decimatioEmptyLedger,
    );
  });
});
