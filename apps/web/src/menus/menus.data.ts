// Static config + design flavour for the menu layer. What remains here is live:
//
// - ROOMS: the room/hotspot layout the `RoomView` reads (real config, not a stand-in).
// - INVOCATIONS / INVOCATION_BY_ID and MALEFICIA: the illustrated entries' art / lore (and the
//   maleficia split flavour/effect), merged onto the authoritative sim catalogs by the view-models
//   (game/invocations.ts, game/maleficia.ts). Mechanics — counts, costs, effects — always come from
//   `packages/sim`, never from here.
//
// The prototype's mock catalogs (the Sin / Sigil / Business / Achievement / Emptio stand-ins, the
// per-invocation effect copy) were dropped once every panel was wired to real state — those entities
// now feed from the sim and the store. See INTEGRATION.md §"Wiring to real state".

import type { RoomId, RoomDef, Invocation, Maleficium } from './types.js';

// All art is served from apps/web/public/assets/panvitium/ (Vite serves public/ at root).
export const ASSET_BASE = '/assets/panvitium';

export const ROOMS: Record<RoomId, RoomDef> = {
  invocation: {
    id: 'invocation',
    title: 'The Invocation Room',
    sceneClass: 'scene-invocation',
    hotspots: [
      {
        id: 'maleficia',
        label: 'Maleficia Shelf',
        rect: { x: 0.5, y: 28, w: 24.5, h: 53 },
        action: { type: 'panel', panel: 'maleficia' },
      },
      {
        id: 'ars-goetia',
        label: 'Ars Goetia',
        rect: { x: 57, y: 64, w: 36, h: 33 },
        action: { type: 'panel', panel: 'ars-goetia' },
      },
      {
        id: 'door',
        label: 'To the Altar',
        rect: { x: 59, y: 43.5, w: 5.2, h: 20.5 },
        action: { type: 'door', to: 'altar' },
      },
    ],
  },
  altar: {
    id: 'altar',
    title: 'The Altar Room',
    sceneClass: 'scene-altar',
    hotspots: [
      {
        id: 'altar',
        label: 'The Altar',
        rect: { x: 37, y: 48, w: 26, h: 35 },
        action: { type: 'altar' },
      },
      {
        id: 'door-left',
        label: 'To the Invocation Room',
        rect: { x: 0, y: 26, w: 9, h: 58 },
        action: { type: 'door', to: 'invocation' },
      },
      {
        id: 'door-right',
        label: 'To the Studio',
        rect: { x: 91, y: 26, w: 9, h: 58 },
        action: { type: 'door', to: 'studio' },
      },
    ],
  },
  studio: {
    id: 'studio',
    title: 'The Studio',
    sceneClass: 'scene-studio',
    hotspots: [
      {
        id: 'pc',
        label: 'PC',
        rect: { x: 65, y: 49, w: 31, h: 37 },
        action: { type: 'panel', panel: 'pc' },
      },
      {
        id: 'suasio',
        label: 'The Suasio Scroll',
        rect: { x: 13, y: 69, w: 34, h: 28 },
        action: { type: 'panel', panel: 'suasio' },
      },
      {
        id: 'door',
        label: 'To the Altar',
        rect: { x: 36, y: 38, w: 9.5, h: 24 },
        action: { type: 'door', to: 'altar' },
      },
    ],
  },
};

// Design flavour (art / lore / rank) for the illustrated invocations, merged onto the authoritative
// sim catalog by the view-models. Effect copy is sim-derived (see game/invocationEffect.ts), never
// from here, so no effect line is carried.
const INVOCATIONS: Invocation[] = [
  {
    id: 'imp',
    name: 'Imp',
    rank: 'I',
    sub: 'no soul cost',
    cost: 'No soul cost',
    gate: null,
    unlocked: true,
    img: `${ASSET_BASE}/invocations/imp.png`,
    lore: 'A minor familiar, eager and spiteful. It scuttles where it is told and bites what it is shown.',
  },
  {
    id: 'upir',
    name: 'Upir',
    rank: 'II',
    sub: '12 Souls',
    cost: '12 Souls',
    gate: null,
    unlocked: true,
    img: `${ASSET_BASE}/invocations/upir.png`,
    lore: 'A revenant that feeds in the dark and does not tire. It thins the herd cleanly, and asks only that you look away.',
  },
  {
    id: 'harpy',
    name: 'Harpy',
    rank: 'III',
    sub: '40 Souls',
    cost: '40 Souls',
    gate: null,
    unlocked: true,
    img: `${ASSET_BASE}/invocations/harpy.png`,
    lore: 'She carries whispers between the living, and leaves each one heavier than she found it.',
  },
  {
    id: 'fama',
    name: 'Fama',
    rank: 'IV',
    sub: '8 invoking power \u00B7 Vanagloria L1',
    cost: '8 invoking power',
    gate: 'Vanagloria L1',
    unlocked: false,
    img: `${ASSET_BASE}/invocations/fama.png`,
    lore: 'Rumour given a thousand mouths and wings to carry them. By the time it is denied, it is already believed.',
  },
  {
    id: 'nightmare',
    name: 'Nightmare',
    rank: 'V',
    sub: '14 invoking power \u00B7 Tristitia L2',
    cost: '14 invoking power',
    gate: 'Tristitia L2',
    unlocked: false,
    img: `${ASSET_BASE}/invocations/nightmare.png`,
    lore: 'It rides the sleeping and rides them down. The waking call it despair and never name the rider.',
  },
  {
    id: 'behemoth',
    name: 'Behemoth',
    rank: 'VI',
    sub: '30 invoking power \u00B7 Gula L3',
    cost: '30 invoking power',
    gate: 'Gula L3',
    unlocked: false,
    img: `${ASSET_BASE}/invocations/behemoth.png`,
    lore: 'The glutton-beast, first of the appetites. Where it treads, the ground is never sated and neither are they.',
  },
];
export const INVOCATION_BY_ID: Record<string, Invocation> = Object.fromEntries(
  INVOCATIONS.map((iv) => [iv.id, iv]),
);

export const MALEFICIA: Maleficium[] = [
  {
    id: 'obsidian_mirror',
    name: 'Obsidian Mirror',
    rarity: 'profane',
    img: `${ASSET_BASE}/maleficia/obsidian_mirror.png`,
    desc: 'It shows what the future is already weighing.',
    effect: 'Reveals every Opera distribution.',
  },
  {
    id: 'voynich_manuscript',
    name: 'The Voynich Manuscript',
    rarity: 'profane',
    img: `${ASSET_BASE}/maleficia/voynich_manuscript.png`,
    desc: 'Unreadable to the faithful; fluent to the fallen.',
    effect: '+66% Suasio efficiency.',
  },
  {
    id: 'defixio',
    name: 'Defixio',
    rarity: 'profane',
    img: `${ASSET_BASE}/maleficia/defixio.png`,
    desc: 'A name, a nail, a curse folded into lead and buried.',
    effect: 'Single-use: culls a random subtype.',
  },
  {
    id: 'codex_gigas',
    name: 'Codex Gigas',
    rarity: 'anathema',
    img: `${ASSET_BASE}/maleficia/codex_gigas.png`,
    desc: 'One scribe. One night. One signature in the margin no Pope has ever erased.',
    effect: '\u00D73 influence gain rate.',
  },
  {
    id: 'longinus',
    name: 'Spear of Longinus',
    rarity: 'anathema',
    img: `${ASSET_BASE}/maleficia/longinus.png`,
    desc: 'Just the tip.',
    effect: '\u00D73 maximum influence.',
  },
  {
    id: 'mark_of_cain',
    name: 'Mark of Cain',
    rarity: 'anathema',
    img: `${ASSET_BASE}/maleficia/mark_of_cain.png`,
    desc: 'The sevenfold vengeance was never a curse. It was a guarantee.',
    effect: 'Apocalyptic chance falls to zero.',
  },
  {
    id: '30_pieces',
    name: 'Thirty Pieces of Silver',
    rarity: 'anathema',
    img: `${ASSET_BASE}/maleficia/30_pieces.png`,
    desc: 'Counted out, refused, returned, refused again \u2014 coinage that always finds its way back into a hand.',
    effect: '\u00D73 gold gain rate.',
  },
  {
    id: 'solomon_ring',
    name: "Solomon's Ring",
    rarity: 'anathema',
    img: `${ASSET_BASE}/maleficia/solomon_ring.png`,
    desc: 'The seal that bound seventy-two kings. It still pinches.',
    effect: '+66% sigil effects.',
  },
  {
    id: 'ars_serpens',
    name: 'Ars Serpens',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/ars_serpens.png`,
    desc: "The serpent's counsel, transcribed \u2014 every word a smoother lie.",
    effect: '+33% Suasio efficiency.',
  },
  {
    id: 'ritual_dagger',
    name: 'Ritual Dagger',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/ritual_dagger.png`,
    desc: 'A rare hour of convergence: when offering and offerer cease to be separate.',
    effect: '+33% Decimatio efficiency.',
  },
  {
    id: 'blood_chalk',
    name: 'Blood Chalk',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/blood_chalk.png`,
    desc: 'Drawn in a circle no priest will step inside.',
    effect: '+4 invoking power.',
  },
  {
    id: 'blackthorn_wand',
    name: 'Blackthorn Wand',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/blackthorn_wand.png`,
    desc: 'Cut on a moonless night from a tree that took root over a grave.',
    effect: '+4 invoking power.',
  },
  {
    id: 'witch_bottle',
    name: 'Witch Bottle',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/witch_bottle.png`,
    desc: 'Urine, pins, and rosemary, corked against the dark \u2014 and aimed back at it.',
    effect: '+2 invoking power.',
  },
  {
    id: 'sulfur_censer',
    name: 'Sulfur Censer',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/sulfur_censer.png`,
    desc: 'Where it has burned, prayer no longer travels upward.',
    effect: '+2 invoking power.',
  },
  {
    id: 'mandrake_root',
    name: 'Mandrake Root',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/mandrake_root.png`,
    desc: 'It screamed when it was pulled. You kept it anyway.',
    effect: '+2 invoking power.',
  },
  {
    id: 'black_robe',
    name: 'Black Robe',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/black_robe.png`,
    desc: 'What separates the celebrant from the congregation is mostly fabric.',
    effect: '+1 invoking power.',
  },
  {
    id: 'black_candle',
    name: 'Black Candles',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/black_candle.png`,
    desc: 'Each flame a small renunciation of the light.',
    effect: '+5% invocation effect per candle.',
  },
  {
    id: 'black_salt_pouch',
    name: 'Black Salt Pouch',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/black_salt_pouch.png`,
    desc: 'Drawn from ash, charcoal, and graveyard earth.',
    effect: '+1 invoking power.',
  },
  {
    id: 'iron_nails',
    name: 'Iron Nails',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/iron_nails.png`,
    desc: 'Pulled from the True Cross, or near enough to sell.',
    effect: '+1% sigil effects & +1 invoking power each.',
  },
  {
    id: 'crossroads_dirt',
    name: 'Crossroads Dirt',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/crossroads_dirt.png`,
    desc: 'Gathered where four roads meet at midnight.',
    effect: 'Reveals the Emptio distribution.',
  },
  {
    id: 'crow_feather',
    name: 'Crow Feather',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/crow_feather.png`,
    desc: 'The bird that counts the dead leaves you one.',
    effect: 'Reveals the Indagatio distribution.',
  },
  {
    id: 'hollow_effigy',
    name: 'Hollow Effigy',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/hollow_effigy.png`,
    desc: "Wax in your likeness, and in someone else's.",
    effect: 'Reveals the Suasio distribution.',
  },
];
