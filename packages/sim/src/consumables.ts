/**
 * Single-use maleficia activation (03 §4): the consumables (Hand of Glory, Black Salt Pouch,
 * Defixio, Crossroads Dirt) and how long each activation lasts.
 *
 * Kept apart from `maleficia.ts` because the duration reads a seal: Marax #21 lengthens every
 * activation by `(1 + strength)` (ADR-043), and `sigils.ts` already imports `maleficia.ts` (the
 * sigil-effect relics, Black Vessel), so reading the seal there would close a cycle. The buff
 * catalog, its timers' decay (`tick.ts`) and their fold into the modifier bundle
 * (`maleficiaBuffMultipliers`) stay where they were. Pure; no RNG.
 */
import { MALEFICIA, MALEFICIA_BUFFS, MALEFICIA_BUFF_DURATION_SECONDS } from './maleficia.js';
import { sigilMaleficiaDurationMul, sigilStrengthMul } from './sigils.js';
import { type GameState } from './state.js';

/**
 * How long one activation of a single-use maleficium lasts right now, in seconds: the sheet's hour
 * × Marax #21's `1 + strength` (scaled by the shared sigil-strength multiplier, ADR-036). Exactly
 * `MALEFICIA_BUFF_DURATION_SECONDS` when Marax is unbound. The buffs HUD reads it as a ring's length.
 */
export function maleficiaBuffDuration(state: GameState): number {
  return (
    MALEFICIA_BUFF_DURATION_SECONDS * sigilMaleficiaDurationMul(state, sigilStrengthMul(state))
  );
}

export type ActivateResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/**
 * Activate a single-use maleficium from the owned inventory. Consumes one copy and (re)fills that
 * id's timer in `lifetime.maleficiaBuffs` by one activation's length (`maleficiaBuffDuration`); a
 * repeat activation extends the timer while the buff's magnitude stays fixed (the Hand of Glory
 * convention). Non-consumable items can't be used this way.
 */
export function activateMaleficium(state: GameState, id: string): ActivateResult {
  if (!MALEFICIA_BUFFS[id]) return { ok: false, reason: 'This maleficium cannot be used.' };
  const idx = state.lifetime.maleficia.indexOf(id);
  if (idx === -1) {
    const def = MALEFICIA[id];
    return { ok: false, reason: `You hold no ${def ? def.name : 'such maleficium'}.` };
  }
  const maleficia = [
    ...state.lifetime.maleficia.slice(0, idx),
    ...state.lifetime.maleficia.slice(idx + 1),
  ];
  const remaining = (state.lifetime.maleficiaBuffs[id] ?? 0) + maleficiaBuffDuration(state);
  return {
    ok: true,
    state: {
      ...state,
      lifetime: {
        ...state.lifetime,
        maleficia,
        maleficiaBuffs: { ...state.lifetime.maleficiaBuffs, [id]: remaining },
      },
    },
  };
}
