import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { roman } from '../game/format.js';
import { PixelGlow, PixelSprite } from './PixelRelic.js';
import { relicGrid } from './pixelArt.js';
import { byRarity, parseEffect, RARITY, STAGE_FRAME, stagePx as px } from './relics.js';
import type { Maleficium, OracleGroup } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// The Loculi as a frameless RELIQUARY (Claude Design, "Loculi Reliquary" handoff, option 2a): the
// Invocation Room darkens, the selected maleficium floats alone, large and in pixel art, in its
// rarity's light, with its effect set as a headline number; every other owned relic stands in a
// procession along the floor (click one, or the ‹ › arrows / ← → keys; Esc closes). Browse and
// detail are one screen. Relics are ordered anathema → common, stable within a tier.
//
// A full-surface overlay (like Ars Goetia / the Suasio scroll), not a framed panel: the room plate
// behind it is RoomView's own. The composition was authored on a 1280×720 stage and lays out in a
// 16:9 frame fitted to the overlay (`STAGE_FRAME`, lengths via `px`). Same `items` / `onUse` props as
// the niche wall it replaces; `onClose` is the ✕ and Esc. Inline-styled; menus.css carries only the
// hover states and the procession's hidden scrollbar (`.reliquary-*`).
// ─────────────────────────────────────────────────────────────────────────────

/** Art-pixel size in design px (user-tuned): the hero relic and the procession alike. */
const PIXEL = 3;
/** The hero relic's long side, and the procession's sprite box, in design px. */
const HERO_LONG_SIDE = 380;
const PROCESSION_BOX = 58;

const CINZEL = "'Cinzel', serif";
const FELL = "'IM Fell English', serif";
const FELL_SC = "'IM Fell English SC', serif";
const LABEL = '#6a637a';

// Outcome-tier colours, best → worst (keys match the sim's TIER ids).
const TIER_COLOR: Record<string, string> = {
  stellar: '#e8c75a',
  excellent: '#9fbf7a',
  good: '#6aa37e',
  neutral: '#7a7388',
  bad: '#b0742e',
  terrible: '#9c2f24',
  apocalyptic: '#7c1417',
};

/** The oracular tier-distribution readout (legend + a labelled odds bar per action). No relic
 *  reveals odds today (see game/oracle.ts); kept so a future oracle is one catalog entry. */
function OracleReveal({ reveal }: { reveal: OracleGroup[] }): ReactElement {
  const legend = reveal[0]?.actions[0]?.tiers ?? [];
  return (
    <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 12 }}>
      <p
        style={{
          fontFamily: FELL,
          fontStyle: 'italic',
          fontSize: 12,
          color: '#7a7388',
          margin: '0 0 9px',
        }}
      >
        {strings.maleficia.oracleCaption}
      </p>
      {legend.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 11px', marginBottom: 11 }}>
          {legend.map((t) => (
            <span
              key={t.tier}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: CINZEL,
                fontSize: 8.5,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: '#7a7388',
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: TIER_COLOR[t.tier] ?? '#7a7388',
                }}
              />
              {t.label}
            </span>
          ))}
        </div>
      )}
      {reveal.map((g) => (
        <div key={g.category} style={{ marginBottom: 9 }}>
          <div
            style={{
              fontFamily: CINZEL,
              fontSize: 10,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              color: '#a88cd2',
              marginBottom: 5,
            }}
          >
            {g.label}
          </div>
          {g.actions.map((a) => (
            <div
              key={a.action}
              style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}
            >
              <span
                style={{ flex: '0 0 92px', fontFamily: FELL, fontSize: 12.5, color: '#a39bb4' }}
              >
                {a.name}
              </span>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  height: 11,
                  borderRadius: 2,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,.05)',
                }}
                role="img"
                aria-label={`${a.name}: ${a.tiers
                  .map((t) => `${t.label} ${Math.round(t.pct * 100)}%`)
                  .join(', ')}`}
              >
                {a.tiers.map((t) =>
                  t.pct > 0 ? (
                    <span
                      key={t.tier}
                      title={`${t.label} ${Math.round(t.pct * 100)}%`}
                      style={{
                        width: `${t.pct * 100}%`,
                        background: TIER_COLOR[t.tier] ?? '#7a7388',
                      }}
                    />
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A secondary stat under the effect, in the label style ("INVOKING POWER · 4"). */
function StatLine({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <div
      style={{
        marginTop: px(8),
        fontFamily: CINZEL,
        fontSize: px(11),
        letterSpacing: '.4em',
        textTransform: 'uppercase',
        color: LABEL,
      }}
    >
      {label} {'\u00B7'} <span style={{ color: '#cfc6de' }}>{value}</span>
    </div>
  );
}

/** A relic with no art yet: its name as a label, the "current text label treatment". */
function RelicLabel({
  item,
  size,
}: {
  item: Maleficium;
  size: 'hero' | 'procession';
}): ReactElement {
  const R = RARITY[item.rarity];
  const hero = size === 'hero';
  return (
    <span
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontFamily: FELL_SC,
        fontSize: px(hero ? 30 : 8.5),
        lineHeight: 1.1,
        color: R.ember,
        overflow: 'hidden',
        ...(hero ? {} : { border: `1px dashed ${R.ring}`, borderRadius: 4, padding: px(3) }),
      }}
    >
      {item.name}
    </span>
  );
}

/** The relic sprite in its box: pixel art where the art exists, the text label otherwise. */
function RelicArt({
  item,
  longSide,
  bob,
  still,
  size,
}: {
  item: Maleficium;
  longSide: number;
  bob: boolean;
  still: boolean;
  size: 'hero' | 'procession';
}): ReactElement {
  const label = <RelicLabel item={item} size={size} />;
  if (!item.img) return label;
  return (
    <PixelSprite
      src={item.img}
      grid={relicGrid(longSide, PIXEL)}
      pixelSize={PIXEL}
      rgb={RARITY[item.rarity].rgb}
      bob={bob}
      still={still}
      fallback={label}
    />
  );
}

/** A relic just brought home by Emptio (the Unveiling's), to put on stage. `seq` tells repeats apart. */
export interface RelicFocus {
  readonly id: string;
  readonly seq: number;
}

interface MaleficiaCabinetProps {
  /** The player's owned maleficia (from `buildCabinet`), in any order; may be empty. */
  items: Maleficium[];
  /** Activate a single-use consumable by id (Hand of Glory, Black Salt Pouch, Defixio, …). */
  onUse?: (id: string) => void;
  /** Close the Loculi (the ✕, and Esc). */
  onClose: () => void;
  /**
   * The relic the Unveiling last showed: the Loculi opens on it (instead of the rarest) and moves to
   * it when one arrives while open. Null for the default.
   */
  focus?: RelicFocus | null;
  /** prefers-reduced-motion: hold the hero's float and the halo's pulse. */
  reducedMotion?: boolean;
}

/** Selection: the relic's id, plus where it stood so a relic that vanishes (its last copy used)
 *  hands the stage to its neighbour rather than jumping back to the start. */
interface Selection {
  id: string | null;
  at: number;
}

export function MaleficiaCabinet({
  items,
  onUse,
  onClose,
  focus = null,
  reducedMotion = false,
}: MaleficiaCabinetProps): ReactElement {
  const S = strings.maleficia;
  const ordered = byRarity(items);
  const n = ordered.length;
  const [sel, setSel] = useState<Selection>(() => ({ id: focus?.id ?? null, at: 0 }));
  const found = sel.id === null ? -1 : ordered.findIndex((x) => x.id === sel.id);
  const idx = found >= 0 ? found : Math.min(sel.at, Math.max(0, n - 1));
  const m = ordered[idx];

  // A relic unveiled while the Loculi is open takes the stage.
  const focusId = focus?.id;
  const focusSeq = focus?.seq;
  useEffect(() => {
    if (focusId !== undefined) setSel((prev) => ({ id: focusId, at: prev.at }));
  }, [focusId, focusSeq]);

  const select = (i: number): void => {
    const it = ordered[i];
    if (it) setSel({ id: it.id, at: i });
  };
  const step = (delta: number): void => {
    if (n > 0) select((idx + delta + n) % n);
  };

  // ← / → browse (wrapping), Esc closes. The handler reads the latest render through a ref so the
  // window listener is bound once, not re-bound on every 10 Hz tick.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && n > 1) {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'ArrowRight' && n > 1) {
        e.preventDefault();
        step(1);
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => keys.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A crowded procession scrolls sideways; keep the selected relic in view (scrollLeft, never
  // scrollIntoView, which would also scroll the page).
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = row.current;
    const btn = el?.children[idx] as HTMLElement | undefined;
    if (!el || !btn || el.scrollWidth <= el.clientWidth) return;
    const margin = btn.offsetWidth;
    if (btn.offsetLeft - margin < el.scrollLeft) el.scrollLeft = btn.offsetLeft - margin;
    else if (btn.offsetLeft + btn.offsetWidth + margin > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = btn.offsetLeft + btn.offsetWidth + margin - el.clientWidth;
    }
  }, [idx, n]);

  const title = (
    <div
      style={{
        position: 'absolute',
        top: px(34),
        left: 0,
        right: 0,
        textAlign: 'center',
        fontFamily: CINZEL,
        fontSize: px(11),
        letterSpacing: '.5em',
        textTransform: 'uppercase',
        color: LABEL,
      }}
    >
      {S.title}
    </div>
  );

  const shell = (children: ReactElement): ReactElement => (
    <div
      className="reliquary"
      role="dialog"
      aria-modal="true"
      aria-label={S.title}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        overflow: 'hidden',
        background: 'rgba(4,3,3,.88)',
        containerType: 'size',
        fontFamily: "'EB Garamond', Georgia, serif",
        animation: 'fade-in .25s ease both',
      }}
    >
      <button type="button" className="reliquary-close" onClick={onClose} aria-label={S.close}>
        {'✕'}
      </button>
      <div style={STAGE_FRAME}>{children}</div>
    </div>
  );

  if (!m) {
    return shell(
      <>
        {title}
        <p
          className="pc-empty"
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            margin: 0,
            transform: 'translateY(-50%)',
            textAlign: 'center',
            fontFamily: FELL,
            fontSize: px(18),
            color: '#a39bb4',
          }}
        >
          {S.empty}
        </p>
      </>,
    );
  }

  const R = RARITY[m.rarity];
  const fx = parseEffect(m.effect);
  const counterStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: px(136),
    textAlign: 'center',
    fontFamily: CINZEL,
    fontSize: px(11),
    letterSpacing: '.35em',
    color: LABEL,
  };

  return shell(
    <>
      {/* The rarity's light: a breathing halo behind the relic, and a pool on the floor under it. */}
      <div
        style={{
          position: 'absolute',
          left: px(290),
          top: px(-40),
          width: px(700),
          height: px(680),
          pointerEvents: 'none',
        }}
      >
        <PixelGlow
          width={700}
          height={680}
          pixelSize={PIXEL}
          rgb={R.rgb}
          maxAlpha={0.5}
          power={1.7}
          pulse
          still={reducedMotion}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: px(470),
          top: px(458),
          width: px(340),
          height: px(48),
          pointerEvents: 'none',
        }}
      >
        <PixelGlow
          width={340}
          height={48}
          pixelSize={PIXEL}
          rgb={R.rgb}
          maxAlpha={0.7}
          power={1.2}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: px(430),
          top: px(100),
          width: px(420),
          height: px(360),
        }}
      >
        <RelicArt item={m} longSide={HERO_LONG_SIDE} bob still={reducedMotion} size="hero" />
      </div>

      {title}

      {/* Left: rarity, name (with its ×N), flavour. */}
      <div
        style={{
          position: 'absolute',
          left: px(88),
          top: px(258),
          width: px(310),
          display: 'flex',
          flexDirection: 'column',
          gap: px(12),
        }}
      >
        <div
          style={{
            fontFamily: CINZEL,
            fontSize: px(12),
            letterSpacing: '.45em',
            textTransform: 'uppercase',
            color: R.ember,
          }}
        >
          {S.rarity[m.rarity]}
        </div>
        <h2
          style={{
            fontFamily: CINZEL,
            fontWeight: 500,
            fontSize: px(40),
            lineHeight: 1.08,
            letterSpacing: '.02em',
            color: '#efe9f7',
            margin: 0,
            textWrap: 'balance',
          }}
        >
          {m.name}
        </h2>
        <p
          style={{
            fontFamily: FELL,
            fontStyle: 'italic',
            fontSize: px(18),
            lineHeight: 1.5,
            color: '#a39bb4',
            margin: `${px(4)} 0 0`,
            textWrap: 'pretty',
          }}
        >
          {m.desc}
        </p>
      </div>

      {/* Right: the effect as a headline number, the relic's invoking power (when it grants any),
          then, for a consumable, its remaining uses and its rite. */}
      <div
        style={{
          position: 'absolute',
          left: px(900),
          top: px(258),
          width: px(300),
          display: 'flex',
          flexDirection: 'column',
          gap: px(6),
        }}
      >
        {m.effect && (
          <>
            <div
              style={{
                fontFamily: CINZEL,
                fontSize: px(11),
                letterSpacing: '.4em',
                textTransform: 'uppercase',
                color: LABEL,
              }}
            >
              {fx.singleUse ? S.singleUseEffect : S.effect}
            </div>
            {fx.headline && (
              <div
                style={{
                  fontFamily: CINZEL,
                  fontWeight: 600,
                  fontSize: px(68),
                  lineHeight: 1,
                  color: R.ember,
                  textShadow: `0 0 ${px(28)} ${R.wash}`,
                }}
              >
                {fx.headline}
              </div>
            )}
            <div
              style={{
                fontFamily: CINZEL,
                fontSize: px(17),
                letterSpacing: '.04em',
                lineHeight: 1.4,
                color: '#cfc6de',
                textWrap: 'pretty',
              }}
            >
              {fx.remainder}
            </div>
          </>
        )}
        {m.invokingPower !== undefined && m.invokingPower > 0 && (
          <StatLine label={S.invokingPower} value={m.invokingPower} />
        )}
        {m.use && <StatLine label={S.usesRemaining} value={m.use.remaining} />}
        {m.use && (
          <div
            style={{
              marginTop: px(14),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: px(8),
            }}
          >
            {m.use.status && (
              <p
                style={{
                  fontFamily: FELL,
                  fontStyle: 'italic',
                  fontSize: px(13),
                  color: '#9a7d6a',
                  margin: 0,
                }}
              >
                {m.use.status}
              </p>
            )}
            <button
              type="button"
              disabled={!m.use.enabled}
              onClick={() => onUse?.(m.id)}
              style={{
                fontFamily: CINZEL,
                fontSize: px(12),
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                color: '#e6e0f0',
                background: 'rgba(124,20,23,.18)',
                border: '1px solid #7c1417',
                borderRadius: 3,
                padding: `${px(10)} ${px(20)}`,
                cursor: m.use.enabled ? 'pointer' : 'not-allowed',
                opacity: m.use.enabled ? 1 : 0.55,
              }}
            >
              {m.use.label}
            </button>
          </div>
        )}
        {m.reveal && (
          <div className="reliquary-scroll" style={{ maxHeight: px(200), overflowY: 'auto' }}>
            <OracleReveal reveal={m.reveal} />
          </div>
        )}
      </div>

      <div style={counterStyle}>{`${roman(idx + 1)} · ${roman(n)}`}</div>

      {/* The floor, and the procession standing on it. */}
      <div
        style={{
          position: 'absolute',
          left: px(130),
          right: px(130),
          bottom: px(40),
          height: 1,
          background: 'rgba(255,255,255,.07)',
        }}
      />
      {n > 1 && (
        <>
          <button
            type="button"
            className="reliquary-arrow"
            onClick={() => step(-1)}
            aria-label={S.previous}
            style={{ left: px(70), bottom: px(60), fontSize: px(26) }}
          >
            {'‹'}
          </button>
          <button
            type="button"
            className="reliquary-arrow"
            onClick={() => step(1)}
            aria-label={S.next}
            style={{ right: px(70), bottom: px(60), fontSize: px(26) }}
          >
            {'›'}
          </button>
        </>
      )}
      <div
        ref={row}
        className="reliquary-procession"
        style={{
          position: 'absolute',
          left: px(130),
          right: px(130),
          bottom: px(41),
          display: 'flex',
          alignItems: 'flex-end',
          gap: px(18),
          // Room above for the selected relic's lift (a scrolling row clips its overflow).
          paddingTop: px(12),
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        {ordered.map((it, i) => {
          const on = i === idx;
          return (
            <button
              key={it.id}
              type="button"
              className={'reliquary-proc' + (on ? ' is-selected' : '')}
              onClick={() => select(i)}
              title={it.name}
              aria-label={it.name}
              aria-pressed={on}
              style={{
                flex: '0 0 auto',
                // Auto margins centre a short procession yet let a long one start at the left
                // edge and scroll (centred overflow would be unreachable).
                marginLeft: i === 0 ? 'auto' : 0,
                marginRight: i === n - 1 ? 'auto' : 0,
                gap: px(8),
              }}
            >
              <div
                style={{
                  width: px(PROCESSION_BOX),
                  height: px(PROCESSION_BOX),
                  transform: on ? `translateY(${px(-10)})` : 'translateY(0px)',
                  transition: 'transform .2s ease',
                }}
              >
                <RelicArt
                  item={it}
                  longSide={PROCESSION_BOX}
                  bob={false}
                  still={reducedMotion}
                  size="procession"
                />
              </div>
              <div
                style={{
                  width: px(24),
                  height: px(4),
                  background: RARITY[it.rarity].ember,
                  opacity: on ? 1 : 0,
                }}
              />
            </button>
          );
        })}
      </div>
    </>,
  );
}
