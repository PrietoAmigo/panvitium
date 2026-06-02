import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { ASSET_BASE } from '../menus/degrade.data.js';
import { TitleMenu } from './TitleMenu.js';

/**
 * The launch experience: the title menu, its background music, and the cinematic Continue
 * transition. On Continue the screen fades to black while the music fades out over the same window
 * (`FADE_OUT_MS`); at full black the title is dismissed (unfreezing the sim and mounting the lair),
 * then the black fades out over `FADE_IN_MS` so the altar room rises slowly from darkness.
 *
 * This component persists in `App` across the title→lair handover (the menu unmounts mid-transition,
 * but the fade overlay and music live here), so the timeline isn't cut short.
 */

const MUSIC_URL = `${ASSET_BASE}/music/gnossienne_1.mp3`;
const MENU_MUSIC_VOLUME = 0.5;
const FADE_OUT_MS = 1200; // screen → black, and music → silence (same window, "proportional")
const FADE_IN_MS = 1800; // black → lair, the slow rise from darkness

type EntryPhase = 'idle' | 'out' | 'in';

/** Looping menu music via a plain HTML5 audio element (no new dependency). `state` drives it. */
function TitleMusic({
  state,
  fadeMs,
}: {
  state: 'play' | 'fade' | 'off';
  fadeMs: number;
}): ReactElement {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    if (state === 'play') {
      el.volume = MENU_MUSIC_VOLUME;
      const tryPlay = (): void => {
        try {
          void el.play().catch(() => {
            /* autoplay blocked until a user gesture — the listeners below retry */
          });
        } catch {
          /* media unsupported (e.g. test env) — ignore */
        }
      };
      tryPlay();
      // Browsers block audio before a user gesture; retry on the first interaction with the menu.
      const onGesture = (): void => {
        tryPlay();
        window.removeEventListener('pointerdown', onGesture);
        window.removeEventListener('keydown', onGesture);
      };
      window.addEventListener('pointerdown', onGesture);
      window.addEventListener('keydown', onGesture);
      return () => {
        window.removeEventListener('pointerdown', onGesture);
        window.removeEventListener('keydown', onGesture);
      };
    }

    if (state === 'fade') {
      const start = performance.now();
      const from = el.volume;
      let raf = 0;
      const step = (now: number): void => {
        const t = Math.min(1, (now - start) / fadeMs);
        el.volume = from * (1 - t);
        if (t < 1) raf = requestAnimationFrame(step);
        else el.pause();
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }

    el.pause();
    return undefined;
  }, [state, fadeMs]);

  return <audio ref={ref} src={MUSIC_URL} loop preload="auto" aria-hidden="true" />;
}

export function TitleSequence(): ReactElement | null {
  const titleOpen = useGameStore((s) => s.titleOpen);
  const dismissTitle = useGameStore((s) => s.dismissTitle);
  const [entry, setEntry] = useState<EntryPhase>('idle');

  // Nothing to render once the title is gone and no transition is mid-flight.
  if (!titleOpen && entry === 'idle') return null;

  const musicState = titleOpen && entry === 'idle' ? 'play' : entry === 'out' ? 'fade' : 'off';

  return (
    <>
      <TitleMusic state={musicState} fadeMs={FADE_OUT_MS} />
      {titleOpen && <TitleMenu onContinue={() => setEntry('out')} />}
      {entry === 'out' && (
        <div
          className="entry-fade entry-fade--out"
          style={{ animationDuration: `${FADE_OUT_MS}ms` }}
          onAnimationEnd={() => {
            dismissTitle();
            setEntry('in');
          }}
        />
      )}
      {entry === 'in' && (
        <div
          className="entry-fade entry-fade--in"
          style={{ animationDuration: `${FADE_IN_MS}ms` }}
          onAnimationEnd={() => setEntry('idle')}
        />
      )}
    </>
  );
}
