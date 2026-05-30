import { useState, useEffect, type ReactElement } from 'react';
import './menus/menus.css';
import {
  ROOMS, type RoomId, type PanelId, type HotspotAction,
  RoomView, PanelShell, AltarPanel, MaleficiaCabinet, SuasioPanel,
  PcWindow, ArsGoetiaBook, Katabasis,
} from './menus';

// EXAMPLE orchestration — the glue from the prototype's app.jsx, minus the
// Tweaks panel and the mock HUD. Drop this logic into your real room screen /
// router. The pieces that touch game state are marked TODO(wire).
//
// Mount once, full-bleed. The room <main className="stage"> is the 16:9 canvas
// the hotspot percentages are relative to.
export function Playspace(): ReactElement {
  const [room, setRoom] = useState<RoomId>('altar');
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [katabasis, setKatabasis] = useState(false);

  // TODO(wire): summoned should come from your invocation/store, not local state.
  const [summoned, setSummoned] = useState<string[]>([]);
  const summon = (id: string) => setSummoned([id]);            // one at a time
  const dispel = (id: string) => setSummoned((s) => s.filter((x) => x !== id));

  // Invocations are banished the moment you leave the Invocation Room.
  useEffect(() => {
    if (room !== 'invocation' && summoned.length > 0) setSummoned([]);
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = (action: HotspotAction) => {
    if (action.type === 'door') { setRoom(action.to); setPanel(null); }
    else setPanel(action.panel);
  };

  // Lay-upon-the-altar → descend. Add your transition flash if you want the beat.
  const onDescend = () => { setPanel(null); setKatabasis(true); };

  // signature = Studio "panvitium" red glow; wire to "a ritual is running".
  const signature = false;

  return (
    <div className="app">
      {/* Your real <Hud/> goes here. */}
      <main className="stage">
        <RoomView room={ROOMS[room]} signature={signature} summoned={summoned} onAction={handleAction} />
        <div className="room-name">{ROOMS[room].title}</div>
      </main>

      {panel === 'altar-menu' && (
        <PanelShell title="The Altar" variant="stone" hideHeader onClose={() => setPanel(null)}>
          <AltarPanel onDescend={onDescend} />
        </PanelShell>
      )}
      {panel === 'maleficia' && (
        <PanelShell title="The Maleficia Shelf" variant="cabinet" hideHeader onClose={() => setPanel(null)}>
          <MaleficiaCabinet />
        </PanelShell>
      )}
      {panel === 'suasio' && (
        <PanelShell title="The Suasio Scroll" variant="scroll" onClose={() => setPanel(null)}>
          <SuasioPanel />
        </PanelShell>
      )}

      {panel === 'pc' && <PcWindow onClose={() => setPanel(null)} />}
      {panel === 'ars-goetia' && (
        <ArsGoetiaBook summoned={summoned} onSummon={summon} onDispel={dispel} onClose={() => setPanel(null)} />
      )}
      {katabasis && <Katabasis onClose={() => setKatabasis(false)} />}
    </div>
  );
}
