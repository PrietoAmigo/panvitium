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
    search: 'Search',
    buy: 'Buy',
    indagatioIntro:
      'A long, patient search of the world\u2019s corners. Most of what is found cannot be picked up — only listed for purchase.',
    emptioIntro: 'What the search surfaced, ready to be bought. The deal itself can still sour.',
    emptioEmpty: 'The market shows nothing. Indagatio surfaces what can be bought.',
    indagatioCta: 'Begin the search',
    depraedatioIntro:
      'Sin-themed enterprises. Each pays out in gold and grooms its own reprobate subtype while it stands. Builds run independently of the Studio rite.',
    depraedatioEmpty:
      'No business yet stands. Reach Level 1 of a Sin to break ground on its trade.',
    build: 'Build',
    shutdown: 'Shutdown',
    owned: 'owned',
    inFlight: 'in flight',
    sinLocked: 'Locked',
  },
  /**
   * Display names for Vitium Mercatura businesses (03 §2.3). Latin/Latinate where it suits the
   * voice; flavorful where a plain trade name lands better. Keyed by business id so the catalog
   * stays the source of truth for numbers while strings stay translatable.
   */
  businesses: {
    'gula-mercatura-1': 'Tavern',
    'luxuria-mercatura-1': 'House of Ill Repute',
    'avaritia-mercatura-1': 'Pawnshop',
    'tristitia-mercatura-1': 'Funeral Parlour',
    'ira-mercatura-1': 'Fight Pit',
    'acedia-mercatura-1': 'Idler\u2019s Hall',
    'vanagloria-mercatura-1': 'Vanity Press',
    'superbia-mercatura-1': 'Solitary Spire',
  } as Record<string, string>,
  acolytes: {
    acolyte: 'Acolyte',
    assign: 'Assign one more',
    unassign: 'Recall one',
    delegationLabel: 'Delegated acolytes',
    idle: 'idle',
  },
  compositum: {
    heading: 'Vitium Compositum',
    start: 'Begin',
    stop: 'End',
    noCost: 'no upkeep',
    generates: 'breeds reprobates',
    converts: 'converts',
    names: {
      bacchanal: 'Bacchanal',
      'loan-shark-op': 'Loan Shark Op',
      charity: 'Charity Drive',
      gala: 'Gala',
      panvitium: 'Panvitium',
    } as Record<string, string>,
    panvitiumGate: 'Requires every Sin at Level 3.',
    panvitiumReady: 'The streets are ready to burn. 10000 gold/s, 100 influence/s — and rising.',
    panvitiumActive: 'The Sins have taken the streets.',
    panvitiumBurning: 'Burning\u2026',
    panvitiumBegin: 'Unleash',
    panvitiumConfirm: 'Yes \u2014 let it all burn',
    panvitiumCancel: 'Not yet',
  },
  invocations: {
    intro: 'Names called up from below. Each asks a price in souls and stays until dispelled.',
    empty:
      'The seals lie unlit. Gather invoking power \u2014 from maleficia \u2014 to glimpse what waits beneath the ink.',
    power: 'Invoking power',
    summon: 'Summon',
    dispel: 'Dispel',
    active: 'bound',
    free: 'no soul cost',
    names: {
      fama: 'Fama',
      nightmare: 'Nightmare',
      harpy: 'Harpy',
      behemoth: 'Behemoth',
      midas: 'Midas',
      doppelgaenger: 'Doppelg\u00e4nger',
    } as Record<string, string>,
  },
  maleficia: {
    intro:
      'What has been found, paid for, and brought home. Each item has its own price in attention.',
    empty: 'Empty hooks and clean dust-rings. Nothing has yet been found or purchased.',
    rarity: {
      common: 'common',
      rare: 'rare',
      profane: 'profane',
      anathema: 'anathema',
    },
    invokingPower: 'invoking power',
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
  eternal: {
    // The blacked-out ninth Sin, shown in the Katabasis menu once all eight are mastered.
    herald:
      'Something stands above the eight. It has no name you can read \u2014 yet it takes what you give.',
    unknown: '\u2588\u2588\u2588\u2588\u2588',
    ninth: 'The Ninth',
    complete: 'It knows your name. It was always yours.',
    // Revealed identity.
    name: 'Semet',
    epithet: 'The King of All Sins',
    // The reveal / credits screen.
    revealKicker: 'The name beneath the ink resolves.',
    gloss: 'Semet \u2014 "oneself." There was never another prince. There was only you.',
    verse:
      'Iam pridem scis te perditum esse. Quiescere non potes, sed nihil agis: nihil enim venenum acerbissimum est, ornamentum gravissimum, quod cervicem premit nec umquam deponi patitur. At inter has tenebras amor eorum iustus ignem accendit, eaque sola flamma, quamvis tenuis, viam tibi monstrat.',
    scoreLabel: 'Time to ascend',
    dismiss: 'Close the book',
  },
} as const;

export type Strings = typeof strings;
