// Shared types for the Panvitium menu layer.
// These describe the *presentation* shape the menu components consume. In your
// app, map your real sim/store entities onto these (or replace outright) — see
// INTEGRATION.md §"Wiring to real state".

export type RoomId = 'invocation' | 'altar' | 'studio';
export type PanelId = 'maleficia' | 'ars-goetia' | 'pc' | 'suasio' | 'phone';
export type Rarity = 'common' | 'rare' | 'profane' | 'anathema';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HotspotAction =
  | { type: 'door'; to: RoomId }
  | { type: 'panel'; panel: PanelId }
  | { type: 'altar' };

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
  /**
   * Present only for the oracular items (Obsidian Mirror, Hollow Effigy, The Dadu, Crossroads Dirt,
   * Crow Feather); the live Opera tier-distribution readout they reveal.
   */
  reveal?: OracleGroup[];
}

/** One revealed Opera category's distributions (e.g. Suasio), for the oracular readout. */
export interface OracleGroup {
  /** Category id ('suasio' | 'decimatio' | 'indagatio' | 'emptio'). */
  category: string;
  /** Display label for the category. */
  label: string;
  /** Each action in the category, with its resolved tier odds. */
  actions: OracleAction[];
}

/** One action's resolved outcome odds, for the oracular readout. */
export interface OracleAction {
  /** Action id. */
  action: string;
  /** Display name. */
  name: string;
  /** The seven tiers in best→worst order, each with its probability (0..1). */
  tiers: OracleTier[];
}

/** One tier's slice of an action's outcome odds. */
export interface OracleTier {
  /** Tier id ('stellar' … 'apocalyptic'). */
  tier: string;
  /** Display label. */
  label: string;
  /** Probability in [0, 1]. */
  pct: number;
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

/** How a bound invocation is presented over its room (presentation only — read off the
 *  "is this invocation active" flag; touches no sim state). One entry per invocation that
 *  has a designed display; the `BoundInvocations` overlay renders each. CSS lengths are
 *  stage-relative (`%`) so the figure tracks the backdrop at any width. */
export interface BoundInvocationVisual {
  id: string;
  /** Which room the figure appears in. */
  room: RoomId;
  /** Figure art. */
  src: string;
  /** Figure box, stage-relative. `left` is the horizontal anchor (the figure is centered on it). */
  left: string;
  top: string;
  height: string;
  /** Soul-glow accent (any CSS colour) — drives the rim-light, aura, motes and caption. */
  glow: string;
  /** Levitating-trance treatment: enveloping shadow + pulsing aura + rising motes. */
  float?: boolean;
  /** Focal-vignette ink alpha (0..1) that dims the room while bound; omit/0 for none. */
  vignette?: number;
  /** Optional diegetic caption beneath the figure. */
  caption?: { title: string; subtitle: string; tint: string };
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
