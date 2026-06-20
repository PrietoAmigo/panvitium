import { type CSSProperties, type ReactElement } from 'react';
import type { BoundInvocationVisual } from './types.js';

/* BoundInvocations — the presentation-only overlay for invocations that are currently bound.
   It renders each figure onto its room (the soul rim-light + optional levitating-trance
   treatment + optional diegetic caption), reading purely from the `visuals` it is handed —
   no game/store state. The whole layer is `pointer-events: none`, so the hotspots beneath it
   stay clickable.

   Reusable by data: a new invocation gets a designed display by adding one entry to
   BOUND_INVOCATION_VISUALS (see degrade.data.ts); nothing here changes. */

interface BoundInvocationsProps {
  /** The bound invocations to show in the current room (already filtered/ordered). */
  visuals: BoundInvocationVisual[];
  /** Honour `prefers-reduced-motion`: drop the float/aura/mote loops. */
  reducedMotion: boolean;
}

// The four rising motes of the float treatment, drifting up off the altar and fading. Positions
// are absolute over the stage (the figure is centered near 49%); each runs on its own cadence.
const MOTES: {
  left: string;
  top: string;
  size: number;
  blur: number;
  dur: string;
  delay: string;
}[] = [
  { left: '45%', top: '50%', size: 5, blur: 2, dur: '5.2s', delay: '0s' },
  { left: '52%', top: '51%', size: 4, blur: 2, dur: '6.1s', delay: '1.4s' },
  { left: '48.5%', top: '49%', size: 6, blur: 2.5, dur: '5.7s', delay: '2.7s' },
  { left: '50.5%', top: '52%', size: 3, blur: 1.5, dur: '4.8s', delay: '3.6s' },
];

// The focal vignette that darkens the room edges so the bound figure reads as the light source.
function vignette(alpha: number): string {
  return `radial-gradient(46% 52% at 49% 44%, rgba(0,0,0,0) 36%, rgba(2,1,1,${alpha}) 100%)`;
}

export function BoundInvocations({
  visuals,
  reducedMotion,
}: BoundInvocationsProps): ReactElement | null {
  if (visuals.length === 0) return null;
  // One shared dimming layer, at the strongest vignette any bound figure asks for.
  const ink = Math.max(0, ...visuals.map((v) => v.vignette ?? 0));
  return (
    <div className="bound-invocations" aria-hidden="true">
      {ink > 0 && (
        <div className="bound-invocation-vignette" style={{ background: vignette(ink) }} />
      )}
      {visuals.map((v) => (
        <BoundInvocationFigure key={v.id} v={v} reducedMotion={reducedMotion} />
      ))}
    </div>
  );
}

function BoundInvocationFigure({
  v,
  reducedMotion,
}: {
  v: BoundInvocationVisual;
  reducedMotion: boolean;
}): ReactElement {
  // --glow carries the soul accent into the CSS (rim-light, aura, motes, caption).
  const rootStyle = { '--glow': v.glow } as CSSProperties;
  const figureClass =
    'bound-invocation-figure' +
    (v.float ? ' is-float' : '') +
    (v.float && reducedMotion ? ' is-static' : '');
  return (
    <div className="bound-invocation" style={rootStyle}>
      {v.float && !reducedMotion && (
        <>
          <div className="bound-invocation-aura" style={{ left: v.left, top: '14%' }} />
          {MOTES.map((m, i) => (
            <span
              key={i}
              className="bound-invocation-mote"
              style={{
                left: m.left,
                top: m.top,
                width: m.size,
                height: m.size,
                filter: `blur(${m.blur}px)`,
                animationDuration: m.dur,
                animationDelay: m.delay,
              }}
            />
          ))}
        </>
      )}
      <img
        className={figureClass}
        src={v.src}
        alt={v.caption?.title ?? v.id}
        style={{ left: v.left, top: v.top, height: v.height }}
      />
      {v.caption && (
        <div className="bound-invocation-caption">
          <div className="bound-invocation-caption-title">{v.caption.title}</div>
          <div className="bound-invocation-caption-sub" style={{ color: v.caption.tint }}>
            {v.caption.subtitle}
          </div>
        </div>
      )}
    </div>
  );
}
