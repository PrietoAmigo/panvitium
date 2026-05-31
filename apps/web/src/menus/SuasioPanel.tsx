import { type ReactElement } from 'react';

interface SuasioPanelProps {
  /** Display cost label, e.g. "5 Influence · 10s" (already efficiency-scaled). */
  cost: string;
  /** True while a rite is underway or the player can't afford it. */
  disabled: boolean;
  /** Fire the real Suasio (Suggestion) action. */
  onTempt: () => void;
}

// The Suasio scroll — fire a temptation. Rendered inside <PanelShell variant="scroll"/>.
// Driven by the real Suasio action; resolved outcomes surface in the PC's Logs program, not here.
export function SuasioPanel({ cost, disabled, onTempt }: SuasioPanelProps): ReactElement {
  return (
    <div>
      <p className="opera-intro">The temptations, written to be spoken. Whisper one and wait.</p>
      <div className="opera-action">
        <div className="opera-meta">
          <span className="opera-name">Suggestion</span>
          <span className="opera-cost">{cost}</span>
        </div>
        <button type="button" className="opera-btn" disabled={disabled} onClick={onTempt}>
          Tempt
        </button>
      </div>
    </div>
  );
}
