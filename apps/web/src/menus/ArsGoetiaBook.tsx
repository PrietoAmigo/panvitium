import { useState, type ReactElement } from 'react';
import { INVOCATIONS, INVOCATION_BY_ID } from './menus.data.js';

interface ArsGoetiaBookProps {
  summoned?: string[];
  onSummon?: (id: string) => void;
  onDispel?: (id: string) => void;
  onClose: () => void;
}

// Ars Goetia — a full-screen open grimoire. Left page: title. Right page: the
// index of names. Clicking a name turns to that demon's leaf (illustration +
// cost + effect + lore). No scrolling. Full-screen shell (no PanelShell).
// TODO(wire): drive `unlocked`/gates and the bound count from real state;
// Summon/Dispel call the same actions the Invocation circle uses.
export function ArsGoetiaBook({
  summoned = [],
  onSummon,
  onDispel,
  onClose,
}: ArsGoetiaBookProps): ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);
  const it = openId ? INVOCATION_BY_ID[openId] : null;
  const boundOf = (id: string) => summoned.filter((s) => s === id).length;

  return (
    <div className="goetia-overlay" role="dialog" aria-label="Ars Goetia">
      <button type="button" className="goetia-close" onClick={onClose} aria-label="Close the book">
        {'\u2715'}
      </button>
      <div className="goetia-spread">
        {!it ? (
          <>
            <div className="gb-page gb-page--left">
              <h1 className="gb-title">Ars Goetia</h1>
              <div className="gb-rule" aria-hidden="true" />
              <p className="gb-power">Invoking power &middot; vi</p>
              <p className="gb-intro">
                Names called up from below. Each asks a price in souls and stands within the circle
                until dispelled &mdash; and is banished when you leave the room. Turn to a name to
                read its bargain.
              </p>
              <p className="gb-folio">&mdash; i &mdash;</p>
            </div>
            <div className="gb-page gb-page--right">
              <h2 className="gb-subtitle">The Names</h2>
              <ul className="gb-index">
                {INVOCATIONS.map((iv) => {
                  const b = boundOf(iv.id);
                  return (
                    <li key={iv.id}>
                      <button
                        type="button"
                        className={'gb-entry' + (iv.unlocked ? '' : ' is-locked')}
                        onClick={() => setOpenId(iv.id)}
                      >
                        <span className="gb-rank">{iv.rank}.</span>
                        <span className="gb-name">{iv.name}</span>
                        <span className="gb-dots" aria-hidden="true" />
                        <span className="gb-hint">
                          {iv.unlocked ? (b > 0 ? `${b} bound` : '') : '\u2020'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="gb-folio">&mdash; ii &mdash;</p>
            </div>
          </>
        ) : (
          <>
            <div className="gb-page gb-page--left gb-illus-page">
              <img className="gb-illus-img" src={it.img} alt={it.name} />
              <p className="gb-illus-cap">{it.name}</p>
            </div>
            <div className="gb-page gb-page--right">
              <button type="button" className="gb-back" onClick={() => setOpenId(null)}>
                &lsaquo; back to the index
              </button>
              <p className="gb-rank-big">{it.rank}</p>
              <h2 className="gb-detail-name">{it.name}</h2>
              <div className="gb-rule" aria-hidden="true" />
              <dl className="gb-stats">
                <dt>Cost</dt>
                <dd>{it.cost}</dd>
                {it.gate && (
                  <>
                    <dt>Seal</dt>
                    <dd>{it.gate}</dd>
                  </>
                )}
                <dt>Effect</dt>
                <dd className="gb-effect">{it.effect}</dd>
              </dl>
              <p className="gb-lore">{it.lore}</p>
              <div className="gb-actions">
                <button
                  type="button"
                  className="gb-summon"
                  disabled={!it.unlocked}
                  onClick={() => onSummon && onSummon(it.id)}
                >
                  {it.unlocked ? 'Summon' : 'Sealed'}
                </button>
                {boundOf(it.id) > 0 && (
                  <button
                    type="button"
                    className="gb-dispel"
                    onClick={() => onDispel && onDispel(it.id)}
                  >
                    Dispel
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
