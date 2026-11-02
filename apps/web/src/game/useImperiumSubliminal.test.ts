import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, Fragment, StrictMode, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SmartphoneCallIn } from '../menus/SmartphoneCallIn.js';
import { preloadImage } from '../menus/DegradedScene.js';
import { Subliminal } from '../ui/Subliminal.js';
import type { CallInView } from './callIn.js';
import { IMPERIUM_SUBLIMINAL } from './subliminals.js';
import { useImperiumSubliminal } from './useImperiumSubliminal.js';

vi.mock('../menus/DegradedScene.js', () => ({
  DegradedScene: () => null,
  preloadImage: vi.fn(),
  isImageDecoded: () => true,
  decodeImage: vi.fn(),
}));

let root: Root | null = null;
let container: HTMLDivElement;
const voices: HTMLAudioElement[] = [];
const flash = vi.fn();

function Probe({
  recording,
  skippable,
}: {
  recording: string;
  skippable: boolean;
}): ReactElement | null {
  const [plate, setPlate] = useState<string | null>(null);
  const ended = useImperiumSubliminal((src) => {
    flash(src);
    setPlate(src);
  });
  const [onCall, setOnCall] = useState(true);
  const call: CallInView = {
    id: 'test-recording',
    audio: true,
    class: 'lore',
    tag: 'the ward',
    caller: 'Fr. Emil Stahl',
    line: '',
    recording,
    skippable,
    choices: [],
  };
  return createElement(
    Fragment,
    null,
    onCall
      ? createElement(SmartphoneCallIn, {
          call,
          onChoose: () => undefined,
          onDone: () => setOnCall(false),
          onRecordingEnded: ended,
        })
      : null,
    plate ? createElement(Subliminal, { src: plate, onDone: () => setPlate(null) }) : null,
  );
}

const advance = (ms: number): void => {
  act(() => vi.advanceTimersByTime(ms));
};
const end = (voice = voices.at(-1)!): void => {
  act(() => voice.dispatchEvent(new Event('ended')));
};
function render(recording = 'imperium', skippable = false): void {
  act(() =>
    root!.render(createElement(StrictMode, null, createElement(Probe, { recording, skippable }))),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  flash.mockClear();
  vi.mocked(preloadImage).mockClear();
  voices.length = 0;
  vi.spyOn(window, 'Audio').mockImplementation(function () {
    const voice = document.createElement('audio');
    voice.play = vi.fn().mockResolvedValue(undefined);
    voice.pause = vi.fn();
    voices.push(voice);
    return voice;
  } as unknown as () => HTMLAudioElement);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the Imperium recording’s delayed subliminal', () => {
  it('waits exactly five seconds from audio end, survives the call unmounting and flashes once', () => {
    render();
    advance(1200);
    expect(flash).not.toHaveBeenCalled();
    // StrictMode's rehearsal audio is stale; only the live recording may start the countdown.
    end(voices[0]!);
    expect(preloadImage).not.toHaveBeenCalled();
    end();
    expect(preloadImage).toHaveBeenCalledWith(IMPERIUM_SUBLIMINAL);
    advance(150);
    end(); // duplicate ended event cannot reschedule it
    advance(1500);
    expect(container.querySelector('.callin-stage')).toBeNull();
    advance(3349);
    expect(flash).not.toHaveBeenCalled();
    advance(1);
    expect(flash).toHaveBeenCalledTimes(1);
    expect(flash).toHaveBeenCalledWith(IMPERIUM_SUBLIMINAL);
    expect(container.querySelector('.subliminal-overlay')).not.toBeNull();
    advance(159);
    expect(container.querySelector('.subliminal-overlay')).not.toBeNull();
    advance(1);
    expect(container.querySelector('.subliminal-overlay')).toBeNull();
    advance(5000);
    expect(flash).toHaveBeenCalledTimes(1);
  });

  it('never flashes for another recording', () => {
    render('the-ward');
    end();
    advance(10_000);
    expect(preloadImage).not.toHaveBeenCalled();
    expect(flash).not.toHaveBeenCalled();
  });

  it('never treats the missing-audio safety timeout or a late ended event as completion', () => {
    render();
    advance(4001);
    end();
    advance(10_000);
    expect(flash).not.toHaveBeenCalled();
    expect(preloadImage).not.toHaveBeenCalled();
  });

  it('never flashes for skipped audio', () => {
    render('imperium', true);
    act(() => container.querySelector<HTMLElement>('.callin-stage')!.click());
    end();
    advance(10_000);
    expect(flash).not.toHaveBeenCalled();
  });

  it('cancels the countdown when the app owner unmounts', () => {
    render();
    end();
    advance(1000);
    act(() => root!.unmount());
    root = null;
    advance(5000);
    expect(flash).not.toHaveBeenCalled();
  });
});
