import { useCallback, useEffect, useReducer } from 'react';

/**
 * The in-room altar sigil's state machine (Claude Design "Altar sigil" handoff). Clicking the
 * altar raises the Katabasis sigil over the room with STATUS QUO beneath it; the first press on
 * the sigil arms it, the second commits the descent. Left alone it fades away:
 *
 *   off ──altar──▶ shown ──press──▶ armed ──press──▶ descend
 *    ▲               └──STATUS QUO──▶ the Ledger
 *    └── 4 s untouched (shown or armed) ── fading 0.5 s ──┘
 *
 * Local UI state only: nothing here is persisted, and the descent / Status Quo themselves stay
 * with the store (`beginKatabasis`, `openKatabasis`), which the caller supplies.
 */

/** How long the sigil waits for a press before fading (the prior gate's auto-disarm window). */
export const ALTAR_SIGIL_IDLE_MS = 4000;
/** The fade that follows the idle timeout. */
export const ALTAR_SIGIL_FADE_MS = 500;

export type AltarSigilPhase = 'off' | 'shown' | 'armed' | 'fading';

export interface AltarSigilState {
  readonly phase: AltarSigilPhase;
  /** The look on screen. Armed from the first press, and kept through the fade that follows. */
  readonly armed: boolean;
  /** Bumped whenever the idle timer restarts without a phase change (the altar clicked again). */
  readonly epoch: number;
}

/**
 * What can happen to the sigil: the altar hotspot is clicked (`altar`), the sigil is pressed
 * (`press`), it is put away at once (`dismiss`: STATUS QUO, a door, the descent), the idle timer
 * runs out (`idle`), or its fade ends (`faded`).
 */
export type AltarSigilEvent = 'altar' | 'press' | 'dismiss' | 'idle' | 'faded';

export const ALTAR_SIGIL_OFF: AltarSigilState = { phase: 'off', armed: false, epoch: 0 };

export function altarSigilReducer(s: AltarSigilState, e: AltarSigilEvent): AltarSigilState {
  switch (e) {
    case 'altar':
      // An armed sigil stays armed (its timer restarts); otherwise it shows, disarmed, afresh.
      return s.phase === 'armed'
        ? { ...s, epoch: s.epoch + 1 }
        : { phase: 'shown', armed: false, epoch: s.epoch + 1 };
    case 'press':
      if (s.phase === 'shown') return { phase: 'armed', armed: true, epoch: s.epoch + 1 };
      // The second press is the descent; the caller commits it, and the sigil goes.
      if (s.phase === 'armed') return { ...s, phase: 'off', armed: false };
      return s; // a fading sigil no longer answers
    case 'dismiss':
      return s.phase === 'off' ? s : { ...s, phase: 'off', armed: false };
    case 'idle':
      return s.phase === 'shown' || s.phase === 'armed' ? { ...s, phase: 'fading' } : s;
    case 'faded':
      return s.phase === 'fading' ? { ...s, phase: 'off', armed: false } : s;
  }
}

export interface AltarSigil {
  readonly phase: AltarSigilPhase;
  readonly armed: boolean;
  /** The altar hotspot was clicked: show the sigil (or restart its timer). */
  showAltar: () => void;
  /** The sigil was pressed: arm it, or, once armed, commit the descent. */
  press: () => void;
  /** STATUS QUO: put the sigil away and open the Ledger. */
  statusQuo: () => void;
  /** Put the sigil away at once (a door, leaving the room, another screen taking over). */
  dismiss: () => void;
}

export function useAltarSigil({
  onDescend,
  onStatusQuo,
}: {
  onDescend: () => void;
  onStatusQuo: () => void;
}): AltarSigil {
  const [s, dispatch] = useReducer(altarSigilReducer, ALTAR_SIGIL_OFF);

  // One idle timeout and one fade timeout; the cleanup clears whichever is pending on every
  // transition, on every restart (epoch), and on unmount.
  useEffect(() => {
    if (s.phase === 'shown' || s.phase === 'armed') {
      const id = setTimeout(() => dispatch('idle'), ALTAR_SIGIL_IDLE_MS);
      return () => clearTimeout(id);
    }
    if (s.phase === 'fading') {
      const id = setTimeout(() => dispatch('faded'), ALTAR_SIGIL_FADE_MS);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [s.phase, s.epoch]);

  // Stable, so effects may depend on them.
  const showAltar = useCallback(() => dispatch('altar'), []);
  const dismiss = useCallback(() => dispatch('dismiss'), []);

  return {
    phase: s.phase,
    armed: s.armed,
    showAltar,
    press: () => {
      const descend = s.phase === 'armed';
      dispatch('press');
      if (descend) onDescend();
    },
    statusQuo: () => {
      dispatch('dismiss');
      onStatusQuo();
    },
    dismiss,
  };
}
