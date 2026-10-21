import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import {
  PanvitiumEnd,
  PANVITIUM_END_DELAY_MS,
  PANVITIUM_END_HOLD_MS,
  PANVITIUM_END_LIFT_MS,
} from './PanvitiumEnd.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.useRealTimers();
});

describe('PanvitiumEnd', () => {
  it('holds black 1 s, shows the wordmark 5 s, then resets and lifts onto the title', () => {
    const onReset = vi.fn();
    const onDone = vi.fn();
    act(() => root!.render(createElement(PanvitiumEnd, { onReset, onDone })));
    const mark = (): Element | null => container!.querySelector('.panvitium-end-mark');
    expect(mark()?.textContent).toBe(strings.appName);
    expect(mark()?.classList.contains('is-shown')).toBe(false);
    act(() => vi.advanceTimersByTime(PANVITIUM_END_DELAY_MS));
    expect(mark()?.classList.contains('is-shown')).toBe(true);
    act(() => vi.advanceTimersByTime(PANVITIUM_END_HOLD_MS - 1));
    expect(onReset).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(container!.querySelector('.panvitium-end.is-lifting')).not.toBeNull();
    act(() => vi.advanceTimersByTime(PANVITIUM_END_LIFT_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('sets the wordmark in the title menu column', () => {
    act(() => root!.render(createElement(PanvitiumEnd, { onReset: () => {}, onDone: () => {} })));
    expect(container!.querySelector('.title-inner > .title-wordmark')).not.toBeNull();
    expect(container!.querySelectorAll('.panvitium-end-ghost .title-entry').length).toBe(4);
  });
});
