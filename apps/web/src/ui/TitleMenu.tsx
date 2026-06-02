import { useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';

/**
 * The launch title menu — full-screen, shown once per run. The sim is frozen behind it by the
 * `titleOpen` store flag (advance() no-ops, like the Katabasis trance) until the player picks
 * Continue or starts a New Game. Carries the gold-leaf PANVITIUM wordmark (the preserved display-
 * caps treatment) and four entries: Continue, New Game (confirm-wipe), Settings, About.
 */
export function TitleMenu({ onContinue }: { onContinue?: () => void }): ReactElement | null {
  const open = useGameStore((s) => s.titleOpen);
  const dismissTitle = useGameStore((s) => s.dismissTitle);
  const hardReset = useGameStore((s) => s.hardReset);
  const openSettings = useGameStore((s) => s.openSettings);

  const [view, setView] = useState<'main' | 'about'>('main');
  const [confirmNew, setConfirmNew] = useState(false);

  if (!open) return null;
  const m = strings.menu;

  // Continue runs the entry sequence (fade + music fade) when wired by TitleSequence; standalone
  // (e.g. in tests) it just dismisses the title.
  const handleContinue = onContinue ?? dismissTitle;

  const beginAnew = (): void => {
    hardReset();
    dismissTitle();
  };

  return (
    <div className="title-menu" role="dialog" aria-modal="true" aria-label={strings.appName}>
      <div className="title-veil" aria-hidden="true" />
      <div className="title-inner">
        <h1 className="title-wordmark">{strings.appName}</h1>
        <p className="title-tagline">{m.tagline}</p>

        {view === 'about' ? (
          <div className="title-about">
            {m.aboutBody.split('\n\n').map((para) => (
              <p key={para.slice(0, 16)}>{para}</p>
            ))}
            <button
              type="button"
              className="title-entry title-entry--ghost"
              onClick={() => setView('main')}
            >
              {m.back}
            </button>
          </div>
        ) : confirmNew ? (
          <div className="title-confirm">
            <p className="title-confirm-prompt">{m.newGamePrompt}</p>
            <div className="title-confirm-actions">
              <button type="button" className="title-entry title-entry--danger" onClick={beginAnew}>
                {m.newGameConfirm}
              </button>
              <button
                type="button"
                className="title-entry title-entry--ghost"
                onClick={() => setConfirmNew(false)}
              >
                {m.cancel}
              </button>
            </div>
          </div>
        ) : (
          <nav className="title-entries">
            <button
              type="button"
              className="title-entry title-entry--primary"
              onClick={handleContinue}
            >
              {m.continue}
            </button>
            <button type="button" className="title-entry" onClick={() => setConfirmNew(true)}>
              {m.newGame}
            </button>
            <button type="button" className="title-entry" onClick={openSettings}>
              {m.settings}
            </button>
            <button type="button" className="title-entry" onClick={() => setView('about')}>
              {m.about}
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
