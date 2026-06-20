import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import {
  SINS,
  sinLevel,
  eternalSinRevealed,
  gameRuntimeMs,
  MAX_SIN_LEVEL,
  add,
  isZero,
  type GameState,
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';
import { Katabasis } from '../menus/Katabasis.js';

function RecapLine({
  label,
  value,
  ember = false,
}: {
  label: string;
  value: string;
  ember?: boolean;
}): ReactElement {
  return (
    <div className="recap-line">
      <span className="k">{label}</span>
      <span className={`v${ember ? ' ember' : ''}`}>{value}</span>
    </div>
  );
}

/** Sum the eight Cardinal Devotion totals + the Eternal offering — what is now locked forever. */
function totalDevotion(state: GameState): string {
  let total = state.eternalDevotion;
  for (const s of SINS) total = add(total, state.devotion[s]);
  return formatBigNum(total);
}

/** Count seals still holding souls after the descent (bindings persist across Katabasis). */
function sealsBound(state: GameState): number {
  let n = 0;
  for (const v of Object.values(state.sigilBindings)) if (v !== undefined && !isZero(v)) n++;
  return n;
}

/** Ranks held across the eight, out of 32 (8 × MAX_SIN_LEVEL). */
function ranksHeld(state: GameState): number {
  let n = 0;
  for (const s of SINS) n += sinLevel(state.devotion[s]);
  return n;
}

/**
 * The "You Rise" recap (01) — the count of what the descent carried up. Devotion / ranks / bindings
 * persist across Katabasis, so they read straight off the committed state; the souls carried come
 * from the commit's recap roll.
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
        <div className="recap-kicker">Some acolytes kept faith, and counted what they could</div>
        <h1 className="recap-title">You Rise</h1>
        <div className="recap-list">
          <RecapLine label="Souls carried up" value={formatBigNum(recap.soulsCarried)} ember />
          <RecapLine label="Devotion locked forever" value={totalDevotion(state)} />
          <RecapLine
            label="Ranks held across the eight"
            value={`${ranksHeld(state)} / ${SINS.length * MAX_SIN_LEVEL}`}
          />
          <RecapLine label="Seals still bound" value={String(sealsBound(state))} />
          {named && <RecapLine label="The Ninth" value="Named" ember />}
        </div>
        <button type="button" className="recap-btn" onClick={() => close()}>
          Rise to the world
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
