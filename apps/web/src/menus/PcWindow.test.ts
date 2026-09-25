import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PcWindow } from './PcWindow.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
});

function render(badges: Record<string, number>): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      createElement(PcWindow, {
        renderProgram: () => createElement('div'),
        onClose: () => undefined,
        badges,
      }),
    ),
  );
}

describe('PcWindow tile badges', () => {
  it('shows an unread count badge on a program tile', () => {
    render({ Emails: 3 });
    expect(container!.querySelector('.pc-file-badge')?.textContent).toBe('3');
  });

  it('shows no badge when the count is zero', () => {
    render({ Emails: 0 });
    expect(container!.querySelector('.pc-file-badge')).toBeNull();
  });
});

describe('PcWindow Calculator tile', () => {
  function tile(name: string): HTMLButtonElement | undefined {
    return Array.from(container!.querySelectorAll<HTMLButtonElement>('.pc-file')).find(
      (b) => b.querySelector('.pc-file-name')?.textContent === name,
    );
  }

  it('lists the Calculator last, its face a grid of signs hidden from its name', () => {
    render({});
    const names = Array.from(container!.querySelectorAll('.pc-file-name')).map(
      (n) => n.textContent,
    );
    expect(names.at(-1)).toBe('Calculator');
    const grid = tile('Calculator')?.querySelector('.pc-file-glyph-grid');
    expect(grid?.getAttribute('aria-hidden')).toBe('true');
    expect(Array.from(grid?.children ?? []).map((c) => c.textContent)).toEqual([
      '+',
      '\u2212',
      '×',
      '=',
    ]);
  });

  it('runs the Calculator full-bleed, without the titled card', () => {
    render({});
    act(() => tile('Calculator')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container!.querySelector('.pc-app--fullbleed')).not.toBeNull();
    expect(container!.querySelector('.pc-app-card')).toBeNull();
    expect(container!.querySelector('.pc-location')?.textContent).toBe('Calculator');
  });
});
