/**
 * Render tests for the PLACEHOLDER Stagnation HUD + Desidia button (ADR-033). Pins the wiring: the
 * labelled cluster, the value / derived-cap readout, and that the Desidia button reflects and drives
 * `desidiaActive` through the store. Visibility (which rooms/menus show it) is owned by App.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { bn, type GameState } from '@panvitium/sim';
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

function desidiaButton(): HTMLButtonElement {
  return container!.querySelector('.stag-hud-desidia') as HTMLButtonElement;
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

describe('Stagnation HUD (placeholder)', () => {
  it('renders a labelled cluster with the value over the base cap', () => {
    patch({ stagnation: 45 });
    render();
    const cluster = container!.querySelector('[role="group"]');
    expect(cluster?.getAttribute('aria-label')).toBe('Stagnation');
    expect(container!.querySelector('.stag-hud-value')?.textContent).toBe('45.0 / 120');
  });

  it('shows the Acedia-doubled cap', () => {
    patch({ stagnation: 10, acedia: 180 }); // Acedia level 1 → cap ×2 = 240
    render();
    expect(container!.querySelector('.stag-hud-value')?.textContent).toBe('10.0 / 240');
  });

  it('clicking the Desidia button toggles desidiaActive in the store', () => {
    patch({ stagnation: 50 });
    render();
    expect(desidiaButton().getAttribute('aria-pressed')).toBe('false');
    act(() => desidiaButton().dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect((useGameStore.getState().state as GameState).desidiaActive).toBe(true);
  });

  it('disables Desidia when there is no stagnation to spend and it is not already active', () => {
    patch({ stagnation: 0, desidiaActive: false });
    render();
    expect(desidiaButton().disabled).toBe(true);
  });

  it('renders nothing when there is no game state', () => {
    useGameStore.setState({ state: null });
    render();
    expect(container!.querySelector('.stag-hud')).toBeNull();
  });
});
