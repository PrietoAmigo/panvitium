import { type ReactNode, type ReactElement } from 'react';

export type PanelVariant = 'scroll' | 'stone' | 'cabinet' | 'niche';

interface PanelShellProps {
  title: string;
  onClose: () => void;
  variant?: PanelVariant;
  hideHeader?: boolean;
  children: ReactNode;
}

// The framed overlay shared by the parchment (scroll), stone (altar) and wooden
// (cabinet) panels. Click-outside and the × both close. Ars Goetia, the PC and
// Katabasis render their own full-screen shells instead — they don't use this.
export function PanelShell({
  title,
  onClose,
  variant,
  hideHeader,
  children,
}: PanelShellProps): ReactElement {
  return (
    <div className="panel-overlay" onClick={onClose} role="presentation">
      <div
        className={'panel' + (variant ? ' panel--' + variant : '')}
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {hideHeader ? (
          <button
            type="button"
            className="panel-close panel-close--float"
            onClick={onClose}
            aria-label="Close"
          >
            {'\u2715'}
          </button>
        ) : (
          <header className="panel-header">
            <h2 className="panel-title">{title}</h2>
            <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
              {'\u2715'}
            </button>
          </header>
        )}
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}
