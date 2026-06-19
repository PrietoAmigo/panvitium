import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useGameLoop } from './game/useGameLoop.js';
import { ROOMS } from './menus/menus.data.js';
import { RoomView } from './menus/RoomView.js';
import { ArsGoetiaBook } from './menus/ArsGoetiaBook.js';
import type { RoomId, PanelId, HotspotAction } from './menus/types.js';
import { buildGoetia } from './game/invocations.js';
import { PANELS, PcDesk, SuasioScroll } from './ui/panels.js';
import { PanelShell, type PanelVariant } from './menus/PanelShell.js';
import { SignaturePopup } from './ui/SignaturePopup.js';
import { AchievementToast } from './ui/AchievementToast.js';
import { KatabasisModal } from './ui/KatabasisModal.js';
import { SyncPanel } from './ui/SyncPanel.js';
import { ConflictModal } from './ui/ConflictModal.js';
import { WelcomeBackModal } from './ui/WelcomeBackModal.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { TitleSequence } from './ui/TitleSequence.js';
import { InfluenceGoldHud } from './ui/InfluenceGoldHud.js';
import { useGameStore } from './store/gameStore.js';
import { audio } from './audio/audio.js';

/**
 * The themed shell each framed panel wears. The Maleficia shelf wears the dark "niche" frame (the
 * carved-alcove rework paints its own background, so it gets a near-frameless dark shell with a
 * float close rather than the old wooden case). Ars Goetia, the PC, the Suasio scroll and Katabasis
 * are their own full-surface overlays and don't appear here.
 */
const PANEL_SHELL: Partial<Record<PanelId, { variant: PanelVariant; hideHeader?: boolean }>> = {
  maleficia: { variant: 'niche', hideHeader: true },
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
  const openKatabasis = useGameStore((s) => s.openKatabasis);

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

  // The Altar backdrop varies with the acolyte count (0–4). A stable primitive selector, so this
  // only re-renders the room when an acolyte is gained/lost, not every tick.
  const acolytes = useGameStore((s) => s.state?.lifetime.acolytes.length ?? 0);

  // The descent takes the full screen; close any grimoire panel when it opens.
  useEffect(() => {
    if (katabasisPhase !== null) setPanel(null);
  }, [katabasisPhase]);

  const handleAction = (action: HotspotAction): void => {
    if (action.type === 'door') {
      setRoom(action.to);
      audio.play('room-change');
    } else if (action.type === 'altar') {
      // The Altar opens the full-screen gate straight away (no ledger step); the gate is where the
      // player commits to the descent or turns back. Nothing is torn down until they commit there.
      openKatabasis();
      audio.play('panel-open');
    } else {
      setPanel(action.panel);
      audio.play('panel-open');
    }
  };

  const closePanel = (): void => {
    setPanel(null);
    audio.play('panel-close');
  };

  // Ars Goetia, the PC and the Suasio scroll are their own full-surface overlays (designed
  // grimoire / desk / parchment), not framed Panels.
  const activePanel =
    panel && panel !== 'ars-goetia' && panel !== 'pc' && panel !== 'suasio' ? PANELS[panel] : null;
  const shell = panel ? PANEL_SHELL[panel] : undefined;

  return (
    <div className="app">
      <main className="stage">
        <RoomView
          room={ROOMS[room]}
          signature={signature}
          summoned={summoned}
          acolytes={acolytes}
          onAction={handleAction}
        />
        <div className="room-name">{ROOMS[room].title}</div>
      </main>
      {/* Always-on Influence/Gold HUD — every room and menu except the Altar and the Katabasis
          descent. It rides its own layer (above the full-screen menu overlays, below the title /
          settings modals) rather than inside the stage, so it stays visible over the Suasio scroll,
          Ars Goetia and PC. The inner box mirrors the stage geometry to pin it to the scene corner. */}
      {room !== 'altar' && katabasisPhase === null && (
        <div className="hud-layer">
          <div className="hud-layer__stage">
            <InfluenceGoldHud />
          </div>
        </div>
      )}
      <SignaturePopup />
      <AchievementToast />
      <KatabasisModal />
      <SyncPanel />
      <ConflictModal />
      <WelcomeBackModal />
      <SettingsPanel />
      <TitleSequence />
      {panel === 'ars-goetia' && <GoetiaBook onClose={closePanel} />}
      {panel === 'pc' && <PcDesk onClose={closePanel} />}
      {panel === 'suasio' && <SuasioScroll onClose={closePanel} />}
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
