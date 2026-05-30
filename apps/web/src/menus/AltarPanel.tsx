import { useState, type ReactElement } from 'react';
import { pips } from './menus.data.js';
import type { Sin } from './types.js';

interface BoundSigil {
  id: number;
  name: string;
  bound: string;
}

interface AltarPanelProps {
  /** Per-Prince devotion ledger (real, from `buildAltar`). */
  sins: Sin[];
  /** Sigils with souls bound to them, named from the catalog. */
  boundSigils: BoundSigil[];
  /** Called when the player commits to the descent — open <Katabasis/> in response. */
  onDescend: () => void;
}

// The Altar devotion ledger. Rendered inside <PanelShell variant="stone" hideHeader/>. Driven by
// real state via the `buildAltar` adapter; the descend button arms on first tap, descends on second.
export function AltarPanel({ sins, boundSigils, onDescend }: AltarPanelProps): ReactElement {
  const [armed, setArmed] = useState(false);
  return (
    <div>
      <p className="altar-intro">
        The Devotion owed each Prince, and the rank it buys you. Bound sigils show here once they
        bite.
      </p>
      <ul className="devotion-list">
        {sins.map((s) => (
          <li className="devotion-row" key={s.latin}>
            <span className="devotion-name">
              {s.prince} · {s.latin}
            </span>
            <span className="devotion-pips">{pips(s.level)}</span>
            <span className="devotion-total">{s.devotion}</span>
          </li>
        ))}
      </ul>
      <p className="altar-sigils">
        {boundSigils.length === 0
          ? 'No sigils bound.'
          : boundSigils.map((g) => `${g.name} (${g.bound})`).join(' · ')}
      </p>
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
