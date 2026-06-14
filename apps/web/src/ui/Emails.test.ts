import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createInitialState, type GameState, type ReceivedEmail } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { EmailsGroup } from './Emails.js';

/** Mirrors the Analytics render guard: rendering exercises the selectors + the read-on-display effect,
 *  so a fresh-array-in-selector loop or a setState-in-render would throw during `act`. */
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

function clickButtonWith(text: string): void {
  const btn = Array.from(container!.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`no button containing "${text}"`);
  act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('EmailsGroup (two-pane client)', () => {
  it('shows the empty state with no mail', () => {
    seed([]);
    render();
    expect(container!.textContent).toContain('No correspondence');
    expect(container!.textContent).toContain('No message selected');
  });

  it('auto-opens the newest message and reads its body', () => {
    seed([{ id: 'welcome', receivedAt: 1, readAt: null }]);
    render();
    // Listed (sender + subject) and the reading pane shows the body without a click.
    expect(container!.textContent).toContain('Welcome to the work');
    expect(container!.textContent).toContain('Your terminal is provisioned');
    // Displaying it marked it read in the live state.
    expect(useGameStore.getState().state!.lifetime.inbox[0]!.readAt).not.toBeNull();
  });

  it('deletes the open message and falls back to the next', () => {
    seed([
      { id: 'welcome', receivedAt: 1, readAt: 0 },
      { id: 'class-action', receivedAt: 2, readAt: 0 },
    ]);
    render();
    // Newest (class-action) is selected and open.
    expect(container!.textContent).toContain('NOTICE OF PENDING ACTION');
    clickButtonWith('Delete');
    // It is flagged deleted (kept in state so it can't re-trigger) and hidden; welcome takes over.
    const entry = useGameStore
      .getState()
      .state!.lifetime.inbox.find((e) => e.id === 'class-action')!;
    expect(entry.deleted).toBe(true);
    expect(container!.textContent).not.toContain('NOTICE OF PENDING ACTION');
    expect(container!.textContent).toContain('Welcome to the work');
  });
});
