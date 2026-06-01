import { useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';

interface EmailMeta {
  from: string;
  subject: string;
  body: string;
}

const CATALOG = strings.emails.catalog as Record<string, EmailMeta | undefined>;

function meta(id: string): EmailMeta {
  return CATALOG[id] ?? { from: strings.emails.from, subject: id, body: '' };
}

/**
 * The Emails program (Phase 5.2): the impact-feedback inbox. Lists delivered correspondence (newest
 * first) with an unread marker; opening one shows the full message and marks it read. Reads the inbox
 * off the live state (a stable reference between ticks) and maps in the render body — never a fresh
 * array from the selector, which would loop.
 */
export function EmailsGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const markRead = useGameStore((s) => s.markEmailRead);
  const markAllRead = useGameStore((s) => s.markAllEmailsRead);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;
  const inbox = state.lifetime.inbox;
  if (inbox.length === 0) return <p className="pc-empty">{strings.emails.inboxEmpty}</p>;

  const open = openId !== null ? inbox.find((e) => e.id === openId) : undefined;
  if (open) {
    const m = meta(open.id);
    return (
      <div className="emails-read">
        <button type="button" className="opera-btn emails-back" onClick={() => setOpenId(null)}>
          {strings.emails.back}
        </button>
        <h3 className="emails-subject">{m.subject}</h3>
        <p className="emails-meta">
          {strings.emails.from}: {m.from}
        </p>
        <p className="emails-body">{m.body}</p>
      </div>
    );
  }

  const sorted = [...inbox].sort((a, b) => b.receivedAt - a.receivedAt);
  const anyUnread = inbox.some((e) => e.readAt === null);
  return (
    <div className="emails-inbox">
      {anyUnread && (
        <button type="button" className="opera-btn emails-markall" onClick={markAllRead}>
          {strings.emails.markAllRead}
        </button>
      )}
      <ul className="emails-list">
        {sorted.map((e) => {
          const m = meta(e.id);
          const unread = e.readAt === null;
          return (
            <li key={e.id}>
              <button
                type="button"
                className={'emails-item' + (unread ? ' emails-item--unread' : '')}
                onClick={() => {
                  setOpenId(e.id);
                  if (unread) markRead(e.id);
                }}
              >
                {unread && <span className="emails-dot" aria-hidden="true" />}
                <span className="emails-item-subject">{m.subject}</span>
                <span className="emails-item-from">{m.from}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
