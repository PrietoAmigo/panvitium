import { useEffect, useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';

/**
 * Cloud-sync panel (ADR-009 + ADR-010). A small corner card that:
 *   - signed-out: shows an email field + "Send the link" button.
 *   - signed-in:  shows the display name, a "Sync now" button, last-synced timestamp, and a sign-out.
 *
 * Errors land in a small footer with a Dismiss button. The conflict-chooser modal (ConflictModal.tsx)
 * is its own component — this panel just initiates the sync; if the server returns a conflict the
 * modal takes over.
 */
function formatTime(ms: number | null): string {
  if (ms === null) return strings.sync.syncIdle;
  const d = new Date(ms);
  // HH:MM dd/mm — short and locale-agnostic for the indicator.
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function SyncPanel(): ReactElement | null {
  const user = useGameStore((s) => s.user);
  const authReady = useGameStore((s) => s.authReady);
  const syncStatus = useGameStore((s) => s.syncStatus);
  const syncError = useGameStore((s) => s.syncError);
  const lastSyncedAt = useGameStore((s) => s.lastSyncedAt);
  const refreshUser = useGameStore((s) => s.refreshUser);
  const signIn = useGameStore((s) => s.signIn);
  const signOut = useGameStore((s) => s.signOut);
  const syncToServer = useGameStore((s) => s.syncToServer);
  const dismissSyncError = useGameStore((s) => s.dismissSyncError);

  // Kick off the initial auth probe on mount (idempotent — refreshUser bails if already ran).
  useEffect(() => {
    if (!authReady) void refreshUser();
  }, [authReady, refreshUser]);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  if (!authReady) {
    // Avoid flashing the signed-out form while the initial me-check is in flight.
    return null;
  }

  const handleSend = (): void => {
    if (!email) return;
    void signIn(email).then(() => setSent(true));
  };

  const handleSync = (): void => {
    void syncToServer();
  };

  return (
    <div className={`sync-panel${open ? ' sync-panel--open' : ''}`}>
      <button
        type="button"
        className="sync-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={strings.sync.title}
      >
        {user ? user.displayName : strings.sync.title}
        <span className={`sync-dot sync-dot--${syncStatus}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="sync-body" role="region" aria-label={strings.sync.title}>
          <p className="sync-intro">{strings.sync.intro}</p>
          {user ? (
            <>
              <p className="sync-line">
                <span className="sync-label">{strings.sync.signedInAs}:</span>{' '}
                <strong>{user.displayName}</strong>
              </p>
              <p className="sync-line">
                <span className="sync-label">{strings.sync.syncedAt}:</span>{' '}
                <span className="sync-time">{formatTime(lastSyncedAt)}</span>
              </p>
              <div className="sync-actions">
                <button
                  type="button"
                  className="opera-btn"
                  onClick={handleSync}
                  disabled={syncStatus === 'syncing'}
                >
                  {syncStatus === 'syncing' ? strings.sync.syncing : strings.sync.syncNow}
                </button>
                <button
                  type="button"
                  className="opera-btn opera-btn--secondary"
                  onClick={() => void signOut()}
                >
                  {strings.sync.signOut}
                </button>
              </div>
            </>
          ) : sent ? (
            <p className="sync-sent">{strings.sync.signInHint}</p>
          ) : (
            <>
              <label className="sync-line" htmlFor="sync-email">
                <span className="sync-label">{strings.sync.emailLabel}:</span>
              </label>
              <input
                id="sync-email"
                type="email"
                className="sync-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label={strings.sync.emailLabel}
              />
              <div className="sync-actions">
                <button
                  type="button"
                  className="opera-btn"
                  onClick={handleSend}
                  disabled={email.length === 0}
                >
                  {strings.sync.sendLink}
                </button>
              </div>
            </>
          )}
          {syncError !== null && (
            <div className="sync-error">
              <span>
                {strings.sync.syncError}: {syncError}
              </span>
              <button
                type="button"
                className="sync-error-dismiss"
                onClick={dismissSyncError}
                aria-label={strings.sync.dismissError}
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
