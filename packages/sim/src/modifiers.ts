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
 * PER-CATEGORY tier shifts (02 §2) are NOT part of the global bundle: a source that lifts one
 * category's success probability (Resignation → Suasio, Retribution → Decimatio, Lamia → Suasio)
 * is returned by `categoryTierModifiers(state, category)` and composed by `resolveAction` at
 * resolution time, since it targets a single category's distribution rather than all Opera.
 *
 * Skill→effect coupling for now: a skill that "increases X" multiplies X by (1 + intensity); a
 * skill that "decreases X" divides by the same (asymptotic to 0, never negative). The
 * spreadsheet's `SKILL_INTENSITY_DIVISOR` already sets the intensity curve; per-Sin coefficients on
 * top of this are a future tuning surface.
 */
import { SINS, SUBTYPE_OF_SIN, type GameState, type Sin } from './state.js';
import { sinLevel, skillIntensity } from './progression.js';
import { type TierModifiers, type Tier } from './probability.js';
import { countCopies } from './maleficia.js';
import { aurevoraEfficiencyMul } from './apex.js';
import { sigilModifierContributions, type ScalarModifierField } from './sigils.js';
import {
  CELEBRITY_GOLD_REDUCTION_PER_COUNT,
  CHOLERIC_MURDER_INCREASE_PER_COUNT,
  DEGENERATE_MURDER_REDUCTION_PER_COUNT,
  DEGENERATE_SUICIDE_REDUCTION_PER_COUNT,
  GAMBLER_GENERATION_REDUCTION_PER_COUNT,
  GLUTTON_OFFLINE_PENALTY_PER_COUNT,
  HUSK_EFFICIENCY_REDUCTION_PER_COUNT,
  IRA_ACOLYTE_INVOCATION_PER_LEVEL,
  NIHILIST_SUICIDE_INCREASE_PER_COUNT,
  SIGMA_INFLUENCE_REDUCTION_PER_COUNT,
  SUBTYPE_VM_GOLD_BOOST_PER_COUNT,
} from './constants.js';

export interface Modifiers {
  /** Multiplier on the base gold-per-second rate. */
  readonly goldRateMul: number;
  /** Multiplier on the proportional influence-per-second rate. */
  readonly influenceRateMul: number;
  /**
   * Additive flat influence-per-second from invocations (Lemure's per-Husk bonus; the Decarabia #69
   * sigil attaches here once sigil flat-contributions land). Added to the influence accrual in the
   * tick alongside Vitium Compositum influence, scaled by `influenceRateMul`, capped at maxInfluence.
   * 0 when no source is active.
   */
  readonly flatInfluencePerSecond: number;
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
  /**
   * Multiplier on invocation-runner action efficiency (03 §1, "Retribution"/Satan level — each
   * +33% per Ira level). Composed at the per-runner call site in `advanceInvocationRunners` on
   * top of the per-invocation `auto.efficiency × playerEfficiencyMul` term. Default 1×; sigils
   * targeting invocation runners (none yet) will compose here.
   */
  readonly invocationEfficiencyMul: number;
  /**
   * Per-Sin multiplier on Vitium Mercatura business gold output, driven by the matching subtype
   * count (03 §3: "Gluttons increase the gold output of Gula-related Vitium actions", etc.).
   * Composed multiplicatively with `vitiumMercaturaOutputMul` at the per-business call site in
   * `businessGoldPerSecond`. Defaults to 1× for every Sin when no subtype of that Sin's themed
   * type is present. Future sources (per-Sin sigils, hypothetical maleficia) can compose into the
   * same map.
   */
  readonly subtypeVitiumGoldMulBySin: Readonly<Record<Sin, number>>;
  /**
   * Multiplier on the duration used during offline catchup (02 §1 / 03 §1 Procrastination /
   * 03 §3 Glutton). Default 1×. Below 1× = slower offline (Glutton); above 1× = faster offline
   * (Acedia's Procrastination skill, future). Applied in `session.resumeGame` before the catchup
   * `tick(state, scaledDelta)`; has no effect on online ticks.
   */
  readonly offlineTimeMul: number;
}

/** No sources active — every multiplier is 1; tier shifts are absent (all default 1). */
export const NEUTRAL_MODIFIERS: Modifiers = {
  goldRateMul: 1,
  influenceRateMul: 1,
  flatInfluencePerSecond: 0,
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
  invocationEfficiencyMul: 1,
  subtypeVitiumGoldMulBySin: {
    gula: 1,
    luxuria: 1,
    avaritia: 1,
    tristitia: 1,
    ira: 1,
    acedia: 1,
    vanagloria: 1,
    superbia: 1,
  },
  offlineTimeMul: 1,
};

/** Default skill→effect coupling for a skill that "increases X": X *= (1 + intensity). */
const skillBonus = (intensity: number): number => 1 + intensity;

/** Resolve the modifier bundle from the current game state. */
export function computeModifiers(state: GameState): Modifiers {
  // Sin levels (03 §1 "Per-level effect", confirmed in `Sins & Devotion` sheet).
  const gulaLvl = sinLevel(state.devotion.gula);
  const vanagloriaLvl = sinLevel(state.devotion.vanagloria);
  const tristitiaLvl = sinLevel(state.devotion.tristitia);
  const iraLvl = sinLevel(state.devotion.ira);

  // Sin skill intensities (continuous; intensity = ln(devotion)² / SKILL_INTENSITY_DIVISOR).
  const avaritiaIntensity = skillIntensity(state.devotion.avaritia);
  const vanagloriaIntensity = skillIntensity(state.devotion.vanagloria);
  const tristitiaIntensity = skillIntensity(state.devotion.tristitia);
  const iraIntensity = skillIntensity(state.devotion.ira);
  const gulaIntensity = skillIntensity(state.devotion.gula);
  const superbiaIntensity = skillIntensity(state.devotion.superbia);
  const luxuriaIntensity = skillIntensity(state.devotion.luxuria); // Seduction → gen rate
  const acediaIntensity = skillIntensity(state.devotion.acedia); // Procrastination → offline

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
  const hasFamiliar = (inv.familiar ?? 0) > 0; // +33% player efficiency (02 §3 hybrid)
  const famaCount = inv.fama ?? 0; // each: influence gain ×1.25
  const nightmareCount = inv.nightmare ?? 0; // each: +5% suicide rate (additive)
  const harpyCount = inv.harpy ?? 0; // each: Choleric murder ×1.1
  const lamiaCount = inv.lamia ?? 0; // each: Suasio success up (per-category) + generation up
  const behemothCount = inv.behemoth ?? 0; // each: +50% Stellar weight
  const hasMidas = (inv.midas ?? 0) > 0; // 3× gold, 100× Apocalyptic
  const plutusCount = inv.plutus ?? 0; // each: Vitium Mercatura output up (flat factor)
  const lemureCount = inv.lemure ?? 0; // each: + flat influence/s per Husk
  const hasSuccubus = (inv.succubus ?? 0) > 0; // generation ×, gold → 1%
  const hasDoppel = (inv.doppelgaenger ?? 0) > 0; // +50% player eff, ½ influence
  // Aurevora (apex Gula): a rising player-efficiency boost scaled by how long it's been active
  // (apex.ts owns the curve and the paired gold drain). 1× when absent.
  const aurevoraEff =
    (inv.aurevora ?? 0) > 0
      ? aurevoraEfficiencyMul(state.lifetime.invocationDurations.aurevora ?? 0)
      : 1;
  // Erinyes (apex Ira): each Katabasis on which Erinyes was pending stacks a permanent ×2 on
  // player efficiency. Top-level, carries across lifetimes.
  const erinyesStackMul = 2 ** (state.erinyesEfficiencyStacks ?? 0);

  // Panvitium (03 §2.3): the endgame ritual. While active it drives the whole population at once —
  // generation, suicide, and murder rates are enormous. The flat generation/conversion come from
  // its Vitium Compositum entry; these multipliers amplify the churn. Placeholders, spreadsheet-
  // overridable. (It cannot be read as a per-stack count — it's a single toggle, on or off.)
  const panvitiumActive = state.lifetime.activeToggles.includes('panvitium');
  const PANV_GEN_MUL = 10;
  const PANV_SUICIDE_MUL = 20;
  const PANV_MURDER_MUL = 20;
  // Invocation effect magnitudes (placeholders; spreadsheet owns final tuning, like the others).
  const SUCCUBUS_GEN_MUL = 10; // apex Luxuria: generation ×10 (gold cut to 1% handled in goldRateMul)
  const PLUTUS_OUTPUT = 1; // each Plutus: +100% Vitium Mercatura output
  const LEMURE_INFLUENCE_PER_HUSK = 0.1; // each Lemure: +0.1 influence/s per Husk reprobate

  // Bound sigils (03 §5). Each contributes a multiplier to a scalar field or a tier weight; many
  // sigils on one field compose multiplicatively. The catalog + curves live in sigils.ts; here we
  // just fold the aggregated contributions in. `sc(f)` is the sigil multiplier for field f (1 if none).
  const sig = sigilModifierContributions(state);
  const sc = (f: ScalarModifierField): number => sig.scalar[f] ?? 1;

  // Tier weights: accumulate per-tier products from every source, then apply locks LAST. Missing
  // keys mean 1 in `applyTierModifiers`; under exactOptionalPropertyTypes we assign only when ≠ 1.
  const tierAcc: Partial<Record<Tier, number>> = {};
  const bumpTier = (t: Tier, mul: number): void => {
    tierAcc[t] = (tierAcc[t] ?? 1) * mul;
  };
  if (gulaIntensity > 0) bumpTier('terrible', 1 / (1 + gulaIntensity)); // Insatiability damps
  if (superbiaIntensity > 0) bumpTier('stellar', skillBonus(superbiaIntensity)); // Morning Star
  if (behemothCount > 0) bumpTier('stellar', 1 + 0.5 * behemothCount); // each Behemoth +50%
  if (gulaIntensity > 0) bumpTier('apocalyptic', 1 / (1 + gulaIntensity)); // Insatiability damps
  if (hasMidas) bumpTier('apocalyptic', 100); // Midas hundredfold
  for (const [t, mul] of Object.entries(sig.tier)) bumpTier(t as Tier, mul); // Gusion #11, Foras #31, …
  const tierWeightMul: TierModifiers = {};
  for (const [t, mul] of Object.entries(tierAcc)) if (mul !== 1) tierWeightMul[t as Tier] = mul;
  if (hasMarkOfCain) {
    // Anathema lock: the sevenfold guarantee zeroes the worst draw outright — overrides all above.
    tierWeightMul.apocalyptic = 0;
  }

  // Per-subtype reprobate effects (03 §3). Each subtype carries TWO effects: a Sin-themed VM gold
  // boost (per-business via `subtypeVitiumGoldMulBySin`) plus a secondary effect on a global rate
  // (composed into the existing rate muls below). All "increase X" use `(1 + pct × n)`, all
  // "decrease X" use `1 / (1 + pct × n)` (asymptotic to 0, never negative — matches skill-bonus).
  const subs = state.lifetime.reprobates;
  // Per-Sin Vitium Mercatura gold boost: each business of Sin S multiplies by `1 + pct ×
  // subtype-count(SUBTYPE_OF_SIN[S])`. The composed map is consumed at the per-business call site
  // (`businessGoldPerSecond`); we *don't* fold it into the global `vitiumMercaturaOutputMul` so
  // builds of different Sins keep their independent boosts.
  const subtypeVitiumGoldMulBySin = {} as Record<Sin, number>;
  for (const sin of SINS) {
    const themedCount = subs[SUBTYPE_OF_SIN[sin]];
    subtypeVitiumGoldMulBySin[sin] = 1 + SUBTYPE_VM_GOLD_BOOST_PER_COUNT * themedCount;
  }
  // Secondary effects (composed below into the existing rate-mul expressions):
  //   Degenerate (Luxuria): lowers suicide + Choleric murder
  const degenerateSuicideMul = 1 / (1 + DEGENERATE_SUICIDE_REDUCTION_PER_COUNT * subs.degenerate);
  const degenerateMurderMul = 1 / (1 + DEGENERATE_MURDER_REDUCTION_PER_COUNT * subs.degenerate);
  //   Nihilist (Tristitia): raises suicide
  const nihilistSuicideMul = 1 + NIHILIST_SUICIDE_INCREASE_PER_COUNT * subs.nihilist;
  //   Gambler (Avaritia): lowers generation
  const gamblerGenerationMul = 1 / (1 + GAMBLER_GENERATION_REDUCTION_PER_COUNT * subs.gambler);
  //   Choleric (Ira): compounds its own murder rate (second-order on top of count × base)
  const cholericMurderCompound = 1 + CHOLERIC_MURDER_INCREASE_PER_COUNT * subs.choleric;
  //   Husk (Acedia): lowers online player efficiency (offline is its own channel)
  const huskEfficiencyMul = 1 / (1 + HUSK_EFFICIENCY_REDUCTION_PER_COUNT * subs.husk);
  //   Celebrity (Vanagloria): lowers gold rate
  const celebrityGoldMul = 1 / (1 + CELEBRITY_GOLD_REDUCTION_PER_COUNT * subs.celebrity);
  //   Sigma (Superbia): lowers influence rate
  const sigmaInfluenceMul = 1 / (1 + SIGMA_INFLUENCE_REDUCTION_PER_COUNT * subs.sigma);
  //   Glutton (Gula): slows offline catchup (consumed in session.resumeGame, NOT online ticks)
  const gluttonOfflineMul = 1 / (1 + GLUTTON_OFFLINE_PENALTY_PER_COUNT * subs.glutton);

  return {
    goldRateMul:
      skillBonus(avaritiaIntensity) *
      (hasSilver ? 3 : 1) *
      (hasMidas ? 3 : 1) *
      (hasSuccubus ? 0.01 : 1) *
      celebrityGoldMul *
      sc('goldRateMul'),
    influenceRateMul:
      1.5 ** vanagloriaLvl *
      (hasCodex ? 3 : 1) *
      1.25 ** famaCount *
      (hasDoppel ? 0.5 : 1) *
      sigmaInfluenceMul *
      sc('influenceRateMul'),
    maxInfluenceMul: skillBonus(vanagloriaIntensity) * (hasSpear ? 3 : 1) * sc('maxInfluenceMul'),
    // Flat influence/s: each Lemure adds a per-Husk amount (additive; scaled by influenceRateMul +
    // capped at maxInfluence in the tick). Decarabia #69 will add to this once sigil flats land.
    flatInfluencePerSecond:
      LEMURE_INFLUENCE_PER_HUSK * state.lifetime.reprobates.husk * lemureCount,
    playerEfficiencyMul:
      2 ** gulaLvl *
      (hasDoppel ? 1.5 : 1) *
      (hasFamiliar ? 1.33 : 1) *
      aurevoraEff *
      erinyesStackMul *
      huskEfficiencyMul *
      sc('playerEfficiencyMul'),
    suasioEfficiencyMul: skillBonus(tristitiaIntensity) * sc('suasioEfficiencyMul'),
    decimatioEfficiencyMul: skillBonus(iraIntensity) * sc('decimatioEfficiencyMul'),
    tierWeightMul,
    // Reprobate generation: base 0 + Vitium flat contributions; Panvitium amplifies; each Lamia
    // lifts it; Succubus multiplies it dramatically; Luxuria's Seduction skill lifts it
    // continuously (03 §1); Gambler subtype drags it down; sigils (Aamon #7 up, Zepar #16 down)
    // compose.
    reprobateGenerationRateMul:
      (panvitiumActive ? PANV_GEN_MUL : 1) *
      (1 + LAMIA_GENERATION * lamiaCount) *
      (hasSuccubus ? SUCCUBUS_GEN_MUL : 1) *
      skillBonus(luxuriaIntensity) *
      gamblerGenerationMul *
      sc('reprobateGenerationRateMul'),
    // Suicide: Resignation lifts by (1 + intensity); Tristitia level doubles; each Nightmare +5%;
    // Panvitium multiplies while active; Degenerate subtype drags it down; Nihilist subtype lifts
    // it; Crocell #49 sigil composes.
    reprobateSuicideRateMul:
      skillBonus(tristitiaIntensity) *
      2 ** tristitiaLvl *
      (1 + 0.05 * nightmareCount) *
      (panvitiumActive ? PANV_SUICIDE_MUL : 1) *
      degenerateSuicideMul *
      nihilistSuicideMul *
      sc('reprobateSuicideRateMul'),
    // Murder: each Harpy lifts ×1.1; Panvitium multiplies while active; Degenerate subtype drags
    // it down; Choleric subtype compounds it on top of the linear count × base term in `dynamics`;
    // Aim #23 sigil composes.
    cholericMurderRateMul:
      1.1 ** harpyCount *
      (panvitiumActive ? PANV_MURDER_MUL : 1) *
      degenerateMurderMul *
      cholericMurderCompound *
      sc('cholericMurderRateMul'),
    // Vitium Mercatura output: each Plutus lifts it (flat factor), Vapula #60 sigil composes; this
    // multiplier scales business gold + generation + conversion at the tick/dynamics call sites.
    vitiumMercaturaOutputMul: (1 + PLUTUS_OUTPUT * plutusCount) * sc('vitiumMercaturaOutputMul'),
    // Acolyte efficiency: 0.33 baseline (02 §10); Ira level lifts ×1.33/level (03 §1 Retribution);
    // Bathin #18 sigil composes on top.
    acolyteEfficiencyMul:
      0.33 * IRA_ACOLYTE_INVOCATION_PER_LEVEL ** iraLvl * sc('acolyteEfficiencyMul'),
    // Invocation efficiency: 1× baseline; Ira level lifts ×1.33/level (03 §1 Retribution shared
    // with acolytes). Composed in `advanceInvocationRunners` on top of `auto.efficiency × playerEff`.
    invocationEfficiencyMul: IRA_ACOLYTE_INVOCATION_PER_LEVEL ** iraLvl,
    // Per-Sin Vitium Mercatura gold boost from matched subtype counts (03 §3). Read at the
    // per-business call site so each Sin's businesses receive their own themed boost.
    subtypeVitiumGoldMulBySin,
    // Offline time scaling: Glutton slows; Acedia's Procrastination skill lifts (03 §1, continuous);
    // Acedia's per-level effect compounds on top dynamically in `session.resumeGame` (it depends
    // on the offline duration itself and can't be expressed as a static scalar).
    offlineTimeMul: gluttonOfflineMul * skillBonus(acediaIntensity),
  };
}

/** Player efficiency only (Gula). The HUD shows this; per-action eff combines with category. */
export function playerEfficiency(state: GameState): number {
  return computeModifiers(state).playerEfficiencyMul;
}

/** Tiers counted as "success" for the per-category success-probability effects (03 §1). */
const SUCCESS_TIERS: readonly Tier[] = ['stellar', 'excellent', 'good'];
/** Each Lamia lifts Suasio success-tier weights (placeholder magnitude; spreadsheet owns final). */
const LAMIA_SUASIO_SUCCESS = 0.25;
/** Each Lamia lifts unconverted reprobate generation (placeholder magnitude; spreadsheet owns final). */
const LAMIA_GENERATION = 0.5;

/**
 * Per-CATEGORY tier shift, applied at action-resolution time (02 §2) — kept distinct from the global
 * `tierWeightMul` bundle because it targets a single category's distribution. "Increase overall
 * success" effects lift the Stellar + Excellent + Good weights by the same factor (03 §1); on
 * renormalization that pulls probability off the failure tiers. Wired sources:
 *   - Suasio:    Resignation (Tristitia skill) and each Lamia invocation.
 *   - Decimatio: Retribution (Ira skill).
 * Indagatio / Emptio have no success-shift source yet (their tier-success sigils attach later).
 * `resolveAction` composes this on top of the global tier multipliers before resolving the tier.
 */
export function categoryTierModifiers(
  state: GameState,
  category: 'suasio' | 'decimatio' | 'indagatio' | 'emptio',
): TierModifiers {
  let successMul = 1;
  if (category === 'suasio') {
    successMul *= skillBonus(skillIntensity(state.devotion.tristitia)); // Resignation
    const lamia = state.lifetime.invocations.lamia ?? 0;
    if (lamia > 0) successMul *= 1 + LAMIA_SUASIO_SUCCESS * lamia;
  } else if (category === 'decimatio') {
    successMul *= skillBonus(skillIntensity(state.devotion.ira)); // Retribution
  }
  if (successMul === 1) return {};
  const out: TierModifiers = {};
  for (const t of SUCCESS_TIERS) out[t] = successMul;
  return out;
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
