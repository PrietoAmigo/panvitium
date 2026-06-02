/* degrade.data.ts — FIXTURES + design FLAVOUR. Not a source of truth.
   ----------------------------------------------------------------------------
   Two things live here:
     • CREATURE_LAYOUT / ROOM_PLATES — design FLAVOUR (positions, which plate a
       room uses). Reusable in production: the integrator can feed these into
       DegradedScene, or override them. Keyed by the sim's canonical ids.
     • *_PREVIEW — storybook fixtures to render the components in isolation.
       DELETE / replace with real sim data on integration (see §2, §4).

   ⚠️  Components must never import this file. Props in, callbacks out. */

import type { RoomId, SceneSprite } from './types.js';

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

/* ---- FLAVOUR: default standing spot + scale for a summoned creature in the
   Invocation circle, by invocation id. x = centre, y = baseline, w = width,
   all stage fractions. Tuned to the invocation_complete plate's circle. ---- */
export const CREATURE_LAYOUT: Record<string, { x: number; y: number; w: number }> = {
  imp: { x: 0.3, y: 0.93, w: 0.2 },
  upir: { x: 0.3, y: 0.93, w: 0.24 },
  harpy: { x: 0.3, y: 0.93, w: 0.26 },
  succubus: { x: 0.3, y: 0.93, w: 0.24 },
  nightmare: { x: 0.3, y: 0.93, w: 0.3 },
  behemoth: { x: 0.3, y: 0.93, w: 0.3 },
};

/** Helper: build a SceneSprite for a summoned invocation from the layout map. */
export function spriteFor(id: string): SceneSprite | null {
  const l = CREATURE_LAYOUT[id];
  if (!l) return null;
  return { id, src: `${ASSET_BASE}/invocations/${id}.png`, x: l.x, y: l.y, w: l.w };
}
