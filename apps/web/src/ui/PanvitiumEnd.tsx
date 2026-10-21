import { useEffect, useRef, useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';

/** How long the screen holds pure black before the wordmark appears. */
export const PANVITIUM_END_DELAY_MS = 1000;
/** How long the wordmark holds alone on the black before the game returns to the title. */
export const PANVITIUM_END_HOLD_MS = 5000;
/** The black lifting off the title menu, which rises beneath with its wordmark in the same place. */
export const PANVITIUM_END_LIFT_MS = 1200;

/**
 * The end of the game: the seal of Semet's second press. A black screen over everything, then after
 * 1 s the golden PANVITIUM wordmark, set exactly where the title menu sets it (the same
 * `.title-inner` column, with the tagline and entries laid out invisibly beneath it). After 5 s
 * `onReset` wipes the save and raises the title menu underneath; the black then lifts off it, so the
 * wordmark never moves, and `onDone` unmounts this layer.
 */
export function PanvitiumEnd({
  onReset,
  onDone,
}: {
  onReset: () => void;
  onDone: () => void;
}): ReactElement {
  const [shown, setShown] = useState(false);
  const [lifting, setLifting] = useState(false);
  const reset = useRef(onReset);
  const done = useRef(onDone);
  useEffect(() => {
    reset.current = onReset;
    done.current = onDone;
  });
  useEffect(() => {
    const timers = [
      setTimeout(() => setShown(true), PANVITIUM_END_DELAY_MS),
      setTimeout(() => {
        reset.current();
        setLifting(true);
      }, PANVITIUM_END_DELAY_MS + PANVITIUM_END_HOLD_MS),
      setTimeout(
        () => done.current(),
        PANVITIUM_END_DELAY_MS + PANVITIUM_END_HOLD_MS + PANVITIUM_END_LIFT_MS,
      ),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);
  const m = strings.menu;
  return (
    <div
      className={`panvitium-end${lifting ? ' is-lifting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={strings.appName}
      style={{ animationDuration: `${PANVITIUM_END_LIFT_MS}ms` }}
    >
      <div className="title-inner">
        <h1 className={`title-wordmark panvitium-end-mark${shown ? ' is-shown' : ''}`}>
          {strings.appName}
        </h1>
        {/* The title menu's column beneath the wordmark, laid out but unseen, so the wordmark
            stands exactly where the title menu's does. */}
        <div className="panvitium-end-ghost" aria-hidden="true">
          <p className="title-tagline">{m.tagline}</p>
          <div className="title-entries">
            {[m.continue, m.newGame, m.settings, m.about].map((label) => (
              <span key={label} className="title-entry">
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
