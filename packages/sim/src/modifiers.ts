/**
 * Modifier engine — the single place where derived multipliers are aggregated from every source
 * (Sin levels, Sin skill intensities, sigil bindings, maleficia, invocations, call buffs,
 * Syngraphae) and consumed by tick / actions / probability resolution. Pure; no I/O; reads only
 * `GameState`.
 *
 * Sources wired so far:
 *   - Sin LEVELS (sheet rev 2026-06-12):
 *                 Gula → strips negative tier weight (−20% / level; L4 → 20% remains)
 *                 Luxuria → suasioEfficiencyMul (×2 / level)
 *                 Ira → decimatioEfficiencyMul (×2 / level)
 *                 Vanagloria → influenceRateMul (×1.33 / level)
 *   - Sin SKILLS:  Avaritia  (Golden Hand)    → goldRateMul
 *                 Vanagloria (Acclaim)        → maxInfluenceMul
 *                 Tristitia  (Resignation)    → acolyteEfficiencyMul (+ Suasio success, per-category)
 *                 Ira        (Retribution)    → invocationEfficiencyMul (+ Decimatio success)
 *                 Gula       (Insatiability)  → playerEfficiencyMul
 *                 Luxuria    (Seduction)      → reprobateGenerationRateMul
 *                 Acedia     (Procrastination) → desidiaSpeedMul
 *                 Superbia   (Morning Star)   → tierWeightMul.stellar (lifted)
 *   - MALEFICIA (Maleficia sheet rev 2026-09):
 *                 Spear of Longinus           → influenceRateMul × 3 (+200% influence gain)
 *                 Codex Gigas                 → influenceRateMul × 1.25 (+25%)
 *                 Achan's Wedge               → goldRateMul × 3 (+200% gold gain)
 *                 Dybbuk Box                  → goldRateMul × 1.10 (+10%)
 *                 Thirty Pieces of Silver     → reprobateSuicideRateMul × 3 (+200% suicide rate)
 *                 Mark of Cain                → murderRateMul × 2 (+100%)
 *                 Ritual Dagger               → murderRateMul × 1.10 (+10%)
 *                 Galdrabók                   → murderRateMul × 1.125 (+12.5%)
 *                 The Dadu                    → playerEfficiencyMul × 1.05 (+5%)
 *                 Voynich Manuscript          → desidiaGainMul × 1.25 (+25%)
 *                 Pilate's Basin              → desidiaDrainMul × 0.5 (−50% drain)
 *                 Crow Feather / Obsidian     → indagatioEfficiencyMul (−10% / −33% Indagatio time)
 *                 Grimoire of Pope Honorius   → invocationEfficiencyMul × 1.13 (+13%)
 *                 flat/s: Black Robe/Blood Chalk/Blackthorn Wand/Sulfur Censer → influence;
 *                         Hollow Effigy/Witch Ladder → murders; Poppet/Mandrake Root → suicides;
 *                         Adder Stone/Witch Bottle → generation
 *                 single-use buffs (maleficiaBuffs): Hand of Glory +33% gen, Black Salt Pouch +10% gen,
 *                         Defixio +50% suicide rate, Crossroads Dirt −15% Indagatio time
 *                 Every maleficium magnitude above is scaled by Gaap #33's maleficia-effect boost
 *                 (ADR-036), via `boostMaleficiumFactor` so a boosted cut never inverts.
 *
 * SIGILS: every seal's strength, in every channel, is scaled by ONE multiplier from
 * `sigilEffectStack` (the sigil-effect relics, boosted by Gaap, × Semet #32; ADR-036).
 *
 * PER-CATEGORY tier shifts (02 §2) are NOT part of the global bundle: a source that lifts one
 * category's success probability (Resignation → Suasio, Retribution → Decimatio, the per-category
 * tier seals) is returned by `categoryTierModifiers(state, category)` and composed by
 * `resolveAction` at resolution time, since it targets a single category's distribution.
 *
 * Skill→effect coupling for now: a skill that "increases X" multiplies X by (1 + intensity); a
 * skill that "decreases X" divides by the same (asymptotic to 0, never negative). The
 * spreadsheet's `SKILL_INTENSITY_DIVISOR` already sets the intensity curve; per-Sin coefficients on
 * top of this are a future tuning surface.
 */
import { SINS, totalReprobates, type GameState, type Sin } from './state.js';
import { sinLevel, skillIntensity } from './progression.js';
import { type TierModifiers, type Tier } from './probability.js';
import { boostMaleficiumFactor, countCopies, maleficiaBuffMultipliers } from './maleficia.js';
import { SYNGRAPHAE, hoardMilestoneBonus, syngraphaSigned } from './syngraphae.js';
import { aurevoraEfficiencyMul } from './apex.js';
import { indagatioInvestmentEfficiencyMul } from './indagatio.js';
import { callBuffMultipliers } from './callBuffs.js';
import {
  sigilEffectStack,
  sigilModifierContributions,
  sigilMurderTriggersSuicideChance,
  sigilStrengthMul,
  sigilCategoryTierContributions,
  sigilInvocationSinContributions,
  sigilInvocationEffectContributions,
  sigilFlatGeneration,
  sigilShutdownRefundMul,
  type ScalarModifierField,
} from './sigils.js';
import {
  ARS_SERPENS_SUASIO_BONUS,
  GULA_NEGATIVE_TIER_REDUCTION_PER_LEVEL,
  IRA_DECIMATIO_EFF_PER_LEVEL,
  LUXURIA_SUASIO_EFF_PER_LEVEL,
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
  /**
   * Flat additive increase to the BASE per-capita murder rate (Glasya-Labolas #25 — the sheet's
   * "+Murder rate (flat)"). Added to `BASE_MURDER_RATE_PER_SECOND` before ×population×mul. Default 0.
   */
  readonly flatBaseMurderRatePerSecond: number;
  /**
   * Flat additive births/s (Ose #57 — "+reprobate generation (flat)"; the Empusa / Lamia / Succubus
   * invocations, efficiency-scaled). Added to the generation term in `reprobateRates` before the
   * generation multiplier. Default 0.
   */
  readonly flatGenerationPerSecond: number;
  /**
   * Absolute murders/s from invocations (each Imp, efficiency-scaled) — NOT per-capita. Added
   * straight to the murder pool in `reprobateRates`, bypassing the population × `murderRateMul`
   * scaling. Each resulting death mints a soul. Default 0.
   */
  readonly flatMurdersPerSecond: number;
  /**
   * Absolute suicides/s from invocations (each Banshee, efficiency-scaled) — NOT per-capita. Added
   * straight to the suicide pool in `reprobateRates`, bypassing the population × rate scaling. Each
   * resulting death mints a soul. Default 0.
   */
  readonly flatSuicidesPerSecond: number;
  /**
   * Flat desidia generated per second by invocations (each Blob, plus Morpheus's per-consumed-
   * reprobate yield), efficiency-scaled. Added to the top-level desidia pool in the tick (clamped
   * to `desidiaMax`). Default 0.
   */
  readonly flatDesidiaPerSecond: number;
  /**
   * Chance each murder also drives a witness to suicide (Leraie #14). Applied at the rate level:
   * suicides/s += chance × murders/s. Default 0.
   */
  readonly murderTriggersSuicideChance: number;
  /**
   * Flat additive to the Stellar outcome CHANCE (probability), applied GLOBALLY at action resolution
   * AFTER the weighted distribution is normalized (probability.ts `addFlatTierChance`) — an absolute
   * bump to the Stellar tier, not a weight multiplier like `tierWeightMul.stellar`. Source: each
   * Behemoth (efficiency-scaled). The other tiers shrink proportionally to keep the sum at 1. 0 when
   * no source is active.
   */
  readonly flatStellarChance: number;
  /** Multiplier on the lifetime `maxInfluence` (raises the cap). */
  readonly maxInfluenceMul: number;
  /** Multiplier on the player's own action efficiency (Gula). Stacks with category eff. */
  readonly playerEfficiencyMul: number;
  /** Multiplier on Suasio-category action efficiency (Leviathan / Resignation). */
  readonly suasioEfficiencyMul: number;
  /** Multiplier on Decimatio-category action efficiency (Satan / Retribution). */
  readonly decimatioEfficiencyMul: number;
  /**
   * Multiplier on Indagatio-category action efficiency (time-mode → scales speed). Sources: Bifrons
   * #46, the a-good-find call buff, and the logarithmic gold-investment bonus (03 §2.5).
   */
  readonly indagatioEfficiencyMul: number;
  /** Multiplier on Emptio-category action efficiency (time-mode → scales speed). Seere #70. */
  readonly emptioEfficiencyMul: number;
  /** Per-tier multipliers applied to action weights before renormalization (resolveAction). */
  readonly tierWeightMul: TierModifiers;
  /**
   * Multiplier on passive reprobate generation rate (02 §9). Empty for now — base rate is 0 until
   * Vitium businesses contribute; Aamon (#7) adds to it.
   */
  readonly reprobateGenerationRateMul: number;
  /**
   * Multiplier on the population-wide reprobate suicide rate (02 §9). Raised by Panvitium, the Doom
   * Gathering ceremony, the Witch Ladder maleficium, and the suicide sigils (Ronove #27,
   * Sabnock #43). The old Tristitia per-level 2× was retired in the Sins remap — Tristitia's skill
   * now feeds acolyte efficiency, not suicide.
   */
  readonly reprobateSuicideRateMul: number;
  /**
   * Multiplier on the reprobate murder rate (02 §9). Murder is now a per-capita cull of the whole
   * population (subtypes removed); this multiplier carries Panvitium and sigil/maleficium/invocation
   * effects (Aim #23, etc.).
   */
  readonly murderRateMul: number;
  /**
   * Multiplier on the Faeneratio output — the SUM of Mutuum income and Thesaurus interest, scaled
   * at the tick's gold line. Sources: Plutus invocation (flat factor on the lending enterprises),
   * Vapula #60 sigil. The renamed `vitiumMercaturaOutputMul` (Depraedatio gold rework), unchanged
   * in magnitude.
   */
  readonly faenerationOutputMul: number;
  /**
   * Multiplier on the Fenus rate (the hoard's interest). Sources: the Usura Syngraphae
   * (usura-1/2/3); future sigils. Default 1×.
   */
  readonly fenusRateMul: number;
  /**
   * Multiplier on the Mutuum per-capita take (the loan book). Sources: the Faeneratio Syngraphae
   * (faeneratio-1/3); future sigils. Default 1×.
   */
  readonly mutuumPerCapitaMul: number;
  /**
   * Multiplier on the Thesaurus withdrawal recovery fraction (base 0.25, capped at 0.9 effective).
   * Sources: the Custodia Syngraphae (custodia-1/3); Vine #45 / Furcas #50 re-pin here — the same
   * "recovery" niche they held for the Mercatus divest. Default 1×.
   */
  readonly thesaurusRecoveryMul: number;
  /**
   * Escheat (faeneratio-2): flat gold minted per applied murder / suicide at the dynamics step —
   * the estates of the dead escheat to creditors unseen. Additive fields so any future murder-gold
   * source (a revived Leraie line) composes on the same mint. Default 0.
   */
  readonly escheatGoldPerMurder: number;
  readonly escheatGoldPerSuicide: number;
  /**
   * Per-acolyte action efficiency (02 §10). Default 0.33: an acolyte runs an action at one-third
   * of the player's own efficiency. Future sources fold in multiplicatively: Bathin #18, Satan
   * level (each +33%), other acolyte-tagged sigils. Read by the acolyte tick when starting a new
   * cycle (timer duration = baseTime / acolyteEff in time mode; cost/outcome scale in cost-outcome
   * mode, deferred to a later slice).
   */
  readonly acolyteEfficiencyMul: number;
  /**
   * The all-invocation effect multiplier (03 §1): Ira's Retribution skill × Black Candles × the
   * Grimoire of Pope Honorius × Murmur #54. Every efficiency-scaled invocation magnitude in this
   * module reads it (times that invocation's per-Sin sigil term, Samigina/Barbatos/Bune/Berith/
   * Furfur/Vepar/Shax/Alloces). Exposed as the readout; the per-Sin terms stay internal. Default 1×.
   */
  readonly invocationEfficiencyMul: number;
  /**
   * Multiplier on the Desidia time-speed factor (ADR-033): the effective speed while Desidia is
   * active is `DESIDIA_BASE_SPEED × this`. Acedia's Procrastination skill lifts it by (1 + intensity).
   * Default 1×.
   */
  readonly desidiaSpeedMul: number;
  /**
   * Multiplier on the Desidia-drain rate (ADR-033): drain/s = `DESIDIA_BASE_COST × this`.
   * Each bound Lemure reduces it (×0.9375 per copy, so lower = cheaper); Sallos #19 softens it too.
   * Default 1×.
   */
  readonly desidiaDrainMul: number;
  /**
   * Multiplier on the offline Desidia-gain rate (ADR-034), consumed by `grantDesidiaForOffline`.
   * Sitri #12 lifts it. Default 1×.
   */
  readonly desidiaGainMul: number;
  /**
   * Multiplier on the Desidia cap (ADR-034), consumed by `desidiaMax` on top of the Acedia-tier
   * doubling. Orias #59 lifts it. Default 1×.
   */
  readonly desidiaMaxMul: number;
}

/** No sources active — every multiplier is 1; tier shifts are absent (all default 1). */
export const NEUTRAL_MODIFIERS: Modifiers = {
  goldRateMul: 1,
  influenceRateMul: 1,
  flatInfluencePerSecond: 0,
  flatBaseSuicideRatePerSecond: 0,
  flatBaseMurderRatePerSecond: 0,
  flatGenerationPerSecond: 0,
  flatMurdersPerSecond: 0,
  flatSuicidesPerSecond: 0,
  flatDesidiaPerSecond: 0,
  murderTriggersSuicideChance: 0,
  flatStellarChance: 0,
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
  faenerationOutputMul: 1,
  fenusRateMul: 1,
  mutuumPerCapitaMul: 1,
  thesaurusRecoveryMul: 1,
  escheatGoldPerMurder: 0,
  escheatGoldPerSuicide: 0,
  acolyteEfficiencyMul: 0.33,
  invocationEfficiencyMul: 1,
  desidiaSpeedMul: 1,
  desidiaDrainMul: 1,
  desidiaGainMul: 1,
  desidiaMaxMul: 1,
};

/** Default skill→effect coupling for a skill that "increases X": X *= (1 + intensity). */
const skillBonus = (intensity: number): number => 1 + intensity;

/** Resolve the modifier bundle from the current game state. */
export function computeModifiers(state: GameState): Modifiers {
  // Sin levels (03 §1 "Per-level effect", confirmed in `Sins & Devotion` sheet).
  const gulaLvl = sinLevel(state.devotion.gula);
  const luxuriaLvl = sinLevel(state.devotion.luxuria);
  const vanagloriaLvl = sinLevel(state.devotion.vanagloria);
  const iraLvl = sinLevel(state.devotion.ira);

  // Sin skill intensities (continuous; intensity = ln(devotion)² / SKILL_INTENSITY_DIVISOR).
  const avaritiaIntensity = skillIntensity(state.devotion.avaritia);
  const vanagloriaIntensity = skillIntensity(state.devotion.vanagloria);
  const tristitiaIntensity = skillIntensity(state.devotion.tristitia);
  const iraIntensity = skillIntensity(state.devotion.ira);
  const gulaIntensity = skillIntensity(state.devotion.gula);
  const superbiaIntensity = skillIntensity(state.devotion.superbia);
  const luxuriaIntensity = skillIntensity(state.devotion.luxuria); // Seduction → gen rate
  const acediaIntensity = skillIntensity(state.devotion.acedia); // Procrastination → Desidia speed

  // Incoming-call timed buffs (docs/PANVITIUM-CALLS-IN.md): per-field products of the active buffs,
  // folded multiplicatively into the matching fields below (ADR-022). Neutral (all 1) when none run.
  const cb = callBuffMultipliers(state);

  // The sigil-effect stack (ADR-036): `sigMul` scales every bound seal's strength (the same value
  // every other sigil channel reads, via `sigilStrengthMul`), and `mb` is Gaap #33's boost on every
  // maleficium magnitude below. 1 / 1 with no relic, Semet or Gaap.
  const stack = sigilEffectStack(state);
  const sigMul = stack.sigilMul;
  const mb = stack.maleficiaBoost;

  // Equipped maleficia (03 §4). Every enhancer relic here is non-stackable except Black Candles, so
  // `c(id)` is 0 or 1. Each magnitude is Gaap-boosted: `more` is a `+bonus` percent per copy, `flat`
  // a per-second amount per copy, and `factor` a lift or cut read through `boostMaleficiumFactor`
  // (a boosted cut deepens toward zero, never past it). `mBuff` is the per-field product of the
  // active single-use buffs (Hand of Glory, Black Salt Pouch, Defixio, Crossroads Dirt).
  const owned = state.lifetime.maleficia;
  const c = (id: string): number => countCopies(owned, id);
  const more = (id: string, bonus: number): number => 1 + bonus * mb * c(id);
  const flat = (id: string, perSecond: number): number => perSecond * mb * c(id);
  const factor = (id: string, f: number): number => (c(id) > 0 ? boostMaleficiumFactor(f, mb) : 1);
  const mBuff = maleficiaBuffMultipliers(state, mb);
  // Indagatio time reductions read as search-speed lifts: −X% time ⇒ ×1/(1−X) efficiency.
  const INDAGATIO_TIME_MUL = (frac: number): number => 1 / (1 - frac);

  // Active invocations (03 §2.4). Counts read straight from the lifetime map; effect magnitudes
  // live here alongside the other effect coefficients (the catalog in invocations.ts owns the
  // gates and costs, this module owns what each does — mirroring how maleficia effects are coded).
  const inv = state.lifetime.invocations;
  const hasFamiliar = (inv.familiar ?? 0) > 0; // +33% player efficiency
  const wendigoCount = inv.wendigo ?? 0; // each: +2% player efficiency (flat, not efficiency-scaled)
  const famaCount = inv.fama ?? 0; // each: +7.5% influence gain (× invEff)
  const nightmareCount = inv.nightmare ?? 0; // each: additive to base suicide rate (× invEff)
  const behemothCount = inv.behemoth ?? 0; // each: additive to Stellar chance (× invEff)
  const harpyCount = inv.harpy ?? 0; // each: additive to base murder rate (× invEff)
  const narcissusCount = inv.narcissus ?? 0; // each: +1% positive outcome weights (flat)
  const upirCount = inv.upir ?? 0; // each: −1% negative outcome weights (× invEff)
  const impCount = inv.imp ?? 0; // each: +1 murder/s (× invEff)
  const bansheeCount = inv.banshee ?? 0; // each: +1 suicide/s (× invEff)
  const empusaCount = inv.empusa ?? 0; // each: +1 reprobate/s (× invEff)
  const lamiaCount = inv.lamia ?? 0; // each: +50 reprobates/s (× invEff)
  const koboldCount = inv.kobold ?? 0; // each: +100 gold gain/s (× invEff)
  const arachneCount = inv.arachne ?? 0; // each: +1 influence/s (× invEff)
  const blobCount = inv.blob ?? 0; // each: +0.00625 desidia/s (× invEff)
  const morpheusCount = inv.morpheus ?? 0; // each: +0.001 desidia per cost-consumed reprobate (× invEff)
  const hasSuccubus = (inv.succubus ?? 0) > 0; // apex Luxuria: +10000 reprobates/s (× invEff)
  const hasMidas = (inv.midas ?? 0) > 0; // ×10 gold, ×10 Apocalyptic
  const plutusCount = inv.plutus ?? 0; // each: +15% Faeneratio output (× invEff)
  const lemureCount = inv.lemure ?? 0; // each: ×0.9375 Desidia drain (× invEff, ADR-033)
  const hasSpecunitas = (inv.specunitas ?? 0) > 0; // apex Vanagloria: ×3 influence gain/s
  const hasDoppel = (inv.doppelgaenger ?? 0) > 0; // +100% player eff (upkeep: ½ influence gain)
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
  // Fausto Cescru's curse (05, the adversary): while his fourth letter sits unbroken in the inbox,
  // reprobate generation, influence gain and gold gain each run two-thirds slower (×0.33). Lifted the
  // moment the email is deleted (`flagFaustoCurse` clears) — the in-fiction "as long as these words
  // remain" tell. A single flat multiplier folded into the three affected rates below (ADR-022).
  const faustoCurseMul = state.lifetime.flagFaustoCurse === true ? 0.33 : 1;
  const PANV_GEN_MUL = 10;
  const PANV_SUICIDE_MUL = 20;
  const PANV_MURDER_MUL = 20;
  // Invocation effect magnitudes. Each per-copy factor marked "(× invEff)" is scaled by the
  // all-invocation × per-Sin invocation-effect multiplier (`invEffFor(sin)`) — NOT player efficiency
  // (the player-efficiency coupling was removed; the demonic court now scales only with invocation
  // efficiency). The `narcissus`/`wendigo` factors are flat (no efficiency scaling), per the catalog.
  const FAMA_INFLUENCE_FACTOR = 0.075; // each Fama: +7.5% influence gain
  const PLUTUS_FAENERATIO_FACTOR = 0.15; // each Plutus: +15% Faeneratio output (Mutuum + interest)
  const BLACK_CANDLES_INVOCATION_BONUS = 0.03; // each Black Candle: +3% invocation effect (cap 5 → +15%)
  const NIGHTMARE_SUICIDE_FACTOR = 0.005; // each Nightmare: +0.005/s base reprobate suicide rate
  const HARPY_MURDER_FACTOR = 0.005; // each Harpy: +0.005/s base reprobate murder rate
  const BEHEMOTH_STELLAR_FLAT = 0.00025; // each Behemoth: +0.00025 flat Stellar chance (0.025 pp)
  const WENDIGO_PLAYER_EFF_FACTOR = 0.02; // each Wendigo: +2% player efficiency (flat)
  const NARCISSUS_POSITIVE_FACTOR = 0.01; // each Narcissus: +1% every positive outcome weight (flat)
  const UPIR_NEGATIVE_FACTOR = 0.01; // each Upir: −1% every negative outcome weight (× invEff)
  const IMP_MURDERS_PER_SECOND = 1; // each Imp: +1 murder/s
  const BANSHEE_SUICIDES_PER_SECOND = 1; // each Banshee: +1 suicide/s
  const EMPUSA_GENERATION_PER_SECOND = 1; // each Empusa: +1 reprobate/s
  const LAMIA_GENERATION_PER_SECOND = 50; // each Lamia: +50 reprobates/s
  const SUCCUBUS_GENERATION_PER_SECOND = 10000; // Succubus: +10000 reprobates/s
  const KOBOLD_GOLD_PER_SECOND = 100; // each Kobold: +100 gold gain/s
  const ARACHNE_INFLUENCE_PER_SECOND = 0.25; // each Arachne: +0.25 influence/s
  const BLOB_DESIDIA_PER_SECOND = 0.00625; // each Blob: +0.00625 desidia/s
  const MORPHEUS_REPROBATE_FRACTION = 0.05; // Morpheus consumes 5% of the pool/s (mirrors its upkeep)
  const MORPHEUS_DESIDIA_PER_REPROBATE = 0.001; // Morpheus: +0.001 desidia per consumed reprobate
  const LEMURE_DRAIN_REDUCTION_PER_COPY = 0.0625; // each Lemure: ×0.9375 Desidia drain (× invEff)

  // Bound sigils (03 §5). Each contributes a multiplier to a scalar field or a tier weight; many
  // sigils on one field compose multiplicatively. The catalog + curves live in sigils.ts; here we
  // just fold the aggregated contributions in. `sc(f)` is the sigil multiplier for field f (1 if none).
  // Every contribution is scaled by `sigMul` (the Gaap-boosted sigil-effect relics × Semet #32), the
  // SAME multiplier every other sigil channel reads via `sigilStrengthMul` (per-category tiers, cost
  // reductions, invoking power, dup / double-find chances, Katabasis carry-over). Keep it that way
  // when adding a sigil source: no channel may skip it (ADR-036).
  const sig = sigilModifierContributions(state, sigMul);
  const sc = (f: ScalarModifierField): number => sig.scalar[f] ?? 1;
  // Flat per-second generators (Haagenti #48 gold, Decarabia #69 influence), scaled by enhancers.
  const flatGen = sigilFlatGeneration(state, sigMul);

  // Tier weights: accumulate per-tier products from every source, then apply locks LAST. Missing
  // keys mean 1 in `applyTierModifiers`; under exactOptionalPropertyTypes we assign only when ≠ 1.
  const tierAcc: Partial<Record<Tier, number>> = {};
  const bumpTier = (t: Tier, mul: number): void => {
    tierAcc[t] = (tierAcc[t] ?? 1) * mul;
  };
  // Gula per-level (sheet rev 2026-06-12): each level strips a fifth of the negative tiers'
  // weight — Bad/Terrible/Apocalyptic ×(1 − 0.2·L), level 4 → 20% of the negative weight remains;
  // the freed mass renormalizes across the remaining tiers. (Insatiability, the SKILL, moved to
  // player efficiency — see `playerEff`.)
  const gulaNegFactor = Math.max(0, 1 - GULA_NEGATIVE_TIER_REDUCTION_PER_LEVEL * gulaLvl);
  if (gulaLvl > 0) {
    bumpTier('bad', gulaNegFactor);
    bumpTier('terrible', gulaNegFactor);
    bumpTier('apocalyptic', gulaNegFactor);
  }
  if (superbiaIntensity > 0) bumpTier('stellar', skillBonus(superbiaIntensity)); // Morning Star
  if (hasMidas) bumpTier('apocalyptic', 10); // Midas tenfold
  // Narcissus (Superbia): +10% to every POSITIVE outcome weight (flat, cap 1). Renormalization
  // pulls the freed probability off the failure tiers.
  if (narcissusCount > 0) {
    const f = 1 + NARCISSUS_POSITIVE_FACTOR * narcissusCount;
    bumpTier('stellar', f);
    bumpTier('excellent', f);
    bumpTier('good', f);
  }
  for (const [t, mul] of Object.entries(sig.tier)) bumpTier(t as Tier, mul); // Bael #1, Balam #51, Amdusias #67
  const tierWeightMul: TierModifiers = {};
  for (const [t, mul] of Object.entries(tierAcc)) if (mul !== 1) tierWeightMul[t as Tier] = mul;

  // (Per-subtype reprobate effects removed with subtypes: the Sin-themed VM gold boost and the
  // eight secondary rate penalties — Glutton/Degenerate/Gambler/Nihilist/Choleric/Husk/Celebrity/
  // Sigma — no longer exist. Reprobates are a single undifferentiated pool with no per-capita drag.)

  // The all-invocation effect multiplier every efficiency-scaled invocation magnitude below reads:
  // Ira's Retribution SKILL (intensity, continuous; sheet rev 2026-06-12), Black Candles (+3% each,
  // stack-capped at 5 by the catalog), the Grimoire of Pope Honorius (+13%) and Murmur #54.
  const invEff =
    skillBonus(iraIntensity) *
    more('black_candles', BLACK_CANDLES_INVOCATION_BONUS) *
    more('grimoire_of_pope_honorius', 0.13) *
    sc('invocationEfficiencyMul');
  // Per-INVOCATION effectiveness (Buer #10 → familiar), keyed by id. Scales a specific
  // invocation's effect coefficient; 1× when no such sigil is bound.
  const invInvContrib = sigilInvocationEffectContributions(state, sigMul);
  const invEffForInv = (id: string): number => invInvContrib[id] ?? 1;
  // Gula's Insatiability SKILL (intensity, continuous) lifts online player efficiency (sheet rev
  // 2026-06-12); the old ×2-per-Gula-level ladder is retired (levels now strip negative tiers).
  const playerEff =
    skillBonus(gulaIntensity) *
    (hasDoppel ? 2 : 1) * // Doppelgänger: +100% player efficiency
    (1 + WENDIGO_PLAYER_EFF_FACTOR * wendigoCount) * // each Wendigo: +2% player efficiency (flat)
    more('the_dadu', 0.05) * // The Dadu: +5% player efficiency (Maleficia)
    (hasFamiliar ? 1 + 0.33 * invEffForInv('familiar') : 1) *
    aurevoraEff *
    erinyesStackMul *
    sc('playerEfficiencyMul') *
    cb.playerEfficiencyMul; // the-discipline-swells call buff (Model 1: also lifts invocation effects)
  // Per-Sin invocation effectiveness (the eight Sin-themed sigils). `invEffFor(sin)` is the global
  // invocation-effect multiplier × that Sin's sigil boost; every efficiency-derived invocation effect
  // below uses it in place of the bare `invEff`, keyed by the invocation's own Sin.
  const invSinContrib = sigilInvocationSinContributions(state, sigMul);
  const invSinEff = {} as Record<Sin, number>;
  for (const s of SINS) invSinEff[s] = invSinContrib[s] ?? 1;
  const invEffFor = (sin: Sin): number => invEff * invSinEff[sin];
  // Behemoth (Superbia): a FLAT bump to the Stellar CHANCE, invocation-efficiency-scaled. Unlike the
  // weight multipliers here, it is applied post-normalization at resolution time (actions.ts →
  // `addFlatTierChance`); the magnitude is carried out on the `flatStellarChance` field below.
  // Upir (Gula): −1% to every NEGATIVE outcome weight per copy, invocation-efficiency-scaled. Uses
  // the asymptotic "decrease" form ×1/(1 + strength) so a large stack softens toward zero weight but
  // never inverts it. Deferred here for `invEff`; composes with Gula's per-level negative-tier strip.
  if (upirCount > 0) {
    const soften = 1 / (1 + UPIR_NEGATIVE_FACTOR * invEffFor('gula') * upirCount);
    for (const t of ['bad', 'terrible', 'apocalyptic'] as const) {
      tierWeightMul[t] = (tierWeightMul[t] ?? 1) * soften;
    }
  }

  const maxInfluenceMulV = skillBonus(vanagloriaIntensity) * sc('maxInfluenceMul');

  // Signed Syngraphae (the Avaritia contract tree, spec §4.3/§5): the modifier-fold nodes compose
  // multiplicatively per ADR-022 (the mechanism nodes — Anatocismus, the liquidation bonus,
  // Peculium — are wired at their own sites); Escheat's two coefficients are flat additive fields.
  let fenusRateMulV = 1;
  let mutuumPerCapitaMulV = 1;
  let thesaurusRecoveryMulV = 1;
  let escheatGoldPerMurderV = 0;
  let escheatGoldPerSuicideV = 0;
  for (const node of SYNGRAPHAE) {
    if (!syngraphaSigned(state, node.id)) continue;
    const eff = node.effect;
    if (eff.kind === 'fenusRateMul') fenusRateMulV *= eff.mul;
    else if (eff.kind === 'mutuumPerCapitaMul') mutuumPerCapitaMulV *= eff.mul;
    else if (eff.kind === 'thesaurusRecoveryMul') thesaurusRecoveryMulV *= eff.mul;
    else if (eff.kind === 'escheat') {
      escheatGoldPerMurderV += eff.goldPerMurder;
      escheatGoldPerSuicideV += eff.goldPerSuicide;
    }
  }

  return {
    // Succubus' "99% gold gain" cost is now per-second upkeep (tick.ts 1a), not a rate cut here.
    // The custodia-2 hoard-milestone bonus (+2%/decade of hoard ≥ 1,000, capped +20%) folds here
    // directly — a derived multiplier like any other; the bundle stays derived, never persisted.
    goldRateMul:
      skillBonus(avaritiaIntensity) *
      (hasMidas ? 10 : 1) * // Midas (apex Avaritia): ×10 gold gain
      more('dybbuk_box', 0.1) * // Dybbuk Box: +10% gold gain
      more('achans_wedge', 2) * // Achan's Wedge: +200% gold gain
      (1 + hoardMilestoneBonus(state)) *
      sc('goldRateMul') *
      cb.goldRateMul * // the-cycle-turns / a-good-find / blood-in-the-cage call buffs
      faustoCurseMul,
    // Doppelgänger's "50% influence gain" cost is now per-second upkeep (tick.ts 1a), not a cut here.
    influenceRateMul:
      1.33 ** vanagloriaLvl * // ×1.33 influence gain per Vanagloria level (sheet rev 2026-06-12)
      more('codex_gigas', 0.25) * // Codex Gigas: +25% influence gain rate
      more('spear_of_longinus', 2) * // Spear of Longinus: +200% influence gain rate
      (1 + FAMA_INFLUENCE_FACTOR * invEffFor('vanagloria') * famaCount) * // each Fama: +7.5% (× invEff)
      (hasSpecunitas ? 3 : 1) * // Specunitas (apex Vanagloria): ×3 influence gain/s
      sc('influenceRateMul') *
      cb.influenceRateMul * // eager-hands / ministry / social-platform / parish call buffs (gain ≡ regen)
      faustoCurseMul, // Fausto's curse (05): ×0.33 while his fourth letter remains

    maxInfluenceMul: maxInfluenceMulV,
    // Flat influence/s: the Decarabia #69 generator sigil (log curve) + each Arachne (+1/s × invEff).
    flatInfluencePerSecond:
      flatGen.influence +
      ARACHNE_INFLUENCE_PER_SECOND * invEffFor('vanagloria') * arachneCount +
      // Maleficia flat influence/s: Black Robe +0.4, Blood Chalk +2, Blackthorn Wand +2, Sulfur Censer +0.6.
      flat('black_robe', 0.4) +
      flat('blood_chalk', 2) +
      flat('blackthorn_wand', 2) +
      flat('sulfur_censer', 0.6),
    // Flat gold/s: the Haagenti #48 generator sigil (log curve) + each Kobold (+100/s × invEff).
    flatGoldPerSecond: flatGen.gold + KOBOLD_GOLD_PER_SECOND * invEffFor('avaritia') * koboldCount,
    // Additive increase to the base per-capita reprobate suicide rate (added to the base in
    // `dynamics`). Each Nightmare contributes +0.005/s × invEff.
    flatBaseSuicideRatePerSecond:
      NIGHTMARE_SUICIDE_FACTOR * invEffFor('tristitia') * nightmareCount + flatGen.suicideRate, // Sabnock #43 (log curve, flat per-capita addition)
    // Flat addition to the per-capita murder base: Glasya-Labolas #25 (log curve) + each Harpy
    // (+0.005/s × invEff).
    flatBaseMurderRatePerSecond:
      flatGen.murderRate + HARPY_MURDER_FACTOR * invEffFor('ira') * harpyCount,
    // Flat absolute births/s (before the generation multiplier): Ose #57 + the Luxuria reprobate
    // invocations — each Empusa (+1/s), each Lamia (+50/s), Succubus (+10000/s), all × invEff.
    flatGenerationPerSecond:
      flatGen.generation +
      (EMPUSA_GENERATION_PER_SECOND * empusaCount +
        LAMIA_GENERATION_PER_SECOND * lamiaCount +
        (hasSuccubus ? SUCCUBUS_GENERATION_PER_SECOND : 0)) *
        invEffFor('luxuria') +
      // Maleficia flat births/s: Adder Stone +0.6, Witch Bottle +0.8.
      flat('adder_stone', 0.6) +
      flat('witch_bottle', 0.8),
    // Absolute murders/s from each Imp (+1/s × invEff) and suicides/s from each Banshee (+1/s × invEff),
    // added straight to the dynamics pools (each death mints a soul).
    // Maleficia flat murders/s (Hollow Effigy +0.1, Witch Ladder +0.15) and suicides/s (Poppet
    // +0.075, Mandrake Root +0.05) join the invocation flats, each death minting a soul.
    flatMurdersPerSecond:
      IMP_MURDERS_PER_SECOND * invEffFor('ira') * impCount +
      flat('hollow_effigy', 0.1) +
      flat('witch_ladder', 0.15),
    flatSuicidesPerSecond:
      BANSHEE_SUICIDES_PER_SECOND * invEffFor('tristitia') * bansheeCount +
      flat('poppet', 0.075) +
      flat('mandrake_root', 0.05),
    // Desidia generated/s: each Blob (+0.00625/s) plus Morpheus's per-consumed-reprobate yield
    // (0.05 × population × 0.001/s), both × invEff. Applied to the desidia pool in the tick.
    flatDesidiaPerSecond:
      (BLOB_DESIDIA_PER_SECOND * blobCount +
        MORPHEUS_REPROBATE_FRACTION *
          totalReprobates(state) *
          MORPHEUS_DESIDIA_PER_REPROBATE *
          morpheusCount) *
      invEffFor('acedia'),
    // Leraie #14: chance each murder also triggers a suicide (rate-level coupling in dynamics).
    murderTriggersSuicideChance: sigilMurderTriggersSuicideChance(state, sigMul),
    // Behemoth (Superbia): each copy adds a flat Stellar-chance bump, invocation-efficiency-scaled;
    // applied post-normalization at resolution time (actions.ts → addFlatTierChance).
    flatStellarChance: BEHEMOTH_STELLAR_FLAT * invEffFor('superbia') * behemothCount,
    playerEfficiencyMul: playerEff,
    suasioEfficiencyMul:
      LUXURIA_SUASIO_EFF_PER_LEVEL ** luxuriaLvl * // ×2 per Luxuria level (sheet rev 2026-06-12)
      more('ars_serpens', ARS_SERPENS_SUASIO_BONUS) * // Ars Serpens: +33% Suasio efficiency
      sc('suasioEfficiencyMul'),
    decimatioEfficiencyMul:
      IRA_DECIMATIO_EFF_PER_LEVEL ** iraLvl * // ×2 per Ira level (sheet rev 2026-06-12)
      sc('decimatioEfficiencyMul'),
    // Indagatio efficiency: sigils × the a-good-find call buff × the logarithmic bonus from the gold
    // investment (03 §2.5) × the maleficia that shorten the Search — Crow Feather (−10% time) and
    // Obsidian Mirror (−33%) passively, Crossroads Dirt (−15%, single-use buff via `mBuff`).
    indagatioEfficiencyMul:
      sc('indagatioEfficiencyMul') *
      cb.indagatioEfficiencyMul *
      indagatioInvestmentEfficiencyMul(state.lifetime.indagatioInvestment) *
      factor('crow_feather', INDAGATIO_TIME_MUL(0.1)) *
      factor('obsidian_mirror', INDAGATIO_TIME_MUL(0.33)) *
      mBuff.indagatioEfficiencyMul,
    emptioEfficiencyMul: sc('emptioEfficiencyMul'),
    tierWeightMul,
    // Reprobate generation: Panvitium amplifies; Luxuria's Seduction skill lifts it continuously
    // (03 §1); the single-use buffs, the Aamon #7 sigil and the call buffs compose.
    reprobateGenerationRateMul:
      (panvitiumActive ? PANV_GEN_MUL : 1) *
      mBuff.reprobateGenerationRateMul * // Hand of Glory (+33%) / Black Salt Pouch (+10%), single-use
      skillBonus(luxuriaIntensity) *
      sc('reprobateGenerationRateMul') *
      cb.reprobateGenerationRateMul * // the-cycle-turns / eager-hands / the-shipment / parish call buffs
      faustoCurseMul, // Fausto's curse (05): ×0.33 while his fourth letter remains

    // Suicide (sheet rev 2026-06-12): Tristitia no longer touches it — Resignation (the skill) moved
    // to acolyte efficiency, and the per-level doubling is retired. Pressure sources are maleficia
    // (Thirty Pieces of Silver +200%, Defixio +50% single-use), invocations and sigils. Panvitium
    // multiplies while active.
    reprobateSuicideRateMul:
      (panvitiumActive ? PANV_SUICIDE_MUL : 1) *
      more('thirty_pieces_of_silver', 2) * // Thirty Pieces of Silver: +200% suicide rate
      mBuff.reprobateSuicideRateMul * // Defixio (+50%), single-use
      sc('reprobateSuicideRateMul'),
    // Murder: Panvitium multiplies while active; Aim #23 sigil composes. Murder is a per-capita cull
    // of the whole population, lifted by Mark of Cain (+100%), Ritual Dagger (+10%), Galdrabók (+12.5%).
    murderRateMul:
      (panvitiumActive ? PANV_MURDER_MUL : 1) *
      more('mark_of_cain', 1) * // Mark of Cain: +100% murder rate (×2)
      more('ritual_dagger', 0.1) * // Ritual Dagger: +10% murder rate
      more('galdrabok', 0.125) * // Galdrabók: +12.5% murder rate
      sc('murderRateMul'),
    // Faeneratio output (Mutuum + Thesaurus interest): each Plutus lifts it (flat factor),
    // Vapula #60 sigil composes; applied to the summed term at the tick's gold-income line.
    faenerationOutputMul:
      (1 + PLUTUS_FAENERATIO_FACTOR * invEffFor('avaritia') * plutusCount) * // each Plutus: +15% (× invEff)
      sc('faenerationOutputMul'),
    // The Fenus rate (hoard interest): the Usura Syngraphae.
    fenusRateMul: fenusRateMulV,
    // The Mutuum per-capita take (the loan book): the Faeneratio Syngraphae.
    mutuumPerCapitaMul: mutuumPerCapitaMulV,
    // Thesaurus withdrawal recovery: the Custodia Syngraphae × the recovery sigils (Vine #45,
    // Furcas #50 — re-pinned from the Mercatus divest fraction to the same niche here).
    thesaurusRecoveryMul: thesaurusRecoveryMulV * sigilShutdownRefundMul(state, sigMul),
    // Escheat (faeneratio-2): flat gold per applied murder / suicide, minted in `dynamics`.
    escheatGoldPerMurder: escheatGoldPerMurderV,
    escheatGoldPerSuicide: escheatGoldPerSuicideV,
    // Acolyte efficiency: 0.33 baseline (02 §10); Tristitia's Resignation SKILL lifts it
    // continuously (sheet rev 2026-06-12); Bathin #18 sigil composes on top.
    acolyteEfficiencyMul:
      0.33 * skillBonus(tristitiaIntensity) * sc('acolyteEfficiencyMul') * cb.acolyteEfficiencyMul, // the-discipline-swells / the-looting call buffs
    // Invocation efficiency: 1× baseline; Ira's Retribution SKILL lifts it continuously (sheet rev
    // 2026-06-12). This is the all-invocation multiplier every efficiency-scaled invocation effect
    // reads (via `invEffFor(sin)` = invEff × the per-Sin term); NOT player efficiency.
    invocationEfficiencyMul: invEff,
    // Desidia time-speed (ADR-033): Acedia's Procrastination skill lifts the multiplier applied to
    // DESIDIA_BASE_SPEED; Foras #31 composes on top.
    desidiaSpeedMul: skillBonus(acediaIntensity) * sc('desidiaSpeedMul'),
    // Desidia-drain (ADR-033): each bound Lemure multiplies the drain by a factor that is
    // ×0.9375 at base invocation efficiency and softens further as invEff rises — the asymptotic
    // "decrease" form ×1/(1 + K·invEff) with K = 0.0625/0.9375, so invEff = 1 gives exactly ×0.9375 and
    // it never reaches 0 (more Lemures / higher invEff = a cheaper Desidia). Sallos #19 composes.
    desidiaDrainMul:
      (1 /
        (1 +
          (LEMURE_DRAIN_REDUCTION_PER_COPY / (1 - LEMURE_DRAIN_REDUCTION_PER_COPY)) *
            invEffFor('acedia'))) **
        lemureCount *
      factor('pilates_basin', 0.5) * // Pilate's Basin: −50% Desidia drain rate (a cut, never inverts)
      sc('desidiaDrainMul'),
    // Desidia gain / cap (ADR-034): Sitri #12 lifts the offline accrual rate, Orias #59 the cap.
    // The re-homed offline `doing-nothing` call buff also lifts the gain rate (cb.desidiaGainMul);
    // the Voynich Manuscript maleficium lifts it +25%.
    desidiaGainMul: more('voynich_manuscript', 0.25) * sc('desidiaGainMul') * cb.desidiaGainMul,
    desidiaMaxMul: sc('desidiaMaxMul'),
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
 *   - Suasio:    Resignation (Tristitia skill).
 *   - Decimatio: Retribution (Ira skill).
 *   - All four categories: the per-category tier sigils (below).
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
  // Per-category sigil contributions (the `categoryTier` seals: Vassago, Marbas, Beleth, Botis, Ipos,
  // Astaroth, Stolas, Phenex, Halphas, Vual, Gremory, Volac, Andras, Haures, Andromalius), scaled by
  // the same sigil-strength multiplier as every other channel (relics, Gaap, Semet; ADR-036).
  const sigCat = sigilCategoryTierContributions(state, category, sigilStrengthMul(state));
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
