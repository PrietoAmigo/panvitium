/**
 * Invocation TUNING DATA (03 §2.4) — the invocation catalog (`INVOCATIONS`): soul/gold costs, caps,
 * gates, upkeep, autonomous-runner actions, and per-invocation effects. Separated from the logic in
 * `invocations.ts` so the economy knobs live in one editable place. Pure data; types and behaviour
 * stay in `invocations.ts`.
 */
import { type InvocationDef } from './invocations.js';

/** The wired subset of the invocation catalog (03 §2.4). Keyed by id. */
export const INVOCATIONS: Readonly<Record<string, InvocationDef>> = {
  familiar: {
    id: 'familiar',
    sin: null,
    invokingPower: 2,
    maxActive: 1,
    // The lone "Special" invocation: only one Familiar may be bound (unlike the stackable Normals).
    // Hybrid (02 §3): a flat +33% to player efficiency (applied in modifiers.ts alongside the other
    // invocation magnitudes) AND a background Indagatio runner at 1% of the player's efficiency
    // (Invocatio sheet efficiency column).
    autonomous: { action: 'indagatio', efficiency: 0.01 },
  },
  imp: {
    id: 'imp',
    sin: 'ira',
    invokingPower: 2,
    sinLevel: 1,
    upkeep: { gold: 10 }, // 10 gold/s (Invocatio sheet)
    // Stackable (Normal type). Background Decimatio (cost-outcome): each cycle pays
    // ceil(caedesCost × 0.05×playerEff) and resolves a Good kill. Good-only so a passive entity can
    // never roll Apocalyptic and gut the player's gold/reprobates unprompted (03 §2.4). Each summoned
    // copy runs its own channel (advanceInvocationRunners), so N imps cull at ~N× the rate.
    autonomous: { action: 'caedes', efficiency: 0.05, forcedTier: 'good' },
  },
  upir: {
    id: 'upir',
    sin: 'gula',
    invokingPower: 3,
    sinLevel: 1,
    upkeep: { influence: 1 }, // 1 influence/s (Invocatio sheet)
    // Stackable (Normal type). Gula's background culler. The spreadsheet frames Upir as a Caedes
    // runner at 0.05 (the doc's "kills 1 / 30 s" was the older mechanic); per the
    // spreadsheet-wins-on-numbers rule we model it as the engine's cost-outcome runner, Good-only
    // like the Imp. Each summoned copy runs its own channel, so stacking multiplies throughput.
    autonomous: { action: 'caedes', efficiency: 0.05, forcedTier: 'good' },
  },
  fama: {
    id: 'fama',
    sin: 'vanagloria',
    invokingPower: 3,
    sinLevel: 1,
    upkeep: { goldGainFraction: 0.25 }, // 25% of current gold gain/s (Invocatio sheet)
  },
  nightmare: {
    id: 'nightmare',
    sin: 'tristitia',
    invokingPower: 3,
    sinLevel: 1,
    upkeep: { influence: 3 }, // 3 influence/s (Invocatio sheet)
  },
  harpy: {
    id: 'harpy',
    sin: 'ira',
    invokingPower: 4,
    sinLevel: 2,
    upkeep: { influence: 5 }, // 5 influence/s (Invocatio sheet)
    // Stackable (Normal type). A background Pogrom runner (Invocatio sheet #8: "action efficiency
    // applies to Pogrom") — replacing its old blanket Decimatio-efficiency boost. Forced to Good
    // like the other stackable Decimatio runners (Imp/Upir, 03 §2.4), so a passive channel can't roll
    // Pogrom's catastrophic tails; it steadily culls + harvests souls per cycle instead.
    autonomous: { action: 'pogrom', efficiency: 0.05, forcedTier: 'good' },
  },
  lamia: {
    id: 'lamia',
    sin: 'luxuria',
    invokingPower: 4,
    sinLevel: 2,
    upkeep: { influence: 3 }, // 3 influence/s (Invocatio sheet)
    // Stackable (Normal type). A background Logismoi runner at `efficiency × the player's efficiency`
    // (Invocatio sheet #8: "action efficiency applies to Logismoi"), without occupying the player's
    // action slot. Logismoi is the L2 Suasio action; natural tier rolls. Each summoned copy runs its
    // own channel (advanceInvocationRunners), so N lamiae work at ~N× the rate.
    autonomous: { action: 'logismoi', efficiency: 0.05 },
  },
  lemure: {
    id: 'lemure',
    sin: 'acedia',
    invokingPower: 3,
    sinLevel: 1,
    upkeep: { maxInfluenceFraction: 0.01 }, // 1% of max influence/s (Invocatio sheet)
    // Stackable. Effect (modifiers.ts): an additive boost to the offline gain rate (Invocatio sheet),
    // 0.025 × player/invocation efficiency per copy.
  },
  behemoth: {
    id: 'behemoth',
    sin: 'superbia',
    invokingPower: 2,
    sinLevel: 1,
    upkeep: { goldGainFraction: 0.05, influenceGainFraction: 0.05 }, // 5% gold+infl gain/s (sheet)
  },
  midas: {
    id: 'midas',
    sin: 'avaritia',
    invokingPower: 7,
    sinLevel: 3,
    maxActive: 1,
  },
  plutus: {
    id: 'plutus',
    sin: 'avaritia',
    invokingPower: 5,
    sinLevel: 2,
    upkeep: { influence: 3 }, // 3 influence/s (Invocatio sheet)
    // Stackable. Effect (modifiers.ts): lifts Vitium Mercatura output (gold + generation +
    // conversion) by a flat factor per copy. A passive modifier source, no autonomous channel.
  },
  succubus: {
    id: 'succubus',
    sin: 'luxuria',
    invokingPower: 9,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { goldGainFraction: 0.99 }, // 99% of current gold gain/s (Invocatio sheet)
    // Apex Luxuria. Effect (Invocatio sheet #8): an autonomous Imperium runner at 0.99 × player
    // efficiency — the apex "player in control" rite cast on its own, full distribution (it can roll
    // Stellar's soul payout AND Apocalyptic's cull). It keeps the 99%-gold-gain upkeep as its cost.
    autonomous: { action: 'imperium', efficiency: 0.99 },
  },
  doppelgaenger: {
    id: 'doppelgaenger',
    sin: 'superbia',
    invokingPower: 8,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { influenceGainFraction: 0.5 }, // 50% of current influence gain/s (Invocatio sheet)
  },
  astiwihad: {
    id: 'astiwihad',
    sin: 'tristitia',
    invokingPower: 10,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { influenceGainFraction: 1 }, // 100% of current influence gain/s (Invocatio sheet)
    // Apex Tristitia (free). Effect (apex.ts): each second a small chance the whole reprobate
    // population suicides at once — every death mints a soul, so a wipe banks the lot.
  },
  aurevora: {
    id: 'aurevora',
    sin: 'gula',
    invokingPower: 7,
    sinLevel: 3,
    maxActive: 1,
    // Apex Gula (free). Effect (apex.ts): an exponentially-rising gold drain paid against a
    // similarly-rising player-efficiency boost (duration tracked in invocationDurations); when the
    // drain takes gold to 0 it dispels. The efficiency half is folded in by modifiers.ts.
  },
  erinyes: {
    id: 'erinyes',
    sin: 'ira',
    invokingPower: 10,
    sinLevel: 3,
    maxActive: 1,
    // Apex Ira (free, one-shot at the next Katabasis). Effects on invoke (see `invoke`): kills the
    // entire reprobate population (every death mints a soul), dispels any active Morpheus and locks
    // it out for the rest of the lifetime, and sets `pendingErinyes` for `commitKatabasis` to read
    // (zero gold + maleficia carry-over and stack a permanent ×2 player-efficiency multiplier).
  },
  morpheus: {
    id: 'morpheus',
    sin: 'acedia',
    invokingPower: 10,
    sinLevel: 3,
    soulCost: { fraction: 0.9, minimum: 0 },
    goldCost: { fraction: 0.9 },
    maxActive: 1,
    // Apex Acedia (90% souls + 90% gold, Invocatio sheet). Effect on invoke (see `invoke`): refused while
    // `morpheusLockedOut` is set. Effect while active (see tick.ts): the lifetime is held in
    // stillness — no income, no dynamics, no Opera or builds; on commit, `pendingMorpheus` overrides
    // the Katabasis carry-over to gold 100% + maleficia 100% + Emptio-list preserved.
  },
  specunitas: {
    id: 'specunitas',
    sin: 'vanagloria',
    invokingPower: 9,
    sinLevel: 3,
    maxActive: 1,
    upkeep: { goldGainFraction: 0.99 }, // 99% of current gold gain/s (Invocatio sheet)
    // Apex Vanagloria (free, upkeep aside). Re-targeted from its retired conversion-bias hook to
    // "×2 influence gain/s" (Invocatio sheet rev 2026-06-12); applied in modifiers.ts via
    // `hasSpecunitas` on influenceRateMul.
  },
} as const;
