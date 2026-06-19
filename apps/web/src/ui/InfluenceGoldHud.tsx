import { useEffect, useRef, type ReactElement } from 'react';
import { div, gt, type BigNum } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum } from '../game/format.js';

// The carved vessel artwork the HUD draws (frame knocked out to transparent + the glass-globe made
// translucent so the liquid shows through). Served by Vite from apps/web/public.
const VESSEL_FRAME_SRC = '/assets/panvitium/hud/influence-vessel-frame.png';

// The pixelation knob: the liquid + frame are composited onto a PIXEL_GRID×PIXEL_GRID canvas and
// upscaled with `image-rendering: pixelated`, giving the uniform pixel-art look while keeping full
// colour. Lower = chunkier pixels (design default 96).
const PIXEL_GRID = 96;

// Glass-globe ellipse inside the artwork, as fractions of the canvas size (design handoff).
const GLASS = { cx: 0.483, cy: 0.515, rx: 0.252, ry: 0.272 };

// Influence fill fraction: clamp(influence / maxInfluence, 0, 1). Divide with the sim's bignum
// helpers, then collapse the ratio to a plain number for the canvas.
function fillFraction(influence: BigNum, maxInfluence: BigNum): number {
  if (!gt(maxInfluence, 0)) return 0;
  const ratio = div(influence, maxInfluence).toNumber();
  return Math.max(0, Math.min(1, ratio));
}

/**
 * The pixelated vessel: liquid (clipped to the glass-globe ellipse, filling from the bottom) drawn
 * behind the carved frame image, both composited onto a low-res canvas. A persistent rAF loop tweens
 * the *displayed* fraction toward the live target (`shown += (target-shown)*0.16`) for a smooth rise
 * /fall and redraws — independent of React's per-tick re-render.
 */
function VesselCanvas({ frac }: { frac: number }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(frac);
  const shownRef = useRef(frac);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Keep the rAF loop reading the latest target without re-subscribing the effect each tick.
  targetRef.current = frac;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
    };
    img.src = VESSEL_FRAME_SRC;

    let raf = 0;
    const draw = (): void => {
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const W = cv.width;
      const H = cv.height;
      ctx.clearRect(0, 0, W, H);
      const f = shownRef.current;
      const ecx = GLASS.cx * W;
      const ecy = GLASS.cy * H;
      const erx = GLASS.rx * W;
      const ery = GLASS.ry * H;
      if (f > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2);
        ctx.clip();
        const top = ecy + ery - f * (2 * ery);
        const grad = ctx.createLinearGradient(0, top, 0, ecy + ery);
        grad.addColorStop(0, '#e985dd');
        grad.addColorStop(0.16, '#c451c4');
        grad.addColorStop(0.42, '#9c30b0');
        grad.addColorStop(0.7, '#6c2098');
        grad.addColorStop(1, '#3c1170');
        ctx.fillStyle = grad;
        ctx.fillRect(0, top, W, ecy + ery - top);
        // Meniscus highlight band at the liquid surface.
        ctx.fillStyle = 'rgba(255,205,248,0.85)';
        ctx.fillRect(0, top, W, Math.max(1, H * 0.02));
        // Curvature shadow, painted over the liquid only.
        const sh = ctx.createRadialGradient(ecx, ecy, erx * 0.55, ecx, ecy, erx);
        sh.addColorStop(0, 'rgba(20,6,42,0)');
        sh.addColorStop(1, 'rgba(20,6,42,0.5)');
        ctx.fillStyle = sh;
        ctx.fillRect(ecx - erx, top, erx * 2, ecy + ery - top);
        ctx.restore();
      }
      // Carved frame over everything at full canvas size.
      if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, W, H);
    };

    const tick = (): void => {
      const t = targetRef.current;
      shownRef.current += (t - shownRef.current) * 0.16;
      if (Math.abs(t - shownRef.current) < 0.0015) shownRef.current = t;
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={PIXEL_GRID}
      height={PIXEL_GRID}
      className="ig-hud-canvas"
      aria-hidden="true"
    />
  );
}

/**
 * The persistent Influence & Gold HUD (design handoff). Top-left resource cluster: the carved vessel
 * (Influence, its glass globe filling with pink/purple liquid) beside the two numeric readouts
 * (Influence above, Gold below). Reads live state from the game store and follows the repo's Zustand
 * selector guidance — select the stable `state`, derive the fill ratio + formatted values in render.
 *
 * Mounting/visibility is owned by `App` (shown in the three rooms and over the Maleficia / Ars Goetia
 * / Suasio menus; hidden over the Altar gate, the PC, and during Katabasis).
 */
export function InfluenceGoldHud(): ReactElement | null {
  const state = useGameStore((s) => s.state);
  if (!state) return null;
  const { influence, maxInfluence, gold } = state.lifetime;
  const frac = fillFraction(influence, maxInfluence);
  const influenceLabel = `${formatBigNum(influence)} / ${formatBigNum(maxInfluence)}`;
  const goldLabel = formatBigNum(gold);

  return (
    <div className="ig-hud" role="group" aria-label="Influence and Gold">
      <div className="ig-hud-vessel">
        <div className="ig-hud-vessel-box">
          <VesselCanvas frac={frac} />
        </div>
      </div>
      <div className="ig-hud-readouts">
        <div className="ig-hud-block ig-hud-block--influence">
          <span className="ig-hud-label ig-hud-label--influence">Influence</span>
          <span className="ig-hud-value ig-hud-value--influence">{influenceLabel}</span>
        </div>
        <div className="ig-hud-block ig-hud-block--gold">
          <span className="ig-hud-label ig-hud-label--gold">Gold</span>
          <span className="ig-hud-value ig-hud-value--gold">{goldLabel}</span>
        </div>
      </div>
    </div>
  );
}
