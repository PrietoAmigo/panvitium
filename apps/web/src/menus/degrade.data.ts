/* degrade.data.ts — FIXTURES + design FLAVOUR. Not a source of truth.
   ----------------------------------------------------------------------------
   Two things live here:
     • BOUND_INVOCATION_VISUALS / ROOM_PLATES — design FLAVOUR (how a bound invocation is
       presented, which plate a room uses). Reusable in production: the integrator reads
       these and feeds them to the presentational layer. Keyed by the sim's canonical ids.
     • *_PREVIEW — storybook fixtures to render the components in isolation.
       DELETE / replace with real sim data on integration (see §2, §4).

   ⚠️  Components must never import this file. Props in, callbacks out. */

import type { RoomId, BoundInvocationVisual } from './types.js';

export const ASSET_BASE = '/assets/panvitium';

/* ---- FLAVOUR: which plate each room draws (the "complete"/furnished plates
   carry the baked props/acolytes the pass degrades together). ---- */
export const ROOM_PLATES: Record<RoomId, string> = {
  invocation: `${ASSET_BASE}/backgrounds/invocation_complete.png`,
  altar: `${ASSET_BASE}/backgrounds/altar_complete.png`,
  studio: `${ASSET_BASE}/backgrounds/studio_complete.png`,
};

/* ---- FLAVOUR: the Altar backdrop varies with how many acolytes the player keeps (0–4); each plate
   bakes that many acolytes into the scene. Clamped and floored, so an over-cap or fractional count
   still resolves to a real plate. Supersedes ROOM_PLATES.altar for the Altar room's canvas. ---- */
export function altarPlateForAcolytes(acolytes: number): string {
  const n = Math.max(0, Math.min(4, Math.floor(acolytes)));
  return `${ASSET_BASE}/backgrounds/altar_by_acolytes/169_altar_clean_${n}acolytes.png`;
}

/* ---- FLAVOUR: how each bound invocation is presented over its room. One entry per
   invocation that has a designed display; `DegradedScene` composites the figure into the room
   through the degradation pass while the invocation is active. Adding a new one is a single entry
   here — most invocations do not have a designed display yet and so simply have no entry (they
   render nothing). All lengths are stage-relative so the figure tracks the backdrop at any width. ---- */
export const BOUND_INVOCATION_VISUALS: Record<string, BoundInvocationVisual> = {
  // Morpheus levitates over the altar stone in a sleeping trance: a large dark enveloping shadow
  // wrapping the figure and the room dimmed so he reads as the focal light. He is composited into
  // the room through the degradation pass (see DegradedScene), so the figure, its float and its
  // shadow crush and pixelate at the same fidelity as the backdrop — no orange glow, no caption.
  morpheus: {
    id: 'morpheus',
    room: 'altar',
    src: `${ASSET_BASE}/invocations/morpheus.png`,
    left: '49%',
    top: '6%',
    height: '41%',
    float: true,
    vignette: 0.82,
  },
  // The Familiar is a grounded companion — a sitting hellhound on the studio floor just right of the
  // door, not a trance figure. It is composited into the room through the degradation pass like
  // Morpheus, so it crushes and pixelates at the room's fidelity — but it sits on the parquet, so it
  // omits `float` and `vignette` (no levitation, no enveloping shadow, no room dimming).
  familiar: {
    id: 'familiar',
    room: 'studio',
    src: `${ASSET_BASE}/invocations/dp.png`,
    left: '48%',
    top: '49%',
    height: '18%',
  },
};

/** Helper: the visuals for whichever bound invocations belong in `room`, from `summoned`
 *  (the active invocation ids). Skips any id without a designed display. */
export function boundVisualsFor(room: RoomId, summoned: string[]): BoundInvocationVisual[] {
  return summoned
    .map((id) => BOUND_INVOCATION_VISUALS[id])
    .filter((v): v is BoundInvocationVisual => v !== undefined && v.room === room);
}
