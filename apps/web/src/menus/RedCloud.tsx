import { useEffect, useRef, type ReactElement } from 'react';

// The red cloud over the end-state Court (the Eternal feeding screen, Claude Design "Red Cloud" 4a).
// The player stands inside it; every soul poured into the obelisk thins it, until at the reveal the
// Court is clear. Two drifting fields of value noise, painted ONCE per density into small canvases
// that the browser upscales (a live SVG feTurbulence dropped the design to ~13 fps): the drift is a
// pure compositor transform, and a repaint happens only when the density moves (while pouring).

/** One noise field: a 320 × 180 tile that wraps in x, so two side by side drift without a seam. */
export const FOG_W = 320;
export const FOG_H = 180;
/** The octaves' cell sizes in px, at amplitudes 1, 0.5, 0.25, 0.125 (normalised). */
const FOG_OCTAVES = [64, 32, 16, 8] as const;
/** Each layer's seed, so the two fields never line up. */
const FOG_SEEDS = [7, 21] as const;
/** The cloud's colour: every pixel is this red; only its alpha varies with the noise. */
const FOG_RGB = [158, 15, 13] as const;

/**
 * A 4-octave value-noise field in [0, 1], from a seeded Lehmer LCG (the prototype's `makeNoise`):
 * deterministic, so the cloud is the same every visit. Each octave's grid wraps in x.
 */
export function makeFogNoise(seed: number): Float32Array {
  let t = seed;
  const rnd = (): number => {
    t = (t * 16807) % 2147483647;
    return t / 2147483647;
  };
  const out = new Float32Array(FOG_W * FOG_H);
  let amp = 1;
  let total = 0;
  for (const cell of FOG_OCTAVES) {
    const gw = FOG_W / cell;
    const gh = Math.ceil(FOG_H / cell) + 2;
    const g = Float64Array.from({ length: gw * gh }, rnd);
    const at = (i: number): number => g[i] ?? 0;
    for (let y = 0; y < FOG_H; y++) {
      const fy = y / cell;
      const iy = Math.floor(fy);
      const sy = fy - iy;
      const uy = sy * sy * (3 - 2 * sy);
      for (let x = 0; x < FOG_W; x++) {
        const fx = x / cell;
        const ix = Math.floor(fx);
        const sx = fx - ix;
        const ux = sx * sx * (3 - 2 * sx);
        const ix1 = (ix + 1) % gw; // the x-wrap: the tile's right edge meets its left
        const a = at(iy * gw + ix);
        const b = at(iy * gw + ix1);
        const c = at((iy + 1) * gw + ix);
        const d = at((iy + 1) * gw + ix1);
        const j = y * FOG_W + x;
        out[j] =
          (out[j] ?? 0) + amp * (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let j = 0; j < out.length; j++) out[j] = (out[j] ?? 0) / total;
  return out;
}

/**
 * The alpha offset for a density in [0, 1]; a pixel's alpha is `clamp(3·noise + offset, 0, 1)`.
 * Density 1 is a solid cloud, about 0.5 broken wisps, 0 fully clear. Rounded to 3 places: the
 * canvases repaint only when it changes.
 */
export function fogOffset(density: number): number {
  const d = Math.min(1, Math.max(0, density));
  return Math.round((-2.6 + d * 3.6) * 1000) / 1000;
}

/** A pixel's alpha (0..1) for a noise value at an offset. */
export function fogAlpha(noise: number, offset: number): number {
  return Math.min(1, Math.max(0, 3 * noise + offset));
}

// Generated on first paint and kept: the fields never change, only the offset they are read at.
let noiseCache: readonly Float32Array[] | null = null;
function fogNoise(): readonly Float32Array[] {
  noiseCache ??= FOG_SEEDS.map(makeFogNoise);
  return noiseCache;
}

/** Paint one field, tiled twice across the canvas (its width is 2 × FOG_W), at `offset`. */
function paintFog(canvas: HTMLCanvasElement | null, noise: Float32Array, offset: number): void {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const cw = canvas.width;
  const img = ctx.createImageData(cw, FOG_H);
  const px = img.data;
  for (let y = 0; y < FOG_H; y++) {
    for (let x = 0; x < cw; x++) {
      const j = (y * cw + x) * 4;
      px[j] = FOG_RGB[0];
      px[j + 1] = FOG_RGB[1];
      px[j + 2] = FOG_RGB[2];
      px[j + 3] = fogAlpha(noise[y * FOG_W + (x % FOG_W)] ?? 0, offset) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * The cloud's three layers over the Court art: the red multiply wash, then the two noise fields
 * drifting left to right (A slow, B fast and breathing). `density` is 1 − the Eternal progress.
 * The vignette, scanlines and grain above them are the scene's own (`.hell::after`, the chrome).
 */
export function RedCloud({ density }: { density: number }): ReactElement {
  const aRef = useRef<HTMLCanvasElement>(null);
  const bRef = useRef<HTMLCanvasElement>(null);
  const d = Math.min(1, Math.max(0, density));
  const offset = fogOffset(d);

  useEffect(() => {
    const [na, nb] = fogNoise();
    if (na) paintFog(aRef.current, na, offset);
    if (nb) paintFog(bRef.current, nb, offset);
  }, [offset]);

  return (
    <>
      <div className="cloud-wash" style={{ opacity: d * 0.55 }} aria-hidden="true" />
      <canvas
        ref={aRef}
        className="cloud-fog"
        width={FOG_W * 2}
        height={FOG_H}
        aria-hidden="true"
      />
      <canvas
        ref={bRef}
        className="cloud-fog cloud-fog--b"
        width={FOG_W * 2}
        height={FOG_H}
        aria-hidden="true"
      />
    </>
  );
}
