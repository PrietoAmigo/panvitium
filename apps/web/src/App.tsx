import { useEffect, useState, type ReactElement } from 'react';
import { useGameLoop } from './game/useGameLoop.js';
import { ROOMS, type RoomId, type PanelId, type HotspotAction } from './rooms/rooms.js';
import { RoomView } from './rooms/RoomView.js';
import { Hud } from './ui/Hud.js';
import { Panel, PANELS } from './ui/panels.js';
import { SignaturePopup } from './ui/SignaturePopup.js';
import { KatabasisModal } from './ui/KatabasisModal.js';
import { useGameStore } from './store/gameStore.js';
import { audio } from './audio/audio.js';

export function App(): ReactElement {
  useGameLoop();

  const [room, setRoom] = useState<RoomId>('altar');
  const [panel, setPanel] = useState<PanelId | null>(null);
  const katabasisPhase = useGameStore((s) => s.katabasisPhase);

  // The descent takes the full screen; close any grimoire panel when it opens.
  useEffect(() => {
    if (katabasisPhase !== null) setPanel(null);
  }, [katabasisPhase]);

  const handleAction = (action: HotspotAction): void => {
    if (action.type === 'door') {
      setRoom(action.to);
      audio.play('room-change');
    } else {
      setPanel(action.panel);
      audio.play('panel-open');
    }
  };

  const closePanel = (): void => {
    setPanel(null);
    audio.play('panel-close');
  };

  const activePanel = panel ? PANELS[panel] : null;

  return (
    <div className="app">
      <Hud />
      <main className="stage">
        <RoomView room={ROOMS[room]} onAction={handleAction} />
        <div className="room-name">{ROOMS[room].title}</div>
      </main>
      <SignaturePopup />
      <KatabasisModal />
      {activePanel && (
        <Panel title={activePanel.title} onClose={closePanel}>
          {activePanel.body}
        </Panel>
      )}
    </div>
  );
}
