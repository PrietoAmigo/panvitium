import { useEffect, useMemo, type ReactElement } from 'react';
import type { RoomDef, HotspotAction, DegradeSettings } from './types.js';
import { DegradedScene, preloadImage } from './DegradedScene.js';
import { ROOM_PLATES, altarPlateForAcolytes, boundVisualsFor } from './degrade.data.js';
import { CALL_PLATE_RING } from './calls-in.data.js';
import { AltarSigil, ALTAR_SIGIL_SRC, type AltarSigilView } from './AltarSigil.js';

interface RoomViewProps {
  room: RoomDef;
  signature: boolean; // Studio "panvitium" ritual glow (handled inside the pass)
  summoned: string[];
  /** Whether the one-time Doppelgänger jumpscare has fired — once it has, the Doppelgänger figure is
   *  suppressed for good (it never appears again). Drives `boundVisualsFor`'s Doppelgänger rules. */
  doppelgaengerSeen: boolean;
  /** Current acolyte count — selects the Altar backdrop (0–4). */
  acolytes: number;
  /** Fausto's curse is in force (`flagFaustoCurse`) — drives the "Vertigo" degrade layer. */
  curseActive: boolean;
  /** Desidia is active (`desidiaActive`) — drives the fast-forward VHS ("ffw") degrade layer. */
  desidiaActive: boolean;
  /** The viewer prefers reduced motion — the curse and fast-forward layers drop their sub-effects. */
  reducedMotion: boolean;
  /** A call is ringing on the Studio desk — swap in the "incoming call" plate (the lit phone). */
  ringing: boolean;
  /** The altar sigil raised over the Altar Room (App runs its state machine); null when it is down. */
  altarSigil: AltarSigilView | null;
  /** The sigil was pressed (arm, then descend). */
  onSigilPress: () => void;
  /** STATUS QUO, beneath the sigil, was clicked. */
  onStatusQuo: () => void;
  onAction: (action: HotspotAction) => void;
}

function doorGlyph(id: string): string {
  if (id === 'door-left') return '←';
  if (id === 'door-right') return '→';
  return '❖';
}

// One room. The backdrop, its baked props AND any bound invocation figures are composited onto a
// single <canvas> through the uniform degradation pass (DegradedScene), so the whole frame — figures
// included — reads at one fidelity. The chrome — hotspots (and the HUD/panels above) — layers over
// that and stays clickable. The altar sigil is chrome too: the seal and its STATUS QUO label ride
// over the canvas as DOM, outside the pass, so they stay crisp.
export function RoomView({
  room,
  signature,
  summoned,
  doppelgaengerSeen,
  acolytes,
  curseActive,
  desidiaActive,
  reducedMotion,
  ringing,
  altarSigil,
  onSigilPress,
  onStatusQuo,
  onAction,
}: RoomViewProps): ReactElement {
  // The bound invocations that have a designed display in this room (Morpheus over the altar, …).
  // Memoised with the settings below: the scene re-composes only when they really change, not on
  // every re-render of the room.
  const boundVisuals = useMemo(
    () => boundVisualsFor(room.id, summoned, doppelgaengerSeen),
    [room.id, summoned, doppelgaengerSeen],
  );
  // The Altar's backdrop tracks the acolyte count (0–4); the Studio swaps to the "incoming call"
  // plate while the phone is ringing; every other room uses its default plate.
  const backdrop =
    room.id === 'altar'
      ? altarPlateForAcolytes(acolytes)
      : room.id === 'studio' && ringing
        ? CALL_PLATE_RING
        : ROOM_PLATES[room.id];
  // Presentation only — read straight off the flags; the pass eases each 0/1 target in/out.
  const degradeSettings = useMemo<Partial<DegradeSettings>>(
    () => ({
      curseVertigo: curseActive ? 1 : 0,
      ffw: desidiaActive ? 1 : 0,
      reducedMotion,
    }),
    [curseActive, desidiaActive, reducedMotion],
  );

  // The sigil's art is decoded while the player stands in the Altar Room, so it shows on the very
  // first click rather than a beat later.
  useEffect(() => {
    if (room.id === 'altar') preloadImage(ALTAR_SIGIL_SRC);
  }, [room.id]);

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
      {room.id === 'altar' && altarSigil && (
        <AltarSigil
          armed={altarSigil.armed}
          fading={altarSigil.fading}
          onPress={onSigilPress}
          onStatusQuo={onStatusQuo}
        />
      )}
    </div>
  );
}
