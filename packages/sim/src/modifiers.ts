/**
 * Modifier engine — the single place where derived multipliers are aggregated from every source
 * (Sin levels, Sin skill intensities, sigil bindings, maleficia, invocations, reprobate subtypes)
 * and consumed by tick / actions / probability resolution. Pure; no I/O; reads only `GameState`.
 *
 * Sources wired so far:
 *   - Sin LEVELS:  Gula → playerEfficiencyMul (2× / level, 03 §1 / Sins & Devotion sheet)
 *                 Vanagloria → influenceRateMul (1.5× / level)
 *   - Sin SKILLS:  Avaritia  (Golden Hand)    → goldRateMul
 *                 Vanagloria (Acclaim)        → maxInfluenceMul
 *                 Leviathan  (Resignation)    → suasioEfficiencyMul  (per-category eff)
 *                 Satan      (Retribution)    → decimatioEfficiencyMul
 *                 Gula       (Insatiability)  → tierWeightMul.{terrible, apocalyptic} (damped)
 *                 Lucifer    (Morning Star)   → tierWeightMul.stellar (lifted)
 *   - MALEFICIA:  Spear of Longinus           → maxInfluenceMul × 3
 *                 Codex Gigas                 → influenceRateMul × 3
 *                 Thirty Pieces of Silver     → goldRateMul × 3
 *                 Mark of Cain                → tierWeightMul.apocalyptic = 0
 *
 * Other Sin effects (Tristitia → suicide rate, Ira → acolyte/invocation eff, Acedia → offline,
 * Luxuria → reprobate generation, Resignation/Retribution → per-category tier shifts) attach as
 * their target systems land — same module, same signature, just a new line per source.
 *
 * Skill→effect coupling for now: a skill that "increases X" multiplies X by (1 + intensity); a
 * skill that "decreases X" divides by the same (asymptotic to 0, never negative). The
 * spreadsheet's `SKILL_INTENSITY_DIVISOR` already sets the intensity curve; per-Sin coefficients on
 * top of this are a future tuning surface.
 */
import { type GameState } from './state.js';
import { sinLevel, skillIntensity } from './progression.js';
import { type TierModifiers } from './probability.js';
import { countCopies } from './maleficia.js';

export interface Modifiers {
  /** Multiplier on the base gold-per-second rate. */
  readonly goldRateMul: number;
  /** Multiplier on the proportional influence-per-second rate. */
  readonly influenceRateMul: number;
  /** Multiplier on the lifetime `maxInfluence` (raises the cap). */
  readonly maxInfluenceMul: number;
  /** Multiplier on the player's own action efficiency (Gula). Stacks with category eff. */
  readonly playerEfficiencyMul: number;
  /** Multiplier on Suasio-category action efficiency (Leviathan / Resignation). */
  readonly suasioEfficiencyMul: number;
  /** Multiplier on Decimatio-category action efficiency (Satan / Retribution). */
  readonly decimatioEfficiencyMul: number;
  /** Per-tier multipliers applied to action weights before renormalization (resolveAction). */
  readonly tierWeightMul: TierModifiers;
}

/** No sources active — every multiplier is 1; tier shifts are absent (all default 1). */
export const NEUTRAL_MODIFIERS: Modifiers = {
  goldRateMul: 1,
  influenceRateMul: 1,
  maxInfluenceMul: 1,
  playerEfficiencyMul: 1,
  suasioEfficiencyMul: 1,
  decimatioEfficiencyMul: 1,
  tierWeightMul: {},
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
  const tristitiaIntensity = skillIntensity(state.devotion.tristitia);
  const iraIntensity = skillIntensity(state.devotion.ira);
  const gulaIntensity = skillIntensity(state.devotion.gula);
  const superbiaIntensity = skillIntensity(state.devotion.superbia);

  // Equipped maleficia (03 §4). Each anathema item is a single, decisive multiplier.
  const owned = state.lifetime.maleficia;
  const hasSpear = countCopies(owned, 'spear_of_longinus') > 0;
  const hasCodex = countCopies(owned, 'codex_gigas') > 0;
  const hasSilver = countCopies(owned, 'thirty_pieces_of_silver') > 0;
  const hasMarkOfCain = countCopies(owned, 'mark_of_cain') > 0;

  // Build tier-weight muls incrementally; missing keys mean 1 in `applyTierModifiers`. Under
  // exactOptionalPropertyTypes we never assign `undefined`, so increments are gated on > 0.
  const tierWeightMul: TierModifiers = {};
  if (gulaIntensity > 0) {
    // Insatiability: dampens the worst tiers asymptotically — never negative, never zero outright.
    const damp = 1 / (1 + gulaIntensity);
    tierWeightMul.terrible = damp;
    tierWeightMul.apocalyptic = damp;
  }
  if (superbiaIntensity > 0) {
    tierWeightMul.stellar = skillBonus(superbiaIntensity);
  }
  if (hasMarkOfCain) {
    // Anathema lock: the sevenfold guarantee zeroes the worst draw outright. Applies last so it
    // wins over Insatiability damping.
    tierWeightMul.apocalyptic = 0;
  }

  return {
    goldRateMul: skillBonus(avaritiaIntensity) * (hasSilver ? 3 : 1),
    influenceRateMul: 1.5 ** vanagloriaLvl * (hasCodex ? 3 : 1),
    maxInfluenceMul: skillBonus(vanagloriaIntensity) * (hasSpear ? 3 : 1),
    playerEfficiencyMul: 2 ** gulaLvl,
    suasioEfficiencyMul: skillBonus(tristitiaIntensity),
    decimatioEfficiencyMul: skillBonus(iraIntensity),
    tierWeightMul,
  };
}

/** Player efficiency only (Gula). The HUD shows this; per-action eff combines with category. */
export function playerEfficiency(state: GameState): number {
  return computeModifiers(state).playerEfficiencyMul;
}

/**
 * Player × category efficiency for an action category (03 §2.1/§2.2). Unknown / future categories
 * (indagatio, emptio, depraedatio, invocatio) currently return just the player multiplier; a
 * per-category mul attaches here as those sigils/skills land.
 */
export function categoryEfficiency(
  state: GameState,
  category: 'suasio' | 'decimatio' | 'indagatio' | 'emptio',
): number {
  const m = computeModifiers(state);
  let categoryMul = 1;
  if (category === 'suasio') categoryMul = m.suasioEfficiencyMul;
  else if (category === 'decimatio') categoryMul = m.decimatioEfficiencyMul;
  return m.playerEfficiencyMul * categoryMul;
}
