/**
 * Sigil binding-to-effect curves (02 §5). The default is √(bound souls) — strong early returns,
 * gentle late, encouraging spreading souls across many sigils. Some sigils override to linear
 * (swingy, build-defining) or logarithmic (splash). `bindingMagnitude` returns the bare magnitude;
 * a per-sigil coefficient multiplies it into a concrete effect strength.
 *
 * The catalog (03 §5) is the full Goetia numbering 1..72, with #32 = Semet. THIS slice wires a
 * representative subset across both surfaces a sigil can feed:
 *   - in-lifetime modifiers (computeModifiers reads `sigilModifierContributions`)
 *   - Katabasis carry-over rolls (commitKatabasis reads `sigilKatabasisBonus`)
 * Effect magnitudes are placeholders; the spreadsheet `Sigils` sheet is authoritative. Unwired
 * sigils simply have no catalog entry yet — binding them is harmless and does nothing until added.
 */
import { type BigNum, add, floor, lte, ZERO } from './bignum.js';
import { MAX_SIN_LEVEL } from './constants.js';
import { sinLevel } from './progression.js';
import { SINS, type GameState, type ReprobateSubtype, type SigilId, type Sin } from './state.js';
import { type Tier } from './probability.js';

export type BindingCurve = 'sqrt' | 'linear' | 'log';

/**
 * The magnitude a sigil's effect scales by, given the souls bound to it. Returned as a number:
 * sqrt/log keep magnitudes small, and linear stays within Number's exact-integer range for any
 * realistic binding.
 */
export function bindingMagnitude(curve: BindingCurve, boundSouls: BigNum): number {
  const x = floor(boundSouls);
  if (lte(x, ZERO)) return 0;
  if (curve === 'linear') return x.toNumber();
  if (curve === 'log') return Math.max(0, add(x, 1).ln());
  return x.sqrt().toNumber(); // 'sqrt' — the default
}

/** The scalar (single-number) fields of the modifier bundle a sigil may target. */
export type ScalarModifierField =
  | 'goldRateMul'
  | 'influenceRateMul'
  | 'maxInfluenceMul'
  | 'playerEfficiencyMul'
  | 'suasioEfficiencyMul'
  | 'decimatioEfficiencyMul'
  | 'indagatioEfficiencyMul'
  | 'emptioEfficiencyMul'
  | 'reprobateGenerationRateMul'
  | 'reprobateSuicideRateMul'
  | 'nihilistSuicideMul'
  | 'cholericMurderRateMul'
  | 'vitiumMercaturaOutputMul'
  | 'vitiumCompositumOutputMul'
  | 'acolyteEfficiencyMul'
  | 'invocationEfficiencyMul'
  | 'offlineTimeMul';

/** Which Katabasis carry-over roll a sigil's bonus feeds. */
export type KatabasisRoll = 'gold' | 'unconverted' | 'maleficia';

/**
 * A sigil's effect. `modifier`/`tier` multiply an in-lifetime value by `(1 + strength)` (increase)
 * or `1/(1 + strength)` (decrease) — the same convention as Sin skills (ADR-022). `katabasis` adds
 * `strength` (a flat fraction) to one or more carry-over rolls.
 */
export type SigilEffect =
  | {
      readonly kind: 'modifier';
      readonly field: ScalarModifierField;
      readonly direction: 'increase' | 'decrease';
    }
  | { readonly kind: 'tier'; readonly tier: Tier; readonly direction: 'increase' | 'decrease' }
  | {
      readonly kind: 'categoryTier';
      readonly category: SigilCategory;
      readonly tiers: readonly Tier[];
      readonly direction: 'increase' | 'decrease';
    }
  | { readonly kind: 'invocationSin'; readonly sin: Sin }
  | { readonly kind: 'penaltyReduction'; readonly channel: PenaltyChannel }
  | { readonly kind: 'flatGen'; readonly resource: 'gold' | 'influence' }
  | { readonly kind: 'invokingPower' }
  | { readonly kind: 'costReduction'; readonly channel: CostChannel }
  | { readonly kind: 'conversionBias'; readonly subtype: ReprobateSubtype }
  | { readonly kind: 'murderBias'; readonly subtype: ReprobateSubtype }
  | { readonly kind: 'indagatioDoubleFind' }
  | { readonly kind: 'offlineResource'; readonly resource: 'gold' | 'influence' }
  | { readonly kind: 'invocationEffect'; readonly invocation: string }
  | { readonly kind: 'katabasis'; readonly rolls: readonly KatabasisRoll[] };

/** The four Opera action categories a per-category tier sigil can target. */
export type SigilCategory = 'suasio' | 'decimatio' | 'indagatio' | 'emptio';

/**
 * A subtype-penalty channel a sigil can soften (Gaap/Malphas/Gremory/Volac). Each names one existing
 * per-count penalty coefficient; the sigil divides that coefficient by `(1 + strength)` (asymptotic
 * to no penalty, never an outright bonus).
 */
export type PenaltyChannel =
  | 'sigmaInfluence'
  | 'celebrityGold'
  | 'degenerateSuicide'
  | 'gamblerGeneration';

/**
 * A cost a sigil can soften (Paimon/Orobas/Amy). `influence` = action influence costs, `invocationSoul`
 * = the per-invoke soul price, `emptioGold` = the Emptio purchase gold. Each sigil divides its cost by
 * `(1 + strength)` (never below zero, never an increase).
 */
export type CostChannel = 'influence' | 'invocationSoul' | 'emptioGold';

export interface SigilDef {
  readonly id: SigilId;
  readonly name: string;
  /** Binding curve; omitted means the √ default (02 §5). */
  readonly curve?: BindingCurve;
  /** Per-sigil scalar applied to the binding magnitude (spreadsheet-overridable placeholder). */
  readonly coefficient: number;
  readonly effect: SigilEffect;
  /**
   * Semet (#32) is hidden until every Cardinal Sin is at level ≥ 2 (03 §5/§8). All other sigils are
   * exposed from the start. Encoded as a minimum level required in EVERY Sin.
   */
  readonly gateAllSinsLevel?: number;
}

/** The wired subset of the 72 (03 §5). Curve defaults to √ unless noted. */
export const SIGILS: Readonly<Record<number, SigilDef>> = {
  2: {
    id: 2,
    name: 'Agares',
    coefficient: 0.001,
    effect: {
      kind: 'categoryTier',
      category: 'indagatio',
      tiers: ['stellar', 'excellent', 'good'],
      direction: 'increase',
    },
  },
  3: {
    id: 3,
    name: 'Vassago',
    coefficient: 0.001,
    // Higher chance of profane + anathema finds = boost the Indagatio tiers that surface them.
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
    coefficient: 0.001,
    effect: { kind: 'invocationSin', sin: 'tristitia' },
  },
  5: {
    id: 5,
    name: 'Marbas',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'influenceRateMul', direction: 'increase' },
  },
  6: {
    id: 6,
    name: 'Valefor',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'goldRateMul', direction: 'increase' },
  },
  7: {
    id: 7,
    name: 'Aamon',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'reprobateGenerationRateMul', direction: 'increase' },
  },
  8: {
    id: 8,
    name: 'Barbatos',
    coefficient: 0.001,
    effect: { kind: 'invocationSin', sin: 'gula' },
  },
  9: {
    id: 9,
    name: 'Paimon',
    coefficient: 0.001,
    effect: { kind: 'costReduction', channel: 'influence' },
  },
  10: {
    id: 10,
    name: 'Buer',
    coefficient: 0.001,
    effect: { kind: 'invocationEffect', invocation: 'familiar' },
  },
  11: {
    id: 11,
    name: 'Gusion',
    coefficient: 0.001,
    effect: { kind: 'tier', tier: 'terrible', direction: 'decrease' },
  },
  12: {
    id: 12,
    name: 'Sitri',
    coefficient: 0.001,
    effect: { kind: 'invocationEffect', invocation: 'succubus' },
  },
  13: {
    id: 13,
    name: 'Beleth',
    coefficient: 0.001,
    effect: {
      kind: 'categoryTier',
      category: 'decimatio',
      tiers: ['stellar', 'excellent', 'good'],
      direction: 'increase',
    },
  },
  15: {
    id: 15,
    name: 'Eligos',
    coefficient: 0.001,
    effect: { kind: 'conversionBias', subtype: 'celebrity' },
  },
  16: {
    id: 16,
    name: 'Zepar',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'reprobateGenerationRateMul', direction: 'decrease' },
  },
  17: {
    id: 17,
    name: 'Botis',
    coefficient: 0.001,
    effect: {
      kind: 'categoryTier',
      category: 'suasio',
      tiers: ['bad', 'terrible'],
      direction: 'decrease',
    },
  },
  18: {
    id: 18,
    name: 'Bathin',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'acolyteEfficiencyMul', direction: 'increase' },
  },
  19: {
    id: 19,
    name: 'Sallos',
    coefficient: 0.001,
    effect: { kind: 'offlineResource', resource: 'gold' },
  },
  20: {
    id: 20,
    name: 'Purson',
    coefficient: 0.001,
    effect: { kind: 'katabasis', rolls: ['gold'] },
  },
  21: {
    id: 21,
    name: 'Marax',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'offlineTimeMul', direction: 'increase' },
  },
  22: {
    id: 22,
    name: 'Ipos',
    coefficient: 0.001,
    effect: {
      kind: 'categoryTier',
      category: 'decimatio',
      tiers: ['bad', 'terrible'],
      direction: 'decrease',
    },
  },
  23: {
    id: 23,
    name: 'Aim',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'cholericMurderRateMul', direction: 'increase' },
  },
  24: {
    id: 24,
    name: 'Naberius',
    coefficient: 0.001,
    // "+Suggestion/Logismoi base success" — Suggestion is the Suasio action; lifts Suasio success.
    effect: {
      kind: 'categoryTier',
      category: 'suasio',
      tiers: ['stellar', 'excellent', 'good'],
      direction: 'increase',
    },
  },
  25: {
    id: 25,
    name: 'Glasya-Labolas',
    coefficient: 0.001,
    effect: { kind: 'murderBias', subtype: 'celebrity' },
  },
  26: {
    id: 26,
    name: 'Bune',
    coefficient: 0.001,
    effect: { kind: 'invocationSin', sin: 'vanagloria' },
  },
  27: {
    id: 27,
    name: 'Ronove',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'nihilistSuicideMul', direction: 'increase' },
  },
  28: {
    id: 28,
    name: 'Berith',
    coefficient: 0.001,
    effect: { kind: 'invocationSin', sin: 'superbia' },
  },
  29: {
    id: 29,
    name: 'Astaroth',
    coefficient: 0.001,
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
    coefficient: 0.001,
    effect: { kind: 'offlineResource', resource: 'influence' },
  },
  31: {
    id: 31,
    name: 'Foras',
    coefficient: 0.001,
    effect: { kind: 'tier', tier: 'apocalyptic', direction: 'decrease' },
  },
  33: {
    id: 33,
    name: 'Gaap',
    coefficient: 0.001,
    effect: { kind: 'penaltyReduction', channel: 'sigmaInfluence' },
  },
  34: {
    id: 34,
    name: 'Furfur',
    coefficient: 0.001,
    effect: { kind: 'invocationSin', sin: 'luxuria' },
  },
  // Semet — the Eternal Sin's sigil. Gated on every Cardinal Sin ≥ 2 (03 §5/§8). Feeds all three
  // Katabasis rolls: a player binding it does not yet know the connection to the ninth Sin.
  32: {
    id: 32,
    name: 'Semet',
    coefficient: 0.001,
    effect: { kind: 'katabasis', rolls: ['gold', 'maleficia', 'unconverted'] },
    gateAllSinsLevel: 2,
  },
  35: {
    id: 35,
    name: 'Marchosias',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'maxInfluenceMul', direction: 'increase' },
  },
  36: {
    id: 36,
    name: 'Stolas',
    coefficient: 0.001,
    // Higher chance of rare finds = boost the Good Indagatio tier (its rarity entry point).
    effect: { kind: 'categoryTier', category: 'indagatio', tiers: ['good'], direction: 'increase' },
  },
  37: {
    id: 37,
    name: 'Phenex',
    coefficient: 0.001,
    effect: { kind: 'conversionBias', subtype: 'celebrity' },
  },
  38: {
    id: 38,
    name: 'Halphas',
    coefficient: 0.001,
    effect: { kind: 'katabasis', rolls: ['maleficia'] },
  },
  39: {
    id: 39,
    name: 'Malphas',
    coefficient: 0.001,
    effect: { kind: 'penaltyReduction', channel: 'celebrityGold' },
  },
  40: {
    id: 40,
    name: 'Raum',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'decimatioEfficiencyMul', direction: 'increase' },
  },
  46: {
    id: 46,
    name: 'Bifrons',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'indagatioEfficiencyMul', direction: 'increase' },
  },
  41: {
    id: 41,
    name: 'Focalor',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'nihilistSuicideMul', direction: 'increase' },
  },
  42: {
    id: 42,
    name: 'Vepar',
    coefficient: 0.001,
    effect: { kind: 'invocationSin', sin: 'ira' },
  },
  43: {
    id: 43,
    name: 'Sabnock',
    coefficient: 0.001,
    effect: { kind: 'murderBias', subtype: 'glutton' },
  },
  44: {
    id: 44,
    name: 'Shax',
    coefficient: 0.001,
    effect: { kind: 'invocationSin', sin: 'avaritia' },
  },
  48: {
    id: 48,
    name: 'Haagenti',
    curve: 'log',
    coefficient: 10,
    effect: { kind: 'flatGen', resource: 'gold' },
  },
  49: {
    id: 49,
    name: 'Crocell',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'reprobateSuicideRateMul', direction: 'increase' },
  },
  50: {
    id: 50,
    name: 'Furcas',
    coefficient: 0.001,
    effect: { kind: 'indagatioDoubleFind' },
  },
  51: {
    id: 51,
    name: 'Balam',
    coefficient: 0.001,
    effect: { kind: 'tier', tier: 'terrible', direction: 'decrease' },
  },
  52: {
    id: 52,
    name: 'Alloces',
    coefficient: 0.001,
    effect: { kind: 'invocationSin', sin: 'acedia' },
  },
  53: {
    id: 53,
    name: 'Camio',
    coefficient: 0.001,
    effect: { kind: 'murderBias', subtype: 'degenerate' },
  },
  54: {
    id: 54,
    name: 'Murmur',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'invocationEfficiencyMul', direction: 'increase' },
  },
  55: {
    id: 55,
    name: 'Orobas',
    coefficient: 0.001,
    effect: { kind: 'costReduction', channel: 'invocationSoul' },
  },
  56: {
    id: 56,
    name: 'Gremory',
    coefficient: 0.001,
    effect: { kind: 'penaltyReduction', channel: 'degenerateSuicide' },
  },
  58: {
    id: 58,
    name: 'Amy',
    coefficient: 0.001,
    effect: { kind: 'costReduction', channel: 'emptioGold' },
  },
  60: {
    id: 60,
    name: 'Vapula',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'vitiumMercaturaOutputMul', direction: 'increase' },
  },
  61: {
    id: 61,
    name: 'Zagan',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'vitiumCompositumOutputMul', direction: 'increase' },
  },
  62: {
    id: 62,
    name: 'Volac',
    coefficient: 0.001,
    effect: { kind: 'penaltyReduction', channel: 'gamblerGeneration' },
  },
  63: {
    id: 63,
    name: 'Andras',
    coefficient: 0.001,
    effect: { kind: 'categoryTier', category: 'emptio', tiers: ['stellar'], direction: 'increase' },
  },
  65: {
    id: 65,
    name: 'Andrealphus',
    coefficient: 0.001,
    effect: { kind: 'invokingPower' },
  },
  66: {
    id: 66,
    name: 'Cimejes',
    coefficient: 0.001,
    effect: { kind: 'katabasis', rolls: ['maleficia'] },
  },
  67: {
    id: 67,
    name: 'Amdusias',
    coefficient: 0.001,
    // "Murder rate of non-Choleric reprobate types" — all murders already target non-Cholerics,
    // so this is an overall Choleric-murder-rate boost (composes with Aim #23). Haures #64
    // ("of Choleric reprobate type") stays deferred: the model has Cholerics as murderers, not
    // victims, so there is no Choleric-murder channel to lift.
    effect: { kind: 'modifier', field: 'cholericMurderRateMul', direction: 'increase' },
  },
  68: {
    id: 68,
    name: 'Belial',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'influenceRateMul', direction: 'increase' },
  },
  69: {
    id: 69,
    name: 'Decarabia',
    curve: 'log',
    coefficient: 1,
    effect: { kind: 'flatGen', resource: 'influence' },
  },
  70: {
    id: 70,
    name: 'Seere',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'emptioEfficiencyMul', direction: 'increase' },
  },
  72: {
    id: 72,
    name: 'Andromalius',
    coefficient: 0.001,
    effect: {
      kind: 'categoryTier',
      category: 'emptio',
      tiers: ['stellar', 'excellent', 'good'],
      direction: 'increase',
    },
  },
  71: {
    id: 71,
    name: 'Dantalion',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'suasioEfficiencyMul', direction: 'increase' },
  },
} as const;

/** Wired sigil ids in ascending order. */
export const SIGIL_IDS: readonly SigilId[] = Object.freeze(
  Object.keys(SIGILS)
    .map(Number)
    .sort((a, b) => a - b),
);

/** Lookup; undefined for unwired ids. */
export function sigilById(id: SigilId): SigilDef | undefined {
  return SIGILS[id];
}

/** True if the sigil is visible/bindable now (Semet hides until every Sin meets its gate). */
export function sigilVisible(state: GameState, def: SigilDef): boolean {
  if (def.gateAllSinsLevel === undefined) return true;
  for (const s of SINS) {
    if (sinLevel(state.devotion[s]) < def.gateAllSinsLevel) return false;
  }
  return true;
}

/** A bound sigil's effect strength: `coefficient × magnitude(curve, boundSouls)`. */
export function sigilStrength(def: SigilDef, boundSouls: BigNum): number {
  return def.coefficient * bindingMagnitude(def.curve ?? 'sqrt', boundSouls);
}

/** Partial scalar/tier contributions from every bound sigil, for computeModifiers to fold in. */
export interface SigilContributions {
  readonly scalar: Partial<Record<ScalarModifierField, number>>;
  readonly tier: Partial<Record<Tier, number>>;
}

/**
 * Aggregate the in-lifetime multiplier contributions of all bound sigils. Each contribution is a
 * multiplier (`1 + strength` / `1 / (1 + strength)`); multiple sigils on the same field compose
 * multiplicatively. Returns 1-valued (absent) entries omitted so computeModifiers can fold cleanly.
 */
export function sigilModifierContributions(state: GameState, effectMul = 1): SigilContributions {
  const scalar: Partial<Record<ScalarModifierField, number>> = {};
  const tier: Partial<Record<Tier, number>> = {};
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def) continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    if (def.effect.kind === 'modifier') {
      const mul = def.effect.direction === 'increase' ? 1 + s : 1 / (1 + s);
      scalar[def.effect.field] = (scalar[def.effect.field] ?? 1) * mul;
    } else if (def.effect.kind === 'tier') {
      const mul = def.effect.direction === 'increase' ? 1 + s : 1 / (1 + s);
      tier[def.effect.tier] = (tier[def.effect.tier] ?? 1) * mul;
    }
  }
  return { scalar, tier };
}

/**
 * Per-CATEGORY tier-weight contributions from bound sigils (Agares/Beleth/Botis/Ipos/Astaroth/Andras/
 * Andromalius/Naberius). Distinct from the global `tier` contributions in `sigilModifierContributions`
 * because these target a single Opera category's distribution. Composed by `categoryTierModifiers`
 * alongside the Resignation/Retribution success shifts. `effectMul` carries the sigil-effect enhancers.
 */
export function sigilCategoryTierContributions(
  state: GameState,
  category: SigilCategory,
  effectMul = 1,
): Partial<Record<Tier, number>> {
  const out: Partial<Record<Tier, number>> = {};
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'categoryTier' || def.effect.category !== category) continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    const mul = def.effect.direction === 'increase' ? 1 + s : 1 / (1 + s);
    for (const t of def.effect.tiers) out[t] = (out[t] ?? 1) * mul;
  }
  return out;
}

/**
 * Per-Sin invocation-effectiveness multipliers from bound sigils (Samigina/Barbatos/Bune/Berith/
 * Furfur/Vepar/Shax/Alloces). Each is a `(1 + strength)` factor on the effectiveness of invocations
 * belonging to that Sin; consumed by `computeModifiers` (passive magnitudes) and the runner engine
 * (autonomous channels) via `invocationSinEffectivenessMul`. `effectMul` carries the sigil enhancers.
 */
export function sigilInvocationSinContributions(
  state: GameState,
  effectMul = 1,
): Partial<Record<Sin, number>> {
  const out: Partial<Record<Sin, number>> = {};
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'invocationSin') continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    out[def.effect.sin] = (out[def.effect.sin] ?? 1) * (1 + s);
  }
  return out;
}
/**
 * Per-channel subtype-penalty reduction factors from bound sigils (Gaap/Malphas/Gremory/Volac). Each
 * value is a `(1 + strength)` divisor (≥ 1) applied to that penalty channel's per-count coefficient in
 * `computeModifiers`, softening the penalty toward zero. `effectMul` carries the sigil enhancers.
 */
export function sigilPenaltyReductionByChannel(
  state: GameState,
  effectMul = 1,
): Partial<Record<PenaltyChannel, number>> {
  const out: Partial<Record<PenaltyChannel, number>> = {};
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'penaltyReduction') continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    out[def.effect.channel] = (out[def.effect.channel] ?? 1) * (1 + s);
  }
  return out;
}

/**
 * Flat per-second resource generation from the log-curve generator sigils (Haagenti #48 → gold,
 * Decarabia #69 → influence). Each contributes its `coefficient × ln(1 + souls)` directly (additive,
 * not a multiplier). Consumed by `computeModifiers` → `flatGoldPerSecond` / `flatInfluencePerSecond`,
 * which the tick accrues. `effectMul` carries the sigil enhancers.
 */
export function sigilFlatGeneration(
  state: GameState,
  effectMul = 1,
): { gold: number; influence: number } {
  let gold = 0;
  let influence = 0;
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'flatGen') continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    if (def.effect.resource === 'gold') gold += s;
    else influence += s;
  }
  return { gold, influence };
}

/**
 * Flat invoking power contributed by bound sigils (Andrealphus #65), rounded to an integer per the
 * sheet ("+invoking power, round to int"). Added to the maleficia total in `currentInvokingPower`,
 * so it counts toward the invocation gates. `effectMul` carries the sigil enhancers.
 */
export function sigilInvokingPower(state: GameState, effectMul = 1): number {
  let total = 0;
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'invokingPower') continue;
    total += sigilStrength(def, bound) * effectMul;
  }
  return Math.round(total);
}

/**
 * Per-channel cost-reduction divisors from bound sigils (Paimon/Orobas/Amy). Each value is a
 * `(1 + strength)` factor (≥ 1; default 1 = no reduction) that the corresponding cost site divides by.
 * `effectMul` carries the sigil enhancers.
 */
export function sigilCostReductionByChannel(
  state: GameState,
  effectMul = 1,
): Partial<Record<CostChannel, number>> {
  const out: Partial<Record<CostChannel, number>> = {};
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'costReduction') continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    out[def.effect.channel] = (out[def.effect.channel] ?? 1) * (1 + s);
  }
  return out;
}

/**
 * Per-subtype conversion-bias multipliers from bound sigils (Eligos #15, Phenex #37 → Celebrity).
 * Each is a `(1 + strength)` factor on that subtype's weight in `biasedSubtype`, composed
 * multiplicatively with each other and with the apex Specunitas bias (the shared `conversionBiasMul`
 * seam in `dynamics.ts`). Strictly multiplicative on existing weights — these cannot manufacture a
 * conversion from a subtype with zero active source. `effectMul` carries the sigil enhancers.
 */
export function sigilConversionBiasContributions(
  state: GameState,
  effectMul = 1,
): Partial<Record<ReprobateSubtype, number>> {
  const out: Partial<Record<ReprobateSubtype, number>> = {};
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'conversionBias') continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    out[def.effect.subtype] = (out[def.effect.subtype] ?? 1) * (1 + s);
  }
  return out;
}

/**
 * Per-subtype murder-victim bias from bound sigils (Glasya-Labolas #25 → Celebrity, Sabnock #43 →
 * Glutton, Camio #53 → Degenerate). Each is a `(1 + strength)` factor on that subtype's weight when
 * a Choleric murder picks its victim (see `removeOneNonCholeric` in `dynamics.ts`) — redistributing
 * which non-Choleric dies, not the total murder count. Composed multiplicatively. `effectMul` carries
 * the sigil enhancers.
 */
export function sigilMurderBiasContributions(
  state: GameState,
  effectMul = 1,
): Partial<Record<ReprobateSubtype, number>> {
  const out: Partial<Record<ReprobateSubtype, number>> = {};
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'murderBias') continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    out[def.effect.subtype] = (out[def.effect.subtype] ?? 1) * (1 + s);
  }
  return out;
}

/**
 * Probability that an Indagatio search surfaces a SECOND maleficium (Furcas #50). Sums each bound
 * such sigil's strength, clamped to [0, 1]; consumed by `resolveIndagatio` in `actions.ts`. `effectMul`
 * carries the sigil enhancers.
 */
export function sigilIndagatioDoubleFindChance(state: GameState, effectMul = 1): number {
  let p = 0;
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'indagatioDoubleFind') continue;
    p += sigilStrength(def, bound) * effectMul;
  }
  return Math.min(1, Math.max(0, p));
}

/**
 * Offline-only income multipliers from bound sigils (Sallos #19 → gold, Forneus #30 → influence).
 * Each is a `(1 + strength)` factor applied to that resource's income during the `resumeGame` offline
 * catch-up only (threaded through `TickDeps`); online ticks are unaffected. `effectMul` carries the
 * sigil enhancers.
 */
export function sigilOfflineResourceMul(
  state: GameState,
  effectMul = 1,
): { gold: number; influence: number } {
  let gold = 1;
  let influence = 1;
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'offlineResource') continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    if (def.effect.resource === 'gold') gold *= 1 + s;
    else influence *= 1 + s;
  }
  return { gold, influence };
}

/**
 * Per-invocation effectiveness multipliers from bound sigils (Buer #10 → Familiar, Sitri #12 →
 * Succubus). Each is a `(1 + strength)` factor on that specific invocation's effect coefficient,
 * keyed by invocation id (distinct from the per-Sin `invocationSin` sigils). Consumed in
 * `computeModifiers` via `invEffForInv(id)`. `effectMul` carries the sigil enhancers.
 */
export function sigilInvocationEffectContributions(
  state: GameState,
  effectMul = 1,
): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'invocationEffect') continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    out[def.effect.invocation] = (out[def.effect.invocation] ?? 1) * (1 + s);
  }
  return out;
}

export function sigilKatabasisBonus(state: GameState, roll: KatabasisRoll, effectMul = 1): number {
  let bonus = 0;
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'katabasis') continue;
    if (def.effect.rolls.includes(roll)) bonus += sigilStrength(def, bound);
  }
  return bonus * effectMul;
}

/** Convenience for tests/UI: the maximum Sin level any gate could require. */
export const SIGIL_MAX_GATE = MAX_SIN_LEVEL;
