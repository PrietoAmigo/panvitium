import { useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';

/**
 * Settings — a fixed gear in the top-right opening an overlay with the local-first save tools:
 * export (back up / move a game), import (replace the current game from a pasted save), and a
 * guarded hard reset. Audio and the `DegradePass` knobs are deferred to the 5.3 art/audio track.
 */
export function SettingsPanel(): ReactElement {
  const open = useGameStore((s) => s.settingsOpen);
  const openSettings = useGameStore((s) => s.openSettings);
  const closeSettings = useGameStore((s) => s.closeSettings);
  return (
    <>
      <button
        type="button"
        className="settings-gear"
        aria-label={strings.settings.title}
        onClick={openSettings}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM12 2.5l1.3 2.4 2.7-.6.5 2.7 2.4 1.3-1 2.5 1 2.5-2.4 1.3-.5 2.7-2.7-.6L12 21.5l-1.3-2.4-2.7.6-.5-2.7-2.4-1.3 1-2.5-1-2.5 2.4-1.3.5-2.7 2.7.6L12 2.5z"
          />
        </svg>
      </button>
      {open && <SettingsOverlay onClose={closeSettings} />}
    </>
  );
}

function SettingsOverlay({ onClose }: { onClose: () => void }): ReactElement {
  const exportSave = useGameStore((s) => s.exportSave);
  const importSave = useGameStore((s) => s.importSave);
  const hardReset = useGameStore((s) => s.hardReset);

  const [exported, setExported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const s = strings.settings;

  const doExport = (): void => {
    setExported(exportSave() ?? '');
    setCopied(false);
  };
  const doCopy = (): void => {
    if (!exported) return;
    void navigator.clipboard?.writeText(exported).then(
      () => setCopied(true),
      () => {
        /* clipboard unavailable — the textarea is selectable as a fallback */
      },
    );
  };
  const doImport = (): void => {
    const text = importText.trim();
    if (!text) return;
    if (importSave(text)) onClose();
    else setImportError(true);
  };
  const doReset = (): void => {
    hardReset();
    onClose();
  };

  return (
    <div className="settings-modal" role="dialog" aria-label={s.title}>
      <div className="settings-inner">
        <h2 className="settings-title">{s.title}</h2>

        <section className="settings-section">
          <h3 className="settings-section-title">{s.exportTitle}</h3>
          <p className="settings-hint">{s.exportHint}</p>
          {exported === null ? (
            <button type="button" className="opera-btn" onClick={doExport}>
              {s.export}
            </button>
          ) : (
            <>
              <textarea
                className="settings-blob"
                readOnly
                rows={4}
                value={exported}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className="opera-btn" onClick={doCopy}>
                {copied ? s.copied : s.copy}
              </button>
            </>
          )}
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">{s.importTitle}</h3>
          <p className="settings-hint">{s.importHint}</p>
          <textarea
            className="settings-blob"
            rows={4}
            value={importText}
            placeholder={s.importPlaceholder}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportError(false);
            }}
          />
          {importError && <p className="settings-error">{s.importError}</p>}
          <button
            type="button"
            className="opera-btn"
            onClick={doImport}
            disabled={importText.trim().length === 0}
          >
            {s.import}
          </button>
        </section>

        <section className="settings-section settings-danger">
          <h3 className="settings-section-title">{s.resetTitle}</h3>
          <p className="settings-hint">{s.resetHint}</p>
          {confirmReset ? (
            <div className="settings-reset-confirm">
              <span>{s.resetConfirm}</span>
              <button type="button" className="opera-btn opera-btn--danger" onClick={doReset}>
                {s.resetYes}
              </button>
              <button type="button" className="opera-btn" onClick={() => setConfirmReset(false)}>
                {s.cancel}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="opera-btn opera-btn--danger"
              onClick={() => setConfirmReset(true)}
            >
              {s.reset}
            </button>
          )}
        </section>

        <button type="button" className="opera-btn settings-close" onClick={onClose}>
          {s.close}
        </button>
      </div>
    </div>
  );
}
