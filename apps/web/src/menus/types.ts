// Shared types for the Panvitium menu layer.
// These describe the *presentation* shape the menu components consume. In your
// app, map your real sim/store entities onto these (or replace outright) — see
// INTEGRATION.md §"Wiring to real state".

export type RoomId = 'invocation' | 'altar' | 'studio';
export type PanelId = 'maleficia' | 'ars-goetia' | 'altar-menu' | 'pc' | 'suasio';
export type Rarity = 'common' | 'rare' | 'profane' | 'anathema';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HotspotAction = { type: 'door'; to: RoomId } | { type: 'panel'; panel: PanelId };

export interface Hotspot {
  id: string;
  label: string;
  rect: Rect; // percentages of the 16:9 scene
  action: HotspotAction;
}

export interface RoomDef {
  id: RoomId;
  title: string;
  sceneClass: string; // maps to .scene-invocation / -altar / -studio in menus.css
  hotspots: Hotspot[];
}

export interface Sin {
  prince: string;
  latin: string;
  english: string;
  level: number; // 0..MAX_SIN_LEVEL
  devotion: string; // pre-formatted for display
}

export interface Invocation {
  id: string;
  name: string;
  rank: string; // roman numeral
  sub: string;
  cost: string;
  gate: string | null; // unlock requirement, or null if always available
  unlocked: boolean;
  img: string;
  effect: string;
  lore: string;
}

export interface Maleficium {
  id: string;
  name: string;
  rarity: Rarity;
  img: string;
  desc: string;
  effect: string;
}

export interface Sigil {
  n: number;
  name: string;
  desc: string;
}
export interface Business {
  name: string;
  sub: string;
  cost: string;
  unlocked: boolean;
}
export interface Achievement {
  name: string;
  desc: string;
  got: boolean;
}
export interface LogLine {
  tier: 'good' | 'excellent' | 'stellar' | 'neutral' | 'bad';
  text: string;
}
