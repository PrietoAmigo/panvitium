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

export const audio = {
  play(event: AudioEvent): void {
    const src = CUE_SRC[event];
    if (src === undefined) return; // no asset for this cue yet — intentionally silent
    try {
      const el = new Audio(src);
      el.volume = CUE_VOLUME;
      // Autoplay may be blocked until the first user gesture; by the time a cue fires the player has
      // already interacted with the game, so this normally sounds. Swallow the rejection regardless.
      void el.play().catch(() => {
        /* autoplay blocked or media unsupported (e.g. test env) — ignore */
      });
    } catch {
      /* Audio unavailable (e.g. SSR/test env) — ignore */
    }
  },
};
