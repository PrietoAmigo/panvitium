/**
 * Render + behaviour tests for the answered call-in stage. These pin the FSM the design specifies: a
 * recording shows the big caller name + a "tap to skip" hint and reveals options when it finishes
 * (here: the safety timer, since jsdom has no real audio); a typed call writes its line out and shows
 * the kicker tag; tapping the stage skips ahead; picking an option fires `onChoose`, lights the pick
 * / dims the rest, and resolves to `onDone` after the fade cadence. Timers are faked so the async
 * reveals are deterministic. `DegradedScene` (a canvas the degradation pass paints) is stubbed —
 * jsdom has no 2D context, and these tests assert on the text layer, not the plate.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SmartphoneCallIn } from './SmartphoneCallIn.js';
import { buildCallInView, buildCallOutView, type CallInView } from '../game/callIn.js';
import { boundVisualsFor } from './degrade.data.js';
import type { BoundInvocationVisual } from './types.js';

// The stub records the figures each plate is handed, so the "invocations stay in the room" rule can
// be pinned without a canvas.
const sceneFigures: unknown[] = [];
vi.mock('./DegradedScene.js', () => ({
  DegradedScene: (props: { figures?: unknown }) => {
    sceneFigures.push(props.figures);
    return null;
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(props: {
  call: CallInView;
  onChoose?: (path: readonly number[]) => void;
  onDone?: () => void;
  textSpeedMs?: number;
  figures?: BoundInvocationVisual[];
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
        ...(props.figures !== undefined ? { figures: props.figures } : {}),
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

/** A synthetic typed (fileless) call — the catalogue is all-audio, but the FSM still supports typed. */
const TYPED: CallInView = {
  id: 'test-typed',
  audio: false,
  class: 'lore',
  tag: 'no number · the afflicted',
  caller: 'the afflicted',
  line: 'Please. Make it quiet.',
  recording: 'test-typed',
  skippable: true,
  choices: [
    { index: 0, label: 'Name a price', dim: false },
    { index: 1, label: 'Say nothing', dim: true },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  sceneFigures.length = 0;
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

describe('SmartphoneCallIn — a recording that cannot play', () => {
  /** Hand the component a real <audio> element we hold, so the test can fail its load. */
  function holdAudio(): HTMLAudioElement {
    const el = document.createElement('audio');
    vi.spyOn(window, 'Audio').mockImplementation(function () {
      return el;
    } as unknown as () => HTMLAudioElement);
    return el;
  }
  afterEach(() => vi.restoreAllMocks());

  it('writes out its typed line instead (its transcript)', () => {
    const el = holdAudio();
    const call = buildCallOutView('the-rectory')!;
    render({ call, textSpeedMs: 1 });
    expect(q('.callin-caller')).not.toBeNull(); // speaking: the recording's big name
    act(() => {
      el.dispatchEvent(new Event('error'));
    });
    expect(q('.callin-caller')).toBeNull();
    expect(q('.callin-tag')?.textContent).toBe(call.tag);
    act(() => q('.callin-stage')!.click()); // skip the typewriter
    expect(q('.callin-text')?.textContent).toBe('Father Anselm speaking.');
    expect(all('.callin-choice').map((c) => c.textContent)).toEqual([
      '—Scratches on a wall, tells you something?',
    ]);
  });

  it('keeps the safety timer when the recording has no typed line to fall back on', () => {
    const el = holdAudio();
    render({ call: buildCallInView('the-cycle-turns')! });
    act(() => {
      el.dispatchEvent(new Event('error'));
    });
    expect(q('.callin-caller')?.textContent).toBe('Gideon Reyes');
    expect(q('.callin-text')).toBeNull();
    advance(4001);
    expect(all('.callin-choice')).toHaveLength(3);
  });
});

describe('SmartphoneCallIn — typed call', () => {
  it('writes the line out and shows the kicker tag (not a big caller name)', () => {
    render({ call: TYPED, textSpeedMs: 1 });
    expect(q('.callin-tag')?.textContent).toBe('no number · the afflicted');
    expect(q('.callin-caller')).toBeNull(); // typed calls have no big name
    advance(3);
    const partial = q('.callin-text')?.textContent ?? '';
    expect(partial.length).toBeGreaterThan(0);
    expect(TYPED.line.startsWith(partial)).toBe(true);
  });

  it('tapping the stage reveals the full line and the options at once', () => {
    render({ call: TYPED, textSpeedMs: 32 });
    act(() => q('.callin-stage')!.click());
    expect(q('.callin-text')?.textContent).toBe(TYPED.line);
    expect(all('.callin-choice')).toHaveLength(2);
  });
});

describe('SmartphoneCallIn — choosing', () => {
  it('fires onChoose, lights the pick, dims the rest, then resolves via onDone', () => {
    const chosen: (readonly number[])[] = [];
    let done = 0;
    const call = buildCallInView('eager-hands')!; // 3 choices
    render({ call, onChoose: (i) => chosen.push(i), onDone: () => (done += 1) });
    act(() => q('.callin-stage')!.click()); // skip to options
    const choices = all('.callin-choice');
    act(() => choices[0]!.click());
    expect(chosen).toEqual([[0]]);
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

describe('SmartphoneCallIn — a conversation in beats', () => {
  it('plays the rectory: an answer leads to the next recording, the last answer ends the call', () => {
    const recordings: string[] = [];
    vi.spyOn(window, 'Audio').mockImplementation(function (src?: string) {
      recordings.push(src ?? '');
      return document.createElement('audio');
    } as unknown as () => HTMLAudioElement);
    const paths: (readonly number[])[] = [];
    let done = 0;
    render({
      call: buildCallOutView('the-rectory')!,
      onChoose: (p) => paths.push(p),
      onDone: () => (done += 1),
    });
    expect(recordings).toEqual(['/assets/panvitium/music/father_anselm_1.mp3']);
    advance(4001); // the first recording is over (the safety timer: jsdom plays nothing)
    act(() => all('.callin-choice')[0]!.click());
    expect(paths).toEqual([[0]]);
    // The pick holds lit, then Father Anselm speaks again; no options while he does.
    advance(950);
    expect(recordings[1]).toBe('/assets/panvitium/music/father_anselm_2.mp3');
    expect(all('.callin-choice')).toHaveLength(0);
    expect(q('.callin-caller')?.textContent).toBe('982 079');
    advance(12_001);
    const last = all('.callin-choice');
    expect(last.map((c) => c.textContent)).toEqual([
      "—Apologies. In case you have more information, here's my email [...]",
    ]);
    act(() => last[0]!.click());
    expect(paths).toEqual([[0], [0, 0]]);
    advance(1700);
    expect(done).toBe(1);
    vi.restoreAllMocks();
  });
});

describe('SmartphoneCallIn — the ward (unskippable, Imperium)', () => {
  const ward = (greaves: boolean): CallInView =>
    buildCallInView('the-ward', {
      katabasisCount: 0,
      fcFriendly: true,
      receivedEmailIds: new Set(greaves ? ['fr-greaves-1'] : []),
      unlockedActions: new Set(['imperium']),
    })!;

  it('cannot be skipped: no hint, and a tap on the stage does nothing', () => {
    render({ call: ward(true) });
    expect(q('.callin-caller')?.textContent).toBe('Fr. Emil Stahl');
    expect(q('.callin-hint')).toBeNull();
    act(() => q('.callin-stage')!.click());
    expect(all('.callin-choice')).toHaveLength(0);
    advance(4001);
    expect(all('.callin-choice').map((c) => c.textContent)).toEqual([
      '—Memento Claram, Aemili',
      '—Hang up',
    ]);
  });

  it('offers only "Hang up" before Father Greaves has written', () => {
    render({ call: ward(false) });
    advance(4001);
    expect(all('.callin-choice').map((c) => c.textContent)).toEqual(['—Hang up']);
  });

  it('holds three seconds of silence after Memento, then [IMPERIUM]; its recording ends the call', () => {
    const paths: (readonly number[])[] = [];
    let done = 0;
    render({ call: ward(true), onChoose: (p) => paths.push(p), onDone: () => (done += 1) });
    advance(4001);
    act(() => all('.callin-choice')[0]!.click()); // Memento Claram, Aemili
    expect(paths).toEqual([[0]]);
    advance(2990); // just short of three seconds from the pick: still silence
    expect(all('.callin-choice')).toHaveLength(0);
    act(() => q('.callin-stage')!.click()); // the silence cannot be skipped either
    expect(all('.callin-choice')).toHaveLength(0);
    advance(10); // three seconds from the pick
    const imperium = all('.callin-choice');
    expect(imperium.map((c) => c.textContent)).toEqual(['—[IMPERIUM]']);
    act(() => imperium[0]!.click());
    expect(paths).toEqual([[0], [0, 0]]);
    advance(950);
    expect(all('.callin-choice')).toHaveLength(0); // imperium.mp3 plays, no options, no hint
    expect(q('.callin-hint')).toBeNull();
    act(() => q('.callin-stage')!.click());
    expect(done).toBe(0);
    advance(4001 + 1700); // the recording ends (safety timer), then the call fades out
    expect(done).toBe(1);
  });
});

describe('SmartphoneCallIn — the room behind the call', () => {
  it('keeps the bound Studio invocations on both plates while the call is answered', () => {
    const figures = boundVisualsFor('studio', ['midas'], false);
    expect(figures.length).toBeGreaterThan(0);
    render({ call: buildCallInView('a-good-find')!, figures });
    // Base plate + answering plate, each composited with the Studio's figures.
    expect(sceneFigures.length).toBeGreaterThanOrEqual(2);
    for (const f of sceneFigures) expect(f).toBe(figures);
  });
});
