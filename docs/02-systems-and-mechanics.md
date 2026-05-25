# 02 — Systems and Mechanics

This document describes *how* the game works, system by system. Specific content — every action, every sigil, every reprobate type — lives in `03-content-catalog.md`.

---

## 1. Resources

The game has three resources. Each behaves differently and serves a different role. Resources are always a natural number (0, 1, 2, 3...) and cannot be float.

### Souls

- **Source:** earned when a corrupted human (a *reprobate*) dies.
- **Role:** the primary progression resource and the meta-currency.
- **Spending:**
  - During a lifetime: spent on some *Invocations* and some *Opera*.
  - On Katabasis: **bound** to sigils (recoverable) or **offered** to Princes (permanent).
- **Carry-over:** souls left unspent at Katabasis carry over when coming back.
- **Cap:** none. Numbers will grow into the millions and beyond at high progression — the engineering side will need a big-number library (`break_infinity.js`).

### Gold

- **Source:** generated passively over time, modulated by Cardinal Sin levels, sigils and by certain reprobate subtypes. Base gold gain per second is 10.
- **Role:** the operating budget. Most everyday Opera actions consume gold.
- **Spending:** Decimatio actions, Depraedatio ceremonies, Indagatio searches, Emptio purchases...
- **Reset on Katabasis:** yes. Theres a percentage of gold remaining  when coming back - base remaining gold is 5%.

### Influence

- **Source:** generated passively over time as a percentage of maximum influence, capped by maximum influence. Base influence gain per second is 5.
- **Role:** Defines maximum number of acolytes, also used for *Suasio*, *Depraedatio* and *Invocatio*.

Maximum influence is the defining factor for the number of acolytes.

---

## 2. The probability outcome system

Some Opera actions resolve on a tiered probability scale. The seven tiers, from best to worst for the player:

| Tier | Typical role | Associated colour |
|---|---|
| **Stellar** | Very rare, very strong positive outcome (e.g. target suicides, granting a soul directly). | Crimson. |
| **Excellent** | Rare strong positive (e.g. mass-conversion event, free maleficium). | Orange. |
| **Good** | The "intended" success outcome (e.g. a person becomes a reprobate). | Yellow. |
| **Neutral** | Nothing happens. The default failure mode. | White. |
| **Bad** | A minor negative (loss of gold, reprobate redeems, an acolyte refuses an order). | Green. |
| **Terrible** | A major negative — *the Church may intervene here*: loss of multiple reprobates, loss of an acolyte, loss of a maleficium. | Church purple. |
| **Apocalyptic** | Very rare, catastrophic — typically some resources are depleted, *Higher Power may be the narrative cause here.* | Light blue. |

Stellar and Apocalyptic outcomes are very important - as such, when this happens a black , small pop-up in the upper half of the screen appears mentioning the action that triggered this outcome, the lore of the outcome adn the outcome itself. This pop-up does not slow nor stop the game time.

### Combination rule (decided)

When Cardinal Sin levels and sigils both modify a tier's probability, modifiers are **multiplicative weights applied to each tier's base probability, then renormalized so the distribution sums to 1.0**. This avoids negative or >1 probabilities and keeps the tier-shape sensible under stacking.

### Visibility (decided)

Outcome distributions are **hidden by default**. They are progressively revealed by some maleficia.

### Authoring checklist for any new action

1. List all relevant tiers.
2. Assign baseline probabilities summing to 1.0.
3. Specify the effect of each tier in concrete game terms.
4. Specify which Cardinal Sins / sigils / invocations modify the distribution and how.
5. Specify the cost and the time to perform.

---

## 3. Opera

### Action types

Actions can be:

- **One-shot** with a duration (e.g. base *Suggestion*).
- **Toggles** that consume resources per second while active (e.g. *Panvitium*).

Unlocked actions can be **delegated**: acolytes or invocations run them in parallel with a specific efficiency.
By default, your efficiency is 100% and an acolyte efficiency is 33%. The efficiency determines how much time it takes to finish the action, or how many times per second a toggle triggers.

### Parallelism rules (decided)

- **One** player-driven action at a time.
- Toggles may be possible to be active concurrently, subject to resource costs.
- One *Vitium mercatura* are possible to be bulding concurrently, subject to resource costs. One of each kind. Cannot be delegated and do not count as player-driven actions.
- Acolytes operate at a flat percentage of the player's efficiency (modifiable via sigils). **Acolytes cannot run actions that require specific maleficia**.
- Invocations operate at a percentage of player efficiency that may be defined and it could be different than acolytes (an Imp doing Ira-aligned work is faster than an acolyte). Specific multipliers tuned in the spreadsheet.
- The player and multiple acolytes and / or invocations can be assigned to the same action, and their efficiency would be added to obtain the total efficiency for the action to calculate the action time or the number of times the toggle triggers per second.

Example: the player has an efficiency rate of 100%, an invocation with an efficiency rate of 25% of the player and an acolyte with an efficiency rate 33% of the player.They are all assigned to one action that has a base action time (duration) of 3 seconds. The total action time would be 1/(1+0.25+0.33)=1.89873417722 seconds.

### The six Opera categories

| Category | Latin meaning | Role |
|---|---|---|
| **Suasio** | "Persuasion / temptation" | Convert ordinary humans into reprobates. |
| **Decimatio** | "Culling" | Kill reprobates to harvest souls. |
| **Depraedatio** | "Plundering / despoliation" | Sin-themed businesses and ceremonies. |
| **Invocatio** | "Invocation" | Summoning. Invocation of hellish entities that grant effects or execute actions.|
| **Indagatio** | "Searching / investigation" | Search the world for *maleficia*. |
| **Emptio** | "Purchase" | Buy a maleficium found via *Indagatio*. |

The exhaustive action list is in `03-content-catalog.md`.

---

## 4. Cardinal Sin levels and Devotion


- Devotion is gained **only on Katabasis**, by *offering* souls to the Prince associated with that Sin. Devotion number is equal to the number of offered souls. There are 4 Cardinal Sin Devotion milestones for each Cardinal Sin- reaching a given milestone grants you 1 Level for that Cardinal Sin. The **cumulative cost** to reach level *X* is **180^X** souls.
- Each Cardinal Sin grants a **Skill** with an **intensity** given by a formula per Cardinal Sin, and based on the total Devotion for the Demon Prince / Cardinal Sin (\frac{\left(1+\log(x)+\frac{\sqrt{x}}{20}\right)}{10})
- Sins also unlock content gates: *Vitium Compositum* requires every Sin at level ≥ 1; *Panvitium* requires every Sin at level ≥ 3.

The Skill effects are listed in `03-content-catalog.md`.

---

## 5. Sigils

Sigils are the second prestige axis. Seventy-two sigils are exposed (the full *Lesser Key of Solomon* Goetia, one of them changed for lore purposes).

- On Katabasis, the player may **bind** unspent souls to one or more sigils.
- Each sigil has a passive effect that scales with the number of bound souls.
- **Multiple sigils can be bound simultaneously**, with no count cap.
- Bindings are **fully recoverable** during Katabases, souls return to the unspent pool and can be re-bound elsewhere or offered as Devotion.

### Binding-to-effect curve (decided)

By default, the **effect scales with √(bound souls)** — a square-root curve. This gives strong early returns and gentle late returns, encouraging spreading across multiple sigils rather than dumping all souls into one.

Some sigils override this default for distinctive feel:

- **Linear-curve sigils** — more dangerous, more rewarding, more swingy. Strong-build-defining.
- **Logarithmic-curve sigils** — sharply diminishing returns; useful as splash investments.

Specific curve coefficients are in the economy spreadsheet.

---

## 6. Katabasis flow

Triggered by Katabasis on the Altar.

1. **Katabasis starts.** Active toggles stop, uncompleted actions fizzle, invocations are dispelled, all active *Vitium mercatura* businesses are automatically shut down and their shut down gold is obtained.
2. **Katabasis menu opens.**
3. **Player allocates** between sigils (recoverable) and Devotion (permanent). Anything left over carries into the next lifetime. The player **cannot un-offer** Devotion. They **can** un-bind sigils. This asymmetry is the spine of the prestige design.
4. **Player confirms.** Then:
**Remaining maleficia roll:** Each maleficium's remaining chance is rolled independently applying the remaining maleficia chance. Each maleficium passing the roll will be available when coming back, the other maleficia will be lost.
**Remaining gold roll:** Remaining gold is defined as the remaining gold percentage times the gold when the last Katabasis started. This percentage is affected by specific sigils and Cardinal Sins.
**Katabasis recap**. You come back: remaining reprobates, remaining gold, remaining maleficia, 0 influence, 0 *Emptio* listed maleficia (you lost track of them), current Cardinal Sin skills permanently in effect, current sigil bindings active. The remaining resources and items are explained as if some of your acolyytes remained faithful and awaiting your come back.

---

## 7. Invocations

Invocations consume resources to summon hellish entities that affect gameplay. **Most invocations are persistent, some other invocations are dispelled after a certain condition is met**. Invocations can be dispelled at will unless specified.

- Each invocation has an **invoking power** requirement and may also require a Cardinal Sin level.
- **Invoking power is acquired** primarily through ritual maleficia — each contributes a fixed power value while equipped.

The invocation list is in `03-content-catalog.md`.

---

## 8. Maleficia

Maleficia are occult items. The system is now defined:

- They are **discovered** via the *Indagatio* action (probabilistic — different tiers of maleficia surface with different probabilities).
- They are **purchased** via the *Emptio* action — once *Indagatio* surfaces a maleficium, the player pays gold for it, with its own outcome distribution.
- Some are **stackable**.
- Some grant **invoking power** that gates higher-tier invocations; some **gate specific actions**; some enhace the player in other ways.
- They are **preserved across lifetimes** with a remaining chance. Base remaining maleficia chance is 25%, it is increased by some Cardinal Sin levels, sigils and invocations.

The maleficia list, *Indagatio* and *Emptio* probability distributions are in `03-content-catalog.md`.


---

## 9. Save format and persistence

Not yet implemented. From the project plan: save versioning starts at v1, persisted to `localStorage` every 10–30 s, with offline progression on next load. A migrator should be written before it is needed.

For the design phase, the relevant constraint is: **all systems above must be representable as serializable state**. The key state to track per save is the unspent soul pool, the current Devotion levels per Sin, the current sigil bindings (sigil → souls bound), the current lifetime state (gold, reprobate counts by subtype, acolyte list, invocation list, equipped maleficia, current Sin intensities), the current Influence value, the active toggles, the action queue / timers, and the maleficia inventory.

---

## 10. The three-room UI

The player operates from a **three-room interior** rendered as a lightly-pixelated side-elevation. There is no global menu bar. Menus are **diegetic** — they open by clicking objects in the rooms.

Some resources can be seen on the left part of the screen - Hellsouls, gold, influence.
You can change rooms by clicking on the doors - the Invocation room's door takes you to the Altar room, the Studio room's door takes you to the Altar room, the left door in the Altar room takes you to the Invocation room, the right door of the Altar room takes you to the Studio room.

Switching between rooms is a single click (a doorway).
The Katabasis screen takes the full screen as a carved-in-stone modal.

### Invocation Room

There's a luxurious candelabra hanging from the ceiling. Walls are made of stones, wooden floor of intrincate parquet and there's a red carpet covering half the floor (the side of the door), the other side of the room has no carpet and there's in an invocation circle there.

- **Ars Goetia (book).** Click to open the *Invocatio* panel: list of available invocations, costs, gates, current number for each invocation... the "summon" button. The modal looks like an old page and the text looks inked. Not all invocations are shown, for an invocation to be shown you need to have at least half the invoking power required.
- **Maleficia shelf.** Click to open the maleficia panel - enables checking your current maleficia. You will be shown the icons of the maleficia you own in a list, and clicking on an specific malificium will show the full picture, the name and the effect description.
- **Active invocations** are visible in the room after they're invoked - only one at a time (the last one), and if you leave the room it disappears.

### Altar room

Black marble floor, white marble walls. 2 ionic columns near a crude stone altar. Some candles behind the altar.

- **Stone altar** Click to open the altar menu, which enables checking for the current total buffs in effect, the current Sigil loadout and the Devotion per Cardinal Sin.
- **Acolytes** Once you have acolytes, they will show in the room (up to a maximum of 4, further acolytes will not be visually shown).

### Studio room

The view is as if you were sitted in the Studio chair behind the mahogany wood desk. Everything is luxurious and there's 2 windows on the left side of the screen. The familiar appears in this room for visual ownership, once invoked, as a ghostly dog sitting near the door.

- **PC / desk.** Very old pc with black screen and green text. Click on it to open, it will show 4 options: *Depraedatio*, *Decimatio*, *Indagatio*, *Emptio* and the game logs (outcomes of actions, only show the last 100). Clicking any of these will open the corresponding menu. The PC menu visual design should be very simple and light, similar to the Windows 95 interface.
- **The Suasio scroll.** Click to open the *Suasio* menu. The modal looks like an old page and the text looks inked (same modal type as the Ars Goetia in the Invocation room)
- **Window onto the world.** Cannot be clicked, only shows light entering the room. This light changes colour under certain circumstances (game states).
