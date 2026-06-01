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
  /**
   * Present only for single-use consumables (Hand of Glory, Defixio); drives the cabinet's "Use"
   * control. Absent for ordinary maleficia, which have no activation affordance.
   */
  use?: MaleficiumUse;
}

/** The cabinet's single-use activation affordance for a consumable maleficium. */
export interface MaleficiumUse {
  /** Label for the activate button (e.g. "Use"). */
  label: string;
  /** False when the item is owned but cannot be activated right now (e.g. a defixio already runs). */
  enabled: boolean;
  /** A line describing the current effect status (remaining buff time, the cursed subtype), if any. */
  status?: string;
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

// ── Degradation layer (degradation-pass handoff) ────────────────────────────
// Presentation shapes for the canvas degradation pass. RoomId above is shared.
// DegradeSettings/Engine* come from the engine. (The Ars Goetia book's types live
// in ./ars-goetia.types.ts — decoupled from this layer.)
import type { DegradeSettings } from './degrade.js';
export type { DegradeSettings, EngineSprite, EngineScene } from './degrade.js';

/** A diegetic sprite laid into the room scene; positions are stage fractions 0..1. */
export interface SceneSprite {
  id: string;
  src: string;
  x: number;
  y: number;
  w: number;
}

/** Props for the room scene layer (degraded backdrop + sprites). */
export interface DegradedSceneProps {
  roomId: RoomId;
  backdrop: string;
  sprites?: SceneSprite[];
  signature?: boolean;
  settings?: Partial<DegradeSettings>;
  className?: string;
}
