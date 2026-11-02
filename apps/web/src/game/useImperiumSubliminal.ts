import { useCallback, useEffect, useRef } from 'react';
import { preloadImage } from '../menus/DegradedScene.js';
import { IMPERIUM_SUBLIMINAL, IMPERIUM_SUBLIMINAL_DELAY_MS } from './subliminals.js';

/** App owns this countdown: the call fades away before the five seconds have elapsed. Only an
 *  actual recording-ended event starts it; the call's safety/skip fallback must never do so. */
export function useImperiumSubliminal(flash: (src: string) => void): (recording: string) => void {
  const latestFlash = useRef(flash);
  latestFlash.current = flash;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    },
    [],
  );

  return useCallback((recording: string) => {
    if (recording !== 'imperium' || timer.current !== null) return;
    // Decode during the gap so the flash's hold is spent on the artwork, never a loading frame.
    preloadImage(IMPERIUM_SUBLIMINAL);
    timer.current = setTimeout(() => {
      timer.current = null;
      latestFlash.current(IMPERIUM_SUBLIMINAL);
    }, IMPERIUM_SUBLIMINAL_DELAY_MS);
  }, []);
}
