import { useState, type ReactElement } from 'react';
import type { Maleficium } from './types.js';

interface MaleficiaCabinetProps {
  /** The player's owned maleficia (from `buildCabinet`); assumed non-empty. */
  items: Maleficium[];
  /** Activate a single-use consumable by id (Hand of Glory, Defixio). */
  onUse?: (id: string) => void;
}

// The Maleficia shelf as a dim wooden display cabinet of glass specimen boxes. Click a box → close-up
// with rarity, name, flavour and effect (and, for the two single-use consumables, a "Use" control +
// status line). Rendered inside <PanelShell variant="cabinet" hideHeader/>. Driven by the player's
// owned set via the `buildCabinet` adapter; items without bespoke art fall back to a text label.
// Selection is tracked by id (not index) so consuming the last copy of the open item can't leave the
// detail view pointing at a different specimen.
export function MaleficiaCabinet({ items, onUse }: MaleficiaCabinetProps): ReactElement {
  const [sel, setSel] = useState<string | null>(null);

  const m = sel !== null ? items.find((x) => x.id === sel) : undefined;
  if (m) {
    return (
      <div className="mal-detail">
        <button type="button" className="mal-back" onClick={() => setSel(null)}>
          ‹ Back to the cabinet
        </button>
        <div className="mal-case mal-case--big">
          {m.img ? (
            <img className="mal-detail-img" src={m.img} alt={m.name} />
          ) : (
            <span className="mal-detail-img mal-case-text">{m.name}</span>
          )}
        </div>
        <div className="mal-detail-meta">
          <span className={'rarity-badge rarity-' + m.rarity}>{m.rarity}</span>
          <h3 className="mal-detail-name">{m.name}</h3>
          <p className="mal-detail-desc">{m.desc}</p>
          {m.effect && <p className="mal-detail-effect">{m.effect}</p>}
          {m.use && (
            <div className="mal-use">
              {m.use.status && <p className="mal-use-status">{m.use.status}</p>}
              <button
                type="button"
                className="opera-btn"
                disabled={!m.use.enabled}
                onClick={() => onUse?.(m.id)}
              >
                {m.use.label}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mal-cabinet">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="mal-case"
          onClick={() => setSel(it.id)}
          aria-label={it.name}
          title={it.name}
        >
          {it.img ? (
            <img className="mal-case-img" src={it.img} alt={it.name} />
          ) : (
            <span className="mal-case-img mal-case-text">{it.name}</span>
          )}
        </button>
      ))}
    </div>
  );
}
