import type { ReactElement } from 'react';

/* The in-room altar sigil (Claude Design "Altar sigil" handoff): the Katabasis trigger and the
   Status Quo shortcut, raised over the Altar Room when the altar is clicked. The room is not
   dimmed or replaced.

   The seal and the STATUS QUO label are grimoire chrome, not diegetic elements: they ride over
   the room's canvas as DOM, OUTSIDE the degradation pass, so they stay crisp (no pixelation,
   crush, grain or scanlines) at any stage size. The light they cast is the room's, though: the
   seal's glow and aura and the label's bloom and line are painted INTO the pass (altarGlow.ts),
   at the hidden anchors below, which carry their geometry and CSS motion (menus.css). Only the
   seal and STATUS QUO take pointer events, so the room's hotspots keep working around them. */

/** The seal's art (the same glyph the prior full-screen gate used). */
export const ALTAR_SIGIL_SRC = '/assets/panvitium/katabasis/seal-panvitium.png';

/** The golden seal of Semet (#32, the same art the Aether vault and the Ledger use), raised in the
 *  sigil's place once the Ninth is named. */
export const SEMET_SIGIL_SRC = '/assets/panvitium/katabasis/sigils/32.png';

/** How the Altar Room shows the sigil: its look, and whether it is fading away. */
export interface AltarSigilView {
  readonly armed: boolean;
  readonly fading: boolean;
  /** Semet is named: the golden seal of Semet, whose commit ends the game, not the descent. */
  readonly semet?: boolean;
}

interface AltarSigilProps extends AltarSigilView {
  onPress: () => void;
  onStatusQuo: () => void;
}

export function AltarSigil({
  armed,
  fading,
  semet = false,
  onPress,
  onStatusQuo,
}: AltarSigilProps): ReactElement {
  const label = semet
    ? armed
      ? 'Confirm — this is the end'
      : 'Press the seal of Semet'
    : armed
      ? 'Confirm the descent — there is no return'
      : 'Press the sigil';
  return (
    <div className={`altar-sigil${fading ? ' is-fading' : ''}`}>
      <div className="altar-sigil-wrap">
        <button
          type="button"
          className={`altar-sigil-btn${armed ? ' is-armed' : ''}${semet ? ' is-semet' : ''}`}
          onClick={onPress}
          aria-label={label}
        >
          {/* The span carries the pulse so it composes cleanly with the glyph's own vibration. */}
          <span className="altar-sigil-scale">
            <span className="altar-sigil-aura" aria-hidden="true" />
            <img
              className="altar-sigil-glyph"
              src={semet ? SEMET_SIGIL_SRC : ALTAR_SIGIL_SRC}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </span>
        </button>
      </div>
      {/* The seal of Semet has no Status Quo: there is no standing left to read, only the end. */}
      {!armed && !semet && (
        <div className="altar-sq-row">
          <button type="button" className="altar-sq" onClick={onStatusQuo}>
            <span className="altar-sq-bloom" aria-hidden="true" />
            Status Quo
            <span className="altar-sq-line" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
