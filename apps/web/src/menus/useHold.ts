import { useRef, useCallback } from 'react';

// Press-and-hold: fires onTick repeatedly, the cadence ramping faster the longer you hold.
// Returns pointer handlers to spread onto a button. Used by the Katabasis offer/bind controls.
export function useHold(onTick: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rate = useRef(150);

  const stop = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    rate.current = 150;
  }, []);

  const start = useCallback(() => {
    stop();
    const step = () => {
      onTick();
      rate.current = Math.max(34, rate.current * 0.86);
      timer.current = setTimeout(step, rate.current);
    };
    step();
  }, [onTick, stop]);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      start();
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}
