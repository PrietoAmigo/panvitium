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
import { type BigNum, floor, lte, ZERO } from './bignum.js';
import { MAX_SIN_LEVEL } from './constants.js';
import { sinLevel } from './progression.js';
import { SINS, type GameState, type SigilId } from './state.js';
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
  if (curve === 'log') return Math.max(0, x.log10());
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
  | 'reprobateGenerationRateMul'
  | 'reprobateSuicideRateMul'
  | 'cholericMurderRateMul'
  | 'vitiumMercaturaOutputMul'
  | 'acolyteEfficiencyMul';

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
  | { readonly kind: 'katabasis'; readonly rolls: readonly KatabasisRoll[] };

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
  11: {
    id: 11,
    name: 'Gusion',
    coefficient: 0.001,
    effect: { kind: 'tier', tier: 'terrible', direction: 'decrease' },
  },
  16: {
    id: 16,
    name: 'Zepar',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'reprobateGenerationRateMul', direction: 'decrease' },
  },
  18: {
    id: 18,
    name: 'Bathin',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'acolyteEfficiencyMul', direction: 'increase' },
  },
  20: {
    id: 20,
    name: 'Purson',
    coefficient: 0.001,
    effect: { kind: 'katabasis', rolls: ['gold'] },
  },
  23: {
    id: 23,
    name: 'Aim',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'cholericMurderRateMul', direction: 'increase' },
  },
  31: {
    id: 31,
    name: 'Foras',
    coefficient: 0.001,
    effect: { kind: 'tier', tier: 'apocalyptic', direction: 'decrease' },
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
  38: {
    id: 38,
    name: 'Halphas',
    coefficient: 0.001,
    effect: { kind: 'katabasis', rolls: ['maleficia'] },
  },
  40: {
    id: 40,
    name: 'Raum',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'decimatioEfficiencyMul', direction: 'increase' },
  },
  49: {
    id: 49,
    name: 'Crocell',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'reprobateSuicideRateMul', direction: 'increase' },
  },
  60: {
    id: 60,
    name: 'Vapula',
    coefficient: 0.001,
    effect: { kind: 'modifier', field: 'vitiumMercaturaOutputMul', direction: 'increase' },
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

/** Summed additive bonus to one Katabasis carry-over roll from all bound sigils that feed it. */
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
