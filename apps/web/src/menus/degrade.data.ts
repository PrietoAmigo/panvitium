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
  // omits `float` and `vignette` (no levitation, no enveloping shadow, no room dimming). It specifies
  // no movement, so it holds perfectly still (sitting), not idly bobbing.
  familiar: {
    id: 'familiar',
    room: 'studio',
    src: `${ASSET_BASE}/invocations/dp.png`,
    left: '48%',
    top: '49%',
    height: '18%',
  },
  // Aurevora sits cross-legged on the invocation circle in a meditative trance, resting on the floor.
  // No `float` (no levitation, no enveloping shadow) and no `vignette` (the room is not dimmed). The
  // art is pre-mirrored (`aurevora_flipped.png`) since BoundInvocationVisual has no flip flag. He
  // specifies no movement, so he holds perfectly still. Composited through the degradation pass like
  // any bound figure, so he crushes/pixelates with the room. Baseline (top + height = 87%) lands at
  // the centre of the red ritual circle.
  aurevora: {
    id: 'aurevora',
    room: 'invocation',
    src: `${ASSET_BASE}/invocations/aurevora_flipped.png`,
    left: '30%',
    top: '46%',
    height: '41%',
  },
  // Astiwihad stands at the player's threshold, right of the altar — head and upper torso only, the
  // rest cropped below frame (height ~1.9× the stage, so the feet fall far below the visible stage).
  // No `float` (no enveloping shadow) and no `vignette` (no room-dimming focal glow). He specifies no
  // movement, so he holds perfectly still. Composited through the same degradation pass as the room.
  // The altar and the right-hand door stay visible to his left.
  astiwihad: {
    id: 'astiwihad',
    room: 'altar',
    src: `${ASSET_BASE}/invocations/astiwihad.png`,
    left: '68%',
    top: '6%',
    height: '188%',
  },
  // Specunitas stands in the Studio, facing the lens with his cameras raised. The PoV looks across
  // the foreground desk, so his legs read as hidden: the art is the head-to-hip cut
  // (`specunitas_studio.png`) and the desk/lower frame occupy everything below his baseline
  // (top + height = 73.8%, on the desk surface). He does NOT levitate (no `float`) — a grounded
  // figure, not a trance — and specifies no movement, so he holds perfectly still; a gentle focal dim
  // (`vignette`) lets the apex presence read against the busy panelling. Position is HAND-TUNED and
  // signed off (do not auto-adjust): he sits just left of the laptop, his lowered-camera hand
  // reaching to the monitor's left edge. Figures composite ON TOP of the backdrop (no occluder
  // layer), so the placement itself keeps him clear of the screen. Composited through the
  // degradation pass like any other figure, so he crushes/pixelates uniformly with the room.
  specunitas: {
    id: 'specunitas',
    room: 'studio',
    src: `${ASSET_BASE}/invocations/specunitas_studio.png`,
    left: '55.2%',
    top: '24.4%',
    height: '49.4%',
    vignette: 0.4,
  },
};

/** Helper: the visuals for whichever bound invocations belong in `room`, from `summoned`
 *  (the active invocation ids). Skips any id without a designed display. */
export function boundVisualsFor(room: RoomId, summoned: string[]): BoundInvocationVisual[] {
  return summoned
    .map((id) => BOUND_INVOCATION_VISUALS[id])
    .filter((v): v is BoundInvocationVisual => v !== undefined && v.room === room);
}
