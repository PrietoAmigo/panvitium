/**
 * Sigil binding-to-effect curves (02 §5). The default is the `pct` percentage curve (player tuning):
 * a log base-33 curve shaped so a standard percentage sigil reads ~5% at 33 bound souls, ~16% at
 * 1k, ~31% at 100k, ~50% at ~39M, then keeps creeping up with NO cap — meaningful early, gentle
 * late, and far tamer than the old √ default (which was near-zero early and exploded late).
 * A standard sigil carries `coefficient: 1` (so its strength IS the curve); a weaker sigil scales it
 * down (Paimon 0.5; Zepar #16 / Marax #21 / Zagan #61 at 1/3). Some sigils override the curve to
 * `linear` (swingy) or `log` (the flat generators, Forneus #30's invoking power, Katabasis
 * carry-over); the `sqrt` curve is supported but no seal currently uses it. `bindingMagnitude`
 * returns the bare magnitude; a per-sigil coefficient multiplies it into a concrete effect strength.
 *
 * The catalog (03 §5) is the full Goetia numbering 1..72, with #32 = Semet. Every seal is now wired
 * with a demon name and a real effect. Each channel function below takes an `effectMul`: callers
 * ALWAYS pass `sigilStrengthMul(state)` (the sigil-effect relics, Gaap-boosted, × Semet #32; see
 * `sigilEffectStack`, ADR-036), so every enhancer reaches every seal.
 * The spreadsheet `Sigils` sheet stays authoritative for the effect magnitudes (the per-sigil
 * coefficients and curves in `sigils.data.ts`).
 */
import { type BigNum, add, floor, lte, ZERO } from './bignum.js';
import { MAX_SIN_LEVEL } from './constants.js';
import { maleficiaInvocationCostMul, rawRelicSigilMul } from './maleficia.js';
import { sinLevel } from './progression.js';
import { SINS, type GameState, type SigilId, type Sin } from './state.js';
import { type Tier } from './probability.js';
// The 72-sigil catalog lives in `sigils.data.ts` (the editable economy knobs); imported for the
// logic here and re-exported so `import { SIGILS } from './sigils.js'` keeps working.
import { SIGILS } from './sigils.data.js';
export { SIGILS };

export type BindingCurve = 'sqrt' | 'linear' | 'log' | 'pct';

/**
 * Coefficients of the default `pct` percentage curve:
 * `strength = SLOPE·log_BASE(souls) − INTERCEPT` (with `log_BASE(x) = log10(x) / log10(BASE)`),
 * clamped at 0. With BASE = 33 a standard sigil (coefficient 1) reads exactly 5% at 33 souls and 50%
 * at 33^5 (~39 million) souls; the intervening milestones (≈16% at 1k, ≈23% at 10k, ≈31% at 100k,
 * ≈38% at 1M) fall out of the same line, and it keeps rising ~SLOPE per BASE-fold of souls with no
 * cap. Player-chosen (see the binding-curve note above); the BASE sets how fast the curve grows (a
 * larger base spreads the same milestones over more orders of magnitude — 10 is steep, 100 gentle).
 * Tune here to reshape every percentage sigil at once.
 */
const PCT_SLOPE = 0.1125;
const PCT_INTERCEPT = 0.0625;
const PCT_LOG_BASE = 33;
const PCT_LOG_BASE_LOG10 = Math.log10(PCT_LOG_BASE);

/**
 * The magnitude a sigil's effect scales by, given the souls bound to it. Returned as a number:
 * pct/sqrt/log keep magnitudes small, and linear stays within Number's exact-integer range for any
 * realistic binding.
 */
export function bindingMagnitude(curve: BindingCurve, boundSouls: BigNum): number {
  const x = floor(boundSouls);
  if (lte(x, ZERO)) return 0;
  if (curve === 'linear') return x.toNumber();
  if (curve === 'log') return Math.max(0, add(x, 1).ln());
  if (curve === 'sqrt') return x.sqrt().toNumber();
  // 'pct' — the default: a log base-33 percentage curve (5% at 33 souls, 50% at ~39M, no cap).
  return Math.max(0, PCT_SLOPE * (x.log10() / PCT_LOG_BASE_LOG10) - PCT_INTERCEPT);
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
  | 'murderRateMul'
  | 'faenerationOutputMul'
  | 'acolyteEfficiencyMul'
  | 'invocationEfficiencyMul'
  // Desidia levers (ADR-033/034): the offline-gain rate, the cap, and the two Desidia
  // multipliers, all sigil-targetable. Sitri #12, Orias #59, Foras #31 and Sallos #19 bind here.
  | 'desidiaGainMul'
  | 'desidiaMaxMul'
  | 'desidiaSpeedMul'
  | 'desidiaDrainMul';

/** Which Katabasis carry-over roll a sigil's bonus feeds. */
export type KatabasisRoll = 'gold' | 'reprobate' | 'maleficia';

/**
 * One modifier effect: multiply a scalar modifier-bundle field by `(1 + strength)` (increase) or
 * `1/(1 + strength)` (decrease). Named so a `composite` seal can carry several of them.
 */
export interface ModifierEffect {
  readonly kind: 'modifier';
  readonly field: ScalarModifierField;
  readonly direction: 'increase' | 'decrease';
}

/** One cost-reduction effect: divide a cost channel by `(1 + strength)`. Named for `composite`. */
export interface CostReductionEffect {
  readonly kind: 'costReduction';
  readonly channel: CostChannel;
}

/**
 * A sigil's effect. `modifier`/`tier` multiply an in-lifetime value by `(1 + strength)` (increase)
 * or `1/(1 + strength)` (decrease) — the same convention as Sin skills (ADR-022). `katabasis` adds
 * `strength` (a flat fraction) to one or more carry-over rolls. `composite` (ADR-035) bundles several
 * modifier / cost-reduction parts onto one seal, ALL sharing the seal's single strength: a tradeoff
 * seal that lifts one lever while it softens another (Raum #40, Dantalion #71), or a dual seal that
 * spans two systems at once (Andrealphus #65).
 */
export type SigilEffect =
  | ModifierEffect
  | {
      readonly kind: 'tierGroup';
      readonly tiers: readonly Tier[];
      readonly direction: 'increase' | 'decrease';
    }
  | {
      readonly kind: 'modifierMulti';
      readonly fields: readonly ScalarModifierField[];
      readonly direction: 'increase' | 'decrease';
    }
  | {
      readonly kind: 'categoryTier';
      readonly category: SigilCategory;
      readonly tiers: readonly Tier[];
      readonly direction: 'increase' | 'decrease';
    }
  | { readonly kind: 'invocationSin'; readonly sin: Sin }
  | {
      readonly kind: 'flatGen';
      readonly resource: 'gold' | 'influence' | 'generation' | 'suicideRate' | 'murderRate';
    }
  | { readonly kind: 'invokingPower' }
  | CostReductionEffect
  | { readonly kind: 'indagatioDoubleFind' }
  | { readonly kind: 'invocationEffect'; readonly invocation: string }
  | { readonly kind: 'shutdownRefund' }
  | { readonly kind: 'duplicateOutput'; readonly category: 'suasio' | 'decimatio' | 'indagatio' }
  | { readonly kind: 'murderTriggersSuicide' }
  | { readonly kind: 'maleficiaEffect' }
  | { readonly kind: 'sigilEffect' }
  | { readonly kind: 'katabasis'; readonly rolls: readonly KatabasisRoll[] }
  | {
      readonly kind: 'composite';
      readonly effects: readonly (ModifierEffect | CostReductionEffect)[];
    };

/** The four Opera action categories a per-category tier sigil can target. */
export type SigilCategory = 'suasio' | 'decimatio' | 'indagatio' | 'emptio';

/**
 * A cost a sigil can soften (Paimon/Orobas/Zepar/Andrealphus/Eligos). `influence` = action influence
 * costs, `invocation` = ALL invocation costs (every per-second upkeep drain, flat or %-of-gain, and
 * Aurevora's gold drain; ADR-035/036, composed by `invocationCostMul`), `emptioGold` = the Emptio
 * purchase gold. Each sigil divides its cost by `(1 + strength)` (never below zero, never an
 * increase).
 */
export type CostChannel = 'influence' | 'invocation' | 'emptioGold';

export interface SigilDef {
  readonly id: SigilId;
  readonly name: string;
  /** Binding curve; omitted means the `pct` percentage default (02 §5; player tuning). */
  readonly curve?: BindingCurve;
  /**
   * Per-sigil scalar applied to the binding magnitude. For the default `pct` curve this reads as a
   * plain strength multiplier: 1 = the standard percentage curve, 0.5 = half as strong, etc.
   */
  readonly coefficient: number;
  readonly effect: SigilEffect;
  /**
   * Semet (#32) is hidden until every Cardinal Sin is at level ≥ 2 (03 §5/§8). All other sigils are
   * exposed from the start. Encoded as a minimum level required in EVERY Sin.
   */
  readonly gateAllSinsLevel?: number;
}

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
  return def.coefficient * bindingMagnitude(def.curve ?? 'pct', boundSouls);
}

/** Partial scalar/tier contributions from every bound sigil, for computeModifiers to fold in. */
export interface SigilContributions {
  readonly scalar: Partial<Record<ScalarModifierField, number>>;
  readonly tier: Partial<Record<Tier, number>>;
}

/**
 * A sigil effect's parts: a `composite` seal yields its bundled parts; every other effect yields
 * itself. Each dispatch function iterates these so a composite contributes to whichever channel its
 * parts belong to, all at the seal's single strength (ADR-035).
 */
export function effectParts(effect: SigilEffect): readonly SigilEffect[] {
  return effect.kind === 'composite' ? effect.effects : [effect];
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
    // `composite` (Raum #40, Dantalion #71, Andrealphus #65) folds each of its modifier parts here
    // at the seal's single strength; its cost-reduction part is picked up by the cost function.
    for (const part of effectParts(def.effect)) {
      if (part.kind === 'modifier') {
        const mul = part.direction === 'increase' ? 1 + s : 1 / (1 + s);
        scalar[part.field] = (scalar[part.field] ?? 1) * mul;
      } else if (part.kind === 'modifierMulti') {
        // Amy #58 — one binding, several fields, the same strength on each (cursed: 'decrease').
        const mul = part.direction === 'increase' ? 1 + s : 1 / (1 + s);
        for (const f of part.fields) scalar[f] = (scalar[f] ?? 1) * mul;
      } else if (part.kind === 'tierGroup') {
        // Bael #1 / Balam #51 / Amdusias #67 — a whole tier group, ALL Opera categories.
        const mul = part.direction === 'increase' ? 1 + s : 1 / (1 + s);
        for (const t of part.tiers) tier[t] = (tier[t] ?? 1) * mul;
      }
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
 * belonging to that Sin; consumed by `computeModifiers`, which scales each efficiency-derived
 * invocation magnitude by its own Sin's term. `effectMul` carries the sigil enhancers.
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
 * Flat per-second resource generation from the log-curve generator sigils (Haagenti #48 → gold,
 * Decarabia #69 → influence). Each contributes its `coefficient × ln(1 + souls)` directly (additive,
 * not a multiplier). Consumed by `computeModifiers` → `flatGoldPerSecond` / `flatInfluencePerSecond`,
 * which the tick accrues. `effectMul` carries the sigil enhancers.
 */
export function sigilFlatGeneration(
  state: GameState,
  effectMul = 1,
): {
  gold: number;
  influence: number;
  generation: number;
  suicideRate: number;
  murderRate: number;
} {
  const out = { gold: 0, influence: 0, generation: 0, suicideRate: 0, murderRate: 0 };
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'flatGen') continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    out[def.effect.resource] += s;
  }
  return out;
}

/**
 * Flat invoking power contributed by bound sigils (Forneus #30), rounded to an integer per the
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
    if (!def) continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    // Andrealphus #65 carries its cost-reduction as one part of a composite; iterate parts so it
    // composes with the pure cost-reduction seals (Paimon #9, Orobas #55, Zepar #16, Eligos #15).
    for (const part of effectParts(def.effect)) {
      if (part.kind !== 'costReduction') continue;
      out[part.channel] = (out[part.channel] ?? 1) * (1 + s);
    }
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

/**
 * Multiplier on the Thesaurus withdrawal-recovery fraction from bound `shutdownRefund` sigils
 * (Vine #45, Furcas #50 — the same "recovery" niche they held for the Mercatus divest). Composed
 * `(1 + strength)`; 1× when none are bound. Folded into `thesaurusRecoveryMul` by
 * `computeModifiers`; the effective fraction is capped (0.9) at the withdraw site.
 */
export function sigilShutdownRefundMul(state: GameState, effectMul = 1): number {
  let mul = 1;
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'shutdownRefund') continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s > 0) mul *= 1 + s;
  }
  return mul;
}

/**
 * The Katabasis carry-over bonus one roll receives from bound sigils, as a FRACTION added to that
 * roll's kept-fraction (Purson→gold, Camio→reprobate, Cimejes→maleficia). Each sigil's `sigilStrength`
 * is the Sigils sheet's raw yield (`coeff × curve(bound)`), which the sheet defines to apply "as a
 * percentage" (Camio at 100 souls yields ln(101) ≈ 4.6, i.e. +4.6 percentage points), so it is
 * divided by 100 before being added to a [0,1] carry-over fraction. Without the ÷100 a few bound
 * souls saturated every carry-over roll to 100% (the Camio "too powerful" bug).
 */
export function sigilKatabasisBonus(state: GameState, roll: KatabasisRoll, effectMul = 1): number {
  let bonus = 0;
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'katabasis') continue;
    if (def.effect.rolls.includes(roll)) bonus += sigilStrength(def, bound);
  }
  return (bonus / 100) * effectMul;
}

/** Convenience for tests/UI: the maximum Sin level any gate could require. */
/** Σ strengths of one parameterless chance/strength kind across bound sigils. */
function sumKind(
  state: GameState,
  kind: 'murderTriggersSuicide' | 'maleficiaEffect' | 'sigilEffect',
  effectMul = 1,
): number {
  let total = 0;
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== kind) continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s > 0) total += s;
  }
  return total;
}

/**
 * Chance to duplicate an Opera category's POSITIVE output (Agares #2 Indagatio, Malphas #39
 * Suasio, Focalor #41 Decimatio). Rolled once per resolution in `resolveAction`; only
 * Stellar/Excellent/Good outcomes duplicate — the curse never doubles a catastrophe.
 */
export function sigilDuplicateOutputChance(
  state: GameState,
  category: 'suasio' | 'decimatio' | 'indagatio',
  effectMul = 1,
): number {
  let total = 0;
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'duplicateOutput' || def.effect.category !== category) continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s > 0) total += s;
  }
  return Math.min(1, total);
}

/** Leraie #14: the chance each murder also drives a witness to the rope (a coupled suicide). */
export function sigilMurderTriggersSuicideChance(state: GameState, effectMul = 1): number {
  return Math.min(1, sumKind(state, 'murderTriggersSuicide', effectMul));
}

/**
 * The sigil-effect stack (ADR-036): the two global scalers every sigil and maleficium reads.
 *   - `sigilMul` multiplies EVERY sigil's strength in EVERY channel (the passive modifier bundle,
 *     per-category tiers, cost reductions, invoking power, duplicate-output and double-find chances,
 *     Thesaurus recovery, Katabasis carry-over). Semet #32 alone is excluded: it cannot scale itself.
 *   - `maleficiaBoost` (1 + Gaap #33's strength) multiplies EVERY maleficium's effect magnitude
 *     (rates, flats, the single-use buffs, Black Vessel's cost cut and the sigil-effect relics' own
 *     bonus). Consumers apply it through `boostMaleficiumFactor`, so a boosted cut never inverts.
 *
 * Evaluated in one acyclic order so no seal feeds itself:
 *   1. `raw`: the sigil-effect relics' bonus as printed (Solomon's Ring, Picatrix, Teraphim).
 *   2. Semet's strength, read against `raw`.
 *   3. Gaap's strength, read against `raw × (1 + semet)` (Semet reaches Gaap like any other seal).
 *   4. The relics' bonus, boosted by Gaap: `1 + (raw − 1) × (1 + gaap)` (relics are maleficia).
 *   5. `sigilMul = relics × (1 + semet)`.
 */
export interface SigilEffectStack {
  readonly sigilMul: number;
  readonly maleficiaBoost: number;
}

export function sigilEffectStack(state: GameState): SigilEffectStack {
  const raw = rawRelicSigilMul(state.lifetime.maleficia);
  const semet = sumKind(state, 'sigilEffect', raw);
  const gaap = sumKind(state, 'maleficiaEffect', raw * (1 + semet));
  const maleficiaBoost = 1 + gaap;
  const relics = 1 + (raw - 1) * maleficiaBoost;
  return { sigilMul: relics * (1 + semet), maleficiaBoost };
}

/** The multiplier on every sigil's strength in every channel (`sigilEffectStack(state).sigilMul`). */
export function sigilStrengthMul(state: GameState): number {
  return sigilEffectStack(state).sigilMul;
}

/**
 * The multiplier on EVERY invocation cost (ADR-035/036): each per-second upkeep drain, flat or
 * %-of-gain/%-of-pool, and Aurevora's exponential gold drain. The invocation cost channel (Orobas
 * #55, Zepar #16, Andrealphus #65) divides by `1 + strength`, and Black Vessel adds its own
 * `1/(1 + k)` cut (−7% at base, deepened by Gaap). 1 when no source is present.
 */
export function invocationCostMul(
  state: GameState,
  stack: SigilEffectStack = sigilEffectStack(state),
): number {
  const red = sigilCostReductionByChannel(state, stack.sigilMul).invocation ?? 1;
  return maleficiaInvocationCostMul(state.lifetime.maleficia, stack.maleficiaBoost) / red;
}

export const SIGIL_MAX_GATE = MAX_SIN_LEVEL;
