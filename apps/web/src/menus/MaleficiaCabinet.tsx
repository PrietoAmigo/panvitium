import { useState, type ReactElement } from 'react';
import type { Maleficium } from './types.js';

interface MaleficiaCabinetProps {
  /** The player's owned maleficia (from `buildCabinet`); assumed non-empty. */
  items: Maleficium[];
}

// The Maleficia shelf as a dim wooden display cabinet of glass specimen boxes. Click a box → close-up
// with rarity, name, flavour and effect. Rendered inside <PanelShell variant="cabinet" hideHeader/>.
// Driven by the player's owned set via the `buildCabinet` adapter; items without bespoke art fall
// back to a text label in the box.
export function MaleficiaCabinet({ items }: MaleficiaCabinetProps): ReactElement {
  const [sel, setSel] = useState<number | null>(null);

  if (sel !== null) {
    const m = items[sel];
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
          </div>
        </div>
      );
    }
  }

  return (
    <div className="mal-cabinet">
      {items.map((m, i) => (
        <button
          key={m.id}
          type="button"
          className="mal-case"
          onClick={() => setSel(i)}
          aria-label={m.name}
          title={m.name}
        >
          {m.img ? (
            <img className="mal-case-img" src={m.img} alt={m.name} />
          ) : (
            <span className="mal-case-img mal-case-text">{m.name}</span>
          )}
        </button>
      ))}
    </div>
  );
}
