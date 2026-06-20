import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';

/**
 * The result the integrator returns from `onDial`, keeping all mechanics in the sim. The dialer maps
 * `kind` to the toast dot colour and to whether the field clears (`boon`) or is kept (`info`/`error`).
 */
export interface DialResult {
  kind: 'boon' | 'info' | 'error';
  message: string;
}

export interface SmartphoneDialerProps {
  /** Dismiss the overlay. */
  onClose: () => void;
  /** Submit the trimmed code to the sim; the returned result drives the toast. */
  onDial: (code: string) => DialResult;
  /** Call button / caret / "Add to contacts" accent. Default AOSP green. */
  accentColor?: string;
  /** Show the `ABC/DEF/…` sub-letters under the digits. Default true. */
  showKeyLetters?: boolean;
}

/** Toast dot colour by result kind (design tokens). */
const DOT: Record<DialResult['kind'], string> = {
  boon: '#3ddc84',
  info: '#8ab4f8',
  error: '#ff5a52',
};

/** The 12 keys (`1 2 3 / 4 5 6 / 7 8 9 / * 0 #`) with their sub-letters. */
const KEYS: ReadonlyArray<{ d: string; l: string }> = [
  { d: '1', l: '' },
  { d: '2', l: 'ABC' },
  { d: '3', l: 'DEF' },
  { d: '4', l: 'GHI' },
  { d: '5', l: 'JKL' },
  { d: '6', l: 'MNO' },
  { d: '7', l: 'PQRS' },
  { d: '8', l: 'TUV' },
  { d: '9', l: 'WXYZ' },
  { d: '*', l: '' },
  { d: '0', l: '+' },
  { d: '#', l: '' },
] as const;

const MAX_LEN = 18;
const TOAST_MS = 2800;

// The status-bar clock shows the real device time, formatted exactly as the Emails client's stamp
// (`Intl.DateTimeFormat`, `hour: 'numeric'`, `minute: '2-digit'`) so the two read identically.
const fmtClock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The smartphone dialer (Claude Design handoff, Direction A — "Stock light"). A full-screen overlay
 * that renders its OWN shell (it is not a `PanelShell` framed panel): the player keys a code into a
 * stock-Android number pad and presses call to submit it. Purely presentational — the only state it
 * owns is the in-progress `code` and the transient `toast`; the sim validates the code via `onDial`
 * and hands back the result this renders.
 */
export function SmartphoneDialer({
  onClose,
  onDial,
  accentColor = '#1a9e4b',
  showKeyLetters = true,
}: SmartphoneDialerProps): ReactElement {
  const [code, setCode] = useState('');
  const [toast, setToast] = useState<{ text: string; dot: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One toast at a time: a new result replaces the current and resets the dismiss timer.
  const showToast = (text: string, dot: string): void => {
    setToast({ text, dot });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const press = (d: string): void => setCode((c) => (c + d).slice(0, MAX_LEN));
  const backspace = (): void => setCode((c) => c.slice(0, -1));
  const dial = (): void => {
    const c = code.trim();
    if (!c) return;
    const result = onDial(c);
    showToast(result.message, DOT[result.kind]);
    if (result.kind === 'boon') setCode('');
  };

  const hasCode = code.length > 0;
  const shadow = 'rgba(0,0,0,.28)';
  // Computed per render (the dialer re-renders on every keypress/toast, so the clock stays current).
  const clock = fmtClock.format(new Date());

  return (
    <div className="panel-overlay" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-label="Phone"
        className="phone-device"
        onClick={(e) => e.stopPropagation()}
        style={DEVICE}
      >
        <div style={SPEAKER} aria-hidden="true" />
        <div style={CAMERA} aria-hidden="true" />

        <div style={SCREEN}>
          {/* status bar — flavour */}
          <div style={STATUS_BAR}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>GSM</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={SVG_BLOCK}>
                <path d="M19.59 7L12 14.59 6.41 9H11V7H3v8h2v-4.59l7 7 9-9z" />
              </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={SVG_BLOCK}>
                <path d="M2 22h20V2L2 22z" />
              </svg>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={SVG_BLOCK}>
                <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C17.93 9.93 12.06 9.93 6 13z" />
              </svg>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={SVG_BLOCK}>
                <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z" />
              </svg>
              <span className="phone-clock" style={{ fontWeight: 500 }}>
                {clock}
              </span>
            </div>
          </div>

          {/* dialer body */}
          <div style={BODY}>
            {/* display */}
            <div style={DISPLAY}>
              <div style={DISPLAY_CODE}>
                <span className="phone-code" style={{ whiteSpace: 'nowrap' }}>
                  {code}
                </span>
                <span style={{ ...CARET, background: accentColor }} aria-hidden="true" />
              </div>
              {hasCode && (
                <button
                  type="button"
                  className="phone-backspace"
                  aria-label="Backspace"
                  onClick={backspace}
                  style={BACKSPACE}
                >
                  <svg width="25" height="25" viewBox="0 0 24 24" fill="#80868b" style={SVG_BLOCK}>
                    <path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z" />
                  </svg>
                </button>
              )}
            </div>

            {/* add-to-contacts (decorative) */}
            <div style={{ height: 22, textAlign: 'center' }}>
              {hasCode && (
                <span style={{ ...ADD_CONTACTS, color: accentColor }}>Add to contacts</span>
              )}
            </div>

            <div style={DIVIDER} />

            {/* keypad */}
            <div style={KEYPAD}>
              {KEYS.map((k) => (
                <button
                  type="button"
                  key={k.d}
                  className="phone-key"
                  aria-label={`Key ${k.d}`}
                  onClick={() => press(k.d)}
                  style={KEY}
                >
                  <span style={KEY_DIGIT}>{k.d}</span>
                  <span style={KEY_LETTERS}>{showKeyLetters ? k.l : ''}</span>
                </button>
              ))}
            </div>

            <div style={{ flex: 1, minHeight: 8 }} />

            {/* call / submit */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 14px' }}>
              <button
                type="button"
                className="phone-call"
                aria-label="Call"
                onClick={dial}
                style={{ ...CALL, background: accentColor, boxShadow: `0 5px 14px ${shadow}` }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#ffffff" style={SVG_BLOCK}>
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* nav bar (decorative Lollipop glyphs) */}
          <div style={NAV_BAR} aria-hidden="true">
            <div style={NAV_BACK} />
            <div style={NAV_HOME} />
            <div style={NAV_RECENTS} />
          </div>

          {/* toast */}
          {toast && (
            <div className="phone-toast" style={TOAST} role="status">
              <span className="phone-toast-dot" style={{ ...TOAST_DOT, background: toast.dot }} />
              <span>{toast.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline style tokens (exact, from the design spec) ───────────────────────────────────────────

const SVG_BLOCK: CSSProperties = { display: 'block' };

const DEVICE: CSSProperties = {
  width: 364,
  background: '#0b0b0d',
  borderRadius: 36,
  padding: '32px 12px 28px',
  position: 'relative',
  boxShadow: '0 26px 60px rgba(0,0,0,.5), 0 4px 12px rgba(0,0,0,.4)',
  fontFamily: "'Roboto', system-ui, sans-serif",
};

const SPEAKER: CSSProperties = {
  position: 'absolute',
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 54,
  height: 5,
  borderRadius: 3,
  background: '#26262b',
};

const CAMERA: CSSProperties = {
  position: 'absolute',
  top: 14,
  left: 'calc(50% + 44px)',
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: '#1c1c20',
  border: '1px solid #333',
};

const SCREEN: CSSProperties = {
  width: 340,
  height: 680,
  background: '#ffffff',
  borderRadius: 7,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
};

const STATUS_BAR: CSSProperties = {
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 13px',
  background: '#f1f3f4',
  color: '#5f6368',
  fontSize: 11,
  flex: 'none',
};

const BODY: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 8,
  minHeight: 0,
};

const DISPLAY: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 74,
  padding: '16px 50px 6px',
};

const DISPLAY_CODE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontSize: 33,
  fontWeight: 400,
  letterSpacing: 2,
  color: '#202124',
  maxWidth: '100%',
  overflow: 'hidden',
};

const CARET: CSSProperties = {
  width: 2,
  height: 34,
  marginLeft: 2,
  animation: 'pv-caret 1.1s step-end infinite',
  flex: 'none',
};

const BACKSPACE: CSSProperties = {
  position: 'absolute',
  right: 22,
  padding: 6,
  cursor: 'pointer',
  borderRadius: '50%',
  border: 'none',
  background: 'transparent',
  lineHeight: 0,
};

const ADD_CONTACTS: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: '.02em',
};

const DIVIDER: CSSProperties = { height: 1, background: '#eceef0', margin: '6px 24px 0' };

const KEYPAD: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  columnGap: 6,
  rowGap: 2,
  padding: '12px 26px 0',
};

const KEY: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: 60,
  borderRadius: 30,
  cursor: 'pointer',
  userSelect: 'none',
  border: 'none',
  background: 'transparent',
  padding: 0,
  fontFamily: 'inherit',
};

const KEY_DIGIT: CSSProperties = { fontSize: 27, fontWeight: 400, color: '#202124', lineHeight: 1 };

const KEY_LETTERS: CSSProperties = {
  fontSize: 8.5,
  fontWeight: 700,
  letterSpacing: 1.5,
  color: '#9aa0a6',
  height: 11,
  lineHeight: '11px',
};

const CALL: CSSProperties = {
  width: 62,
  height: 62,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  padding: 0,
};

const NAV_BAR: CSSProperties = {
  height: 44,
  background: '#f1f3f4',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-around',
  flex: 'none',
};

const NAV_BACK: CSSProperties = {
  width: 0,
  height: 0,
  borderTop: '7px solid transparent',
  borderBottom: '7px solid transparent',
  borderRight: '11px solid #80868b',
};

const NAV_HOME: CSSProperties = {
  width: 13,
  height: 13,
  border: '1.6px solid #80868b',
  borderRadius: '50%',
};

const NAV_RECENTS: CSSProperties = {
  width: 12,
  height: 12,
  border: '1.6px solid #80868b',
  borderRadius: 2,
};

const TOAST: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 66,
  transform: 'translateX(-50%)',
  background: '#323232',
  color: '#f5f5f5',
  fontSize: 12.5,
  lineHeight: 1.35,
  padding: '10px 16px',
  borderRadius: 22,
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  maxWidth: '80%',
  boxShadow: '0 4px 16px rgba(0,0,0,.35)',
  animation: 'pv-toast-in .18s ease-out',
};

const TOAST_DOT: CSSProperties = { width: 7, height: 7, borderRadius: '50%', flex: 'none' };
