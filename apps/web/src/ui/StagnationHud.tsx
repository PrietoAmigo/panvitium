import { type ReactElement } from 'react';
import { stagnationMax } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';
import './stagnation-hud.css';

/**
 * PLACEHOLDER Stagnation HUD (ADR-033). Top-right resource cluster mirroring the Influence vessel's
 * role: a fill level + numeric readout for Stagnation, with the Desidia toggle button beneath it.
 * Deliberately plain (a simple bar, not the carved vessel canvas) — the final art/treatment is a
 * later pass; this wires the live sim (stagnation value, derived cap, the Desidia toggle) so the
 * system is playable now.
 *
 * Mounting/visibility is owned by `App` (shown alongside the Influence & Gold HUD, hidden during
 * Katabasis / over the PC / the Altar gate).
 */
export function StagnationHud(): ReactElement | null {
  const state = useGameStore((s) => s.state);
  const toggleDesidia = useGameStore((s) => s.toggleDesidia);
  if (!state) return null;

  const max = stagnationMax(state);
  const value = state.stagnation;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const active = state.desidiaActive === true;
  // Nothing to spend and not already running → the toggle is inert; disable it for clarity.
  const disabled = value <= 0 && !active;
  const s = strings.stagnation;

  return (
    <div className="stag-hud" role="group" aria-label={s.label}>
      <div className="stag-hud-block">
        <span className="stag-hud-label">{s.label}</span>
        <div className="stag-hud-meter" role="img" aria-label={`${value.toFixed(1)} of ${max}`}>
          <div className="stag-hud-fill" style={{ width: `${(frac * 100).toFixed(1)}%` }} />
        </div>
        <span className="stag-hud-value">
          {value.toFixed(1)} / {max}
        </span>
      </div>
      <button
        type="button"
        className={'stag-hud-desidia' + (active ? ' is-active' : '')}
        aria-pressed={active}
        disabled={disabled}
        title={s.desidiaHint}
        onClick={toggleDesidia}
      >
        {active ? s.desidiaActive : s.desidia}
      </button>
    </div>
  );
}
