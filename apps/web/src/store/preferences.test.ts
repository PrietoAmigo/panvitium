/**
 * The device-local preferences (the Settings switches): defaults when nothing is stored, a saved
 * choice read back, every malformed or mistyped entry falling back to its default, and a blocked
 * store never throwing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from './preferences.js';

const KEY = 'panvitium:prefs';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('preferences', () => {
  it('shows the Unveiling by default', () => {
    expect(DEFAULT_PREFERENCES.showUnveiling).toBe(true);
    expect(loadPreferences()).toEqual({ showUnveiling: true });
  });

  it('reads back a saved choice', () => {
    savePreferences({ showUnveiling: false });
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ showUnveiling: false });
    expect(loadPreferences()).toEqual({ showUnveiling: false });
    savePreferences({ showUnveiling: true });
    expect(loadPreferences()).toEqual({ showUnveiling: true });
  });

  it('falls back to the defaults for anything it cannot read', () => {
    for (const raw of ['{not json', 'null', '42', '"off"', '[]', '{}', '{"showUnveiling":"no"}']) {
      localStorage.setItem(KEY, raw);
      expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    }
  });

  it('keeps a known switch beside fields it does not know', () => {
    localStorage.setItem(KEY, JSON.stringify({ showUnveiling: false, volume: 0.4 }));
    expect(loadPreferences()).toEqual({ showUnveiling: false });
  });

  it('never throws when the store is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(() => savePreferences({ showUnveiling: false })).not.toThrow();
  });
});
