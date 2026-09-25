import { useEffect, type ReactElement } from 'react';
import { maleficiumView } from '../game/maleficia.js';
import { MaleficiumUnveiling } from '../menus/MaleficiumUnveiling.js';
import { useGameStore } from '../store/gameStore.js';
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js';

/**
 * Plays the store's Unveiling queue (the maleficia Emptio has just brought home) one relic at a
 * time, never overlapping: each is keyed by its acquisition `seq`, so it mounts fresh and a second
 * copy of the same relic plays its own. App mounts this only while nothing should hold it back (no
 * descent, answered call or jumpscare); the queue waits in the store until then.
 */
export function Unveiling(): ReactElement | null {
  const head = useGameStore((s) => s.unveilQueue[0] ?? null);
  const dismiss = useGameStore((s) => s.dismissUnveiling);
  const reducedMotion = usePrefersReducedMotion();
  const item = head ? maleficiumView(head.id) : undefined;
  const unknown = head !== null && item === undefined;

  // An id the catalog no longer knows (defensive: acquisitions come from the catalog) is skipped.
  useEffect(() => {
    if (unknown && head) dismiss(head.seq);
  }, [unknown, head, dismiss]);

  if (!head || !item) return null;
  return (
    <MaleficiumUnveiling
      key={head.seq}
      item={item}
      reducedMotion={reducedMotion}
      onDone={() => dismiss(head.seq)}
    />
  );
}
