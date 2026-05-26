/**
 * The game loop (ADR-004): one requestAnimationFrame driver with a fixed 100 ms (10 Hz) logical
 * tick and an accumulator, so a slow or backgrounded tab catches up correctly. Offline
 * progression already happened once at load (see store `init` -> `loadGame`); this drives the
 * live session and the debounced autosave.
 */
import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore.js';

const TICK_MS = 100;
const TICK_SECONDS = TICK_MS / 1000;
const MAX_CATCHUP_TICKS = 100_000; // guard against a pathological accumulator
const AUTOSAVE_MS = 15_000;

export function useGameLoop(): void {
  const init = useGameStore((s) => s.init);
  const advance = useGameStore((s) => s.advance);
  const persist = useGameStore((s) => s.persist);
  const ready = useGameStore((s) => s.ready);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;

    const step = (now: number): void => {
      accumulator += now - last;
      last = now;
      let ticks = 0;
      while (accumulator >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
        advance(TICK_SECONDS);
        accumulator -= TICK_MS;
        ticks += 1;
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [ready, advance]);

  useEffect(() => {
    if (!ready) return;
    const interval = window.setInterval(persist, AUTOSAVE_MS);
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') persist();
    };
    window.addEventListener('beforeunload', persist);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', persist);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [ready, persist]);
}
