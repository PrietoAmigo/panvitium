import { useState, type ReactElement } from 'react';
import type { LogLine } from './types.js';

const SEED: LogLine[] = [
  { tier: 'excellent', text: 'Suggestion \u00B7 Excellent \u2014 +3 Reprobates' },
  { tier: 'good', text: 'Suggestion \u00B7 Good \u2014 +1 Reprobates' },
  { tier: 'stellar', text: 'Suggestion \u00B7 Stellar \u2014 +6 Reprobates, +2 Influence' },
];

// The Suasio scroll — fire a temptation, watch the log. Rendered inside
// <PanelShell variant="scroll"/>.
// TODO(wire): replace the local roll with your real Suasio action; append the
// resolved outcome from the sim to the log instead of a random stand-in.
export function SuasioPanel(): ReactElement {
  const [log, setLog] = useState<LogLine[]>(SEED);
  const tempt = () => {
    const rolls: LogLine[] = [
      { tier: 'good', text: 'Suggestion \u00B7 Good \u2014 +1 Reprobates' },
      { tier: 'excellent', text: 'Suggestion \u00B7 Excellent \u2014 +3 Reprobates' },
      { tier: 'stellar', text: 'Suggestion \u00B7 Stellar \u2014 +6 Reprobates, +2 Influence' },
    ];
    const pick = rolls[Math.floor(Math.random() * rolls.length)];
    if (pick) setLog([pick, ...log].slice(0, 8));
  };
  return (
    <div>
      <p className="opera-intro">The temptations, written to be spoken. Whisper one and wait.</p>
      <div className="opera-action">
        <div className="opera-meta">
          <span className="opera-name">Suggestion</span>
          <span className="opera-cost">5 Influence \u00B7 10s</span>
        </div>
        <button type="button" className="opera-btn" onClick={tempt}>
          Tempt
        </button>
      </div>
      <ul className="pc-log" style={{ marginTop: '1rem' }}>
        {log.map((e, i) => (
          <li key={i} className={'pc-log-line tier-' + e.tier}>
            {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
