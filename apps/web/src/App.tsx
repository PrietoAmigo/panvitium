import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useGameLoop } from './game/useGameLoop.js';
import { ROOMS } from './menus/menus.data.js';
import { RoomView } from './menus/RoomView.js';
import { ArsGoetiaBook } from './menus/ArsGoetiaBook.js';
import type { RoomId, PanelId, HotspotAction } from './menus/types.js';
import { buildGoetia } from './game/invocations.js';
import { Hud } from './ui/Hud.js';
import { PANELS, PcDesk } from './ui/panels.js';
import { PanelShell, type PanelVariant } from './menus/PanelShell.js';
import { SignaturePopup } from './ui/SignaturePopup.js';
import { AchievementToast } from './ui/AchievementToast.js';
import { KatabasisModal } from './ui/KatabasisModal.js';
import { SyncPanel } from './ui/SyncPanel.js';
import { ConflictModal } from './ui/ConflictModal.js';
import { WelcomeBackModal } from './ui/WelcomeBackModal.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { useGameStore } from './store/gameStore.js';
import { audio } from './audio/audio.js';

/**
 * The themed shell each framed panel wears: the Altar's engraved stone, the Maleficia cabinet's
 * wood, the Suasio scroll's parchment (Ars Goetia, the PC and Katabasis are their own full-screen
 * overlays and don't appear here). The stone and cabinet hide the header in favour of a float close.
 */
const PANEL_SHELL: Partial<Record<PanelId, { variant: PanelVariant; hideHeader?: boolean }>> = {
  'altar-menu': { variant: 'stone', hideHeader: true },
  maleficia: { variant: 'cabinet', hideHeader: true },
  suasio: { variant: 'scroll' },
};

/**
 * The full-screen Ars Goetia grimoire, wired to real state. Kept as its own subscriber so its
 * per-tick re-render (soul cost tracks the pool) stays local and doesn't re-render the room shell.
 */
function GoetiaBook({ onClose }: { onClose: () => void }): ReactElement {
  const state = useGameStore((s) => s.state);
  const summon = useGameStore((s) => s.summon);
  const banish = useGameStore((s) => s.banish);
  const view = state ? buildGoetia(state) : { invokingPower: '0', entries: [] };
  return (
    <ArsGoetiaBook
      entries={view.entries}
      invokingPower={view.invokingPower}
      onSummon={summon}
      onDispel={banish}
      onClose={onClose}
    />
  );
}

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

  // Ars Goetia is its own full-screen overlay (the designed grimoire), not a framed Panel.
  const activePanel = panel && panel !== 'ars-goetia' && panel !== 'pc' ? PANELS[panel] : null;
  const shell = panel ? PANEL_SHELL[panel] : undefined;

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
      <WelcomeBackModal />
      <SettingsPanel />
      {panel === 'ars-goetia' && <GoetiaBook onClose={closePanel} />}
      {panel === 'pc' && <PcDesk onClose={closePanel} />}
      {activePanel && shell && (
        <PanelShell
          title={activePanel.title}
          variant={shell.variant}
          onClose={closePanel}
          {...(shell.hideHeader ? { hideHeader: true } : {})}
        >
          {activePanel.body}
        </PanelShell>
      )}
    </div>
  );
}
