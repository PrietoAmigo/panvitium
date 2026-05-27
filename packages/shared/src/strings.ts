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
  reprobates: 'Reprobates',
  opera: {
    suasio: 'Suasio',
    decimatio: 'Decimatio',
    suggestion: 'Suggestion',
    caedis: 'Caedis',
    tempt: 'Tempt',
    cull: 'Cull',
    logs: 'Logs',
    emptyLog: 'The terminal log is empty. Nothing has been done.',
    suasioIntro: 'The temptations, written to be spoken. Whisper one and wait.',
    notYet: 'not yet inscribed',
    idle: 'No rite underway.',
  },
  tiers: {
    stellar: 'Stellar',
    excellent: 'Excellent',
    good: 'Good',
    neutral: 'Neutral',
    bad: 'Bad',
    terrible: 'Terrible',
    apocalyptic: 'Apocalyptic',
  },
} as const;

export type Strings = typeof strings;
