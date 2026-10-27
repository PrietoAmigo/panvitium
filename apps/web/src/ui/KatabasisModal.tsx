import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum } from '../game/format.js';
import { Katabasis } from '../menus/Katabasis.js';

function RecapLine({
  label,
  value,
  white = false,
}: {
  label: string;
  value: string;
  white?: boolean;
}): ReactElement {
  return (
    <div className="recap-line">
      <span className="k">{label}</span>
      <span className={`v${white ? ' white' : ''}`}>{value}</span>
    </div>
  );
}

/**
 * The "You Rise" recap (01) — what survived the descent. The reprobates / maleficia / gold counts
 * read straight off the commit's recap roll (what the new lifetime begins with after this Katabasis).
 */
function KatabasisRecapView(): ReactElement {
  const recap = useGameStore((s) => s.recap);
  const close = useGameStore((s) => s.closeRecap);
  if (!recap) return <div className="katabasis-flow" />;

  return (
    <div className="katabasis-flow">
      <div className="scene recap" role="dialog" aria-label={strings.katabasis.recapTitle}>
        <h1 className="recap-title">You Rise</h1>
        <p className="recap-lore">The body is wasted; The world has moved; The intent remains.</p>
        <div className="recap-list">
          <RecapLine label="Reprobates still here" value={String(recap.reprobatesKept)} white />
          <RecapLine label="Unlooted maleficia" value={String(recap.maleficiaKept.length)} />
          <RecapLine label="Remaining gold" value={formatBigNum(recap.goldKept)} />
        </div>
        <button type="button" className="recap-btn" onClick={() => close()}>
          Acknowledge
        </button>
      </div>
    </div>
  );
}

/**
 * Phase orchestrator for the full-screen Katabasis flow. The `menu` phase renders the cinematic
 * descent (`menus/Katabasis`), where naming Semet raises the Semet screen over the cleared Court
 * (ADR-041); the `recap` phase renders "You Rise", which does not mention the naming.
 */
export function KatabasisModal(): ReactElement | null {
  const phase = useGameStore((s) => s.katabasisPhase);
  if (phase === 'menu') return <Katabasis />;
  if (phase === 'recap') return <KatabasisRecapView />;
  return null;
}
