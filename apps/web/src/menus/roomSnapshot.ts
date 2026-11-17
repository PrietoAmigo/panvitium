/* The room as the player last saw it, for the Exstinctio transit (see exstinctio.ts).

   The room's canvas is the degradation pass's finished frame. RoomView registers its stage here, and
   the transit reads that canvas back the moment it mounts, one pixel per pass block, so its first
   frame is the room exactly as it stood (the acolytes, any bound figure, the seal's glow painted
   into the pass) and its frame sits over the room's on the screen. A module-level slot, like the
   decoded-image cache in DegradedScene: there is only ever one room on the stage. */

import { DEFAULT_DEGRADE } from './degrade.js';
import { lowResSize, sampleBlocks, type PixelBuffer } from './exstinctio.js';

let stage: HTMLElement | null = null;

/** Make `el` the stage whose room canvas a snapshot reads. Returns the matching unregister. */
export function registerRoomStage(el: HTMLElement | null): () => void {
  stage = el;
  return () => {
    if (stage === el) stage = null;
  };
}

/** Where the room's picture sits on the screen (viewport px). */
export interface StageRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface RoomSnapshot {
  /** The pass's low-resolution buffer, read back from its finished frame. */
  readonly image: PixelBuffer;
  readonly rect: StageRect;
}

/** Read the room back now, or `null` when there is no room canvas to read (none registered, not
 *  laid out, no 2D context, or its pixels can't be read). */
export function snapshotRoom(): RoomSnapshot | null {
  const canvas = stage?.querySelector<HTMLCanvasElement>('canvas.scene-canvas') ?? null;
  if (!canvas || canvas.width < 2 || canvas.height < 2) return null;
  const box = canvas.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let full: ImageData;
  try {
    full = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
  const { w, h } = lowResSize(canvas.width, canvas.height, DEFAULT_DEGRADE.block);
  return {
    image: sampleBlocks(full, w, h),
    rect: { left: box.left, top: box.top, width: box.width, height: box.height },
  };
}
