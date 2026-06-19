/**
 * Render tests for the persistent Influence & Gold HUD (design handoff). The vessel canvas itself is
 * a rAF/Canvas2D paint loop (no jsdom surface to assert), so these pin the wiring the rest of the
 * HUD owns: the labelled cluster, the two readouts formatted through `formatBigNum`, and that the
 * Influence reads as `value / max`. Visibility (which rooms/menus show it) is owned by App and driven
 * by the `katabasisPhase`/`panel` predicate there; this suite is purely the readout component.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { bn, type GameState } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { InfluenceGoldHud } from './InfluenceGoldHud.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function patchLifetime(over: { influence?: number; maxInfluence?: number; gold?: number }): void {
  const s = useGameStore.getState().state as GameState;
  useGameStore.setState({
    state: {
      ...s,
      lifetime: {
        ...s.lifetime,
        ...(over.influence !== undefined ? { influence: bn(over.influence) } : {}),
        ...(over.maxInfluence !== undefined ? { maxInfluence: bn(over.maxInfluence) } : {}),
        ...(over.gold !== undefined ? { gold: bn(over.gold) } : {}),
      },
    },
  });
}

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(InfluenceGoldHud));
  });
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

describe('Influence & Gold HUD', () => {
  it('renders a labelled cluster with both readouts', () => {
    patchLifetime({ influence: 100, maxInfluence: 1000, gold: 250 });
    render();
    const cluster = container!.querySelector('[role="group"]');
    expect(cluster?.getAttribute('aria-label')).toBe('Influence and Gold');
    expect(container!.querySelector('.ig-hud-label--influence')?.textContent).toBe('Influence');
    expect(container!.querySelector('.ig-hud-label--gold')?.textContent).toBe('Gold');
  });

  it('reads Influence as value / max and formats both through formatBigNum', () => {
    patchLifetime({ influence: 62_000_000, maxInfluence: 100_000_000, gold: 1_450_000 });
    render();
    expect(container!.querySelector('.ig-hud-value--influence')?.textContent).toBe('62M / 100M');
    expect(container!.querySelector('.ig-hud-value--gold')?.textContent).toBe('1.45M');
  });

  it('paints the pixelation canvas at the design grid resolution', () => {
    render();
    const canvas = container!.querySelector('.ig-hud-canvas') as HTMLCanvasElement | null;
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBe(96);
    expect(canvas!.height).toBe(96);
  });

  it('renders nothing when there is no game state', () => {
    useGameStore.setState({ state: null });
    render();
    expect(container!.querySelector('.ig-hud')).toBeNull();
  });
});
