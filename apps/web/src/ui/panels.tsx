import { type ReactElement, type ReactNode } from 'react';
import { type PanelId } from '../rooms/rooms.js';

interface PanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A diegetic modal styled as an aged grimoire page (02 §10). */
export function Panel({ title, onClose, children }: PanelProps): ReactElement {
  return (
    <div className="panel-overlay" onClick={onClose} role="presentation">
      <div className="panel" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="panel-header">
          <h2 className="panel-title">{title}</h2>
          <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}

interface PanelContent {
  title: string;
  body: ReactNode;
}

/** Placeholder copy in the game's voice; each panel's real menu lands with its system. */
export const PANELS: Record<PanelId, PanelContent> = {
  'ars-goetia': {
    title: 'Ars Goetia',
    body: (
      <p>
        The seventy-two seals wait beneath the ink, unlit. The <em>Invocatio</em> rite is not yet
        bound to this page.
      </p>
    ),
  },
  maleficia: {
    title: 'The Maleficia Shelf',
    body: <p>Empty hooks and clean dust-rings. Nothing has yet been found or purchased.</p>,
  },
  'altar-menu': {
    title: 'The Altar',
    body: (
      <p>
        Here the loadout will be read: the Sigil bindings, the Devotion owed each Prince, the buffs
        in force. The stone is silent for now.
      </p>
    ),
  },
  pc: {
    title: 'The Desk',
    body: (
      <>
        <p>An old terminal, green text on black. Four ledgers and a log await wiring:</p>
        <ul className="stub-list">
          <li>Depraedatio</li>
          <li>Decimatio</li>
          <li>Indagatio</li>
          <li>Emptio</li>
          <li>Logs</li>
        </ul>
      </>
    ),
  },
  suasio: {
    title: 'The Suasio Scroll',
    body: (
      <p>The temptations are written but not yet speakable. Persuasion comes in a later rite.</p>
    ),
  },
};
