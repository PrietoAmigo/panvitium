# 02 — Systems and Mechanics

This document describes *how* the game works, system by system. Specific content — every action,
every sigil, every maleficium — lives in `03-content-catalog.md`. Specific numbers — base rates,
per-tier weights, per-level coefficients — live in the economy spreadsheet
(`Panvitium_Economy_Template.xlsx`), which always takes priority over this document when the two
disagree. The fiction underneath everything is `00-lore-bible.md`; build decisions are
`04-architecture-decisions.md` (ADRs).

This revision incorporates **ADR-024** (reprobates are a single pool; subtypes and the conversion
mechanic are removed) and the **Vitium Mercatura / Vitium Compositum redesign**
(`vm-vc-redesign-spec.md`): the business grid and build queue are retired in favour of the
Mercatus system and the Foedera coupling.

---

## 1. Resources

The game has three resources. Each behaves differently and serves a different role. Reprobates
are not a resource — they are a population (§9) — but they obey the same display rules.

### Resource representation

At the **visible** layer (what the player sees in the HUD and spends in the Opera), every
resource is a natural number: 0, 1, 2, 3 … . Resources cannot be displayed or compared as floats.

At the **engine** layer, resources accumulate fractionally. Gold, influence, and the accumulated
tick-pools (generation, suicide, murder; see §9) are stored as `BigNum` (ADR-005) and **floored
on read** for any operation that compares against a threshold, deducts a cost, or renders the
number to the UI. This is the load-bearing invariant: the player never sees `99.6 gold`, and an
action declaring it costs 100 must read the resource as `99` and refuse — not as `99.6` and
accept.

The internal-fractional / floor-on-read pattern matters because at high progression the
per-second gold and influence accruals are themselves fractional, and floored-per-tick deductions
would lose meaningful progress.

### Souls

- **Source:** earned when a corrupted human (a *reprobate*) dies — one person, one soul, always.
- **Role:** the primary progression resource and the meta-currency.
- **Spending:**
  - During a lifetime: spent on some *Invocations* and some *Opera*.
  - On Katabasis: **bound** to sigils (recoverable) or **offered** to Princes (permanent).
- **Carry-over:** souls left unspent at Katabasis carry over when coming back.
- **Cap:** none. Numbers grow into the billions at high progression (the Eternal Sin threshold
  alone is in the 10⁹ range); engineering uses `break_infinity.js` (ADR-005).

### Gold

- **Source:** generated passively over time, plus the dominant in-lifetime source: **Vitium
  Mercatura revenue**, which is extracted from the living reprobate population (§3, `03 §2.3`).
  Base passive gain per second is in the spreadsheet (`Globals`).
- **Role:** the operating budget. Most everyday Opera actions consume gold; deepening a Mercatus
  consumes gold in lumps.
- **Spending:** *Decimatio* actions, Mercatus investment, *Vitium Compositum* upkeep, *Indagatio*
  searches, *Emptio* purchases, some invocations.
- **Reset on Katabasis:** yes. The Mercatūs are liquidated into gold first (§6), then a
  percentage of the resulting gold remains when coming back; the base remaining percentage is in
  the spreadsheet and is modified by Avaritia level and sigils (Purson #20).

### Influence

- **Source:** generated passively as a *proportion of maximum influence*, capped at maximum
  influence. Base rate and base maximum are in the spreadsheet (`Globals`).
- **Role:** the social budget. Drives maximum acolyte count (§10) and is consumed by *Suasio*,
  *Vitium Compositum* toggles, and several invocations.
- **Maximum influence** is itself a modifiable value (Vanagloria's Acclaim skill, Spear of
  Longinus, Marchosias #35).
- **Reset on Katabasis:** yes — back to the base maximum and zero acolytes.

---

## 2. The probability-tier outcome system

Most non-deterministic Opera actions resolve on a **seven-tier outcome ladder**. Every tiered
action declares a base probability distribution over the seven tiers, summing to exactly 1.0
(the spreadsheet enforces a SUM check per distribution).

| Tier | Colour (lore) | Typical manifestation |
|---|---|---|
| **Stellar** | Crimson | Windfall; the wildest positive outcome. |
| **Excellent** | Orange | Strong positive outcome. |
| **Good** | Yellow | The bread-and-butter positive outcome. |
| **Neutral** | White | Nothing happens; cost is spent. |
| **Bad** | Green | Mild setback. |
| **Terrible** | Church purple | Severe setback. Can manifest as Church involvement — a parish priest, a confessor, an inquiry — undoing recent corruption. |
| **Apocalyptic** | Light blue | Catastrophe. Can manifest as direct Higher-Power intervention: the player struck down, heavy losses. |

The Church and the Higher Powers surface **only** through these rare bad outcomes for most of the
game (`01`, "The world does not know it's you"); they are weather, not a faction.

### Modifying a distribution

Tier modifiers from any source (Sin skills, sigils, maleficia, invocations) are **multiplicative
weights on each tier's base probability, then the whole distribution is renormalised to 1.0**
(`Prob Tiers` sheet). This avoids negative or > 1 probabilities and keeps the tier shape sensible
under stacking.

Two kinds of deviation from plain multiplication are allowed, and both are explicit:

- **Locks.** *Mark of Cain* zeroes the Apocalyptic tier outright; a lock overrides any further
  multiplier and is applied last.
- **Additive reductions.** Gula's per-level effect removes a flat share of the negative tiers
  per level (additive; at the level cap the negative-outcome chance reaches 0% — see `03 §1` and
  the `Sins & Devotion` sheet).

Per-category tier shifts (e.g. a sigil raising only Suasio's Stellar chance) attach at
action-resolution time rather than as global tier multipliers, since they target a specific
category's distribution.

### Visibility

Outcome distributions are **hidden by default**. They are progressively revealed by oracular
maleficia (`03 §4`): one maleficium per Opera category, plus the Obsidian Mirror which reveals
all of them.

### Randomness discipline

All rolls draw from a **seeded, serialized RNG** (ADR-011): the RNG state is part of the save,
ticks are deterministic, and a system that has nothing to roll must not consume draws (gating),
so replays and offline catch-up are reproducible.

### Authoring checklist for any new tiered action

1. List all relevant tiers.
2. Assign baseline probabilities summing to 1.0 (with the spreadsheet SUM check).
3. Specify the effect of each tier in concrete game terms.
4. Specify which Cardinal Sins / sigils / invocations modify the distribution and how.
5. Specify the cost and the time to perform.
6. Pick the action's **efficiency mode** (§3).

---

## 3. Opera

The Opera is the action surface of a lifetime: everything the player does between descents.

### Action types

- **One-shot** actions with a duration (e.g. *Suggestion*, *Caedis*, *Indagatio*).
- **Toggles** that consume resources per second while active (e.g. the *Vitium Compositum*
  ceremonies, *Panvitium*). A one-shot action also gains an **auto-repeat** toggle once its Sin
  reaches the spreadsheet's toggle level (the same gate that opens delegation): flip it on and the
  rite re-casts itself in the player's slot — paying each cycle, retrying after a stall — until the
  player flips it off or can no longer afford it. Because only one player-driven rite holds the slot
  (§3 below), enabling auto-repeat on one rite turns it off on any other. It is an *online* loop:
  like any player-slot rite it does not catch up across a long absence — that is what acolyte and
  invocation delegation are for.
- **Transactions** — instant, deterministic exchanges that are not actions at all and never
  occupy the action slot: Mercatus invest/divest, sigil binding, equipping maleficia, summoning
  an invocation.

Unlocked actions can be **delegated**: acolytes or invocations run them in parallel with their
own efficiency. By default the player's own efficiency is 100% (modified by Sin levels and
skills); an acolyte runs at a flat fraction of the player's (spreadsheet `Globals` /
`Acolytes`); an invocation runs at a per-invocation rate (`Invocatio` sheet) — some are faster
than acolytes.

**Delegated channels carry out their actions for free.** Only the player's own cast pays an
action's gold/influence cost; acolytes and invocation runners consume no resources to perform a
delegated action, so a delegated channel never stalls on an empty treasury. (Invocations still pay
their per-second *summon upkeep* — `Invocatio` sheet — which is the price of staying active, not of
carrying out an action.)

### Efficiency modes

Every action declares an **efficiency mode** describing how its effective efficiency feeds the
resolution. The spreadsheet states each category's mode at the top of its sheet; the sheet wins
over any older prose.

- **`cost-outcome`** (*Suasio*): efficiency scales both the *cost paid* and the *positive
  outcome units delivered* by the same percentage. Duration is not affected.
- **`time`** (*Decimatio*, *Indagatio*, *Emptio*): efficiency divides the *action's duration*.
  Costs and the tier distribution are not affected. (*Emptio* additionally pays the targeted
  maleficium's gold price, unaffected by efficiency.)
- **Toggle scaling** (*Vitium Compositum*): the ceremony ticks at a fixed cadence unaffected by
  efficiency; efficiency multiplicatively scales the per-tick costs, outputs, and effects.

A new action category arriving later declares its own mode at the same site. Modes can be added;
existing modes are stable.

The total efficiency for a specific action is the **product** of the player's global efficiency
(Gula's Insatiability online, Acedia's Procrastination offline), the action's category
efficiency (Luxuria levels for *Suasio*, Ira levels for *Decimatio*, per-category sigils), and
the **sum** of all runner contributions on that action: the player's own contribution plus each
assigned acolyte's plus any invocation contribution.

Example: the player casts *Suggestion* at base efficiency 1.0. In `cost-outcome` mode the player
pays `ceil(5 × 1.0) = 5` influence and a Good outcome produces `floor(1.0) = 1` reprobate; in
`time` mode the efficiency would instead divide the duration. A delegated acolyte (0.33) and a
Lamia invocation (0.25) each run *Suggestion* in their own channel at their own efficiency — and
carry it out for free, so they add output without adding to the influence bill.

### Parallelism rules

- **One** player-driven action at a time. The action queue holds the player's currently-running
  rite plus any acolyte- or invocation-delegated rites, each in its own channel. A rite set to
  **auto-repeat** simply keeps re-occupying that single player slot — it is the same one-at-a-time
  slot, looped, not a second channel.
- **Toggles** may be active concurrently with player-driven actions and with each other, subject
  to per-second resource costs.
- **Transactions** (Mercatus invest/divest and the rest listed above) resolve instantly and
  never occupy any slot. There is no build queue; nothing in *Vitium Mercatura* takes time.
- **Acolytes** each run at most one delegated action at the acolyte's efficiency; the action shape
  and rules are the same as the player's, except a delegated cycle costs no resources (and so never
  stalls). Acolytes can also be assigned to help run a *Vitium Compositum* ceremony, adding their
  contribution to its effective efficiency.
- **Invocations** with an autonomous-runner effect (Familiar, Imp, Upir, …) run their action in
  their own channel without occupying the player's slot, and carry it out for free — a cost-outcome
  cycle pays no resource cost, so it never stalls. (The invocation's per-second summon upkeep is a
  separate charge; see §7.)
- **Hybrid invocations.** The Familiar both contributes a passive bonus to the player's own
  efficiency *and* runs *Indagatio* autonomously. Future invocations may declare both kinds of
  contribution. There is no general "ambient action" capability for the player; this is
  invocation-flavoured.

### Resource-driven toggle deactivation

When a toggle's per-second cost cannot be paid in full, the toggle **auto-deactivates on the
next tick**, before any income is applied — a toggle never earns on a tick it could not afford.
There is no refund and no partial application; the tick records one deactivation notice.
*Panvitium*, which cannot be manually deactivated, follows the same rule: when its exponential
cost outruns the treasury, *Panvitium* ends.

### The six Opera categories

| Category | Latin meaning | Role |
|---|---|---|
| **Suasio** | "Persuasion / temptation" | Corrupt ordinary humans into reprobates. |
| **Decimatio** | "Culling" | Kill reprobates to harvest souls. |
| **Depraedatio** | "Plundering / despoliation" | The vice economy: the eight *Vitium Mercatura* trades and the *Vitium Compositum* ceremonies (including *Panvitium*). |
| **Indagatio** | "Searching out" | Hunt for maleficia. |
| **Emptio** | "Purchase" | Buy maleficia from the discovered market. |
| **Invocatio** | "Summoning" | Summon and maintain invocations. |

Content, gates, and numbers per category are in `03 §2` and the spreadsheet.

---

## 4. The modifier engine

Many independent sources affect many independent targets: Sin levels, Sin skills (intensity
∝ ln(devotion)², divisor in the spreadsheet), sigil bindings, equipped maleficia, active
ceremonies, invocations, acolytes. Per **ADR-022**, all of it converges in a **single
composition point**: `computeModifiers(state)` assembles an immutable bundle of derived
multipliers each tick, and every consumer (tick loop, action engine, probability resolver) reads
only the bundle.

- **Composition rule:** all effects compose **multiplicatively** unless a target's nature
  demands otherwise; deviations (locks, additive reductions — §2) are explicit.
- **Skill→effect coupling:** a skill that "increases X" multiplies X by `1 + intensity`; a skill
  that "decreases X" multiplies X by `1 / (1 + intensity)` (asymptotic to 0, never negative).
  Fixed convention project-wide; per-skill coefficients are tunable in the spreadsheet.
- **The bundle is derived, never persisted.** The save stores sources; the bundle is rebuilt on
  load and each tick.
- Some couplings are inherently local and compute at their call site instead of the global
  bundle — e.g. **Foedera** (§3, `03 §2.3`), which depends on per-ceremony active state.

---

## 5. Sigils

The 72 sigils of the Goetia are the **tactical, recoverable** prestige axis. On each Katabasis
the player may bind unspent souls to sigils; each sigil grants a passive effect whose magnitude
follows the sigil's **curve** over the bound souls:

- **√(bound souls)** — the default.
- **log(bound souls + 1)** — used by the flat-generator and carry-over sigils.
- **linear** — reserved; applies as a flat increase rather than a percentage.

Effect at N bound souls = `base coefficient × curve(N)`; per-sigil curve and coefficient live in
the spreadsheet (`Sigils` sheet). Percentage-type yields fold into the modifier bundle (§4);
flat-type yields (gold/s, influence/s, carry-over points) add at their target site.

Binding is a **re-allocation, not a sacrifice**: bound souls return to the pool at the next
Katabasis menu and can be re-bound freely. The full catalog is `03 §5`; *Semet* (#32) carries
its own visibility gate.

---

## 6. Devotion, the Princes, and Katabasis

### Devotion

Souls **offered** to a Prince are permanent and irreversible — the strategic axis, in deliberate
tension with sigil binding: every soul offered is one that cannot be bound, and vice versa.

Cumulative Devotion to reach Sin level X is `base^X` souls (base in `Globals`; levels run 0–4).
Each Cardinal Sin grants:

- a **continuous skill** whose intensity rises with total Devotion along the fixed curve
  (`intensity = ln(devotion)² / divisor`, divisor in the spreadsheet), coupled to its target per
  §4; and
- a **discrete per-level effect** at each level threshold (unlocks, carry-over bonuses, category
  efficiency multipliers — the table is `03 §1`).

### Katabasis — the descent

Lying on the altar (a two-step confirmation in the Altar room) ends the lifetime:

1. **Liquidation.** Every *Vitium Mercatura* trade auto-divests into gold at the divest fraction
   (`03 §2.3`) — the pre-descent cash-out. This happens **before** any carry-over roll, so
   Avaritia and the gold-carry-over sigils act on the liquidated total.
2. **Carry-over rolls.** A percentage of gold remains; each owned maleficium has a chance to
   remain; a percentage of reprobates remain identified. Base fractions are in `Globals`
   (5% each); they are raised by Avaritia / Superbia / Tristitia levels respectively
   (`03 §1`) and by sigils (Purson #20, Cimejes #66, Camio #53). The Erinyes and Morpheus apex
   invocations override the next descent's carry-over wholesale (`03 §2.4`).
3. **The Katabasis menu.** Unspent souls are allocated: bound to sigils (recoverable) or offered
   to Princes (permanent). Souls left unspent carry over as a usable resource.
4. **The recap.** A black page, white text, naming and numbering what survived: the gold kept
   safe, the maleficia not looted, the reprobates still identified.
5. **The new lifetime** begins with starting gold (the carried fraction), base influence, zero
   acolytes, zero Mercatus depths, no active invocations or toggles, current Devotion levels in
   effect, current sigil bindings active, and the unspent soul pool.

All invocations are dispelled by the descent. Everything in `lifetime` state resets; `devotion`,
`sigilBindings`, unspent `souls`, achievements, and the Katabasis count persist.

---

## 7. Invocations

Summoned entities, maintained from the Invocation Room (`§12`). Mechanics:

- **Invoking power** gates every invocation. Power comes from owned power-source maleficia
  (`03 §4`) and from sigils (Forneus #30, Andrealphus #65). An invocation becomes *visible* in
  the Ars Goetia book once the player holds at least **half** its required power; it becomes
  summonable at full power plus its Sin-level gate and cost.
- **Concurrency:** at most one **Apex** invocation active at a time; at most one **Familiar**;
  any number of **Normal** invocations. All invocations are dispelled on Katabasis; an
  invocation whose per-second cost cannot be paid is dispelled by the same rule as toggles (§3),
  and the exponential-ramp apexes self-dispel when their cost outruns the treasury.
- **Effect shapes.** An invocation's effect is one of three engine shapes: an **autonomous
  runner** (runs a named action in its own channel at its listed efficiency), a **static
  modifier contribution** (a line in the §4 bundle while active), or a **per-tick apex effect**
  (mass events, ramps, next-Katabasis overrides). The catalog and per-invocation numbers are
  `03 §2.4` and the `Invocatio` sheet.

---

## 8. Maleficia

Occult items. Owned maleficia are always in effect (there is no equip slot); **stackable** items
repeat their effect per copy up to their stack cap; the rest cap at one copy.

- **Types.** *Power sources* grant invoking power (§7). *Enhancers* contribute to the modifier
  bundle. *Oraculars* reveal a category's outcome distribution (§2). *Targeted* items are
  single-use effects (Defixio, Hand of Glory).
- **Acquisition.** *Indagatio* (a timed search resolving on the tier ladder — the tier decides
  the rarity found) and *Emptio* (a timed purchase from the discovered list at the rarity's
  gold price — the tier decides the discount or the mishap). Both are `time`-mode actions.
- **The Emptio list** — maleficia discovered but not yet bought — persists within a lifetime and
  is part of the save.
- **Carry-over.** Each owned maleficium survives Katabasis with the remaining-maleficia chance
  (§6). The Morpheus apex guarantees the whole inventory and the Emptio list across one descent.

The maleficia catalog, the *Indagatio*/*Emptio* distributions, and prices are `03 §4` and the
spreadsheet.

---

## 9. Reprobate dynamics

Per **ADR-024**, reprobates are a **single undifferentiated pool** — one integer population.
There are no subtypes and no conversion mechanic. The population is the centre of the economy:
*Suasio* and Mercatus corruption grow it, *Vitium Mercatura* revenue is proportional to it, and
*Decimatio* plus the ambient death rates spend it for souls. Every death — culled, suicide, or
murder — mints exactly one soul.

### Per-tick accrual pools

The mechanics that change the population each tick produce *fractional* contributions that must
become integer events deterministically. The lifetime state carries three fractional pools
alongside the integer population:

- `generationPool` — fractional births (Mercatus corruption, *Suasio*-adjacent toggles, sigils
  Ose #57 / Aamon #7 / Zepar #16, Adder Stone, Hand of Glory).
- `suicidePool` — fractional removals from despair.
- `murderPool` — fractional removals from violence.

Each tick: compute the per-second rate from current state; add `rate × deltaSeconds` to the
pool; while a pool ≥ 1, subtract 1 and apply one integer event. Pools persist across ticks and
saves, so sub-1 contributions are never lost. Offline catch-up is the same tick with a large
delta (ADR-004, uncapped), scaled by the player base offline efficiency (`Globals`, 0.5×) and the
offline-gain modifiers; only *Mercatus Acediae*'s take is exempt from the 0.5 base (ADR-026).

### Suicide

A population-wide percentage per second (base in `Globals`), multiplied by the Tristitia-driven
and sigil/maleficia modifiers (Ronove #27, Sabnock #43, Witch Ladder, the Nightmare invocation,
Doom Gathering). Each suicide mints a soul.

### Murder

A population-wide per-capita rate per second (base in `Globals`; re-anchored from the retired
per-Choleric rate by ADR-024), multiplied by its modifiers (Aim #23, Glasya-Labolas #25, Mark of
Cain, Poppet, Galdrabók, Enraging Broadcast). Each murder mints a soul. Leraie #14 gives each
murder a chance to trigger a follow-on suicide.

### Generation

Base passive generation is **zero**: nothing breeds reprobates until the player acts. The two
engines are *Suasio* (the player's hand) and *Vitium Mercatura* corruption (the trades'
throughput, `03 §2.3`), plus the flat and percentage modifiers above.

---

## 10. Acolytes

Lesser practitioners who do the work's lower offices (`00-lore-bible.md` §9). Mechanically:

- **Count is driven by effective maximum influence.** The Nth acolyte unlocks at the Nth
  threshold of a geometric series anchored at the base threshold (both in the `Acolytes` sheet).
  Influence resets on Katabasis, so each lifetime re-earns its retinue.
- **Delegation.** Each acolyte runs at most one delegated action at the acolyte efficiency (base
  fraction in `Globals`, raised by Tristitia's Resignation skill and Bathin #18). Delegation
  **loops**: the acolyte runs its action cycle after cycle — for free, consuming no gold/influence —
  and stays assigned until the player recalls it (or Katabasis clears the retinue). Because a
  delegated cycle costs nothing, it never stalls on an empty treasury. It is set-and-forget
  automation, not a single errand. Acolytes can instead be assigned to help run a *Vitium
  Compositum* ceremony, summing into its efficiency.
- **Limits.** Acolytes cannot run actions that require specific maleficia. At most four are
  visualized in the Altar room (per-count background plates); further acolytes work unseen.
- **Desertion** is a Katabasis-time fiction beat (the unfaithful loot what is portable) — it is
  *expressed* through the carry-over rolls (§6), not simulated per-acolyte.

---

## 11. Save format and persistence

The save is a single versioned JSON blob (ADR-006), written to `localStorage` on a debounced
cadence and pushed to the server for logged-in users. The shape is defined in
`packages/shared/src/save/state-schema.ts`, validated with Zod on both ends, and evolves under
**ADR-023**: additive optional fields don't bump the version; renames, removals, type changes,
and non-optional additions bump `schemaVersion` with a pure, tested migration
(`packages/shared/src/save/migrations/`).

Current per-save state to track:

- the unspent soul pool and the Eternal-Sin devotion;
- Devotion per Sin; sigil bindings (sigil → souls bound);
- the lifetime state: gold, influence, `maxInfluence`, the reprobate population (one integer),
  **Mercatus depths per Sin**, the acolyte list with assignment state, active invocations and
  their runner timers, owned maleficia (duplicates for stackables), the *Emptio* list, active
  toggles and toggle durations, the action queue (timers, optional `target` for Emptio), the
  set of auto-repeating rites, and the accrual pools (`generationPool`, `suicidePool`,
  `murderPool`);
- achievements, the Katabasis count, the run's start timestamp;
- the seeded RNG state and the timestamp of the last applied tick.

Schema history: v1 → v2 (ADR-024: subtype record collapsed to one integer). The Vitium
Mercatura redesign removes `businesses`/`buildQueue` and is the v2 → v3 migration
(`vm-vc-redesign-spec.md` §4).

---

## 12. The three-room UI

The player operates from a **three-room interior** rendered as a degraded-photoreal
side-elevation (ADR-021; `01`, visual identity). There is no global menu bar; menus are
**diegetic**, opened by clicking objects in the rooms. Souls, gold, and influence are always
visible at the left of the screen. Room changes are single clicks on doors: the Invocation
Room ↔ the Altar room ↔ the Studio. The Katabasis screen takes the full screen as a
carved-in-stone modal.

### Invocation Room

Stone walls, intricate parquet, a luxurious candelabra; a red carpet on the door side, a drawn
invocation circle on the other.

- **Ars Goetia (book).** Opens the *Invocatio* panel: available invocations, costs, gates,
  active counts, the summon button — inked text on an old page. An invocation appears once the
  player holds at least half its required invoking power (§7).
- **Maleficia shelf.** Opens the inventory: icons in a list; clicking one shows the full
  picture, name, rarity, and effect. Counts shown for stackables.
- Active invocations render as silhouettes per the `Invocatio` sheet's display rules.

### Altar Room

The found altar at the centre; doors left (Invocation Room) and right (Studio). Up to four
acolytes are visualized, switching the background plate per count.

- **The Altar.** Opens the Devotion ledger (per-Prince Devotion and levels, bound sigils) and
  carries the two-step **descend** action that opens the Katabasis flow (§6).

### Studio

The 2015-era seat of the worldly operation: a desk, a PC, a smartphone, a window onto the city.

- **The PC.** Opens the worldly programs: the **Vitium Mercatura** panel (eight trades — depth,
  revenue, invest/divest, Foedus badge), the *Decimatio* and *Indagatio* actions, the *Emptio*
  market, achievements, the event log, and the **email** client (the content channel —
  `00-lore-bible.md` §10).
- **The smartphone** carries the incoming and outgoing calls.
- **The Suasio scroll.** The *Suasio* actions and their delegation.
- **The window** is the *Panvitium* signature. The screenshot moment.
