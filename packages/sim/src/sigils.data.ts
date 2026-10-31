/**
 * Sigil TUNING DATA (Sigils sheet rev 2026-06-12) — the full 72-sigil catalog (`SIGILS`): each
 * sigil's binding curve, strength coefficient, gate, category, and effect. Separated from the logic
 * in `sigils.ts` so the economy knobs live in one editable place. Pure data; types and behaviour
 * stay in `sigils.ts`. Curve defaults to the `pct` percentage curve unless noted; on it a
 * `coefficient` of 1 is the standard strength (log base 33: ~5% at 33 souls, ~50% at ~39M, no cap), 0.5 is half.
 * '(flat)' effects use the `log` curve with their own coefficients and read as flat amounts.
 * No two seals share an effect (ADR-043, which re-homed the six dormant seals, Gusion and one seal of
 * each duplicate pair): a new seal needs a lever no other seal pulls.
 */
import { type SigilDef } from './sigils.js';

export const SIGILS: Readonly<Record<number, SigilDef>> = {
  1: {
    id: 1,
    name: 'Bael',
    coefficient: 0.2, // player tuning (rev 2026-10-22): a fifth of the standard 1
    // Sigils sheet (rev 2026-06-12): −Opera negative outcome chance (all categories).
    effect: { kind: 'tierGroup', tiers: ['bad', 'terrible', 'apocalyptic'], direction: 'decrease' },
  },
  2: {
    id: 2,
    name: 'Agares',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +chance to duplicate the output of Indagatio.
    effect: { kind: 'duplicateOutput', category: 'indagatio' },
  },
  3: {
    id: 3,
    name: 'Vassago',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +chance of profane & anathema finds (the tiers that surface them).
    effect: {
      kind: 'categoryTier',
      category: 'indagatio',
      tiers: ['stellar', 'excellent'],
      direction: 'increase',
    },
  },
  4: {
    id: 4,
    name: 'Samigina',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Tristitia invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'tristitia' },
  },
  5: {
    id: 5,
    name: 'Marbas',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Indagatio positive outcome chance.
    effect: {
      kind: 'categoryTier',
      category: 'indagatio',
      tiers: ['stellar', 'excellent', 'good'],
      direction: 'increase',
    },
  },
  6: {
    id: 6,
    name: 'Valefor',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +gold gain rate.
    effect: { kind: 'modifier', field: 'goldRateMul', direction: 'increase' },
  },
  7: {
    id: 7,
    name: 'Aamon',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +reprobate generation rate.
    effect: { kind: 'modifier', field: 'reprobateGenerationRateMul', direction: 'increase' },
  },
  8: {
    id: 8,
    name: 'Barbatos',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Gula invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'gula' },
  },
  9: {
    id: 9,
    name: 'Paimon',
    coefficient: 0.5, // half the standard pct strength (was 0.5× on the old √ default)
    // Sigils sheet (rev 2026-06-12): −influence costs.
    effect: { kind: 'costReduction', channel: 'influence' },
  },
  10: {
    id: 10,
    name: 'Buer',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +familiar effectiveness.
    effect: { kind: 'invocationEffect', invocation: 'familiar' },
  },
  11: {
    id: 11,
    name: 'Gusion',
    coefficient: 1,
    // ADR-043: +incoming-call boon duration (he answers all questions). Every timed boon an answer
    // grants (a buff above ×1) lasts ×(1 + strength) longer; a call's debuffs keep their length.
    // Was a pure curse, −influence generation (ADR-034).
    effect: { kind: 'callBoonDuration' },
  },
  12: {
    id: 12,
    name: 'Sitri',
    coefficient: 1,
    // ADR-034: +Desidia generation rate (the offline accrual rate).
    effect: { kind: 'modifier', field: 'desidiaGainMul', direction: 'increase' },
  },
  13: {
    id: 13,
    name: 'Beleth',
    coefficient: 1,
    // ADR-043: +chance each death draws a mourner into the flock (he causes all the love that may
    // be). Rate-level, clamped to 1: the dead are at most replaced. Dormant since ADR-038 (it lifted
    // the retired Decimatio's positive outcomes).
    effect: { kind: 'deathRecruit' },
  },
  14: {
    id: 14,
    name: 'Leraie',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +chance a murder triggers a suicide.
    effect: { kind: 'murderTriggersSuicide' },
  },
  15: {
    id: 15,
    name: 'Eligos',
    coefficient: 1,
    // ADR-034: −Emptio purchase costs (the emptioGold channel).
    effect: { kind: 'costReduction', channel: 'emptioGold' },
  },
  16: {
    id: 16,
    name: 'Zepar',
    curve: 'log',
    coefficient: 0.001,
    // ADR-043: +Desidia/s (flat) accrued while the game runs; Sitri #12 lifts the offline accrual
    // instead. Was −invocation costs at a third strength, an exact twin of Orobas #55 since ADR-035.
    effect: { kind: 'flatGen', resource: 'desidia' },
  },
  17: {
    id: 17,
    name: 'Botis',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): −Logos negative outcome chance.
    effect: {
      kind: 'categoryTier',
      category: 'logos',
      tiers: ['bad', 'terrible', 'apocalyptic'],
      direction: 'decrease',
    },
  },
  18: {
    id: 18,
    name: 'Bathin',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +acolyte action efficiency.
    effect: { kind: 'modifier', field: 'acolyteEfficiencyMul', direction: 'increase' },
  },
  19: {
    id: 19,
    name: 'Sallos',
    coefficient: 1,
    // ADR-034: −Desidia drain rate (composes with Lemure on desidiaDrainMul).
    effect: { kind: 'modifier', field: 'desidiaDrainMul', direction: 'decrease' },
  },
  20: {
    id: 20,
    name: 'Purson',
    curve: 'log',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +remaining gold % (flat percentage points).
    effect: { kind: 'katabasis', rolls: ['gold'] },
  },
  21: {
    id: 21,
    name: 'Marax',
    coefficient: 1,
    // ADR-043: +single-use maleficia duration (the sheet's "Stops, delays"; he knows the virtues of
    // herbs and stones): each activation lasts ×(1 + strength) of its hour. Dormant since ADR-038
    // (it lifted the retired Decimatio's efficiency).
    effect: { kind: 'maleficiaDuration' },
  },
  22: {
    id: 22,
    name: 'Ipos',
    coefficient: 1,
    // ADR-043: −Indagatio investment cost (he knows what is to come, so the Search needs less
    // gold): a Cast pours ÷(1 + strength) of its share, while the efficiency bonus still reads the
    // whole share. Dormant since ADR-038 (it softened the retired Decimatio's failures).
    effect: { kind: 'costReduction', channel: 'indagatioInvestment' },
  },
  23: {
    id: 23,
    name: 'Aim',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +murder rate.
    effect: { kind: 'modifier', field: 'murderRateMul', direction: 'increase' },
  },
  24: {
    id: 24,
    name: 'Naberius',
    curve: 'log',
    coefficient: 100,
    // ADR-043: +starting gold each lifetime (flat; he restores lost dignities and honours), added
    // on top of the gold kept. Was +Indagatio efficiency, an exact twin of Bifrons #46 (ADR-034).
    effect: { kind: 'lifetimeSeed', resource: 'gold' },
  },
  25: {
    id: 25,
    name: 'Glasya-Labolas',
    curve: 'log',
    coefficient: 0.001,
    // Sigils sheet (rev 2026-06-12): +murder rate (flat addition to the per-capita base).
    effect: { kind: 'flatGen', resource: 'murderRate' },
  },
  26: {
    id: 26,
    name: 'Bune',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Vanagloria invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'vanagloria' },
  },
  27: {
    id: 27,
    name: 'Ronove',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +suicide rate.
    effect: { kind: 'modifier', field: 'reprobateSuicideRateMul', direction: 'increase' },
  },
  28: {
    id: 28,
    name: 'Berith',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Superbia invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'superbia' },
  },
  29: {
    id: 29,
    name: 'Astaroth',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Stellar chance for Indagatio.
    effect: {
      kind: 'categoryTier',
      category: 'indagatio',
      tiers: ['stellar'],
      direction: 'increase',
    },
  },
  30: {
    id: 30,
    name: 'Forneus',
    curve: 'log',
    coefficient: 0.1, // player tuning (rev 2026-10-22): a fifth of the sheet's 0.5
    // Sigils sheet (rev 2026-06-12): +invoking power (flat).
    effect: { kind: 'invokingPower' },
  },
  31: {
    id: 31,
    name: 'Foras',
    coefficient: 1,
    // ADR-034: +Desidia time acceleration (composes with Acedia's Procrastination on desidiaSpeedMul).
    effect: { kind: 'modifier', field: 'desidiaSpeedMul', direction: 'increase' },
  },
  32: {
    id: 32,
    name: 'Semet',
    curve: 'log',
    coefficient: 0.01,
    // Sigils sheet (rev 2026-06-12): +sigil effect % (scales every OTHER sigil).
    effect: { kind: 'sigilEffect' },
    gateAllSinsLevel: 2,
  },
  33: {
    id: 33,
    name: 'Gaap',
    curve: 'log',
    coefficient: 0.01,
    // Sigils sheet (rev 2026-06-12): +maleficia effect % (boosts EVERY maleficium's effect, ADR-036).
    effect: { kind: 'maleficiaEffect' },
  },
  34: {
    id: 34,
    name: 'Furfur',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Luxuria invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'luxuria' },
  },
  35: {
    id: 35,
    name: 'Marchosias',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +max influence.
    effect: { kind: 'modifier', field: 'maxInfluenceMul', direction: 'increase' },
  },
  36: {
    id: 36,
    name: 'Stolas',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): −chance of Common finds (the Neutral tier surfaces them).
    effect: {
      kind: 'categoryTier',
      category: 'indagatio',
      tiers: ['neutral'],
      direction: 'decrease',
    },
  },
  37: {
    id: 37,
    name: 'Phenex',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): −Emptio negative outcome chance.
    effect: {
      kind: 'categoryTier',
      category: 'emptio',
      tiers: ['bad', 'terrible', 'apocalyptic'],
      direction: 'decrease',
    },
  },
  38: {
    id: 38,
    name: 'Halphas',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): −chance of common & rare finds.
    effect: {
      kind: 'categoryTier',
      category: 'indagatio',
      tiers: ['neutral', 'good'],
      direction: 'decrease',
    },
  },
  39: {
    id: 39,
    name: 'Malphas',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +chance to duplicate the output of Logos.
    effect: { kind: 'duplicateOutput', category: 'logos' },
  },
  40: {
    id: 40,
    name: 'Raum',
    curve: 'log',
    coefficient: 1,
    // ADR-043: +gold per death (flat; he steals treasure out of kings' houses): every soul a death
    // mints brings this much gold with it. Dormant since ADR-038 (a Decimatio/Logos tradeoff).
    effect: { kind: 'goldPerDeath' },
  },
  41: {
    id: 41,
    name: 'Focalor',
    curve: 'log',
    coefficient: 1,
    // ADR-043: +share of the abandoned flock drowned at the descent (he drowns men): of the
    // reprobates the carry-over leaves behind, this share (flat percentage points, like Camio #53)
    // dies, one soul each. Dormant since ADR-038 (it duplicated the retired Decimatio's output).
    effect: { kind: 'katabasis', rolls: ['drowning'] },
  },
  42: {
    id: 42,
    name: 'Vepar',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Ira invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'ira' },
  },
  43: {
    id: 43,
    name: 'Sabnock',
    curve: 'log',
    coefficient: 0.001,
    // Sigils sheet (rev 2026-06-12): +suicide rate (flat addition to the per-capita base).
    effect: { kind: 'flatGen', resource: 'suicideRate' },
  },
  44: {
    id: 44,
    name: 'Shax',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Avaritia invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'avaritia' },
  },
  45: {
    id: 45,
    name: 'Vine',
    coefficient: 1,
    // ADR-043: −Indagatio gold losses (he reveals witches and hidden things, so the Search's traps
    // are seen): the gold the Terrible and Apocalyptic tiers bite is cut ×1/(1 + strength). Was
    // −reserve surrender charge, an exact twin of Furcas #50.
    effect: { kind: 'lossReduction', category: 'indagatio' },
  },
  46: {
    id: 46,
    name: 'Bifrons',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Indagatio action efficiency.
    effect: { kind: 'modifier', field: 'indagatioEfficiencyMul', direction: 'increase' },
  },
  47: {
    id: 47,
    name: 'Vual',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Stellar chance for Logos.
    effect: { kind: 'categoryTier', category: 'logos', tiers: ['stellar'], direction: 'increase' },
  },
  48: {
    id: 48,
    name: 'Haagenti',
    curve: 'log',
    coefficient: 0.3, // player tuning (rev 2026-10-22): a tenth of the sheet's 3
    // Sigils sheet (rev 2026-06-12): +gold/s (flat).
    effect: { kind: 'flatGen', resource: 'gold' },
  },
  49: {
    id: 49,
    name: 'Crocell',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +chance Indagatio finds 2.
    effect: { kind: 'indagatioDoubleFind' },
  },
  50: {
    id: 50,
    name: 'Furcas',
    coefficient: 1,
    // Re-pinned (Depraedatio relationship-tier rework): −reserve surrender charge, in the asymptotic
    // ×1/(1 + strength) form (formerly +withdrawal recovery; the Mercatus divest before that). The
    // only surrender-charge seal since Vine #45 moved (ADR-043).
    effect: { kind: 'shutdownRefund' },
  },
  51: {
    id: 51,
    name: 'Balam',
    coefficient: 1,
    // ADR-043: −Logos reprobate losses (he makes men invisible, so the Church cannot find them): the
    // reprobates Bad, Terrible and Apocalyptic take are cut ×1/(1 + strength). Was −negative outcome
    // chance (all Opera), an exact twin of Bael #1 (which keeps it at its tuned 0.2).
    effect: { kind: 'lossReduction', category: 'logos' },
  },
  52: {
    id: 52,
    name: 'Alloces',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Acedia invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'acedia' },
  },
  53: {
    id: 53,
    name: 'Camio',
    curve: 'log',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +remaining reprobate % (flat percentage points).
    effect: { kind: 'katabasis', rolls: ['reprobate'] },
  },
  54: {
    id: 54,
    name: 'Murmur',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +overall invocation effectiveness.
    effect: { kind: 'modifier', field: 'invocationEfficiencyMul', direction: 'increase' },
  },
  55: {
    id: 55,
    name: 'Orobas',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): −cost of all invocations.
    effect: { kind: 'costReduction', channel: 'invocation' },
  },
  56: {
    id: 56,
    name: 'Gremory',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Logos positive outcome chance.
    effect: {
      kind: 'categoryTier',
      category: 'logos',
      tiers: ['stellar', 'excellent', 'good'],
      direction: 'increase',
    },
  },
  57: {
    id: 57,
    name: 'Ose',
    curve: 'log',
    coefficient: 0.3,
    // Sigils sheet (rev 2026-06-12): +reprobate generation (flat).
    effect: { kind: 'flatGen', resource: 'generation' },
  },
  58: {
    id: 58,
    name: 'Amy',
    coefficient: 1,
    // ADR-043: −Emptio gold losses (he betrays the treasure the spirits keep): a failed deal (Bad,
    // Terrible, Apocalyptic) returns 1 − 1/(1 + strength) of the price paid, and the bait's bite is
    // cut ×1/(1 + strength). Was +Indagatio & Emptio efficiency, Bifrons #46 + Seere #70 in one seal.
    effect: { kind: 'lossReduction', category: 'emptio' },
  },
  59: {
    id: 59,
    name: 'Orias',
    coefficient: 1,
    // ADR-034: +maximum Desidia (multiplies the Acedia-scaled cap).
    effect: { kind: 'modifier', field: 'desidiaMaxMul', direction: 'increase' },
  },
  60: {
    id: 60,
    name: 'Vapula',
    coefficient: 1,
    // Re-pinned (Depraedatio gold rework): +account output (the reserve's interest; the loan book it
    // also lifted is retired), unchanged in magnitude: the renamed `vitiumMercaturaOutputMul` field.
    effect: { kind: 'modifier', field: 'faenerationOutputMul', direction: 'increase' },
  },
  61: {
    id: 61,
    name: 'Zagan',
    coefficient: 1 / 3, // a third of the standard pct strength (ADR-034)
    // ADR-034: +Logos action efficiency (the only Logos-efficiency seal since ADR-043).
    effect: { kind: 'modifier', field: 'logosEfficiencyMul', direction: 'increase' },
  },
  62: {
    id: 62,
    name: 'Volac',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): −Indagatio negative outcome chance.
    effect: {
      kind: 'categoryTier',
      category: 'indagatio',
      tiers: ['bad', 'terrible', 'apocalyptic'],
      direction: 'decrease',
    },
  },
  63: {
    id: 63,
    name: 'Andras',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Stellar chance for Emptio.
    effect: { kind: 'categoryTier', category: 'emptio', tiers: ['stellar'], direction: 'increase' },
  },
  64: {
    id: 64,
    name: 'Haures',
    coefficient: 1,
    // ADR-043: +share of Logos losses burned into souls (he burns the exorcist's enemies): of the
    // reprobates a Logos failure takes, this share (clamped to 1, floored) dies, one soul each.
    // Dormant since ADR-038 (it lifted the retired Decimatio's Stellar chance).
    effect: { kind: 'logosLossSouls' },
  },
  65: {
    id: 65,
    name: 'Andrealphus',
    coefficient: 1,
    // ADR-043: +invoking power, as a percentage of the whole (the sheet's own "+invoking power";
    // he teaches mensuration): the maleficia's power plus Forneus #30's flat grant, ×(1 + strength),
    // rounded. Was −invocation costs / +Desidia speed (ADR-035), Orobas #55 + Foras #31 in one seal.
    effect: { kind: 'invokingPowerMul' },
  },
  66: {
    id: 66,
    name: 'Cimejes',
    curve: 'log',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +remaining maleficia chance (flat percentage points).
    effect: { kind: 'katabasis', rolls: ['maleficia'] },
  },
  67: {
    id: 67,
    name: 'Amdusias',
    coefficient: 0.2, // player tuning (rev 2026-10-22): a fifth of the standard 1
    // Sigils sheet (rev 2026-06-12): +positive outcome chance (all Opera).
    effect: { kind: 'tierGroup', tiers: ['stellar', 'excellent', 'good'], direction: 'increase' },
  },
  68: {
    id: 68,
    name: 'Belial',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +influence gain rate.
    effect: { kind: 'modifier', field: 'influenceRateMul', direction: 'increase' },
  },
  69: {
    id: 69,
    name: 'Decarabia',
    curve: 'log',
    coefficient: 0.5,
    // Sigils sheet (rev 2026-06-12): generates influence/s (flat).
    effect: { kind: 'flatGen', resource: 'influence' },
  },
  70: {
    id: 70,
    name: 'Seere',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Emptio action efficiency.
    effect: { kind: 'modifier', field: 'emptioEfficiencyMul', direction: 'increase' },
  },
  71: {
    id: 71,
    name: 'Dantalion',
    curve: 'log',
    coefficient: 10,
    // ADR-043: +starting reprobates each lifetime (flat; he knows the thoughts of all men and changes
    // them at will), added on top of the reprobates kept. Was +Logos efficiency, Zagan #61 at three
    // times the strength once ADR-038 removed its Decimatio cost.
    effect: { kind: 'lifetimeSeed', resource: 'reprobates' },
  },
  72: {
    id: 72,
    name: 'Andromalius',
    coefficient: 1,
    // Sigils sheet (rev 2026-06-12): +Emptio positive outcome chance.
    effect: {
      kind: 'categoryTier',
      category: 'emptio',
      tiers: ['stellar', 'excellent', 'good'],
      direction: 'increase',
    },
  },
} as const;
