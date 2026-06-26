# PANVITIUM: INCOMING CALLS CATALOG (calls-in)

Canonical, single-source list of every call you can RECEIVE and the event it opens when answered. One entry per incoming call, fixed format. Engine: each is a `CALL_TRIGGERS` row pointing at an `INTERACTIONS` entry; copy lives in `strings` (`calls.<id>.caller|opening|choice.<choiceId>`). A call RINGS for its ring window during active play only (never offline; the phone is dark during Katabasis, see `06-smartphone-content.md`). Weights and magnitudes sheet-pinned.

**Sources.** Every caller is from the realised cast in the lore bible (00 sec. 11) or is one of the mundane functionaries the bible already sanctions (trusted minions are not acolytes nor invocations and grasp nothing of the work). All copy obeys the two-layer rule (00 sec. 0 and sec. 4): the household and the world never use occult vocabulary and grasp the truth in pieces only and no hidden-layer vocabulary appears anywhere a player can read it. Hell is silent: no Prince, no sigil, and no invocation ever telephones you (your invocations reach you only by email or in the Lair, per 00 sec. 9 and the email content in 05).

**Out of scope: sigils and Princes.** Sigils and the Princes are never interacted with from earth. They belong to the altar and the descent, not to a phone on a desk. So no call here frames a reward as binding a soul to a sigil, feeding a seal, or giving Devotion to a Prince. The phone speaks only of the mundane vice lines, the invocations, the household and its culling, the search, money, and standing.

* * *

## Selection model

When an incoming call fires (on the seeded cadence, active play only), the caller is drawn from a weighted bag:

- **90% a buff call**, split evenly:
    - **45% a completely positive buff.** Clean upside. You choose which upside, and every option is good. The only way to lose is to let it go.
    - **45% a big tradeoff buff.** A strong buff bought with a real, painful cost. You choose your cost (or which strong-buff-plus-cost), or you let it go.
- **9% a lore call.** Narrative and atmosphere, no mechanical effect.
- **1% an easter egg.** A rare collectible, no mechanical reward.

Every incoming call is an opportunity. You may always take it or let it go, and letting it go (or missing it, or declining) costs nothing. There are no punitive incoming calls: the phone never fines you, only ever offers.

**The choices are lore first.** A buff is never a bare number. Each call has a diegetic reason it exists (a cull went clean, a vice line is booming, the adversary is making noise you can work behind), and each take-option is the in-fiction shape of that reason. The parentheticals on every choice below are that reason, and they are load-bearing: if a buff cannot be justified from the fiction it does not belong in this catalogue.

**The cull is one for one, and nothing buffs it.** One reprobate equals one soul, fixed. Soul-gain multipliers are forbidden, and so is any multiplier on cull yield, because both would break that identity. Souls enter the game only by culling the corrupted, one soul per reprobate, and no call changes that ratio. So buffs act only on the upstream and the side economies:

A call may also hand you reprobates or money directly. The only place a call grants a soul is by culling a reprobate you already hold, one for one (see `dying-soul`).

**Weighting and gating.** Weights are relative and per-entry. An entry whose `Trigger` eligibility predicate is unmet is excluded from the bag and the remaining weights renormalise, so the 90 / 9 / 1 shape is preserved among the calls that are currently eligible. Within the table below the five positive buffs share the 45, the five tradeoff buffs share the 45, the three lore calls share the 9, and the two easter eggs share the 1.

**Composition.** Buffs are temporary modifiers and compose multiplicatively with one another and with everything else through the modifier system (ADR-022). All multipliers, durations, costs, ring windows, and thresholds are placeholders pending `Panvitium_Economy_Template.xlsx`; the sheet wins on every number.

**Ring window** is always 10 seconds.

## Entry format

```
### <id>
- Class:       buff-positive | buff-tradeoff | lore | easter-egg
- Weight:      <relative weight in the bag>
- Caller:      <name | Unknown>
- Trigger:     <eligibility predicate and/or seeded cadence>
- Opening:     <line heard on answering>
- Choices:     <Label [req: ...] -> effects>   (always includes a "let it go" that does nothing)
```

Every entry is opportunity-only by the rule above, so no per-entry "on miss" line is needed: missing or declining is always `nothing()`.

* * *

## Positive buffs (clean upside, 45)

### the-cycle-turns

- Class: buff-positive
- Weight: 9
- Caller: Gideon Reyes
- Trigger: none
- Opening: "It's me, and it's good news. The fast food chain is printing money faster than the books can keep up with. I have stopped asking why people cannot put it down. They cannot, and we are the ones holding the plate."
- Choices:
    - [Press the advantage] -> buff(goldGainMul, ×1.5, <med>)
    - [Plough it back into appetite] -> buff(reprobateGenMul, ×1.5, <med>) (more product, more hunger, more of them)
    - [Let it go] -> nothing()

### eager-hands

- Class: buff-positive
- Weight: 9
- Caller: Unknown (an acolyte)
- Trigger: none
- Opening: "There are people at the door again. More than last time. Some of them are hungry for what being yours might lend them, and some of them are just frightened of what happens to the ones who are not yours. Either way, they want in. What do we do with them?"
- Choices:
    - [Take the hungry ones] -> buff(reprobateGenMul, ×1.5, <med>)
    - [Take the frightened ones] -> buff(influenceGainMul, ×1.5, <med>)
    - [Let it go] -> nothing()

### a-good-find

- Class: buff-positive
- Weight: 9
- Caller: Unknown (an acolyte clearing a site)
- Trigger: none
- Opening: "We were turning over the old ground at the new site, like you wanted, and it is giving things up. Odd things. We bet there is more down there, do we keep digging, or do we put it about that we found something?"
- Choices:
    - [Keep digging] -> buff(indagatioEfficiencyMul, ×2, <med>)
    - [Sell the rumour] -> buff(goldGainMul, ×1.5, <med>)
    - [Let it go] -> nothing()

### the-discipline-swells

- Class: buff-positive
- Weight: 9
- Caller: Gideon Reyes
- Trigger: none
- Opening: "The self-improvement racket is having a moment. Clinics full, courses sold out, men paying good money to be told that comfort is the enemy and that the ache means they are winning. I do not understand it and I do not need to. It is the best margin we have run all year."
- Choices:
    - [There could be something there...] -> buff(playerEfficiencyMul, ×1.3, <med>)
    - [I will apply to the acolytes] -> buff(acolyteEfficiencyMul, ×1.4, <med>)
    - [Let it go] -> nothing()
- Notes: Superbia, the pride line; "comfort is the enemy" (05, Newsletter 11). playerEfficiencyMul composes with the other rates (ADR-022) and explicitly excludes the one-for-one cull.

* * *

## Tradeoff buffs (a strong buff bought with a real cost, 45)

### the-looting

- Class: buff-tradeoff
- Weight: 9
- Caller: Gideon Reyes
- Trigger: katabasisCount≥1
- Opening: "I've heard the house is lighter than you left it last time. Some of them helped themselves while you were absent. I can chase it the dull legal way and recover pennies, or..."
- Choices:
    - [Make an example] -> buff(acolyteEfficiencyMul, ×2.0, <med>); resource(influence, -<big>)
    - [Let it go] -> nothing()

### blood-in-the-cage

- Class: buff-tradeoff
- Weight: 9
- Caller: Unknown (an acolyte)
- Trigger: none
- Opening: "Some followers are managing a fight pit, how should we deal with that?"
- Choices:
    - [Lean all the way in] -> buff(goldGainMul, ×2.0, <med>); resource(reprobates, -<big%>)
    - [Let it go] -> nothing()
- Notes: Ira, the wrath line; "who profits when a place turns mean" (05, Newsletter 9). The cost is the corrupted spent before they can be culled, which is future souls lost one for one (00 sec. 3). Stays on trade and temper, never on souls (two-layer).

### the-shipment

- Class: buff-tradeoff
- Weight: 9
- Caller: Unknown (a follower)
- Trigger: none
- Ring window: 30
- Opening: "I can move the whole shipment wherever by end of week. Stuff that makes a person very easy and very still and not much else. If we flood it cheap we hook the place fast. We lose money on the front end and we make it back on the bodies later."
- Choices:
    - [Flood a place] -> buff(reprobateGenMul, ×2, <med>); resource(gold, -<big>)
    - [Let it go] -> nothing()

### a-name-to-burn

- Class: buff-tradeoff
- Weight: 1
- Caller: Unknown
- Trigger: flagFCfriendly=0
- Opening: "LET'S GUT THE SPANISH CUNT"
- Choices:
    - [Always] -> resource(gold, -100%); maxInfluence x 1.1 permanently.
    - [Let it go] -> nothing()

### parish

- Class: buff-tradeoff
- Weight: 9
- Caller: Unknown (one of your hands, reporting)
- Trigger: none
- Opening: "Church has been active last weeks, grief support, charity drives... Pretty sure we could gain something from that"
- Choices:
    - [Work behind the light] -> buff(reprobateGenMul, ×2.0, <med>); debuff(influenceRegenRate, -50%); both for 5 mins.
    - [Patronize] -> buff(reprobateGenMul, ×2.0, <med>) for 5 mins; resource(gold, -<50%>)
    - [Let it go] -> nothing()

* * *

## Lore (narrative, 9)

### dying-soul

- Class: lore
- Weight: 3
- Caller: Unknown
- Trigger: none
- Opening: A voice, wet and frightened. "Please. I don't know how I got this number, I don't even know your name. But it started when your sort came to this county and now it will not stop, the noise will not stop, it will not let me sleep or pray or sit still inside my own head. I'll give you anything. Anything at all. Just make it quiet."
- Choices:
    - [Name a price] -> gamble({ stellar:resource(gold,+<big>), good:resource(gold,+<fair>), neutral:nothing, bad:resource(influence,-<small>) })
    - [Take it now] -> resource(reprobates, -1); resource(souls, +1)
    - [Say nothing] -> nothing()
- Notes: A deliberate elevation of one of the corrupted into a single caller (the corrupted are abstract by default, 00 sec. 9). "Name a price" bleeds them for money; "Take it now" culls this one where they stand, one reprobate for one soul, the only place a call mints a soul and the identity made plain. He has only the symptom and never knows what you are. Keep rare.

### fausto-feeler

- Class: lore
- Weight: 3
- Caller: Fausto Cescru
- Trigger: cadence(~rare) AND totalSinLevel >= <mid> AND flagFCfriendly = 1
- Ring window: 25
- Opening: No greeting, only a dry, patient voice. "You let my letters sit. A lesser man would be insulted, but I am only curious now. I can hear it from here, the speed of you, a whole estate spent into the ground and pulled up out of it again in a single season. No blood on earth moves that fast. So I will ask you plainly, since paper bores you: what did you find?"
- Choices:
    - [Tell him nothing true] -> nothing()
    - [Lie to him] -> nothing()
    - [Hang up] -> nothing()
- Notes: The adversary on the phone (00 sec. 10, sec. 11), sparing and sharp, the one voice that speaks the truth plainly. Characterisation only; inert on the email arc's flags (owned by 05).

* * *

## Easter eggs (rare collectibles, 1)

### the-ward

- Class: easter-egg
- Weight: 0.4
- Caller: Fr. Emil Stahl
- Trigger: none
- Opening: A hospital somewhere. A nurse's voice, low and unhurried, talking someone through the last of it, telling them it is alright, that they can let go now, that they are not alone. A long quiet. Then the kind of stillness you will never be able to lay a hand on.
    It was father Stahl making you hear all of it.
- Choices:
    - [Listen to the end] -> setFlag(heard-the-ward, 1)
    - [Hang up] -> nothing()

### tormented-soul

- Class: easter-egg
- Weight: 0.1
- Caller: Unknown
- Trigger: none
- Opening: A screamer, in howler form.
- Choices:
    - [Hang up] -> nothing()
