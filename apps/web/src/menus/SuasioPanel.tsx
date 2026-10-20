import { type ReactNode, type ReactElement, type CSSProperties } from 'react';

/**
 * One temptation as shown on the scroll. A locked rite is *sealed* — its name and maxim arrive as
 * unreadable, redacted Latin and its right column shows the Sin gate rather than a cost + button.
 */
export interface SuasioActionView {
  id: string;
  /** Roman numeral for the rite's place on the scroll (I / II / III). */
  numeral: string;
  /** Alchemical sigil drawn in the rite's circle (☿ / ✴ / ☉). */
  glyph: string;
  /** Display name — the real rite when open, the redacted seal-name when locked. */
  name: string;
  /** The flavour maxim beneath the name — real when open, redacted when locked. */
  quote: string;
  /** Efficiency-scaled cost label, e.g. "5 Influence · 5s". */
  cost: string;
  /** The action verb on the button (Speak / Infiltrate / Command). */
  cta: string;
  /** The flicker line shown while this rite is underway. */
  status: string;
  /** Not yet unlocked at the required Sin level — rendered sealed. */
  locked: boolean;
  /** Gate label for a sealed rite, e.g. "Luxuria III". */
  lockLabel?: string;
  /** True while THIS rite is the one currently underway (drives the progress ring + bar). */
  active: boolean;
  /** Completion of the active rite, 0–100; ignored unless `active`. */
  progress: number;
  /** True while any rite is underway, the player can't afford it, or it is sealed. */
  disabled: boolean;
  /** Fire the real Suasio action. */
  onTempt: () => void;
  /** Acolyte delegation controls, rendered beneath the body when the rite is delegatable. */
  delegation?: ReactNode;
}

interface SuasioPanelProps {
  /** The scroll's name — "Chthonic Logos". */
  title: string;
  /** The illuminated maxim across the head of the parchment. */
  maxim: string;
  /** Accessible label for the close control. */
  closeLabel: string;
  /** The three temptations, in scroll order. */
  actions: readonly SuasioActionView[];
  /** Resolved-outcome ledger rendered at the foot of the scroll. */
  ledger?: ReactNode;
  /** Dismiss the scroll. */
  onClose: () => void;
}

/**
 * Atmosphere: the parchment is overrun by drifting devotional Latin, fading in and out behind the
 * rites. The phrases are decorative texture (untranslated, per ADR-020); per-line speed, size and
 * direction come from `.suasio-drift-line:nth-child(n)` in menus.css.
 */
const DRIFT_LINES: readonly string[] = [
  'DA MIHI ANIMAS · CETERA TOLLE · ',
  'serviam · ',
  'VERBA VOLANT · SCRIPTA MANENT · ',
  'vox audita perit, littera scripta manet · ',
  'SVADEO TIBI · AVDI VIDE TACE · ',
  'memento mori · tenebrae factae sunt · ',
  'QVI TACET CONSENTIRE VIDETVR · ',
];

/** Repeat a phrase enough times to overflow the card so the −50% drift loops seamlessly. */
function tile(phrase: string, times = 8): string {
  return phrase.repeat(times);
}

/**
 * The Chthonic Logos (Claude Design rework).
 * The Chthonic Logos is the scroll on the Studio table that holds the Suasio rites. The player is
 * writing it themselves, from their notes on worldly and otherworldly experience (the Katabasis
 * descents among them); its purpose is the mastery of eloquence and persuasion.
 *
 * A self-framed,
 * full-surface overlay (like Magna Goetia / the PC / Katabasis — it does NOT use PanelShell): an
 * illuminated parchment of three temptations, each an alchemical circle that fills into a progress
 * ring while its rite is spoken. Sealed rites read as redacted Latin until their Sin gate is met.
 * Purely presentational — fed the real action/cost/progress by the wrapper in ui/panels.tsx;
 * resolved outcomes live in the PC's Logs, not here.
 */
export function SuasioPanel({
  title,
  maxim,
  closeLabel,
  actions,
  ledger,
  onClose,
}: SuasioPanelProps): ReactElement {
  return (
    <div className="suasio-overlay" onClick={onClose} role="presentation">
      <div
        className="suasio-scroll"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="suasio-close" onClick={onClose} aria-label={closeLabel}>
          {'\u2715'}
        </button>

        <header className="suasio-head">
          <h2 className="suasio-title">{title}</h2>
          <span className="suasio-rule" aria-hidden="true" />
        </header>

        <section className="suasio-card">
          <div className="suasio-drift" aria-hidden="true">
            {DRIFT_LINES.map((phrase, i) => (
              <div className="suasio-drift-line" key={i}>
                {tile(phrase)}
              </div>
            ))}
          </div>

          <div className="suasio-card-inner">
            <p className="suasio-maxim">{maxim}</p>

            <div className="suasio-rows">
              {actions.map((a, i) => {
                // Imperium and Panvitium — the crowned rites get the spinning inner ring.
                const apex = a.id === 'imperium' || a.id === 'panvitium';
                const twoRings = i >= 1; // the later rites carry a second concentric ring.
                const rowClass =
                  'suasio-row' +
                  (a.active ? ' suasio-row--active' : '') +
                  (a.locked ? ' suasio-row--locked' : '') +
                  (apex && !a.locked ? ' suasio-row--apex' : '');
                const arcStyle = { '--suasio-w': `${a.progress}%` } as CSSProperties;
                const barStyle = { width: `${a.progress}%` } as CSSProperties;
                return (
                  <div key={a.id} className={rowClass}>
                    {a.active && <span className="suasio-edge" aria-hidden="true" />}

                    <div className="suasio-numeral">{a.numeral}</div>

                    <div
                      className={'suasio-sigil' + (a.locked ? ' suasio-sigil--sealed' : '')}
                      aria-hidden="true"
                    >
                      <span className="suasio-ring suasio-ring--outer" />
                      {twoRings && (
                        <span
                          className={
                            'suasio-ring suasio-ring--inner' +
                            (apex && !a.locked ? ' suasio-ring--spin' : '')
                          }
                        />
                      )}
                      {a.active && <span className="suasio-arc" style={arcStyle} />}
                      <span className="suasio-glyph">{a.locked ? a.numeral : a.glyph}</span>
                    </div>

                    <div className="suasio-body">
                      <div className="suasio-name">{a.name}</div>
                      <div className="suasio-quote">{a.quote}</div>
                      {/* The progress bar + status keep their layout space even when idle
                          (visibility, not display), so a castable rite's row is a fixed height
                          and the buttons do not jump when the rite starts or ends. */}
                      {!a.locked && (
                        <>
                          <span
                            className={'suasio-bar' + (a.active ? '' : ' suasio-idle')}
                            style={barStyle}
                            aria-hidden="true"
                          />
                          <div className={'suasio-status' + (a.active ? '' : ' suasio-idle')}>
                            {a.status}
                          </div>
                        </>
                      )}
                      {a.delegation && <div className="suasio-deleg">{a.delegation}</div>}
                    </div>

                    <div className="suasio-aside">
                      {a.locked ? (
                        <div className="suasio-gate">{a.lockLabel}</div>
                      ) : (
                        <>
                          <div className="suasio-cost">{a.cost}</div>
                          <button
                            type="button"
                            className="suasio-act"
                            disabled={a.disabled}
                            onClick={a.onTempt}
                          >
                            {a.cta}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {ledger}
          </div>
        </section>
      </div>
    </div>
  );
}
