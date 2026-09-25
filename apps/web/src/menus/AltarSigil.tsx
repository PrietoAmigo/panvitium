import { useEffect, useLayoutEffect, useRef, type ReactElement } from 'react';

/* The in-room altar sigil (Claude Design "Altar sigil" handoff): the Katabasis trigger and the
   Status Quo shortcut, raised over the Altar Room when the altar is clicked. The room is not
   dimmed or replaced.

   The seal's picture is NOT drawn here. It is composited into the room's degradation pass
   (DegradedScene's `sigil`), so the pixelation and the rest of the recipe reach it like every
   other diegetic element. This layer carries only what must stay crisp and clickable: an
   invisible hit target sized and scaled like the design's seal button, and the STATUS QUO label.
   It reports the hit target's pointer state and measured size upward, for the canvas to mirror.
   Only those two buttons take pointer events, so the room's hotspots keep working around them. */

/** The seal's art (the same glyph the prior full-screen gate used). */
export const ALTAR_SIGIL_SRC = '/assets/panvitium/katabasis/seal-panvitium.png';

/** How the Altar Room shows the sigil: its look, and whether it is fading away. */
export interface AltarSigilView {
  readonly armed: boolean;
  readonly fading: boolean;
}

/** The hit target's pointer state: the design's :hover / :active feedback. */
export interface AltarSigilPointer {
  readonly hover: boolean;
  readonly press: boolean;
}

/** The glyph's and the stage's rendered CSS widths, in px. */
export interface AltarSigilGeometry {
  readonly glyphPx: number;
  readonly stagePx: number;
}

export const SIGIL_AT_REST: AltarSigilPointer = { hover: false, press: false };

/** Keyboard focus (not a click's focus). Engines without `:focus-visible` report false. */
function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

interface AltarSigilProps extends AltarSigilView {
  onPress: () => void;
  onStatusQuo: () => void;
  onPointer: (pointer: AltarSigilPointer) => void;
  onGeometry: (geometry: AltarSigilGeometry) => void;
}

export function AltarSigil({
  armed,
  fading,
  onPress,
  onStatusQuo,
  onPointer,
  onGeometry,
}: AltarSigilProps): ReactElement {
  const layerRef = useRef<HTMLDivElement>(null);
  const glyphRef = useRef<HTMLSpanElement>(null);
  // Hovered by a pointer, or focused from the keyboard (a tabbed-onto seal lifts as a hovered one
  // does); pressed while the primary button is down on it.
  const flags = useRef({ over: false, focused: false, press: false });
  const last = useRef<AltarSigilPointer>(SIGIL_AT_REST);
  const report = (next: Partial<typeof flags.current>): void => {
    flags.current = { ...flags.current, ...next };
    const hover = flags.current.over || flags.current.focused;
    const press = flags.current.press;
    if (hover === last.current.hover && press === last.current.press) return;
    last.current = { hover, press };
    onPointer(last.current);
  };

  // The glyph box takes the design's CSS size (clamp(150px, 30vw, 240px)); measure it against the
  // stage (this layer fills it) before paint, and again whenever the window resizes.
  const onGeometryRef = useRef(onGeometry);
  onGeometryRef.current = onGeometry;
  useLayoutEffect(() => {
    const measure = (): void => {
      const glyphPx = glyphRef.current?.offsetWidth ?? 0;
      const stagePx = layerRef.current?.clientWidth ?? 0;
      onGeometryRef.current({ glyphPx, stagePx });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Put away, the seal is neither hovered nor pressed.
  const onPointerRef = useRef(onPointer);
  onPointerRef.current = onPointer;
  useEffect(() => () => onPointerRef.current(SIGIL_AT_REST), []);

  return (
    <div className={`altar-sigil${fading ? ' is-fading' : ''}`} ref={layerRef}>
      <div className="altar-sigil-wrap">
        <button
          type="button"
          className={`altar-sigil-btn${armed ? ' is-armed' : ''}`}
          onClick={onPress}
          aria-label={armed ? 'Confirm the descent — there is no return' : 'Press the sigil'}
          onPointerEnter={() => report({ over: true })}
          onPointerLeave={() => report({ over: false, press: false })}
          onPointerDown={(e) => {
            if (e.button === 0) report({ press: true });
          }}
          onPointerUp={() => report({ press: false })}
          onPointerCancel={() => report({ over: false, press: false })}
          onFocus={(e) => report({ focused: focusVisible(e.currentTarget) })}
          onBlur={() => report({ focused: false, press: false })}
        >
          <span className="altar-sigil-glyph" ref={glyphRef} aria-hidden="true" />
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
