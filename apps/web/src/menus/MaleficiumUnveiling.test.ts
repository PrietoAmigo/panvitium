/**
 * Render tests for the Unveiling (Claude Design, "Loculi Reliquary" handoff, screen 2), the pop-up
 * that plays when Emptio brings a maleficium home: its copy (the "Maleficium obtained" kicker, the
 * rarity between diamonds, name, flavour, and the effect as a headline number), and its timing (a
 * 1.5 s hold, then a 0.3 s fade before `onDone`; a click dismisses early; a click during the fade
 * does nothing; unmounting clears its timers). The canvases have no jsdom surface.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import { MaleficiumUnveiling, UNVEIL_FADE_MS, UNVEIL_HOLD_MS } from './MaleficiumUnveiling.js';
import type { Maleficium } from './types.js';

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
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

const CODEX: Maleficium = {
  id: 'codex_gigas',
  name: 'Codex Gigas',
  rarity: 'profane',
  img: '/assets/panvitium/maleficia/codex_gigas.png',
  desc: 'One scribe. One night.',
  effect: '+25% influence gain rate.',
};

function render(onDone: () => void, item: Maleficium = CODEX): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(MaleficiumUnveiling, { item, onDone }));
  });
}

const overlay = (): HTMLElement => container!.querySelector<HTMLElement>('.unveiling')!;
const advance = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe('the Unveiling — copy', () => {
  it('announces the relic: kicker, rarity, name, flavour, and the effect as a headline', () => {
    render(() => {});
    const text = overlay().textContent ?? '';
    expect(text).toContain(strings.maleficia.obtained);
    expect(text).toContain(strings.maleficia.rarity.profane);
    expect(container!.querySelector('h2')?.textContent).toBe('Codex Gigas');
    expect(text).toContain('One scribe. One night.');
    expect(text).toContain('+25%');
    expect(text).toContain('influence gain rate');
    expect(overlay().getAttribute('role')).toBe('status');
  });

  it('names a relic with no art in the relic box', () => {
    render(() => {}, { ...CODEX, id: 'the_dadu', name: 'The Dadu', img: '' });
    const labels = Array.from(overlay().querySelectorAll('span')).filter(
      (s) => s.textContent === 'The Dadu',
    );
    expect(labels).toHaveLength(1);
  });
});

describe('the Unveiling — timing', () => {
  it('holds for 1.5 s, then fades for 0.3 s before it is done', () => {
    const onDone = vi.fn();
    render(onDone);
    expect(overlay().style.opacity).toBe('1');
    advance(UNVEIL_HOLD_MS - 1);
    expect(overlay().style.opacity).toBe('1');
    advance(1);
    expect(overlay().style.opacity).toBe('0');
    expect(onDone).not.toHaveBeenCalled();
    advance(UNVEIL_FADE_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('dismisses early on a click; a click during the fade does nothing', () => {
    const onDone = vi.fn();
    render(onDone);
    advance(200);
    act(() => overlay().click());
    expect(overlay().style.opacity).toBe('0');
    advance(UNVEIL_FADE_MS - 100);
    act(() => overlay().click());
    advance(100);
    expect(onDone).toHaveBeenCalledTimes(1);
    advance(UNVEIL_HOLD_MS * 2);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('clears its timers when unmounted mid-hold', () => {
    const onDone = vi.fn();
    render(onDone);
    advance(500);
    act(() => root!.unmount());
    root = null;
    advance(UNVEIL_HOLD_MS + UNVEIL_FADE_MS);
    expect(onDone).not.toHaveBeenCalled();
  });
});
