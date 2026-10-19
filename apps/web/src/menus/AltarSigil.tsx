import type { ReactElement } from 'react';

/* The in-room altar sigil (Claude Design "Altar sigil" handoff): the Katabasis trigger and the
   Status Quo shortcut, raised over the Altar Room when the altar is clicked. The room is not
   dimmed or replaced.

   The seal is grimoire chrome, not a diegetic element: it rides over the room's canvas as DOM,
   OUTSIDE the degradation pass, so it stays crisp (no pixelation, crush, grain or scanlines) at
   any stage size. Its motion is the handoff's CSS keyframes (menus.css, `kat-seal-*`). Only the
   seal and STATUS QUO take pointer events, so the room's hotspots keep working around them. */

/** The seal's art (the same glyph the prior full-screen gate used). */
export const ALTAR_SIGIL_SRC = '/assets/panvitium/katabasis/seal-panvitium.png';

/** How the Altar Room shows the sigil: its look, and whether it is fading away. */
export interface AltarSigilView {
  readonly armed: boolean;
  readonly fading: boolean;
}

interface AltarSigilProps extends AltarSigilView {
  onPress: () => void;
  onStatusQuo: () => void;
}

export function AltarSigil({ armed, fading, onPress, onStatusQuo }: AltarSigilProps): ReactElement {
  return (
    <div className={`altar-sigil${fading ? ' is-fading' : ''}`}>
      <div className="altar-sigil-wrap">
        <button
          type="button"
          className={`altar-sigil-btn${armed ? ' is-armed' : ''}`}
          onClick={onPress}
          aria-label={armed ? 'Confirm the descent — there is no return' : 'Press the sigil'}
        >
          {/* The span carries the pulse so it composes cleanly with the glyph's own vibration. */}
          <span className="altar-sigil-scale">
            <img
              className="altar-sigil-glyph"
              src={ALTAR_SIGIL_SRC}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </span>
        </button>
      </div>
      {!armed && (
        <div className="altar-sq-row">
          <button type="button" className="altar-sq" onClick={onStatusQuo}>
            Status Quo
          </button>
        </div>
      )}
    </div>
  );
}
