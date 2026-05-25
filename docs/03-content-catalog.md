# 03 — Content Catalog

Reference tables for every named entity in the game. This document is **the working surface** for content design — when systems in `02-systems-and-mechanics.md` change, this catalog should be updated first, then the systems doc rewritten if needed.

Conventions:
- `[TBD]` — value or description not yet defined; usually a number that belongs in the economy spreadsheet.
- Italics — Latin terms preserved as flavour.
- Square-root binding curves are the default for sigils (see `02-systems-and-mechanics.md` §5).

---

## 1. The Eight Princes and the Cardinal Sins

| Prince | Cardinal Sin | English | Skill | Skill effect (summary) | Level effect |
|---|---|---|---|---|
| **Beelzebub** | *Gula* | Gluttony | Insatiability | Decreases overall Terrible and Apocalyptic outcome probabilities. | Each level increases player online action efficiency (does not affect acolytes nor invocations, does not apply when offline) by 100% multiplicatively. |
| **Asmodeus** | *Luxuria* | Lust | Seduction | Increases overall reprobate generation rate. | Each level increases remaining unconverted reprobate percentage by 6.25%. Each following level enables toggling *Suasio* actions unlocked in the previous level.|
| **Mammon** | *Avaritia* | Greed | Golden Hand | Increases overall gold gain rate. | Each level increases remaining gold percentage by 6.25%. |
| **Leviathan** | *Tristitia* | Sorrow / Despair | Resignation | Increases overall *Suasio* success probability and action efficiency. | Each level increases base reprobate suicide chance by 100% multiplicatively. |
| **Satan** | *Ira* | Wrath | Retribution | Increases overall *Decimatio* success probability and action efficiency. | Each level increases acolyte and invocation action efficiency by 33% multiplicatively. Each following level enables toggling *Decimatio* actions unlocked in the previous level. |
| **Belphegor** | *Acedia* | Sloth | Procrastination | Increases offline reprobate generation rate, offline gold gain rate and offline action efficiency. | Each level applies a 1.00002^(X·L^2) multiplier to offline time calculated, where X is the number of offline minutes in a row and L is the *Acedia* level. |
| **Rosier** | *Vanagloria* | Vainglory | Acclaim | Increases maximum influence. | Each level increases influence gain rate by 50% multiplicatively. |
| **Lucifer** | *Superbia* | Pride | Morning Star | Increases overall Stellar outcome probabilities. | Each level increases remaining maleficia chance by 12.5%. |

**Skills** have incremental effects based on the amount of souls offered to the Cardinal Sin. Skill intensity is given by a per-Sin formula based on the total Devotion *x* offered to the Prince — default shape **(1 + log(x) + √x / 20) / 10** (see `02-systems-and-mechanics.md` §4; per-Sin coefficients live in the economy spreadsheet).
**Levels:** each Cardinal Sin is 0–4. Cumulative cost to reach level *X* via Devotion offering: **180^X** souls. Levels give additional effects once you cross the level-threshold.

---

## 2. The Opera (action menu)

### 2.1 *Suasio* — Tempting

Three actions: *Suasio*, *logismoi* and *Imperium*. Some gated by *Luxuria* level.
Action efficiency modifies *Suasio* costs and outcomes by the same percentage. Action efficiency does not affect *Suasio* action time.

Probabilities, outcomes, cost, time, unlocking and toggle unlocking *Luxuria* levels found in the economy spreadsheet.


### 2.2 *Decimatio* — Culling

Three actions: *Caedis*, *pogrom* and *purgatio*. Some gated by *Ira* level.
Action efficiency modifies *Decimatio* positive outcomes. Action does not affect *Decimatio* action time.

Probabilities, outcomes, cost, time, unlocking and toggle unlocking *Ira* levels found in the economy spreadsheet.


### 2.3 *Depraedatio* — Exploiting

These actions are deterministic.

#### *Vitium Mercatura* — single-Sin businesses

Each *Vitium Mercatura* tier is a sin-themed business that produces gold passively while running, generates unconverted reprobates and increases reprobate conversion chances toward the matching subtype. Higher tiers cost more, produce more, and unlock at higher Sin levels.

Building the businesses takes time, that scales with the tier of the business.
These actions are not affected by any action efficiency, multiple different business-building actions can be triggered at the same time and cannot be delegated.
The outcome of the business-building action (which costs gold, takes building time) is the actual business, which has a continuous gold output, a base reprobate generation rate and a subtype-biased reprobate conversion rate. There's no maximum cap on the number of businesses. Businesses can be shut down with a percentage recovery of the invested gold.


The tiers of businesses per Cardinal Sin, the per-tier gold cost, gold output, building time, reprobate generation rate, reprobate conversion rate and subtype-bias for the related Cardinal Sin values are in the spreadsheet.

#### *Vitium Compositum* — multi-Sin events

Each *Vitium Compositum* is a multiple-sin-themed toggle that biases reprobate generation toward the matching subtypes and has additional effects.
These events are organized by you and your acolytes, which can be assigned to help run the events.
Base tick rate for *Vitium Compositum* is 1 second and is unnafected by action efficiency, instead, action efficiency affects the outcomes, costs and effects. You give the event your action efficiency rate if taken as player-driven action, additionally each assigned acolyte gives their efficiency rate and some invocations may affect the action efficiency too with their given rate.

| Action | Sin combination and unlock requirements | Output |
|---|---|---|

| **Outrage Cycle** | *Ira* + *Vanagloria*, both ≥ 2 | Cholerics + Celebrities. Costs influence and gold. Increases Choleric conversion rate. |
| **Loan Shark Op** | *Avaritia* + *Ira*, both ≥ 2 | Gamblers + Cholerics. Costs influence, moderate gold income. |
| **Bacchanal** | *Gula* + *Luxuria*, both ≥ 2 | Gluttons + Degenerates. Gold cost, moderate unconverted reprobate generation rate increase. |
| **Dolce Far Niente** | *Gula* + *Acedia*, both ≥ 2 | Gluttons + Husks. Costs nothing. Increases offline gain rate. |
| **Charity** | *Avaritia* + *Vanagloria*, both ≥ 2 | Gamblers + Celebrities. Costs influence, high gold income. |
| **Gala** | *Superbia* + *Vanagloria*, both ≥ 2 | Sigmas + Celebrities. Gold cost, strong Influence gain per second. |
| **Enraging broadcast** | *Ira* + *Tristitia*, both ≥ 2 | Cholerics + Nihilists. Costs gold. A percentage of Nihilists self-destruct violently each second, taking other random reprobates with them. |
| **Ethnocentric revolt** | *Superbia* + *Ira*, both ≥ 2 | Cholerics + Sigmas. Increases Choleric murder rate. |
| **No-babies movement** | *Luxuria* + *Acedia*, both ≥ 2 | Degenerates + Husks. Decreases unconverted reprobate generation rate but small gain of gold and influence. |
| **Doom gathering** | *Tristitia* + *Acedia*, both ≥ 2 | Nihilists + Husks. Costs nothing. Increases reprobate suicide rate. |
| **Vegas** | *Luxuria* + *Avaritia* + *Gula*, all ≥ 3 | Degenerates + Gamblers + Gluttons. Very high gold cost, very high influence gain per second. |
| **Crusade** | *Superbia* + *Ira* + *Vanagloria*, all ≥ 3 | Cholerics + Sigmas + Celebrities. Very high influence cost, very high gold gain per second. |
| **Panvitium** | Explained below, very important. | Explained below, very important. |

Entries are ordered by gating tier.

Per-second costs (gold, influence/s),  per-second output (gold, influence), effects (e.g. unconverted reprobate generation increase), conversion rate and subtype-bias for the related Cardinal Sins values are in the spreadsheet. In order to keep the spreadsheet flexible all combinations are included there.

##### *Panvitium*

The action that gives the game its name. Unlocked when all Cardinal Sin ≥ level 3.

- **Type:** toggle. Cannot be manually deactivated.
- **Cost:** 10000 gold / s and 100 influence / s baseline. Cost grows **exponentially** with active duration — sustained *Panvitium* burns through resources fast.
- **Effect:** The Cardinal Sins take the streets. Reprobate (base + converted), suiciding and killing rates are enormous.
- **Role:** ultra-burst, late-game, **not easily maintainable for long** by design. *Panvitium* is the "endgame ritual" — flipped on for a glorious, expensive minute or two, then off. The exponential cost ensures it cannot become a steady-state mode.
- **The visual signature** of the game: before activating, the player gets a pop-up for confirmation; when *Panvitium* is active, the Studio's window onto the world shows the city tinted red, lit by fires, processions of the corrupted. This is the screenshot moment.

### 2.4 *Invocatio*

The summoning category. Invocations are deterministic.
Each invocation has its own invoking power and Sin-level gates in addition to other costs (souls, influence per second...).

All invocations are **persistent** and cannot be manually dispelled. When the player goes through Katabasis, all invocations are dispelled.

| Invocation | Sin alignment | Invoking power requirement | Sin-level requirement | Cost | Effect |
|---|---|---|---|---|---|
| **Familiar** | — | ≥ 3 | — | No cost. | **Maximum 1 active.** Generic productivity boost: multiplicatively +33 % to the player's own action efficiency, plus runs *Indagatio* in the background at 5 % of the player's efficiency. |
| **Upir** | *Gula* | ≥ 3 | *Gula* 1 | 10% current souls, minimum 100. | Each Upir kills 1 reprobate every 30 s. |
| **Aurevora** | *Gula* | ≥ 10 | *Gula* 3 | No cost | **Maximum 1 active.** Apex *Gula*. Eats gold per second at an exponentially-rising rate; in exchange, player action efficiency is multiplied by a similarly-rising factor. Once gold reaches 0 it is dispelled. |
| **Lamia** | *Luxuria* | ≥ 8 | *Luxuria* 2 | 25% current souls, minimum 1500.| Increases successful outcome chances for *Suasio* actions and unconverted reprobate generation rate. |
| **Succubus** | *Luxuria* | ≥ 12 | *Luxuria* 3 | No cost | **Maximum 1 active.** Apex *Luxuria*. Dramatically multiplies the unconverted reprobate generation rate. Your gold generation rate is reduced to 1% of total. |
| **Plutus** | *Avaritia* | ≥ 8 | *Avaritia* 2 | 25% current souls, minimum 1500. | Increases *Vitium Mercatura* output by a flat factor. |
| **Midas** | *Avaritia* | ≥ 11 | *Avaritia* 3 | No cost. | **Maximum 1 active.** Apex *Avaritia*. Multiplies overall gold gain rate threefold and Apocalyptic-outcome chance for any Opera hundredfold. |
| **Imp** | *Ira* | ≥ 4 | *Ira* 1 | 10% current souls, minimum 100. | Runs *Caedis* with Good outcomes at 10% of the player's efficiency. |
| **Harpy** | *Ira* | ≥ 7 | *Ira* 2 | 25% current souls, minimum 1500. | Increases Choleric murder rate by 10% multiplicatively. |
| **Erinyes** | *Ira* | ≥ 17 | *Ira* 3 | No cost. | **Maximum 1 active.** Apex *Ira*. All reprobates are immediately killed. When triggering your next Katabasis, remaining gold percentage is 0%, remaining maleficia chances are 0% and overall action efficiency is permanently doubled. Morpheus is dispelled and cannot be invoked. |
| **Nightmare** | *Tristitia* | ≥ 6 | *Tristitia* 1 | 10% current souls, minimum 100. | Each Nightmare increases base reprobate suicide rate by a small additive percentage. |
| **Astiwihad** | *Tristitia* | ≥ 15 | *Tristitia* 3 | No cost. | **Maximum 1 active.** Apex *Tristitia*. Each second there's a 0.01% chance all reprobates commit suicide. |
| **Lemure** | *Acedia* | ≥ 7 | *Acedia* 1 | 10% current souls, minimum 100. | Increases influence gain per second by a small per-Husk flat number. |
| **Morpheus** | *Acedia* | ≥ 14 | *Acedia* 3 | 66% current souls and gold. | **Maximum 1 active.** Apex *Acedia*. Reprobates cannot be generated, converted, they cannot be killed and they cannot suicide, gold and influence gain rates and costs are 0, overall action efficiency is 0, when triggering your next Katabasis, remaining gold percentage is 100%, remaining maleficia chances are 100% and *Emptio* list is maintained (meaning the found maleficia are not lost). |
| **Fama** | *Vanagloria* | ≥ 7 | *Vanagloria* 1 | 10% current souls, minimum 100. | Increases influence gain rate. |
| **Specunitas** | *Vanagloria* | ≥ 13 | *Vanagloria* 3 | No cost. | **Maximum 1 active.** Apex *Vanagloria*. Celebrity conversion rate is multiplied hundredfold. |
| **Behemoth** | *Superbia* | ≥ 3 | *Superbia* 1 | 10% current souls, minimum 100. | Increases gold cost and Stellar outcome chances across all Opera. |
| **Doppelgaenger** | *Superbia* | ≥ 12 | *Superbia* 3 | No cost. | **Maximum 1 active.** Apex *Superbia*. Multiplicatively +50 % to the player's own action efficiency. Halves your influence gain rate. |

**Invoking power** is acquired through some maleficia and through specific sigils.

---


### 2.5 *Indagatio* — Searching

Searches the world for *maleficia*, can be done by the player or acolytes, takes time and is probabilistic.

Important: non-stackable maleficia already in possession, non-stackable maleficia listed in *Emptio* and stackable maleficia for which the sum of owned by the player + listed in *Emptio* is the maximum stack number cannot be found via *Indagatio*.

Modified by some sigils.

Values can be found in the economy spreadsheet.

### 2.6 *Emptio* — Purchase

Once a maleficium is surfaced by *Indagatio*, the player may find it in the *Emptio* list, available for purchase. This list is emptied on Katabasis (unless active Morpheus).
Action efficiency does not modify *Emptio* positive outcomes. Action efficiency decreases *Emptio* action time.

The purchase is itself probabilistic. Values can be found in the economy spreadsheet.

Modified by some sigils.

---

## 3. Reprobate types

All reprobates yield 1 soul on death. This cannot be changed - 1 person, 1 soul.
Reprobates converted to a Cardinal Sin cannot be converted to another Cardinal Sin, except by the explicit effect of a sigil, maleficia or opus.
All reprobates have a 0.023 % base suicide chance per second - this does not apply on a per-reprobate basis but on the whole population, meaning 0.023% of your total converted and unconverted reprobates suicide each second, rounding to the closest lower integer.
When an outcome triggers a reprobate loss, this loss happens across any type of reprobate subtypes (including base) chosen randomly, it does not only affect a single subtype unless specified by the outcome itself.

| Subtype | Sin | Mechanical role |
|---|---|---|
| **Reprobate** (unconverted) | — | Default corrupted human. Convertible into a subtype via further corruption (*Vitium* / *Vitium Compositum* / *Panvitium*). |
| **Glutton** | *Gula* | Increases the gold output of *Gula*-related *Vitium* actions and slows offline progression by a per-Glutton percentage. |
| **Degenerate** | *Luxuria* | Increases the gold output of *Luxuria*-related *Vitium* actions, lowers reprobate suicide rate and lowers Choleric murder rate by a per-Degenerate percentage. |
| **Gambler** | *Avaritia* | Increases the gold output of *Avaritia*-related *Vitium* actions and lowers reprobate generation rate by a per-Gambler percentage. |
| **Nihilist** | *Tristitia* | Increases the gold output of *Tristitia*-related *Vitium* actions and increases reprobate suicide rate by a per-Nihilist percentage. |
| **Choleric** | *Ira* | Increases the gold output of *Ira*-related *Vitium* actions and increases Choleric murder rate of all reprobate types by a per-Choleric percentage. |
| **Husk** | *Acedia* | Increases the gold output of *Acedia*-related *Vitium* actions and decreases overall online action efficiency by a per-Husk percentage. |
| **Celebrity** | *Vanagloria* | Increases the gold output of *Vanagloria*-related *Vitium* actions and decreases overall gold gain rate by a per-Celebrity percentage. |
| **Sigma** | *Superbia* | Increases the gold output of *Superbia*-related *Vitium* actions and decreases influence gain rate by a per-Sigma percentage. |

**Subtype conversion** happens through *Vitium* / *Vitium Compositum* / *Panvitium*, biased by Cardinal Sin levels.

---

## 4. Maleficia

Maleficia are equippable occult items. They:

- Are **discovered** via *Indagatio*.
- Are **purchased** via *Emptio*.
- Are **visually shown** in the Invocation Room shelf.
- **Remain across lifetimes** if the remaining maleficia roll is passed.

A first inventory of named maleficia (to be expanded):

| Maleficium | Type | Effect | Rarity | Description |
|---|---|---|---|---|
| **Ars Serpens** | Enhancer, power source | Increases overall *Suasio* action efficiency by 33% multiplicatively. Grants 2 invoking power. | Rare | Within these pages are not spells, but seeds: subtle reasonings that take root in the human heart. |
| **Ritual Dagger** | Enhancer, power source | Increases overall *Decimatio* action efficiency by 33%. Grants 2 invoking power. | Rare | A rare hour of convergence: when offering and offerer cease to be separate. |
| **The Voynich Manuscript** | Enhancer, power source | Increases overall *Suasio* action efficiency by 66% multiplicatively. Grants 6 invoking power. | Profane | The real title reads "De Regno Voluntatis". |
| **Black Robe** | Power source | Grants 1 invoking power. | Common | What separates the celebrant from the congregation is mostly fabric. |
| **Blood Chalk** | Power source | Grants 4 invoking power. | Rare | Marks drawn with it cannot be erased, only forgotten. |
| **Sulfur Censer** | Power source | Grants 2 invoking power. | Common | Where it has burned, prayer no longer travels upward. |
| **Obsidian Mirror** | Oracular, power source | Reveals outcome distribution for all Opera, grants 8 invoking power. | Profane | It shows what the future is already weighing. |
| **Blackthorn Wand** | Power source | Grants 4 invoking power. | Rare | Cut on a moonless night from a tree that took root over a grave. Blackthorn is a wood that holds grudges. |
| **Black Candles** | Enhancer, stackable up to 5 | Each candle stacked enhances the effects of all invocations slightly (5 %). | Common | Lit not for light. |
| **Defixio** | Targeted, stackable | Single-use: continuously culls a whole random reprobate type, effect increases exponentially with time and ends when reaching 0 reprobates of that type. | Profane | Lead tablet inscribed in inverted Latin and folded around iron nails. Buried, it begins to remember. |
| **Hand of Glory** | Targeted, stackable | Single-use: increases basic reprobate generation rate by 100% for 1 hour. | Rare | Severed hand of a hanged felon, dressed and candle-fitted. Mass-converts a congregation into reprobates. |
| **The Dadu** | Oracular, power source | Reveals *Decimatio* outcome distribution. Grants 1 invoking power. | Common | Four-sided die of human bone. |
| **Dybbuk Box** | Power source | Grants 3 invoking power. | Rare | A good addition. |
| **Hollow Effigy** | Oracular, power source | Reveals *Suasio* outcome distribution. Grants 1 invoking power. | Common | The hollow is not a flaw; it is the function. |
| **Black Salt Pouch** | Power source, stackable | Grants 1 invoking power. | Common | Drawn from ash, charcoal, and graveyard earth. |
| **Spear of Longinus** | Enhancer | Triples maximum influence. | Anathema | Just the tip. |
| **Codex Gigas** | Enhancer | Triples influence gain rate. | Anathema | One scribe. One night. One signature in the margin no Pope has ever erased. |
| **Mark of Cain** | Enhancer | Apocalyptic outcome chances are 0. | Anathema | The sevenfold vengeance was never a curse. It was a guarantee. |
| **Thirty Pieces of Silver** | Enhancer | Triples gold gain rate. | Anathema | Counted out, refused, returned, refused again. Coinage that always finds its way back into a hand. |
| **Solomon's Ring** | Enhancer | Increases sigil effects by 50% multiplicatively. | Anathema | An inquiry into how many seals a single signet may bear. |
| **Iron Nails** | Power source, stackable | Increases sigil effects by 1% multiplicatively. Grants 1 invoking power. | Common | Rusted from coffin-lids and gallows-frames. Iron remembers what it was last used to hold. |
| **Witch Bottle** | Power source | Grants 2 invoking power. | Common | A glass jar packed with nails, hair, and what the celebrant could not bear to keep. |
| **Crossroads Dirt** | Oracular, power source | Reveals *Emptio* outcome distribution. Grants 1 invoking power. | Common | Where four roads meet, no prayer holds priority. Useful for transactions that should not be witnessed. |
| **Mandrake Root** | Power source | Grants 2 invoking power. | Common | Pulled from beneath a gallows, where the sap of the hanged still feeds the soil. Carved into the shape it most resembles. |
| **Crow Feather** | Oracular,power source | Reveals *Indagatio* outcome distribution. Grants 1 invoking power. | Common | A messenger carries word both ways. |

---

## 6. Sigils — the Goetia

Seventy-two sigils, in canonical *Lesser Key of Solomon* numbering, with Asmoday (#32, the *Luxuria* Prince Asmodeus) substituted by Semet. Semet will not be immediately unlocked nor visible, it will become unlocked and visible once you get all Cardinal Sin levels to ≥ 2.

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
| 17 | **Botis** | Tells past and future | Reduces Suasio bad outcome chance |
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
| 32 | **Semet** | Final destiny (this is foreshadowing of what's to come, it shows you're climbing up the Hierarchy already) | Increases remaining gold percentage, remaining maleficia chance and remaining unconverted reprobate percentage. |
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
| 50 | **Furcas** | Philosophy, astronomy, palmistry, pyromancy | Increases probability for *Indagatio* to find 2 maleficia. |
| 51 | **Balam** | All times; makes invisible | Decreases the per-action chance of Terrible outcomes across all Opera. |
| 52 | **Alloces** | Astronomy; gives good familiars | Increases *Acedia* invocation effectiveness. |
| 53 | **Camio** | Songs of birds; disputation | Increases Choleric murder rate of Degenerate reprobates. |
| 54 | **Murmur** | Philosophy; summons dead souls | Increases overall invocation effectiveness. |
| 55 | **Orobas** | Reveals truth; divinity; all times; faithful to the conjurer | Decreases the soul cost of all invocations. |
| 56 | **Gremory** | Treasures; love of women | Decreases Degenerates' reprobate suicide chance penalty rate. |
| 57 | **Ose** | Changes shape | Increases percentage of reprobate subtype re-rolling for the related reprobate subtypes from the minimum to the maximum based on the number of current reprobates for *Vitium Compositum*. (Example: having Outrage Cycle active converts each second the specific percentage of Cholerics to Celebrities (if there are less Cholerics) or Celebrities to Cholerics (if ther are less Celebrities). |
| 58 | **Amy** | Astronomy; treasures | Decreases *Emptio* gold cost. |
| 59 | **Orias** | Mansions of planets; transformations | Increases percentage of reprobate subtype re-rolling for the related reprobate subtypes from the maximum to the minimum based on the number of current reprobates for *Vitium Compositum*. (Example: having Outrage Cycle active converts each second the specific percentage of Cholerics to Celebrities (if there are more Cholerics) or Celebrities to Cholerics (if ther are more Celebrities). |
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

The default binding-curve is **√(bound souls)**. Where another curve is intended, it is flagged in the row.

When the sigils unlock a toggle or action, the toggle or action effect rate is affected by the number of souls bound to the sigil.

---

## 7. Acolytes

These are your followers. Your number of acolytes is based on your maximum influence. They run delegated actions at a flat efficiency percentage, which can be further modified by sigils, maleficia, invocations and Cardinal Sin Levels.  |

---

## 8. Achievements

None defined for the moment.

---

## 9. End of the game

Once the player gets all eight Cardinal Sins to Level 4, an unknown one becomes visible above them, the **"Eternal Sin"**, blacked out even though souls can now be offered to it.
Offering it 8398080000 souls reveals the Demon Prince's name — **Semet** — the name of the Sin itself, and the flavour text. Once this is done, a black screen will show in white text the total game run time that took the player to get to fully devote to this Eternal Sin, and the following flavour text:

*"Iam pridem scis te perditum esse. Quiescere non potes, sed nihil agis: nihil enim venenum acerbissimum est, ornamentum gravissimum, quod cervicem premit nec umquam deponi patitur. At inter has tenebras amor eorum iustus ignem accendit, eaque sola flamma, quamvis tenuis, viam tibi monstrat."*

Semet means "oneself" in Latin. You're the King of All Sins.

---

## 10. Unused stuff that could be interesting

Ideas held in reserve for future passes — not currently assigned to any system entry.
