import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createInitialState, type GameState, type ReceivedEmail } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { EmailsGroup } from './Emails.js';

/** Mirrors the Analytics render guard: rendering exercises the selectors, so a fresh-array-in-selector
 *  loop or a setState-in-render would throw during `act`. */
function seed(inbox: ReceivedEmail[]): void {
  const base = createInitialState('seed', 0);
  const state: GameState = { ...base, lifetime: { ...base.lifetime, inbox } };
  useGameStore.setState({ state });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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
  act(() => root!.render(createElement(EmailsGroup)));
}

describe('EmailsGroup', () => {
  it('shows the empty state with no mail', () => {
    seed([]);
    render();
    expect(container!.textContent).toContain('No correspondence');
  });

  it('lists delivered mail and opens one to read its body', () => {
    seed([{ id: 'welcome', receivedAt: 1, readAt: null }]);
    render();
    expect(container!.textContent).toContain('Welcome to the work');
    const item = container!.querySelector('.emails-item') as HTMLButtonElement;
    act(() => item.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container!.textContent).toContain('Your terminal is provisioned');
  });
});
