/* ArsGoetiaBook — the diegetic grimoire of invocations.

   Archetype: FULL-SCREEN OVERLAY. Renders its own shell (.goetia-overlay) and
   close affordance; does NOT use PanelShell. Reuses the existing goetia-* / gb-*
   classes already in the app stylesheet.

   Presentational + prop-driven: `entries` and `invokingPower` come from the sim
   (merged with design flavour by id); Summon/Dispel are callbacks. Local state is
   which entry leaf is open, which index page is showing, and which illustrations
   404'd (so a seal with no drawing yet falls back to a text plate). */

import { useState } from 'react';
import type { ArsGoetiaBookProps } from './ars-goetia.types.js';

const PAGE_SIZE = 10;

export function ArsGoetiaBook({
  entries,
  invokingPower,
  onSummon,
  onDispel,
  onClose,
}: ArsGoetiaBookProps): JSX.Element {
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const entry = sel !== null ? entries.find((e) => e.id === sel) : undefined;

  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const cur = Math.min(page, pageCount - 1);
  const shown = entries.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

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
          <>
            <div className="gb-page gb-page--left">
              <ul className="gb-index">
                {shown.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className={'gb-entry' + (g.unlocked ? '' : ' is-locked')}
                      onClick={() => setSel(g.id)}
                    >
                      <span className="gb-rank">{g.rank}</span>
                      <span className="gb-name">{g.name}</span>
                      <span className="gb-dots" />
                      {/* Index shows the requirement on locked seals (red); no effect copy. */}
                      {!g.unlocked && <span className="gb-hint">{g.gate ?? 'Sealed'}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {pageCount > 1 && (
                <div className="gb-pager">
                  <button
                    type="button"
                    className="gb-pager-btn"
                    disabled={cur === 0}
                    onClick={() => setPage(cur - 1)}
                    aria-label="Previous page"
                  >
                    ‹
                  </button>
                  <span className="gb-pager-label">
                    {cur + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    className="gb-pager-btn"
                    disabled={cur >= pageCount - 1}
                    onClick={() => setPage(cur + 1)}
                    aria-label="Next page"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
            <div className="gb-page gb-page--right">
              <h2 className="gb-title">Ars Goetia</h2>
              <p className="gb-subtitle">The Lesser Key</p>
              <div className="gb-rule" />
              <p className="gb-power">Invoking power · {invokingPower}</p>
              <p className="gb-intro">
                Every novice can recite the seventy-two kings, princes and presidents of the
                descent, their names are half the trade in any grimoire. Yet a crown seldom stoops
                to labour.
              </p>
            </div>
          </>
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
                  type="button"
                  className="gb-summon"
                  disabled={!entry.unlocked}
                  onClick={() => onSummon(entry.id)}
                >
                  {entry.unlocked ? 'Summon' : 'Sealed'}
                </button>
                <button type="button" className="gb-dispel" onClick={() => onDispel(entry.id)}>
                  Dispel
                </button>
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
