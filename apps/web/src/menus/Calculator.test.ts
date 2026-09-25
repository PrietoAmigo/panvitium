/**
 * The desk PC's Calculator as rendered: the keypad and display, the keyboard (and when it is the
 * calculator's to take), the memory register's keys, the error line, the history tape, the
 * clipboard, and the session that outlives the program's window. The arithmetic itself is pinned
 * in `calculatorEngine.test.ts`.
 *
 * Expected strings carry the display's own glyphs: × ÷ √ ², and the real minus sign (U+2212, not
 * a hyphen).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CalculatorProgram, resetCalculatorSession } from './Calculator.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(CalculatorProgram)));
}

function unmount(): void {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
}

beforeEach(() => resetCalculatorSession());
afterEach(() => {
  unmount();
  document.body.innerHTML = '';
});

const q = <T extends Element>(selector: string): T | null => container!.querySelector<T>(selector);
const line = (): string => q('.calc-line')?.textContent ?? '';
const sub = (): string => q('.calc-sub')?.textContent ?? '';
const context = (): string => q('.calc-context')?.textContent ?? '';

/** A keypad key by its face (digits) or its spoken name (everything else). */
function key(name: string): HTMLButtonElement {
  const keys = Array.from(container!.querySelectorAll<HTMLButtonElement>('.calc-key'));
  const found = keys.find((k) => (k.getAttribute('aria-label') ?? k.textContent) === name);
  if (!found) throw new Error(`no key ${name}`);
  return found;
}

function click(el: HTMLElement): void {
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function tap(...names: string[]): void {
  for (const name of names) click(key(name));
}

/** A key press on the keyboard, from `target` (the page body by default: nothing focused). */
function press(k: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
  });
}

function type(text: string): void {
  for (const ch of text) press(ch);
}

/** A clipboard event carrying a stand-in `clipboardData` (jsdom has no DataTransfer). */
function clipboard(kind: 'copy' | 'paste', text = ''): { data: string } {
  const store = { data: text };
  const e = new Event(kind, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', {
    value: {
      getData: () => store.data,
      setData: (_type: string, value: string) => {
        store.data = value;
      },
    },
  });
  act(() => {
    document.body.dispatchEvent(e);
  });
  return store;
}

describe('Calculator: the keypad and display', () => {
  it('opens on 0 with the full keypad, labelled for assistive tech', () => {
    mount();
    expect(q('.calc')?.getAttribute('aria-label')).toBe('Calculator');
    expect(container!.querySelectorAll('.calc-key')).toHaveLength(29);
    expect(line()).toBe('0');
    expect(key('Square root').textContent).toBe('√');
    expect(key('Equals').className).toContain('calc-key--equals');
  });

  it('builds the expression key by key with the running result beneath it', () => {
    mount();
    tap('1', '2', 'Add', '7', 'Multiply', '3');
    expect(line()).toBe('12 + 7 × 3');
    expect(sub()).toBe('= 33');
  });

  it('shows the answer on "=", with its calculation above, and puts it on the tape', () => {
    mount();
    tap('1', '2', 'Add', '7', 'Equals');
    expect(line()).toBe('19');
    expect(context()).toBe('12 + 7 =');
    expect(sub()).toBe('');
    const entry = q<HTMLButtonElement>('.calc-tape-item');
    expect(entry?.getAttribute('aria-label')).toBe('12 + 7 = 19');
  });

  it('draws the parentheses still open faintly and closes them at "="', () => {
    mount();
    tap('2', 'Multiply', 'Left parenthesis', '3', 'Add', '4');
    expect(q('.calc-ghost')?.textContent).toBe(')');
    tap('Equals');
    expect(line()).toBe('14');
    expect(q('.calc-ghost')).toBeNull();
  });

  it('reports a failed calculation as an alert and lets the next key fix it', () => {
    mount();
    tap('5', 'Divide', '0', 'Equals');
    expect(q('[role="alert"]')?.textContent).toBe('Division by zero is undefined');
    expect(line()).toBe('5 ÷ 0');
    tap('Backspace', '2', 'Equals');
    expect(q('[role="alert"]')).toBeNull();
    expect(line()).toBe('2.5');
  });
});

describe('Calculator: the memory register', () => {
  it('keeps MC and MR disabled until something is stored, and marks the display', () => {
    mount();
    expect(key('Memory recall').disabled).toBe(true);
    expect(key('Memory clear').disabled).toBe(true);
    expect(q('.calc-mem')).toBeNull();
    tap('4', '2', 'Memory add');
    expect(key('Memory recall').disabled).toBe(false);
    expect(q('.calc-mem')?.getAttribute('title')).toBe('Memory: 42');
    tap('Clear', '8', 'Add', 'Memory recall', 'Equals');
    expect(line()).toBe('50');
    tap('Memory clear');
    expect(q('.calc-mem')).toBeNull();
    expect(key('Memory recall').disabled).toBe(true);
  });
});

describe('Calculator: the keyboard', () => {
  it('types, evaluates with Enter and clears with Escape', () => {
    mount();
    type('(2+3)*4');
    expect(line()).toBe('(2 + 3) × 4');
    press('Enter');
    expect(line()).toBe('20');
    press('Backspace');
    expect(line()).toBe('2');
    press('Escape');
    expect(line()).toBe('0');
  });

  it("takes Windows Calculator's shortcuts: @ for √, q for x², F9 for ±", () => {
    mount();
    type('9@');
    expect(line()).toBe('√9');
    press('Escape');
    type('3q');
    press('F9');
    expect(line()).toBe('−3²');
  });

  it('lights the keypad key the keyboard pressed', () => {
    mount();
    press('7');
    expect(key('7').classList.contains('is-lit')).toBe(true);
    press('+');
    expect(key('7').classList.contains('is-lit')).toBe(false);
    expect(key('Add').classList.contains('is-lit')).toBe(true);
  });

  it('leaves shortcuts with a modifier to the browser', () => {
    mount();
    press('7', { ctrlKey: true });
    press('q', { metaKey: true });
    expect(line()).toBe('0');
  });

  it('ignores keys meant for something focused outside it', () => {
    mount();
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    press('7', {}, elsewhere);
    expect(line()).toBe('0');
  });

  it('lets a key reached with Tab answer Enter itself, rather than "="', () => {
    mount();
    type('2+2');
    press('Enter', {}, key('5'));
    expect(line()).toBe('2 + 2');
  });
});

describe('Calculator: the history tape', () => {
  it('starts empty, lists calculations newest first, and brings one back on a click', () => {
    mount();
    expect(q('.calc-tape-empty')?.textContent).toBe('No calculations yet.');
    type('6*7=');
    type('1+1=');
    const items = Array.from(container!.querySelectorAll('.calc-tape-item'));
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual(['1 + 1 = 2', '6 × 7 = 42']);
    click(items[1] as HTMLElement);
    expect(line()).toBe('42');
    expect(context()).toBe('6 × 7 =');
  });

  it('clears on request', () => {
    mount();
    const clear = q<HTMLButtonElement>('.calc-tape-clear');
    expect(clear?.disabled).toBe(true);
    type('2+2=');
    expect(clear?.disabled).toBe(false);
    click(clear!);
    expect(container!.querySelectorAll('.calc-tape-item')).toHaveLength(0);
    expect(line()).toBe('4');
  });
});

describe('Calculator: the clipboard', () => {
  it('pastes an expression and copies the answer as plain digits', () => {
    mount();
    clipboard('paste', '1,000 × 1,000');
    expect(line()).toBe('1,000 × 1,000');
    press('Enter');
    expect(clipboard('copy').data).toBe('1000000');
  });

  it('ignores a paste it cannot read', () => {
    mount();
    type('7');
    clipboard('paste', '12.5M');
    expect(line()).toBe('7');
  });
});

describe('Calculator: the session', () => {
  it('keeps the sum in progress, the memory and the tape when its window closes', () => {
    mount();
    type('2+2=');
    tap('Memory add');
    type('*3');
    unmount();
    mount();
    expect(line()).toBe('4 × 3');
    expect(q('.calc-mem')).not.toBeNull();
    expect(container!.querySelectorAll('.calc-tape-item')).toHaveLength(1);
  });

  it('starts clean after a reset', () => {
    mount();
    type('2+2=');
    unmount();
    resetCalculatorSession();
    mount();
    expect(line()).toBe('0');
    expect(container!.querySelectorAll('.calc-tape-item')).toHaveLength(0);
  });
});
