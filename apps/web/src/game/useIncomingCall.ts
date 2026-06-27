// The incoming-call scheduler (Claude Design "Smartphone Call-In System"). Owns the `ring` phase that
// lives in the room: during eligible active play it arms a call from the weighted bag after a
// randomised gap, swaps in the ringing studio plate + the looped vibration (the caller signalling
// from the desk), and runs the 15s ring window. The player answers by tapping the phone (App turns
// `answer()` into the full-screen `SmartphoneCallIn` overlay), or lets it ring out — a miss costs
// nothing (docs/PANVITIUM-CALLS-IN.md: every incoming call is opportunity-only).
//
// Active-play only, never offline, dark during Katabasis (06-smartphone-content.md §2): the caller's
// `enabled` gate (computed in App from the room/panel/title/Katabasis state) is the single switch —
// when it drops, a pending arrival is cancelled and any live ring is let go. The effect/firing
// cadence here is a UI-level placeholder; the spreadsheet-pinned weights and the real CALL_TRIGGERS
// engine are the documented future work, and answering applies no game state yet.
import { useCallback, useEffect, useRef, useState } from 'react';
import { pickIncomingCall } from './callIn.js';
import { VIBRATION_SRC } from '../menus/calls-in.data.js';

/** Ring window before an unanswered call is missed (docs: "Ring window is always 15 seconds"). */
const RING_WINDOW_MS = 15_000;
/** Quiet gap between the line clearing and the next call arriving — one incoming call every 10 min. */
const GAP_MS = 10 * 60 * 1000;
/** How many of the most recent calls a just-rung call is suppressed from — so the same call rings at
 *  most once every 5 calls (the previous 4 are excluded from the draw). */
const RECENT_WINDOW = 4;

export interface IncomingCallController {
  /** The id of the call currently ringing, or null when the line is quiet. */
  ringing: string | null;
  /** Answer the ringing call: stops the ring and returns its id (null if nothing was ringing). */
  answer: () => string | null;
  /** Let the ringing call go without answering (decline / explicit hang-up before pickup). */
  dismiss: () => void;
}

/**
 * @param enabled Whether a call may ring right now — eligible active play with the phone reachable
 *   (in the Studio, no panel/overlay open, not in the title or a descent). While false, no call
 *   arrives and any live ring is released.
 * @param eligibleIds The ids whose per-call requirements are currently met (see `eligibleCallIds`).
 *   The draw is restricted to these, so a call only rings when the game state allows it.
 */
export function useIncomingCall(
  enabled: boolean,
  eligibleIds: ReadonlySet<string>,
): IncomingCallController {
  const [ringing, setRinging] = useState<string | null>(null);
  const ringingRef = useRef<string | null>(null);
  // Latest eligibility set, read by the (deferred) arrival callback so it draws against current state.
  const eligibleRef = useRef(eligibleIds);
  eligibleRef.current = eligibleIds;
  // Once-only calls (lore, easter eggs) are consumed on ANSWER so they cannot be received twice; a
  // missed one may still ring again later. Session-scoped (no save change — additive-optional under
  // ADR-023 would persist this once the engine lands).
  const seen = useRef<Set<string>>(new Set());
  // The ids of the most recent calls that have RUNG (answered or missed), newest first, capped at
  // RECENT_WINDOW — the recency cooldown so the same call never repeats within 5 calls.
  const recent = useRef<string[]>([]);
  const enabledRef = useRef(enabled);

  const arrivalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vib = useRef<HTMLAudioElement | null>(null);

  const setRing = (id: string | null): void => {
    ringingRef.current = id;
    setRinging(id);
  };

  const stopVibration = useCallback((): void => {
    if (vib.current) {
      try {
        vib.current.pause();
      } catch {
        /* element already gone */
      }
      vib.current = null;
    }
  }, []);

  const startVibration = useCallback((): void => {
    stopVibration();
    try {
      const v = new Audio(VIBRATION_SRC);
      v.loop = true;
      v.preload = 'auto';
      vib.current = v;
      void v.play().catch(() => undefined); // autoplay may wait for a gesture — expected and fine
    } catch {
      /* no Audio (SSR/test) — the ring is silent but still arms */
    }
  }, [stopVibration]);

  const clearArrival = (): void => {
    if (arrivalTimer.current) {
      clearTimeout(arrivalTimer.current);
      arrivalTimer.current = null;
    }
  };
  const clearMiss = (): void => {
    if (missTimer.current) {
      clearTimeout(missTimer.current);
      missTimer.current = null;
    }
  };

  /** Release a ringing call (answered / missed / declined): stop the window, the haptics, the plate. */
  const endRing = useCallback((): void => {
    clearMiss();
    stopVibration();
    setRing(null);
  }, [stopVibration]);

  // Arm / disarm the line. Re-runs when eligibility or the ringing state flips; a pending arrival is
  // always torn down on cleanup so eligibility can never leak a stray ring into a new context.
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      clearArrival();
      if (ringingRef.current) endRing(); // left the desk mid-ring → the call is let go
      return;
    }
    if (ringingRef.current || arrivalTimer.current) return; // already ringing / already scheduled

    arrivalTimer.current = setTimeout(() => {
      arrivalTimer.current = null;
      if (!enabledRef.current || ringingRef.current) return;
      const id = pickIncomingCall(
        Math.random,
        seen.current,
        eligibleRef.current,
        new Set(recent.current),
      );
      if (!id) return;
      // Record the arrival for the recency cooldown (newest first, keep the last RECENT_WINDOW).
      recent.current = [id, ...recent.current].slice(0, RECENT_WINDOW);
      setRing(id);
      startVibration();
      missTimer.current = setTimeout(endRing, RING_WINDOW_MS);
    }, GAP_MS);

    return clearArrival;
  }, [enabled, ringing, endRing, startVibration]);

  // Final teardown on unmount.
  useEffect(
    () => () => {
      clearArrival();
      clearMiss();
      stopVibration();
    },
    [stopVibration],
  );

  const answer = useCallback((): string | null => {
    const id = ringingRef.current;
    if (!id) return null;
    seen.current.add(id); // received → a once-only call won't ring again
    endRing();
    return id;
  }, [endRing]);

  const dismiss = useCallback((): void => {
    if (ringingRef.current) endRing();
  }, [endRing]);

  return { ringing, answer, dismiss };
}
