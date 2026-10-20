/* MagnaGoetiaBook — the diegetic grimoire of invocations.

   Archetype: FULL-SCREEN OVERLAY. Renders its own shell (.goetia-overlay) and
   close affordance; does NOT use PanelShell. Reuses the existing goetia-* / gb-*
   classes already in the app stylesheet.

   Presentational + prop-driven: `entries` and `invokingPower` come from the sim
   (merged with design flavour by id); Summon/Dispel are callbacks. Local state is
   which entry leaf is open and which plates failed to load (hidden, leaving the leaf bare). The index
   is a single leaf: the title block at the top, the whole roster in two columns below. An entry's
   leaf is set in quarters: its stats in the top half of the left page, its painted plate (Claude
   Design, "Invocation Plates") in the top half of the right, and its lore below both, filling the
   left page's bottom half first and running on into the right's, with Summon / Dispel in the
   bottom-right corner. */

import { Fragment, useState } from 'react';
import type { MagnaGoetiaBookProps } from './magna-goetia.types.js';

/** The lore's `*…*` spans (the Latin, the quoted scripture) as upright `<em>`s on the italic page. */
function loreText(lore: string): JSX.Element[] {
  return lore
    .split('*')
    .map((part, i) =>
      i % 2 === 1 ? <em key={i}>{part}</em> : <Fragment key={i}>{part}</Fragment>,
    );
}

export function MagnaGoetiaBook({
  entries,
  invokingPower,
  onSummon,
  onDispel,
  onClose,
}: MagnaGoetiaBookProps): JSX.Element {
  const [sel, setSel] = useState<string | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const entry = sel !== null ? entries.find((e) => e.id === sel) : undefined;

  return (
    <div
      className="goetia-overlay"
      role="dialog"
      aria-label="Magna Goetia"
      aria-modal="true"
      onClick={onClose}
    >
      <button
        type="button"
        className="goetia-close"
        onClick={onClose}
        aria-label="Close the Magna Goetia"
      >
        ✕
      </button>
      <div className="goetia-spread" onClick={(e) => e.stopPropagation()}>
        {!entry && (
          <div className="gb-page gb-page--index">
            <div className="gb-index-head">
              <h2 className="gb-title">Magna Goetia</h2>
              <p className="gb-subtitle">The Greater Key</p>
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
            </div>
            <div className="gb-page gb-page--right gb-illus-page">
              {/* The plate is decorative: the name already heads the left page. */}
              {entry.illus && !broken[entry.id] ? (
                <img
                  key={entry.id}
                  className="gb-illus-img"
                  src={entry.illus}
                  alt=""
                  aria-hidden="true"
                  width={600}
                  height={800}
                  decoding="async"
                  onError={() => setBroken((b) => ({ ...b, [entry.id]: true }))}
                />
              ) : null}
            </div>
            {/* One flow across the bottom half of both pages: the left column fills first. */}
            {entry.lore ? <p className="gb-lore">{loreText(entry.lore)}</p> : null}
            {/* Summon / Dispel close the leaf, in its bottom-right corner under the lore. */}
            <div className="gb-actions">
              <button
                type="button"
                className="gb-summon"
                disabled={!entry.unlocked || entry.atCap}
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
          </>
        )}
      </div>
    </div>
  );
}
