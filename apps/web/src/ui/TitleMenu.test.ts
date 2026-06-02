import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import { TitleMenu } from './TitleMenu.js';
import { useGameStore } from '../store/gameStore.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ titleOpen: true, settingsOpen: false });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
});

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(TitleMenu)));
}

function click(label: string): void {
  const btn = [...container!.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!btn) throw new Error(`button not found: ${label}`);
  act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

const m = strings.menu;

describe('TitleMenu', () => {
  it('shows the wordmark, tagline, and four entries', () => {
    render();
    expect(container!.querySelector('.title-wordmark')?.textContent).toBe(strings.appName);
    expect(container!.textContent).toContain(m.tagline);
    for (const label of [m.continue, m.newGame, m.settings, m.about]) {
      expect(container!.textContent).toContain(label);
    }
  });

  it('Continue dismisses the title (unfreezing the sim)', () => {
    render();
    click(m.continue);
    expect(useGameStore.getState().titleOpen).toBe(false);
    expect(container!.querySelector('.title-menu')).toBeNull();
  });

  it('Settings opens the settings overlay via the store', () => {
    render();
    click(m.settings);
    expect(useGameStore.getState().settingsOpen).toBe(true);
  });

  it('New Game asks to confirm, then wipes and dismisses', () => {
    render();
    click(m.newGame);
    expect(container!.textContent).toContain(m.newGamePrompt);
    click(m.newGameConfirm);
    expect(useGameStore.getState().titleOpen).toBe(false);
  });

  it('About shows the blurb and can return to the entries', () => {
    render();
    click(m.about);
    expect(container!.textContent).toContain('idle descent into damnation');
    click(m.back);
    expect(container!.textContent).toContain(m.continue);
  });
});
