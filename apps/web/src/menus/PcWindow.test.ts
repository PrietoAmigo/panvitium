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
