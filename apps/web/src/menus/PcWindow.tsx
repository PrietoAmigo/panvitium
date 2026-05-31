import { useState, type ReactElement } from 'react';

interface PcWindowProps {
  /** Render the real body for a launched program (by its display id, e.g. "Depraedatio"). */
  renderProgram: (id: string) => ReactElement;
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

// The Studio desk PC — an Ubuntu-style file manager whose "files" are ritual programs. Full-screen
// shell (does not use PanelShell). The chrome is the design; each launched program's body is the real
// system component, supplied by `renderProgram`.
export function PcWindow({ renderProgram, onClose }: PcWindowProps): ReactElement {
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
                {renderProgram(running)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
