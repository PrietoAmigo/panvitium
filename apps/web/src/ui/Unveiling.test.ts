/**
 * The Unveiling host: it plays the store's queue (the maleficia Emptio just brought home) one relic
 * at a time, retiring each once its fade is done so the next mounts fresh, renders nothing for an
 * empty queue, and skips an id the catalog does not know.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGameStore } from '../store/gameStore.js';
import { UNVEIL_FADE_MS, UNVEIL_HOLD_MS } from '../menus/MaleficiumUnveiling.js';
import { Unveiling } from './Unveiling.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const realGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
});
beforeEach(() => {
  vi.useFakeTimers();
  useGameStore.setState({ unveilQueue: [], lastObtained: null });
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
  vi.useRealTimers();
  useGameStore.setState({ unveilQueue: [], lastObtained: null });
});

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(Unveiling));
  });
}

const shown = (): string | null => container!.querySelector('.unveiling h2')?.textContent ?? null;
const playThrough = (): void => {
  act(() => {
    vi.advanceTimersByTime(UNVEIL_HOLD_MS);
  });
  act(() => {
    vi.advanceTimersByTime(UNVEIL_FADE_MS);
  });
};

describe('Unveiling host', () => {
  it('renders nothing while no relic waits', () => {
    render();
    expect(container!.querySelector('.unveiling')).toBeNull();
  });

  it('plays the queue one relic at a time, oldest first, then empties it', () => {
    useGameStore.setState({
      unveilQueue: [
        { id: 'codex_gigas', seq: 1 },
        { id: 'witch_bottle', seq: 2 },
        { id: 'witch_bottle', seq: 3 },
      ],
    });
    render();
    expect(shown()).toBe('Codex Gigas');
    expect(container!.querySelectorAll('.unveiling')).toHaveLength(1);
    playThrough();
    expect(shown()).toBe('Witch Bottle');
    playThrough();
    // The second copy of the same relic mounts fresh and plays its own hold.
    expect(shown()).toBe('Witch Bottle');
    expect(useGameStore.getState().unveilQueue.map((r) => r.seq)).toEqual([3]);
    playThrough();
    expect(container!.querySelector('.unveiling')).toBeNull();
    expect(useGameStore.getState().unveilQueue).toHaveLength(0);
  });

  it('skips a relic the catalog does not know', () => {
    useGameStore.setState({
      unveilQueue: [
        { id: 'not_a_real_maleficium', seq: 1 },
        { id: 'codex_gigas', seq: 2 },
      ],
    });
    render();
    expect(shown()).toBe('Codex Gigas');
  });
});
