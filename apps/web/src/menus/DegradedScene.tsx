/* DegradedScene — the room backdrop + summoned creatures, rendered through the
   uniform degradation pass onto a <canvas>. Drop it where the CSS `.scene`
   background used to be; the integrator layers hotspots over it (see RoomView).

   Archetype: ROOM VIEW layer (not a PanelShell panel; not a full-screen overlay).
   Presentational + prop-driven: it holds no game state. A `roomId` change plays
   the fade-to-black room transition. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { DegradePass, DEFAULT_DEGRADE } from './degrade.js';
import type { EngineScene, EngineSprite } from './degrade.js';
import type { BoundInvocationVisual, DegradedSceneProps } from './types.js';

// The composited stage is 16:9 (matches the engine's VW×VH buffer). A bound figure's `height` is a
// fraction of stage height, but the engine sizes sprites by `w` (fraction of stage width) and derives
// the height from the image's natural aspect — so converting needs this ratio plus the natural dims.
const STAGE_ASPECT = 720 / 1280;
// Dark enveloping shadow blur for a levitating figure, as a fraction of stage height (≈230px / 720).
// A large halo: the widest stacked cast wraps well past the silhouette so Morpheus reads as the dark
// focal mass over the altar.
const FLOAT_SHADOW = 0.32;

function frac(pct: string): number {
  return parseFloat(pct) / 100;
}

/** Convert a bound invocation visual into an engine sprite — once its art has decoded (the natural
 *  aspect sets the width that yields the designed `height`). The figure then composites THROUGH the
 *  degradation pass like any other sprite, so it crushes/pixelates with the room. */
function figureToSprite(v: BoundInvocationVisual, img: HTMLImageElement): EngineSprite | null {
  if (!img.complete || !img.naturalWidth) return null;
  const heightFrac = frac(v.height);
  return {
    img,
    x: frac(v.left),
    // Baseline (feet) sits at the bottom of the figure box: its top edge plus its height.
    y: frac(v.top) + heightFrac,
    w: heightFrac * STAGE_ASPECT * (img.naturalWidth / img.naturalHeight),
    phase: 0,
    float: v.float === true,
    shadow: v.float ? FLOAT_SHADOW : 0,
    // Bound invocations hold still unless a movement is specified (only `float` today, e.g.
    // Morpheus levitating). Grounded figures sit perfectly still rather than idly bobbing.
    still: v.float !== true,
    // Flat contact/ground shadow under the feet, when the figure requests one (grounded figures).
    // Omitted (not set to undefined) per exactOptionalPropertyTypes when there is no ground shadow.
    ...(v.groundShadow ? { groundShadow: v.groundShadow } : {}),
    // Long directional cast shadow trailing from the feet, when the figure requests one (the
    // Succubus). Omitted (not set to undefined) per exactOptionalPropertyTypes when absent.
    ...(v.shadowCast ? { castShadow: v.shadowCast } : {}),
    // Crop the figure below a stage-fraction, when requested (Midas behind the Studio table). Omitted
    // (not set to undefined) per exactOptionalPropertyTypes when there is no clip.
    ...(v.clipBottom != null ? { clipBelow: v.clipBottom } : {}),
  };
}

// Module-level cache of already-decoded images, keyed by url. `useImages` seeds its initial state
// from this synchronously, so a backdrop that was preloaded (see `preloadImage`) is present on the
// component's FIRST render — the scene composes WITH the plate on its very first frame instead of
// painting one empty (dark) frame first. This is what makes the jumpscare plate appear instantly
// rather than flashing black for a beat while it decodes (it is preloaded the moment the scare arms).
const DECODED_IMAGES = new Map<string, HTMLImageElement>();

/** Preload + decode an image into the module cache ahead of time, so a later `DegradedScene` that
 *  uses it shows it on its first frame (no black flash). Idempotent; safe to call repeatedly. */
export function preloadImage(url: string): void {
  if (!url || DECODED_IMAGES.has(url) || typeof Image === 'undefined') return;
  const im = new Image();
  im.onload = (): void => {
    DECODED_IMAGES.set(url, im);
  };
  im.src = url;
}

/** Small image cache — loads urls once, re-renders when each decodes. */
function useImages(urls: string[]): Record<string, HTMLImageElement> {
  // Stored in state (not a ref): each decode yields a NEW object, so consumers that depend on the
  // returned map actually re-run when an image loads. (A mutated ref keeps the same identity, which
  // left the first visit to a room black — the scene never recomposed once the plate decoded.)
  // Seeded synchronously from the module-level decoded cache so a preloaded plate is on screen the
  // first frame (no empty-canvas flash) — see DECODED_IMAGES / preloadImage.
  const [cache, setCache] = useState<Record<string, HTMLImageElement>>(() => {
    const seed: Record<string, HTMLImageElement> = {};
    for (const u of urls) {
      const decoded = DECODED_IMAGES.get(u);
      if (decoded) seed[u] = decoded;
    }
    return seed;
  });
  const key = urls.join('|');
  useEffect(() => {
    let alive = true;
    for (const u of urls) {
      if (!u || cache[u]) continue;
      const im = new Image();
      im.onload = (): void => {
        DECODED_IMAGES.set(u, im);
        if (!alive) return;
        setCache((prev) => (prev[u] ? prev : { ...prev, [u]: im }));
      };
      im.src = u;
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return cache;
}

export function DegradedScene({
  roomId,
  backdrop,
  sprites = [],
  figures = [],
  signature = false,
  settings,
  className,
}: DegradedSceneProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const passRef = useRef<DegradePass | null>(null);
  const prevRoom = useRef<string | null>(null);

  const urls = useMemo(
    () => [backdrop, ...sprites.map((s) => s.src), ...figures.map((f) => f.src)],
    [backdrop, sprites, figures],
  );
  const images = useImages(urls);

  // Build + start the engine once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pass = new DegradePass(canvas);
    pass.set({ ...DEFAULT_DEGRADE, ...settings });
    pass.start();
    passRef.current = pass;
    return () => {
      pass.stop();
      passRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push recipe changes.
  useEffect(() => {
    passRef.current?.set({ ...DEFAULT_DEGRADE, ...settings });
  }, [settings]);

  // (Re)compose the scene; a room change animates the fade-to-black curtain.
  useEffect(() => {
    const pass = passRef.current;
    if (!pass) return;
    const bg = images[backdrop] ?? null;
    const engineSprites: EngineSprite[] = sprites
      .map((sp): EngineSprite | null => {
        const img = images[sp.src];
        return img ? { img, x: sp.x, y: sp.y, w: sp.w, phase: 0 } : null;
      })
      .filter((sp): sp is EngineSprite => sp !== null);
    // Bound invocation figures composite into the SAME scene buffer as the backdrop, so they pass
    // through the degradation recipe (pixelate / grade / scanlines / grain) at one uniform fidelity.
    const figureSprites: EngineSprite[] = figures
      .map((v): EngineSprite | null => {
        const img = images[v.src];
        return img ? figureToSprite(v, img) : null;
      })
      .filter((sp): sp is EngineSprite => sp !== null);
    const focalVignette = Math.max(0, ...figures.map((v) => v.vignette ?? 0));
    const scene: EngineScene = {
      bg,
      sprites: [...engineSprites, ...figureSprites],
      signature,
      focalVignette,
    };
    const animate = prevRoom.current !== null && prevRoom.current !== roomId;
    prevRoom.current = roomId;
    pass.setScene(scene, animate);
  }, [roomId, backdrop, sprites, figures, signature, images]);

  return (
    <canvas
      ref={canvasRef}
      className={'scene-canvas' + (className ? ' ' + className : '')}
      aria-hidden="true"
    />
  );
}
