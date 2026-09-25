/**
 * The in-room altar sigil's state machine ("Altar sigil" handoff): off → shown → armed → descend,
 * STATUS QUO → the Ledger, and the 4 s idle timeout that fades it (0.5 s) back to off from shown
 * or armed. The reducer is pinned transition by transition; the hook's timers with fake timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  ALTAR_SIGIL_FADE_MS,
  ALTAR_SIGIL_IDLE_MS,
  ALTAR_SIGIL_OFF,
  altarSigilReducer as step,
  useAltarSigil,
  type AltarSigil,
  type AltarSigilState,
} from './useAltarSigil.js';

const shown: AltarSigilState = { phase: 'shown', armed: false, epoch: 1 };
const armed: AltarSigilState = { phase: 'armed', armed: true, epoch: 2 };

describe('altarSigilReducer', () => {
  it('shows the sigil, disarmed, when the altar is clicked', () => {
    expect(step(ALTAR_SIGIL_OFF, 'altar')).toEqual({ phase: 'shown', armed: false, epoch: 1 });
  });

  it('restarts the idle timer when the altar is clicked again (shown stays shown, armed stays armed)', () => {
    expect(step(shown, 'altar')).toEqual({ ...shown, epoch: 2 });
    expect(step(armed, 'altar')).toEqual({ ...armed, epoch: 3 });
  });

  it('arms on the first press and goes off on the second (the descent)', () => {
    expect(step(shown, 'press')).toEqual({ phase: 'armed', armed: true, epoch: 2 });
    expect(step(armed, 'press').phase).toBe('off');
  });

  it('fades on the idle timeout from shown or armed, keeping the look it fades with', () => {
    expect(step(shown, 'idle')).toEqual({ ...shown, phase: 'fading' });
    const fadingArmed = step(armed, 'idle');
    expect(fadingArmed).toEqual({ ...armed, phase: 'fading' });
    expect(step(fadingArmed, 'faded').phase).toBe('off');
  });

  it('does not answer a press while fading, but the altar raises it afresh (disarmed)', () => {
    const fading = step(armed, 'idle');
    expect(step(fading, 'press')).toBe(fading);
    expect(step(fading, 'altar')).toEqual({ phase: 'shown', armed: false, epoch: 3 });
  });

  it('puts the sigil away at once on dismiss (STATUS QUO, a door), from any phase', () => {
    for (const s of [shown, armed, step(shown, 'idle')]) {
      expect(step(s, 'dismiss')).toMatchObject({ phase: 'off', armed: false });
    }
  });

  it('ignores stray events while off (same state, no re-render)', () => {
    for (const e of ['press', 'dismiss', 'idle', 'faded'] as const) {
      expect(step(ALTAR_SIGIL_OFF, e)).toBe(ALTAR_SIGIL_OFF);
    }
    expect(step(shown, 'faded')).toBe(shown); // a stale fade timer cannot close a live sigil
  });
});

describe('useAltarSigil (timers)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let sigil: AltarSigil;
  const onDescend = vi.fn();
  const onStatusQuo = vi.fn();

  function Probe(): null {
    sigil = useAltarSigil({ onDescend, onStatusQuo });
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    onDescend.mockReset();
    onStatusQuo.mockReset();
    container = document.createElement('div');
    root = createRoot(container);
    act(() => root.render(createElement(Probe)));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  const advance = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };

  it('fades after 4 s untouched, then goes off 0.5 s later', () => {
    act(() => sigil.showAltar());
    expect(sigil.phase).toBe('shown');
    advance(ALTAR_SIGIL_IDLE_MS - 1);
    expect(sigil.phase).toBe('shown');
    advance(1);
    expect(sigil.phase).toBe('fading');
    advance(ALTAR_SIGIL_FADE_MS);
    expect(sigil.phase).toBe('off');
  });

  it('restarts the 4 s wait when the altar is clicked again, and when the sigil arms', () => {
    act(() => sigil.showAltar());
    advance(3000);
    act(() => sigil.showAltar());
    advance(3000);
    expect(sigil.phase).toBe('shown'); // 6 s in, but only 3 s since the last click
    act(() => sigil.press());
    advance(ALTAR_SIGIL_IDLE_MS - 1);
    expect(sigil.phase).toBe('armed');
    expect(sigil.armed).toBe(true);
    advance(1);
    expect(sigil.phase).toBe('fading');
    expect(sigil.armed).toBe(true); // an armed sigil fades out armed
  });

  it('commits the descent on the second press, once', () => {
    act(() => sigil.showAltar());
    act(() => sigil.press());
    expect(onDescend).not.toHaveBeenCalled();
    act(() => sigil.press());
    expect(onDescend).toHaveBeenCalledTimes(1);
    expect(sigil.phase).toBe('off');
    act(() => sigil.press()); // off: nothing more happens
    expect(onDescend).toHaveBeenCalledTimes(1);
  });

  it('opens the Ledger from STATUS QUO and puts the sigil away', () => {
    act(() => sigil.showAltar());
    act(() => sigil.statusQuo());
    expect(onStatusQuo).toHaveBeenCalledTimes(1);
    expect(sigil.phase).toBe('off');
    expect(vi.getTimerCount()).toBe(0); // no idle timer left behind
  });

  it('clears its pending timer on dismiss and on unmount', () => {
    act(() => sigil.showAltar());
    expect(vi.getTimerCount()).toBe(1);
    act(() => sigil.dismiss());
    expect(sigil.phase).toBe('off');
    expect(vi.getTimerCount()).toBe(0);
    act(() => sigil.showAltar());
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container); // afterEach unmounts a fresh root
  });
});
