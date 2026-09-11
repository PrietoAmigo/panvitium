import { useEffect, useRef, type ReactElement } from 'react';
import { stagnationMax } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js';
import './stagnation-hud.css';

// The carved trough artwork the vessel draws behind the liquid (frame knocked out to transparent, the
// glass channel left translucent so the green liquid reads through it). Served by Vite from public,
// alongside influence-vessel-frame.png.
const VESSEL_FRAME_SRC = '/assets/panvitium/hud/stagnation-vessel-frame.png';

// The glass channel inside the artwork, as fractions of the canvas (design handoff). The liquid is
// clipped to a rounded rect over this box and fills left → right.
const TROUGH = { x0: 0.163, x1: 0.878, y0: 0.283, y1: 0.722 };

/**
 * The pixelated Stagnation vessel: green liquid clipped to the glass channel, filling from the LEFT
 * (the surface is the vertical leading edge), drawn behind the carved frame image, both composited
 * onto an 85×19 canvas upscaled nearest-neighbour — the same treatment as `InfluenceGoldHud`'s
 * vessel, retinted green and turned on its side.
 *
 * A persistent rAF loop tweens the *displayed* fill toward the live target (`shown += (target-shown)
 * *0.16`) and eases `turb` toward the Desidia state (`turb += (target-turb)*0.06`, ~1 s in/out), then
 * redraws — independent of React's per-tick re-render. While Desidia is active (`turb → 1`) the liquid
 * turns turbulent: the leading edge sloshes, currents run through the body, bubbles rise toward the
 * surface. The turbulence IS the active-state affordance (no glow, no label, no colour change).
 *
 * `prefers-reduced-motion: reduce` holds `turb` at 0 (flat surface, no churn, no bubbles); the active
 * state then reads from `aria-pressed` plus a static, brighter meniscus.
 */
function VesselCanvas({
  frac,
  active,
  reducedMotion,
}: {
  frac: number;
  active: boolean;
  reducedMotion: boolean;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(frac);
  const shownRef = useRef(frac);
  const turbRef = useRef(0);
  const activeRef = useRef(active);
  const reducedRef = useRef(reducedMotion);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Keep the rAF loop reading the latest inputs without re-subscribing the effect each tick.
  targetRef.current = frac;
  activeRef.current = active;
  reducedRef.current = reducedMotion;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
    };
    img.src = VESSEL_FRAME_SRC;

    const t0 = performance.now();
    let raf = 0;

    const draw = (f: number, turb: number, t: number): void => {
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const W = cv.width;
      const H = cv.height;
      ctx.clearRect(0, 0, W, H);

      const gx0 = TROUGH.x0 * W;
      const gx1 = TROUGH.x1 * W;
      const gy0 = TROUGH.y0 * H;
      const gy1 = TROUGH.y1 * H;
      const gw = gx1 - gx0;
      const gh = gy1 - gy0;

      if (f > 0) {
        ctx.save();
        // The channel: a long rounded trough clipping the liquid.
        const r = gh * 0.42;
        ctx.beginPath();
        ctx.moveTo(gx0 + r, gy0);
        ctx.lineTo(gx1 - r, gy0);
        ctx.quadraticCurveTo(gx1, gy0, gx1, gy0 + r);
        ctx.lineTo(gx1, gy1 - r);
        ctx.quadraticCurveTo(gx1, gy1, gx1 - r, gy1);
        ctx.lineTo(gx0 + r, gy1);
        ctx.quadraticCurveTo(gx0, gy1, gx0, gy1 - r);
        ctx.lineTo(gx0, gy0 + r);
        ctx.quadraticCurveTo(gx0, gy0, gx0 + r, gy0);
        ctx.closePath();
        ctx.clip();

        // The liquid rises from the LEFT end of the trough toward the right; the surface is the
        // vertical leading edge, still and flat at rest and sloshing once Desidia stirs it.
        const level = gx0 + f * gw;
        const amp = gw * 0.006;
        const surface = (y: number): number => {
          if (turb < 0.01) return level;
          const a = turb * gw * 0.022;
          return (
            level +
            Math.sin(y * 1.7 + t * 6.2) * a +
            Math.sin(y * 3.3 - t * 9.1) * a * 0.5 +
            Math.sin(t * 3.4) * a * 1.3
          );
        };

        ctx.beginPath();
        ctx.moveTo(gx0 - 2, gy0 - 2);
        for (let y = gy0 - 2; y <= gy1 + 2; y += 0.5) ctx.lineTo(surface(y), y);
        ctx.lineTo(gx0 - 2, gy1 + 2);
        ctx.closePath();
        const grad = ctx.createLinearGradient(gx0, 0, level + amp, 0);
        grad.addColorStop(0, '#092e1d');
        grad.addColorStop(0.3, '#185c2f');
        grad.addColorStop(0.58, '#2b8437');
        grad.addColorStop(0.84, '#57ad48');
        grad.addColorStop(1, '#8fd05f');
        ctx.fillStyle = grad;
        ctx.fill();

        // Meniscus highlight riding the leading edge. Under reduced motion the active state can't be
        // read from the (held-flat) turbulence, so make the meniscus brighter and heavier instead.
        const staticActive = reducedRef.current && activeRef.current;
        ctx.beginPath();
        let first = true;
        for (let y = gy0 - 2; y <= gy1 + 2; y += 0.5) {
          if (first) {
            ctx.moveTo(surface(y), y);
            first = false;
          } else {
            ctx.lineTo(surface(y), y);
          }
        }
        ctx.lineWidth = Math.max(1, W * 0.006) * (staticActive ? 1.6 : 1);
        ctx.strokeStyle = staticActive ? 'rgba(230,255,215,1)' : 'rgba(214,255,190,0.85)';
        ctx.stroke();

        if (turb > 0.02) {
          // Churn: brighter currents running the length of the body while Desidia runs.
          ctx.save();
          ctx.globalAlpha = 0.32 * turb;
          ctx.strokeStyle = 'rgba(190,255,170,0.9)';
          ctx.lineWidth = 1;
          for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            for (let x = gx0; x <= level; x += 1) {
              const y =
                gy0 +
                gh * (0.34 + i * 0.32) +
                Math.sin(x * 0.4 + t * (4.1 + i * 1.7) + i) * gh * 0.2 * turb;
              if (x === gx0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          ctx.restore();

          // Bubbles running through the liquid toward the leading edge.
          ctx.save();
          ctx.fillStyle = 'rgba(222,255,205,0.8)';
          for (let i = 0; i < 8; i++) {
            const cyc = (t * 0.55 + i * 0.31) % 1;
            const bx = gx0 + cyc * (level - gx0);
            const by = gy0 + gh * (0.28 + 0.44 * (0.5 + 0.5 * Math.sin(i * 2.4 + t * 2.1)));
            ctx.globalAlpha = 0.7 * turb * Math.sin(cyc * Math.PI);
            ctx.beginPath();
            ctx.arc(bx, by, Math.max(0.5, H * 0.05), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Glass curvature shadow, painted over the liquid only.
        const sh = ctx.createLinearGradient(0, gy0, 0, gy1);
        sh.addColorStop(0, 'rgba(6,22,12,0.4)');
        sh.addColorStop(0.42, 'rgba(6,22,12,0)');
        sh.addColorStop(1, 'rgba(6,22,12,0.45)');
        ctx.fillStyle = sh;
        ctx.fillRect(gx0 - 2, gy0 - 2, gw + 4, gh + 4);
        ctx.restore();
      }

      // Carved frame over everything at full canvas size.
      if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, W, H);
    };

    const tick = (now: number): void => {
      const t = (now - t0) / 1000;
      const target = targetRef.current;
      shownRef.current += (target - shownRef.current) * 0.16;
      if (Math.abs(target - shownRef.current) < 0.0015) shownRef.current = target;
      // Turbulence eases in only while Desidia runs and motion is allowed; held flat otherwise.
      const turbTarget = activeRef.current && !reducedRef.current ? 1 : 0;
      turbRef.current += (turbTarget - turbRef.current) * 0.06;
      draw(shownRef.current, turbRef.current, t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas ref={canvasRef} width={85} height={19} className="stag-hud-canvas" aria-hidden="true" />
  );
}

/**
 * The persistent Stagnation vessel + Desidia toggle (ADR-033). A bottom-left resource cluster
 * mirroring the Influence vessel's treatment: the "Stagnation" label and `value / max` readout sit
 * above a carved crystal trough that fills left → right with green liquid. There is no separate
 * Desidia button; clicking the vessel toggles Desidia, and the liquid turning turbulent is the only
 * active-state affordance.
 *
 * Reads live state from the store following the repo's Zustand guidance (select the stable `state`,
 * derive the fill ratio + readout in render). The value is floored (`Math.floor(state.stagnation)`)
 * over the derived cap `stagnationMax(state)` (Acedia doubles it per tier). While Stagnation is empty
 * and Desidia is off the vessel is inert: the click is a no-op and it drops its hover brightness
 * (`aria-disabled`).
 *
 * Mounting/visibility is owned by `App` (shown alongside the Influence & Gold HUD; hidden during
 * Katabasis / over the PC / the Altar gate).
 */
export function StagnationHud(): ReactElement | null {
  const state = useGameStore((s) => s.state);
  const toggleDesidia = useGameStore((s) => s.toggleDesidia);
  const reducedMotion = usePrefersReducedMotion();
  if (!state) return null;

  const max = stagnationMax(state);
  const value = state.stagnation;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const active = state.desidiaActive === true;
  // Nothing to spend and not already running → the vessel is inert (click is a no-op).
  const inert = value <= 0 && !active;
  const s = strings.stagnation;

  return (
    <div className="stag-hud" role="group" aria-label={s.label}>
      <div className="stag-hud-readout">
        <span className="stag-hud-label">{s.label}</span>
        <span className="stag-hud-value">
          {Math.floor(value)} / {max}
        </span>
      </div>
      <button
        type="button"
        className={'stag-hud-vessel-btn' + (inert ? ' is-inert' : '')}
        aria-label="Stagnation vessel: toggle Desidia"
        aria-pressed={active}
        aria-disabled={inert}
        title={s.desidiaHint}
        onClick={() => {
          if (!inert) toggleDesidia();
        }}
      >
        <span className="stag-hud-vessel-box">
          <VesselCanvas frac={frac} active={active} reducedMotion={reducedMotion} />
        </span>
      </button>
    </div>
  );
}
