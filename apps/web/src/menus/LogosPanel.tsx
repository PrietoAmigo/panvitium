import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  buildLogosThoughts,
  logosEchoes,
  logosPathKeyframes,
  logosSlitherKeyframes,
  LOGOS_STAGE_H,
  LOGOS_STAGE_W,
  type LogosThought,
} from './logosThoughts.js';

/**
 * One temptation as shown in the mind. A locked rite is *sealed*: its name and maxim arrive as
 * unreadable Latin (only its echoes are visible) and it shows its Sin gate instead of a cost.
 */
export interface LogosActionView {
  id: string;
  /** Display name: the real rite when open, the seal-name when locked. */
  name: string;
  /** The flavour maxim beneath the name: real when open, the sealed maxim when locked. */
  quote: string;
  /** Efficiency-scaled cost label, e.g. "1 Influence · 1s". */
  cost: string;
  /** The rite's verb (Speak / Infiltrate / Command). */
  cta: string;
  /** The flicker line shown in place of the maxim while this rite is underway. */
  status: string;
  /** Not yet unlocked at the required Sin level: rendered sealed. */
  locked: boolean;
  /** Gate label for a sealed rite, e.g. "Requires Any Sin III". */
  lockLabel?: string;
  /** True while THIS rite is the one currently underway (drives the echoes' light). */
  active: boolean;
  /** Completion of the active rite, 0..100; ignored unless `active`. */
  progress: number;
  /** True while any rite is underway, the player can't afford it, or it is sealed. */
  disabled: boolean;
  /** Fire the real Logos action. */
  onTempt: () => void;
  /** Auto-repeat + acolyte delegation controls, set beside the rite's verb and cost. */
  delegation?: ReactNode;
}

interface LogosPanelProps {
  /** The scroll's name, "Chthonic Logos": the dialog's accessible label (not drawn). */
  title: string;
  /** Accessible label for the close control. */
  closeLabel: string;
  /** The temptations, in scroll order. */
  actions: readonly LogosActionView[];
  /** Resolved-outcome ledger (the Index Suasionum), set low on the right. */
  ledger?: ReactNode;
  /** Dismiss the scroll. */
  onClose: () => void;
}

/** Where each rite sits on the 1280×720 stage (design px), and its slant. Scroll order. The left
 *  margin stays clear of the HUD (the influence orb top-left, Desidia bottom-left). */
const RITE_PLACES: readonly { x: number; y: number; rotate: number }[] = [
  { x: 300, y: 140, rotate: -4 },
  { x: 690, y: 280, rotate: 3 },
  { x: 330, y: 486, rotate: -2 },
];

/** The field, built once: it is layout, not state, and identical on every open. */
const THOUGHTS: readonly LogosThought[] = buildLogosThoughts();

/** The drift's and the slither's compositor-only keyframes, built once in logosThoughts.ts. */
const FIELD_KEYFRAMES = `${logosPathKeyframes()}\n${logosSlitherKeyframes()}`;

/** `#rrggbb` at an alpha. A fragment's or echo's faintness rides in its colour rather than in an
 *  `opacity` on a wrapper: opacity on the parent of an animated layer forces the compositor to
 *  render that subtree offscreen every frame, and there are dozens of them. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** A soft (out-of-focus) glyph: the fill goes clear and a blurred text-shadow in the same colour
 *  draws it instead. Rasterised once with the text, so moving or pulsing it costs no refiltering,
 *  where a CSS `filter: blur()` around animated content is recomputed every frame. */
function softText(blur: number, color: string): CSSProperties {
  return blur > 0
    ? {
        WebkitTextFillColor: 'transparent',
        textShadow: `0 0 ${Math.round(blur * 20) / 10}px ${color}`,
      }
    : {};
}

/**
 * The drifting thoughts, each a serpent: the fragment drifts its path while its letters, the
 * vertebrae, ride the slither wave. They neither fade nor flicker: each is held at its own faintness
 * the whole way (and nothing animates opacity above an animated letter). Memoised with no props so
 * the 10 Hz store updates that move a rite's progress never touch the field; its loudness is set by
 * a class on the wrapper instead.
 */
const LogosThoughts = memo(function LogosThoughts(): ReactElement {
  return (
    <>
      {THOUGHTS.map((t, i) => (
        <div
          key={i}
          className="logos-thought"
          style={{ left: t.x, top: t.y, transform: `rotate(${t.rotate}deg)` }}
        >
          <span
            className={`logos-mote logos-path-${t.path} ${t.latin ? 'logos-mote--latin' : 'logos-mote--note'}`}
            style={{
              fontSize: t.fontSize,
              color: withAlpha(t.color, t.opacity),
              animationDuration: `${t.duration}s`,
              animationDelay: `${t.delay}s`,
              ...softText(t.blur, withAlpha(t.color, t.opacity)),
            }}
          >
            {t.vertebrae.map((v, k) => (
              <span
                key={k}
                className="logos-vertebra"
                style={{
                  fontSize: `${v.size}em`,
                  animationName: v.keyframes,
                  animationDuration: `${t.slither}s`,
                  animationDelay: `${v.delay}s`,
                }}
              >
                {v.ch}
              </span>
            ))}
          </span>
        </div>
      ))}
    </>
  );
});

/**
 * Fit the 1280×720 design stage inside the overlay (letterboxed, never cropped). Without a layout
 * (tests) the stage stays at 1:1.
 */
function useStageScale(): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = (): void => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setScale(Math.min(width / LOGOS_STAGE_W, height / LOGOS_STAGE_H));
      }
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, scale];
}

/**
 * The Chthonic Logos as OBSESSIO (Claude Design, "Chthonic Logos as thoughts", proposal III).
 * The Chthonic Logos is the scroll on the Studio table that holds the Logos rites. The player is
 * writing it themselves, from their notes on worldly and otherworldly experience (the Katabasis
 * descents among them); its purpose is the mastery of eloquence and persuasion. Here it is drawn as
 * the player's mind: no boxes, no frames.
 *
 * Each rite is an intrusive word that will not stop repeating: an echo trail rises behind it and
 * pulses. Dwelling on a rite spreads its echoes and makes the drifting thoughts behind it louder;
 * while it is spoken the echoes light one by one with progress, the word trembles and a red pressure
 * gathers at the edges. A sealed rite is only echoes of an unreadable name, with its Sin gate. The
 * last few resolved temptations replay low on the right.
 *
 * A self-framed, full-surface overlay (mounted by App like Magna Goetia / the PC; it does NOT use
 * PanelShell), laid out on a 1280×720 stage scaled to fit. Purely presentational: the wrapper in
 * ui/panels.tsx feeds the real action, cost, progress and delegation controls. Esc or ✕ closes.
 */
export function LogosPanel({
  title,
  closeLabel,
  actions,
  ledger,
  onClose,
}: LogosPanelProps): ReactElement {
  const [held, setHeld] = useState<string | null>(null);
  const [overlayRef, scale] = useStageScale();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activeId = actions.find((a) => a.active)?.id ?? null;
  const focus = activeId ?? held;
  const mood = activeId ? 'spoken' : focus ? 'held' : 'calm';

  const stageStyle: CSSProperties = {
    width: LOGOS_STAGE_W,
    height: LOGOS_STAGE_H,
    transform: `translate(-50%, -50%) scale(${scale})`,
  };

  return (
    <div className="logos-overlay" ref={overlayRef} onClick={onClose} role="presentation">
      <div className={`logos-press logos-press--${mood}`} aria-hidden="true" />
      <div
        className="logos-stage"
        role="dialog"
        aria-label={title}
        style={stageStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{FIELD_KEYFRAMES}</style>
        <div className={`logos-drift logos-drift--${mood}`} aria-hidden="true">
          <LogosThoughts />
        </div>

        {actions.map((a, i) => {
          const place = RITE_PLACES[i] ?? { x: 110 + i * 40, y: 150 + i * 150, rotate: 0 };
          const isHeld = focus === a.id;
          const receded = focus !== null && !isHeld;
          // Disabled for want of influence (not sealed, and not merely waiting on another rite).
          const wanting = a.disabled && !a.locked && !a.active && activeId === null;
          const rowClass =
            'logos-row' +
            (a.locked ? ' logos-row--locked' : '') +
            (a.active ? ' logos-row--active' : '') +
            (isHeld ? ' logos-row--held' : '') +
            (receded ? ' logos-row--receded' : '') +
            (wanting ? ' logos-row--wanting' : '');
          const echoes = logosEchoes({
            sealed: a.locked,
            held: isHeld,
            active: a.active,
            progress: a.progress,
          });
          const label = a.locked
            ? `${a.name}. ${a.lockLabel ?? ''}`.trim()
            : `${a.cta}: ${a.name}, ${a.cost}`;
          return (
            <div
              key={a.id}
              className={rowClass}
              style={{ left: place.x, top: place.y, transform: `rotate(${place.rotate}deg)` }}
              onMouseEnter={() => setHeld(a.id)}
              onMouseLeave={() => setHeld(null)}
              onFocus={() => setHeld(a.id)}
              onBlur={() => setHeld(null)}
            >
              <button
                type="button"
                className="logos-act"
                disabled={a.disabled}
                aria-label={label}
                onClick={a.onTempt}
              >
                <span className="logos-word">
                  {echoes.map((e, k) => (
                    <span
                      key={k}
                      className={'logos-echo' + (e.lit ? ' logos-echo--lit' : '')}
                      aria-hidden="true"
                      style={{
                        transform: `translate(${e.dx}px, ${e.dy}px) rotate(${e.rotate}deg) scale(${e.scale})`,
                        color: withAlpha(e.color, e.opacity),
                        animationDuration: `${e.duration}s`,
                        animationDelay: `${e.delay}s`,
                        ...softText(e.blur, 'currentColor'),
                      }}
                    >
                      {a.name}
                    </span>
                  ))}
                  <span className={'logos-name' + (a.locked ? ' logos-name--sealed' : '')}>
                    {a.name}
                  </span>
                </span>
                <span
                  className={
                    'logos-line' +
                    (a.locked ? ' logos-line--sealed' : '') +
                    (a.active ? ' logos-line--status' : '')
                  }
                >
                  {a.active ? a.status : a.quote}
                </span>
              </button>

              {a.locked ? (
                <div className="logos-gate">{a.lockLabel}</div>
              ) : (
                <div className="logos-meta">
                  <span className="logos-cta">{a.cta}</span>
                  <span className="logos-cost">{a.cost}</span>
                  {a.delegation && <div className="logos-deleg">{a.delegation}</div>}
                </div>
              )}
            </div>
          );
        })}

        {ledger && <section className="logos-index">{ledger}</section>}

        <button type="button" className="logos-close" onClick={onClose} aria-label={closeLabel}>
          {'✕'}
        </button>
      </div>
    </div>
  );
}
