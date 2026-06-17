/**
 * Sigil TUNING DATA (Sigils sheet rev 2026-06-12) — the full 72-sigil catalog (`SIGILS`): each
 * sigil's binding curve, strength coefficient, gate, category, and effect. Separated from the logic
 * in `sigils.ts` so the economy knobs live in one editable place. Pure data; types and behaviour
 * stay in `sigils.ts`. Curve defaults to √ unless noted; sqrt/log strengths read as percentage
 * increases/decreases, '(flat)' effects as flat amounts.
 */
import { type SigilDef } from './sigils.js';

export const SIGILS: Readonly<Record<number, SigilDef>> = {
  1: {
    id: 1,
    name: 'Bael',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): −Opera negative outcome chance (all categories).
    effect: { kind: 'tierGroup', tiers: ['bad', 'terrible', 'apocalyptic'], direction: 'decrease' },
  },
  2: {
    id: 2,
    name: 'Agares',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +chance to duplicate the output of Indagatio.
    effect: { kind: 'duplicateOutput', category: 'indagatio' },
  },
  3: {
    id: 3,
    name: 'Vassago',
    coefficient: 0.0001,
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
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Tristitia invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'tristitia' },
  },
  5: {
    id: 5,
    name: 'Marbas',
    coefficient: 0.0001,
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
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +gold gain rate.
    effect: { kind: 'modifier', field: 'goldRateMul', direction: 'increase' },
  },
  7: {
    id: 7,
    name: 'Aamon',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +reprobate generation rate.
    effect: { kind: 'modifier', field: 'reprobateGenerationRateMul', direction: 'increase' },
  },
  8: {
    id: 8,
    name: 'Barbatos',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Gula invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'gula' },
  },
  9: {
    id: 9,
    name: 'Paimon',
    coefficient: 0.00005,
    // Sigils sheet (rev 2026-06-12): −influence costs.
    effect: { kind: 'costReduction', channel: 'influence' },
  },
  10: {
    id: 10,
    name: 'Buer',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +familiar effectiveness.
    effect: { kind: 'invocationEffect', invocation: 'familiar' },
  },
  11: {
    id: 11,
    name: 'Gusion',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +VC ceremony EFFECTS (not the gold/influence outputs).
    effect: { kind: 'modifier', field: 'vitiumCompositumEffectMul', direction: 'increase' },
  },
  12: {
    id: 12,
    name: 'Sitri',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Vitium Mercatura reprobate generation.
    effect: { kind: 'modifier', field: 'vitiumMercaturaGenerationMul', direction: 'increase' },
  },
  13: {
    id: 13,
    name: 'Beleth',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Decimatio positive outcome chance.
    effect: {
      kind: 'categoryTier',
      category: 'decimatio',
      tiers: ['stellar', 'excellent', 'good'],
      direction: 'increase',
    },
  },
  14: {
    id: 14,
    name: 'Leraie',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +chance a murder triggers a suicide.
    effect: { kind: 'murderTriggersSuicide' },
  },
  15: {
    id: 15,
    name: 'Eligos',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +offline influence gain rate.
    effect: { kind: 'offlineResource', resource: 'influence' },
  },
  16: {
    id: 16,
    name: 'Zepar',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +offline reprobate generation rate.
    effect: { kind: 'offlineResource', resource: 'generation' },
  },
  17: {
    id: 17,
    name: 'Botis',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): −Suasio negative outcome chance.
    effect: {
      kind: 'categoryTier',
      category: 'suasio',
      tiers: ['bad', 'terrible', 'apocalyptic'],
      direction: 'decrease',
    },
  },
  18: {
    id: 18,
    name: 'Bathin',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +acolyte action efficiency.
    effect: { kind: 'modifier', field: 'acolyteEfficiencyMul', direction: 'increase' },
  },
  19: {
    id: 19,
    name: 'Sallos',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +offline gold gain rate.
    effect: { kind: 'offlineResource', resource: 'gold' },
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
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +offline action efficiency.
    effect: { kind: 'offlineActionEfficiency' },
  },
  22: {
    id: 22,
    name: 'Ipos',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): −Decimatio negative outcome chance.
    effect: {
      kind: 'categoryTier',
      category: 'decimatio',
      tiers: ['bad', 'terrible', 'apocalyptic'],
      direction: 'decrease',
    },
  },
  23: {
    id: 23,
    name: 'Aim',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +murder rate.
    effect: { kind: 'modifier', field: 'murderRateMul', direction: 'increase' },
  },
  24: {
    id: 24,
    name: 'Naberius',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +VC ceremony effects (shares the Gusion channel).
    effect: { kind: 'modifier', field: 'vitiumCompositumEffectMul', direction: 'increase' },
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
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Vanagloria invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'vanagloria' },
  },
  27: {
    id: 27,
    name: 'Ronove',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +suicide rate.
    effect: { kind: 'modifier', field: 'reprobateSuicideRateMul', direction: 'increase' },
  },
  28: {
    id: 28,
    name: 'Berith',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Superbia invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'superbia' },
  },
  29: {
    id: 29,
    name: 'Astaroth',
    coefficient: 0.0001,
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
    coefficient: 0.5,
    // Sigils sheet (rev 2026-06-12): +invoking power (flat).
    effect: { kind: 'invokingPower' },
  },
  31: {
    id: 31,
    name: 'Foras',
    coefficient: 0.000025,
    // Sigils sheet (rev 2026-06-12): +offline accrual window (extends the Acedia-compound saturation).
    effect: { kind: 'offlineAccrualWindow' },
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
    // Sigils sheet (rev 2026-06-12): +maleficia effect % (scales the maleficia sigil-enhancer stack).
    effect: { kind: 'maleficiaEffect' },
  },
  34: {
    id: 34,
    name: 'Furfur',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Luxuria invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'luxuria' },
  },
  35: {
    id: 35,
    name: 'Marchosias',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +max influence.
    effect: { kind: 'modifier', field: 'maxInfluenceMul', direction: 'increase' },
  },
  36: {
    id: 36,
    name: 'Stolas',
    coefficient: 0.0001,
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
    coefficient: 0.0001,
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
    coefficient: 0.0001,
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
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +chance to duplicate the output of Suasio.
    effect: { kind: 'duplicateOutput', category: 'suasio' },
  },
  40: {
    id: 40,
    name: 'Raum',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Decimatio action efficiency.
    effect: { kind: 'modifier', field: 'decimatioEfficiencyMul', direction: 'increase' },
  },
  41: {
    id: 41,
    name: 'Focalor',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +chance to duplicate the output of Decimatio.
    effect: { kind: 'duplicateOutput', category: 'decimatio' },
  },
  42: {
    id: 42,
    name: 'Vepar',
    coefficient: 0.0001,
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
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Avaritia invocation effectiveness.
    effect: { kind: 'invocationSin', sin: 'avaritia' },
  },
  45: {
    id: 45,
    name: 'Vine',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +recovered gold on Mercatus divestment.
    effect: { kind: 'shutdownRefund' },
  },
  46: {
    id: 46,
    name: 'Bifrons',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Indagatio action efficiency.
    effect: { kind: 'modifier', field: 'indagatioEfficiencyMul', direction: 'increase' },
  },
  47: {
    id: 47,
    name: 'Vual',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Stellar chance for Suasio.
    effect: { kind: 'categoryTier', category: 'suasio', tiers: ['stellar'], direction: 'increase' },
  },
  48: {
    id: 48,
    name: 'Haagenti',
    curve: 'log',
    coefficient: 3,
    // Sigils sheet (rev 2026-06-12): +gold/s (flat).
    effect: { kind: 'flatGen', resource: 'gold' },
  },
  49: {
    id: 49,
    name: 'Crocell',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +chance Indagatio finds 2.
    effect: { kind: 'indagatioDoubleFind' },
  },
  50: {
    id: 50,
    name: 'Furcas',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Mercatus divestment gold recovery (composes with Vine).
    effect: { kind: 'shutdownRefund' },
  },
  51: {
    id: 51,
    name: 'Balam',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): −negative outcome chance (all Opera).
    effect: { kind: 'tierGroup', tiers: ['bad', 'terrible', 'apocalyptic'], direction: 'decrease' },
  },
  52: {
    id: 52,
    name: 'Alloces',
    coefficient: 0.0001,
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
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +overall invocation effectiveness.
    effect: { kind: 'modifier', field: 'invocationEfficiencyMul', direction: 'increase' },
  },
  55: {
    id: 55,
    name: 'Orobas',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): −cost of all invocations.
    effect: { kind: 'costReduction', channel: 'invocationSoul' },
  },
  56: {
    id: 56,
    name: 'Gremory',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Suasio positive outcome chance.
    effect: {
      kind: 'categoryTier',
      category: 'suasio',
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
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): a CURSED sigil: −Indagatio & Emptio action efficiency.
    effect: {
      kind: 'modifierMulti',
      fields: ['indagatioEfficiencyMul', 'emptioEfficiencyMul'],
      direction: 'decrease',
    },
  },
  59: {
    id: 59,
    name: 'Orias',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +VC influence output.
    effect: {
      kind: 'modifier',
      field: 'vitiumCompositumInfluenceOutputMul',
      direction: 'increase',
    },
  },
  60: {
    id: 60,
    name: 'Vapula',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Vitium Mercatura gold output.
    effect: { kind: 'modifier', field: 'vitiumMercaturaOutputMul', direction: 'increase' },
  },
  61: {
    id: 61,
    name: 'Zagan',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +VC gold output.
    effect: { kind: 'modifier', field: 'vitiumCompositumOutputMul', direction: 'increase' },
  },
  62: {
    id: 62,
    name: 'Volac',
    coefficient: 0.0001,
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
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Stellar chance for Emptio.
    effect: { kind: 'categoryTier', category: 'emptio', tiers: ['stellar'], direction: 'increase' },
  },
  64: {
    id: 64,
    name: 'Haures',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Stellar chance for Decimatio.
    effect: {
      kind: 'categoryTier',
      category: 'decimatio',
      tiers: ['stellar'],
      direction: 'increase',
    },
  },
  65: {
    id: 65,
    name: 'Andrealphus',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +invoking power.
    effect: { kind: 'invokingPower' },
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
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +positive outcome chance (all Opera).
    effect: { kind: 'tierGroup', tiers: ['stellar', 'excellent', 'good'], direction: 'increase' },
  },
  68: {
    id: 68,
    name: 'Belial',
    coefficient: 0.0001,
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
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Emptio action efficiency.
    effect: { kind: 'modifier', field: 'emptioEfficiencyMul', direction: 'increase' },
  },
  71: {
    id: 71,
    name: 'Dantalion',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Suasio action efficiency.
    effect: { kind: 'modifier', field: 'suasioEfficiencyMul', direction: 'increase' },
  },
  72: {
    id: 72,
    name: 'Andromalius',
    coefficient: 0.0001,
    // Sigils sheet (rev 2026-06-12): +Emptio positive outcome chance.
    effect: {
      kind: 'categoryTier',
      category: 'emptio',
      tiers: ['stellar', 'excellent', 'good'],
      direction: 'increase',
    },
  },
} as const;
