/**
 * Render tests for the Stagnation vessel + Desidia toggle (ADR-033). The vessel canvas itself is a
 * rAF/Canvas2D paint loop (no jsdom surface to assert), so these pin the wiring the rest of the HUD
 * owns: the labelled cluster, the floored value / derived-cap readout, and that clicking the vessel
 * (there is no separate Desidia button) reflects and drives `desidiaActive` through the store, going
 * inert when there is nothing to spend. Visibility (which rooms/menus show it) is owned by App.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { bn, stagnationMax, type GameState } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { StagnationHud } from './StagnationHud.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function patch(over: { stagnation?: number; desidiaActive?: boolean; acedia?: number }): void {
  const s = useGameStore.getState().state as GameState;
  useGameStore.setState({
    state: {
      ...s,
      ...(over.stagnation !== undefined ? { stagnation: over.stagnation } : {}),
      ...(over.desidiaActive !== undefined ? { desidiaActive: over.desidiaActive } : {}),
      ...(over.acedia !== undefined
        ? { devotion: { ...s.devotion, acedia: bn(over.acedia) } }
        : {}),
    },
  });
}

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(StagnationHud));
  });
}

/** The vessel is the toggle: a single button wrapping the pixelated canvas. */
function vesselButton(): HTMLButtonElement {
  return container!.querySelector('.stag-hud-vessel-btn') as HTMLButtonElement;
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ state: null, ready: false, katabasisPhase: null });
  useGameStore.getState().init();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

describe('Stagnation HUD', () => {
  it('renders a labelled cluster with the floored value over the base cap', () => {
    patch({ stagnation: 45.7 }); // floored to 45, no decimals
    render();
    const cluster = container!.querySelector('[role="group"]');
    expect(cluster?.getAttribute('aria-label')).toBe('Stagnation');
    expect(container!.querySelector('.stag-hud-label')?.textContent).toBe('Stagnation');
    expect(container!.querySelector('.stag-hud-value')?.textContent).toBe('45 / 120');
  });

  it('shows the Acedia-doubled cap', () => {
    patch({ stagnation: 10, acedia: 180 }); // Acedia level 1 → cap ×2 = 240
    render();
    expect(container!.querySelector('.stag-hud-value')?.textContent).toBe('10 / 240');
  });

  it('floors a fractional cap (a cap sigil) so the readout stays integer-only', () => {
    // Orias #59 lifts stagnationMaxMul, which makes the derived cap fractional (120 × 1.xxx). The
    // readout must still show whole numbers only — no decimals, the reported bug.
    const s = useGameStore.getState().state as GameState;
    useGameStore.setState({ state: { ...s, stagnation: 0, sigilBindings: { 59: bn(100) } } });
    const cap = stagnationMax(useGameStore.getState().state as GameState);
    expect(Number.isInteger(cap)).toBe(false); // guard: the cap really is fractional here
    render();
    const text = container!.querySelector('.stag-hud-value')?.textContent ?? '';
    expect(text).toBe(`0 / ${Math.floor(cap)}`);
    expect(text).not.toContain('.');
  });

  it('paints the pixelation canvas at the design buffer resolution', () => {
    render();
    const canvas = container!.querySelector('.stag-hud-canvas') as HTMLCanvasElement | null;
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBe(85);
    expect(canvas!.height).toBe(19);
  });

  it('clicking the vessel toggles desidiaActive in the store', () => {
    patch({ stagnation: 50 });
    render();
    expect(vesselButton().getAttribute('aria-pressed')).toBe('false');
    act(() => vesselButton().dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect((useGameStore.getState().state as GameState).desidiaActive).toBe(true);
  });

  it('is inert when there is no stagnation to spend and Desidia is not already active', () => {
    patch({ stagnation: 0, desidiaActive: false });
    render();
    // The vessel is marked aria-disabled (not the native `disabled`, so it stays perceivable) and the
    // click is a no-op — it must not switch Desidia on with an empty pool.
    expect(vesselButton().getAttribute('aria-disabled')).toBe('true');
    act(() => vesselButton().dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect((useGameStore.getState().state as GameState).desidiaActive).toBe(false);
  });

  it('stays live (not inert) while Desidia runs even with an empty pool', () => {
    patch({ stagnation: 0, desidiaActive: true });
    render();
    // Still active → the vessel must remain clickable so the player can turn Desidia back off.
    expect(vesselButton().getAttribute('aria-disabled')).toBe('false');
    expect(vesselButton().getAttribute('aria-pressed')).toBe('true');
    act(() => vesselButton().dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect((useGameStore.getState().state as GameState).desidiaActive).toBe(false);
  });

  it('renders nothing when there is no game state', () => {
    useGameStore.setState({ state: null });
    render();
    expect(container!.querySelector('.stag-hud')).toBeNull();
  });
});
