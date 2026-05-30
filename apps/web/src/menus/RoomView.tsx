import { type ReactElement } from 'react';
import type { RoomDef, HotspotAction } from './types.js';
import { ASSET_BASE } from './menus.data.js';
import { SummonedCreatures } from './SummonedCreatures.js';

interface RoomViewProps {
  room: RoomDef;
  signature: boolean; // Studio "panvitium" red glow while a ritual runs
  summoned: string[];
  onAction: (action: HotspotAction) => void;
}

function doorGlyph(id: string): string {
  if (id === 'door-left') return '\u2190';
  if (id === 'door-right') return '\u2192';
  return '\u2756';
}

// One room: the photoreal backdrop (via sceneClass), the baked scene prop + any
// summoned creatures (Invocation only), and the clickable hotspots.
export function RoomView({ room, signature, summoned, onAction }: RoomViewProps): ReactElement {
  let sceneClass = 'scene ' + room.sceneClass;
  if (room.id === 'studio' && signature) sceneClass += ' panvitium-active';
  return (
    <div className={sceneClass} role="group" aria-label={room.title}>
      {room.id === 'invocation' && (
        <img
          className="scene-prop"
          src={`${ASSET_BASE}/items/ars_goetia.png`}
          alt="The Ars Goetia"
          style={{ left: '55.5%', bottom: '1.5%', width: '38%' }}
        />
      )}
      {room.id === 'invocation' && <SummonedCreatures summoned={summoned} />}
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
