import { useState, type ReactElement } from 'react';
import { SINS, pips } from './menus.data.js';

interface AltarPanelProps {
  /** Called when the player commits to the descent — open <Katabasis/> in response. */
  onDescend: () => void;
}

// The Altar devotion ledger. Rendered inside <PanelShell variant="stone" hideHeader/>.
// TODO(wire): replace SINS/pips with your real per-Prince devotion + level selectors,
// and surface actually-bound sigils where "No sigils bound" is shown.
export function AltarPanel({ onDescend }: AltarPanelProps): ReactElement {
  const [armed, setArmed] = useState(false);
  return (
    <div>
      <p className="altar-intro">
        The Devotion owed each Prince, and the rank it buys you. Bound sigils show here once they
        bite.
      </p>
      <ul className="devotion-list">
        {SINS.map((s) => (
          <li className="devotion-row" key={s.latin}>
            <span className="devotion-name">
              {s.prince} · {s.latin}
            </span>
            <span className="devotion-pips">{pips(s.level)}</span>
            <span className="devotion-total">{s.devotion}</span>
          </li>
        ))}
      </ul>
      <p className="altar-sigils">No sigils bound.</p>
      {armed && (
        <p className="descend-warning">
          Once you descend there is no climbing back — tap again to commit
        </p>
      )}
      <button
        type="button"
        className={'opera-btn descend-btn' + (armed ? ' descend-btn--armed' : '')}
        onClick={() => {
          if (armed) {
            setArmed(false);
            onDescend();
          } else {
            setArmed(true);
          }
        }}
      >
        {armed ? 'Descend \u2014 no return' : 'Lay upon the altar \u2014 descend'}
      </button>
    </div>
  );
}
