# 03 — Content Catalog

Reference tables for every named entity in the game. This document is **the working surface** for content design — when systems in `02-systems-and-mechanics.md` change, this catalog should be updated first, then the systems doc rewritten if needed.

Conventions:
- This catalog describes **what each entity does**, not **by how much**. Every concrete number — costs, times, probabilities, rates, percentages, multipliers, coefficients, soul/gold amounts, thresholds, and durations — lives in the economy spreadsheet (`Panvitium_Economy_Template.xlsx`), which is the single source of truth for tuning. Effects here are stated qualitatively so the spreadsheet can be retuned without touching this document.
- `[TBD]` — description not yet defined.
- Italics — Latin terms preserved as flavour.
- Square-root binding curves are the default for sigils (see `02-systems-and-mechanics.md` §5).

---

## 1. The Eight Princes and the Cardinal Sins

| Prince | Cardinal Sin | English | Skill | Skill effect (summary) | Level effect |
|---|---|---|---|---|---|
| **Beelzebub** | *Gula* | Gluttony | Insatiability | Decreases overall Terrible and Apocalyptic outcome probabilities. | Each level increases player online action efficiency (does not affect acolytes nor invocations, does not apply when offline) multiplicatively. |
| **Asmodeus** | *Luxuria* | Lust | Seduction | Increases overall reprobate generation rate. | Each level increases the remaining unconverted reprobate percentage. Each following level enables toggling *Suasio* actions unlocked in the previous level. |
| **Mammon** | *Avaritia* | Greed | Golden Hand | Increases overall gold gain rate. | Each level increases the remaining gold percentage. |
| **Leviathan** | *Tristitia* | Sorrow / Despair | Resignation | Increases overall *Suasio* success probability (this does not mean Good outcome probability — it means overall success, raising Stellar, Excellent and Good by the same percentage) and action efficiency. | Each level increases the base reprobate suicide chance multiplicatively. |
| **Satan** | *Ira* | Wrath | Retribution | Increases overall *Decimatio* success probability and action efficiency. | Each level increases acolyte and invocation action efficiency multiplicatively. Each following level enables toggling *Decimatio* actions unlocked in the previous level. |
| **Belphegor** | *Acedia* | Sloth | Procrastination | Increases offline reprobate generation rate, offline gold gain rate and offline action efficiency. | Each level applies a compounding multiplier to offline time, growing with both the length of the offline stretch and the *Acedia* level (curve in the spreadsheet). |
| **Rosier** | *Vanagloria* | Vainglory | Acclaim | Increases maximum influence. | Each level increases influence gain rate multiplicatively. |
| **Lucifer** | *Superbia* | Pride | Morning Star | Increases overall Stellar outcome probabilities. | Each level increases the remaining maleficia chance. |

**Skills** have continuous, per-Sin intensity that rises with total Devotion to the Prince along a fixed curve (the curve shape and its divisor live in the spreadsheet `Globals`; per-Sin coefficients can override). The modifier engine couples a skill's intensity to its target via `1 + intensity` for "increase" skills and `1 / (1 + intensity)` for "decrease" skills (`02 §4`).

**Levels:** each Cardinal Sin runs from 0 to its maximum level. The cumulative Devotion cost to reach each successive level escalates per level (the base and curve live in the spreadsheet `Globals`). Reaching a level threshold grants the per-level effect above, in addition to the continuous skill intensity.

---

## 2. The Opera (action menu)

### 2.1 *Suasio* — Tempting

Three actions: *Suggestion*, *logismoi*, and *Imperium*. Some are gated by *Luxuria* level.
Action efficiency is `cost-outcome` mode (`02 §3`): it modifies *Suasio* costs and outcomes by the same percentage. Action efficiency does not affect *Suasio* action time.

Probabilities, outcomes, cost, time, and the *Luxuria* levels that unlock and toggle-unlock each action are in the economy spreadsheet.

### 2.2 *Decimatio* — Culling

Three actions: *Caedis*, *pogrom*, and *purgatio*. Some are gated by *Ira* level.
Action efficiency is `cost-outcome` mode: it modifies *Decimatio* positive outcomes (and costs by the same percentage). Action efficiency does not affect *Decimatio* action time.

Probabilities, outcomes, cost, time, and the *Ira* levels that unlock and toggle-unlock each action are in the economy spreadsheet.

### 2.3 *Depraedatio* — Exploiting

These actions are deterministic — no tier roll.

#### *Vitium Mercatura* — single-Sin businesses

Each *Vitium Mercatura* tier is a sin-themed business that produces gold passively while running, generates unconverted reprobates, and biases reprobate conversion toward the matching subtype. Higher tiers cost more, produce more, and unlock at higher Sin levels.

Building a business takes time that scales with the tier of the business.
A build action is **not** subject to player action efficiency; it does not occupy the player's action slot (`02 §3` parallelism rules). Multiple builds can be triggered concurrently and cannot be delegated to acolytes or invocations.
The outcome of a successful build is the **business itself**, which has a continuous gold output, a base reprobate generation rate, and a subtype-biased conversion rate. There is no maximum cap on the number of businesses owned. A business can be shut down with a partial recovery of the invested gold (the recovery fraction lives in the spreadsheet and is modified by sigils such as Vine #45).

Per-tier gold cost, gold output, build time, reprobate generation rate, conversion rate, and subtype bias are in the spreadsheet.

#### *Vitium Compositum* — multi-Sin events

Each *Vitium Compositum* is a multi-Sin-themed toggle that biases reprobate generation toward the matching subtypes and produces additional effects.
These events are organised by you and your acolytes; acolytes can be assigned to help run an event.
*Vitium Compositum* ticks at a fixed cadence (in the spreadsheet) and is not affected by action efficiency; instead, action efficiency multiplicatively scales the per-tick effect, cost, and outcomes. The total effective efficiency on an event is the player's contribution (if running it themselves) plus each assigned acolyte's contribution, plus any invocation contribution.

A toggle that cannot pay its full per-second cost auto-deactivates on the next tick (`02 §3`).

| Action | Sin combination | Subtypes biased & output |
|---|---|---|
| **Outrage Cycle** | *Ira* + *Vanagloria* | Cholerics + Celebrities. Costs influence and gold. Increases Choleric conversion rate. |
| **Loan Shark Op** | *Avaritia* + *Ira* | Gamblers + Cholerics. Costs influence; produces gold income. |
| **Bacchanal** | *Gula* + *Luxuria* | Gluttons + Degenerates. Costs gold and influence. Generates unconverted reprobates scaled to its matching subtype populations. |
| **Dolce Far Niente** | *Gula* + *Acedia* | Gluttons + Husks. No upkeep. Increases offline gain rate. |
| **Charity** | *Avaritia* + *Vanagloria* | Gamblers + Celebrities. Costs influence; produces high gold income. |
| **Gala** | *Superbia* + *Vanagloria* | Sigmas + Celebrities. Costs gold; produces strong influence income. |
| **Enraging broadcast** | *Ira* + *Tristitia* | Cholerics + Nihilists. Costs influence. Destroys a share of all reprobates each second. |
| **Ethnocentric revolt** | *Superbia* + *Ira* | Cholerics + Sigmas. Costs gold and influence. Increases the base Choleric murder rate. |
| **No-babies movement** | *Luxuria* + *Acedia* | Degenerates + Husks. Small gold and influence income. Decreases unconverted reprobate generation rate. |
| **Doom gathering** | *Tristitia* + *Acedia* | Nihilists + Husks. Costs gold and influence. Increases the base reprobate suicide rate. |
| **Vegas** | *Luxuria* + *Avaritia* + *Gula* + *Acedia* | Degenerates + Gamblers + Gluttons + Husks. High gold cost; high influence income. Adjusts the offsetting penalties of its matching subtypes. |
| **Crusade** | *Superbia* + *Ira* + *Vanagloria* + *Tristitia* | Cholerics + Sigmas + Celebrities + Nihilists. High influence cost; high gold income. Adjusts the offsetting penalties of its matching subtypes. |
| **Panvitium** | Explained below; very important. | Explained below; very important. |

Entries are ordered roughly by the number of Sins involved.

Sin-level gates, per-second costs, per-second outputs, effects, conversion rates and subtype biases for each *Vitium Compositum* are in the spreadsheet. To keep the spreadsheet flexible, all combinations are tracked there.

##### *Panvitium*

The action that gives the game its name. Unlocked when every Cardinal Sin reaches the required level (see spreadsheet).

- **Type:** toggle. Cannot be manually deactivated. Auto-deactivates on the next tick if its per-second cost cannot be paid (`02 §3`).
- **Cost:** gold and influence per second, both growing **exponentially** with active duration — sustained *Panvitium* burns through resources fast.
- **Effect:** The Cardinal Sins take the streets. Reprobate generation, suicide, and murder rates are enormous across the whole population; conversion applies to every subtype at once; souls are minted each second (scaled to the current soul pool); and unconverted reprobate generation gets a flat boost on top.
- **Role:** ultra-burst, late-game, **not easily maintainable for long** by design. *Panvitium* is the "endgame ritual" — flipped on for a glorious, expensive minute or two, then off (resource-driven). The exponential cost ensures it cannot become a steady-state mode.
- **The visual signature** of the game: before activating, the player gets a pop-up for confirmation; when *Panvitium* is active, the Studio's window onto the world shows the city tinted red, lit by fires, processions of the corrupted. This is the screenshot moment.

### 2.4 *Invocatio*

The summoning category. Invocations are deterministic.
Each invocation has its own invoking-power requirement and Sin-level gate, in addition to other costs (souls, influence per second, etc.). All of those requirements and costs live in the spreadsheet (`Invocatio` sheet).

All invocations are **persistent** unless their description states a specific dispel condition (e.g. Aurevora dispels at gold = 0; Erinyes is one-shot). Most invocations can be **dispelled at will** by the player; the exceptions are explicitly noted ("cannot be manually dispelled"). On Katabasis, all invocations are dispelled (`02 §7`). Apex invocations and the Familiar are limited to one active at a time.

| Invocation | Sin alignment | Effect |
|---|---|---|
| **Familiar** | — | **Maximum one active.** Generic productivity boost: lifts the player's own action efficiency and additionally runs *Indagatio* in the background (autonomous channel; `02 §3`). |
| **Upir** | *Gula* | Runs *Caedis* in the background (autonomous channel). |
| **Aurevora** | *Gula* | **Maximum one active.** Apex *Gula*. Drains gold per second at an exponentially-rising rate; in exchange, player action efficiency is raised at a similarly-rising rate. Once gold reaches 0 it is dispelled. |
| **Lamia** | *Luxuria* | Increases overall *Suasio* action efficiency. |
| **Succubus** | *Luxuria* | **Maximum one active.** Apex *Luxuria*. Multiplies overall *Suasio* action efficiency and reduces overall gold gain rate. |
| **Plutus** | *Avaritia* | Increases *Vitium Mercatura* output. |
| **Midas** | *Avaritia* | **Maximum one active.** Apex *Avaritia*. Sharply multiplies overall gold gain rate and sharply raises Apocalyptic-outcome chance across all Opera. |
| **Imp** | *Ira* | Runs *Caedis* in the background, always resolving Good outcomes (autonomous channel). |
| **Harpy** | *Ira* | Increases overall *Decimatio* action efficiency. |
| **Erinyes** | *Ira* | **Maximum one active.** Apex *Ira*. All reprobates are immediately killed. At your next Katabasis, no gold or maleficia carry over, and overall action efficiency is permanently increased. Morpheus is dispelled and cannot be invoked. |
| **Nightmare** | *Tristitia* | Increases the base reprobate suicide rate. |
| **Astiwihad** | *Tristitia* | **Maximum one active.** Apex *Tristitia*. Each second, there is a small chance that all reprobates commit suicide at once. |
| **Lemure** | *Acedia* | Increases the offline gain rate. |
| **Morpheus** | *Acedia* | **Maximum one active.** Apex *Acedia*. Full freeze: reprobates cannot be generated, converted, killed, or suicide; gold and influence gain rates and costs are nil; overall action efficiency is nil. At your next Katabasis, all gold and maleficia carry over and the *Emptio* list is preserved (the surfaced maleficia are not lost). |
| **Fama** | *Vanagloria* | Increases influence gain rate. |
| **Specunitas** | *Vanagloria* | **Maximum one active.** Apex *Vanagloria*. Sharply multiplies Celebrity conversion rate. |
| **Behemoth** | *Superbia* | Increases Stellar outcome chance across all Opera. |
| **Doppelgaenger** | *Superbia* | **Maximum one active.** Apex *Superbia*. Increases the player's own action efficiency and reduces influence gain rate. |

**Invoking power** is acquired through equipped maleficia (sum of each copy's invoking power) and through specific sigils. The Familiar's "autonomous *Indagatio* channel" is the canonical example of a hybrid invocation (boost + delegated action); see `02 §3`. Per-invocation invoking-power requirements, Sin-level gates, soul/influence costs, and contributed efficiency are in the spreadsheet.

### 2.5 *Indagatio* — Searching

Searches the world for *maleficia*. Can be run by the player or delegated to an acolyte (subject to acolyte rules — `02 §10`). Takes time and is probabilistic.

Action efficiency is `time` mode (`02 §3`): it divides the action's duration. Cost and tier probabilities are not affected.

**Stack rules** (formalising `02 §8`):

- A **non-stackable** maleficium already in inventory OR already on the *Emptio* list cannot be surfaced.
- A **stackable** maleficium for which owned + listed copies have reached its stack cap cannot be surfaced.
- A maleficium currently being purchased by an in-flight *Emptio* timer counts as **listed** for stack-rule purposes until the timer resolves.

Tier-to-rarity surfacing rule (default; modifiable by sigils such as Stolas #36 and Vassago #3):

- Stellar → anathema (falls back through profane → rare → common if no anathema candidates).
- Excellent → profane (falls back through rare → common).
- Good → rare (falls back to common).
- Neutral → common.
- Bad → false lead; time lost, nothing surfaced.
- Terrible → nothing surfaced, gold loss.
- Apocalyptic → nothing surfaced, larger gold loss.

Per-tier weights and rarity-fallback distributions are in the spreadsheet.

### 2.6 *Emptio* — Purchase

Once a maleficium is surfaced by *Indagatio*, it appears on the *Emptio* list available for purchase. The list is emptied on Katabasis (preserved if Morpheus is active at descent).

Action efficiency is `time` mode: it divides the action's duration. The gold cost paid is the targeted maleficium's cost, **not modified by efficiency**.

Per-tier outcomes (default; modifiable by sigils such as Andromalius #72 and Andras #63):

- Stellar → item acquired AND full refund (the seller is vulnerable; kill and take it free).
- Excellent → item acquired at a reduced price (partial refund).
- Neutral → item acquired at the listed price (the standard purchase).
- Terrible → a fake; gold lost, item removed from the list.
- Apocalyptic → bait; gold lost, item removed, and an additional gold bite.

Per-tier weights for *Emptio* are in the spreadsheet (tiers not listed above carry no weight in the current distribution).

---

## 3. Reprobate types

> **SUPERSEDED (ADR-024, 2026-06-07).** Reprobate subtypes and the Vitium conversion mechanic were
> removed. Reprobates are now a single undifferentiated pool: there are no subtypes, no conversion,
> and no per-subtype penalties or per-Sin Vitium-gold boost. Murder is a per-capita cull of the whole
> population; a reprobate loss simply decrements the pool. The subtype table and conversion rules
> below are retained only as historical design context — they do not describe the current engine, and
> the Vitium Mercatura / Vitium Compositum sections (§2.3) are pending a redesign that fills the gap
> the conversion dimension left.

All reprobates yield 1 soul on death. This cannot be changed — 1 person, 1 soul.
All reprobates have a small base suicide chance per second — applied population-wide, accumulated in `suicidePool` and floored on integer apply (the rate lives in the spreadsheet `Globals`). See `02 §9` for the worked example and the per-pool tick math.
When an outcome triggers a reprobate loss, the loss decrements the single reprobate pool (deaths still mint one soul each), unless the outcome explicitly says otherwise.

| Subtype | Sin | Mechanical role |
|---|---|---|
| **Reprobate** (unconverted) | — | Default corrupted human. Convertible into a subtype via further corruption (*Vitium* / *Vitium Compositum* / *Panvitium*). |
| **Glutton** | *Gula* | Increases the gold output of *Gula*-related *Vitium* actions and slows offline progression by a per-Glutton percentage. |
| **Degenerate** | *Luxuria* | Increases the gold output of *Luxuria*-related *Vitium* actions, lowers reprobate suicide rate, and lowers Choleric murder rate by a per-Degenerate percentage. |
| **Gambler** | *Avaritia* | Increases the gold output of *Avaritia*-related *Vitium* actions and lowers reprobate generation rate by a per-Gambler percentage. |
| **Nihilist** | *Tristitia* | Increases the gold output of *Tristitia*-related *Vitium* actions and increases reprobate suicide rate by a per-Nihilist percentage. |
| **Choleric** | *Ira* | Increases the gold output of *Ira*-related *Vitium* actions and increases the Choleric murder rate of all reprobate types by a per-Choleric percentage. |
| **Husk** | *Acedia* | Increases the gold output of *Acedia*-related *Vitium* actions and decreases overall online action efficiency by a per-Husk percentage. |
| **Celebrity** | *Vanagloria* | Increases the gold output of *Vanagloria*-related *Vitium* actions and decreases overall gold gain rate by a per-Celebrity percentage. |
| **Sigma** | *Superbia* | Increases the gold output of *Superbia*-related *Vitium* actions and decreases influence gain rate by a per-Sigma percentage. |

**Subtype conversion** happens through *Vitium* / *Vitium Compositum* / *Panvitium*, biased toward the subtypes of the active Vitium sources driving the conversion (each source carries its own subtype bias — `biasedSubtype()` weights subtypes by the aggregate bias of every active source, not by Cardinal Sin level).

---

## 4. Maleficia

Maleficia are equippable occult items. They:

- Are **discovered** via *Indagatio*.
- Are **purchased** via *Emptio*.
- Are **visually shown** on the Invocation Room shelf, grouped by id with stack counts for stackables.
- **Remain across lifetimes** if their remaining-maleficia roll passes at Katabasis.

**Owning a maleficium equips it.** There is no separate equip slot. The catalog entries below describe each item's intrinsic effect; if owned, the effect is active (`02 §8`).

A first inventory of named maleficia (to be expanded):

| Maleficium | Type | Effect | Rarity | Description |
|---|---|---|---|---|
| **Ars Serpens** | Enhancer, power source | Increases overall *Suasio* action efficiency multiplicatively. Grants invoking power. | Rare | Within these pages are not spells, but seeds: subtle reasonings that take root in the human heart. |
| **Ritual Dagger** | Enhancer, power source | Increases overall *Decimatio* action efficiency. Grants invoking power. | Rare | A rare hour of convergence: when offering and offerer cease to be separate. |
| **The Voynich Manuscript** | Enhancer, power source | Increases overall *Suasio* action efficiency multiplicatively (more strongly than Ars Serpens). Grants invoking power. | Profane | The real title reads "De Regno Voluntatis". |
| **Black Robe** | Power source | Grants invoking power. | Common | What separates the celebrant from the congregation is mostly fabric. |
| **Blood Chalk** | Power source | Grants invoking power. | Rare | Marks drawn with it cannot be erased, only forgotten. |
| **Sulfur Censer** | Power source | Grants invoking power. | Common | Where it has burned, prayer no longer travels upward. |
| **Obsidian Mirror** | Oracular, power source | Reveals the outcome distribution for all Opera. Grants invoking power. | Profane | It shows what the future is already weighing. |
| **Blackthorn Wand** | Power source | Grants invoking power. | Rare | Cut on a moonless night from a tree that took root over a grave. Blackthorn is a wood that holds grudges. |
| **Black Candles** | Enhancer, stackable | Each candle stacked slightly enhances the effects of all invocations. | Common | Lit not for light. |
| **Defixio** | Targeted, stackable | Single-use: continuously culls a whole random reprobate subtype; effect increases exponentially with time and ends when that subtype reaches zero. | Profane | Lead tablet inscribed in inverted Latin and folded around iron nails. Buried, it begins to remember. |
| **Hand of Glory** | Targeted, stackable | Single-use: temporarily increases the base reprobate generation rate for a fixed duration. | Rare | Severed hand of a hanged felon, dressed and candle-fitted. Mass-converts a congregation into reprobates. |
| **The Dadu** | Oracular, power source | Reveals the *Decimatio* outcome distribution. Grants invoking power. | Common | Four-sided die of human bone. |
| **Dybbuk Box** | Power source | Grants invoking power. | Rare | A good addition. |
| **Hollow Effigy** | Oracular, power source | Reveals the *Suasio* outcome distribution. Grants invoking power. | Common | The hollow is not a flaw; it is the function. |
| **Black Salt Pouch** | Power source, stackable | Grants invoking power per copy. | Common | Drawn from ash, charcoal, and graveyard earth. |
| **Spear of Longinus** | Enhancer | Greatly multiplies maximum influence. | Anathema | Just the tip. |
| **Codex Gigas** | Enhancer | Greatly multiplies influence gain rate. | Anathema | One scribe. One night. One signature in the margin no Pope has ever erased. |
| **Mark of Cain** | Enhancer | Removes Apocalyptic outcomes (their chance becomes nil). | Anathema | The sevenfold vengeance was never a curse. It was a guarantee. |
| **Thirty Pieces of Silver** | Enhancer | Greatly multiplies gold gain rate. | Anathema | Counted out, refused, returned, refused again. Coinage that always finds its way back into a hand. |
| **Solomon's Ring** | Enhancer | Increases sigil effects multiplicatively. | Anathema | An inquiry into how many seals a single signet may bear. |
| **Iron Nails** | Power source, stackable | Each copy increases sigil effects multiplicatively and grants invoking power. | Common | Rusted from coffin-lids and gallows-frames. Iron remembers what it was last used to hold. |
| **Witch Bottle** | Power source | Grants invoking power. | Common | A glass jar packed with nails, hair, and what the celebrant could not bear to keep. |
| **Crossroads Dirt** | Oracular, power source | Reveals the *Emptio* outcome distribution. Grants invoking power. | Common | Where four roads meet, no prayer holds priority. Useful for transactions that should not be witnessed. |
| **Mandrake Root** | Power source | Grants invoking power. | Common | Pulled from beneath a gallows, where the sap of the hanged still feeds the soil. Carved into the shape it most resembles. |
| **Crow Feather** | Oracular, power source | Reveals the *Indagatio* outcome distribution. Grants invoking power. | Common | A messenger carries word both ways. |

Per-item rarity weighting, gold cost, invoking-power value, stack caps, and effect magnitudes live in the spreadsheet (`Maleficia` sheet).

---

## 5. Sigils — the Goetia

Seventy-two sigils, in canonical *Lesser Key of Solomon* numbering, with Asmoday (#32, the *Luxuria* Prince Asmodeus) substituted by **Semet**. Semet is not immediately unlocked nor visible — it becomes unlocked and visible once you reach the required Cardinal-Sin level in every Sin (see §8). Semet is intentionally named for the Eternal Sin (§8 below); a player who binds Semet without yet seeing the Eternal Sin reveal is unknowingly worshipping themselves.

| # | Sigil | Demonological role | In-game effect |
|---|---|---|---|
| 1 | **Bael** | Changeling, three heads, makes invisible | Increases *Vitium* reprobate conversion rate. |
| 2 | **Agares** | Causes earthquakes; retrieval of fugitives | Higher *Indagatio* success chance. |
| 3 | **Vassago** | Foresees past and future | Higher chance of finding profane and anathema maleficia. |
| 4 | **Samigina** | Teaches arts and sciences; gives accounts of the dead in sin | Increases *Tristitia* invocation effectiveness. |
| 5 | **Marbas** | Reveals secrets | Increases online influence gain rate. |
| 6 | **Valefor** | Thievery | Increases online gold gain rate. |
| 7 | **Aamon** | Reproduction and life | Increases unconverted reprobate generation rate. |
| 8 | **Barbatos** | Understands songs of birds and animals | Increases *Gula* invocation effectiveness. |
| 9 | **Paimon** | Loyalty; returning servants | Decreases influence costs. |
| 10 | **Buer** | Bestows good familiars | Increases familiar effectiveness. |
| 11 | **Gusion** | Reveals truth, reconciles enemies | Decreases Terrible outcome chances for all Opera. |
| 12 | **Sitri** | Love | Succubi have increased effect. |
| 13 | **Beleth** | Terrible king attended by trumpets | Increases *Decimatio* successful outcome chances. |
| 14 | **Leraie** | Putrefies wounds | Choleric murders also yield a small gold bonus. |
| 15 | **Eligos** | Attracts the favour of important people | Higher chance of Celebrity conversion. |
| 16 | **Zepar** | Makes women barren | Decreases base reprobate generation rate. |
| 17 | **Botis** | Tells past and future | Reduces *Suasio* bad outcome chance. |
| 18 | **Bathin** | Transport | Increases acolyte action efficiency. |
| 19 | **Sallos** | Peace, idleness | Increases offline gold gain rate. |
| 20 | **Purson** | Hidden treasures | Increases remaining gold percentage. |
| 21 | **Marax** | Stops, delays | Increases offline action efficiency. |
| 22 | **Ipos** | Valiant, tactical | Decreases *Decimatio* bad outcome chances. |
| 23 | **Aim** | Sets fire | Increases Cholerics murder rate. |
| 24 | **Naberius** | Skilled in arts and rhetoric | Increases *Suggestion* and *Logismoi* base success rates. |
| 25 | **Glasya-Labolas** | Manslaughter | Increases Choleric murder rate of Celebrity reprobates. |
| 26 | **Bune** | Wisdom | Increases *Vanagloria* invocation effectiveness. |
| 27 | **Ronove** | Harvests souls near death | Increases Nihilists' suicide rate. |
| 28 | **Berith** | Covenant | Increases *Superbia* invocation effectiveness. |
| 29 | **Astaroth** | Reveals secrets, all times | Increases Stellar outcome chances for *Indagatio*. |
| 30 | **Forneus** | Rhetoric, beloved by foes | Increases offline influence gain rate. |
| 31 | **Foras** | Logic, ethics, herbs, invisibility | Decreases the chance of Apocalyptic outcomes. |
| 32 | **Semet** | Final destiny (foreshadowing — see §8) | Increases remaining gold percentage, remaining maleficia chance, and remaining unconverted reprobate percentage. |
| 33 | **Gaap** | Makes men stupid | Decreases Sigmas' influence gain rate penalty. |
| 34 | **Furfur** | Causes love between man and woman; terrible storms | Increases *Luxuria* invocation effectiveness. |
| 35 | **Marchosias** | Faithful follower | Increases maximum Influence. |
| 36 | **Stolas** | Astronomy, herbs and stones | Higher chance of finding rare maleficia in *Indagatio*. |
| 37 | **Phenex** | Phoenix; sings beautifully | Higher chance of Celebrity conversion. |
| 38 | **Halphas** | Builds towers, fills with weapons and men | Increases remaining maleficia chances. |
| 39 | **Malphas** | Builds and demolishes; deceives those who trust him | Decreases Celebrities' gold gain rate penalty. |
| 40 | **Raum** | Steals treasures, destroys cities | Increases overall *Decimatio* action efficiency. |
| 41 | **Focalor** | Kills by drowning | Increases Nihilist suicide rate. |
| 42 | **Vepar** | Putrefying wounds with worms | Increases *Ira* invocation effectiveness. |
| 43 | **Sabnock** | Causes wounds and sores | Increases Choleric murder rate of Glutton reprobates. |
| 44 | **Shax** | Causes deafness, blindness, dumbness; takes money | Increases *Avaritia* invocation effectiveness. |
| 45 | **Vine** | Reveals witches; builds and demolishes walls | Increases recovered gold when shutting down a business. |
| 46 | **Bifrons** | Astronomy, sciences, herbs, stones | Increases *Indagatio* action efficiency. |
| 47 | **Vual** | Earns love of women; knows all times | Decreases Degenerates' gold gain rate penalty. |
| 48 | **Haagenti** | Turns water to wine; metal to gold | Generates gold per second. |
| 49 | **Crocell** | Geometry; warms waters | Increases base reprobate suicide rate. |
| 50 | **Furcas** | Philosophy, astronomy, palmistry, pyromancy | Increases the probability for *Indagatio* to find two maleficia. |
| 51 | **Balam** | All times; makes invisible | Decreases the per-action chance of Terrible outcomes across all Opera. |
| 52 | **Alloces** | Astronomy; gives good familiars | Increases *Acedia* invocation effectiveness. |
| 53 | **Camio** | Songs of birds; disputation | Increases Choleric murder rate of Degenerate reprobates. |
| 54 | **Murmur** | Philosophy; summons dead souls | Increases overall invocation effectiveness. |
| 55 | **Orobas** | Reveals truth; divinity; all times; faithful to the conjurer | Decreases the soul cost of all invocations. |
| 56 | **Gremory** | Treasures; love of women | Decreases Degenerates' reprobate suicide chance penalty. |
| 57 | **Ose** | Changes shape | For active *Vitium Compositum*, rolls re-conversion each second from the more-numerous matching subtype toward the less-numerous matching subtype (rebalancing toward the minimum). |
| 58 | **Amy** | Astronomy; treasures | Decreases *Emptio* gold cost. |
| 59 | **Orias** | Mansions of planets; transformations | For active *Vitium Compositum*, rolls re-conversion each second from the less-numerous matching subtype toward the more-numerous matching subtype (concentrating toward the maximum). |
| 60 | **Vapula** | Mechanical arts | Increases overall *Vitium Mercatura* gold output. |
| 61 | **Zagan** | Wine to water; fools wise | Increases overall *Vitium Compositum* gold output. |
| 62 | **Volac** | Treasures; finds serpents | Decreases Gamblers' reprobate generation rate penalty. |
| 63 | **Andras** | Sows discord; kills the unwary | Increases Stellar outcome chances for *Emptio*. |
| 64 | **Haures** | Destroys enemies; distinguishes friend from foe | Increases Cholerics' murder rate of Choleric reprobate type. |
| 65 | **Andrealphus** | Mensuration; shape of birds | Increases invoking power (flat increase, rounding to closest integer). |
| 66 | **Cimejes** | Africa; lost things; treasures; valiant | Increases the remaining maleficia chance. |
| 67 | **Amdusias** | Bends trees; harsh music; voices | Increases Cholerics' murder rate of non-Choleric reprobate types. |
| 68 | **Belial** | Causes favour; distributes preferments | Increases influence gain rate. |
| 69 | **Decarabia** | Stones and herbs; takes shape of birds | Generates influence per second. |
| 70 | **Seere** | Brings things suddenly; transports | Increases overall *Emptio* action efficiency. |
| 71 | **Dantalion** | All human thoughts; declares minds | Increases overall *Suasio* action efficiency. |
| 72 | **Andromalius** | Returns stolen; discovers thieves; reveals plots | Increases *Emptio* successful outcome chances. |

### Notes on the sigil set

The default binding-to-effect curve is **√(bound souls)** (`02 §5`). Per-sigil curve overrides (linear or logarithmic) and per-sigil effect coefficients live in the spreadsheet (`Sigils` sheet). A sigil row above is not annotated for curve when it uses the default; future tuning passes that move a specific sigil to linear or log should mark it inline (e.g. *"… [linear]"*).

When a sigil unlocks a toggle or action, the toggle/action's effect rate scales with the souls bound to that sigil along the sigil's curve.

---

## 6. Acolytes

The mechanics live in `02 §10` (maximum count, recruitment, efficiency, refusal-cooldown, loss). The content-level catalog of acolyte interactions is the per-sigil and per-skill modifiers that affect acolyte efficiency or behaviour:

- **Bathin** (#18) — increases acolyte action efficiency.
- **Satan / Ira level** — each level grants additional acolyte and invocation action efficiency multiplicatively.


There is no per-acolyte specialization in the current design — every acolyte is interchangeable. A future content pass could introduce named acolytes with per-Sin affinity; not in scope for launch.

---

## 7. Achievements

A seeded list — achievements as a design surface. The exact wording, icons, and threshold tuning land closer to release; the *shape* of the achievement set lives here. Roughly fifteen, spanning early-game pacing markers, mid-game milestones, late-game capstones, and one terminal achievement.

| Achievement | Trigger |
|---|---|
| **First Stain** | Generate your first reprobate. |
| **First Harvest** | Earn your first soul. |
| **First Descent** | Complete your first Katabasis. |
| **First Bargain** | Acquire your first maleficium. |
| **The Council Convenes** | Reach the first Cardinal-Sin level in every Sin (unlocks *Vitium Compositum*). |
| **Profane Possession** | Own at least one profane maleficium. |
| **Anathema** | Own at least one anathema maleficium. |
| **Court of Spires** | Reach a high maximum influence (threshold in the spreadsheet). |
| **The Goetia, Recited** | Bind at least one soul to each of the Goetia sigils across one or more lifetimes. |
| **Single-Minded** | Reach the maximum Cardinal-Sin level in any one Sin. |
| **Eight at the Table** | Reach the Cardinal-Sin level that unlocks *Panvitium* in every Sin. |
| **The Long Burn** | Run *Panvitium* continuously for a sustained duration (threshold in the spreadsheet). |
| **Curator** | Own every maleficium currently in the catalog. |
| **The Crown of Hell** | Reach the maximum Cardinal-Sin level in every Sin. |
| **Semet** | Reveal the Eternal Sin (§8). The terminal achievement. |

Per-achievement icon design and lore-flavour text are open. Steam achievement IDs and unlock metadata land with the publish pipeline.

---

## 8. End of the game — the Eternal Sin

Once the player gets every Cardinal Sin to its maximum level, an unknown ninth Sin becomes visible above them — the **Eternal Sin**, blacked out, though souls can be offered to it.

Offering the required soul threshold (in the spreadsheet) reveals the Demon Prince's name — **Semet** — the name of the Sin itself, and the closing flavour. A black screen displays the total game runtime that the player took to fully devote to this Eternal Sin, with the Latin flavour:

> *"Iam pridem scis te perditum esse. Quiescere non potes, sed nihil agis: nihil enim venenum acerbissimum est, ornamentum gravissimum, quod cervicem premit nec umquam deponi patitur. At inter has tenebras amor eorum iustus ignem accendit, eaque sola flamma, quamvis tenuis, viam tibi monstrat."*

*Semet* means "oneself" in Latin. You are the King of All Sins.

**Foreshadowing.** Sigil #32, also named *Semet*, becomes available once every Cardinal Sin reaches the required level (see spreadsheet) — long before the reveal itself. A player binding souls to Semet at that point does not know the connection.

**Post-reveal continuation.** The reveal is a terminal milestone and a credits screen. See `01-vision-and-core-loop.md` "After the Eternal Sin". The runtime number on the reveal screen is the score, the screenshot is the trophy.

---

## 9. Open content items

Items held in reserve or unresolved. None of these block the current build; all should be tracked.

- **Reprobate-subtype achievement set** — a "convert one of each subtype" achievement would round out completionist appeal but adds a tracking surface (per-subtype "ever converted" boolean per lifetime or globally); deferred until the core systems are all in.
- **Sigil curve overrides** — currently every sigil uses the default √ curve; if a future tuning pass requires linear or log on specific sigils, annotate the per-sigil row above (`[linear]` / `[log]`).
