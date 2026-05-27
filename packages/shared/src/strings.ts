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
    depraedatio: 'Depraedatio',
    indagatio: 'Indagatio',
    emptio: 'Emptio',
    suggestion: 'Suggestion',
    caedis: 'Caedis',
    tempt: 'Tempt',
    cull: 'Cull',
    logs: 'Logs',
    back: 'Back',
    selectLedger: 'select a ledger',
    underway: 'A rite is already underway.',
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
  sins: {
    gula: { prince: 'Beelzebub', latin: 'Gula', english: 'Gluttony' },
    luxuria: { prince: 'Asmodeus', latin: 'Luxuria', english: 'Lust' },
    avaritia: { prince: 'Mammon', latin: 'Avaritia', english: 'Greed' },
    tristitia: { prince: 'Leviathan', latin: 'Tristitia', english: 'Sorrow' },
    ira: { prince: 'Satan', latin: 'Ira', english: 'Wrath' },
    acedia: { prince: 'Belphegor', latin: 'Acedia', english: 'Sloth' },
    vanagloria: { prince: 'Rosier', latin: 'Vanagloria', english: 'Vainglory' },
    superbia: { prince: 'Lucifer', latin: 'Superbia', english: 'Pride' },
  },
  altar: {
    intro:
      'The Devotion owed each Prince, and the rank it buys you. Bound sigils show here once they bite.',
    descend: 'Lay upon the altar — descend',
    sigilsNone: 'No sigils bound.',
  },
  katabasis: {
    title: 'Katabasis',
    intro:
      'You lie still; the soul descends to settle its accounts. Offer what you carry — a single soul or a thousand — then rise.',
    pool: 'Souls in the pool',
    skill: 'Skill',
    offerAll: 'All',
    mastered: 'Mastered',
    confirm: 'Ascend — rise to the world',
    notYet: 'Climb back out',
    sigilsDeferred: 'Sigil binding (the recoverable axis) arrives with the modifier engine.',
    recapTitle: 'You rise',
    soulsCarried: 'Souls carried',
    goldKept: 'Gold remaining',
    reprobatesKept: 'Reprobates still yours',
    maleficiaKept: 'Maleficia retained',
    maleficiaLost: 'Maleficia lost',
    rise: 'Rise',
  },
} as const;

export type Strings = typeof strings;
