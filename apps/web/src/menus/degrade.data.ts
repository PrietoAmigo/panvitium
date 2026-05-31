/* degrade.data.ts — FIXTURES + design FLAVOUR. Not a source of truth.
   ----------------------------------------------------------------------------
   Two things live here:
     • CREATURE_LAYOUT / ROOM_PLATES — design FLAVOUR (positions, which plate a
       room uses). Reusable in production: the integrator can feed these into
       DegradedScene, or override them. Keyed by the sim's canonical ids.
     • *_PREVIEW — storybook fixtures to render the components in isolation.
       DELETE / replace with real sim data on integration (see §2, §4).

   ⚠️  Components must never import this file. Props in, callbacks out. */

import type { RoomId, SceneSprite, GoetiaEntry } from './types.js';

export const ASSET_BASE = '/assets/panvitium';

/* ---- FLAVOUR: which plate each room draws (the "complete"/furnished plates
   carry the baked props/acolytes the pass degrades together). ---- */
export const ROOM_PLATES: Record<RoomId, string> = {
  invocation: `${ASSET_BASE}/backgrounds/invocation_complete.png`,
  altar: `${ASSET_BASE}/backgrounds/altar_complete.png`,
  studio: `${ASSET_BASE}/backgrounds/studio_complete.png`,
};

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

/* ---- FIXTURE: a slice of the roster to preview ArsGoetiaBook in isolation.
   Replace with the real view-model (buildGoetia) on integration. ---- */
export const GOETIA_PREVIEW: GoetiaEntry[] = [
  {
    id: 'imp',
    name: 'Imp',
    rank: 'I',
    cost: 'No soul cost',
    effect: '+10% reprobate generation while bound.',
    lore: 'A minor familiar, eager and spiteful. It scuttles where it is told and bites what it is shown.',
    illus: `${ASSET_BASE}/invocations/imp.png`,
    unlocked: true,
  },
  {
    id: 'upir',
    name: 'Upir',
    rank: 'II',
    cost: '12 Souls',
    effect: '+25% Decimatio yield.',
    lore: 'A revenant that feeds in the dark and does not tire. It thins the herd cleanly, and asks only that you look away.',
    illus: `${ASSET_BASE}/invocations/upir.png`,
    unlocked: true,
  },
  {
    id: 'behemoth',
    name: 'Behemoth',
    rank: 'VI',
    cost: '30 invoking power',
    gate: 'Gula L3',
    effect: '×2 reprobate generation.',
    lore: 'The glutton-beast, first of the appetites. Where it treads, the ground is never sated and neither are they.',
    illus: `${ASSET_BASE}/invocations/behemoth.png`,
    unlocked: false,
  },
];
