import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';

/* The empty-handed warning (Claude Design "Empty-Handed Warning" handoff). The first time in a
   playthrough the altar sigil is committed with no souls in hand, the descent is stopped: the
   screen goes black, one line surfaces in yellow italic, sinks, and the black lifts back onto the
   Altar Room. App orchestrates when it fires; the store records that it has played. Like the
   Katabasis transits it cannot be skipped: the overlay swallows every click and has no key
   handler, and it ends only when its timeline does. */

/** The black fades in over the room. */
export const EMPTY_HANDED_BLACK_IN_MS = 600;
/** When the words begin to surface (just after the black has settled). */
export const EMPTY_HANDED_TEXT_AT_MS = 700;
/** The words surface: fade in and come into focus. */
export const EMPTY_HANDED_TEXT_IN_MS = 1400;
/** How long the words hold once fully surfaced. */
export const EMPTY_HANDED_HOLD_MS = 3500;
/** The words sink: fade out and blur. */
export const EMPTY_HANDED_TEXT_OUT_MS = 900;
/** The black lifts off the room. */
export const EMPTY_HANDED_BLACK_OUT_MS = 800;

const SINK_AT = EMPTY_HANDED_TEXT_AT_MS + EMPTY_HANDED_TEXT_IN_MS + EMPTY_HANDED_HOLD_MS;
const LIFT_AT = SINK_AT + EMPTY_HANDED_TEXT_OUT_MS;
/** The whole sequence, black in to black out: the overlay unmounts after exactly this long. */
export const EMPTY_HANDED_TOTAL_MS = LIFT_AT + EMPTY_HANDED_BLACK_OUT_MS;

/** dark: black in, words hidden · speak: words surface and hold · sink: words go · lift: black goes. */
type Step = 'dark' | 'speak' | 'sink' | 'lift';

export function EmptyHandedWarning({ onDone }: { onDone: () => void }): ReactElement {
  const [step, setStep] = useState<Step>('dark');
  // With no way to skip, the timeline is the only exit: a re-render handing in a fresh `onDone`
  // must not restart it, so it is armed once per mount and reads the latest callback through a ref
  // (the TRANSIT_HOLD_MS lesson).
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep('speak'), EMPTY_HANDED_TEXT_AT_MS),
      setTimeout(() => setStep('sink'), SINK_AT),
      setTimeout(() => setStep('lift'), LIFT_AT),
      setTimeout(() => done.current(), EMPTY_HANDED_TOTAL_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const durations = {
    '--ehw-black-in': `${EMPTY_HANDED_BLACK_IN_MS}ms`,
    '--ehw-black-out': `${EMPTY_HANDED_BLACK_OUT_MS}ms`,
    '--ehw-text-in': `${EMPTY_HANDED_TEXT_IN_MS}ms`,
    '--ehw-text-out': `${EMPTY_HANDED_TEXT_OUT_MS}ms`,
  } as CSSProperties;

  // No onClick / key handler and pointer-events on (via CSS): clicks land here and do nothing, so
  // the warning cannot be skipped and the room underneath is not interactable while it shows.
  return (
    <div className="empty-handed" data-step={step} role="alert" style={durations}>
      <p className="empty-handed-line">{strings.katabasis.emptyHanded}</p>
    </div>
  );
}
