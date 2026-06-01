import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';

/**
 * The game wordmark, anchored to the bottom-left of the lair. The former HUD readouts (reprobate
 * count, in-flight rite, vigil, efficiency) were moved off the always-on screen — the rite, vigil
 * and efficiency now live in the PC's Analytics → Main tab; the reprobate count in Analytics →
 * Reprobates.
 */
export function Hud(): ReactElement {
  return <div className="game-name">{strings.appName}</div>;
}
