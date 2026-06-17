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
import { SINS, type GameState, type SigilId, type Sin } from './state.js';
import { type Tier } from './probability.js';
// The 72-sigil catalog lives in `sigils.data.ts` (the editable economy knobs); imported for the
// logic here and re-exported so `import { SIGILS } from './sigils.js'` keeps working.
import { SIGILS } from './sigils.data.js';
export { SIGILS };

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
  | 'murderRateMul'
  | 'vitiumMercaturaOutputMul'
  | 'vitiumMercaturaGenerationMul'
  | 'vitiumCompositumOutputMul'
  | 'vitiumCompositumInfluenceOutputMul'
  | 'vitiumCompositumEffectMul'
  | 'acolyteEfficiencyMul'
  | 'invocationEfficiencyMul'
  | 'offlineTimeMul';

/** Which Katabasis carry-over roll a sigil's bonus feeds. */
export type KatabasisRoll = 'gold' | 'reprobate' | 'maleficia';

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
  | { readonly kind: 'costReduction'; readonly channel: CostChannel }
  | { readonly kind: 'indagatioDoubleFind' }
  | { readonly kind: 'offlineResource'; readonly resource: 'gold' | 'influence' | 'generation' }
  | { readonly kind: 'invocationEffect'; readonly invocation: string }
  | { readonly kind: 'shutdownRefund' }
  | { readonly kind: 'duplicateOutput'; readonly category: 'suasio' | 'decimatio' | 'indagatio' }
  | { readonly kind: 'murderTriggersSuicide' }
  | { readonly kind: 'offlineActionEfficiency' }
  | { readonly kind: 'offlineAccrualWindow' }
  | { readonly kind: 'maleficiaEffect' }
  | { readonly kind: 'sigilEffect' }
  | { readonly kind: 'katabasis'; readonly rolls: readonly KatabasisRoll[] };

/** The four Opera action categories a per-category tier sigil can target. */
export type SigilCategory = 'suasio' | 'decimatio' | 'indagatio' | 'emptio';

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
    } else if (def.effect.kind === 'modifierMulti') {
      // Amy #58 — one binding, several fields, the same strength on each (cursed: 'decrease').
      const mul = def.effect.direction === 'increase' ? 1 + s : 1 / (1 + s);
      for (const f of def.effect.fields) scalar[f] = (scalar[f] ?? 1) * mul;
    } else if (def.effect.kind === 'tierGroup') {
      // Bael #1 / Balam #51 / Amdusias #67 — a whole tier group, ALL Opera categories.
      const mul = def.effect.direction === 'increase' ? 1 + s : 1 / (1 + s);
      for (const t of def.effect.tiers) tier[t] = (tier[t] ?? 1) * mul;
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
): { gold: number; influence: number; generation: number } {
  const out = { gold: 1, influence: 1, generation: 1 };
  for (const [idStr, bound] of Object.entries(state.sigilBindings)) {
    if (bound === undefined) continue;
    const def = sigilById(Number(idStr));
    if (!def || def.effect.kind !== 'offlineResource') continue;
    const s = sigilStrength(def, bound) * effectMul;
    if (s <= 0) continue;
    out[def.effect.resource] *= 1 + s;
  }
  return out;
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
 * Multiplier on the business-shutdown gold refund fraction from bound `shutdownRefund` sigils
 * (Vine #45). Composed `(1 + strength)`; 1× when none are bound (refund unchanged). The caller
 * clamps the effective fraction to ≤ 1 so a shutdown can never refund more than the build cost.
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
/** Σ strengths of one parameterless chance/strength kind across bound sigils. */
function sumKind(
  state: GameState,
  kind:
    | 'murderTriggersSuicide'
    | 'offlineActionEfficiency'
    | 'offlineAccrualWindow'
    | 'maleficiaEffect'
    | 'sigilEffect',
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

/** Marax #21: ×(1 + Σ) on action-timer advancement during offline catch-up only. */
export function sigilOfflineActionEfficiencyMul(state: GameState, effectMul = 1): number {
  return 1 + sumKind(state, 'offlineActionEfficiency', effectMul);
}

/** Foras #31: ×(1 + Σ) on the offline accrual window (the Acedia-compound saturation cap). */
export function sigilOfflineAccrualWindowMul(state: GameState, effectMul = 1): number {
  return 1 + sumKind(state, 'offlineAccrualWindow', effectMul);
}

/**
 * Gaap #33 (+maleficia effect %): inflates the BONUS part of the maleficia sigil-enhancer stack —
 * `1 + (raw − 1) × (1 + gaap)`. Gaap's own strength is read against the raw stack (no circularity).
 */
export function sigilMaleficiaEffectMul(state: GameState, rawMaleficiaMul: number): number {
  const gaap = sumKind(state, 'maleficiaEffect', rawMaleficiaMul);
  return 1 + (rawMaleficiaMul - 1) * (1 + gaap);
}

/**
 * Semet #32 (+sigil effect %): the Eternal Sin's sigil scales every OTHER sigil's strength —
 * the final per-sigil effect multiplier is `maleficiaMul × (1 + semet)`. Semet's own strength is
 * read against the (Gaap-inflated) maleficia stack, never against itself.
 */
export function sigilSelfEffectMul(state: GameState, maleficiaMul: number): number {
  return 1 + sumKind(state, 'sigilEffect', maleficiaMul);
}

export const SIGIL_MAX_GATE = MAX_SIN_LEVEL;
