/* ArsGoetiaBook — the diegetic grimoire of invocations.

   Archetype: FULL-SCREEN OVERLAY. Renders its own shell (.goetia-overlay) and
   close affordance; does NOT use PanelShell. Reuses the existing goetia-* / gb-*
   classes already in the app stylesheet.

   Presentational + prop-driven: `entries` and `invokingPower` come from the sim
   (merged with design flavour by id); Summon/Dispel are callbacks. Local state is
   which entry leaf is open and which illustrations 404'd (so a seal with no drawing yet falls back
   to a text plate). The index is a single leaf: the title block at the top, the whole roster in two
   columns below. */

import { useState } from 'react';
import type { ArsGoetiaBookProps } from './ars-goetia.types.js';

export function ArsGoetiaBook({
  entries,
  invokingPower,
  onSummon,
  onDispel,
  onClose,
}: ArsGoetiaBookProps): JSX.Element {
  const [sel, setSel] = useState<string | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const entry = sel !== null ? entries.find((e) => e.id === sel) : undefined;

  return (
    <div
      className="goetia-overlay"
      role="dialog"
      aria-label="Ars Goetia"
      aria-modal="true"
      onClick={onClose}
    >
      <button
        type="button"
        className="goetia-close"
        onClick={onClose}
        aria-label="Close the Ars Goetia"
      >
        ✕
      </button>
      <div className="goetia-spread" onClick={(e) => e.stopPropagation()}>
        {!entry && (
          <div className="gb-page gb-page--index">
            <div className="gb-index-head">
              <h2 className="gb-title">Ars Goetia</h2>
              <p className="gb-subtitle">The Lesser Key</p>
              <div className="gb-rule" />
              <p className="gb-power">Invoking power · {invokingPower}</p>
            </div>
            {/* The whole roster on one leaf, two columns, clustered by Sin level then invoking power. */}
            <ul className="gb-index">
              {entries.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={
                      'gb-entry' + (g.unlocked ? '' : ' is-locked') + (g.isApex ? ' is-apex' : '')
                    }
                    onClick={() => setSel(g.id)}
                  >
                    <span className="gb-rank">{g.rank}</span>
                    <span className="gb-name">{g.name}</span>
                    {/* Apex entities are marked so they stand out from the stackable normals. */}
                    {g.isApex && <span className="gb-apex-tag">Apex</span>}
                    <span className="gb-dots" />
                    {/* Bound entries show their count; otherwise a locked seal shows its gate. */}
                    {g.bound ? (
                      <span className="gb-bound">{g.bound}</span>
                    ) : (
                      !g.unlocked && <span className="gb-hint">{g.gate ?? 'Sealed'}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {entry && (
          <>
            <div className="gb-page gb-page--left">
              <button type="button" className="gb-back" onClick={() => setSel(null)}>
                <span className="gb-back-arrow" aria-hidden="true">
                  ‹
                </span>
                back to index
              </button>
              {entry.rank ? <p className="gb-rank-big">{entry.rank}</p> : null}
              <h2 className="gb-detail-name">
                {entry.name}
                {/* Apex entities read apart from the stackable normals. */}
                {entry.isApex && <span className="gb-apex-tag gb-apex-tag--detail">Apex</span>}
              </h2>
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
                {/* Bound (the live count) sits below the effect line. */}
                {entry.active > 0 ? (
                  <>
                    <dt>Bound</dt>
                    <dd>{entry.bound}</dd>
                  </>
                ) : null}
                {/* Cap: how many may be bound at once. */}
                <dt>Cap</dt>
                <dd>{entry.cap}</dd>
              </dl>
              {entry.lore ? <p className="gb-lore">{entry.lore}</p> : null}
              <div className="gb-actions">
                <button
                  type="button"
                  className="gb-summon"
                  disabled={!entry.unlocked || entry.atCap || !entry.affordable}
                  onClick={() => onSummon(entry.id)}
                >
                  {entry.atCap ? 'Bound' : entry.unlocked ? 'Summon' : 'Sealed'}
                </button>
                {entry.active > 0 && (
                  <button type="button" className="gb-dispel" onClick={() => onDispel(entry.id)}>
                    Dispel
                  </button>
                )}
              </div>
            </div>
            <div className="gb-page gb-page--right gb-illus-page">
              {entry.illus && !broken[entry.id] ? (
                <img
                  className="gb-illus-img"
                  src={entry.illus}
                  alt={entry.name}
                  onError={() => setBroken((b) => ({ ...b, [entry.id]: true }))}
                />
              ) : (
                <p className="gb-lore" style={{ textAlign: 'center' }}>
                  No plate has been drawn for this seal.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
