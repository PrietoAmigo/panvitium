# 03 — Content Catalog

This document is the catalog of *what exists*: every Sin, action, ceremony, maleficium, sigil,
invocation, and achievement. *How* the systems work is `02-systems-and-mechanics.md`. **Numbers
live in the economy spreadsheet** (`Panvitium_Economy_Template.xlsx`), which wins over this
document wherever the two disagree; formulas that define a system's shape are stated here, and
their constants live in the sheet.

This revision incorporates **ADR-024** (single reprobate pool; subtypes and conversion removed)
the **Vitium Mercatura / Vitium Compositum redesign** (`vm-vc-redesign-spec.md`), the
**Depraedatio gold rework** (Mercatus → the Faeneratio loop), and **ADR-031** (the gating
rebalance; the lesser ceremonies retired — Panvitium alone survives, on the Suasio scroll). Section
numbering is preserved from the previous revision so cross-references in other documents and in
code comments stay valid.

---

## 1. The Eight Princes — Cardinal Sins, skills, and per-level effects

Each Prince is a school of vice with its own temper, pacing, and economy
(`00-lore-bible.md` §6). Devotion offered to a Prince raises that Cardinal Sin: a continuous
**skill** intensity plus a discrete **per-level effect** at each threshold (`02 §6`). Levels run
0–4; the threshold base and the skill-intensity curve live in the spreadsheet
(`Sins & Devotion`, `Globals`).

| Prince | Sin (Latin) | English | Skill | Skill effect (continuous) | Per-level effect |
|---|---|---|---|---|---|
| **Beelzebub** | *Gula* | Gluttony | Insatiability | Increases online player efficiency. | Removes a flat share of Bad, Terrible, and Apocalyptic chance per level (additive); at level 4 the negative-outcome chance is 0%. |
| **Asmodeus** | *Luxuria* | Lust | Seduction | Increases the reprobate generation rate. | Multiplies overall *Suasio* efficiency per level; unlocks the *Suasio* actions and their toggles. |
| **Mammon** | *Avaritia* | Greed | Golden Hand | Increases the gold gain rate. | Increases the Katabasis remaining-gold percentage per level. |
| **Leviathan** | *Tristitia* | Sorrow | Resignation | Increases acolyte efficiency. | Increases the Katabasis remaining-reprobate percentage per level. |
| **Satan** | *Ira* | Wrath | Retribution | Increases invocation efficiency. | Multiplies overall *Decimatio* efficiency per level; unlocks the *Decimatio* actions and their toggles. |
| **Belphegor** | *Acedia* | Sloth | Procrastination | Increases offline player efficiency. | Each level applies a compounding multiplier to offline gains, growing with both the offline stretch and the level (curve in the spreadsheet; its time input saturates per ADR-004's amendment). |
| **Rosier** | *Vanagloria* | Vainglory | Acclaim | Increases maximum influence. | Multiplies the influence gain rate per level. |
| **Lucifer** | *Superbia* | Pride | Morning Star | Increases overall Stellar outcome probability. | Increases the Katabasis remaining-maleficia chance per level. |

**Skills** couple to their target via `1 + intensity` ("increase") or `1 / (1 + intensity)`
("decrease") through the modifier engine (`02 §4`); intensity rises with total Devotion along
the fixed curve in the spreadsheet.

---

## 2. The Opera (action menu)

### 2.1 *Suasio* — Tempting

Three actions: *Suggestion*, *Logismoi*, and *Imperium*, gated and toggle-gated by *Luxuria*
level. Efficiency mode is **`cost-outcome`** (`02 §3`): it modifies *Suasio* costs and positive
outcomes by the same percentage and does not affect action time.

- **Suggestion** — the early-game reprobate source. Short, cheap, modest yield.
- **Logismoi** — the mid-game source; bulk corruption with a wider variance.
- **Imperium** — the late-game source; the player in control, with soul-minting and
  percentage-of-population outcomes at the top tiers.

Per-action probabilities, outcomes, costs, durations, and the *Luxuria* gates are in the
`Suasio` sheet.

### 2.2 *Decimatio* — Culling

Three actions: *Caedes*, *Pogrom*, and *Purgatio*, gated and toggle-gated by *Ira* level.
Efficiency mode is **`cost-outcome`** (`02 §3`, per the sheet): it modifies *Decimatio* costs and
positive outcomes by the same percentage and does not affect action time.

- **Caedes** — the early soul source; single kills with occasional sprees.
- **Pogrom** — the mass cull; percentage-of-population kills, heavier mishaps.
- **Purgatio** — soul farming at scale; enormous yields against ruinous Terrible/Apocalyptic
  outcomes (total gold loss, total loss).

Every kill mints one soul (`02 §9`). Per-action tables are in the `Decimatio` sheet. Note the
tension the economy creates: every reprobate culled is a debtor the *Mutuum* loan book no longer
earns from (§2.3) — unless Escheat has been signed, in which case the estate pays once.

### 2.3 *Depraedatio* — Exploiting

The vice economy. Deterministic — no tier rolls anywhere in this category.

#### The Faeneratio loop — *Mutuum*, *Thesaurus*, *Syngraphae*

The gold-obtaining half of *Depraedatio* (the Depraedatio gold rework; supersedes the eight
per-Sin Mercatūs of ADR-025). The framing is **usury at arm's length**: the damned never pay the
player tribute and never know the player exists — small sums are seeded among the masses through
brokers and front men, and the interest climbs through a hundred hands to a name none of them has
heard. All three surfaces are **open from the start** — the gating rebalance (ADR-031) moved
every Faeneratio gate one level down, so the old Avaritia-I unlock became no gate at all.

- ***Mutuum* (the loan book).** Passive gold income proportional to the reprobate population:
  `take/s = MUTUUM_PER_CAPITA × mutuumPerCapitaMul × reprobates`. No principal, no depth, no
  decision — this is the income floor and the population coupling (no population, no income: the
  economy still rides the population curve, the ADR-025 design point).
- ***Thesaurus* (the hoard).** A vault (`lifetime.hoard`) the player deposits liquid gold into;
  the hoard pays **Fenus** interest into *liquid* gold: `interest/s = FENUS_RATE × fenusRateMul ×
  hoard`. Deposits are instant and floored (ADR-005). **Withdrawal is punitive**: the full amount
  leaves the hoard and only `THESAURUS_RECOVERY × thesaurusRecoveryMul` (base 0.25 — the Globals
  shutdown-recovery constant, lifted by the Custodia contracts and Vine #45 / Furcas #50, capped
  at 0.9 effective) returns. The miser's trap is the design: hoard everything and grow fastest
  while affording nothing.
- **Katabasis liquidation:** on descent the hoard liquidates **in full** (no recovery penalty —
  the descent voids the contracts; ×1.25 with *faeneratio-4*) into gold **before** the
  remaining-gold roll (`02 §6`), and resets with the lifetime.
- Both income terms are scaled by the **Faeneratio output multiplier** (the Plutus invocation,
  the Vapula #60 sigil — the renamed *Vitium Mercatura* output channel) and `goldRateMul`, and
  both are part of the percentage-ceremony base (ADR-027).

Constants (`MUTUUM_PER_CAPITA`, `FENUS_RATE`, the recovery constant and cap, the Foedus `T0`,
the node costs and magnitudes below) belong to the `Vitium Mercatura` sheet's Faeneratio block;
the code carries the approved spec's placeholders until the sheet settles them.

##### *Syngraphae* — the Avaritia contract tree

Twelve promissory notes signed with the Hoarder Below, in three **linear branches** of four,
bought with **burned** gold (the signing fee — paid, never hoarded, never refunded) and reset
each lifetime (the terms lapse at the descent). Signing requires the node's Avaritia level gate
and the previous node in its branch. Gates run 0–III (the gating rebalance, ADR-031: each
branch's first node is ungated, then Avaritia I / II / III up the chain); fees run
500 / 5,000 / 50,000 / 500,000 *(placeholders)*.

| Branch | Node | Effect |
|---|---|---|
| **Usura** (the yield) | I / II | Fenus rate ×1.5 each. |
| | III | Fenus rate ×2. |
| | IV — **Anatocismus** | Half of each interest payment auto-deposits into the hoard instead of paying out (compound interest by contract; the HUD gold/s shows the liquid half). |
| **Faeneratio** (the loan book) | I | Mutuum take ×1.5. |
| | II — **Escheat** | Death duties: +1 gold per murder and +0.5 per suicide (the estates of the dead escheat to unseen creditors), minted at the dynamics step. |
| | III | Mutuum take ×2. |
| | IV | The Katabasis hoard liquidation pays ×1.25. |
| **Custodia** (retention) | I | Withdrawal recovery ×1.6 (0.25 → 0.4). |
| | II | Hoard milestones: +2% `goldRateMul` per decade of hoard ≥ 1,000, capped at +20%. |
| | III | Withdrawal recovery ×1.5 (stacks to 0.6). |
| | IV — **Peculium** | At commit, the kept-gold result is floored at 10% of the hoard's value at descent (a remnant beneath the Avaritia roll; Erinyes still zeroes gold and wins). |

#### *Vitium Compositum* — Panvitium alone (ADR-031)

The eight lesser ceremonies (*Bacchanal*, *Charity*, *Gala*, *Doom Gathering*, *Enraging
Broadcast*, *Dolce Far Niente*, *Vegas*, *Crusade*) are **retired** — their income, rate-boost,
and percentage-of-income machinery (ADR-027) went with them, and old saves carrying a retired id
self-heal on the first tick. What survives is the toggle engine and its one occupant,
**Panvitium**, which now lives on the **Suasio scroll** as its sealed fourth rite (`02 §12`).

#### *Foedus* — the hoard ↔ Panvitium coupling

The *Foedus* survives on its **upkeep side only**, re-anchored from the trades to the hoard: a
pact between the vault and the rituals — a fat vault greases the ceremony.

- The tier is **global**: `tier = 0` while `hoard < T0`, else
  `min(floor(log10(hoard / T0)) + 1, 4)` — tiers step at each decade of hoard above `T0`
  *(placeholder 10,000: 1e4 / 1e5 / 1e6 / 1e7)*.
- An active ceremony's per-second **computed** cost takes `× (1 − 0.125 × tier)` — including
  *Panvitium*'s eᵗ ramp (the late-game payoff survives). The per-ceremony `foedusOptOut` flag is
  retained and keeps suppressing the discount.

##### *Panvitium*

The action that gives the game its name. Unlocked when every Cardinal Sin reaches the required
level (sheet).

- **Type:** toggle; cannot be manually deactivated; auto-deactivates the moment its per-second
  cost cannot be paid (`02 §3`).
- **Cost:** gold and influence per second, both growing **exponentially** with active duration.
- **Effect:** the Cardinal Sins take the streets — souls are minted each second, scaled to the
  current reprobate population (sheet).
- **Role:** ultra-burst, late-game, deliberately unsustainable: flipped on for a glorious,
  expensive minute or two, then off (resource-driven). The exponential cost ensures it can never
  become a steady state; a deep all-eight Foedus stretches the burn without removing the wall.
- **The visual signature:** a confirmation pop-up before activating; while active, the Studio's
  window shows the city tinted red, lit by fires, processions of the corrupted. The screenshot
  moment.

### 2.4 *Invocatio* — Summoning

Deterministic. Each invocation has an invoking-power requirement, a Sin-level gate, and costs
(one-time and/or per-second); mechanics, concurrency limits (one Apex, one Familiar, any number
of Normal), visibility at half power, and the three effect shapes are `02 §7`. All are dispelled
on Katabasis. Numbers live in the `Invocatio` sheet; the catalog:

| Invocation | Sin | Type | Effect (summary) |
|---|---|---|---|
| **Familiar** | — | Special | Flat bonus to player efficiency; additionally runs *Indagatio* autonomously. Always in the Studio, beside the door. |
| **Lemure** | *Acedia* | Normal | Its efficiency applies as an additive offline gain rate. Altar room. |
| **Morpheus** | *Acedia* | Apex | Full freeze; the next Katabasis keeps 100% of gold and maleficia and the *Emptio* list. Floats over the Altar, overrides other silhouettes. |
| **Plutus** | *Avaritia* | Normal | Its efficiency sets the lending enterprises to work — increases the Faeneratio output (Mutuum + Thesaurus interest). Sometimes in the Studio. |
| **Midas** | *Avaritia* | Apex | Multiplies gold gain; massively multiplies Apocalyptic chance. Sends profane advisory email (`00-lore-bible.md` §11). |
| **Upir** | *Gula* | Normal | Its efficiency applies to *Caedes*. Sometimes in the Invocation Room. |
| **Aurevora** | *Gula* | Apex | Devours gold on an exponential ramp; a share of the ramp returns as player efficiency; self-dispels at 0 gold. |
| **Imp** | *Ira* | Normal | Its efficiency applies to *Caedes*. |
| **Harpy** | *Ira* | Normal | Its efficiency applies to *Pogrom*. Sometimes at the Studio window. |
| **Erinyes** | *Ira* | Apex | Kills every reprobate at invoke; the next Katabasis keeps 0% gold and maleficia; permanently doubles overall action efficiency. Altar room, overrides. |
| **Lamia** | *Luxuria* | Normal | Its efficiency applies to *Logismoi*. At most one shown. |
| **Succubus** | *Luxuria* | Apex | Its efficiency applies to *Imperium*, at a steep percentage-of-income cost. |
| **Behemoth** | *Superbia* | Normal | Its efficiency applies as an additive Stellar-chance increase across the Opera. |
| **Doppelgänger** | *Superbia* | Apex | Adds half the player's efficiency on top. Writes you email from an address almost your own (`00-lore-bible.md` §11). |
| **Nightmare** | *Tristitia* | Normal | Its efficiency applies as an additive increase to the base suicide rate. Altar room. |
| **Astiwihad** | *Tristitia* | Apex | Each second, a small chance that the whole population suicides. Altar room. |
| **Fama** | *Vanagloria* | Normal | Its efficiency applies as an additive influence-gain increase, at a percentage-of-gold cost. |
| **Specunitas** | *Vanagloria* | Apex | Doubles influence gain at a steep percentage-of-income cost. Sometimes in the Studio. |

---

## 3. Reprobates

Per **ADR-024**, reprobates are a **single undifferentiated pool**: abstract populations and
probability inputs, never units (`01`, "What this game is not"). The subtype catalog, the
conversion mechanic, and every per-subtype effect from earlier revisions are removed.

What remains is the population's role as the economy's centre of mass (`02 §9`):

- **Born** of *Suasio* and of ceremonies and sigils that raise generation.
- **Repaying** while alive — the *Mutuum* loan book earns per living head.
- **Dying** by cull (*Decimatio*), suicide, and murder — every death mints exactly one soul.
- **Scattering** at Katabasis: a small identified fraction carries over (`02 §6`).

Base suicide and murder rates are population-wide per-second rates in `Globals`; their modifier
sources are listed in `02 §9`.

---

## 4. Maleficia

Occult items, discovered via *Indagatio* and bought via *Emptio* (`02 §8`; both `time`-mode).
Owned items are always in effect; stackables repeat per copy to their cap. Power sources feed
invoking power (`02 §7`); oraculars reveal outcome distributions (`02 §2`). Each owned item
rolls the remaining-maleficia chance at Katabasis.

The catalog (invoking power, stack caps, prices, and exact magnitudes in the `Maleficia` sheet):

| Maleficium | Type | Rarity | Effect (summary) |
|---|---|---|---|
| **Spear of Longinus** | Enhancer | Anathema | Greatly multiplies maximum influence. |
| **Mark of Cain** | Enhancer | Anathema | Greatly multiplies the murder rate. |
| **Thirty Pieces of Silver** | Enhancer | Anathema | Gold gain grows with current gold. |
| **Solomon's Ring** | Enhancer | Anathema | Multiplies sigil effects. |
| **The Voynich Manuscript** | Enhancer, power source | Profane | Multiplies *Suasio* efficiency; grants power. |
| **Obsidian Mirror** | Oracular, power source | Profane | Reveals ALL Opera distributions; grants power. |
| **Defixio** | Targeted, stackable | Profane | Single-use curse: culls reprobates on an exponential ramp. |
| **Galdrabók** | Enhancer | Profane | Multiplies the murder rate. |
| **Codex Gigas** | Enhancer | Profane | Multiplies influence gain rate by 1.33. |
| **Ars Serpens** | Enhancer, power source | Rare | Multiplies *Suasio* efficiency; grants power. |
| **Ritual Dagger** | Enhancer, power source | Rare | Multiplies *Decimatio* efficiency; grants power. |
| **Blood Chalk** | Power source | Rare | Grants invoking power. |
| **Blackthorn Wand** | Power source | Rare | Grants invoking power. |
| **Hand of Glory** | Targeted, stackable | Rare | Single-use: doubles the reprobate generation rate for one hour. |
| **Dybbuk Box** | Power source | Rare | Grants invoking power. |
| **Black Robe** | Power source | Common | Grants invoking power. |
| **Sulfur Censer** | Power source | Common | Grants invoking power. |
| **Black Candles** | Enhancer, stackable | Common | Increases invocation effect per candle. |
| **The Dadu** | Oracular, power source | Common | Reveals the *Decimatio* distribution; grants power. |
| **Hollow Effigy** | Oracular, power source | Common | Reveals the *Suasio* distribution; grants power. |
| **Black Salt Pouch** | Power source, stackable | Common | Grants invoking power per copy, uncapped. |
| **Iron Nails** | Power source, stackable | Common | Each copy increases sigil effects and grants power. |
| **Witch Bottle** | Power source | Common | Grants invoking power. |
| **Crossroads Dirt** | Oracular, power source | Common | Reveals the *Emptio* distribution; grants power. |
| **Mandrake Root** | Power source | Common | Grants invoking power. |
| **Crow Feather** | Oracular, power source | Common | Reveals the *Indagatio* distribution; grants power. |
| **Witch Ladder** | Enhancer | Common | Multiplies the suicide rate. |
| **Adder Stone** | Enhancer | Common | Multiplies reprobate generation. |
| **Poppet** | Enhancer | Common | Multiplies the murder rate. |

*Indagatio* resolves rarity by tier (Neutral finds Common, the top tiers find Profane and
Anathema); *Emptio* resolves price by tier against the rarity's price band. Both distributions,
durations, and the price bands are in the `Indagatio & Emptio` and `Maleficia` sheets.

---

## 5. Sigils — the Goetia

Seventy-two sigils in canonical *Lesser Key of Solomon* numbering, with Asmoday (#32)
substituted by **Semet**. Semet is not initially visible — it unlocks once every Cardinal Sin
reaches the required level (sheet), long before the Eternal Sin reveal (§8); a player binding
souls to Semet at that point is unknowingly worshipping themselves.

Binding mechanics and curves are `02 §5`. The default curve is **√**; sigils marked **[log]**
below use the logarithmic curve (these are the flat-generator and carry-over seals). Per-sigil
coefficients are in the `Sigils` sheet.

| # | Sigil | Demonological role | In-game effect |
|---|---|---|---|
| 1 | **Bael** | Changeling; makes invisible | Reduces negative outcome chance across the Opera. |
| 2 | **Agares** | Earthquakes; retrieval | Chance to duplicate the output of *Indagatio*. |
| 3 | **Vassago** | Foresees past and future | Higher chance of profane and anathema maleficia. |
| 4 | **Samigina** | Accounts of the dead | Increases *Tristitia* invocation effectiveness. |
| 5 | **Marbas** | Reveals secrets | Increases *Indagatio* positive outcome chance. |
| 6 | **Valefor** | Thievery | Increases online gold gain. |
| 7 | **Aamon** | Reproduction, life | Increases online reprobate generation. |
| 8 | **Barbatos** | Songs of animals | Increases *Gula* invocation effectiveness. |
| 9 | **Paimon** | Loyalty; returning servants | Reduces influence costs. |
| 10 | **Buer** | Good familiars | Increases Familiar effectiveness. |
| 11 | **Gusion** | Reconciles enemies | **Orphaned** (ADR-031): its target — the ceremony effect channel — retired with the lesser ceremonies. Def deleted; binding is harmless; awaits a per-sigil sheet decision. |
| 12 | **Sitri** | Love | **Orphaned** (Depraedatio gold rework): its target — the Mercatus breeding channel — retired with the trades. Catalog def deleted per ADR-029; binding is harmless. Awaits a per-sigil sheet decision. |
| 13 | **Beleth** | Attended by trumpets | Increases *Decimatio* positive outcome chance. |
| 14 | **Leraie** | Putrefies wounds | Chance a murder triggers a suicide. |
| 15 | **Eligos** | Favour of important people | Increases offline influence gain. |
| 16 | **Zepar** | Makes barren | Increases offline reprobate generation. |
| 17 | **Botis** | Past and future | Reduces *Suasio* negative outcome chance. |
| 18 | **Bathin** | Transport | Increases acolyte action efficiency. |
| 19 | **Sallos** | Peace, idleness | Increases offline gold gain. |
| 20 | **Purson** | Hidden treasures | Increases the Katabasis remaining-gold % (flat). [log] |
| 21 | **Marax** | Stops, delays | Increases offline action efficiency. |
| 22 | **Ipos** | Valiant, tactical | Reduces *Decimatio* negative outcome chance. |
| 23 | **Aim** | Sets fire | Increases the murder rate. |
| 24 | **Naberius** | Arts and rhetoric | **Orphaned** (ADR-031): shared Gusion\u2019s retired ceremony-effect channel. Def deleted; awaits a sheet decision. |
| 25 | **Glasya-Labolas** | Manslaughter | Increases the murder rate (flat). [log] |
| 26 | **Bune** | Wisdom | Increases *Vanagloria* invocation effectiveness. |
| 27 | **Ronove** | Harvests souls near death | Increases the suicide rate. |
| 28 | **Berith** | Covenant | Increases *Superbia* invocation effectiveness. |
| 29 | **Astaroth** | Secrets, all times | Increases *Indagatio* Stellar chance. |
| 30 | **Forneus** | Rhetoric | Increases invoking power (flat). [log] |
| 31 | **Foras** | Logic, invisibility | Extends the offline accrual window. |
| 32 | **Semet** | Final destiny | Increases all sigil effects. Gated (see above). [log] |
| 33 | **Gaap** | Makes men stupid | Increases maleficia effects. [log] |
| 34 | **Furfur** | Love; storms | Increases *Luxuria* invocation effectiveness. |
| 35 | **Marchosias** | Faithful follower | Increases maximum influence. |
| 36 | **Stolas** | Astronomy, herbs | Reduces the chance of Common finds in *Indagatio*. |
| 37 | **Phenex** | Phoenix; sings | Reduces *Emptio* negative outcome chance. |
| 38 | **Halphas** | Builds towers, arms | Reduces the chance of Common and Rare finds. |
| 39 | **Malphas** | Builds, demolishes; deceives | Chance to duplicate the output of *Suasio*. |
| 40 | **Raum** | Steals; destroys cities | Increases *Decimatio* action efficiency. |
| 41 | **Focalor** | Kills by drowning | Chance to duplicate the output of *Decimatio*. |
| 42 | **Vepar** | Putrefying wounds | Increases *Ira* invocation effectiveness. |
| 43 | **Sabnock** | Wounds and sores | Increases the suicide rate (flat). [log] |
| 44 | **Shax** | Deafness; takes money | Increases *Avaritia* invocation effectiveness. |
| 45 | **Vine** | Reveals witches; walls | Increases the Thesaurus withdrawal recovery fraction (re-pinned from the Mercatus divest, same niche and magnitude). |
| 46 | **Bifrons** | Sciences, herbs | Increases *Indagatio* action efficiency. |
| 47 | **Vual** | Love of women; all times | Increases *Suasio* Stellar chance. |
| 48 | **Haagenti** | Metal to gold | Generates gold per second (flat). [log] |
| 49 | **Crocell** | Geometry; warms waters | Chance *Indagatio* finds two. |
| 50 | **Furcas** | Pyromancy | Increases the Thesaurus withdrawal recovery fraction (composes with Vine). |
| 51 | **Balam** | All times; invisibility | Reduces negative outcome chance across the Opera. |
| 52 | **Alloces** | Astronomy; familiars | Increases *Acedia* invocation effectiveness. |
| 53 | **Camio** | Disputation | Increases the Katabasis remaining-reprobate % (flat). [log] |
| 54 | **Murmur** | Summons dead souls | Increases overall invocation effectiveness. |
| 55 | **Orobas** | Faithful; all times | Reduces the cost of all invocations. |
| 56 | **Gremory** | Treasures; love | Increases *Suasio* positive outcome chance. |
| 57 | **Ose** | Changes shape | Generates reprobates (flat). [log] |
| 58 | **Amy** | Treasures | Increases *Indagatio* and *Emptio* action efficiency. |
| 59 | **Orias** | Transformations | **Orphaned** (ADR-031): the ceremony influence output retired with the lesser ceremonies. Def deleted; awaits a sheet decision. |
| 60 | **Vapula** | Mechanical arts | Increases the Faeneratio gold output (Mutuum + Thesaurus interest). |
| 61 | **Zagan** | Fools wise | **Orphaned** (ADR-031): the ceremony gold output retired with the lesser ceremonies. Def deleted; awaits a sheet decision. |
| 62 | **Volac** | Treasures; serpents | Reduces *Indagatio* negative outcome chance. |
| 63 | **Andras** | Sows discord | Increases *Emptio* Stellar chance. |
| 64 | **Haures** | Destroys enemies | Increases *Decimatio* Stellar chance. |
| 65 | **Andrealphus** | Mensuration | Increases invoking power. |
| 66 | **Cimejes** | Lost things; treasures | Increases the Katabasis remaining-maleficia chance. [log] |
| 67 | **Amdusias** | Harsh music | Increases positive outcome chance across the Opera. |
| 68 | **Belial** | Favour; preferments | Increases the influence gain rate. |
| 69 | **Decarabia** | Stones and herbs | Generates influence per second (flat). [log] |
| 70 | **Seere** | Brings things suddenly | Increases *Emptio* action efficiency. |
| 71 | **Dantalion** | All human thoughts | Increases *Suasio* action efficiency. |
| 72 | **Andromalius** | Returns stolen; reveals plots | Increases *Emptio* positive outcome chance. |

Sigil #58 (*Amy*) is authored in the sheet with a sign worth confirming at implementation time
(the sheet reads "−Indagatio & Emptio action efficiency"); flag it in the next tuning pass.

---

## 6. Acolytes

The mechanics live in `02 §10` (count from influence thresholds, delegation, efficiency,
limits). The content-level catalog is the set of modifiers that touch them:

- **Resignation** (Leviathan / *Tristitia* skill) — increases acolyte efficiency.
- **Bathin** (#18) — increases acolyte action efficiency.

There is no per-acolyte specialization — every acolyte is interchangeable. A future content
pass could introduce named acolytes with per-Sin affinity; not in scope for launch.

---

## 7. Achievements

Roughly fifteen, spanning early pacing markers, mid-game milestones, late capstones, and one
terminal achievement. Thresholds in the spreadsheet; icons and flavour text are open items.

| Achievement | Trigger |
|---|---|
| **First Stain** | Generate your first reprobate. |
| **First Harvest** | Earn your first soul. |
| **First Descent** | Complete your first Katabasis. |
| **First Bargain** | Acquire your first maleficium. |
| **The Council Convenes** | Reach the first Cardinal-Sin level in every Sin. |
| **Profane Possession** | Own at least one profane maleficium. |
| **Anathema** | Own at least one anathema maleficium. |
| **Court of Spires** | Reach a high maximum influence (threshold in the spreadsheet). |
| **The Goetia, Recited** | Bind at least one soul to each of the 72 sigils across one or more lifetimes. |
| **Single-Minded** | Reach the maximum Cardinal-Sin level in any one Sin. |
| **Eight at the Table** | Reach the Cardinal-Sin level that unlocks *Panvitium* in every Sin. |
| **The Long Burn** | Run *Panvitium* continuously for a sustained duration. |
| **Curator** | Own every maleficium currently in the catalog. |
| **The Crown of Hell** | Reach the maximum Cardinal-Sin level in every Sin. |
| **Semet** | Reveal the Eternal Sin (§8). The terminal achievement. |

---

## 8. End of the game — the Eternal Sin

Once every Cardinal Sin reaches its maximum level, an unknown ninth Sin becomes visible above
them — the **Eternal Sin**, blacked out, though souls can be offered to it.

Offering the required soul threshold (`Globals`) reveals the name — **Semet** — and the closing
flavour: a black screen with the total game runtime the climb took, and the Latin:

> *"Iam pridem scis te perditum esse. Quiescere non potes, sed nihil agis: nihil enim venenum
> acerbissimum est, ornamentum gravissimum, quod cervicem premit nec umquam deponi patitur. At
> inter has tenebras amor eorum iustus ignem accendit, eaque sola flamma, quamvis tenuis, viam
> tibi monstrat."*

*Semet* means "oneself." You are the King of All Sins — reached alive, per the lore's living
apotheosis (`00-lore-bible.md` §7): maximal unrest, not stillness, and still bounded by the one
ceiling it can never cross.

**Foreshadowing.** Sigil #32 carries the same name and unlocks far earlier (§5).

**Post-reveal continuation.** The reveal is a terminal milestone and a credits screen
(`01`, "After the Eternal Sin"). The runtime number is the score; the screenshot is the trophy.

---

## 9. Open content items

None of these block the current build; all should be tracked.

- **Orphaned sigils: Sitri #12, Gusion #11, Naberius #24, Orias #59, Zagan #61** — Sitri's
  target (the Mercatus breeding channel) retired with the Depraedatio gold rework; the other
  four lost their ceremony channels when ADR-031 retired the lesser Vitium Compositum ceremonies.
  All five defs are deleted (ADR-029's pattern) and each re-pin needs a per-sigil sheet decision.
  Natural retarget surfaces: hoard size, the Fenus rate, the Mutuum take, Syngraphae costs, the
  Foedus thresholds. (The ADR-024 sixteen were already resolved by ADR-029.)
- **Sigil sign check** — confirm the intended sign of Amy #58 (see §5 note).
- **Email / phone content set** — the sender-voiced content system (`00-lore-bible.md` §10–11)
  has its channels in the Studio (`02 §12`) but its message catalog is unwritten; the Katabasis
  liquidation and the Panvitium burn are natural trigger beats.
- **Achievement flavour** — per-achievement icons and lore text; Steam IDs land with the
  publish pipeline.
- **Acolyte specialization** — named acolytes with per-Sin affinity, reserved for a future
  content pass.
