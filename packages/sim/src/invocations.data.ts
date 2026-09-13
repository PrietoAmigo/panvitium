/**
 * Invocation TUNING DATA (03 §2.4) — the invocation catalog (`INVOCATIONS`): soul/gold costs, caps,
 * gates, per-second upkeep, and the hook each entry's effect reads. Separated from the logic in
 * `invocations.ts` so the economy knobs live in one editable place. Pure data; types and behaviour
 * stay in `invocations.ts`, and the effect MAGNITUDES live in `modifiers.ts` / `apex.ts`.
 *
 * Costs are per COPY and per second (paid out of income while active, tick.ts step 1a); a flat drain
 * the pool can't cover dispels the invocation. `%`-of-gain / `%`-of-pool costs are additive across
 * copies (four copies at 25% of gold gain zero the gold gain). Effects marked "scaled by efficiency"
 * scale by the all-invocation and per-Sin invocation-effect multipliers (NOT player efficiency).
 *
 * Entries are ordered by Sin level, then required invoking power — the same clustering the Ars Goetia
 * index shows.
 */
import { type InvocationDef } from './invocations.js';

/** The invocation catalog (03 §2.4). Keyed by id. */
export const INVOCATIONS: Readonly<Record<string, InvocationDef>> = {
  // ── The Familiar — the lone unaligned base creature ────────────────────────────────────────
  familiar: {
    id: 'familiar',
    sin: null,
    invokingPower: 1,
    maxActive: 1,
    // Free. Effect (modifiers.ts): a flat +33% player efficiency.
  },

  // ── Sin level 1 ─────────────────────────────────────────────────────────────────────────────
  wendigo: {
    id: 'wendigo',
    sin: 'gula',
    invokingPower: 2,
    sinLevel: 1,
    maxActive: 10,
    upkeep: { influence: 1 }, // 1 influence/s
    // Effect (modifiers.ts): +2% player efficiency per copy (flat, not efficiency-scaled).
  },
  blob: {
    id: 'blob',
    sin: 'acedia',
    invokingPower: 2,
    sinLevel: 1,
    maxActive: 5,
    upkeep: { influence: 2 }, // 2 influence/s
    // Effect (modifiers.ts → flatDesidiaPerSecond, applied in tick): +0.00625 desidia/s per
    // copy, scaled by invocation efficiency.
  },
  empusa: {
    id: 'empusa',
    sin: 'luxuria',
    invokingPower: 2,
    sinLevel: 1,
    maxActive: 10,
    upkeep: { influence: 2 }, // 2 influence/s
    // Effect (modifiers.ts → flatGenerationPerSecond): +1 reprobate/s per copy, scaled by
    // invocation efficiency.
  },
  kobold: {
    id: 'kobold',
    sin: 'avaritia',
    invokingPower: 2,
    sinLevel: 1,
    maxActive: 20,
    upkeep: { influence: 1 }, // 1 influence/s
    // Effect (modifiers.ts → flatGoldPerSecond): +100 gold gain/s per copy, scaled by invocation
    // efficiency.
  },
  imp: {
    id: 'imp',
    sin: 'ira',
    invokingPower: 3,
    sinLevel: 1,
    maxActive: 20,
    upkeep: { gold: 10, goldGainFraction: 0.01 }, // 10 gold/s + 1% of gold gain/s
    // Effect (modifiers.ts → flatMurdersPerSecond): +1 murder/s per copy, scaled by invocation
    // efficiency. Each murder mints a soul (a death, unlike the reprobate-cost drains).
  },
  banshee: {
    id: 'banshee',
    sin: 'tristitia',
    invokingPower: 3,
    sinLevel: 1,
    maxActive: 20,
    upkeep: { influence: 1 }, // 1 influence/s
    // Effect (modifiers.ts → flatSuicidesPerSecond): +1 suicide/s per copy, scaled by invocation
    // efficiency. Each suicide mints a soul.
  },
  narcissus: {
    id: 'narcissus',
    sin: 'superbia',
    invokingPower: 3,
    sinLevel: 1,
    maxActive: 10,
    upkeep: { influence: 0.3 }, // 0.3 influence/s
    // Effect (modifiers.ts → tierWeightMul): +1% to every positive outcome weight (Stellar /
    // Excellent / Good) per copy. Flat, not efficiency-scaled.
  },
  arachne: {
    id: 'arachne',
    sin: 'vanagloria',
    invokingPower: 3,
    sinLevel: 1,
    maxActive: 10,
    upkeep: { reprobate: 50 }, // 50 reprobates/s (a pure cost — no souls minted)
    // Effect (modifiers.ts → flatInfluencePerSecond): +1 influence/s per copy, scaled by invocation
    // efficiency.
  },

  // ── Sin level 2 ─────────────────────────────────────────────────────────────────────────────
  upir: {
    id: 'upir',
    sin: 'gula',
    invokingPower: 4,
    sinLevel: 2,
    upkeep: { desidia: 0.2 }, // 0.2 desidia/s drained from the top-level pool
    // Stackable. Effect (modifiers.ts → tierWeightMul): −1% to every negative outcome weight (Bad /
    // Terrible / Apocalyptic) per copy, scaled by invocation efficiency (asymptotic, never negative).
  },
  lamia: {
    id: 'lamia',
    sin: 'luxuria',
    invokingPower: 4,
    sinLevel: 2,
    upkeep: { influence: 5 }, // 5 influence/s
    // Stackable. Effect (modifiers.ts → flatGenerationPerSecond): +50 reprobates/s per copy, scaled
    // by invocation efficiency.
  },
  behemoth: {
    id: 'behemoth',
    sin: 'superbia',
    invokingPower: 4,
    sinLevel: 2,
    maxActive: 10,
    upkeep: { goldGainFraction: 0.00625, influenceGainFraction: 0.00625 }, // 0.625% gold + 0.625% influence gain/s
    // Effect (modifiers.ts → flatStellarChance): +0.025% flat Stellar chance per copy, scaled by
    // invocation efficiency (an absolute bump applied post-normalization at resolution time).
  },
  harpy: {
    id: 'harpy',
    sin: 'ira',
    invokingPower: 5,
    sinLevel: 2,
    upkeep: { influence: 3 }, // 3 influence/s
    // Stackable. Effect (modifiers.ts → flatBaseMurderRatePerSecond): +0.005/s to the per-capita base
    // murder rate per copy, scaled by invocation efficiency.
  },
  plutus: {
    id: 'plutus',
    sin: 'avaritia',
    invokingPower: 5,
    sinLevel: 2,
    upkeep: { influence: 3 }, // 3 influence/s
    // Stackable. Effect (modifiers.ts → faenerationOutputMul): +15% Faeneratio output per copy, scaled
    // by invocation efficiency.
  },
  nightmare: {
    id: 'nightmare',
    sin: 'tristitia',
    invokingPower: 5,
    sinLevel: 2,
    upkeep: { influence: 3 }, // 3 influence/s
    // Stackable. Effect (modifiers.ts → flatBaseSuicideRatePerSecond): +0.005/s to the per-capita base
    // suicide rate per copy, scaled by invocation efficiency.
  },
  fama: {
    id: 'fama',
    sin: 'vanagloria',
    invokingPower: 5,
    sinLevel: 2,
    maxActive: 4,
    upkeep: { goldGainFraction: 0.25 }, // 25% of gold gain/s
    // Effect (modifiers.ts → influenceRateMul): +7.5% influence gain per copy, scaled by invocation
    // efficiency.
  },
  lemure: {
    id: 'lemure',
    sin: 'acedia',
    invokingPower: 6,
    sinLevel: 2,
    maxActive: 4,
    upkeep: { influenceGainFraction: 0.25 }, // 25% of influence gain/s per copy
    // Effect (modifiers.ts → desidiaDrainMul): reduces the Desidia drain by 6.25% (×0.9375)
    // per copy, scaled by invocation efficiency. At the 4-copy cap the upkeep consumes all influence gain.
  },

  // ── Sin level 3 — Apex (one kind per lifetime, all cap at 1) ─────────────────────────────────
  midas: {
    id: 'midas',
    sin: 'avaritia',
    invokingPower: 7,
    sinLevel: 3,
    maxActive: 1,
    // Free. Effect (modifiers.ts): ×10 gold gain, but ×10 the Apocalyptic chance.
  },
  aurevora: {
    id: 'aurevora',
    sin: 'gula',
    invokingPower: 7,
    sinLevel: 3,
    maxActive: 1,
    // Free of upkeep. Effect (apex.ts): an exponentially-rising gold drain paid against a
    // similarly-rising player-efficiency boost (duration tracked in invocationDurations); when the
    // drain takes gold to 0 it dispels. The efficiency half is folded in by modifiers.ts.
  },
  doppelgaenger: {
    id: 'doppelgaenger',
    sin: 'superbia',
    invokingPower: 8,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { influenceGainFraction: 0.5 }, // 50% of influence gain/s
    // Effect (modifiers.ts): +100% player efficiency (×2).
  },
  succubus: {
    id: 'succubus',
    sin: 'luxuria',
    invokingPower: 9,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { goldGainFraction: 0.99 }, // 99% of gold gain/s
    // Effect (modifiers.ts → flatGenerationPerSecond): +10000 reprobates/s, scaled by invocation efficiency.
  },
  specunitas: {
    id: 'specunitas',
    sin: 'vanagloria',
    invokingPower: 9,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { goldGainFraction: 0.99 }, // 99% of gold gain/s
    // Effect (modifiers.ts): ×3 influence gain.
  },
  astiwihad: {
    id: 'astiwihad',
    sin: 'tristitia',
    invokingPower: 10,
    sinLevel: 3,
    maxActive: 1,
    // Free. Effect (tick.ts freeze + invoke/commit): holds the world still while active (no income,
    // no dynamics, no Opera, no gains); at Katabasis it carries 100% of gold + maleficia and preserves
    // the Emptio list (`pendingAstiwihad`).
  },
  erinyes: {
    id: 'erinyes',
    sin: 'ira',
    invokingPower: 10,
    sinLevel: 3,
    maxActive: 1,
    // Free. Effect on invoke (see `invoke`): kills the entire reprobate population (every death mints
    // a soul) and sets `pendingErinyes` for `commitKatabasis` (zero gold + maleficia carry-over, and
    // stack a permanent ×2 player-efficiency multiplier).
  },
  morpheus: {
    id: 'morpheus',
    sin: 'acedia',
    invokingPower: 10,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { reprobateFraction: 0.05 }, // 5% of the reprobate pool/s (a pure cost — no souls minted)
    // Effect (modifiers.ts → flatDesidiaPerSecond, applied in tick): +0.001 desidia per
    // cost-consumed reprobate (i.e. 0.05 × population × 0.001/s), scaled by invocation efficiency.
  },
} as const;
