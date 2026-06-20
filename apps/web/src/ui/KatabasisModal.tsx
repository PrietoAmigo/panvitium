import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { eternalSinRevealed, gameRuntimeMs, type GameState } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';
import { Katabasis } from '../menus/Katabasis.js';

function RecapLine({
  label,
  value,
  ember = false,
  white = false,
}: {
  label: string;
  value: string;
  ember?: boolean;
  white?: boolean;
}): ReactElement {
  return (
    <div className="recap-line">
      <span className="k">{label}</span>
      <span className={`v${ember ? ' ember' : ''}${white ? ' white' : ''}`}>{value}</span>
    </div>
  );
}

/**
 * The "You Rise" recap (01) — what survived the descent. The reprobates / maleficia / gold counts
 * read straight off the commit's recap roll (what the new lifetime begins with after this Katabasis).
 */
function KatabasisRecapView(): ReactElement {
  const recap = useGameStore((s) => s.recap);
  const state = useGameStore((s) => s.state);
  const close = useGameStore((s) => s.closeRecap);
  if (!recap || !state) return <div className="katabasis-flow" />;
  const named = eternalSinRevealed(state);

  return (
    <div className="katabasis-flow">
      <div className="scene recap" role="dialog" aria-label={strings.katabasis.recapTitle}>
        <h1 className="recap-title">You Rise</h1>
        <p className="recap-lore">
          The body is wasted; the remains are cold meat and a smear of ash, fit only for the pit.
        </p>
        <div className="recap-list">
          <RecapLine label="Reprobates still here" value={String(recap.reprobatesKept)} white />
          <RecapLine label="Unlooted maleficia" value={String(recap.maleficiaKept.length)} />
          <RecapLine label="Remaining gold" value={formatBigNum(recap.goldKept)} />
          {named && <RecapLine label="The Ninth" value="Named" ember />}
        </div>
        <button type="button" className="recap-btn" onClick={() => close()}>
          Acknowledge
        </button>
      </div>
    </div>
  );
}

/**
 * The Eternal-Sin reveal (03 §8, 01) — the name beneath the ink resolves to Semet, with the closing
 * Latin verse. Rendered as an overlay ON TOP of the live flow so the player's place in the descent
 * (the end-state Princes / the open Eternal takeover) is preserved when they close the book.
 */
function EternalRevealOverlay({ state }: { state: GameState }): ReactElement {
  const dismiss = useGameStore((s) => s.dismissEternalReveal);
  return (
    <div className="katabasis-flow katabasis-flow--overlay">
      <div className="reveal" role="dialog" aria-label={strings.eternal.name}>
        <h1 className="reveal-name">{strings.eternal.name}</h1>
        <p className="reveal-verse">{strings.eternal.verse}</p>
        <div className="reveal-time">
          <span className="reveal-time-label">{strings.eternal.runtimeLabel}</span>
          <span className="reveal-time-value">{formatDuration(gameRuntimeMs(state))}</span>
        </div>
        <button type="button" className="reveal-dismiss" onClick={() => dismiss()}>
          {strings.eternal.dismiss}
        </button>
      </div>
    </div>
  );
}

/**
 * Phase orchestrator for the full-screen Katabasis flow + the Eternal-Sin reveal. The `menu` phase
 * renders the cinematic descent (`menus/Katabasis`); the `recap` phase renders "You Rise"; the
 * reveal layers above whichever is showing (so the descent stays mounted underneath).
 */
export function KatabasisModal(): ReactElement | null {
  const phase = useGameStore((s) => s.katabasisPhase);
  const eternalReveal = useGameStore((s) => s.eternalReveal);
  const state = useGameStore((s) => s.state);
  if (phase === null && !eternalReveal) return null;
  return (
    <>
      {phase === 'menu' && <Katabasis />}
      {phase === 'recap' && <KatabasisRecapView />}
      {eternalReveal && state && <EternalRevealOverlay state={state} />}
    </>
  );
}
