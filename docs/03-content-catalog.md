# 03 — Content Catalog

Reference tables for every named entity in the game. This document is **the working surface** for content design — when systems in `02-systems-and-mechanics.md` change, this catalog should be updated first, then the systems doc rewritten if needed.

Conventions:
- `[TBD]` — value or description not yet defined; usually a number that belongs in the economy spreadsheet.
- Italics — Latin terms preserved as flavour.
- Square-root binding curves are the default for sigils (see `02-systems-and-mechanics.md` §5).

---

## 1. The Eight Princes and the Cardinal Sins

| Prince | Cardinal Sin | English | Skill | Skill effect (summary) | Level effect |
|---|---|---|---|---|---|
| **Beelzebub** | *Gula* | Gluttony | Insatiability | Decreases overall Terrible and Apocalyptic outcome probabilities. | Each level increases player online action efficiency (does not affect acolytes nor invocations, does not apply when offline) by 100% multiplicatively. |
| **Asmodeus** | *Luxuria* | Lust | Seduction | Increases overall reprobate generation rate. | Each level increases remaining unconverted reprobate percentage by 6.25%. Each following level enables toggling *Suasio* actions unlocked in the previous level. |
| **Mammon** | *Avaritia* | Greed | Golden Hand | Increases overall gold gain rate. | Each level increases remaining gold percentage by 6.25%. |
| **Leviathan** | *Tristitia* | Sorrow / Despair | Resignation | Increases overall *Suasio* success probability (this does not mean Good outcome probability - this means overall success as in increases Stellar, Excellent and Good by the same percentage) and action efficiency. | Each level increases base reprobate suicide chance by 100% multiplicatively. |
| **Satan** | *Ira* | Wrath | Retribution | Increases overall *Decimatio* success probability and action efficiency. | Each level increases acolyte and invocation action efficiency by 33% multiplicatively. Each following level enables toggling *Decimatio* actions unlocked in the previous level. |
| **Belphegor** | *Acedia* | Sloth | Procrastination | Increases offline reprobate generation rate, offline gold gain rate and offline action efficiency. | Each level applies a 1.00002^(X·L²) multiplier to offline time calculated, where X is the number of offline minutes in a row and L is the *Acedia* level. |
| **Rosier** | *Vanagloria* | Vainglory | Acclaim | Increases maximum influence. | Each level increases influence gain rate by 50% multiplicatively. |
| **Lucifer** | *Superbia* | Pride | Morning Star | Increases overall Stellar outcome probabilities. | Each level increases remaining maleficia chance by 12.5%. |

**Skills** have continuous, per-Sin intensity computed from total Devotion to the Prince, default shape `intensity(x) = ln(x)² / SKILL_INTENSITY_DIVISOR` (the divisor lives in the spreadsheet `Globals`; per-Sin coefficients can override). The modifier engine couples a skill's intensity to its target via `1 + intensity` for "increase" skills and `1 / (1 + intensity)` for "decrease" skills (`02 §4`).

**Levels:** each Cardinal Sin is 0–4. Cumulative cost to reach level *X* via Devotion offering: **180^X** souls (X cumulative, so level 4 costs 180⁴ = 1,049,760,000 souls). Reaching a level threshold grants the per-level effect above, in addition to the continuous skill intensity.

---

## 2. The Opera (action menu)

### 2.1 *Suasio* — Tempting

Three actions: *Suggestion*, *logismoi*, and *Imperium*. Some are gated by *Luxuria* level.
Action efficiency is `cost-outcome` mode (`02 §3`): it modifies *Suasio* costs and outcomes by the same percentage. Action efficiency does not affect *Suasio* action time.

Probabilities, outcomes, cost, time, unlocking and toggle-unlocking *Luxuria* levels are in the economy spreadsheet.

### 2.2 *Decimatio* — Culling

Three actions: *Caedis*, *pogrom*, and *purgatio*. Some are gated by *Ira* level.
Action efficiency is `cost-outcome` mode: it modifies *Decimatio* positive outcomes (and costs by the same percentage). Action efficiency does not affect *Decimatio* action time.

Probabilities, outcomes, cost, time, unlocking and toggle-unlocking *Ira* levels are in the economy spreadsheet.

### 2.3 *Depraedatio* — Exploiting

These actions are deterministic — no tier roll.

#### *Vitium Mercatura* — single-Sin businesses

Each *Vitium Mercatura* tier is a sin-themed business that produces gold passively while running, generates unconverted reprobates, and biases reprobate conversion toward the matching subtype. Higher tiers cost more, produce more, and unlock at higher Sin levels.

Building a business takes time that scales with the tier of the business.
A build action is **not** subject to player action efficiency; it does not occupy the player's action slot (`02 §3` parallelism rules). Multiple builds can be triggered concurrently and cannot be delegated to acolytes or invocations.
The outcome of a successful build is the **business itself**, which has a continuous gold output, a base reprobate generation rate, and a subtype-biased conversion rate. There is no maximum cap on the number of businesses owned. A business can be shut down with a partial recovery of the invested gold (default 50%, modified by sigils such as Vine #45; spreadsheet overrides the default).

Per-tier gold cost, gold output, build time, reprobate generation rate, conversion rate, and subtype bias are in the spreadsheet.

#### *Vitium Compositum* — multi-Sin events

Each *Vitium Compositum* is a multi-Sin-themed toggle that biases reprobate generation toward the matching subtypes and produces additional effects.
These events are organised by you and your acolytes; acolytes can be assigned to help run an event.
The base tick rate for *Vitium Compositum* is **1 second** and is not affected by action efficiency; instead, action efficiency multiplicatively scales the per-tick effect, cost, and outcomes. The total effective efficiency on an event is the player's contribution (if running it themselves) plus each assigned acolyte's contribution, plus any invocation contribution.

A toggle that cannot pay its full per-second cost auto-deactivates on the next tick (`02 §3`).

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
| **Panvitium** | Explained below; very important. | Explained below; very important. |

Entries are ordered by gating tier.

Per-second costs, per-second outputs, effects, conversion rates and subtype biases for each *Vitium Compositum* are in the spreadsheet. To keep the spreadsheet flexible, all combinations are tracked there.

##### *Panvitium*

The action that gives the game its name. Unlocked when all Cardinal Sins ≥ level 3.

- **Type:** toggle. Cannot be manually deactivated. Auto-deactivates on the next tick if its per-second cost cannot be paid (`02 §3`).
- **Cost:** 10000 gold/s and 100 influence/s baseline. Cost grows **exponentially** with active duration — sustained *Panvitium* burns through resources fast.
- **Effect:** The Cardinal Sins take the streets. Reprobate (base + converted), suiciding and killing rates are enormous.
- **Role:** ultra-burst, late-game, **not easily maintainable for long** by design. *Panvitium* is the "endgame ritual" — flipped on for a glorious, expensive minute or two, then off (resource-driven). The exponential cost ensures it cannot become a steady-state mode.
- **The visual signature** of the game: before activating, the player gets a pop-up for confirmation; when *Panvitium* is active, the Studio's window onto the world shows the city tinted red, lit by fires, processions of the corrupted. This is the screenshot moment.

### 2.4 *Invocatio*

The summoning category. Invocations are deterministic.
Each invocation has its own invoking-power requirement and Sin-level gates, in addition to other costs (souls, influence per second, etc.).

All invocations are **persistent** unless their description states a specific dispel condition (e.g. Aurevora dispels at gold = 0; Erinyes is one-shot). Most invocations can be **dispelled at will** by the player; the exceptions are explicitly noted ("cannot be manually dispelled"). On Katabasis, all invocations are dispelled (`02 §7`).

| Invocation | Sin alignment | Invoking power requirement | Sin-level requirement | Cost | Effect |
|---|---|---|---|---|---|
| **Familiar** | — | ≥ 3 | — | No cost. | **Maximum 1 active.** Generic productivity boost: multiplicatively +33 % to the player's own action efficiency, plus runs *Indagatio* in the background at 5 % of the player's efficiency (autonomous channel; `02 §3`). |
| **Upir** | *Gula* | ≥ 3 | *Gula* 1 | 10 % current souls, minimum 100. | Each Upir kills 1 reprobate every 30 s. |
| **Aurevora** | *Gula* | ≥ 10 | *Gula* 3 | No cost. | **Maximum 1 active.** Apex *Gula*. Eats gold per second at an exponentially-rising rate; in exchange, player action efficiency is multiplied by a similarly-rising factor. Once gold reaches 0 it is dispelled. |
| **Lamia** | *Luxuria* | ≥ 8 | *Luxuria* 2 | 25 % current souls, minimum 1500. | Increases successful outcome chances for *Suasio* actions and unconverted reprobate generation rate. |
| **Succubus** | *Luxuria* | ≥ 12 | *Luxuria* 3 | No cost. | **Maximum 1 active.** Apex *Luxuria*. Dramatically multiplies the unconverted reprobate generation rate. Your gold generation rate is reduced to 1 % of total. |
| **Plutus** | *Avaritia* | ≥ 8 | *Avaritia* 2 | 25 % current souls, minimum 1500. | Increases *Vitium Mercatura* output by a flat factor. |
| **Midas** | *Avaritia* | ≥ 11 | *Avaritia* 3 | No cost. | **Maximum 1 active.** Apex *Avaritia*. Multiplies overall gold gain rate threefold and Apocalyptic-outcome chance for any Opera hundredfold. |
| **Imp** | *Ira* | ≥ 4 | *Ira* 1 | 10 % current souls, minimum 100. | Runs *Caedis* with Good outcomes at 10 % of the player's efficiency (autonomous channel). |
| **Harpy** | *Ira* | ≥ 7 | *Ira* 2 | 25 % current souls, minimum 1500. | Increases Choleric murder rate by 10 % multiplicatively. |
| **Erinyes** | *Ira* | ≥ 17 | *Ira* 3 | No cost. | **Maximum 1 active.** Apex *Ira*. All reprobates are immediately killed. When triggering your next Katabasis, remaining gold percentage is 0 %, remaining maleficia chances are 0 %, and overall action efficiency is permanently doubled. Morpheus is dispelled and cannot be invoked. |
| **Nightmare** | *Tristitia* | ≥ 6 | *Tristitia* 1 | 10 % current souls, minimum 100. | Each Nightmare increases base reprobate suicide rate by a small additive percentage. |
| **Astiwihad** | *Tristitia* | ≥ 15 | *Tristitia* 3 | No cost. | **Maximum 1 active.** Apex *Tristitia*. Each second there's a 0.01 % chance all reprobates commit suicide. |
| **Lemure** | *Acedia* | ≥ 7 | *Acedia* 1 | 10 % current souls, minimum 100. | Increases influence gain per second by a small per-Husk flat number. |
| **Morpheus** | *Acedia* | ≥ 14 | *Acedia* 3 | 66 % current souls and gold. | **Maximum 1 active.** Apex *Acedia*. Reprobates cannot be generated, converted, killed, or suicide; gold and influence gain rates and costs are 0; overall action efficiency is 0. When triggering your next Katabasis, remaining gold percentage is 100 %, remaining maleficia chances are 100 %, and the *Emptio* list is preserved (the maleficia surfaced are not lost). |
| **Fama** | *Vanagloria* | ≥ 7 | *Vanagloria* 1 | 10 % current souls, minimum 100. | Increases influence gain rate. |
| **Specunitas** | *Vanagloria* | ≥ 13 | *Vanagloria* 3 | No cost. | **Maximum 1 active.** Apex *Vanagloria*. Celebrity conversion rate is multiplied hundredfold. |
| **Behemoth** | *Superbia* | ≥ 3 | *Superbia* 1 | 10 % current souls, minimum 100. | Increases gold cost and Stellar outcome chances across all Opera. |
| **Doppelgaenger** | *Superbia* | ≥ 12 | *Superbia* 3 | No cost. | **Maximum 1 active.** Apex *Superbia*. Multiplicatively +50 % to the player's own action efficiency. Halves your influence gain rate. |

**Invoking power** is acquired through equipped maleficia (sum of `invokingPower` per copy) and through specific sigils. The Familiar's "autonomous *Indagatio* channel" is the canonical example of a hybrid invocation (boost + delegated action); see `02 §3`.

### 2.5 *Indagatio* — Searching

Searches the world for *maleficia*. Can be run by the player or delegated to an acolyte (subject to acolyte rules — `02 §10`). Takes time and is probabilistic.

Action efficiency is `time` mode (`02 §3`): it divides the action's duration. Cost and tier probabilities are not affected.

**Stack rules** (formalising `02 §8`):

- A **non-stackable** maleficium already in inventory OR already on the *Emptio* list cannot be surfaced.
- A **stackable** maleficium for which `owned + listed ≥ stackMax` cannot be surfaced.
- A maleficium currently being purchased by an in-flight *Emptio* timer counts as **listed** for stack-rule purposes until the timer resolves.

Tier-to-rarity surfacing rule (default; modifiable by sigils such as Stolas #36 and Vassago #3):

- Stellar → anathema (falls back through profane → rare → common if no anathema candidates).
- Excellent → profane (falls back through rare → common).
- Good → common.
- Neutral / Bad → nothing surfaced.
- Terrible → nothing surfaced, gold loss.
- Apocalyptic → nothing surfaced, larger gold loss.

Per-tier exact weights and rarity-fallback distributions are in the spreadsheet.

### 2.6 *Emptio* — Purchase

Once a maleficium is surfaced by *Indagatio*, it appears on the *Emptio* list available for purchase. The list is emptied on Katabasis (preserved if Morpheus is active at descent).

Action efficiency is `time` mode: it divides the action's duration. The gold cost paid is the targeted maleficium's `cost`, **not modified by efficiency**.

Per-tier outcomes (default; modifiable by sigils such as Andromalius #72 and Andras #63):

- Stellar → item acquired AND full refund (a steal).
- Excellent → item acquired with half-cost refund.
- Good → item acquired, cost as paid.
- Neutral → deal falls through, full refund, item stays on the list.
- Bad → gold lost (cost was already paid), item stays on the list.
- Terrible → gold lost, item removed from the list.
- Apocalyptic → gold lost, item removed, additional gold bite.

Per-tier weights for *Emptio* are in the spreadsheet.

---

## 3. Reprobate types

All reprobates yield 1 soul on death. This cannot be changed — 1 person, 1 soul.
Reprobates converted to a Cardinal Sin cannot be converted to another Cardinal Sin, except by the explicit effect of a sigil, maleficium, or opus (Ose #57, Orias #59).
All reprobates have a 0.023 % base suicide chance per second — applied population-wide (i.e. `population × 0.00023 × deltaSeconds` fractional kills per tick, accumulated in `suicidePool`, floored on integer apply). See `02 §9` for the worked example and the per-pool tick math.
When an outcome triggers a reprobate loss, the loss draws across all reprobate subtypes (including unconverted) chosen randomly from the seeded RNG, unless the outcome explicitly restricts the subtype.

| Subtype | Sin | Mechanical role |
|---|---|---|
| **Reprobate** (unconverted) | — | Default corrupted human. Convertible into a subtype via further corruption (*Vitium* / *Vitium Compositum* / *Panvitium*). |
| **Glutton** | *Gula* | Increases the gold output of *Gula*-related *Vitium* actions and slows offline progression by a per-Glutton percentage. |
| **Degenerate** | *Luxuria* | Increases the gold output of *Luxuria*-related *Vitium* actions, lowers reprobate suicide rate, and lowers Choleric murder rate by a per-Degenerate percentage. |
| **Gambler** | *Avaritia* | Increases the gold output of *Avaritia*-related *Vitium* actions and lowers reprobate generation rate by a per-Gambler percentage. |
| **Nihilist** | *Tristitia* | Increases the gold output of *Tristitia*-related *Vitium* actions and increases reprobate suicide rate by a per-Nihilist percentage. |
| **Choleric** | *Ira* | Increases the gold output of *Ira*-related *Vitium* actions and increases Choleric murder rate of all reprobate types by a per-Choleric percentage. |
| **Husk** | *Acedia* | Increases the gold output of *Acedia*-related *Vitium* actions and decreases overall online action efficiency by a per-Husk percentage. |
| **Celebrity** | *Vanagloria* | Increases the gold output of *Vanagloria*-related *Vitium* actions and decreases overall gold gain rate by a per-Celebrity percentage. |
| **Sigma** | *Superbia* | Increases the gold output of *Superbia*-related *Vitium* actions and decreases influence gain rate by a per-Sigma percentage. |

**Subtype conversion** happens through *Vitium* / *Vitium Compositum* / *Panvitium*, biased by Cardinal Sin levels (`biasedSubtype()` — weights subtypes by their Sin's level).

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
| **Ars Serpens** | Enhancer, power source | Increases overall *Suasio* action efficiency by 33% multiplicatively. Grants 2 invoking power. | Rare | Within these pages are not spells, but seeds: subtle reasonings that take root in the human heart. |
| **Ritual Dagger** | Enhancer, power source | Increases overall *Decimatio* action efficiency by 33%. Grants 2 invoking power. | Rare | A rare hour of convergence: when offering and offerer cease to be separate. |
| **The Voynich Manuscript** | Enhancer, power source | Increases overall *Suasio* action efficiency by 66% multiplicatively. Grants 6 invoking power. | Profane | The real title reads "De Regno Voluntatis". |
| **Black Robe** | Power source | Grants 1 invoking power. | Common | What separates the celebrant from the congregation is mostly fabric. |
| **Blood Chalk** | Power source | Grants 4 invoking power. | Rare | Marks drawn with it cannot be erased, only forgotten. |
| **Sulfur Censer** | Power source | Grants 2 invoking power. | Common | Where it has burned, prayer no longer travels upward. |
| **Obsidian Mirror** | Oracular, power source | Reveals outcome distribution for all Opera. Grants 8 invoking power. | Profane | It shows what the future is already weighing. |
| **Blackthorn Wand** | Power source | Grants 4 invoking power. | Rare | Cut on a moonless night from a tree that took root over a grave. Blackthorn is a wood that holds grudges. |
| **Black Candles** | Enhancer, stackable up to 5 | Each candle stacked enhances the effects of all invocations slightly (5 %). | Common | Lit not for light. |
| **Defixio** | Targeted, stackable | Single-use: continuously culls a whole random reprobate subtype; effect increases exponentially with time and ends when reaching 0 reprobates of that subtype. | Profane | Lead tablet inscribed in inverted Latin and folded around iron nails. Buried, it begins to remember. |
| **Hand of Glory** | Targeted, stackable | Single-use: increases basic reprobate generation rate by 100 % for 1 hour. | Rare | Severed hand of a hanged felon, dressed and candle-fitted. Mass-converts a congregation into reprobates. |
| **The Dadu** | Oracular, power source | Reveals *Decimatio* outcome distribution. Grants 1 invoking power. | Common | Four-sided die of human bone. |
| **Dybbuk Box** | Power source | Grants 3 invoking power. | Rare | A good addition. |
| **Hollow Effigy** | Oracular, power source | Reveals *Suasio* outcome distribution. Grants 1 invoking power. | Common | The hollow is not a flaw; it is the function. |
| **Black Salt Pouch** | Power source, stackable | Grants 1 invoking power. | Common | Drawn from ash, charcoal, and graveyard earth. |
| **Spear of Longinus** | Enhancer | Triples maximum influence. | Anathema | Just the tip. |
| **Codex Gigas** | Enhancer | Triples influence gain rate. | Anathema | One scribe. One night. One signature in the margin no Pope has ever erased. |
| **Mark of Cain** | Enhancer | Apocalyptic outcome chances are 0. | Anathema | The sevenfold vengeance was never a curse. It was a guarantee. |
| **Thirty Pieces of Silver** | Enhancer | Triples gold gain rate. | Anathema | Counted out, refused, returned, refused again. Coinage that always finds its way back into a hand. |
| **Solomon's Ring** | Enhancer | Increases sigil effects by 50 % multiplicatively. | Anathema | An inquiry into how many seals a single signet may bear. |
| **Iron Nails** | Power source, stackable | Increases sigil effects by 1 % multiplicatively per copy. Grants 1 invoking power per copy. | Common | Rusted from coffin-lids and gallows-frames. Iron remembers what it was last used to hold. |
| **Witch Bottle** | Power source | Grants 2 invoking power. | Common | A glass jar packed with nails, hair, and what the celebrant could not bear to keep. |
| **Crossroads Dirt** | Oracular, power source | Reveals *Emptio* outcome distribution. Grants 1 invoking power. | Common | Where four roads meet, no prayer holds priority. Useful for transactions that should not be witnessed. |
| **Mandrake Root** | Power source | Grants 2 invoking power. | Common | Pulled from beneath a gallows, where the sap of the hanged still feeds the soil. Carved into the shape it most resembles. |
| **Crow Feather** | Oracular, power source | Reveals *Indagatio* outcome distribution. Grants 1 invoking power. | Common | A messenger carries word both ways. |

---

## 5. Sigils — the Goetia

Seventy-two sigils, in canonical *Lesser Key of Solomon* numbering, with Asmoday (#32, the *Luxuria* Prince Asmodeus) substituted by **Semet**. Semet is not immediately unlocked nor visible — it becomes unlocked and visible once you reach Cardinal-Sin level ≥ 2 in every Sin. Semet is intentionally named for the Eternal Sin (§8 below); a player who binds Semet without yet seeing the Eternal Sin reveal is unknowingly worshipping themselves.

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
| 50 | **Furcas** | Philosophy, astronomy, palmistry, pyromancy | Increases probability for *Indagatio* to find 2 maleficia. |
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
- **Satan / Ira level** — each level grants +33 % acolyte and invocation action efficiency multiplicatively.


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
| **The Council Convenes** | Reach Cardinal-Sin level 1 in every Sin (unlocks *Vitium Compositum*). |
| **Profane Possession** | Own at least one profane maleficium. |
| **Anathema** | Own at least one anathema maleficium. |
| **Court of Spires** | Reach `maxInfluence ≥ 10,000`. |
| **The Goetia, Recited** | Bind at least one soul to each of the 72 sigils across one or more lifetimes. |
| **Single-Minded** | Reach Cardinal-Sin level 4 in any one Sin. |
| **Eight at the Table** | Reach Cardinal-Sin level 3 in every Sin (unlocks *Panvitium*). |
| **The Long Burn** | Run *Panvitium* continuously for at least 60 seconds in a single activation. |
| **Curator** | Own every maleficium currently in the catalog. |
| **The Crown of Hell** | Reach Cardinal-Sin level 4 in every Sin. |
| **Semet** | Reveal the Eternal Sin (§8). The terminal achievement. |

Per-achievement icon design and lore-flavour text are open. Steam achievement IDs and unlock metadata land with the publish pipeline.

---

## 8. End of the game — the Eternal Sin

Once the player gets all eight Cardinal Sins to Level 4, an unknown ninth Sin becomes visible above them — the **Eternal Sin**, blacked out, though souls can be offered to it.

Offering the threshold (**8,398,080,000** souls cumulatively) reveals the Demon Prince's name — **Semet** — the name of the Sin itself, and the closing flavour. A black screen displays the total game runtime that the player took to fully devote to this Eternal Sin, with the Latin flavour:

> *"Iam pridem scis te perditum esse. Quiescere non potes, sed nihil agis: nihil enim venenum acerbissimum est, ornamentum gravissimum, quod cervicem premit nec umquam deponi patitur. At inter has tenebras amor eorum iustus ignem accendit, eaque sola flamma, quamvis tenuis, viam tibi monstrat."*

*Semet* means "oneself" in Latin. You are the King of All Sins.

**Foreshadowing.** Sigil #32, also named *Semet*, becomes available once every Cardinal Sin reaches level 2 — long before the reveal itself. A player binding souls to Semet at that point does not know the connection.

**Post-reveal continuation.** The reveal is a terminal milestone and a credits screen. See `01-vision-and-core-loop.md` "After the Eternal Sin". The runtime number on the reveal screen is the score, the screenshot is the trophy.

---

## 9. Open content items

Items held in reserve or unresolved. None of these block the current build; all should be tracked.

- **Reprobate-subtype achievement set** — a "convert one of each subtype" achievement would round out completionist appeal but adds a tracking surface (per-subtype "ever converted" boolean per lifetime or globally); deferred until the core systems are all in.
- **Sigil curve overrides** — currently every sigil uses the default √ curve; if a future tuning pass requires linear or log on specific sigils, annotate the per-sigil row above (`[linear]` / `[log]`).
