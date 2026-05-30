import { useState, type ReactElement } from 'react';
import { BUSINESSES, DECIMATIO, INDAGATIO, EMPTIO, ACHIEVEMENTS } from './menus.data.js';

interface PcWindowProps {
  onClose: () => void;
}

const EXECUTABLES = [
  { id: 'Depraedatio', color: '#E95420', glyph: '$' },
  { id: 'Decimatio', color: '#772953', glyph: '†' },
  { id: 'Indagatio', color: '#2c7bbe', glyph: '?' },
  { id: 'Emptio', color: '#2f9e52', glyph: '+' },
  { id: 'Achievements', color: '#c79a2b', glyph: '★' },
  { id: 'Logs', color: '#3a3a3e', glyph: '>_' },
] as const;

// The body of one "executable" launched inside the PC desktop.
// TODO(wire): each branch reads stand-in data — replace with the real Depraedatio
// businesses, Decimatio/Indagatio actions, Emptio market, achievements and log feed.
function PcProgram({ id }: { id: string }): ReactElement {
  if (id === 'Depraedatio') {
    return (
      <div>
        <p className="pc-app-intro">
          Sin-themed enterprises. Each pays out in gold and grooms its own reprobate subtype while
          it stands.
        </p>
        <ul className="pc-app-list">
          {BUSINESSES.map((b, i) => (
            <li key={i} className={'pc-app-row' + (b.unlocked ? '' : ' is-locked')}>
              <div className="pc-app-meta">
                <span className="pc-app-name">{b.name}</span>
                <span className="pc-app-sub">{b.sub}</span>
              </div>
              <button type="button" className="pc-app-btn" disabled={!b.unlocked}>
                {b.unlocked ? `Build \u00B7 ${b.cost}` : b.cost}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (id === 'Logs') {
    return (
      <ul className="pc-log">
        <li className="pc-log-line tier-stellar">Caedis · Stellar — +4 Souls, -4 Reprobates</li>
        <li className="pc-log-line tier-excellent">Suggestion · Excellent — +3 Reprobates</li>
        <li className="pc-log-line">Suggestion · Good — +1 Reprobates</li>
        <li className="pc-log-line">Caedis · Neutral</li>
        <li className="pc-log-line tier-stellar">Caedis · Stellar — +5 Souls, -5 Reprobates</li>
        <li className="pc-log-line">Suggestion · Bad</li>
        <li className="pc-log-line tier-excellent">Suggestion · Excellent — +3 Reprobates</li>
      </ul>
    );
  }
  if (id === 'Decimatio') {
    return (
      <div>
        <p className="pc-app-intro">
          Thin the herd. Each rite spends gold to convert reprobates into souls.
        </p>
        <ul className="pc-app-list">
          <li className="pc-app-row">
            <div className="pc-app-meta">
              <span className="pc-app-name">{DECIMATIO.name}</span>
              <span className="pc-app-sub">
                {DECIMATIO.sub} · {DECIMATIO.cost}
              </span>
            </div>
            <button type="button" className="pc-app-btn">
              {DECIMATIO.cta}
            </button>
          </li>
        </ul>
      </div>
    );
  }
  if (id === 'Indagatio') {
    return (
      <div>
        <p className="pc-app-intro">
          A long, patient search of the world’s corners. Most of what is found cannot be picked up —
          only listed for purchase under Emptio.
        </p>
        <ul className="pc-app-list">
          <li className="pc-app-row">
            <div className="pc-app-meta">
              <span className="pc-app-name">{INDAGATIO.name}</span>
              <span className="pc-app-sub">{INDAGATIO.cost}</span>
            </div>
            <button type="button" className="pc-app-btn">
              {INDAGATIO.cta}
            </button>
          </li>
        </ul>
      </div>
    );
  }
  if (id === 'Emptio') {
    return (
      <div>
        <p className="pc-app-intro">
          What the search surfaced, ready to be bought. The deal itself can still sour.
        </p>
        <ul className="pc-app-list">
          {EMPTIO.map((m, i) => (
            <li key={i} className="pc-app-row">
              <div className="pc-app-meta">
                <span className="pc-app-name">{m.name}</span>
                <span className={'pc-app-sub rarity-' + m.rarity}>
                  {m.rarity} · {m.cost}
                </span>
              </div>
              <button type="button" className="pc-app-btn">
                Buy
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (id === 'Achievements') {
    const got = ACHIEVEMENTS.filter((a) => a.got).length;
    return (
      <div>
        <p className="pc-app-intro">
          A tally of what you have done. Sealed entries reveal their name once earned.
        </p>
        <p className="pc-app-count">
          {got} / {ACHIEVEMENTS.length}
        </p>
        <ul className="pc-app-ach">
          {ACHIEVEMENTS.map((a, i) => (
            <li key={i} className={'pc-ach-row' + (a.got ? ' is-got' : '')}>
              <span className="pc-ach-mark">{a.got ? '◆' : '◇'}</span>
              <span className="pc-ach-meta">
                <span className="pc-ach-name">{a.got ? a.name : 'Sealed'}</span>
                <span className="pc-ach-desc">{a.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="pc-app-empty">
      <span className="pc-app-empty-glyph">∅</span>
      <p>This program is not yet inscribed.</p>
      <p className="pc-app-empty-sub">{id.toLowerCase()}.rite — awaiting its system.</p>
    </div>
  );
}

// The Studio desk PC — an Ubuntu-style file manager whose "files" are ritual
// programs. Full-screen shell (does not use PanelShell).
export function PcWindow({ onClose }: PcWindowProps): ReactElement {
  const [running, setRunning] = useState<string | null>(null);
  return (
    <div className="panel-overlay" onClick={onClose} role="presentation">
      <div
        className="pc-window"
        role="dialog"
        aria-label="The PC"
        onClick={(e) => e.stopPropagation()}
      >
        {running === null ? (
          <>
            <div className="pc-titlebar">
              <div className="pc-tb-left">
                <span className="pc-tb-nav" aria-hidden="true">
                  ‹
                </span>
                <span className="pc-tb-nav pc-tb-nav--off" aria-hidden="true">
                  ›
                </span>
                <span className="pc-location">opera</span>
              </div>
              <button type="button" className="pc-winbtn" onClick={onClose} aria-label="Close">
                {'\u00D7'}
              </button>
            </div>
            <div className="pc-body">
              <aside className="pc-sidebar">
                <span className="pc-side-head">Places</span>
                <span className="pc-side-item">Recent</span>
                <span className="pc-side-item">Starred</span>
                <span className="pc-side-item">Home</span>
                <span className="pc-side-item pc-side-item--active">opera</span>
                <span className="pc-side-item">Trash</span>
              </aside>
              <div className="pc-files">
                {EXECUTABLES.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="pc-file"
                    onClick={() => setRunning(e.id)}
                  >
                    <span className="pc-file-icon" style={{ background: e.color }}>
                      {e.glyph}
                    </span>
                    <span className="pc-file-name">{e.id}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="pc-titlebar pc-titlebar--app">
              <div className="pc-tb-left">
                <button type="button" className="pc-tb-back" onClick={() => setRunning(null)}>
                  ‹ Files
                </button>
                <span className="pc-location">{running}</span>
              </div>
              <button type="button" className="pc-winbtn" onClick={onClose} aria-label="Close">
                {'\u00D7'}
              </button>
            </div>
            <div className="pc-app">
              <div className="pc-app-card">
                <h3 className="pc-app-title">{running}</h3>
                <PcProgram id={running} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
