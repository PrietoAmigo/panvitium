/**
 * Audio facade (ADR-014). Howler.js is the reserved library; until audio direction is fully set
 * the facade plays the handful of cues that already have assets through plain HTML5 audio (the same
 * no-new-dependency approach as the title/Katabasis music). Calling `audio.play(event)` at every
 * architecturally significant moment means populating the rest is a content task, not a refactor —
 * add the asset to `CUE_SRC` and it sounds. Swap this body for Howler when richer mixing is needed.
 */
import { ASSET_BASE } from '../menus/degrade.data.js';

export type AudioEvent =
  | 'room-change'
  | 'panel-open'
  | 'panel-close'
  | 'katabasis'
  | 'invocation-summon'
  | 'maleficium-acquired'
  | 'outcome-stellar'
  | 'outcome-apocalyptic'
  | 'panvitium-activate'
  // A delivered email worth a cue: the Fausto Cescru #5 door-knock (05, ADR-014).
  | 'email-knock';

/** The one-shot SFX file for each cue that has audio direction; absent cues stay silent. */
const CUE_SRC: Partial<Record<AudioEvent, string>> = {
  'email-knock': `${ASSET_BASE}/music/knock-door_left.mp3`,
};

const CUE_VOLUME = 0.7;

/** Construct and play a one-shot element. Returns the play() promise (rejects if autoplay-blocked). */
function playOnce(src: string): Promise<void> {
  const el = new Audio(src);
  el.volume = CUE_VOLUME;
  return el.play();
}

// A cue can fire from a background tick (the 10 Hz loop, or the offline catch-up replayed on
// resume) rather than from a click, so the browser may refuse it for lack of a user gesture. When
// that happens we stash the latest cue and replay it on the next pointer/key event — the same
// gesture-retry the title music uses. One listener pair at a time; the newest cue wins.
let pendingSrc: string | null = null;
let waitingForGesture = false;

function retryOnGesture(src: string): void {
  if (typeof window === 'undefined') return; // no DOM (e.g. test/SSR) — give up silently
  pendingSrc = src;
  if (waitingForGesture) return;
  waitingForGesture = true;
  const fire = (): void => {
    window.removeEventListener('pointerdown', fire);
    window.removeEventListener('keydown', fire);
    waitingForGesture = false;
    const s = pendingSrc;
    pendingSrc = null;
    if (s !== null) void playOnce(s).catch(() => undefined); // post-gesture; if it still fails, drop it
  };
  window.addEventListener('pointerdown', fire);
  window.addEventListener('keydown', fire);
}

export const audio = {
  play(event: AudioEvent): void {
    const src = CUE_SRC[event];
    if (src === undefined) return; // no asset for this cue yet — intentionally silent
    try {
      void playOnce(src).catch(() => retryOnGesture(src));
    } catch {
      /* Audio unavailable (e.g. SSR/test env) — ignore */
    }
  },
};
