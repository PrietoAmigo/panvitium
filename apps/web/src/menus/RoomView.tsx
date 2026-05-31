import { type ReactElement } from 'react';
import type { RoomDef, HotspotAction, SceneSprite } from './types.js';
import { DegradedScene } from './DegradedScene.js';
import { ROOM_PLATES, spriteFor } from './degrade.data.js';

interface RoomViewProps {
  room: RoomDef;
  signature: boolean; // Studio "panvitium" ritual glow (handled inside the pass)
  summoned: string[];
  onAction: (action: HotspotAction) => void;
}

function doorGlyph(id: string): string {
  if (id === 'door-left') return '\u2190';
  if (id === 'door-right') return '\u2192';
  return '\u2756';
}

// One room. The backdrop, its baked props, and any summoned creatures are composited onto a single
// <canvas> through the uniform degradation pass (DegradedScene), so the whole frame reads at one
// fidelity. The chrome — hotspots (and the HUD/panels above) — layers over it and stays crisp.
export function RoomView({ room, signature, summoned, onAction }: RoomViewProps): ReactElement {
  const sprites: SceneSprite[] =
    room.id === 'invocation'
      ? summoned.map(spriteFor).filter((s): s is SceneSprite => s !== null)
      : [];
  return (
    <div className={'scene ' + room.sceneClass} role="group" aria-label={room.title}>
      <DegradedScene
        roomId={room.id}
        backdrop={ROOM_PLATES[room.id]}
        sprites={sprites}
        signature={room.id === 'studio' && signature}
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
