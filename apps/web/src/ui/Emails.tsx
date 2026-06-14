import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import type { ReceivedEmail } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';

const E = strings.emails;

/** A preset reply the player can send. `text` is shown; `effect` is the developer-facing spec for the
 *  (currently empty) reply-effect hook in the sim — it is intentionally never rendered. */
interface Reply {
  text: string;
  effect: string;
}

/** Catalog content for one email. `addr` and `replies` are optional: existing mail omits them (the
 *  reply mechanic is wired but left unauthored), and the client degrades to a plain, unanswerable
 *  message when they are absent. */
interface EmailMeta {
  from: string;
  subject: string;
  body: string;
  addr?: string;
  replies?: readonly Reply[];
}

const CATALOG = E.catalog as Record<string, EmailMeta | undefined>;

function meta(id: string): EmailMeta {
  return CATALOG[id] ?? { from: E.from, subject: id, body: '' };
}

// --- Derived presentation (the catalog has no avatar / snippet / date fields) ---------------------

const AVATAR_BG = [
  '#5a6b8c',
  '#6f7a48',
  '#8c5a44',
  '#6a6a72',
  '#8c6f48',
  '#6b5a7a',
  '#7a5a5a',
  '#4f7a70',
] as const;

/** Stable colour from the sender name, so an avatar keeps its hue across sessions. */
function avatarBg(from: string): string {
  let h = 0;
  for (let i = 0; i < from.length; i += 1) h = (h * 31 + from.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length] as string;
}

/** Up to two initials from the sender name (e.g. "Holloway & Crane" → "HC"). */
function initials(from: string): string {
  const words = from
    .replace(/[^\p{L}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase();
  const first = words[0] as string;
  const last = words[words.length - 1] as string;
  return (first[0] as string).toUpperCase() + (last[0] as string).toUpperCase();
}

/** First non-empty line of the body, clipped for the list row. */
function snippet(body: string): string {
  const line =
    body
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? '';
  return line.length > 110 ? `${line.slice(0, 110).trimEnd()}\u2026` : line;
}

const fmtClock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const fmtMonthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fmtFull = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Short list-row stamp: clock for today, weekday within the week, else month + day. */
function fmtTime(ms: number): string {
  const d = new Date(ms);
  const startOfDay = (t: Date): number => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.floor((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return fmtClock.format(d);
  if (days < 7) return fmtWeekday.format(d);
  return fmtMonthDay.format(d);
}

/** Full reading-pane date. */
function fmtDate(ms: number): string {
  return fmtFull.format(new Date(ms));
}

// --- Static styles --------------------------------------------------------------------------------

const ROOT: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  overflow: 'hidden',
  background: '#fbfbfb',
  color: '#1a1620',
  fontFamily: "'Ubuntu', system-ui, -apple-system, sans-serif",
};

const SIDEBAR: CSSProperties = {
  width: 190,
  flex: '0 0 auto',
  background: '#efeef0',
  borderRight: '1px solid #e0dfe2',
  padding: '14px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const COMPOSE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: '#E95420',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 13.5,
  fontWeight: 500,
  cursor: 'default',
  marginBottom: 12,
};

const FOLDERS_HEAD: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  color: '#9a979f',
  padding: '4px 10px 6px',
};

const FOLDER_ACTIVE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 10px',
  borderRadius: 7,
  background: '#ddd9e0',
  fontSize: 13.5,
  color: '#1a1620',
  fontWeight: 600,
};

const FOLDER: CSSProperties = { padding: '8px 10px', fontSize: 13.5, color: '#56535d' };

const LIST_PANE: CSSProperties = {
  width: 362,
  flex: '0 0 auto',
  borderRight: '1px solid #e6e5e8',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  background: '#fff',
};

const PANE_HEAD: CSSProperties = {
  height: 46,
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 16px',
  borderBottom: '1px solid #ececec',
};

const READ_PANE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  background: '#fff',
};

const TOOLBAR: CSSProperties = {
  height: 52,
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 16px',
  borderBottom: '1px solid #ececec',
};

const DISABLED_TOOL: CSSProperties = {
  fontSize: 12.5,
  color: '#c2bfc6',
  background: '#f7f6f8',
  border: '1px solid #efeef0',
  borderRadius: 6,
  padding: '7px 12px',
  cursor: 'default',
};

const ACTIVE_REPLY: CSSProperties = {
  fontSize: 12.5,
  color: '#444',
  background: '#f3f2f4',
  border: '1px solid #e4e3e6',
  borderRadius: 6,
  padding: '7px 12px',
  cursor: 'pointer',
};

const DELETE_BTN: CSSProperties = {
  fontSize: 12.5,
  color: '#9a3a2a',
  background: '#fbeeea',
  border: '1px solid #f0d6cd',
  borderRadius: 6,
  padding: '7px 12px',
  cursor: 'pointer',
};

const SECTION_LABEL: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  color: '#9a979f',
};

/**
 * The Emails program (two-pane rework): a diegetic, light desktop mail client embedded in the dark PC.
 * Left is a decorative folder rail; the middle pane lists delivered correspondence (newest first) with
 * unread + answered markers; the right pane reads the selected message and — when the catalog email
 * defines `replies` — offers a preset reply or shows the one already sent, plus a working Delete.
 *
 * Read / answered / deleted all persist in the live game state; only the current selection and whether
 * the reply chooser is open are local. The inbox is read straight off `state.lifetime.inbox` (a stable
 * reference between ticks) and mapped in the render body — never via a fresh-array selector, which
 * would loop.
 */
export function EmailsGroup(): ReactElement {
  const state = useGameStore((s) => s.state);
  const markRead = useGameStore((s) => s.markEmailRead);
  const answerEmail = useGameStore((s) => s.answerEmail);
  const deleteEmail = useGameStore((s) => s.deleteEmail);
  const [sel, setSel] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);

  const inbox: ReceivedEmail[] = state ? state.lifetime.inbox : [];
  const visible = inbox.filter((e) => !e.deleted).sort((a, b) => b.receivedAt - a.receivedAt);

  // Resolve the active selection (default to the newest) without storing derived state.
  const current =
    (sel !== null ? visible.find((e) => e.id === sel) : undefined) ?? visible[0] ?? null;

  // Displaying a message reads it (idempotent in the sim, so this can't loop).
  const curId = current?.id ?? null;
  useEffect(() => {
    if (curId !== null) markRead(curId);
  }, [curId, markRead]);

  if (!state) return <p className="pc-empty">{strings.opera.notYet}.</p>;

  const badge = visible.filter((e) => e.readAt === null).length;

  const select = (id: string): void => {
    setSel(id);
    setReplying(false);
  };

  const onDelete = (id: string): void => {
    const idx = visible.findIndex((e) => e.id === id);
    const next = visible[idx + 1] ?? visible[idx - 1] ?? null;
    setSel(next ? next.id : null);
    setReplying(false);
    deleteEmail(id);
  };

  const renderEmpty = (): ReactElement => (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#b3b0b8',
        fontSize: 14,
      }}
    >
      {E.noMessage}
    </div>
  );

  const renderOpen = (entry: ReceivedEmail): ReactElement => {
    const m = meta(entry.id);
    const replies = m.replies ?? [];
    const answerable = replies.length > 0;
    const ansIdx = entry.answeredReply;
    const isAnswered = ansIdx != null && ansIdx >= 0 && ansIdx < replies.length;
    const isReplying = replying && answerable && !isAnswered;
    const replyDisabled = !answerable || isAnswered;
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={TOOLBAR}>
          <button
            type="button"
            style={replyDisabled ? DISABLED_TOOL : ACTIVE_REPLY}
            disabled={replyDisabled}
            onClick={() => setReplying(true)}
          >
            {'\u21A9'} {E.reply}
          </button>
          <span style={DISABLED_TOOL}>
            {'\u21AA'} {E.forward}
          </span>
          <span style={{ flex: 1 }} />
          <span style={DISABLED_TOOL}>
            {'\uD83D\uDDC4'} {E.archive}
          </span>
          <button type="button" style={DELETE_BTN} onClick={() => onDelete(entry.id)}>
            {'\uD83D\uDDD1'} {E.deleteLabel}
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <div style={{ padding: '24px 28px 0' }}>
            <h2
              style={{
                fontSize: 21,
                fontWeight: 600,
                color: '#1a1620',
                margin: '0 0 16px',
                lineHeight: 1.3,
              }}
            >
              {m.subject}
            </h2>
            <div
              style={{
                display: 'flex',
                gap: 13,
                alignItems: 'center',
                paddingBottom: 18,
                borderBottom: '1px solid #eee',
              }}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  flex: '0 0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 15,
                  background: avatarBg(m.from),
                }}
              >
                {initials(m.from)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: '#1a1620' }}>{m.from}</div>
                {m.addr != null && <div style={{ fontSize: 12.5, color: '#8d8a92' }}>{m.addr}</div>}
              </div>
              <div style={{ fontSize: 12.5, color: '#9a979f', textAlign: 'right' }}>
                {fmtDate(entry.receivedAt)}
              </div>
            </div>
          </div>

          {answerable && !isAnswered && !isReplying && (
            <div
              style={{
                margin: '16px 28px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                color: '#9a979f',
                fontSize: 13,
              }}
            >
              <span>{'\u21A9'}</span>
              <span>{E.replyHint}</span>
            </div>
          )}

          {isReplying && (
            <div style={{ margin: '18px 28px 4px' }}>
              <div
                style={{
                  border: '1px solid #e4e3e6',
                  borderRadius: 10,
                  background: '#fafafb',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #ececec',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    ...SECTION_LABEL,
                  }}
                >
                  <span>{E.chooseReply}</span>
                  <button
                    type="button"
                    onClick={() => setReplying(false)}
                    style={{
                      cursor: 'pointer',
                      color: '#8d8a92',
                      textTransform: 'none',
                      letterSpacing: 0,
                      fontSize: 12.5,
                      border: 'none',
                      background: 'transparent',
                    }}
                  >
                    {E.cancel}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {replies.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        answerEmail(entry.id, i);
                        setReplying(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        textAlign: 'left',
                        width: '100%',
                        padding: '14px 16px',
                        border: 'none',
                        borderBottom: '1px solid #f0eff1',
                        background: '#fff',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: '#1a1620',
                        fontWeight: 500,
                        lineHeight: 1.4,
                      }}
                    >
                      {r.text}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isAnswered && (
            <div style={{ margin: '18px 28px 4px' }}>
              <div
                style={{
                  ...SECTION_LABEL,
                  marginBottom: 9,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <span style={{ color: '#3a8a5a' }}>{'\u21A9'}</span>
                {E.repliedLabel} {'\u00B7'} {fmtDate(entry.receivedAt)}
              </div>
              <div
                style={{
                  background: '#eef3fb',
                  border: '1px solid #dfe9f6',
                  borderRadius: '10px 10px 10px 2px',
                  padding: '12px 16px',
                  fontSize: 14,
                  color: '#1a2a3a',
                  lineHeight: 1.5,
                }}
              >
                {(replies[ansIdx as number] as Reply).text}
              </div>
            </div>
          )}

          <div
            style={{
              padding: '20px 28px 30px',
              fontSize: 14.5,
              lineHeight: 1.72,
              color: '#2c2a30',
              whiteSpace: 'pre-wrap',
            }}
          >
            {m.body}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={ROOT}>
      {/* Folder rail — decorative apart from Inbox's unread badge. */}
      <aside style={SIDEBAR}>
        <span style={COMPOSE}>
          {'\u270E'} {E.compose}
        </span>
        <div style={FOLDERS_HEAD}>{E.folders}</div>
        <div style={FOLDER_ACTIVE}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {'\uD83D\uDCE5'} {E.inboxLabel}
          </span>
          {badge > 0 && (
            <span
              style={{
                background: '#E95420',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 999,
                padding: '1px 7px',
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <div style={FOLDER}>
          {'\u2B50'} {E.starred}
        </div>
        <div style={FOLDER}>
          {'\u27A4'} {E.sent}
        </div>
        <div style={FOLDER}>
          {'\uD83D\uDCDD'} {E.drafts}
        </div>
        <div style={FOLDER}>
          {'\uD83D\uDEAB'} {E.junk}
        </div>
      </aside>

      {/* Inbox list. */}
      <div style={LIST_PANE}>
        <div style={PANE_HEAD}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1620' }}>{E.inboxLabel}</span>
          <span style={{ fontSize: 12.5, color: '#9a979f' }}>
            {'\u2315'} {E.search}
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {visible.length === 0 ? (
            <div
              style={{ padding: '34px 18px', textAlign: 'center', color: '#b3b0b8', fontSize: 13 }}
            >
              {E.noCorrespondence}
            </div>
          ) : (
            visible.map((e) => {
              const m = meta(e.id);
              const unread = e.readAt === null;
              const selected = e.id === current?.id;
              const answered = e.answeredReply != null;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => select(e.id)}
                  style={{
                    display: 'flex',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    padding: '11px 14px 12px',
                    border: 'none',
                    borderBottom: '1px solid #ececec',
                    borderLeft: `3px solid ${selected ? '#E95420' : 'transparent'}`,
                    background: selected ? '#eef3fb' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      flex: '0 0 auto',
                      display: 'flex',
                      justifyContent: 'center',
                      paddingTop: 5,
                    }}
                  >
                    {unread && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#2c7bbe',
                          display: 'block',
                        }}
                      />
                    )}
                  </span>
                  <span
                    style={{
                      flex: '1 1 auto',
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13.5,
                          color: '#1c1c1c',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight: unread ? 700 : 500,
                        }}
                      >
                        {m.from}
                      </span>
                      <span
                        style={{ display: 'flex', alignItems: 'center', gap: 5, flex: '0 0 auto' }}
                      >
                        {answered && (
                          <span style={{ fontSize: 11, color: '#3a8a5a' }}>{'\u21A9'}</span>
                        )}
                        <span style={{ fontSize: 11.5, color: '#9a979f' }}>
                          {fmtTime(e.receivedAt)}
                        </span>
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: 12.5,
                        color: unread ? '#1a1620' : '#56535d',
                        fontWeight: unread ? 600 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.subject}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: '#8d8a92',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {snippet(m.body)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Reading pane. */}
      <div style={READ_PANE}>{current ? renderOpen(current) : renderEmpty()}</div>
    </div>
  );
}
