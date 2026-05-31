/* ArsGoetiaBook — the diegetic grimoire of invocations.

   Archetype: FULL-SCREEN OVERLAY. Renders its own shell (.goetia-overlay) and
   close affordance; does NOT use PanelShell. Reuses the existing goetia-* / gb-*
   classes already in the app stylesheet — no new CSS.

   Presentational + prop-driven: `entries` and `invokingPower` come from the sim
   (merged with design flavour by id); Summon/Dispel are callbacks. The only
   local state is which entry leaf is open. Un-illustrated entries fall back to a
   text plate, so the book renders correctly for ids it has never seen. */

import { useState } from 'react';
import type { ArsGoetiaBookProps } from './types.js';

export function ArsGoetiaBook({
  entries,
  invokingPower,
  onSummon,
  onDispel,
  onClose,
}: ArsGoetiaBookProps): JSX.Element {
  const [sel, setSel] = useState<string | null>(null);
  const entry = sel !== null ? entries.find((e) => e.id === sel) : undefined;

  return (
    <div
      className="goetia-overlay"
      role="dialog"
      aria-label="Ars Goetia"
      aria-modal="true"
      onClick={onClose}
    >
      <button className="goetia-close" onClick={onClose} aria-label="Close the Ars Goetia">
        ✕
      </button>
      <div className="goetia-spread" onClick={(e) => e.stopPropagation()}>
        {!entry && (
          <>
            <div className="gb-page gb-page--left">
              <ul className="gb-index">
                {entries.map((g) => (
                  <li key={g.id}>
                    <button
                      className={'gb-entry' + (g.unlocked ? '' : ' is-locked')}
                      onClick={() => setSel(g.id)}
                    >
                      <span className="gb-rank">{g.rank}</span>
                      <span className="gb-name">{g.name}</span>
                      <span className="gb-dots" />
                      <span className="gb-hint">
                        {g.unlocked ? (g.effect ?? '').replace(/\.$/, '') : (g.gate ?? 'Sealed')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="gb-page gb-page--right">
              <h2 className="gb-title">Ars Goetia</h2>
              <p className="gb-subtitle">The Lesser Key</p>
              <div className="gb-rule" />
              <p className="gb-power">Invoking power · {invokingPower}</p>
              <p className="gb-intro">
                Seventy-two kings and presidents of the descent, each bound to a seal. Summon what
                your station can hold; dispel what it cannot. The circle on the floor keeps only as
                many as the seals permit.
              </p>
              <p className="gb-folio">— turn the leaf —</p>
            </div>
          </>
        )}
        {entry && (
          <>
            <div className="gb-page gb-page--left">
              <button className="gb-back" onClick={() => setSel(null)}>
                ‹ the index
              </button>
              <p className="gb-rank-big">{entry.rank}</p>
              <h2 className="gb-detail-name">{entry.name}</h2>
              <dl className="gb-stats">
                <dt>Cost</dt>
                <dd>{entry.cost}</dd>
                {entry.gate ? (
                  <>
                    <dt>Gate</dt>
                    <dd>{entry.gate}</dd>
                  </>
                ) : null}
                {entry.effect ? (
                  <>
                    <dt>Effect</dt>
                    <dd className="gb-effect">{entry.effect}</dd>
                  </>
                ) : null}
              </dl>
              {entry.lore ? <p className="gb-lore">{entry.lore}</p> : null}
              <div className="gb-actions">
                <button
                  className="gb-summon"
                  disabled={!entry.unlocked}
                  onClick={() => onSummon(entry.id)}
                >
                  {entry.unlocked ? 'Summon' : 'Sealed'}
                </button>
                <button className="gb-dispel" onClick={() => onDispel(entry.id)}>
                  Dispel
                </button>
              </div>
            </div>
            <div className="gb-page gb-page--right gb-illus-page">
              {entry.illus ? (
                <img className="gb-illus-img" src={entry.illus} alt={entry.name} />
              ) : (
                <p className="gb-lore" style={{ textAlign: 'center' }}>
                  No plate has been drawn for this seal.
                </p>
              )}
              <p className="gb-illus-cap">{entry.name}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
