# 02 — Systems and Mechanics

This document describes *how* the game works, system by system. Specific content — every action, every sigil, every reprobate type — lives in `03-content-catalog.md`. Specific numbers — base rates, per-tier weights, per-level coefficients — live in the economy spreadsheet, which always takes priority over this document when the two disagree.

---

## 1. Resources

The game has three resources. Each behaves differently and serves a different role.

### Resource representation

At the **visible** layer (what the player sees in the HUD and spends in the Opera), every resource is a natural number: 0, 1, 2, 3 … . Resources cannot be displayed or compared as floats.

At the **engine** layer, resources accumulate fractionally. Gold, influence, and accumulated tick-pools (suicide, murder, generation; see §9) are stored as `BigNum` and **floored on read** for any operation that compares against a threshold, deducts a cost, or renders the number to the UI. This is the load-bearing invariant: the player never sees `99.6 gold` and an action declaring it costs 100 must read the resource as `99` and refuse — not as `99.6` and accept.

The internal-fractional / floor-on-read pattern matters because at high progression the per-second gold and influence accruals are themselves fractional (a Sin-skill multiplier of 1.0625 on a 10/s base is not an integer), and floored-per-tick deductions would lose meaningful progress.

### Souls

- **Source:** earned when a corrupted human (a *reprobate*) dies.
- **Role:** the primary progression resource and the meta-currency.
- **Spending:**
  - During a lifetime: spent on some *Invocations* and some *Opera*.
  - On Katabasis: **bound** to sigils (recoverable) or **offered** to Princes (permanent).
- **Carry-over:** souls left unspent at Katabasis carry over when coming back.
- **Cap:** none. Numbers will grow into the millions and beyond at high progression — engineering side uses `break_infinity.js` (ADR-005).

### Gold

- **Source:** generated passively over time, modulated by Cardinal Sin levels, sigils and by certain reprobate subtypes. Base gold gain per second is in the spreadsheet (`Globals` sheet).
- **Role:** the operating budget. Most everyday Opera actions consume gold.
- **Spending:** *Decimatio* actions, *Depraedatio* ceremonies, *Indagatio* searches, *Emptio* purchases.
- **Reset on Katabasis:** yes. A percentage of gold remains when coming back; base remaining percentage is in the spreadsheet and is modified by Avaritia level, Pieces of Silver, and several sigils.

### Influence

- **Source:** generated passively over time as a *proportion of maximum influence*, capped by maximum influence. Base rate per second and base maximum are in the spreadsheet.
- **Role:** drives maximum acolyte count (§10), and is consumed by *Suasio*, *Depraedatio* toggles, and several invocations.
- **Cap:** the lifetime's current `maxInfluence`, modified by Vanagloria's Acclaim skill, the Spear of Longinus, and Marchosias (#35).
- **Reset on Katabasis:** influence drops to 0; `maxInfluence` drops to base (any per-lifetime growth is lost; the next lifetime starts at the base value).

---

## 2. The probability outcome system

Some Opera actions resolve on a tiered probability scale. The seven tiers, from best to worst for the player:

| Tier | Typical role | Associated colour |
|---|---|---|
| **Stellar** | Very rare, very strong positive outcome (e.g. target suicides, granting a soul directly). | Crimson. |
| **Excellent** | Rare strong positive (e.g. mass-conversion event, free maleficium). | Orange. |
| **Good** | The "intended" success outcome (e.g. a person becomes a reprobate). | Yellow. |
| **Neutral** | Nothing happens. The default failure mode. | White. |
| **Bad** | A minor negative (loss of gold, reprobate redeems). | Green. |
| **Terrible** | A major negative — *the Church may intervene here*: loss of multiple reprobates, loss of a maleficium. | Church purple. |
| **Apocalyptic** | Very rare, catastrophic — typically some resources are depleted, *Higher Power may be the narrative cause here*. | Light blue. |

Stellar and Apocalyptic outcomes are very important: when one happens, a black, small pop-up appears in the upper half of the screen showing the action that triggered the outcome, the lore of the outcome, and the outcome itself. This pop-up does not slow nor stop game time.

### Combination rule

When Cardinal Sin levels and sigils both modify a tier's probability, modifiers are **multiplicative weights applied to each tier's base probability, then renormalized so the distribution sums to 1.0**. The modifier engine (§3 below; ADR-022) produces a `tierWeightMul: Partial<Record<Tier, number>>` for global per-tier multipliers; a missing entry means 1 (no change). This avoids negative or > 1 probabilities and keeps the tier shape sensible under stacking.

Per-category tier shifts (e.g. Resignation increasing the Suasio Good-tier probability, Retribution doing the same for Decimatio) attach at action-resolution time rather than as global tier multipliers, since they target a specific category's distribution.

### Visibility

Outcome distributions are **hidden by default**. They are progressively revealed by oracular maleficia (see `03-content-catalog.md` §4).

### Authoring checklist for any new action

1. List all relevant tiers.
2. Assign baseline probabilities summing to 1.0.
3. Specify the effect of each tier in concrete game terms.
4. Specify which Cardinal Sins / sigils / invocations modify the distribution and how.
5. Specify the cost and the time to perform.
6. Pick the action's **efficiency mode** (see §3).

---

## 3. Opera

### Action types

Actions can be:

- **One-shot** with a duration (e.g. base *Suggestion*).
- **Toggles** that consume resources per second while active (e.g. *Panvitium*).

Unlocked actions can be **delegated**: acolytes or invocations run them in parallel with a specific efficiency. By default the player's own efficiency is 100% (modified by Sin levels and skills); an acolyte runs at 33% of player by default (modified by sigils and skills); an invocation runs at a per-invocation rate (some are faster than acolytes, e.g. Imp at *Caedis*).

### Efficiency modes

Every action declares an **efficiency mode** describing how its declared efficiency feeds the resolution:

- **`cost-outcome`** (Suasio, Decimatio): efficiency scales both the *cost paid* and the *outcome units delivered* by the same percentage. The duration is not affected. So Suggestion at efficiency 4 costs 4× influence and produces ~4× the per-tier outcome (e.g. 4 reprobates added on Good instead of 1).
- **`time`** (Indagatio, Emptio): efficiency divides the *action's duration*. Cost and success probabilities are not affected. So Indagatio at efficiency 4 takes 1/4 the base duration; the tier distribution is unchanged. Emptio additionally pays a per-target cost (the targeted maleficium's gold price) which is unaffected by efficiency.

A new action category that arrives later (`depraedatio`, `invocatio`) declares its own mode at the same site. Modes can be added; existing modes are stable.

The total efficiency for a specific action is the product of the player's global efficiency (Gula skill / level), the action's category efficiency (Leviathan for Suasio, Satan for Decimatio; nothing yet for Indagatio/Emptio), and any delegated-runner contribution (acolyte/invocation). When multiple runners are assigned to the same action, their per-runner efficiencies sum, and the resulting total is used as the action's effective efficiency.

Example: the player runs Suggestion at base efficiency 100% (Gula L0), with one acolyte assigned at 33% of player, and one Lamia invocation contributing 25% of player. Total efficiency is 1 + 0.33 + 0.25 = 1.58. For a 10-second base, in `cost-outcome` mode this means the cost is paid as `ceil(5 × 1.58) = 8` influence and the outcome at Good produces `floor(1.58) = 1` reprobate. In `time` mode the action would instead finish in `10 / 1.58 = 6.33` seconds.

### Parallelism rules

- **One** player-driven action at a time. The action queue holds the player's currently-running rite plus any acolyte or invocation delegated rites.
- **Toggles** may be active concurrently with player-driven actions and with each other, subject to per-second resource costs.
- ***Vitium Mercatura* builds** run alongside player-driven actions and do **not** count as player-driven actions. Multiple builds can be in flight concurrently. Builds cannot be delegated.
- **Acolytes** operate at a flat percentage of the player's efficiency (modifiable via sigils). Each acolyte runs at most one delegated action; the action shape and rules are the same as the player's, but with the acolyte's efficiency.
- **Invocations** can operate at a percentage of player efficiency that may be different from acolytes in an autonomous channel that does not occupy the player's action slot (an Imp doing *Ira*-aligned work is faster than an acolyte). Specific multipliers are in the spreadsheet.
- **Hybrid invocations.** The Familiar is a hybrid: it contributes a passive `+33%` multiplier to the player's own action efficiency *and* runs *Indagatio* in the background at 5% of the player's efficiency, in an autonomous channel that does not occupy the player's action slot. Future invocations may declare both kinds of contribution; the action engine reserves a queue slot per autonomous channel. There is no general "ambient action" capability for the player; this is invocation-flavoured.

### Resource-driven toggle deactivation

When a toggle's per-second cost cannot be paid in full from the player's resources, the toggle **auto-deactivates** on the next tick. There is no refund and no partial application; the tick records a single deactivation event in the log. *Panvitium*, which cannot be manually deactivated, follows the same rule: if its per-second cost cannot be paid, *Panvitium* ends.

### The six Opera categories

| Category | Latin meaning | Role |
|---|---|---|
| **Suasio** | "Persuasion / temptation" | Convert ordinary humans into reprobates. |
| **Decimatio** | "Culling" | Kill reprobates to harvest souls. |
| **Depraedatio** | "Plundering / despoliation" | Sin-themed businesses (*Vitium Mercatura*) and ceremonies (*Vitium Compositum*, including *Panvitium*). |
| **Invocatio** | "Invocation" | Summon hellish entities that grant effects or run autonomous actions. |
| **Indagatio** | "Searching / investigation" | Search the world for *maleficia*. |
| **Emptio** | "Purchase" | Buy a maleficium found via *Indagatio*. |

The exhaustive action list is in `03-content-catalog.md`.

---

## 4. Cardinal Sin levels and Devotion

- Devotion is gained **only on Katabasis**, by *offering* souls to the Prince associated with that Sin. Devotion number is equal to the number of offered souls. There are 4 Cardinal Sin Devotion milestones for each Cardinal Sin — reaching a given milestone grants you 1 Level for that Cardinal Sin. The **cumulative cost** to reach level *X* is **180^X** souls.
- Each Cardinal Sin grants a **Skill** with an **intensity** given by a formula per Cardinal Sin, based on the total Devotion for the Demon Prince / Cardinal Sin (the default shape is `intensity(x) = ln(x)² / SKILL_INTENSITY_DIVISOR`; the divisor and per-Sin overrides are in the spreadsheet).
- Sins also unlock content gates: *Vitium Compositum* requires every Sin at level ≥ 1; *Panvitium* requires every Sin at level ≥ 3.

The Skill effects are listed in `03-content-catalog.md` §1. The Sin levels and Sin skills feed into the modifier engine (ADR-022) — a Sin skill that "increases X" multiplies X by `1 + intensity`; a skill that "decreases X" multiplies by `1 / (1 + intensity)`, which is asymptotic to 0 and never negative.

---

## 5. Sigils

Sigils are the second prestige axis. Seventy-two sigils are exposed (the full *Lesser Key of Solomon* Goetia, with #32 replaced by Semet for lore purposes).

- On Katabasis, the player may **bind** unspent souls to one or more sigils.
- Each sigil has a passive effect that scales with the number of bound souls.
- **Multiple sigils can be bound simultaneously**, with no count cap.
- Bindings are **fully recoverable** during Katabases — souls return to the unspent pool and can be re-bound elsewhere or offered as Devotion.

### Binding-to-effect curve

By default, the **effect scales with √(bound souls)** — a square-root curve. This gives strong early returns and gentle late returns, encouraging spreading across multiple sigils rather than dumping all souls into one.

Some sigils may override this default for distinctive feel:

- **Linear-curve sigils** — more dangerous, more rewarding, more swingy. Strong-build-defining.
- **Logarithmic-curve sigils** — sharply diminishing returns; useful as splash investments.

Per-sigil curve overrides and per-sigil coefficients are in the economy spreadsheet (`Sigils` sheet). The catalog row in `03-content-catalog.md` §6 marks any non-default curve in the per-sigil description; an unmarked sigil uses the √ default.

---

## 6. Katabasis flow

Triggered by Katabasis on the Altar.

1. **Katabasis starts.** Active toggles stop, uncompleted actions fizzle, invocations are dispelled, all active *Vitium Mercatura* businesses are automatically shut down and their shut-down gold refund is collected (see §3 for the percentage rule).
2. **Katabasis menu opens.**
3. **Player allocates** between sigils (recoverable) and Devotion (permanent). Anything left over carries into the next lifetime. The player **cannot un-offer** Devotion. They **can** un-bind sigils. This asymmetry is the spine of the prestige design.
4. **Player confirms.** Then:
   - **Remaining maleficia roll.** Each owned maleficium's remaining chance is rolled independently using the current remaining-maleficia chance. Each maleficium passing the roll will be available when coming back; the others are lost.
   - **Remaining gold roll.** Remaining gold is defined as the remaining-gold percentage times the gold at Katabasis start. The percentage is affected by specific sigils and Cardinal Sin levels (Avaritia/Mammon, Semet).
   - **Remaining reprobates roll.** Each unconverted reprobate is rolled against the remaining-unconverted-reprobate chance (Luxuria/Asmodeus, Semet). Converted reprobates of all subtypes are lost on Katabasis.
   - **Katabasis recap.** A black page with white text appears, listing what remains. The fiction is that some acolytes stayed faithful, guarded part of your estate, and kept track of what they could.
5. **Player comes back.** Remaining reprobates, remaining gold (as floored integer), remaining maleficia, 0 influence, `maxInfluence` reset to base, 0 *Emptio*-listed maleficia (the list is lost; the Morpheus invocation can preserve it), current Cardinal Sin Devotion permanently in effect, current sigil bindings active.

---

## 7. Invocations

Invocations consume resources to summon hellish entities that affect gameplay. **Most invocations are persistent.** Some have a specific dispel condition (e.g. Aurevora dispels when gold reaches 0; Erinyes is one-shot). Invocations can be dispelled at will by the player unless explicitly marked otherwise (e.g. *Panvitium*, Morpheus).

- Each invocation has an **invoking power** requirement and may also require a Cardinal Sin level.
- **Invoking power** is acquired through equipped maleficia (the `invokingPower` of each owned copy sums) and through specific sigils.
- **On Katabasis**, all invocations are dispelled. The Erinyes one-shot is consumed; any persistent invocation's effects end.

The invocation list is in `03-content-catalog.md` §2.4.

---

## 8. Maleficia

Maleficia are occult items. The system is defined as follows:

- They are **discovered** via the *Indagatio* action — probabilistic, with rarer tiers surfacing at lower probability.
- They are **purchased** via the *Emptio* action — once *Indagatio* surfaces a maleficium, it appears on the *Emptio* list; the player pays gold and rolls the *Emptio* outcome distribution.
- **Owning a maleficium equips it.** There is no separate equip step. Owned = equipped = contributing its effect to the modifier engine and its invoking power to the invocation gate. A future loadout system (equipped subset of owned) is not currently planned.
- Some are **stackable**, with a `stackMax` per the catalog. Each owned copy contributes independently (e.g. each Iron Nail adds its sigil-effect bonus once).
- Stack rules at *Indagatio* discovery time (03 §2.5): a **non-stackable** maleficium that is already owned **or** already on the *Emptio* list cannot be re-surfaced. A **stackable** maleficium cannot be surfaced once `owned + listed >= stackMax`. A maleficium currently being purchased by an in-flight *Emptio* timer counts as **listed** until the timer resolves.
- They are **preserved across lifetimes** with a remaining chance — base remaining chance is in the spreadsheet, increased by Superbia level, several sigils, and Solomon's Ring.

The maleficia list, *Indagatio* and *Emptio* probability distributions, and per-maleficium costs are in `03-content-catalog.md` §4.

---

## 9. Reprobate dynamics

Reprobates are integer populations per subtype, never floats at the visible layer. The mechanics that change their count each tick — passive generation, suicide, and Choleric murder — all produce *fractional* per-tick contributions that need to be turned into integer kills/births deterministically.

### Per-tick accrual pools

The lifetime state carries three fractional accrual pools, alongside the integer population:

- `generationPool: number` — fractional reprobate-additions accumulated since the last integer birth.
- `suicidePool: number` — fractional reprobate-removals accumulated since the last integer suicide.
- `murderPool: number` — fractional reprobate-removals from Choleric violence accumulated since the last integer murder.

Each tick (10 Hz, `deltaSeconds = 0.1` online; an arbitrary `deltaSeconds` offline):

1. Compute the per-second rate from current state (population, Sin levels, sigil bindings, equipped maleficia, active toggles).
2. Add `rate × deltaSeconds` to the corresponding pool.
3. While the pool ≥ 1, subtract 1 from the pool and apply one integer event (a birth, a suicide, a murder).
4. The pool persists across ticks and across save/load, so a sub-1 fractional contribution is never lost.

This pattern matches the BigNum-resource fractional-internal / floored-display convention from §1. Pools are serialized; they are part of the save format.

### Suicide

Base rate: a population-wide percentage per second (e.g. 0.023% per second baseline; see spreadsheet `Globals`). The rate is multiplied by `(1 + Tristitia_intensity)` (Resignation skill), by `(1 + per_Nihilist_bonus × NihilistCount)`, and by relevant sigils (Crocell #49, Focalor #41, Ronove #27 for Nihilists specifically). A higher Tristitia level applies a `2^Tristitia_level` multiplier on top.

Per-tick fractional suicides = `population × rate × deltaSeconds`. Added to `suicidePool`. Each integer kill drawn from the pool picks one reprobate at random across **all subtypes** (including unconverted), weighted by current subtype counts, using the seeded RNG. Conversions are preserved on death: a Glutton suicide yields 1 soul exactly like any other death.

A worked example: 1000 total reprobates, base rate 0.023%/s, no modifiers. Per-second fractional kills = `1000 × 0.00023 = 0.23`. Across 10 ticks/s that's `0.023` per tick. After 4.35 seconds, `suicidePool` crosses 1 → one reprobate dies. Steady-state: ~1 suicide every 4.35 seconds.

### Choleric murder

Base rate per Choleric per second: spreadsheet (`Reprobates` sheet, per-Choleric murder rate). Modified multiplicatively by Aim (#23), Sabnock (#43 vs Gluttons), Camio (#53 vs Degenerates), Glasya-Labolas (#25 vs Celebrities), Haures (#64 vs Cholerics), Amdusias (#67 vs non-Cholerics), the Harpy invocation, and reprobate-subtype mitigations (Degenerates lower the murder rate).

Per-tick fractional murders = `cholericCount × per_choleric_rate × deltaSeconds`. Added to `murderPool`. Each integer kill drawn from the pool picks one non-Choleric reprobate at random (or a Choleric, if a sigil specifically biases toward Cholerics — Haures #64). Cholerics never murder unconverted reprobates more readily than they murder subtype reprobates unless a sigil biases that way.

### Passive generation

Base rate: spreadsheet (`Globals` sheet, base reprobate generation per second; may be 0 in the absence of *Vitium*-driven generation). Modified additively by per-business generation contributions, sigils (Aamon #7, Zepar #16 reduces), and the Lamia invocation.

Per-tick fractional births = `total_rate × deltaSeconds`. Added to `generationPool`. Each integer birth produces one unconverted reprobate (type `'reprobate'`); subtype conversion happens through *Vitium* / *Vitium Compositum* / *Panvitium* and not through passive generation.

### Conversion

When a reprobate is converted (*Vitium Mercatura*, *Vitium Compositum*, *Panvitium*), the subtype is chosen by `biasedSubtype()`, which weights subtypes by their corresponding Vitium specific conversion rate (see spreadsheet) - if more than 100% it is renormalized. Conversion is irreversible by default; sigils, maleficia, or specific Opera (Ose #57, Orias #59) may convert across subtypes.

---

## 10. Acolytes

Acolytes are your followers. They run delegated actions at a percentage of player efficiency and constitute the primary lever for parallelising progress without invocations.

### Maximum count

The maximum number of acolytes is a function of `maxInfluence`:

```
maxAcolytes = max(1, 1 + floor(log10(maxInfluence / BASE_MAX_INFLUENCE)))
```

At `maxInfluence = BASE_MAX_INFLUENCE` this gives 1 acolyte. At 10× base, 2. At 100× base, 3. The growth is deliberately slow so that even a heavy Vanagloria build settles at single-digit acolyte counts during normal play. The constants live in the spreadsheet; the *shape* (log-scaling on `maxInfluence`) is fixed by this section.

The Altar room shows **up to 4** acolytes visually (per §12). Acolytes beyond that count exist in state and can be assigned actions, but only 4 sprites render.

### Recruitment

Recruitment is automatic. When `maxInfluence` rises past a threshold that increases `maxAcolytes`, a new acolyte appears the same tick. There is no recruitment cost and no recruitment delay — the fiction is that acolytes find *you*; you do not seek them. This keeps the player's optimisation surface focused on Influence-cap growth rather than on a separate recruitment minigame.

### Efficiency

Default acolyte efficiency is **33%** of the player's own action efficiency. This is modified multiplicatively by:

- Bathin (#18) — increases acolyte action efficiency.
- Satan / Ira level — each level increases acolyte and invocation efficiency by 33% multiplicatively.
- Other sigils tagged "acolyte action efficiency" in `03-content-catalog.md` §6.

Acolyte efficiency stacks additively with the player's own efficiency when both are assigned to the same action (§3). Acolytes are subject to the same `efficiencyMode` as the action they're running.

### Assignment

Each acolyte may be assigned to at most one delegated action at a time. Assignment is a single-click operation, available actions for assignment should display a "-" symbol on the left and a "+" symbol on the right, which let the player assign and remove acolytes. An acolyte assigned to an action runs that action in a separate queue slot; the action completes at `baseTime / totalEfficiency` (time mode) or with cost/outcome scaled by `totalEfficiency` (cost-outcome mode), where `totalEfficiency` is the acolyte's contribution alone (or summed with other runners if the player chooses to stack on the same action).

### Loss

Acolytes are lost at Katabasis (the recap fiction is that some stayed faithful, but mechanically the lifetime starts with zero acolytes and recruitment happens again from scratch).

---

## 11. Save format and persistence

The save format is versioned (ADR-006, ADR-010). The persisted state is a single JSON blob, written to `localStorage` every 10–30 seconds and on significant state changes, and additionally pushed to the server for logged-in users.

The save shape is defined by `packages/shared/src/save/state-schema.ts` and validated with Zod on both client and server. Schema evolution follows ADR-023 (additive optional fields don't bump the version; renames, removals, or non-optional additions do).

For the design phase, the relevant constraint is: **all systems described above must be representable as serializable state**. The current per-save state to track:

- the unspent soul pool;
- the current Devotion per Sin;
- the current sigil bindings (sigil → souls bound);
- the lifetime state: gold, influence, `maxInfluence`, per-subtype reprobate counts, acolyte list with assignment state, invocation count per id, equipped maleficia (with duplicates for stackables), the *Emptio* list, active toggles, the action queue (timers, each with optional `target` payload for Emptio), and the reprobate-dynamics pools (`generationPool`, `suicidePool`, `murderPool`);
- the seeded RNG state;
- the timestamp of the last applied tick.

A migration directory (`packages/shared/src/save/migrations/`) is reserved for future shape-change migrations; none are required at the current schema version.

---

## 12. The three-room UI

The player operates from a **three-room interior** rendered as a lightly-pixelated side-elevation. There is no global menu bar. Menus are **diegetic** — they open by clicking objects in the rooms.

Some resources are visible at the left of the screen at all times — **Souls**, **gold**, **influence**. You can change rooms by clicking on the doors: the Invocation room's door leads to the Altar room; the Studio room's door leads to the Altar room; the Altar room's left door leads to the Invocation room and its right door to the Studio room.

Switching between rooms is a single click (a doorway). The Katabasis screen takes the full screen as a carved-in-stone modal.

### Invocation Room

There's a luxurious candelabra hanging from the ceiling. Walls are made of stones, wooden floor of intricate parquet, and a red carpet covers half the floor (the side of the door); the other side has no carpet and contains a drawn invocation circle.

- **Ars Goetia (book).** Click to open the *Invocatio* panel: list of available invocations, costs, gates, current number active for each, the "summon" button. The modal looks like an old page and the text looks inked. Not all invocations are shown — an invocation appears once you have at least half its required invoking power.
- **Maleficia shelf.** Click to open the maleficia panel showing your current inventory: icons of the owned maleficia in a list; clicking on a specific maleficium shows the full picture, name, rarity, and effect description. Counts are shown for stackables.
- **Active invocations** are visible in the room after invocation — only one at a time (the last one); leaving the room hides them.

### Altar room

Black marble floor, white marble walls. 2 ionic columns near a crude stone altar. Some candles behind the altar.

- **Stone altar.** Click to open the altar menu, showing the current Devotion per Cardinal Sin (with skill intensity and progress toward next level), the current Sigil loadout, and a button to Descend (initiates Katabasis).
- **Acolytes.** Once you have acolytes, up to 4 are visualised in the room. Further acolytes exist in state but are not rendered.

### Studio room

The view is as if you were seated in the Studio chair behind the mahogany-wood desk. Everything is luxurious; two windows are on the left side of the screen. The familiar appears in this room (only here) once invoked, as a ghostly dog sitting near the door.

- **PC / desk.** A very old PC with a black screen and green text. Click to open. It shows the four PC ledgers — *Depraedatio*, *Decimatio*, *Indagatio*, *Emptio* — and the game logs (the last 100 outcomes). Visual design echoes a Windows-95 interface.
- **The *Suasio* scroll.** Click to open the *Suasio* menu (same modal type as the Ars Goetia in the Invocation Room).
- **Window onto the world.** Cannot be clicked; only shows light entering the room. The light's colour changes under certain game states (notably under active *Panvitium*: red, lit by fires).
