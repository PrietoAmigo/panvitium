import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react';
import { strings } from '@panvitium/shared';
import {
  INITIAL_CALCULATOR,
  calculatorReducer,
  copyText,
  formatValue,
  keyFromKeyboard,
  mainLine,
  openCount,
  preview,
  type CalcKey,
  type CalculatorAction,
  type CalculatorState,
  type HistoryEntry,
} from './calculatorEngine.js';

const S = strings.calculator;
const KEY_NAMES: Partial<Record<CalcKey, string>> = S.keys;

type Tone = 'digit' | 'op' | 'fn' | 'mem' | 'equals';

interface PadKey {
  readonly key: CalcKey;
  readonly face: string;
  readonly tone: Tone;
  /** The keyboard key that presses it too, named in its tooltip where it is not obvious. */
  readonly shortcut?: string;
}

/**
 * The keypad: GNOME Calculator's basic grid (the Ubuntu desktop's own calculator) under a row for
 * the memory register, ± and EXP. Six columns; "=" spans the last two.
 */
const PAD: readonly PadKey[] = [
  { key: 'mc', face: 'MC', tone: 'mem' },
  { key: 'mr', face: 'MR', tone: 'mem' },
  { key: 'mplus', face: 'M+', tone: 'mem' },
  { key: 'mminus', face: 'M\u2212', tone: 'mem' },
  { key: 'negate', face: '±', tone: 'fn', shortcut: 'F9' },
  { key: 'exp', face: 'EXP', tone: 'fn', shortcut: 'E' },
  { key: '7', face: '7', tone: 'digit' },
  { key: '8', face: '8', tone: 'digit' },
  { key: '9', face: '9', tone: 'digit' },
  { key: 'divide', face: '÷', tone: 'op', shortcut: '/' },
  { key: 'backspace', face: '', tone: 'fn', shortcut: 'Backspace' },
  { key: 'clear', face: 'C', tone: 'fn', shortcut: 'Esc' },
  { key: '4', face: '4', tone: 'digit' },
  { key: '5', face: '5', tone: 'digit' },
  { key: '6', face: '6', tone: 'digit' },
  { key: 'multiply', face: '×', tone: 'op', shortcut: '*' },
  { key: 'open', face: '(', tone: 'fn' },
  { key: 'close', face: ')', tone: 'fn' },
  { key: '1', face: '1', tone: 'digit' },
  { key: '2', face: '2', tone: 'digit' },
  { key: '3', face: '3', tone: 'digit' },
  { key: 'subtract', face: '\u2212', tone: 'op', shortcut: '-' },
  { key: 'square', face: 'x²', tone: 'fn', shortcut: 'Q' },
  { key: 'sqrt', face: '√', tone: 'fn', shortcut: '@' },
  { key: '0', face: '0', tone: 'digit' },
  { key: 'point', face: '.', tone: 'digit' },
  { key: 'percent', face: '%', tone: 'fn' },
  { key: 'add', face: '+', tone: 'op' },
  { key: 'equals', face: '=', tone: 'equals', shortcut: 'Enter' },
];

/** How long a key pressed on the keyboard stays lit on the keypad (ms). */
const LIGHT_MS = 140;

/** The key the keyboard last pressed, lit briefly on the keypad as a desktop calculator does. */
function useKeyLight(): readonly [CalcKey | null, (key: CalcKey) => void] {
  const [lit, setLit] = useState<CalcKey | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const light = useCallback((key: CalcKey) => {
    setLit(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLit(null), LIGHT_MS);
  }, []);
  return [lit, light];
}

/**
 * Whether a key or clipboard event belongs to the calculator: focus is inside it, or nowhere in
 * particular (the page body). Focus on the PC's own titlebar, or on anything laid over the PC,
 * keeps its keys.
 */
function ownsInput(root: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return true;
  return target === document.body || target === document.documentElement || root.contains(target);
}

/**
 * A mouse press leaves the focus where it was (on the calculator itself), so a clicked key holds
 * no focus ring while the keyboard types on, and a later Enter means "=" rather than that key.
 * Keys reached with Tab still take focus and answer Enter and Space as buttons do.
 */
const keepFocus = (e: ReactMouseEvent<HTMLButtonElement>): void => e.preventDefault();

function BackspaceIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z" />
    </svg>
  );
}

function TrashIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z" />
    </svg>
  );
}

/** The tape of past calculations, newest first. A click puts one back to use. */
function Tape({
  history,
  dispatch,
}: {
  history: readonly HistoryEntry[];
  dispatch: (action: CalculatorAction) => void;
}): ReactElement {
  return (
    <aside className="calc-tape" aria-label={S.history}>
      <div className="calc-tape-head">
        <span className="calc-tape-title">{S.history}</span>
        <button
          type="button"
          className="calc-tape-clear"
          aria-label={S.clearHistory}
          title={S.clearHistory}
          disabled={history.length === 0}
          onMouseDown={keepFocus}
          onClick={() => dispatch({ type: 'clearHistory' })}
        >
          <TrashIcon />
        </button>
      </div>
      {history.length === 0 ? (
        <p className="calc-tape-empty">{S.emptyHistory}</p>
      ) : (
        <ol className="calc-tape-list">
          {history.map((h) => {
            const value = formatValue(h.value);
            return (
              <li key={h.id}>
                <button
                  type="button"
                  className="calc-tape-item"
                  aria-label={`${h.expression} = ${value}`}
                  title={S.useResult}
                  onMouseDown={keepFocus}
                  onClick={() => dispatch({ type: 'recall', id: h.id })}
                >
                  <span className="calc-tape-expr">{h.expression} =</span>
                  <span className="calc-tape-value">{value}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

export interface CalculatorProps {
  readonly state: CalculatorState;
  readonly dispatch: (action: CalculatorAction) => void;
}

/**
 * The desk PC's Calculator: a full-bleed program (it fills the PC window's program area and
 * supplies its own surface). The display shows the expression as it is typed, with a live result
 * beneath it and any parenthesis still open drawn faintly; after "=", the answer, with the
 * calculation above it. The keyboard drives it too (digits, operators, Enter, Backspace, Esc, and
 * Windows Calculator's shortcuts), and Ctrl+C / Ctrl+V copy the answer and paste an expression.
 * Controlled: the engine (`calculatorEngine.ts`) owns every rule.
 */
export function Calculator({ state, dispatch }: CalculatorProps): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLOutputElement>(null);
  const [lit, light] = useKeyLight();

  // The clipboard handlers are bound once; they read the state as it is when they fire.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  // The keyboard drives the calculator from the moment it opens.
  useEffect(() => root.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = root.current;
      if (!el || e.ctrlKey || e.metaKey || e.altKey || !ownsInput(el, e.target)) return;
      // A control reached with Tab answers Enter itself (a key presses, a tape entry recalls).
      if (e.key === 'Enter' && e.target instanceof HTMLButtonElement) return;
      const key = keyFromKeyboard(e.key);
      if (key === null) return;
      e.preventDefault();
      dispatch({ type: 'key', key });
      light(key);
    };
    const onCopy = (e: ClipboardEvent): void => {
      const el = root.current;
      if (!el || !e.clipboardData || !ownsInput(el, e.target)) return;
      if ((window.getSelection()?.toString() ?? '') !== '') return; // a selection copies itself
      e.clipboardData.setData('text/plain', copyText(latest.current));
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent): void => {
      const el = root.current;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!el || text === '' || !ownsInput(el, e.target)) return;
      e.preventDefault();
      dispatch({ type: 'paste', text });
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [dispatch, light]);

  const text = mainLine(state);
  const ghosts = state.fresh ? 0 : openCount(state.tokens);
  const running = preview(state);

  // A long expression keeps its newest end in view (it scrolls; its type shrinks first).
  useLayoutEffect(() => {
    const el = line.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [text, ghosts]);

  const fit = { '--calc-len': text.length + ghosts } as CSSProperties;

  return (
    <div ref={root} className="calc" tabIndex={-1} role="group" aria-label={S.title}>
      <div className="calc-main">
        <div className="calc-display">
          <div className="calc-display-top">
            {state.memory === null ? (
              <span />
            ) : (
              <span className="calc-mem" title={`${S.memory}: ${formatValue(state.memory)}`}>
                M
              </span>
            )}
            <span className="calc-context" title={state.context || undefined}>
              {state.context === '' ? '' : `${state.context} =`}
            </span>
          </div>
          <output ref={line} className="calc-line" style={fit}>
            <span className="calc-line-text">
              {text}
              {ghosts > 0 && (
                <span className="calc-ghost" aria-hidden="true">
                  {')'.repeat(ghosts)}
                </span>
              )}
            </span>
          </output>
          {state.error === null ? (
            <div className="calc-sub">{running === null ? '' : `= ${formatValue(running)}`}</div>
          ) : (
            <div className="calc-sub calc-sub--error" role="alert">
              {S.errors[state.error]}
            </div>
          )}
        </div>
        <div className="calc-keys" role="group" aria-label={S.keypad}>
          {PAD.map((k) => {
            const name = KEY_NAMES[k.key];
            return (
              <button
                key={k.key}
                type="button"
                className={`calc-key calc-key--${k.tone}${lit === k.key ? ' is-lit' : ''}`}
                aria-label={name}
                title={name !== undefined && k.shortcut ? `${name} (${k.shortcut})` : name}
                disabled={(k.key === 'mc' || k.key === 'mr') && state.memory === null}
                onMouseDown={keepFocus}
                onClick={() => dispatch({ type: 'key', key: k.key })}
              >
                {k.key === 'backspace' ? <BackspaceIcon /> : k.face}
              </button>
            );
          })}
        </div>
      </div>
      <Tape history={state.history} dispatch={dispatch} />
    </div>
  );
}

/**
 * The calculator keeps running while the player is away from it, as a desktop app left open
 * does: the sum in progress, the memory and the tape survive stepping back to Files or leaving
 * the desk, for as long as the page lives. A reload is a reboot.
 */
let session: CalculatorState = INITIAL_CALCULATOR;

/** The Calculator as the PC runs it, bound to the page session (see `session`). */
export function CalculatorProgram(): ReactElement {
  const [state, dispatch] = useReducer(calculatorReducer, session);
  useEffect(() => {
    session = state;
  }, [state]);
  return <Calculator state={state} dispatch={dispatch} />;
}

/** Forget the session, as a reboot would (tests start from a clean calculator). */
export function resetCalculatorSession(): void {
  session = INITIAL_CALCULATOR;
}
