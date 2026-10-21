// The random-subliminal scheduler. During eligible play it rolls, once per 100 ms check, whether a
// random plate surfaces now: a Poisson process averaging one plate every six minutes, so the gaps are
// never clockwork. The next plate is picked (and decoded) ahead of time, so it flashes on time. The
// two code plates join the draw only while `withCodes` holds (`codePlatesShown`).
// Presentation only, like the call-in scheduler: it draws from Math.random, never the sim's RNG.
import { useEffect, useRef } from 'react';
import { preloadImage } from '../menus/DegradedScene.js';
import { isCodeSubliminal, pickRandomSubliminal, subliminalChance } from './subliminals.js';

const CHECK_MS = 100;
/** The most play a single check may count: a long-throttled or slept tab does not flash on return. */
const MAX_STEP_MS = 1000;

/**
 * @param enabled Whether a random plate may surface right now (live play, no title, descent, answered
 *   call or jumpscare). While false no time accrues toward the next plate.
 * @param withCodes Whether the two code plates are in the draw (`codePlatesShown`).
 * @param flash Queues a plate to flash (the store's `flashSubliminal`).
 */
export function useRandomSubliminals(
  enabled: boolean,
  withCodes: boolean,
  flash: (src: string) => void,
): void {
  const flashRef = useRef(flash);
  flashRef.current = flash;
  const next = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // Stage the next plate, re-picking a staged code plate the draw no longer allows (the effect
    // re-arms whenever the code plates come in or go out; the arrivals are memoryless, so nothing
    // is lost by restarting the clock).
    let staged = next.current;
    if (staged === null || (!withCodes && isCodeSubliminal(staged))) {
      staged = pickRandomSubliminal(Math.random(), null, withCodes);
    }
    next.current = staged;
    preloadImage(staged);
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(now - last, MAX_STEP_MS);
      last = now;
      // A hidden tab is not play: nobody would see the plate.
      if (document.visibilityState !== 'visible') return;
      if (Math.random() >= subliminalChance(elapsed)) return;
      const src = next.current ?? pickRandomSubliminal(Math.random(), null, withCodes);
      flashRef.current(src);
      next.current = pickRandomSubliminal(Math.random(), src, withCodes);
      preloadImage(next.current);
    }, CHECK_MS);
    return () => window.clearInterval(id);
  }, [enabled, withCodes]);
}
