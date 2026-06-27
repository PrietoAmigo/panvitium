/**
 * Render + behaviour tests for the answered call-in stage (Claude Design "Smartphone Call-In
 * System"). These pin the FSM the design specifies: a recording shows the big caller name + a
 * "tap to skip" hint and reveals options when it finishes (here: the safety timer, since jsdom has no
 * real audio); a typed call writes its line out and shows the kicker tag; tapping the stage skips
 * ahead; picking an option fires `onChoose`, lights the pick / dims the rest, and resolves to
 * `onDone` after the fade cadence. Timers are faked so the async reveals are deterministic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SmartphoneCallIn } from './SmartphoneCallIn.js';
import { buildCallInView, type CallInView } from '../game/callIn.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(props: {
  call: CallInView;
  onChoose?: (i: number) => void;
  onDone?: () => void;
  textSpeedMs?: number;
}): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(SmartphoneCallIn, {
        call: props.call,
        onChoose: props.onChoose ?? (() => {}),
        onDone: props.onDone ?? (() => {}),
        ...(props.textSpeedMs !== undefined ? { textSpeedMs: props.textSpeedMs } : {}),
      }),
    );
  });
}

const q = (sel: string): HTMLElement | null => container!.querySelector(sel);
const all = (sel: string): HTMLElement[] => Array.from(container!.querySelectorAll(sel));
const advance = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('SmartphoneCallIn — recorded call', () => {
  it('shows the caller name + "tap to skip", then reveals options when the recording ends', () => {
    const call = buildCallInView('the-cycle-turns')!;
    render({ call });
    // Speaking: big caller name + skip hint, no options, no typed line.
    expect(q('.callin-caller')?.textContent).toBe('Gideon Reyes');
    expect(q('.callin-hint')?.textContent).toBe('tap to skip');
    expect(all('.callin-choice')).toHaveLength(0);
    expect(q('.callin-text')).toBeNull();
    // The safety timer reveals the options (jsdom plays no audio → estimateDuration fallback = 4s).
    advance(4001);
    expect(all('.callin-choice')).toHaveLength(3);
    expect(q('.callin-hint')).toBeNull(); // hint only while speaking
    expect(q('.callin-caller')?.textContent).toBe('Gideon Reyes'); // name stays
  });

  it('tapping the stage while speaking skips straight to the options', () => {
    const call = buildCallInView('a-good-find')!;
    render({ call });
    expect(all('.callin-choice')).toHaveLength(0);
    act(() => q('.callin-stage')!.click());
    expect(all('.callin-choice')).toHaveLength(3);
  });

  it('marks the decline option with the dim class', () => {
    const call = buildCallInView('the-looting')!; // [Make an example], [Let it go (dim)]
    render({ call });
    act(() => q('.callin-stage')!.click());
    const choices = all('.callin-choice');
    expect(choices).toHaveLength(2);
    expect(choices[0]!.classList.contains('is-dim')).toBe(false);
    expect(choices[1]!.classList.contains('is-dim')).toBe(true);
  });
});

describe('SmartphoneCallIn — typed call', () => {
  it('writes the line out and shows the kicker tag (not a big caller name)', () => {
    const call = buildCallInView('dying-soul')!;
    render({ call, textSpeedMs: 1 });
    expect(q('.callin-tag')?.textContent).toBe('no number · the afflicted');
    expect(q('.callin-caller')).toBeNull(); // typed calls have no big name
    // A couple of characters in, the typed node holds a prefix of the line.
    advance(3);
    const partial = q('.callin-text')?.textContent ?? '';
    expect(partial.length).toBeGreaterThan(0);
    expect(call.line.startsWith(partial)).toBe(true);
  });

  it('tapping the stage reveals the full line and the options at once', () => {
    const call = buildCallInView('dying-soul')!;
    render({ call, textSpeedMs: 32 });
    act(() => q('.callin-stage')!.click());
    expect(q('.callin-text')?.textContent).toBe(call.line);
    expect(all('.callin-choice')).toHaveLength(3);
  });
});

describe('SmartphoneCallIn — choosing', () => {
  it('fires onChoose, lights the pick, dims the rest, then resolves via onDone', () => {
    const chosen: number[] = [];
    let done = 0;
    const call = buildCallInView('eager-hands')!; // 3 choices
    render({ call, onChoose: (i) => chosen.push(i), onDone: () => (done += 1) });
    act(() => q('.callin-stage')!.click()); // skip to options
    const choices = all('.callin-choice');
    act(() => choices[0]!.click());
    expect(chosen).toEqual([0]);
    const after = all('.callin-choice');
    expect(after[0]!.classList.contains('is-chosen')).toBe(true);
    expect(after[1]!.classList.contains('is-faded')).toBe(true);
    expect(after[2]!.classList.contains('is-faded')).toBe(true);
    // Cadence: not done before 1650ms, done after.
    advance(1000);
    expect(done).toBe(0);
    advance(700);
    expect(done).toBe(1);
  });
});
