import { useEffect, useRef, useState, type ReactElement } from 'react';
import { DegradedScene, decodeImage, isImageDecoded } from '../menus/DegradedScene.js';
import { subliminalHoldMs } from '../game/subliminals.js';

/* A subliminal plate (App shows the head of the store's queue). It covers the whole viewport for its
   hold (`subliminalHoldMs`: 160 ms for the code plates and Fausto's, 50 ms for the rest) and clears
   itself. The plate composites THROUGH the degradation pass (a DegradedScene
   backdrop), so it pixelates at the same fidelity as the rooms. It waits, invisible, until the plate
   has decoded, so the flash is never a black frame; a plate that fails to load is skipped. Unlike the
   jumpscare it takes no input (pointer-events off): a click mid-flash still lands on the game. */
export function Subliminal({
  src,
  onDone,
}: {
  src: string;
  onDone: () => void;
}): ReactElement | null {
  const [decoded, setDecoded] = useState(() => isImageDecoded(src));
  // Latest callback, so a parent re-render (a fresh closure) never restarts the flash timer.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (decoded) return;
    let alive = true;
    decodeImage(src).then(
      () => {
        if (alive) setDecoded(true);
      },
      () => {
        if (alive) done.current();
      },
    );
    return () => {
      alive = false;
    };
  }, [src, decoded]);

  useEffect(() => {
    if (!decoded) return;
    const timer = window.setTimeout(() => done.current(), subliminalHoldMs(src));
    return () => window.clearTimeout(timer);
  }, [decoded, src]);

  if (!decoded) return null;
  return (
    <div className="subliminal-overlay" role="presentation" aria-hidden="true">
      {/* The room id only keys the room-change curtain; it never changes here, so none plays. */}
      <DegradedScene roomId="studio" backdrop={src} />
    </div>
  );
}
