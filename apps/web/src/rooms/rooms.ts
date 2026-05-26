/**
 * The three-room playspace (02 §10), modelled as a small scene-graph (ADR-002/021): each room is
 * a backdrop plus positioned interactive hotspots. The skeleton renders the backdrop as CSS and
 * the hotspots as click regions; when the degraded-photoreal layer assets and their JSON manifest
 * exist, each room becomes Layer[] (decor, fixtures, silhouettes, overlays) without changing this
 * shape — hotspots stay the interactive layer.
 *
 * Door navigation follows 02 §10 exactly:
 *   Invocation door -> Altar | Studio door -> Altar | Altar left -> Invocation, right -> Studio.
 */
export type RoomId = 'invocation' | 'altar' | 'studio';

export type PanelId = 'ars-goetia' | 'maleficia' | 'altar-menu' | 'pc' | 'suasio';

/** A rectangle in percentages of the stage (0–100), so rooms scale with the viewport. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HotspotAction =
  | { readonly type: 'panel'; readonly panel: PanelId }
  | { readonly type: 'door'; readonly to: RoomId };

export interface Hotspot {
  readonly id: string;
  readonly label: string;
  readonly rect: Rect;
  readonly action: HotspotAction;
}

export interface RoomDef {
  readonly id: RoomId;
  readonly title: string;
  /** CSS class carrying this room's bespoke backdrop until real art lands. */
  readonly sceneClass: string;
  readonly hotspots: readonly Hotspot[];
}

export const ROOMS: Record<RoomId, RoomDef> = {
  invocation: {
    id: 'invocation',
    title: 'The Invocation Room',
    sceneClass: 'scene-invocation',
    hotspots: [
      {
        id: 'ars-goetia',
        label: 'Ars Goetia',
        rect: { x: 18, y: 40, w: 16, h: 22 },
        action: { type: 'panel', panel: 'ars-goetia' },
      },
      {
        id: 'maleficia',
        label: 'Maleficia Shelf',
        rect: { x: 40, y: 30, w: 20, h: 30 },
        action: { type: 'panel', panel: 'maleficia' },
      },
      {
        id: 'door',
        label: 'To the Altar',
        rect: { x: 80, y: 38, w: 12, h: 48 },
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
        rect: { x: 40, y: 52, w: 22, h: 22 },
        action: { type: 'panel', panel: 'altar-menu' },
      },
      {
        id: 'door-left',
        label: 'To the Invocation Room',
        rect: { x: 6, y: 38, w: 12, h: 48 },
        action: { type: 'door', to: 'invocation' },
      },
      {
        id: 'door-right',
        label: 'To the Studio',
        rect: { x: 82, y: 38, w: 12, h: 48 },
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
        label: 'The Desk',
        rect: { x: 38, y: 56, w: 26, h: 24 },
        action: { type: 'panel', panel: 'pc' },
      },
      {
        id: 'suasio',
        label: 'The Suasio Scroll',
        rect: { x: 68, y: 50, w: 14, h: 20 },
        action: { type: 'panel', panel: 'suasio' },
      },
      {
        id: 'door',
        label: 'To the Altar',
        rect: { x: 6, y: 38, w: 12, h: 48 },
        action: { type: 'door', to: 'altar' },
      },
    ],
  },
};
