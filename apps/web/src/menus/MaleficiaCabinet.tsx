import { useState, type ReactElement } from 'react';
import { MALEFICIA } from './menus.data.js';

// The Maleficia shelf as a dim wooden display cabinet of glass specimen boxes.
// Click a box → close-up with rarity, name, flavour and effect. Rendered inside
// <PanelShell variant="cabinet" hideHeader/>.
// TODO(wire): feed `items` from the player's owned maleficia (packages/sim catalog
// + owned set) instead of the static MALEFICIA list.
export function MaleficiaCabinet(): ReactElement {
  const [sel, setSel] = useState<number | null>(null);

  if (sel !== null) {
    const m = MALEFICIA[sel];
    if (m) {
      return (
        <div className="mal-detail">
          <button type="button" className="mal-back" onClick={() => setSel(null)}>
            ‹ Back to the cabinet
          </button>
          <div className="mal-case mal-case--big">
            <img className="mal-detail-img" src={m.img} alt={m.name} />
          </div>
          <div className="mal-detail-meta">
            <span className={'rarity-badge rarity-' + m.rarity}>{m.rarity}</span>
            <h3 className="mal-detail-name">{m.name}</h3>
            <p className="mal-detail-desc">{m.desc}</p>
            <p className="mal-detail-effect">{m.effect}</p>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="mal-cabinet">
      {MALEFICIA.map((m, i) => (
        <button
          key={m.id}
          type="button"
          className="mal-case"
          onClick={() => setSel(i)}
          aria-label={m.name}
          title={m.name}
        >
          <img className="mal-case-img" src={m.img} alt={m.name} />
        </button>
      ))}
    </div>
  );
}
