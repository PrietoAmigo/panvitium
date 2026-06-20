import { type ReactElement } from 'react';
import type { RoomDef, HotspotAction, DegradeSettings } from './types.js';
import { DegradedScene } from './DegradedScene.js';
import { ROOM_PLATES, altarPlateForAcolytes, boundVisualsFor } from './degrade.data.js';

interface RoomViewProps {
  room: RoomDef;
  signature: boolean; // Studio "panvitium" ritual glow (handled inside the pass)
  summoned: string[];
  /** Current acolyte count — selects the Altar backdrop (0–4). */
  acolytes: number;
  /** Fausto's curse is in force (`flagFaustoCurse`) — drives the "Vertigo" degrade layer. */
  curseActive: boolean;
  /** The viewer prefers reduced motion — the curse layer drops its vestibular sub-effects. */
  reducedMotion: boolean;
  onAction: (action: HotspotAction) => void;
}

function doorGlyph(id: string): string {
  if (id === 'door-left') return '\u2190';
  if (id === 'door-right') return '\u2192';
  return '\u2756';
}

// One room. The backdrop, its baked props AND any bound invocation figures are composited onto a
// single <canvas> through the uniform degradation pass (DegradedScene), so the whole frame — figures
// included — reads at one fidelity. The chrome — hotspots (and the HUD/panels above) — layers over
// that and stays clickable.
export function RoomView({
  room,
  signature,
  summoned,
  acolytes,
  curseActive,
  reducedMotion,
  onAction,
}: RoomViewProps): ReactElement {
  // The bound invocations that have a designed display in this room (Morpheus over the altar, …).
  const boundVisuals = boundVisualsFor(room.id, summoned);
  // The Altar's backdrop tracks the acolyte count (0–4); every other room uses its default plate.
  const backdrop = room.id === 'altar' ? altarPlateForAcolytes(acolytes) : ROOM_PLATES[room.id];
  // Presentation only — read straight off the curse flag; the pass eases the 0/1 target in/out.
  const degradeSettings: Partial<DegradeSettings> = {
    curseVertigo: curseActive ? 1 : 0,
    reducedMotion,
  };
  return (
    <div className={'scene ' + room.sceneClass} role="group" aria-label={room.title}>
      <DegradedScene
        roomId={room.id}
        backdrop={backdrop}
        figures={boundVisuals}
        signature={room.id === 'studio' && signature}
        settings={degradeSettings}
      />
      {room.hotspots.map((h) => {
        const isDoor = h.action.type === 'door';
        return (
          <button
            key={h.id}
            type="button"
            className={'hotspot' + (isDoor ? ' is-door' : '')}
            style={{
              left: h.rect.x + '%',
              top: h.rect.y + '%',
              width: h.rect.w + '%',
              height: h.rect.h + '%',
            }}
            onClick={() => onAction(h.action)}
            aria-label={h.label}
          >
            {isDoor && <span className="door-glyph">{doorGlyph(h.id)}</span>}
            <span className="hotspot-label">{h.label}</span>
          </button>
        );
      })}
    </div>
  );
}
