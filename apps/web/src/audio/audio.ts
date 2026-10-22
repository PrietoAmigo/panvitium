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
  // A delivered email worth a cue: the Fausto Cescru #5 door-knock (05, ADR-014).
  | 'email-knock'
  // The Banshee's scream: a rare cue on her successful summon (see `summonCue`).
  | 'banshee-scream';

/** The one-shot SFX file for each cue that has audio direction; absent cues stay silent. */
const CUE_SRC: Partial<Record<AudioEvent, string>> = {
  'email-knock': `${ASSET_BASE}/music/knock-door_left.mp3`,
  'banshee-scream': `${ASSET_BASE}/music/banshee_scream.mp3`,
};

/** Chance that a successful Banshee summon lets out her scream, once she is ready to scream. */
export const BANSHEE_SCREAM_CHANCE = 0.1;

/**
 * She screams at most once in every this many Banshee summons: a scream silences the next 32
 * summons, and the 33rd after it may scream again.
 */
export const BANSHEE_SCREAM_EVERY = 33;

/** The count at which she may scream again (also the cap, and the start before any scream). */
const SCREAM_READY = BANSHEE_SCREAM_EVERY - 1;

/**
 * The Banshee summons since her last scream, kept on this device under its own key. Like the
 * Settings switches (`store/preferences.ts`) it is presentation, not game state: it never enters the
 * save. Reading never throws (absent, corrupt or blocked reads as ready), and a failed write is
 * ignored.
 */
const SCREAM_KEY = 'panvitium:banshee-scream';

function loadSummonsSinceScream(): number {
  try {
    const raw = localStorage.getItem(SCREAM_KEY);
    if (raw === null) return SCREAM_READY;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? Math.min(n, SCREAM_READY) : SCREAM_READY;
  } catch {
    return SCREAM_READY;
  }
}

function saveSummonsSinceScream(n: number): void {
  try {
    localStorage.setItem(SCREAM_KEY, String(n));
  } catch {
    // Best effort: a full or blocked store only loosens the lockout.
  }
}

/**
 * One successful Banshee summon's scream decision (pure): she screams on a roll under
 * `BANSHEE_SCREAM_CHANCE`, but only once `BANSHEE_SCREAM_EVERY − 1` summons have passed since her
 * last scream. Returns whether she screams and the new count (0 after a scream, else one more,
 * capped at ready).
 */
export function bansheeScream(
  summonsSinceScream: number,
  roll: number,
): { scream: boolean; summonsSinceScream: number } {
  if (summonsSinceScream >= SCREAM_READY && roll < BANSHEE_SCREAM_CHANCE) {
    return { scream: true, summonsSinceScream: 0 };
  }
  return { scream: false, summonsSinceScream: Math.min(summonsSinceScream + 1, SCREAM_READY) };
}

/**
 * The cue (if any) a successful summon of `invocationId` sounds (the caller rolls it only once
 * the summon has taken). A Banshee summon advances her device-local scream count. Presentation
 * only: the roll is the browser's `Math.random`, never the sim's seeded RNG (ADR-011), so a scream
 * leaves the save's sequence untouched. `roll` is injectable for tests.
 */
export function summonCue(invocationId: string, roll: number = Math.random()): AudioEvent | null {
  if (invocationId !== 'banshee') return null;
  const next = bansheeScream(loadSummonsSinceScream(), roll);
  saveSummonsSinceScream(next.summonsSinceScream);
  return next.scream ? 'banshee-scream' : null;
}

const CUE_VOLUME = 0.7;

/** Construct and play a one-shot element. Returns the play() promise (rejects if autoplay-blocked). */
function playOnce(src: string): Promise<void> {
  const el = new Audio(src);
  el.volume = CUE_VOLUME;
  return el.play();
}

// A cue can fire from a background tick (the 10 Hz loop) rather than from a click, so the browser
// may refuse it for lack of a user gesture. When
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
