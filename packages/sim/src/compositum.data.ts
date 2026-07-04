/**
 * Vitium Compositum TUNING DATA (03 §2.3) — the ceremony catalog (`COMPOSITA`). The roster is now
 * PANVITIUM ALONE: the eight lesser ceremonies (Bacchanal, Charity, Gala, Doom Gathering,
 * Enraging Broadcast, Dolce Far Niente, Vegas, Crusade) were retired wholesale (ADR-031) —
 * `advanceToggles` drops their ids from old saves gracefully (the unknown-id path). Separated
 * from the toggle engine in `compositum.ts` so the economy knobs live in one editable place.
 */
import { PANVITIUM_RATE_BASE } from './constants.js';
import { type CompositumDef } from './compositum.js';

/** The ceremony catalog (03 §2.3) — Panvitium alone. Keyed by id. */
export const COMPOSITA: Readonly<Record<string, CompositumDef>> = {
  // The endgame ritual (03 §2.3). Gated on ALL eight Sins at level 3. Cannot be turned off by
  // hand; its cost ramps exponentially with active duration so it can't become a steady state —
  // "flipped on for a glorious, expensive minute or two." R(t) = 0.01·eᵗ drives the soul harvest
  // (∝ current souls, in the tick) and a flat generation increase (in dynamics); suicide/murder
  // are amplified via the modifier bundle (see modifiers.ts).
  panvitium: {
    id: 'panvitium',
    sins: ['gula', 'luxuria', 'avaritia', 'tristitia', 'ira', 'acedia', 'vanagloria', 'superbia'],
    minLevel: 3,
    // Sheet: gold 10×(Base VC gold cost 100)=1000, influence 10×(Base VC influence cost 10)=100,
    // each × eᵗ; rate base 1×(Base VC rate 0.01)=0.01 × eᵗ. t = seconds active.
    costPerSecond: { gold: 1000, influence: 100 },
    panvitiumRateBase: PANVITIUM_RATE_BASE,
    manualDeactivateForbidden: true,
    costGrowthPerSecond: Math.E,
  },
} as const;
