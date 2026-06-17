/**
 * Render smoke tests for the reworked Depraedatio menu (Claude Design "merged proposal"): Vitium
 * Mercatura as the Sigil Grid of eight per-Sin cards, Vitium Compositum as the Living Grimoire of
 * rites with the Panvitium teaser. These pin the wiring the rework introduced — the tab bar, the
 * eight trade cards (one per Sin, all locked at a fresh start), and the tab switch to the rite list
 * plus the sealed Panvitium gate. The Mercatus/Compositum math and the store mutators are covered by
 * their own suites; this is purely that the surface mounts against live store state.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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

describe('DepraedatioGroup — Sigil Grid + Living Grimoire', () => {
  it('renders both tabs and the eight Mercatura cards (locked at a fresh start)', () => {
    render();
    const tabs = Array.from(container!.querySelectorAll('.dep-tab')).map((t) =>
      (t.textContent ?? '').trim(),
    );
    expect(tabs).toContain('Vitium Mercatura');
    expect(tabs).toContain('Vitium Compositum');

    const deepen = container!.querySelectorAll<HTMLButtonElement>('.dep-deepen');
    expect(deepen.length).toBe(8); // one card per Cardinal Sin
    // Fresh start: every Sin is level 0, so every trade is locked and cannot be deepened.
    expect(Array.from(deepen).every((b) => b.disabled)).toBe(true);
  });

  it('switches to Compositum and shows rites plus the sealed Panvitium gate', () => {
    render();
    clickTab('Vitium Compositum');
    // The grid (deepen buttons) is gone; ceremony toggles are shown instead.
    expect(container!.querySelectorAll('.dep-deepen').length).toBe(0);
    expect(container!.querySelectorAll('.dep-rite').length).toBeGreaterThan(0);
    // Panvitium is sealed until every Sin reaches Level III.
    expect(container!.textContent ?? '').toContain('Requires every Sin at Level III');
  });
});
