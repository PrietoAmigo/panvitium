// The Loculi's pixel-art canvases (Claude Design, "Loculi Reliquary" handoff): a relic sprite, a
// dithered radial glow, and the Unveiling's light shafts. Each paints a low-res canvas that CSS
// upscales nearest-neighbour (`image-rendering: pixelated` only; adding `crisp-edges` after it
// reverts Chromium to smoothing). The pixel rules live in pixelArt.ts; these wrappers own the
// loading, the rAF loops and the teardown, and degrade to a blank canvas where there is no 2D context
// (jsdom). Purely presentational: no store, sim or RNG access.
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  loadImage,
  paintGlow,
  paintRays,
  pixelateRelic,
  revealGrids,
  RAY_SWELL_SECONDS,
} from './pixelArt.js';
import { stagePx, type Rgb } from './relics.js';

/** Seconds per coarse grid step of the Unveiling's reveal, and of the white flash that follows it. */
const REVEAL_STEP_SECONDS = 0.07;
const FLASH_SECONDS = 0.35;

const PIXELATED: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  imageRendering: 'pixelated',
};

interface PixelSpriteProps {
  /** The relic art (a transparent PNG). */
  src: string;
  /** Art pixels on the relic's long side at full resolution (see `relicGrid`). */
  grid: number;
  /** One art pixel in design px: sets the hard drop shadow (two pixels down) and the bob step. */
  pixelSize: number;
  /** The rarity ember, for the one-pixel outline. */
  rgb: Rgb;
  /** Float gently, moving in whole art pixels. */
  bob?: boolean;
  /** Resolve out of coarse pixels into full resolution, then flash white (the Unveiling). */
  reveal?: boolean;
  /** Hold still (prefers-reduced-motion): full resolution at once, no flash, no bob. */
  still?: boolean;
  /** Shown instead of the canvas when the art cannot be loaded. */
  fallback: ReactNode;
}

/** One relic as pixel art, fitted (`contain`) into its box, with a hard pixel shadow. */
export function PixelSprite({
  src,
  grid,
  pixelSize,
  rgb,
  bob = false,
  reveal = false,
  still = false,
  fallback,
}: PixelSpriteProps): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  // Keyed by src so a new relic never inherits the previous one's failure.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [r, g, b] = rgb;

  useEffect(() => {
    let dead = false;
    let raf = 0;
    void loadImage(src).then((img) => {
      if (dead) return;
      if (!img) {
        setFailedSrc(src);
        return;
      }
      const cv = ref.current;
      const ctx = cv?.getContext('2d');
      if (!cv || !ctx) return;
      const opts = { outline: true, crush: true, rgb: [r, g, b] as const };
      const grids = reveal && !still ? revealGrids(grid) : [grid];
      const floats = bob && !still;
      if (!floats) cv.style.transform = '';
      const t0 = performance.now();
      let drawn = '';
      let lift = Number.NaN;
      const frame = (now: number): void => {
        if (dead) return;
        const el = Math.max(0, (now - t0) / 1000);
        let step = grids.length - 1;
        let flash = 0;
        let more = floats;
        if (grids.length > 1) {
          const i = Math.floor(el / REVEAL_STEP_SECONDS);
          if (i < grids.length - 1) {
            step = i;
            more = true;
          } else {
            const since = el - (grids.length - 1) * REVEAL_STEP_SECONDS;
            flash = Math.max(0, 1 - since / FLASH_SECONDS);
            if (flash > 0) more = true;
          }
        }
        const target = grids[step] ?? grid;
        const key = `${target}|${flash}`;
        if (key !== drawn) {
          drawn = key;
          const art = pixelateRelic(src, img, target, opts);
          if (art) {
            if (cv.width !== art.width || cv.height !== art.height) {
              cv.width = art.width;
              cv.height = art.height;
            }
            ctx.clearRect(0, 0, cv.width, cv.height);
            ctx.drawImage(art, 0, 0);
            if (flash > 0) {
              // White-hot, on the sprite's own pixels only.
              ctx.save();
              ctx.globalCompositeOperation = 'source-atop';
              ctx.fillStyle = `rgba(255,240,225,${flash * 0.95})`;
              ctx.fillRect(0, 0, cv.width, cv.height);
              ctx.restore();
            }
          }
        }
        if (floats) {
          const next = Math.round(Math.sin(el * 1.4) * 2.5) * pixelSize;
          if (next !== lift) {
            lift = next;
            cv.style.transform = `translateY(${stagePx(next)})`;
          }
        }
        if (more) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
    };
  }, [src, grid, pixelSize, r, g, b, bob, reveal, still]);

  if (failedSrc === src) return <>{fallback}</>;
  return (
    <canvas
      ref={ref}
      width={1}
      height={1}
      aria-hidden="true"
      style={{
        ...PIXELATED,
        objectFit: 'contain',
        filter: `drop-shadow(0 ${stagePx(pixelSize * 2)} 0 rgba(0,0,0,.55))`,
      }}
    />
  );
}

interface PixelGlowProps {
  /** The glow's box, in design px (its buffer is one pixel per two art pixels). */
  width: number;
  height: number;
  /** One art pixel in design px. */
  pixelSize: number;
  rgb: Rgb;
  /** Alpha at the brightest level. */
  maxAlpha: number;
  /** Radial falloff exponent. */
  power: number;
  /** Breathe ±12% at 1.7 rad/s. */
  pulse?: boolean;
  /** Hold the pulse (prefers-reduced-motion). */
  still?: boolean;
}

/** A radial pixel glow in the rarity's light, dithered to five alpha levels. */
export function PixelGlow({
  width,
  height,
  pixelSize,
  rgb,
  maxAlpha,
  power,
  pulse = false,
  still = false,
}: PixelGlowProps): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const [r, g, b] = rgb;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const block = pixelSize * 2;
    const w = Math.max(4, Math.round(width / block));
    const h = Math.max(2, Math.round(height / block));
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(w, h);
    const breathes = pulse && !still;
    let dead = false;
    let raf = 0;
    const t0 = performance.now();
    const draw = (now: number): void => {
      if (dead) return;
      const t = (now - t0) / 1000;
      const amp = breathes ? 1 + 0.12 * Math.sin(t * 1.7) : 1;
      paintGlow(image.data, w, h, [r, g, b], maxAlpha, power, amp);
      ctx.putImageData(image, 0, 0);
      if (breathes) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
    };
  }, [width, height, pixelSize, r, g, b, maxAlpha, power, pulse, still]);

  return <canvas ref={ref} aria-hidden="true" style={PIXELATED} />;
}

/** The rising pixel motes over the rays. */
const MOTE_COUNT = 46;

interface Mote {
  x: number;
  y: number;
  /** Rise speed, buffer pixels per 60 Hz frame. */
  v: number;
  a: number;
}

interface PixelRaysProps {
  /** One art pixel in design px (the buffer is one pixel per two). */
  pixelSize: number;
  rgb: Rgb;
  /** Static rays: no rotation, no swell, no motes (prefers-reduced-motion). */
  still?: boolean;
}

/** The Unveiling's light shafts over the whole 1280×720 stage, with rising motes. */
export function PixelRays({ pixelSize, rgb, still = false }: PixelRaysProps): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const [r, g, b] = rgb;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const block = pixelSize * 2;
    const w = Math.round(1280 / block);
    const h = Math.round(720 / block);
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(w, h);
    const d = image.data;
    // Presentational scatter (not the sim's seeded RNG: nothing here touches game state).
    const motes: Mote[] = Array.from({ length: MOTE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      v: 0.08 + Math.random() * 0.25,
      a: 0.3 + Math.random() * 0.6,
    }));
    const [mr, mg, mb] = [Math.min(255, r + 60), Math.min(255, g + 60), Math.min(255, b + 60)];
    let dead = false;
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    const draw = (now: number): void => {
      if (dead) return;
      const t = still ? 0 : (now - t0) / 1000;
      const swell = still ? 1 : Math.min(1, t / RAY_SWELL_SECONDS);
      paintRays(d, w, h, [r, g, b], t, swell);
      if (!still) {
        // Frame-rate independent: the handoff's per-frame speeds, read at 60 Hz.
        const k = Math.min(4, ((now - last) / 1000) * 60);
        for (const mo of motes) {
          mo.y -= mo.v * k;
          mo.x += Math.sin(t + mo.y * 0.1) * 0.05 * k;
          if (mo.y < 0) {
            mo.y = h;
            mo.x = Math.random() * w;
          }
          const mx = Math.floor(mo.x);
          const my = Math.floor(mo.y);
          if (mx < 0 || mx >= w || my < 0 || my >= h) continue;
          const i = (my * w + mx) * 4;
          d[i] = mr;
          d[i + 1] = mg;
          d[i + 2] = mb;
          d[i + 3] = mo.a * 255 * swell;
        }
      }
      last = now;
      ctx.putImageData(image, 0, 0);
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
    };
  }, [pixelSize, r, g, b, still]);

  return <canvas ref={ref} aria-hidden="true" style={PIXELATED} />;
}
