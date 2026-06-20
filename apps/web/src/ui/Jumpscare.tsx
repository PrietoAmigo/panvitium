import { useEffect, type ReactElement } from 'react';
import { DegradedScene } from '../menus/DegradedScene.js';
import { ASSET_BASE } from '../menus/degrade.data.js';

/* The one-time Doppelgänger jumpscare (App orchestrates when it fires). A full-screen plate that
   covers everything and a stab of audio, both held for exactly DURATION_MS. The plate composites
   THROUGH the degradation pass (it is a DegradedScene backdrop), so it crushes/pixelates at the same
   fidelity as the rooms — per the brief, the degrade filter applies to it too. The overlay swallows
   all pointer input (it sits over the whole viewport with no dismiss affordance), so the player can
   neither interact with anything underneath nor skip the scare; it ends only when the timer fires. */

/** The full-screen scare plate. Exported so the orchestrator can `preloadImage` it the moment the
 *  scare arms — that decode-ahead is what lets the overlay paint the picture on its first frame
 *  instead of flashing black while it loads. */
export const JUMPSCARE_IMG = `${ASSET_BASE}/doppelganger_jumpscare.png`;
const JUMPSCARE_SFX = `${ASSET_BASE}/music/jumpscare.wav`;
/** The scare (image + audio) holds for exactly two seconds, then clears. */
const DURATION_MS = 2000;

export function Jumpscare({ onDone }: { onDone: () => void }): ReactElement {
  useEffect(() => {
    // The scare always fires from a click (the interaction it replaces), so autoplay is unblocked.
    let el: HTMLAudioElement | null = null;
    try {
      el = new Audio(JUMPSCARE_SFX);
      el.volume = 1;
      void el.play().catch(() => undefined);
    } catch {
      /* Audio unavailable (e.g. SSR/test env) — the visual still fires. */
    }
    const timer = window.setTimeout(onDone, DURATION_MS);
    return () => {
      window.clearTimeout(timer);
      // Cut the audio at the 2s mark too, so sound and image end together even if the clip is longer.
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
    };
  }, [onDone]);

  // No onClick / key handler and pointer-events on (via CSS): clicks land here and do nothing, so the
  // scare cannot be skipped and nothing underneath is interactable while it shows.
  return (
    <div className="jumpscare-overlay" role="presentation" aria-hidden="true">
      <DegradedScene roomId="studio" backdrop={JUMPSCARE_IMG} />
    </div>
  );
}
