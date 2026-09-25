import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { PixelGlow, PixelRays, PixelSprite } from './PixelRelic.js';
import { relicGrid } from './pixelArt.js';
import { parseEffect, RARITY, STAGE_FRAME, stagePx as px } from './relics.js';
import type { Maleficium } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// The Unveiling (Claude Design, "Loculi Reliquary" handoff, screen 2): the moment Emptio brings a
// maleficium home. The screen darkens under pixel light shafts in the rarity's colour; the relic
// resolves out of coarse pixels into full resolution (70 ms a step), flashes white (350 ms), and
// holds with its name, flavour, effect and invoking power for 1.5 s, then fades (0.3 s). A click
// anywhere dismisses it early; a click during the fade does nothing. prefers-reduced-motion keeps
// the hold and the fade but shows the relic at full resolution at once, under still rays. Purely
// presentational: `onDone` fires once the fade has finished, and the caller unmounts it (see
// ui/Unveiling.tsx).
// ─────────────────────────────────────────────────────────────────────────────

/** How long the relic holds before fading, and the fade itself (ms). */
export const UNVEIL_HOLD_MS = 1500;
export const UNVEIL_FADE_MS = 300;

/** Art-pixel size in design px (user-tuned), and the relic's long side. */
const PIXEL = 3;
const RELIC_LONG_SIDE = 400;

const CINZEL = "'Cinzel', serif";
const FELL = "'IM Fell English', serif";

interface MaleficiumUnveilingProps {
  /** The relic obtained (`maleficiumView`: no stack count, no Use rite). */
  item: Maleficium;
  /** prefers-reduced-motion: no reveal steps, flash, ray motion or halo pulse. */
  reducedMotion?: boolean;
  /** The pop-up has faded out; unmount it (and play the next, if any). */
  onDone: () => void;
}

export function MaleficiumUnveiling({
  item,
  reducedMotion = false,
  onDone,
}: MaleficiumUnveilingProps): ReactElement {
  const S = strings.maleficia;
  const R = RARITY[item.rarity];
  const fx = parseEffect(item.effect);
  const [fading, setFading] = useState(false);
  const fadingRef = useRef(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const fadeTimer = useRef<number | undefined>(undefined);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  const fade = useCallback((): void => {
    if (fadingRef.current) return;
    fadingRef.current = true;
    window.clearTimeout(holdTimer.current);
    setFading(true);
    fadeTimer.current = window.setTimeout(() => done.current(), UNVEIL_FADE_MS);
  }, []);

  useEffect(() => {
    holdTimer.current = window.setTimeout(fade, UNVEIL_HOLD_MS);
    return () => {
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(fadeTimer.current);
    };
  }, [fade]);

  const label = (
    <span
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontFamily: "'IM Fell English SC', serif",
        fontSize: px(30),
        color: R.ember,
      }}
    >
      {item.name}
    </span>
  );

  return (
    <div
      className="unveiling"
      role="status"
      onClick={fade}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 88,
        overflow: 'hidden',
        cursor: 'pointer',
        background: 'rgba(3,2,4,.94)',
        opacity: fading ? 0 : 1,
        transition: `opacity ${UNVEIL_FADE_MS / 1000}s ease`,
        containerType: 'size',
        fontFamily: "'EB Garamond', Georgia, serif",
      }}
    >
      <div style={STAGE_FRAME}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <PixelRays pixelSize={PIXEL} rgb={R.rgb} still={reducedMotion} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: px(315),
            top: px(-60),
            width: px(650),
            height: px(620),
            pointerEvents: 'none',
          }}
        >
          <PixelGlow
            width={650}
            height={620}
            pixelSize={PIXEL}
            rgb={R.rgb}
            maxAlpha={0.55}
            power={1.8}
            pulse
            still={reducedMotion}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            left: px(410),
            top: px(56),
            width: px(460),
            height: px(340),
          }}
        >
          {item.img ? (
            <PixelSprite
              src={item.img}
              grid={relicGrid(RELIC_LONG_SIDE, PIXEL)}
              pixelSize={PIXEL}
              rgb={R.rgb}
              reveal
              still={reducedMotion}
              fallback={label}
            />
          ) : (
            label
          )}
        </div>
        <div
          style={{
            position: 'absolute',
            top: px(30),
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: CINZEL,
            fontSize: px(11),
            letterSpacing: '.5em',
            textTransform: 'uppercase',
            color: '#6a637a',
          }}
        >
          {S.obtained}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: px(420),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: CINZEL,
              fontSize: px(12),
              letterSpacing: '.5em',
              textTransform: 'uppercase',
              color: R.ember,
            }}
          >
            <span aria-hidden="true">{'◆'}</span> {S.rarity[item.rarity]}{' '}
            <span aria-hidden="true">{'◆'}</span>
          </div>
          <h2
            style={{
              fontFamily: CINZEL,
              fontWeight: 500,
              fontSize: px(52),
              letterSpacing: '.03em',
              lineHeight: 1.05,
              color: '#efe9f7',
              margin: `${px(12)} 0 0`,
            }}
          >
            {item.name}
          </h2>
          <p
            style={{
              fontFamily: FELL,
              fontStyle: 'italic',
              fontSize: px(19),
              lineHeight: 1.5,
              color: '#a39bb4',
              margin: `${px(12)} 0 0`,
              width: px(640),
              textWrap: 'pretty',
            }}
          >
            {item.desc}
          </p>
          {item.effect && (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: px(14),
                marginTop: px(18),
              }}
            >
              {fx.headline && (
                <span
                  style={{
                    fontFamily: CINZEL,
                    fontWeight: 600,
                    fontSize: px(38),
                    color: R.ember,
                    textShadow: `0 0 ${px(22)} ${R.wash}`,
                  }}
                >
                  {fx.headline}
                </span>
              )}
              <span
                style={{
                  fontFamily: CINZEL,
                  fontSize: px(17),
                  letterSpacing: '.04em',
                  color: '#cfc6de',
                  whiteSpace: 'nowrap',
                }}
              >
                {fx.remainder}
              </span>
            </div>
          )}
          {item.invokingPower !== undefined && (
            <div
              style={{
                marginTop: px(14),
                fontFamily: CINZEL,
                fontSize: px(11),
                letterSpacing: '.4em',
                textTransform: 'uppercase',
                color: '#6a637a',
              }}
            >
              {S.invokingPower} {'\u00B7'}{' '}
              <span style={{ color: item.invokingPower > 0 ? '#cfc6de' : '#6a637a' }}>
                {item.invokingPower}
              </span>
            </div>
          )}
        </div>
      </div>
      {/* The hold, running out along the bottom edge. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: 'rgba(255,255,255,.05)',
        }}
      >
        <div
          className="unveiling-countdown"
          style={{
            height: '100%',
            background: R.ember,
            animationDuration: `${UNVEIL_HOLD_MS / 1000}s`,
          }}
        />
      </div>
    </div>
  );
}
