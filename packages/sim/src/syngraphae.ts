/**
 * Syngraphae (Depraedatio gold rework spec §4.3) — the compact Avaritia-gated contract tree:
 * twelve nodes in three linear branches (Usura the yield, Faeneratio the loan book, Custodia the
 * retention), bought with BURNED gold (the signing fee — paid, never hoarded, never refunded) and
 * reset each lifetime (the terms lapse at the descent).
 *
 * State is `lifetime.syngraphae` (purchased node ids; additive-optional on the wire, absent means
 * none). Requirements to sign: the node's Avaritia level gate, the PREVIOUS node in its branch
 * (branches are linear chains), and affordability. The catalog lives in `syngraphae.data.ts`
 * (editable economy knobs); the effect folds live in `computeModifiers` (ADR-022) except the four
 * mechanism nodes wired at their own sites: Anatocismus (tick.ts interest split), Escheat
 * (dynamics mint via the bundle's flat fields), the faeneratio-4 liquidation bonus and the
 * custodia-4 Peculium floor (katabasis.ts).
 */
import { floor, gte, sub } from './bignum.js';
import { sinLevel } from './progression.js';
import { type GameState } from './state.js';
import { SYNGRAPHAE } from './syngraphae.data.js';
export { SYNGRAPHAE };

export type SyngraphaBranch = 'usura' | 'faeneratio' | 'custodia';

/** A node's effect: a modifier fold (ADR-022) or one of the four bespoke mechanisms. */
export type SyngraphaEffect =
  | { readonly kind: 'fenusRateMul'; readonly mul: number }
  | { readonly kind: 'mutuumPerCapitaMul'; readonly mul: number }
  | { readonly kind: 'thesaurusRecoveryMul'; readonly mul: number }
  | { readonly kind: 'anatocismus' }
  | {
      readonly kind: 'escheat';
      readonly goldPerMurder: number;
      readonly goldPerSuicide: number;
    }
  | { readonly kind: 'liquidationMul'; readonly mul: number }
  | {
      readonly kind: 'hoardMilestones';
      readonly threshold: number;
      readonly bonusPerDecade: number;
      readonly cap: number;
    }
  | { readonly kind: 'peculium'; readonly floorFraction: number };

export interface SyngraphaDef {
  readonly id: string;
  /** Named contracts (Anatocismus, Escheat, Peculium) carry their title; the rest go by number. */
  readonly name?: string;
  readonly branch: SyngraphaBranch;
  /** Minimum Avaritia level to sign. */
  readonly gate: number;
  /** The signing fee in gold — burned, never hoarded, never refunded. */
  readonly cost: number;
  readonly effect: SyngraphaEffect;
}

export const SYNGRAPHA_BRANCHES: readonly SyngraphaBranch[] = ['usura', 'faeneratio', 'custodia'];

/** Lookup; undefined for unknown ids. */
export function syngraphaById(id: string): SyngraphaDef | undefined {
  return SYNGRAPHAE.find((n) => n.id === id);
}

/** The nodes of one branch in signing order (the catalog is authored in chain order). */
export function syngraphaBranch(branch: SyngraphaBranch): readonly SyngraphaDef[] {
  return SYNGRAPHAE.filter((n) => n.branch === branch);
}

/** True once the node's contract is signed this lifetime. */
export function syngraphaSigned(state: GameState, id: string): boolean {
  return state.lifetime.syngraphae.includes(id);
}

/**
 * The Anatocismus split (usura-4): the fraction of each interest payment that auto-deposits into
 * the hoard instead of paying out (spec §12: 0.5).
 */
export const ANATOCISMUS_SPLIT = 0.5;

/** The faeneratio-4 Katabasis liquidation bonus (×1.25 when signed, ×1 otherwise). */
export function katabasisLiquidationMul(state: GameState): number {
  for (const node of SYNGRAPHAE) {
    if (node.effect.kind === 'liquidationMul' && syngraphaSigned(state, node.id)) {
      return node.effect.mul;
    }
  }
  return 1;
}

/**
 * The custodia-4 Peculium floor fraction (0.1 when signed, 0 otherwise): the kept-gold result at
 * commit is floored at this fraction of the hoard's value at descent.
 */
export function peculiumFloorFraction(state: GameState): number {
  for (const node of SYNGRAPHAE) {
    if (node.effect.kind === 'peculium' && syngraphaSigned(state, node.id)) {
      return node.effect.floorFraction;
    }
  }
  return 0;
}

/**
 * The custodia-2 hoard-milestone bonus on `goldRateMul`: +bonusPerDecade per decade of hoard at or
 * above the threshold (`floor(log10(hoard/threshold)) + 1` steps), capped. 0 when unsigned or the
 * hoard sits below the threshold. Read by `computeModifiers` and folded into `goldRateMul`
 * directly — a derived multiplier like any other; never persisted.
 */
export function hoardMilestoneBonus(state: GameState): number {
  for (const node of SYNGRAPHAE) {
    if (node.effect.kind !== 'hoardMilestones' || !syngraphaSigned(state, node.id)) continue;
    const { threshold, bonusPerDecade, cap } = node.effect;
    const hoard = state.lifetime.hoard;
    if (!gte(hoard, threshold)) return 0;
    // Same log-difference decade count as the Foedus tier (exact at the boundaries).
    const steps = Math.floor(hoard.log10() - Math.log10(threshold) + 1e-9) + 1;
    return Math.min(cap, bonusPerDecade * steps);
  }
  return 0;
}

export type SignResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Requirements to sign `def` now (spec §4.3): the Avaritia gate, the previous node in its branch
 * (linear chains), and the node not already signed. Affordability is checked at `signSyngrapha`
 * (the UI reads this for the gated/available split and affordability separately).
 */
export function syngraphaSignable(
  state: GameState,
  def: SyngraphaDef,
): { readonly signable: boolean; readonly reason?: string } {
  if (syngraphaSigned(state, def.id)) return { signable: false, reason: 'already signed' };
  if (sinLevel(state.devotion.avaritia) < def.gate) {
    return { signable: false, reason: `requires avaritia level ${def.gate}` };
  }
  const chain = syngraphaBranch(def.branch);
  const idx = chain.findIndex((n) => n.id === def.id);
  const prev = idx > 0 ? chain[idx - 1] : undefined;
  if (prev && !syngraphaSigned(state, prev.id)) {
    return { signable: false, reason: `requires ${prev.name ?? prev.id} first` };
  }
  return { signable: true };
}

/**
 * Sign a Syngrapha: burn the gold cost (paid, never hoarded, never refunded — the fee is the
 * signing fee) and record the node id on the lifetime. Floors gold at the spend boundary
 * (ADR-005). Refused under the Morpheus freeze, like every other initiation of work (03 §2.4).
 */
export function signSyngrapha(state: GameState, id: string): SignResult {
  if ((state.lifetime.invocations.morpheus ?? 0) > 0) {
    return { ok: false, reason: 'The world is held in Morpheus’s stillness.' };
  }
  const def = syngraphaById(id);
  if (!def) return { ok: false, reason: 'no such contract' };
  const gate = syngraphaSignable(state, def);
  if (!gate.signable) return { ok: false, reason: gate.reason ?? 'cannot sign' };
  if (!gte(floor(state.lifetime.gold), def.cost)) return { ok: false, reason: 'not enough gold' };
  return {
    ok: true,
    state: {
      ...state,
      lifetime: {
        ...state.lifetime,
        gold: sub(state.lifetime.gold, def.cost),
        syngraphae: [...state.lifetime.syngraphae, id],
      },
    },
  };
}
