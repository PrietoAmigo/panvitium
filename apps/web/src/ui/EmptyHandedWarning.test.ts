/**
 * The empty-handed warning overlay: it shows the exact line, swallows clicks without skipping,
 * steps through its timeline (black in, words surface, words sink, black lifts) and calls `onDone`
 * after exactly the full duration, even when a re-render hands it a fresh callback mid-hold.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import {
  EmptyHandedWarning,
  EMPTY_HANDED_HOLD_MS,
  EMPTY_HANDED_TEXT_AT_MS,
  EMPTY_HANDED_TOTAL_MS,
} from './EmptyHandedWarning.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

function render(onDone: () => void): void {
  container ??= document.createElement('div');
  document.body.appendChild(container);
  root ??= createRoot(container);
  act(() => {
    root!.render(createElement(EmptyHandedWarning, { onDone }));
  });
}

const overlay = (): HTMLElement | null => container!.querySelector('.empty-handed');
const advance = (ms: number): void =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('EmptyHandedWarning', () => {
  it('shows the exact line, in a black overlay that starts dark', () => {
    render(() => undefined);
    expect(strings.katabasis.emptyHanded).toBe('I should not descend empty-handed.');
    expect(overlay()?.textContent).toBe('I should not descend empty-handed.');
    expect(overlay()?.getAttribute('data-step')).toBe('dark');
    expect(overlay()!.querySelectorAll('button').length).toBe(0);
  });

  it('runs its timeline: the words surface, hold, sink, then the black lifts', () => {
    render(() => undefined);
    advance(EMPTY_HANDED_TEXT_AT_MS);
    expect(overlay()?.getAttribute('data-step')).toBe('speak');
    advance(1400 + EMPTY_HANDED_HOLD_MS - 1);
    expect(overlay()?.getAttribute('data-step')).toBe('speak');
    advance(1);
    expect(overlay()?.getAttribute('data-step')).toBe('sink');
    advance(900);
    expect(overlay()?.getAttribute('data-step')).toBe('lift');
  });

  it('cannot be skipped: clicks do nothing, and it ends after exactly the full duration', () => {
    expect(EMPTY_HANDED_TOTAL_MS).toBe(7300);
    const first = vi.fn();
    render(first);
    act(() => overlay()!.click());
    act(() => overlay()!.querySelector('p')!.click());
    advance(3000);
    // A re-render with a fresh callback mid-hold must not restart the timeline.
    const latest = vi.fn();
    render(latest);
    advance(EMPTY_HANDED_TOTAL_MS - 3000 - 1);
    expect(first).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();
    advance(1);
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
