/**
 * Player-facing strings, keyed not concatenated (ADR-020). English-only at launch; adding a
 * locale later means populating a sibling module, not refactoring call sites. Latin terms
 * (Opera, Suasio, Katabasis, …) stay untranslated regardless of locale — they are the voice.
 * This grows as the UI lands (step 4); it starts with the few labels the skeleton needs.
 */
export const strings = {
  appName: 'Panvitium',
  resources: {
    souls: 'Souls',
    gold: 'Gold',
    influence: 'Influence',
  },
  rooms: {
    studio: 'Studio',
    altar: 'Altar',
    invocation: 'Invocation Room',
  },
} as const;

export type Strings = typeof strings;
