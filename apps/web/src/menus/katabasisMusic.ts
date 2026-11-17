import { useEffect, type RefObject } from 'react';

/**
 * The Katabasis ambient score: one looping HTML5 audio element (the same no-new-dependency approach
 * as the title music, ADR-014) whose volume is driven along a fade by `useAmbientScore`. Where it
 * heads, and how long it takes, is the caller's (each Katabasis screen sets its own course).
 */

/** The score's file, served by Vite from apps/web/public. */
export const KATABASIS_MUSIC_SRC = '/assets/panvitium/music/katabasis_ambient.mp3';

/** The score at full presence, while the player is down among the Princes and the seals. */
export const KATABASIS_MUSIC_VOLUME = 0.4;

/**
 * The volume a fade from `from` to `to` sounds at a fraction `t` (0..1) of its way. The amplitude
 * moves along a square curve, so the loudness the ear hears moves roughly evenly: rising, the score
 * creeps out of the silence and swells late; falling, it gives way early and thins slowly into the
 * silence (the time-reverse of the rise). It sits exactly at `from` at the start and exactly at
 * `to` at the end.
 */
export function fadeVolume(from: number, to: number, t: number): number {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const v = to >= from ? from + (to - from) * t * t : to + (from - to) * (1 - t) * (1 - t);
  return Math.max(0, Math.min(1, v));
}

/**
 * Drive the score in `ref` from wherever it stands to `target` over `ms`, starting the moment the
 * course changes. The element starts silent; it plays whenever the course heads above silence and
 * pauses once a fade lands on it. The fade is timed against the clock, not counted in frames, so a
 * slow or throttled frame never stretches it. The score never outlives its element's owner.
 */
export function useAmbientScore(
  ref: RefObject<HTMLAudioElement>,
  target: number,
  ms: number,
): void {
  useEffect(() => {
    const a = ref.current;
    return () => a?.pause();
  }, [ref]);

  useEffect(() => {
    const a = ref.current;
    if (!a) return undefined;
    if (!a.src) {
      a.src = KATABASIS_MUSIC_SRC;
      a.volume = 0;
      a.onerror = () => undefined;
    }
    if (target > 0) {
      try {
        void a.play()?.catch(() => undefined);
      } catch {
        /* media unsupported (e.g. test env) - ignore */
      }
    }
    const from = a.volume;
    const land = (): void => {
      a.volume = target;
      if (target === 0) a.pause();
    };
    if (from === target || ms <= 0) {
      land();
      return undefined;
    }
    const start = performance.now();
    let raf = 0;
    const step = (): void => {
      const t = (performance.now() - start) / ms;
      if (t >= 1) {
        land();
        return;
      }
      a.volume = fadeVolume(from, target, t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ref, target, ms]);
}
