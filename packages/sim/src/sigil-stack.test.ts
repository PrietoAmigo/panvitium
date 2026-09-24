/**
 * ADR-036 pins:
 *   - ONE sigil-strength multiplier (the sigil-effect relics, Gaap-boosted, × Semet #32) reaches every
 *     seal in every channel, Gaap #33 included; Semet never scales itself.
 *   - Gaap #33 boosts EVERY maleficium's effect (rates, flats, single-use buffs, Black Vessel, the
 *     sigil-effect relics), with cuts in the asymptotic form so a boosted cut never inverts; alone it
 *     does nothing.
 *   - EVERY invocation cost (each upkeep drain and Aurevora's gold drain) is cut by 1/(1 + x) for
 *     each of Orobas #55, Zepar #16, Andrealphus #65 and Black Vessel.
 */
import { describe, expect, it } from 'vitest';
import {
  AUREVORA_BASE_GOLD_DRAIN_PER_SECOND,
  BLACK_VESSEL_INVOCATION_COST_REDUCTION,
  MALEFICIA,
  MALEFICIA_BUFFS,
  activateMaleficium,
  aurevoraDrainNow,
  bindSigil,
  bn,
  categoryTierModifiers,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  currentInvokingPower,
  invocationCostMul,
  invocationUpkeep,
  maleficiaBuffMultipliers,
  resolveAction,
  resolveIndagatio,
  sigilById,
  sigilEffectStack,
  sigilStrength,
  sigilStrengthMul,
  tick,
  totalReprobates,
  type GameState,
  type Rng,
} from './index.js';

const SEMET = 32;
const GAAP = 33;
const SOULS = 1_000_000;

const fresh = (): GameState => createInitialState('adr-036', 0);
/** Bind several seals at once, funding the pool first so no binding is clamped. */
function withSeals(s: GameState, seals: Record<number, number>): GameState {
  let out: GameState = { ...s, souls: bn(Object.values(seals).reduce((a, b) => a + b, 0)) };
  for (const [id, n] of Object.entries(seals)) out = bindSigil(out, Number(id), n);
  return out;
}
const own = (s: GameState, ...ids: string[]): GameState => ({
  ...s,
  lifetime: { ...s.lifetime, maleficia: [...s.lifetime.maleficia, ...ids] },
});
const summon = (s: GameState, inv: Record<string, number>): GameState => ({
  ...s,
  lifetime: { ...s.lifetime, invocations: { ...s.lifetime.invocations, ...inv } },
});
/** Strength of seal `id` at `souls` bound (before any multiplier). */
const str = (id: number, souls = SOULS): number => sigilStrength(sigilById(id)!, bn(souls));
/** A stub RNG pinned to one float, so a chance roll lands exactly where the test puts it. */
const pinnedRng = (x: number): Rng => ({
  float: () => x,
  int: (n: number) => Math.floor(x * n),
  range: (lo: number, hi: number) => lo + x * (hi - lo),
  chance: (p: number) => x < p,
  state: 0,
});

describe('Semet #32 reaches every seal (ADR-036)', () => {
  const semet = str(SEMET);
  const withSemet = (seals: Record<number, number>): GameState =>
    withSeals(fresh(), { ...seals, [SEMET]: SOULS });

  it('is the (1 + semet) factor on the shared sigil-strength multiplier', () => {
    expect(sigilStrengthMul(fresh())).toBe(1);
    expect(sigilStrengthMul(withSeals(fresh(), { [SEMET]: SOULS }))).toBeCloseTo(1 + semet, 9);
  });

  it('scales a passive-bundle seal (Valefor #6, gold gain)', () => {
    expect(computeModifiers(withSemet({ 6: SOULS })).goldRateMul).toBeCloseTo(
      1 + str(6) * (1 + semet),
      9,
    );
  });

  it('scales a per-category tier seal (Vassago #3, Indagatio Stellar)', () => {
    expect(categoryTierModifiers(withSemet({ 3: SOULS }), 'indagatio').stellar).toBeCloseTo(
      1 + str(3) * (1 + semet),
      9,
    );
  });

  it('scales a cost-reduction seal (Orobas #55, every invocation cost)', () => {
    expect(invocationCostMul(withSemet({ 55: SOULS }))).toBeCloseTo(
      1 / (1 + str(55) * (1 + semet)),
      9,
    );
  });

  it('scales Forneus #30 invoking power', () => {
    const forneus = str(30);
    expect(currentInvokingPower(withSeals(fresh(), { 30: SOULS }))).toBe(Math.round(forneus));
    expect(currentInvokingPower(withSemet({ 30: SOULS }))).toBe(Math.round(forneus * (1 + semet)));
  });

  it('scales a Katabasis carry-over seal (Purson #20, gold kept)', () => {
    const rich = (s: GameState): GameState => ({
      ...s,
      lifetime: { ...s.lifetime, gold: bn(1_000_000) },
    });
    const kept = commitKatabasis(rich(withSemet({ 20: SOULS }))).recap.goldKept.toNumber();
    // Base 5% + Purson's percentage points, lifted by Semet (sigilKatabasisBonus ÷ 100).
    expect(kept).toBe(Math.floor(1_000_000 * (0.05 + (str(20) * (1 + semet)) / 100)));
  });

  it('scales the duplicate-output chance (Malphas #39) and the double find (Crocell #49)', () => {
    // At 1e6 souls a pct seal reads ~0.382; Semet lifts it to ~0.435. A roll pinned between them
    // misses the bare chance and hits the lifted one.
    const roll = (str(39) + str(39) * (1 + semet)) / 2;
    const opts = { forcedTier: 'good' as const, efficiency: 1 };
    const bare = withSeals(fresh(), { 39: SOULS });
    const lifted = withSemet({ 39: SOULS });
    expect(
      totalReprobates(resolveAction(bare, 'suggestion', pinnedRng(roll), opts).state) -
        totalReprobates(bare),
    ).toBe(1);
    expect(
      totalReprobates(resolveAction(lifted, 'suggestion', pinnedRng(roll), opts).state) -
        totalReprobates(lifted),
    ).toBe(2);
    const find = (s: GameState): number =>
      resolveIndagatio(s, 'stellar', pinnedRng(roll)).surfaced.length;
    expect(find(withSeals(fresh(), { 49: SOULS }))).toBe(1);
    expect(find(withSemet({ 49: SOULS }))).toBe(2);
  });

  it('scales the Thesaurus recovery seals (Vine #45)', () => {
    expect(computeModifiers(withSemet({ 45: SOULS })).thesaurusRecoveryMul).toBeCloseTo(
      1 + str(45) * (1 + semet),
      9,
    );
  });

  it('scales Gaap #33 too (Semet reaches the maleficia-effect seal)', () => {
    const gaap = str(GAAP);
    expect(sigilEffectStack(withSeals(fresh(), { [GAAP]: SOULS })).maleficiaBoost).toBeCloseTo(
      1 + gaap,
      9,
    );
    expect(sigilEffectStack(withSemet({ [GAAP]: SOULS })).maleficiaBoost).toBeCloseTo(
      1 + gaap * (1 + semet),
      9,
    );
  });
});

describe('Gaap #33 boosts every maleficium (ADR-036)', () => {
  const g = str(GAAP);
  const mb = 1 + g;
  const gaap = (s: GameState): GameState => withSeals(s, { [GAAP]: SOULS });
  /** Everything a maleficium can move: the modifier bundle, the cost cut, the sigil multiplier. */
  const snapshot = (s: GameState): string =>
    JSON.stringify([computeModifiers(s), invocationCostMul(s), sigilStrengthMul(s)]);
  /** Own one copy of `id`, activated if it is a single-use consumable. */
  const holding = (id: string): GameState => {
    const s = own(fresh(), id);
    if (!MALEFICIA_BUFFS[id]) return s;
    const r = activateMaleficium(s, id);
    if (!r.ok) throw new Error(r.reason);
    return r.state;
  };

  it('does nothing on its own (no maleficium held)', () => {
    expect(snapshot(gaap(fresh()))).toBe(snapshot(fresh()));
  });

  it('changes the effect of every one of the 34 maleficia', () => {
    const untouched = Object.keys(MALEFICIA).filter(
      (id) => snapshot(gaap(holding(id))) === snapshot(holding(id)),
    );
    expect(untouched).toEqual([]);
  });

  it('grows increases linearly: Achan +200% gold, Black Robe +0.4 influence/s, Black Candles', () => {
    expect(computeModifiers(gaap(own(fresh(), 'achans_wedge'))).goldRateMul).toBeCloseTo(
      1 + 2 * mb,
      9,
    );
    expect(computeModifiers(gaap(own(fresh(), 'black_robe'))).flatInfluencePerSecond).toBeCloseTo(
      0.4 * mb,
      9,
    );
    const candles = own(fresh(), 'black_candles', 'black_candles');
    expect(computeModifiers(gaap(candles)).invocationEfficiencyMul).toBeCloseTo(
      1 + 0.03 * 2 * mb,
      9,
    );
  });

  it('deepens cuts asymptotically: Pilate −50% drain, Crow Feather −10% Indagatio time', () => {
    expect(computeModifiers(gaap(own(fresh(), 'pilates_basin'))).desidiaDrainMul).toBeCloseTo(
      1 / (1 + 1 * mb),
      9,
    );
    // −10% time is the efficiency lift ×1/0.9, i.e. +1/9; Gaap scales that lift.
    expect(computeModifiers(gaap(own(fresh(), 'crow_feather'))).indagatioEfficiencyMul).toBeCloseTo(
      1 + mb / 9,
      9,
    );
    // A huge Gaap never drives a cut past zero.
    const huge = withSeals(own(fresh(), 'pilates_basin'), { [GAAP]: 1e300 });
    expect(computeModifiers(huge).desidiaDrainMul).toBeGreaterThan(0);
  });

  it('boosts the single-use buffs (Hand of Glory +33% generation)', () => {
    const s = gaap(holding('hand_of_glory'));
    expect(maleficiaBuffMultipliers(s, mb).reprobateGenerationRateMul).toBeCloseTo(
      1 + 0.33 * mb,
      9,
    );
    expect(computeModifiers(s).reprobateGenerationRateMul).toBeCloseTo(1 + 0.33 * mb, 9);
  });

  it("boosts the sigil-effect relics (Solomon's Ring +66%) and Black Vessel's cost cut", () => {
    // Gaap's own strength is read against the RAW relic stack (×1.66), so it cannot feed itself.
    const ringG = str(GAAP) * 1.66;
    expect(sigilStrengthMul(gaap(own(fresh(), 'solomons_ring')))).toBeCloseTo(
      1 + 0.66 * (1 + ringG),
      9,
    );
    const k = BLACK_VESSEL_INVOCATION_COST_REDUCTION / (1 - BLACK_VESSEL_INVOCATION_COST_REDUCTION);
    expect(invocationCostMul(gaap(own(fresh(), 'black_vessel')))).toBeCloseTo(1 / (1 + k * mb), 9);
  });
});

describe('Every invocation cost is cut by 1/(1 + x) (ADR-035/036)', () => {
  // Lemure's upkeep is 25% of influence generation per second: the example cost.
  const lemure = summon(fresh(), { lemure: 1 });
  const lemureCost = (s: GameState): number => invocationUpkeep(s).influenceGainFraction;

  it.each([
    [55, 'Orobas'],
    [16, 'Zepar'],
    [65, 'Andrealphus'],
  ])('seal #%i (%s) divides the 25%%-of-influence-gain upkeep by (1 + strength)', (id) => {
    expect(lemureCost(withSeals(lemure, { [id]: SOULS }))).toBeCloseTo(0.25 / (1 + str(id)), 9);
  });

  it('Black Vessel cuts it in the same 1/(1 + x) form, exactly −7% at base', () => {
    expect(lemureCost(own(lemure, 'black_vessel'))).toBeCloseTo(0.25 * 0.93, 9);
  });

  it('the cuts compose multiplicatively (a seal and Black Vessel together)', () => {
    const both = own(withSeals(lemure, { 55: SOULS }), 'black_vessel');
    expect(lemureCost(both)).toBeCloseTo((0.25 * 0.93) / (1 + str(55)), 9);
  });

  it('covers every upkeep shape: flat gold, %-of-gold-gain, %-of-pool and desidia drains', () => {
    const s = summon(fresh(), { imp: 1, fama: 1, morpheus: 1, upir: 1 });
    const cut = withSeals(s, { 55: SOULS });
    const d = 1 + str(55);
    expect(invocationUpkeep(cut).flatGoldPerSecond).toBeCloseTo(10 / d, 9);
    expect(invocationUpkeep(cut).goldGainFraction).toBeCloseTo((0.01 + 0.25) / d, 9);
    expect(invocationUpkeep(cut).reprobateFraction).toBeCloseTo(0.05 / d, 9);
    expect(invocationUpkeep(cut).flatDesidiaPerSecond).toBeCloseTo(0.2 / d, 9);
  });

  it("cuts Aurevora's exponential gold drain too, in the readout and in the tick", () => {
    const aurevora = (s: GameState): GameState => ({
      ...summon(s, { aurevora: 1 }),
      lifetime: { ...summon(s, { aurevora: 1 }).lifetime, gold: bn(1e9) },
    });
    const plain = aurevora(fresh());
    const cut = aurevora(withSeals(fresh(), { 55: SOULS }));
    expect(aurevoraDrainNow(plain)).toBeCloseTo(AUREVORA_BASE_GOLD_DRAIN_PER_SECOND, 9);
    expect(aurevoraDrainNow(cut)).toBeCloseTo(
      AUREVORA_BASE_GOLD_DRAIN_PER_SECOND / (1 + str(55)),
      9,
    );
    const spent = (s: GameState): number =>
      s.lifetime.gold.toNumber() - tick(s, 1).state.lifetime.gold.toNumber();
    expect(spent(cut)).toBeLessThan(spent(plain));
  });
});
