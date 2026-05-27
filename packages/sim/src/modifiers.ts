/**
 * Modifier engine — the single place where derived multipliers are aggregated from every source
 * (Sin levels, Sin skill intensities, sigil bindings, maleficia, invocations, reprobate subtypes)
 * and consumed by tick / actions / probability resolution. Pure; no I/O; reads only `GameState`.
 *
 * This first slice wires the sources whose target systems already exist:
 *   - Sin LEVELS:  Gula → playerEfficiencyMul (2× / level, 03 §1 / Sins & Devotion sheet)
 *                 Vanagloria → influenceRateMul (1.5× / level)
 *   - Sin SKILLS:  Avaritia (Golden Hand) → goldRateMul
 *                 Vanagloria (Acclaim)   → maxInfluenceMul
 *
 * Other Sin effects (Tristitia → suicide rate, Ira → acolyte/invocation eff, Acedia → offline,
 * Luxuria → reprobate generation, Superbia/Gula → tier probability shifts) attach as their target
 * systems land — same module, same signature, just a new line per source. Sigil/maleficia/
 * invocation/reprobate-subtype effects fold in the same way.
 *
 * Skill→effect coupling for now: a skill that "increases X" multiplies X by (1 + intensity). The
 * spreadsheet's `SKILL_INTENSITY_DIVISOR` already sets the intensity curve; per-Sin coefficients on
 * top of this are a future tuning surface.
 */
import { type GameState } from './state.js';
import { sinLevel, skillIntensity } from './progression.js';

export interface Modifiers {
  /** Multiplier on the base gold-per-second rate. */
  readonly goldRateMul: number;
  /** Multiplier on the proportional influence-per-second rate. */
  readonly influenceRateMul: number;
  /** Multiplier on the lifetime `maxInfluence` (raises the cap). */
  readonly maxInfluenceMul: number;
  /** Multiplier on player action efficiency (cost/outcome scaling for Suasio/Decimatio). */
  readonly playerEfficiencyMul: number;
}

/** No sources active — every multiplier is 1. */
export const NEUTRAL_MODIFIERS: Modifiers = {
  goldRateMul: 1,
  influenceRateMul: 1,
  maxInfluenceMul: 1,
  playerEfficiencyMul: 1,
};

/** Default skill→effect coupling for a skill that "increases X": X *= (1 + intensity). */
const skillBonus = (intensity: number): number => 1 + intensity;

/** Resolve the modifier bundle from the current game state. */
export function computeModifiers(state: GameState): Modifiers {
  // Sin levels (03 §1 "Per-level effect", confirmed in `Sins & Devotion` sheet).
  const gulaLvl = sinLevel(state.devotion.gula);
  const vanagloriaLvl = sinLevel(state.devotion.vanagloria);

  // Sin skill intensities (continuous; intensity = ln(devotion)² / SKILL_INTENSITY_DIVISOR).
  const avaritiaIntensity = skillIntensity(state.devotion.avaritia);
  const vanagloriaIntensity = skillIntensity(state.devotion.vanagloria);

  return {
    goldRateMul: skillBonus(avaritiaIntensity), // Mammon — "Golden Hand: + gold gain rate"
    influenceRateMul: 1.5 ** vanagloriaLvl, // Rosier — "+50% influence gain rate / lvl (mult)"
    maxInfluenceMul: skillBonus(vanagloriaIntensity), // Rosier — "Acclaim: + maximum influence"
    playerEfficiencyMul: 2 ** gulaLvl, // Beelzebub — "+100% online player eff / lvl (mult)"
  };
}

/** Player efficiency only — the default `efficiency` arg for actions. */
export function playerEfficiency(state: GameState): number {
  return computeModifiers(state).playerEfficiencyMul;
}
