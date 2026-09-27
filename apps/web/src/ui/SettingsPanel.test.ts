/**
 * The Settings overlay's pop-up switch: the Unveiling is on by default, and unticking the box turns
 * it off for this device (remembered in localStorage), ticking it brings it back.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import { SettingsPanel } from './SettingsPanel.js';
import { useGameStore } from '../store/gameStore.js';
import { DEFAULT_PREFERENCES } from '../store/preferences.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ settingsOpen: true, preferences: DEFAULT_PREFERENCES });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
  useGameStore.setState({ settingsOpen: false, preferences: DEFAULT_PREFERENCES });
  localStorage.clear();
});

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(SettingsPanel)));
}

const s = strings.settings;

/** The Unveiling's checkbox, found by its visible label. */
function unveilingSwitch(): HTMLInputElement {
  const label = [...container!.querySelectorAll('label')].find(
    (l) => l.textContent?.trim() === s.showUnveiling,
  );
  const input = label?.querySelector('input[type="checkbox"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('Unveiling switch not found');
  return input;
}

describe('Settings — the Unveiling switch', () => {
  it('sits under Pop-ups with its hint, ticked by default', () => {
    render();
    const dialog = container!.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(s.popupsTitle);
    expect(dialog?.textContent).toContain(s.unveilingHint);
    expect(unveilingSwitch().checked).toBe(true);
  });

  it('unticked, turns the Unveiling off on this device; ticked, brings it back', () => {
    render();
    act(() => unveilingSwitch().click());
    expect(unveilingSwitch().checked).toBe(false);
    expect(useGameStore.getState().preferences.showUnveiling).toBe(false);
    expect(JSON.parse(localStorage.getItem('panvitium:prefs') ?? 'null')).toEqual({
      showUnveiling: false,
    });

    act(() => unveilingSwitch().click());
    expect(unveilingSwitch().checked).toBe(true);
    expect(useGameStore.getState().preferences.showUnveiling).toBe(true);
  });

  it('reflects a choice already made on this device', () => {
    useGameStore.setState({ preferences: { showUnveiling: false } });
    render();
    expect(unveilingSwitch().checked).toBe(false);
  });
});
