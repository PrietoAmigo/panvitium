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
import { SINS, type GameState, type Sin } from './state.js';
import { sinLevel, skillIntensity } from './progression.js';
import { type TierModifiers, type Tier } from './probability.js';
import { countCopies, sigilEffectMultiplier, HAND_OF_GLORY_GENERATION_MUL } from './maleficia.js';
import {
  MERCATUS_ACEDIA_OFFLINE_PER_DEPTH,
  MERCATUS_IRA_MURDER_PER_DEPTH,
  MERCATUS_TRISTITIA_SUICIDE_PER_DEPTH,
  MERCATUS_VANAGLORIA_INFLUENCE_FRACTION_PER_10_DEPTHS,
  mercatusDepth,
} from './mercatus.js';
import {
  compositumGenerationRateMul,
  compositumMurderRateMul,
  compositumSuicideRateMul,
} from './compositum.js';
import { compositumOfflineGainBoost } from './compositum.js';
import { aurevoraEfficiencyMul } from './apex.js';
import {
  sigilModifierContributions,
  sigilCategoryTierContributions,
  sigilInvocationSinContributions,
  sigilInvocationEffectContributions,
  sigilFlatGeneration,
  type ScalarModifierField,
} from './sigils.js';
import {
  ARS_SERPENS_SUASIO_BONUS,
  IRA_ACOLYTE_INVOCATION_PER_LEVEL,
  RITUAL_DAGGER_DECIMATIO_BONUS,
  VOYNICH_SUASIO_BONUS,
} from './constants.js';

export interface Modifiers {
  /** Multiplier on the base gold-per-second rate. */
  readonly goldRateMul: number;
  /** Multiplier on the proportional influence-per-second rate. */
  readonly influenceRateMul: number;
  /**
   * Additive flat influence-per-second (the Decarabia #69 sigil attaches here once sigil
   * flat-contributions land). Added to the influence accrual in the tick alongside Vitium Compositum
   * influence, scaled by `influenceRateMul`, capped at maxInfluence. 0 when no source is active.
   */
  readonly flatInfluencePerSecond: number;
  /**
   * Additive flat gold-per-second from the Haagenti #48 generator sigil (log curve). Accrued in the
   * tick alongside the other gold sources, scaled by `goldRateMul`. 0 when no source is active.
   */
  readonly flatGoldPerSecond: number;
  /**
   * Additive increase to the base reprobate suicide rate (per-second, per-capita), from invocations
   * (each Nightmare, efficiency-scaled). Added to the base in `dynamics` alongside the Doom toggle,
   * then multiplied by population × `reprobateSuicideRateMul`. 0 when no source is active.
   */
  readonly flatBaseSuicideRatePerSecond: number;
  /** Multiplier on the lifetime `maxInfluence` (raises the cap). */
  readonly maxInfluenceMul: number;
  /** Multiplier on the player's own action efficiency (Gula). Stacks with category eff. */
  readonly playerEfficiencyMul: number;
  /** Multiplier on Suasio-category action efficiency (Leviathan / Resignation). */
  readonly suasioEfficiencyMul: number;
  /** Multiplier on Decimatio-category action efficiency (Satan / Retribution). */
  readonly decimatioEfficiencyMul: number;
  /** Multiplier on Indagatio-category action efficiency (time-mode → scales speed). Bifrons #46. */
  readonly indagatioEfficiencyMul: number;
  /** Multiplier on Emptio-category action efficiency (time-mode → scales speed). Seere #70. */
  readonly emptioEfficiencyMul: number;
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
   * Multiplier on the reprobate murder rate (02 §9). Murder is now a per-capita cull of the whole
   * population (subtypes removed); this multiplier carries Panvitium and sigil/maleficium/invocation
   * effects (Aim #23, etc.).
   */
  readonly murderRateMul: number;
  /**
   * Multiplier on Vitium Mercatura output (Mercatus revenue AND reprobate generation). Sources:
   * Plutus invocation (flat factor on output), Vapula #60 sigil (overall VM gold output).
   * Consumed at the tick gold-income and dynamics generation call sites.
   */
  readonly vitiumMercaturaOutputMul: number;
  /**
   * Multiplier on Vitium Compositum gold output (Zagan #61). Applied to `compositumGoldPerSecond`
   * at the tick's gold-income site, parallel to `vitiumMercaturaOutputMul` for the Mercatūs. Default 1×.
   */
  readonly vitiumCompositumOutputMul: number;
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
   * Per-Sin multiplier on the effectiveness of invocations belonging to that Sin (the eight
   * Sin-themed sigils: Samigina/Barbatos/Bune/Berith/Furfur/Vepar/Shax/Alloces). Applied to every
   * efficiency-derived invocation effect (the passive magnitudes and the autonomous runners) on top
   * of the global `invocationEfficiencyMul`. Default 1× for every Sin.
   */
  readonly invocationSinEffectivenessMul: Record<Sin, number>;
  /**
   * Multiplier on the duration used during offline catchup (02 §1 / 03 §1 Procrastination).
   */
  readonly offlineTimeMul: number;
}

/** No sources active — every multiplier is 1; tier shifts are absent (all default 1). */
export const NEUTRAL_MODIFIERS: Modifiers = {
  goldRateMul: 1,
  influenceRateMul: 1,
  flatInfluencePerSecond: 0,
  flatBaseSuicideRatePerSecond: 0,
  flatGoldPerSecond: 0,
  maxInfluenceMul: 1,
  playerEfficiencyMul: 1,
  suasioEfficiencyMul: 1,
  decimatioEfficiencyMul: 1,
  indagatioEfficiencyMul: 1,
  emptioEfficiencyMul: 1,
  tierWeightMul: {},
  reprobateGenerationRateMul: 1,
  reprobateSuicideRateMul: 1,
  murderRateMul: 1,
  vitiumMercaturaOutputMul: 1,
  vitiumCompositumOutputMul: 1,
  acolyteEfficiencyMul: 0.33,
  invocationEfficiencyMul: 1,
  invocationSinEffectivenessMul: {
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
  // Opera-efficiency enhancers (Maleficia sheet): each a separate multiplicative `(1 + bonus)`
  // factor on its category's efficiency mul. Non-stackable, so the count is 0 or 1.
  const arsSerpens = countCopies(owned, 'ars_serpens');
  const voynich = countCopies(owned, 'voynich_manuscript');
  const ritualDagger = countCopies(owned, 'ritual_dagger');

  // Active invocations (03 §2.4). Counts read straight from the lifetime map; effect magnitudes
  // live here alongside the other effect coefficients (the catalog in invocations.ts owns the
  // gates and costs, this module owns what each does — mirroring how maleficia effects are coded).
  const inv = state.lifetime.invocations;
  const hasFamiliar = (inv.familiar ?? 0) > 0; // +33% player efficiency (02 §3 hybrid)
  const famaCount = inv.fama ?? 0; // each: additive influence increase (× playerEff × invEff)
  const nightmareCount = inv.nightmare ?? 0; // each: additive to base suicide rate (× playerEff × invEff)
  const harpyCount = inv.harpy ?? 0; // each: Decimatio efficiency up (× playerEff × invEff)
  const behemothCount = inv.behemoth ?? 0; // each: additive to Stellar chance (× playerEff × invEff)
  const hasMidas = (inv.midas ?? 0) > 0; // 3× gold, 100× Apocalyptic
  const plutusCount = inv.plutus ?? 0; // each: Vitium Mercatura output up (× playerEff × invEff)
  const lemureCount = inv.lemure ?? 0; // each: additive offline gain rate (× playerEff × invEff)
  const hasSuccubus = (inv.succubus ?? 0) > 0; // Suasio efficiency up + gold cut (× playerEff × invEff)
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
  // generation, suicide, and murder rates are enormous. Its flat generation/conversion/cost come
  // from its sheet-pinned Vitium Compositum entry; these churn MULTIPLIERS are the one piece the
  // sheet doesn't pin — genuine tuning values. (It's a single toggle, on or off — not a stack.)
  const panvitiumActive = state.lifetime.activeToggles.includes('panvitium');
  const PANV_GEN_MUL = 10;
  const PANV_SUICIDE_MUL = 20;
  const PANV_MURDER_MUL = 20;
  // Invocation effect magnitudes (Invocatio sheet). Each invocation's "action efficiency" (its
  // per-copy factor below) is the sheet's Efficiency column, applied × the player's current action
  // efficiency (`playerEff`) × the invocation-effect multiplier (`invEff`), so the demonic court
  // scales with the build (Model 1).
  const FAMA_INFLUENCE_FACTOR = 0.05; // additive increase to influence rate
  const HARPY_DECIMATIO_FACTOR = 0.05; // multiplicative increase to Decimatio efficiency
  const PLUTUS_VM_FACTOR = 0.05; // increase to Vitium Mercatura output
  const SUCCUBUS_SUASIO_FACTOR = 0.99; // multiplicative increase to Suasio efficiency
  const SUCCUBUS_GOLD_FACTOR = 0.99; // multiplicative decrease to overall gold gain
  const BLACK_CANDLES_INVOCATION_BONUS = 0.05; // each Black Candle: +5% invocation effect
  const NIGHTMARE_SUICIDE_FACTOR = 0.05; // additive increase to base reprobate suicide rate
  const BEHEMOTH_STELLAR_FACTOR = 0.0005; // additive increase to Stellar chance across Opera
  const LEMURE_OFFLINE_FACTOR = 0.025; // additive increase to offline gain rate

  // Bound sigils (03 §5). Each contributes a multiplier to a scalar field or a tier weight; many
  // sigils on one field compose multiplicatively. The catalog + curves live in sigils.ts; here we
  // just fold the aggregated contributions in. `sc(f)` is the sigil multiplier for field f (1 if none).
  const sig = sigilModifierContributions(state, sigilEffectMultiplier(owned));
  const sc = (f: ScalarModifierField): number => sig.scalar[f] ?? 1;
  // Flat per-second generators (Haagenti #48 gold, Decarabia #69 influence), scaled by enhancers.
  const flatGen = sigilFlatGeneration(state, sigilEffectMultiplier(owned));

  // Tier weights: accumulate per-tier products from every source, then apply locks LAST. Missing
  // keys mean 1 in `applyTierModifiers`; under exactOptionalPropertyTypes we assign only when ≠ 1.
  const tierAcc: Partial<Record<Tier, number>> = {};
  const bumpTier = (t: Tier, mul: number): void => {
    tierAcc[t] = (tierAcc[t] ?? 1) * mul;
  };
  if (gulaIntensity > 0) bumpTier('terrible', 1 / (1 + gulaIntensity)); // Insatiability damps
  if (superbiaIntensity > 0) bumpTier('stellar', skillBonus(superbiaIntensity)); // Morning Star
  if (gulaIntensity > 0) bumpTier('apocalyptic', 1 / (1 + gulaIntensity)); // Insatiability damps
  if (hasMidas) bumpTier('apocalyptic', 100); // Midas hundredfold
  for (const [t, mul] of Object.entries(sig.tier)) bumpTier(t as Tier, mul); // Gusion #11, Foras #31, …
  const tierWeightMul: TierModifiers = {};
  for (const [t, mul] of Object.entries(tierAcc)) if (mul !== 1) tierWeightMul[t as Tier] = mul;
  if (hasMarkOfCain) {
    // Anathema lock: the sevenfold guarantee zeroes the worst draw outright — overrides all above.
    tierWeightMul.apocalyptic = 0;
  }

  // (Per-subtype reprobate effects removed with subtypes: the Sin-themed VM gold boost and the
  // eight secondary rate penalties — Glutton/Degenerate/Gambler/Nihilist/Choleric/Husk/Celebrity/
  // Sigma — no longer exist. Reprobates are a single undifferentiated pool with no per-capita drag.)

  // Player action efficiency (the value actions multiply by, and the base the invocation factors
  // scale against — Model 1). Lifted to a local so the efficiency-scaled invocation effects below
  // can read it. Invocation-effect multiplier: Ira's Retribution per level × Black Candles (+5%
  // each, stack-capped at 5 by the catalog). Both runner and passive invocation effects use it.
  const blackCandles = countCopies(owned, 'black_candles');
  const invEff =
    IRA_ACOLYTE_INVOCATION_PER_LEVEL ** iraLvl *
    (1 + BLACK_CANDLES_INVOCATION_BONUS * blackCandles) *
    sc('invocationEfficiencyMul');
  // Per-INVOCATION effectiveness (Buer #10 → familiar, Sitri #12 → succubus), keyed by id. Scales a
  // specific invocation's effect coefficient; 1× when no such sigil is bound.
  const invInvContrib = sigilInvocationEffectContributions(state, sigilEffectMultiplier(owned));
  const invEffForInv = (id: string): number => invInvContrib[id] ?? 1;
  const playerEff =
    2 ** gulaLvl *
    (hasDoppel ? 1.5 : 1) *
    (hasFamiliar ? 1 + 0.33 * invEffForInv('familiar') : 1) *
    aurevoraEff *
    erinyesStackMul *
    sc('playerEfficiencyMul');
  // Per-Sin invocation effectiveness (the eight Sin-themed sigils). `invEffFor(sin)` is the global
  // invocation-effect multiplier × that Sin's sigil boost; every efficiency-derived invocation effect
  // below uses it in place of the bare `invEff`, keyed by the invocation's own Sin.
  const invSinContrib = sigilInvocationSinContributions(state, sigilEffectMultiplier(owned));
  const invSinEff = {} as Record<Sin, number>;
  for (const s of SINS) invSinEff[s] = invSinContrib[s] ?? 1;
  const invEffFor = (sin: Sin): number => invEff * invSinEff[sin];
  // Behemoth (Superbia): additive increase to the Stellar weight, efficiency-scaled (Model 1).
  // Deferred to here (rather than the tierAcc block above) because it depends on `playerEff`/`invEff`;
  // folded into the already-built `tierWeightMul` so it composes with Morning Star and Stellar sigils.
  if (behemothCount > 0) {
    tierWeightMul.stellar =
      (tierWeightMul.stellar ?? 1) *
      (1 + BEHEMOTH_STELLAR_FACTOR * playerEff * invEffFor('superbia') * behemothCount);
  }

  // Max-influence multiplier, hoisted so the Mercatus Vanagloriae clause (a fraction of the
  // EFFECTIVE max influence as flat influence/s) reads the same composed value the cap uses.
  const maxInfluenceMulV =
    skillBonus(vanagloriaIntensity) * (hasSpear ? 3 : 1) * sc('maxInfluenceMul');

  return {
    goldRateMul:
      skillBonus(avaritiaIntensity) *
      (hasSilver ? 3 : 1) *
      (hasMidas ? 3 : 1) *
      (hasSuccubus
        ? 1 /
          (1 + SUCCUBUS_GOLD_FACTOR * playerEff * invEffFor('luxuria') * invEffForInv('succubus'))
        : 1) *
      sc('goldRateMul'),
    influenceRateMul:
      1.33 ** vanagloriaLvl * // ×1.33 influence gain per Vanagloria level (sheet rev 2026-06-12)
      (hasCodex ? 3 : 1) *
      (1 + FAMA_INFLUENCE_FACTOR * playerEff * invEffFor('vanagloria') * famaCount) *
      (hasDoppel ? 0.5 : 1) *
      sc('influenceRateMul'),
    maxInfluenceMul: maxInfluenceMulV,
    // Flat influence/s: the Decarabia #69 generator sigil (log curve) + the Mercatus Vanagloriae
    // signature clause — 0.25% of the EFFECTIVE max influence per second per full 10 depths
    // (stepped, like the Foedus ladder; "per 10 depths" in the amended §1.5 table).
    flatInfluencePerSecond:
      flatGen.influence +
      MERCATUS_VANAGLORIA_INFLUENCE_FRACTION_PER_10_DEPTHS *
        Math.floor(mercatusDepth(state, 'vanagloria') / 10) *
        state.lifetime.maxInfluence.toNumber() *
        maxInfluenceMulV,
    // Flat gold/s from the Haagenti #48 generator sigil (log curve).
    flatGoldPerSecond: flatGen.gold,
    // Additive increase to the base reprobate suicide rate (added to the per-capita base in
    // `dynamics`, alongside the Doom toggle). Each Nightmare contributes its efficiency-scaled factor.
    flatBaseSuicideRatePerSecond:
      NIGHTMARE_SUICIDE_FACTOR * playerEff * invEffFor('tristitia') * nightmareCount,
    playerEfficiencyMul: playerEff,
    suasioEfficiencyMul:
      skillBonus(tristitiaIntensity) *
      (1 + ARS_SERPENS_SUASIO_BONUS * arsSerpens) *
      (1 + VOYNICH_SUASIO_BONUS * voynich) *
      (hasSuccubus
        ? 1 + SUCCUBUS_SUASIO_FACTOR * playerEff * invEffFor('luxuria') * invEffForInv('succubus')
        : 1) *
      sc('suasioEfficiencyMul'),
    decimatioEfficiencyMul:
      skillBonus(iraIntensity) *
      (1 + RITUAL_DAGGER_DECIMATIO_BONUS * ritualDagger) *
      (1 + HARPY_DECIMATIO_FACTOR * playerEff * invEffFor('ira') * harpyCount) *
      sc('decimatioEfficiencyMul'),
    indagatioEfficiencyMul: sc('indagatioEfficiencyMul'),
    emptioEfficiencyMul: sc('emptioEfficiencyMul'),
    tierWeightMul,
    // Reprobate generation: base 0 + Vitium flat contributions; Panvitium amplifies; Luxuria's
    // Seduction skill lifts it continuously (03 §1); sigils (Aamon #7 up, Zepar #16 down) compose.
    reprobateGenerationRateMul:
      (panvitiumActive ? PANV_GEN_MUL : 1) *
      (state.lifetime.handOfGloryRemaining > 0 ? HAND_OF_GLORY_GENERATION_MUL : 1) *
      skillBonus(luxuriaIntensity) *
      compositumGenerationRateMul(state) * // Bacchanal +10% while active (ADR-027)
      sc('reprobateGenerationRateMul'),
    // Suicide: Resignation lifts by (1 + intensity); Tristitia level doubles; each Nightmare +5%;
    // Panvitium multiplies while active; Mercatus Tristitiae adds +0.825% per depth (§1.5 amended);
    // Crocell #49 sigil composes.
    reprobateSuicideRateMul:
      skillBonus(tristitiaIntensity) *
      2 ** tristitiaLvl *
      (panvitiumActive ? PANV_SUICIDE_MUL : 1) *
      (1 + MERCATUS_TRISTITIA_SUICIDE_PER_DEPTH * mercatusDepth(state, 'tristitia')) *
      compositumSuicideRateMul(state) * // Doom Gathering +10% while active (ADR-027)
      sc('reprobateSuicideRateMul'),
    // Murder: Panvitium multiplies while active; Mercatus Irae adds +0.825% per depth (§1.5
    // amended); Aim #23 sigil composes. Murder is a per-capita cull of the whole population.
    murderRateMul:
      (panvitiumActive ? PANV_MURDER_MUL : 1) *
      (1 + MERCATUS_IRA_MURDER_PER_DEPTH * mercatusDepth(state, 'ira')) *
      compositumMurderRateMul(state) * // Enraging Broadcast +10% while active (ADR-027)
      sc('murderRateMul'),
    // Vitium Mercatura output: each Plutus lifts it (flat factor), Vapula #60 sigil composes; this
    // multiplier scales Mercatus revenue + generation at the tick/dynamics call sites.
    vitiumMercaturaOutputMul:
      (1 + PLUTUS_VM_FACTOR * playerEff * invEffFor('avaritia') * plutusCount) *
      sc('vitiumMercaturaOutputMul'),
    // Vitium Compositum gold output: Zagan #61 sigil composes; applied to compositumGoldPerSecond.
    vitiumCompositumOutputMul: sc('vitiumCompositumOutputMul'),
    // Acolyte efficiency: 0.33 baseline (02 §10); Ira level lifts ×1.33/level (03 §1 Retribution);
    // Bathin #18 sigil composes on top.
    acolyteEfficiencyMul:
      0.33 * IRA_ACOLYTE_INVOCATION_PER_LEVEL ** iraLvl * sc('acolyteEfficiencyMul'),
    // Invocation efficiency: 1× baseline; Ira level lifts ×1.33/level (03 §1 Retribution shared
    // with acolytes). Composed in `advanceInvocationRunners` on top of `auto.efficiency × playerEff`.
    invocationEfficiencyMul: invEff,
    invocationSinEffectivenessMul: invSinEff,
    // Offline time scaling: Acedia's Procrastination skill lifts (03 §1, continuous); Dolce Far
    // Niente lifts it ×(1 + boost) while active; Mercatus Acediae adds +0.825% per depth (§1.5
    // amended); Acedia's per-level effect compounds on top dynamically in `session.resumeGame`
    // (it depends on the offline duration itself). The PLAYER_OFFLINE_EFFICIENCY 0.5 base is
    // applied separately in `resumeGame`, NOT here, so this multiplier stays 1-neutral online.
    offlineTimeMul:
      skillBonus(acediaIntensity) *
      (1 + compositumOfflineGainBoost(state)) *
      (1 + LEMURE_OFFLINE_FACTOR * playerEff * invEffFor('acedia') * lemureCount) *
      (1 + MERCATUS_ACEDIA_OFFLINE_PER_DEPTH * mercatusDepth(state, 'acedia')) *
      sc('offlineTimeMul'),
  };
}

/** Player efficiency only (Gula). The HUD shows this; per-action eff combines with category. */
export function playerEfficiency(state: GameState): number {
  return computeModifiers(state).playerEfficiencyMul;
}

/** Tiers counted as "success" for the per-category success-probability effects (03 §1). */
const SUCCESS_TIERS: readonly Tier[] = ['stellar', 'excellent', 'good'];

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
  const out: TierModifiers = {};
  let successMul = 1;
  if (category === 'suasio') {
    successMul *= skillBonus(skillIntensity(state.devotion.tristitia)); // Resignation
  } else if (category === 'decimatio') {
    successMul *= skillBonus(skillIntensity(state.devotion.ira)); // Retribution
  }
  if (successMul !== 1) for (const t of SUCCESS_TIERS) out[t] = successMul;
  // Per-category sigil contributions (Agares/Beleth/Botis/Ipos/Astaroth/Andras/Andromalius/Naberius),
  // scaled by the sigil-effect enhancers (Solomon's Ring / Iron Nails); compose onto `out`.
  const sigCat = sigilCategoryTierContributions(
    state,
    category,
    sigilEffectMultiplier(state.lifetime.maleficia),
  );
  for (const [t, mul] of Object.entries(sigCat)) out[t as Tier] = (out[t as Tier] ?? 1) * mul;
  return out;
}

/**
 * Player × category efficiency for an action category (03 §2.1/§2.2). Suasio/Decimatio scale the
 * outcome of cost-outcome actions; Indagatio/Emptio are time-mode, so their mul scales speed (shorter
 * duration) via `startAction`. Each per-category mul currently carries Sin skills + sigils.
 */
export function categoryEfficiency(
  state: GameState,
  category: 'suasio' | 'decimatio' | 'indagatio' | 'emptio',
): number {
  const m = computeModifiers(state);
  let categoryMul = 1;
  if (category === 'suasio') categoryMul = m.suasioEfficiencyMul;
  else if (category === 'decimatio') categoryMul = m.decimatioEfficiencyMul;
  else if (category === 'indagatio') categoryMul = m.indagatioEfficiencyMul;
  else if (category === 'emptio') categoryMul = m.emptioEfficiencyMul;
  return m.playerEfficiencyMul * categoryMul;
}
