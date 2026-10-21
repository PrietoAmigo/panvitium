/**
 * The random-subliminal scheduler's code-plate window: inside it a staged code plate flashes; when
 * the window closes, a code plate already staged is re-picked rather than flashed. Math.random is
 * pinned (the arrival roll and the picks), and the timers + `performance.now` are faked so each
 * 100 ms check counts as 100 ms of play.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRandomSubliminals } from './useRandomSubliminals.js';
import { CODE_SUBLIMINALS, RANDOM_SUBLIMINALS, isCodeSubliminal } from './subliminals.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let roll = 0;
const flashed: string[] = [];

function Probe({ withCodes }: { withCodes: boolean }): null {
  useRandomSubliminals(true, withCodes, (src) => flashed.push(src));
  return null;
}

function render(withCodes: boolean): void {
  act(() => root!.render(createElement(Probe, { withCodes })));
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
  });
  vi.spyOn(Math, 'random').mockImplementation(() => roll);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  flashed.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root!.unmount());
  container!.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useRandomSubliminals — the code-plate window', () => {
  it('flashes a code plate while the window is open', () => {
    roll = 0.99; // the staging pick lands on the last, heavily weighted plate: 079
    render(true);
    roll = 0; // the next check's arrival roll: a plate surfaces
    act(() => vi.advanceTimersByTime(100));
    expect(flashed).toEqual([CODE_SUBLIMINALS[1]]);
  });

  it('re-picks a staged code plate once the window closes, and never flashes one outside it', () => {
    roll = 0.99;
    render(true); // 079 is staged
    render(false); // the player dialled the number
    roll = 0;
    act(() => vi.advanceTimersByTime(1000));
    expect(flashed.length).toBeGreaterThan(0);
    // The re-pick at 0.99 without the codes is the last ordinary plate.
    expect(flashed[0]).toBe(RANDOM_SUBLIMINALS.filter((src) => !isCodeSubliminal(src)).at(-1));
    expect(flashed.some(isCodeSubliminal)).toBe(false);
  });
});
