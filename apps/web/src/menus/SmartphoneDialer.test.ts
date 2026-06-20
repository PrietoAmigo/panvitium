/**
 * Render + interaction tests for the smartphone dialer (Claude Design, Direction A). These pin the
 * presentational contract: a labelled dialog with the 12-key pad, typing/backspace edit the local
 * code (capped at 18), submitting routes the trimmed code through `onDial` and renders the returned
 * result as a coloured toast — green/boon clears the field, blue/info and red/error keep it — and the
 * overlay closes while the device body does not. The valid-code SET + effects live in the sim suite.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SmartphoneDialer, type DialResult } from './SmartphoneDialer.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

interface Spy<A extends unknown[], R> {
  calls: A[];
  fn: (...a: A) => R;
}
function spy<A extends unknown[], R>(impl: (...a: A) => R): Spy<A, R> {
  const s: Spy<A, R> = { calls: [], fn: (...a: A) => impl(...a) };
  s.fn = (...a: A) => {
    s.calls.push(a);
    return impl(...a);
  };
  return s;
}

function render(props: { onDial: (code: string) => DialResult; onClose: () => void }): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(SmartphoneDialer, props));
  });
}

function key(d: string): HTMLButtonElement {
  return container!.querySelector(`[aria-label="Key ${d}"]`) as HTMLButtonElement;
}
function codeText(): string {
  return container!.querySelector('.phone-code')?.textContent ?? '';
}
function dot(): string {
  return (
    (container!.querySelector('.phone-toast-dot') as HTMLElement | null)?.style.background ?? ''
  );
}
// jsdom normalises a hex background to `rgb(r, g, b)`; compare against that form.
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

const noResult = (): DialResult => ({ kind: 'error', message: 'Number does not exist' });

describe('smartphone dialer', () => {
  it('renders a Phone dialog with the full 12-key pad', () => {
    render({ onDial: noResult, onClose: () => {} });
    const dialog = container!.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('Phone');
    expect(container!.querySelectorAll('.phone-key').length).toBe(12);
    for (const d of ['1', '2', '9', '*', '0', '#']) expect(key(d)).not.toBeNull();
  });

  it('shows the real device time in the status bar, formatted like the Emails clock', () => {
    render({ onDial: noResult, onClose: () => {} });
    const expected = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date());
    expect(container!.querySelector('.phone-clock')?.textContent).toBe(expected);
  });

  it('appends keypresses and removes the last char on backspace', () => {
    render({ onDial: noResult, onClose: () => {} });
    // No backspace button while the field is empty.
    expect(container!.querySelector('[aria-label="Backspace"]')).toBeNull();
    act(() => key('1').click());
    act(() => key('4').click());
    act(() => key('#').click());
    expect(codeText()).toBe('14#');
    const back = container!.querySelector('[aria-label="Backspace"]') as HTMLButtonElement;
    act(() => back.click());
    expect(codeText()).toBe('14');
  });

  it('caps the entered code at 18 characters', () => {
    render({ onDial: noResult, onClose: () => {} });
    act(() => {
      for (let i = 0; i < 25; i++) key('0').click();
    });
    expect(codeText().length).toBe(18);
  });

  it('does nothing when call is pressed on an empty field', () => {
    const dialed = spy<[string], DialResult>(noResult);
    render({ onDial: dialed.fn, onClose: () => {} });
    act(() => (container!.querySelector('[aria-label="Call"]') as HTMLButtonElement).click());
    expect(dialed.calls.length).toBe(0);
    expect(container!.querySelector('.phone-toast')).toBeNull();
  });

  it('submits a boon code: green toast, field cleared', () => {
    const dialed = spy<[string], DialResult>(() => ({ kind: 'boon', message: 'Code accepted' }));
    render({ onDial: dialed.fn, onClose: () => {} });
    act(() => key('1').click());
    act(() => (container!.querySelector('[aria-label="Call"]') as HTMLButtonElement).click());
    expect(dialed.calls).toEqual([['1']]);
    expect(container!.querySelector('.phone-toast')?.textContent).toContain('Code accepted');
    expect(dot()).toBe(rgb('#3ddc84'));
    expect(codeText()).toBe(''); // boon clears the field
  });

  it('submits an info code: blue toast, field kept', () => {
    const dialed = spy<[string], DialResult>(() => ({ kind: 'info', message: 'IMEI 123' }));
    render({ onDial: dialed.fn, onClose: () => {} });
    act(() => key('6').click());
    act(() => (container!.querySelector('[aria-label="Call"]') as HTMLButtonElement).click());
    expect(dot()).toBe(rgb('#8ab4f8'));
    expect(codeText()).toBe('6'); // info keeps the field
  });

  it('submits an invalid code: red toast, field kept for editing', () => {
    const dialed = spy<[string], DialResult>(noResult);
    render({ onDial: dialed.fn, onClose: () => {} });
    act(() => key('7').click());
    act(() => (container!.querySelector('[aria-label="Call"]') as HTMLButtonElement).click());
    expect(container!.querySelector('.phone-toast')?.textContent).toContain(
      'Number does not exist',
    );
    expect(dot()).toBe(rgb('#ff5a52'));
    expect(codeText()).toBe('7'); // error keeps the field
  });

  it('dismisses on the overlay but not on the device body', () => {
    const close = spy<[], void>(() => {});
    render({ onDial: noResult, onClose: close.fn });
    const device = container!.querySelector('.phone-device') as HTMLElement;
    act(() => device.click());
    expect(close.calls.length).toBe(0);
    const overlay = container!.querySelector('.panel-overlay') as HTMLElement;
    act(() => overlay.click());
    expect(close.calls.length).toBe(1);
  });
});
