import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useGameLoop } from './game/useGameLoop.js';
import { ROOMS } from './menus/menus.data.js';
import { RoomView } from './menus/RoomView.js';
import type { RoomId, PanelId, HotspotAction } from './menus/types.js';
import { Hud } from './ui/Hud.js';
import { Panel, PANELS } from './ui/panels.js';
import { SignaturePopup } from './ui/SignaturePopup.js';
import { AchievementToast } from './ui/AchievementToast.js';
import { KatabasisModal } from './ui/KatabasisModal.js';
import { SyncPanel } from './ui/SyncPanel.js';
import { ConflictModal } from './ui/ConflictModal.js';
import { useGameStore } from './store/gameStore.js';
import { audio } from './audio/audio.js';

export function App(): ReactElement {
  useGameLoop();

  const [room, setRoom] = useState<RoomId>('altar');
  const [panel, setPanel] = useState<PanelId | null>(null);
  const katabasisPhase = useGameStore((s) => s.katabasisPhase);

  // The Studio's red "panvitium" glow while that ritual runs (03 §2.3).
  const signature = useGameStore(
    (s) => s.state?.lifetime.activeToggles.includes('panvitium') ?? false,
  );
  // The bound invocations standing in the Invocation circle. Select a stable primitive key (the
  // sorted set of active ids) so the room only re-renders when the summoned set actually changes,
  // not every 10 Hz tick; SummonedCreatures skips any id without art.
  const summonedKey = useGameStore((s) => {
    const inv = s.state?.lifetime.invocations;
    if (!inv) return '';
    return Object.keys(inv)
      .filter((id) => (inv[id] ?? 0) > 0)
      .sort()
      .join(',');
  });
  const summoned = useMemo(() => (summonedKey ? summonedKey.split(',') : []), [summonedKey]);

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
        <RoomView
          room={ROOMS[room]}
          signature={signature}
          summoned={summoned}
          onAction={handleAction}
        />
        <div className="room-name">{ROOMS[room].title}</div>
      </main>
      <SignaturePopup />
      <AchievementToast />
      <KatabasisModal />
      <SyncPanel />
      <ConflictModal />
      {activePanel && (
        <Panel title={activePanel.title} onClose={closePanel}>
          {activePanel.body}
        </Panel>
      )}
    </div>
  );
}
