/* DegradedScene — the room backdrop + summoned creatures, rendered through the
   uniform degradation pass onto a <canvas>. Drop it where the CSS `.scene`
   background used to be; the integrator layers hotspots over it (see RoomView).

   Archetype: ROOM VIEW layer (not a PanelShell panel; not a full-screen overlay).
   Presentational + prop-driven: it holds no game state. A `roomId` change plays
   the fade-to-black room transition. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { DegradePass, DEFAULT_DEGRADE } from './degrade.js';
import type { EngineScene, EngineSprite } from './degrade.js';
import type { DegradedSceneProps } from './types.js';

/** Small image cache — loads urls once, re-renders when each decodes. */
function useImages(urls: string[]): Record<string, HTMLImageElement> {
  // Stored in state (not a ref): each decode yields a NEW object, so consumers that depend on the
  // returned map actually re-run when an image loads. (A mutated ref keeps the same identity, which
  // left the first visit to a room black — the scene never recomposed once the plate decoded.)
  const [cache, setCache] = useState<Record<string, HTMLImageElement>>({});
  const key = urls.join('|');
  useEffect(() => {
    let alive = true;
    for (const u of urls) {
      if (!u || cache[u]) continue;
      const im = new Image();
      im.onload = (): void => {
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
  signature = false,
  settings,
  className,
}: DegradedSceneProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const passRef = useRef<DegradePass | null>(null);
  const prevRoom = useRef<string | null>(null);

  const urls = useMemo(() => [backdrop, ...sprites.map((s) => s.src)], [backdrop, sprites]);
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
    const scene: EngineScene = { bg, sprites: engineSprites, signature };
    const animate = prevRoom.current !== null && prevRoom.current !== roomId;
    prevRoom.current = roomId;
    pass.setScene(scene, animate);
  }, [roomId, backdrop, sprites, signature, images]);

  return (
    <canvas
      ref={canvasRef}
      className={'scene-canvas' + (className ? ' ' + className : '')}
      aria-hidden="true"
    />
  );
}
