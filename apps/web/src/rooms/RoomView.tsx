import { type ReactElement } from 'react';
import { type RoomDef, type HotspotAction } from './rooms.js';

interface RoomViewProps {
  room: RoomDef;
  onAction: (action: HotspotAction) => void;
}

/**
 * Renders one room: its backdrop and its interactive hotspots. Hotspots are diegetic — invisible
 * until hovered, when a faint gold glow and label reveal them. Real layered art slots into the
 * `.scene` backdrop later (ADR-021) without touching this component.
 */
export function RoomView({ room, onAction }: RoomViewProps): ReactElement {
  return (
    <div className={`scene ${room.sceneClass}`} role="group" aria-label={room.title}>
      {room.hotspots.map((h) => (
        <button
          key={h.id}
          type="button"
          className="hotspot"
          style={{
            left: `${h.rect.x}%`,
            top: `${h.rect.y}%`,
            width: `${h.rect.w}%`,
            height: `${h.rect.h}%`,
          }}
          onClick={() => onAction(h.action)}
          aria-label={h.label}
        >
          <span className="hotspot-label">{h.label}</span>
        </button>
      ))}
    </div>
  );
}
