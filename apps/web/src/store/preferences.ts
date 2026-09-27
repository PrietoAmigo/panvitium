/**
 * Device-local player preferences: the Settings overlay's switches. They are kept apart from the
 * save because they are not game state: they never enter the SaveBlob, so cloud sync, an export or
 * import, and a hard reset all leave them as the player set them on this device. Reading never
 * throws (a missing, corrupt or blocked store yields the defaults, field by field), and a write
 * that fails still leaves the choice in force for the session.
 */

const PREFS_KEY = 'panvitium:prefs';

export interface Preferences {
  /** Play the Unveiling pop-up when Emptio brings a maleficium home. */
  readonly showUnveiling: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { showUnveiling: true };

/** Read this device's preferences; anything absent or of the wrong type takes its default. */
export function loadPreferences(): Preferences {
  let stored: unknown;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw === null) return DEFAULT_PREFERENCES;
    stored = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFERENCES;
  }
  if (typeof stored !== 'object' || stored === null) return DEFAULT_PREFERENCES;
  const { showUnveiling } = stored as { showUnveiling?: unknown };
  return {
    showUnveiling:
      typeof showUnveiling === 'boolean' ? showUnveiling : DEFAULT_PREFERENCES.showUnveiling,
  };
}

/** Store this device's preferences (best effort: a full or blocked store is ignored). */
export function savePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // The choice still holds in memory for this session.
  }
}
