// Placeholder catalogs for the menu layer, lifted from the prototype.
//
// ⚠️  These are DISPLAY STAND-INS. Your authoritative data already lives in
// `packages/sim` (e.g. maleficia.ts) and your game store. The intended end
// state is to delete most of this file and feed the components from real
// selectors — see INTEGRATION.md §"Wiring to real state". Kept here so the
// components compile and render in isolation.

import type {
  RoomId,
  RoomDef,
  Sin,
  Invocation,
  Maleficium,
  Sigil,
  Business,
  Achievement,
} from './types.js';

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

export const MAX_SIN_LEVEL = 4;
export function pips(level: number): string {
  let out = '';
  for (let i = 0; i < MAX_SIN_LEVEL; i++) out += i < level ? '\u25CF' : '\u25CB';
  return out;
}

export const SINS: Sin[] = [
  { prince: 'Lucifer', latin: 'Superbia', english: 'Pride', level: 3, devotion: '4.21K' },
  { prince: 'Mammon', latin: 'Avaritia', english: 'Greed', level: 3, devotion: '3.88K' },
  { prince: 'Asmodeus', latin: 'Luxuria', english: 'Lust', level: 2, devotion: '1.94K' },
  { prince: 'Satan', latin: 'Ira', english: 'Wrath', level: 2, devotion: '1.50K' },
  { prince: 'Beelzebub', latin: 'Gula', english: 'Gluttony', level: 2, devotion: '1.12K' },
  { prince: 'Leviathan', latin: 'Tristitia', english: 'Sorrow', level: 1, devotion: '640' },
  { prince: 'Belphegor', latin: 'Acedia', english: 'Sloth', level: 1, devotion: '590' },
  { prince: 'Rosier', latin: 'Vanagloria', english: 'Vainglory', level: 0, devotion: '120' },
];

export const INVOCATIONS: Invocation[] = [
  {
    id: 'imp',
    name: 'Imp',
    rank: 'I',
    sub: 'no soul cost',
    cost: 'No soul cost',
    gate: null,
    unlocked: true,
    img: `${ASSET_BASE}/invocations/imp.png`,
    effect: '+10% reprobate generation while bound.',
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
    effect: '+25% Decimatio yield.',
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
    effect: '+25% Suasio efficiency.',
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
    effect: '+50% influence gain.',
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
    effect: 'Raises the base suicide rate.',
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
    effect: '\u00D72 reprobate generation.',
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
    effect: '+50% sigil effects.',
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

export const SIGILS: Sigil[] = [
  { n: 5, name: 'Marbas', desc: 'Influence gain \u2191' },
  { n: 6, name: 'Valefor', desc: 'Gold gain \u2191' },
  { n: 7, name: 'Aamon', desc: 'Reprobate generation \u2191' },
  { n: 11, name: 'Gusion', desc: 'Terrible chance \u2193' },
  { n: 16, name: 'Zepar', desc: 'Reprobate generation \u2193' },
  { n: 18, name: 'Bathin', desc: 'Acolyte efficiency \u2191' },
  { n: 20, name: 'Purson', desc: 'Gold kept on descent \u2191' },
  { n: 23, name: 'Aim', desc: 'Choleric murder rate \u2191' },
  { n: 31, name: 'Foras', desc: 'Apocalyptic chance \u2193' },
  { n: 35, name: 'Marchosias', desc: 'Maximum influence \u2191' },
  { n: 38, name: 'Halphas', desc: 'Maleficia kept on descent \u2191' },
  { n: 40, name: 'Raum', desc: 'Decimatio efficiency \u2191' },
  { n: 49, name: 'Crocell', desc: 'Reprobate suicide rate \u2191' },
  { n: 60, name: 'Vapula', desc: 'Vitium Mercatura output \u2191' },
  { n: 71, name: 'Dantalion', desc: 'Suasio efficiency \u2191' },
];

export const BUSINESSES: Business[] = [
  { name: 'Street food stand', sub: 'Gula', cost: '50 Gold \u00B7 30s', unlocked: true },
  { name: 'Pimp', sub: 'Luxuria', cost: '120 Gold \u00B7 1m', unlocked: true },
  { name: 'Garage sale', sub: 'Avaritia', cost: '80 Gold \u00B7 45s', unlocked: true },
  { name: 'Arms dealer', sub: 'Ira L1', cost: 'Locked \u00B7 Ira L1', unlocked: false },
  { name: 'Casino', sub: 'Avaritia L3', cost: 'Locked \u00B7 Avaritia L3', unlocked: false },
];

export const DECIMATIO = {
  name: 'Caedis',
  sub: 'Cull the reprobate throng for souls.',
  cost: '40 Gold \u00B7 10s',
  cta: 'Cull',
};
export const INDAGATIO = {
  name: 'Indagatio',
  sub: 'A long, patient search of the world\u2019s corners.',
  cost: '30m 00s',
  cta: 'Begin the search',
};
export const EMPTIO = [
  { rarity: 'common', name: 'Tallow Stub', cost: '40 Gold' },
  { rarity: 'rare', name: 'Hand of Glory', cost: '220 Gold' },
  { rarity: 'profane', name: 'Goetic Seal of Purson', cost: '900 Gold' },
  { rarity: 'common', name: 'Cracked Scrying Glass', cost: '60 Gold' },
] as const;
export const ACHIEVEMENTS: Achievement[] = [
  { name: 'First Stain', desc: 'Generate your first reprobate.', got: true },
  { name: 'First Harvest', desc: 'Earn your first soul.', got: true },
  { name: 'First Descent', desc: 'Complete your first Katabasis.', got: true },
  { name: 'First Bargain', desc: 'Acquire your first maleficium.', got: true },
  { name: 'The Council Convenes', desc: 'Reach Level 1 in every Cardinal Sin.', got: false },
  { name: 'Profane Possession', desc: 'Own a profane maleficium.', got: false },
  { name: 'Eight at the Table', desc: 'Reach Level 3 in every Cardinal Sin.', got: false },
  { name: 'The Crown of Hell', desc: 'Reach Level 4 in every Cardinal Sin.', got: false },
];
