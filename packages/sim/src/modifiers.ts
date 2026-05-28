/**
 * Modifier engine — the single place where derived multipliers are aggregated from every source
 * (Sin levels, Sin skill intensities, sigil bindings, maleficia, invocations, reprobate subtypes)
 * and consumed by tick / actions / probability resolution. Pure; no I/O; reads only `GameState`.
 *
 * Sources wired so far:
 *   - Sin LEVELS:  Gula → playerEfficiencyMul (2× / level, 03 §1 / Sins & Devotion sheet)
 *                 Vanagloria → influenceRateMul (1.5× / level)
 *                 Tristitia → reprobateSuicideRateMul (2× / level, 03 §1: "+100% suicide rate")
 *   - Sin SKILLS:  Avaritia  (Golden Hand)    → goldRateMul
 *                 Vanagloria (Acclaim)        → maxInfluenceMul
 *                 Leviathan  (Resignation)    → suasioEfficiencyMul  (per-category eff)
 *                                              + reprobateSuicideRateMul (02 §9)
 *                 Satan      (Retribution)    → decimatioEfficiencyMul
 *                 Gula       (Insatiability)  → tierWeightMul.{terrible, apocalyptic} (damped)
 *                 Lucifer    (Morning Star)   → tierWeightMul.stellar (lifted)
 *   - MALEFICIA:  Spear of Longinus           → maxInfluenceMul × 3
 *                 Codex Gigas                 → influenceRateMul × 3
 *                 Thirty Pieces of Silver     → goldRateMul × 3
 *                 Mark of Cain                → tierWeightMul.apocalyptic = 0
 *
 * Other Sin effects (Ira → acolyte/invocation eff, Acedia → offline, Luxuria → reprobate
 * generation) attach as their target systems land — same module, same signature, just a new line
 * per source.
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
  /**
   * Multiplier on passive reprobate generation rate (02 §9). Empty for now — base rate is 0 until
   * Vitium businesses contribute; Aamon (#7) adds to it, Zepar (#16) divides it.
   */
  readonly reprobateGenerationRateMul: number;
  /**
   * Multiplier on the population-wide reprobate suicide rate (02 §9). Tristitia / Resignation
   * raises it (via skill intensity); Tristitia level applies a per-level 2× on top. Nihilist
   * count, Crocell #49, Focalor #41, Ronove #27 will attach here as their systems land.
   */
  readonly reprobateSuicideRateMul: number;
  /**
   * Multiplier on Choleric murder rate (02 §9). Choleric count drives the base contribution
   * directly in the tick; this multiplier carries sigil/maleficium/invocation effects (Aim #23,
   * Harpy, etc.) once those sources attach.
   */
  readonly cholericMurderRateMul: number;
  /**
   * Multiplier on Vitium Mercatura output (gold AND reprobate generation AND conversion). Future
   * sources: Plutus invocation (flat factor on output), Vapula #60 sigil (overall VM gold
   * output), and analogous. Currently 1× — businesses contribute at catalog values.
   */
  readonly vitiumMercaturaOutputMul: number;
  /**
   * Per-acolyte action efficiency (02 §10). Default 0.33: an acolyte runs an action at one-third
   * of the player's own efficiency. Future sources fold in multiplicatively: Bathin #18, Satan
   * level (each +33%), other acolyte-tagged sigils. Read by the acolyte tick when starting a new
   * cycle (timer duration = baseTime / acolyteEff in time mode; cost/outcome scale in cost-outcome
   * mode, deferred to a later slice).
   */
  readonly acolyteEfficiencyMul: number;
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
  reprobateGenerationRateMul: 1,
  reprobateSuicideRateMul: 1,
  cholericMurderRateMul: 1,
  vitiumMercaturaOutputMul: 1,
  acolyteEfficiencyMul: 0.33,
};

/** Default skill→effect coupling for a skill that "increases X": X *= (1 + intensity). */
const skillBonus = (intensity: number): number => 1 + intensity;

/** Resolve the modifier bundle from the current game state. */
export function computeModifiers(state: GameState): Modifiers {
  // Sin levels (03 §1 "Per-level effect", confirmed in `Sins & Devotion` sheet).
  const gulaLvl = sinLevel(state.devotion.gula);
  const vanagloriaLvl = sinLevel(state.devotion.vanagloria);
  const tristitiaLvl = sinLevel(state.devotion.tristitia);

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

  // Active invocations (03 §2.4). Counts read straight from the lifetime map; effect magnitudes
  // live here alongside the other effect coefficients (the catalog in invocations.ts owns the
  // gates and costs, this module owns what each does — mirroring how maleficia effects are coded).
  const inv = state.lifetime.invocations;
  const famaCount = inv.fama ?? 0; // each: influence gain ×1.25
  const nightmareCount = inv.nightmare ?? 0; // each: +5% suicide rate (additive)
  const harpyCount = inv.harpy ?? 0; // each: Choleric murder ×1.1
  const behemothCount = inv.behemoth ?? 0; // each: +50% Stellar weight
  const hasMidas = (inv.midas ?? 0) > 0; // 3× gold, 100× Apocalyptic
  const hasDoppel = (inv.doppelgaenger ?? 0) > 0; // +50% player eff, ½ influence

  // Panvitium (03 §2.3): the endgame ritual. While active it drives the whole population at once —
  // generation, suicide, and murder rates are enormous. The flat generation/conversion come from
  // its Vitium Compositum entry; these multipliers amplify the churn. Placeholders, spreadsheet-
  // overridable. (It cannot be read as a per-stack count — it's a single toggle, on or off.)
  const panvitiumActive = state.lifetime.activeToggles.includes('panvitium');
  const PANV_GEN_MUL = 10;
  const PANV_SUICIDE_MUL = 20;
  const PANV_MURDER_MUL = 20;

  // Build tier-weight muls as accumulating products; missing keys mean 1 in `applyTierModifiers`.
  // Under exactOptionalPropertyTypes we never assign `undefined`, so we assign only when ≠ 1.
  const tierWeightMul: TierModifiers = {};
  // Worst tiers: Insatiability (Gula) damps; nothing else touches `terrible` this slice.
  if (gulaIntensity > 0) {
    tierWeightMul.terrible = 1 / (1 + gulaIntensity);
  }
  // Stellar: Morning Star (Superbia skill) lifts it; each Behemoth lifts +50% on top.
  let stellar = 1;
  if (superbiaIntensity > 0) stellar *= skillBonus(superbiaIntensity);
  if (behemothCount > 0) stellar *= 1 + 0.5 * behemothCount;
  if (stellar !== 1) tierWeightMul.stellar = stellar;
  // Apocalyptic: Insatiability damps; Midas multiplies ×100; Mark of Cain LOCKS to 0 last (wins).
  let apocalyptic = 1;
  if (gulaIntensity > 0) apocalyptic *= 1 / (1 + gulaIntensity);
  if (hasMidas) apocalyptic *= 100;
  if (apocalyptic !== 1) tierWeightMul.apocalyptic = apocalyptic;
  if (hasMarkOfCain) {
    // Anathema lock: the sevenfold guarantee zeroes the worst draw outright — overrides all above.
    tierWeightMul.apocalyptic = 0;
  }

  return {
    goldRateMul: skillBonus(avaritiaIntensity) * (hasSilver ? 3 : 1) * (hasMidas ? 3 : 1),
    influenceRateMul:
      1.5 ** vanagloriaLvl * (hasCodex ? 3 : 1) * 1.25 ** famaCount * (hasDoppel ? 0.5 : 1),
    maxInfluenceMul: skillBonus(vanagloriaIntensity) * (hasSpear ? 3 : 1),
    playerEfficiencyMul: 2 ** gulaLvl * (hasDoppel ? 1.5 : 1),
    suasioEfficiencyMul: skillBonus(tristitiaIntensity),
    decimatioEfficiencyMul: skillBonus(iraIntensity),
    tierWeightMul,
    // Reprobate generation: base 0 + Vitium flat contributions; Panvitium amplifies the total.
    reprobateGenerationRateMul: panvitiumActive ? PANV_GEN_MUL : 1,
    // Suicide: Resignation lifts by (1 + intensity); Tristitia level doubles; each Nightmare +5%;
    // Panvitium multiplies the lot while active (03 §2.3 "suiciding … rates are enormous").
    reprobateSuicideRateMul:
      skillBonus(tristitiaIntensity) *
      2 ** tristitiaLvl *
      (1 + 0.05 * nightmareCount) *
      (panvitiumActive ? PANV_SUICIDE_MUL : 1),
    // Murder: each Harpy lifts ×1.1; Panvitium multiplies while active ("killing rates enormous").
    cholericMurderRateMul: 1.1 ** harpyCount * (panvitiumActive ? PANV_MURDER_MUL : 1),
    // Vitium Mercatura output: 1× until Plutus (invocations slice) and Vapula #60 (sigils slice).
    vitiumMercaturaOutputMul: 1,
    // Acolyte efficiency: 0.33 baseline (02 §10). Future sources fold in multiplicatively; this
    // slice has no source attached so it stays at the baseline.
    acolyteEfficiencyMul: 0.33,
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
