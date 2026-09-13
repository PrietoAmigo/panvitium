import { useEffect, useState } from 'react';

/**
 * Tracks the `prefers-reduced-motion: reduce` media query, reactively. Used where motion is a
 * vestibular trigger and must be softened or held: the Fausto-curse "Vertigo" layer (App) and the
 * Desidia vessel's active-state turbulence (DesidiaHud). SSR-safe: defaults to false when
 * `matchMedia` is unavailable.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
