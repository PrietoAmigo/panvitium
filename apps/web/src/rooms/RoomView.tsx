import { type ReactElement } from 'react';
import { type RoomDef, type HotspotAction } from './rooms.js';
import { useGameStore } from '../store/gameStore.js';

interface RoomViewProps {
  room: RoomDef;
  onAction: (action: HotspotAction) => void;
}

/**
 * Renders one room: its backdrop and its interactive hotspots. Hotspots are diegetic — invisible
 * until hovered, when a faint gold glow and label reveal them. Real layered art slots into the
 * `.scene` backdrop later (ADR-021) without touching this component.
 *
 * Panvitium visual signature (03 §2.3): while the ritual runs, the Studio's window onto the world
 * is tinted red, lit by fires. We append a `panvitium-active` class to the studio scene so CSS can
 * render the glow; it's a no-op in the other rooms.
 */
export function RoomView({ room, onAction }: RoomViewProps): ReactElement {
  const panvitiumActive = useGameStore(
    (s) => s.state?.lifetime.activeToggles.includes('panvitium') ?? false,
  );
  const sceneClass =
    room.id === 'studio' && panvitiumActive
      ? `scene ${room.sceneClass} panvitium-active`
      : `scene ${room.sceneClass}`;
  return (
    <div className={sceneClass} role="group" aria-label={room.title}>
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
