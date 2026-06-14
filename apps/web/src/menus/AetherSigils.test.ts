/**
 * Tests for the Katabasis "Aether" sigil sphere (Claude Design port).
 *
 * `toRoman` / `effectDisplay` are the two pure seams the screen depends on: the roman seal numbers,
 * and — the heart of pending point #2 — the real per-seal effect magnitude, derived from the sim's
 * `sigilStrength` (coefficient × curve), not the prototype's √×0.01 stub. The render smoke test pins
 * that the screen mounts against live store state: 72 seals, the burning counter off the real
 * bindings, and the browse-bar "Unbind all" gating. The projection loop, store mutators and effect
 * math have their own suites; the rAF-driven focus is intentionally not asserted here.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { bn, sigilById, type GameState } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { AetherSigils, toRoman, effectDisplay } from './AetherSigils.js';

describe('toRoman', () => {
  it('renders seal numbers 1..72 as roman numerals', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(9)).toBe('IX');
    expect(toRoman(32)).toBe('XXXII');
    expect(toRoman(44)).toBe('XLIV');
    expect(toRoman(72)).toBe('LXXII');
  });
});

describe('effectDisplay — real per-seal magnitude (pending #2)', () => {
  it('shows a percentage for multiplier sigils (Valefor #6, +gold rate)', () => {
    // coefficient 0.0001 × √1e6 = 0.0001 × 1000 = 0.1 → +10.0%
    expect(effectDisplay(sigilById(6), bn(1_000_000))).toBe('+10.0%');
  });

  it('shows a flat per-second value for generator sigils (Haagenti #48, +gold/s)', () => {
    const out = effectDisplay(sigilById(48), bn(1_000_000));
    expect(out.startsWith('+')).toBe(true);
    expect(out.endsWith('gold/s')).toBe(true);
  });

  it('shows rounded invoking power for Andrealphus #65', () => {
    // coefficient 0.0001 × √1e8 = 0.0001 × 1e4 = 1 → +1 invoking power
    expect(effectDisplay(sigilById(65), bn(100_000_000))).toBe('+1 invoking power');
  });

  it('is zero-safe and tolerates an unknown seal', () => {
    expect(effectDisplay(sigilById(6), bn(0))).toBe('+0.0%');
    expect(effectDisplay(undefined, bn(10))).toBe('\u2014');
  });
});

// ── render smoke ──
const media = window.HTMLMediaElement.prototype;
media.play = () => Promise.resolve();
media.pause = () => undefined;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();

function renderWith(part: Partial<GameState>): void {
  const base = store().state as GameState;
  const state = { ...base, ...part };
  useGameStore.setState({ state });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(AetherSigils, { state })));
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

describe('AetherSigils — render smoke', () => {
  it('mounts 72 seals and reflects the bindings in the burning counter', () => {
    renderWith({ souls: bn(50_000), sigilBindings: { 6: bn(1_000_000), 48: bn(2_000_000) } });
    expect(container!.querySelectorAll('.aether-seal').length).toBe(72);
    const count = container!.querySelector('.aether-count')?.textContent ?? '';
    expect(count).toContain('2');
    expect(count).toContain('72 seals burning');
  });

  it('enables "Unbind all" only when something is bound', () => {
    renderWith({ souls: bn(50_000), sigilBindings: {} });
    const btn = Array.from(container!.querySelectorAll<HTMLButtonElement>('.aether-btn--ash')).find(
      (b) => (b.textContent ?? '').includes('Unbind all'),
    );
    expect(btn).toBeDefined();
    expect(btn!.disabled).toBe(true);

    act(() => root!.unmount());
    container!.remove();
    renderWith({ souls: bn(50_000), sigilBindings: { 6: bn(1000) } });
    const btn2 = Array.from(
      container!.querySelectorAll<HTMLButtonElement>('.aether-btn--ash'),
    ).find((b) => (b.textContent ?? '').includes('Unbind all'));
    expect(btn2!.disabled).toBe(false);
  });
});
