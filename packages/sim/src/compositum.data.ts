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
  // "flipped on for a glorious, expensive minute or two." R(t) = R₀·growthᵗ drives the soul harvest
  // (∝ current souls, in the tick) and a flat generation increase (in dynamics); suicide/murder
  // are amplified via the modifier bundle (see modifiers.ts).
  //
  // RETUNE (playability): the sheet's `× eᵗ` ramp (growth = e ≈ 2.718/s) doubled-and-more every
  // second — the cost was unpayable within ~3 s, so the ritual could never actually run, and the
  // paired influence upkeep against a low, capped pool guaranteed it self-extinguished before its
  // own 60 s achievement was reachable. Two changes make it a burn a gate-level player can sustain
  // for at least five minutes "without specific investment," while the exponential still terminates
  // it: (1) the ramp is softened to `1.01ᵗ` (≈20× over 5 min, ≈400× over 10 min), and (2) the upkeep
  // is now GOLD ONLY. A growing influence drain cannot coexist with a multi-minute runtime because
  // influence is hard-capped and refills slowly — a few /s of ramping influence exhausts any cap in
  // seconds — so influence is dropped and the uncapped gold hoard becomes the sole ramping sink and
  // terminator (cumulative gold to run 5 min ≈ 190k, 7 min ≈ 650k, 10 min ≈ 3.9M).
  panvitium: {
    id: 'panvitium',
    sins: ['gula', 'luxuria', 'avaritia', 'tristitia', 'ira', 'acedia', 'vanagloria', 'superbia'],
    minLevel: 3,
    // Gold-only upkeep, ramping at 1.01ᵗ (t = seconds active); influence upkeep retired (see above).
    costPerSecond: { gold: 100 },
    panvitiumRateBase: PANVITIUM_RATE_BASE,
    manualDeactivateForbidden: true,
    costGrowthPerSecond: 1.01,
  },
} as const;
