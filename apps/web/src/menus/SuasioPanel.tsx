import { type ReactElement } from 'react';

interface SuasioLogLine {
  tier: string;
  text: string;
}

interface SuasioPanelProps {
  /** Recent resolved Suggestion outcomes, newest first (from the store log). */
  log: SuasioLogLine[];
  /** Display cost label, e.g. "5 Influence · 10s" (already efficiency-scaled). */
  cost: string;
  /** True while a rite is underway or the player can't afford it. */
  disabled: boolean;
  /** Fire the real Suasio (Suggestion) action. */
  onTempt: () => void;
}

// The Suasio scroll — fire a temptation, watch the log. Rendered inside <PanelShell variant="scroll"/>.
// Driven by the real Suasio action; the log reflects resolved Suggestion outcomes from the sim.
export function SuasioPanel({ log, cost, disabled, onTempt }: SuasioPanelProps): ReactElement {
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
      <ul className="pc-log" style={{ marginTop: '1rem' }}>
        {log.length === 0 ? (
          <li className="pc-log-line">No whispers yet.</li>
        ) : (
          log.map((e, i) => (
            <li key={i} className={'pc-log-line tier-' + e.tier}>
              {e.text}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
