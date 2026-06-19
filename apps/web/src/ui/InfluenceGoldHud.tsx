import { type CSSProperties, type ReactElement } from 'react';
import { computeModifiers, div, gt, mul, ZERO } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum } from '../game/format.js';

/**
 * The always-on top-left resource cluster (design handoff "Influence & Gold HUD", 2026-06):
 * Influence rendered as liquid filling the carved vessel, with Influence and Gold readouts to its
 * top-right. Non-interactive (`pointer-events: none`); App mounts it (via `.hud-layer`) over every
 * room and menu except the Altar and the Katabasis descent.
 *
 * The vessel art (`influence-vessel-frame.png`) has its glass interior knocked out to transparent, so
 * the liquid behind it shows through while the bronze hand, rim and reflections stay opaque on top.
 * The fill is driven by `scaleY(fraction)` — NOT a percentage height, which resolves incorrectly
 * under the `aspect-ratio` box (see the handoff). Clip px are derived from the vessel width so the
 * whole cluster scales from one constant.
 *
 * The vessel (frame + liquid, but NOT the readouts) is passed through `#hud-vessel-degrade` — an SVG
 * posterise + warm-grade filter that echoes the room's "cursed CD-ROM" degradation pass (ADR-021),
 * so the carved art reads at the same fidelity as the scene while the numbers stay crisp.
 */

// One knob scales the whole vessel. The glass-clip rectangle is a fixed fraction of the vessel width
// (handoff: 0.2087 / 0.2308 / 0.5615 / 0.5692), so deriving it here keeps the liquid registered to
// the art at any size.
const VESSEL_WIDTH = 160;
const CLIP = {
  left: VESSEL_WIDTH * 0.2087,
  top: VESSEL_WIDTH * 0.2308,
  width: VESSEL_WIDTH * 0.5615,
  height: VESSEL_WIDTH * 0.5692,
};

const liquidBody: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'linear-gradient(180deg, #e985dd 0%, #c451c4 16%, #9c30b0 42%, #6c2098 70%, #3c1170 100%)',
};
const liquidGlow: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'radial-gradient(ellipse 70% 55% at 42% 28%, rgba(255,205,248,0.45), transparent 60%)',
};
const liquidSheen: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: '15%',
  width: '16%',
  background:
    'linear-gradient(90deg, rgba(255,228,250,0), rgba(255,228,250,0.55), rgba(255,228,250,0))',
  filter: 'blur(2px)',
};
const liquidMeniscus: CSSProperties = {
  position: 'absolute',
  left: '-6%',
  right: '-6%',
  top: -3,
  height: 10,
  borderRadius: '50%',
  background:
    'radial-gradient(ellipse at 50% 0%, rgba(255,205,248,0.95), rgba(247,150,227,0.55) 60%, transparent 76%)',
};
const curvatureShadow: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  boxShadow: 'inset 0 -6px 14px rgba(26,6,48,0.6), inset 0 0 14px 5px rgba(32,8,54,0.5)',
};

const labelBase: CSSProperties = {
  fontFamily: "'Cinzel', serif",
  fontSize: '0.56rem',
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  textShadow: '0 1px 4px rgba(0,0,0,0.9)',
};
const valueBase: CSSProperties = {
  fontFamily: "'Cinzel', serif",
  fontWeight: 600,
  fontSize: '1.12rem',
  lineHeight: 1.1,
  fontVariantNumeric: 'tabular-nums',
};

/**
 * The degradation filter applied to the vessel only. Two component transfers: a contrast/black-crush
 * tone curve, then a discrete posterise (~6 levels) whose blue channel steps slightly lower to cast
 * the warm grimoire grade. `color-interpolation-filters="sRGB"` keeps the posterise bands true.
 */
function VesselDegradeDefs(): ReactElement {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute' }}>
      <filter
        id="hud-vessel-degrade"
        x="-30%"
        y="-30%"
        width="160%"
        height="160%"
        colorInterpolationFilters="sRGB"
      >
        <feComponentTransfer>
          <feFuncR type="linear" slope="1.25" intercept="-0.12" />
          <feFuncG type="linear" slope="1.25" intercept="-0.12" />
          <feFuncB type="linear" slope="1.25" intercept="-0.12" />
        </feComponentTransfer>
        <feComponentTransfer>
          <feFuncR type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" />
          <feFuncG type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" />
          <feFuncB type="discrete" tableValues="0 0.16 0.36 0.58 0.78 1" />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

export function InfluenceGoldHud(): ReactElement | null {
  // Select the stable `state` and derive in the render body (the Zustand selector trap in CLAUDE.md:
  // never build a fresh object inside the selector). The HUD re-renders each tick as `state` changes.
  const state = useGameStore((s) => s.state);
  if (!state) return null;

  // Influence is capped at the *effective* max (base × maxInfluenceMul) in the tick, so the fill
  // ratio uses the same effective max — matching the Analytics readout — rather than the raw cap.
  const mods = computeModifiers(state);
  const effectiveMax = mul(state.lifetime.maxInfluence, mods.maxInfluenceMul);
  const ratio = gt(effectiveMax, ZERO) ? div(state.lifetime.influence, effectiveMax).toNumber() : 0;
  const fillFrac = Math.max(0, Math.min(1, ratio));

  const influenceLabel = `${formatBigNum(state.lifetime.influence)} / ${formatBigNum(effectiveMax)}`;
  const goldLabel = formatBigNum(state.lifetime.gold);

  return (
    <div className="influence-gold-hud" aria-hidden="true">
      <VesselDegradeDefs />
      {/* INFLUENCE — the ornate vessel, filling with pink/purple liquid. The vessel composite (frame
          + liquid) runs through the degradation filter; the readouts beside it stay crisp. */}
      <div
        style={{
          position: 'relative',
          width: VESSEL_WIDTH,
          filter: 'url(#hud-vessel-degrade) drop-shadow(0 6px 13px rgba(0,0,0,0.6))',
        }}
      >
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
          {/* liquid behind the glass; the cut-glass frame above masks it to the glass shape */}
          <div
            style={{
              position: 'absolute',
              left: CLIP.left,
              top: CLIP.top,
              width: CLIP.width,
              height: CLIP.height,
              borderRadius: '50%',
              overflow: 'hidden',
              zIndex: 1,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transformOrigin: 'center bottom',
                transform: `scaleY(${fillFrac})`,
                transition: 'transform 0.9s cubic-bezier(0.4,0.8,0.3,1)',
              }}
            >
              <div style={liquidBody} />
              <div style={liquidGlow} />
              <div style={liquidSheen} />
              <div style={liquidMeniscus} />
            </div>
            <div style={curvatureShadow} />
          </div>

          {/* the carved vessel: glass interior cut out; hand, rim + reflections sit on top */}
          <img
            src="/assets/panvitium/influence-vessel-frame.png"
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              zIndex: 2,
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* readouts — to the top-right of the vessel; flex-start pins Influence and Gold to the same
          left edge so both hug the vessel equally. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '0.55rem',
          marginTop: '0.4rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            lineHeight: 1.12,
          }}
        >
          <span style={{ ...labelBase, color: '#7fa0d8' }}>{strings.resources.influence}</span>
          <span
            style={{
              ...valueBase,
              color: '#c4d4f2',
              textShadow: '0 0 12px rgba(70,120,230,0.25), 0 2px 6px rgba(0,0,0,0.9)',
            }}
          >
            {influenceLabel}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            lineHeight: 1.12,
          }}
        >
          <span style={{ ...labelBase, color: '#c9822f' }}>{strings.resources.gold}</span>
          <span
            style={{
              ...valueBase,
              color: '#e7d8b4',
              textShadow: '0 0 12px rgba(201,162,39,0.3), 0 2px 6px rgba(0,0,0,0.9)',
            }}
          >
            {goldLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
