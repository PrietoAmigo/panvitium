# PANVITIUM: INCOMING CALLS CATALOG (calls-in)

Canonical, single-source list of every call you can RECEIVE and the event it opens when answered. One entry per incoming call, fixed format. Engine: each is a `CALL_TRIGGERS` row pointing at an `INTERACTIONS` entry; copy lives in `strings` (`calls.<id>.caller|opening|choice.<choiceId>`). A call RINGS for its ring window during active play only (never offline; the phone is dark during Katabasis, see `06-smartphone-content.md`). Weights and magnitudes sheet-pinned.

**Out of scope: sigils and Princes.** Sigils and the Princes are never interacted with from earth. They belong to the altar and the descent, not to a phone on a desk. So no call here frames a reward as binding a soul to a sigil, feeding a seal, or giving Devotion to a Prince. The phone speaks only of the mundane vice lines, the invocations, the household and its culling, the search, money, and standing.

* * *

## Selection model

When an incoming call fires (active play only), the caller is drawn from a weighted bag, all calls inside a same class have the same weight, but some could have requirements stopping them from being eligible:

- **49% a buff call**:
    - **25% a completely positive buff.** Clean upside. You choose which upside, and every option is good. The only way to lose is to let it go.
    - **24% a big tradeoff buff.** A strong buff bought with a real, painful cost. You choose your cost (or which strong-buff-plus-cost), or you let it go.
- **50% a lore call.** Narrative and atmosphere, no mechanical effect. Lore calls can only be received once.
- **1% an easter egg.** A rare collectible, no mechanical reward. Easter egg calls can only be received once.

Every incoming call is an opportunity. You may always take it or let it go, and letting it go (or missing it, or declining) costs nothing. There are no punitive incoming calls: the phone never fines you, only ever offers.

**The choices are based on lore.** A buff is never a bare number. Each call has a diegetic reason it exists (a cull went clean, a vice line is booming, the adversary is making noise you can work behind), and each take-option is the in-fiction shape of that reason. The parentheticals on every choice below are that reason, and they are load-bearing: if a buff cannot be justified from the fiction it does not belong in this catalogue.

**The cull is one for one, and nothing buffs it.** One reprobate equals one soul, fixed. Soul-gain multipliers are forbidden, and so is any multiplier on cull yield, because both would break that identity. Souls enter the game only by culling the corrupted, one soul per reprobate, and no call changes that ratio. So buffs act only on the upstream and the side economies:

A call may also hand you reprobates or money directly. The only place a call grants a soul is by culling a reprobate you already hold, one for one (see `dying-soul`).

**Composition.** Buffs are temporary modifiers and compose multiplicatively with one another and with everything else through the modifier system (ADR-022). All multipliers, durations, costs, ring windows, and thresholds are placeholders pending `Panvitium_Economy_Template.xlsx`; the sheet wins on every number.

**Ring window** is always 15 seconds.

## Entry format

```
### <id>
- Class:       buff-positive | buff-tradeoff | lore | easter-egg
- Weight:      <relative weight in the bag>
- Caller:      <name | Unknown>
- Requirements:     <eligibility predicate and/or seeded cadence>
- Choices:     <Label [req: ...] -> effects>   (always includes a "let it go" that does nothing)
```

Every entry is opportunity-only by the rule above, so no per-entry "on miss" line is needed: missing or declining is always `nothing()`.

* * *

## Positive buffs (clean upside, 45)

### the-cycle-turns

- Class: buff-positive
- Caller: Gideon Reyes
- Requirements: none
- Choices:
    - [Press the advantage] -> buff(goldGainMul, ×1.5, <med>)
    - [Plough it back into appetite] -> buff(reprobateGenMul, ×1.5, <med>) (more product, more hunger, more of them)
    - [Let it go] -> nothing()

### eager-hands

- Class: buff-positive
- Caller: Acolyte
- Requirements: none
- Choices:
    - [Take the hungry ones] -> buff(reprobateGenMul, ×1.5, <med>)
    - [Take the frightened ones] -> buff(influenceGainMul, ×1.5, <med>)
    - [Let it go] -> nothing()

### a-good-find

- Class: buff-positive
- Caller: Acolyte
- Requirements: none
- Choices:
    - [Keep digging] -> buff(indagatioEfficiencyMul, ×2, <med>)
    - [Sell the rumour] -> buff(goldGainMul, ×1.5, <med>)
    - [Let it go] -> nothing()

### the-discipline-swells

- Class: buff-positive
- Caller: Gideon Reyes
- Requirements: none
- Choices:
    - [There could be something there...] -> buff(playerEfficiencyMul, ×1.3, <med>)
    - [I will apply to the acolytes] -> buff(acolyteEfficiencyMul, ×1.4, <med>)
    - [Let it go] -> nothing()
 
### doing-nothing

- Class: buff-positive
- Caller: Mai
- Requirements: none
    - [I will join them] -> buff(offlineRate, ×2.0, 8 hours).
    - [Kill them] -> Kills 1% current reprobates.
    - [Let it go] -> nothing()

* * *

## Tradeoff buffs (a strong buff bought with a real cost, 45)

### the-looting

- Class: buff-tradeoff
- Caller: Gideon Reyes
- Requirements: katabasisCount≥1
- Choices:
    - [Make an example] -> buff(acolyteEfficiencyMul, ×2.0, <med>); resource(influenceRegen, /1.5, <med>)
    - [Let it go] -> nothing()

### blood-in-the-cage

- Class: buff-tradeoff
- Caller: Acolyte
- Requirements: none
- Choices:
    - [Show me the money] -> buff(goldGainMul, ×2.0, <med>); resource(reprobates, -<big%>)
    - [Let it go] -> nothing()

### the-shipment

- Class: buff-tradeoff
- Caller: Acolyte
- Requirements: none
- Choices:
    - [Flood a place] -> buff(reprobateGenMul, ×2, <med>); resource(gold, -<big>)
    - [Let it go] -> nothing()

### a-name-to-burn

- Class: buff-tradeoff
- Caller: Acolyte
- Requirements: flagFCfriendly=0
- Choices:
    - [Always] -> resource(gold, -100%); maxInfluence x 1.1 permanently.
    - [Let it go] -> nothing()

### parish

- Class: buff-tradeoff
- Caller: Acolyte
- Requirements: none
    - [Work behind the light] -> buff(reprobateGenMul, ×2.0, <med>); debuff(influenceRegenRate, -50%); both for 15 mins.
    - [Patronize] -> buff(reprobateGenMul, ×2.0, <med>); resource(gold, -<50%>); both for 15 mins.
    - [Let it go] -> nothing()
 
### ministry

- Class: buff-tradeoff
- Caller: Mai
- Requirements: none
    - [Let's push it] -> buff(influenceRegenRate, ×2.0, <med>); debuff(reprobateGenMul, -50%); both for 15 mins.
    - [Let them kill everyone] -> Kills 15% of current reprobates.
    - [Let it go] -> nothing()
 
### social-platform

- Class: buff-tradeoff
- Caller: Mai
- Requirements: none
    - [Keep these retards hooked] -> buff(influenceRegenRate, ×2.0, <med>); debuff(reprobateGenMul, -50%); both for 15 mins.
    - [New features!] -> buff(influenceRegenRate, ×2.0, <med>); resource(gold, -<50%>); both for 15 mins.
    - [Let it go] -> nothing()

* * *

## Lore (narrative, 9)

### the-ward

- Class: lore
- Caller: Father Emil Stahl
- Requirements: Having received the following emails: Parish Newsletter #1, Parish Newsletter #1, Father Emil Stahl #5.
- Choices:
    - [Listen to the end] -> setFlag(heard-the-ward, 1)
    - [Hang up] -> nothing()
 
### the-journalist

- Class: lore
- Caller: Marina Zhao
- Requirements: katabasisCount≥5 and flagFCfriendly=0
- Choices:
    - [Literally FUCK YOUR OWN FACE] -> nothing()
    - [Literally FUCK YOUR OWN FACE] -> nothing()
    - [Literally FUCK YOUR OWN FACE] -> nothing()
    - [Literally FUCK YOUR OWN FACE] -> nothing()
    - [Literally FUCK YOUR OWN FACE] -> nothing()
    - [Literally FUCK YOUR OWN FACE] -> nothing()
    - [Literally FUCK YOUR OWN FACE] -> nothing()
    - [Literally FUCK YOUR OWN FACE] -> nothing()
 
### succubus

- Class: lore
- Caller: Unknown
- Requirements: flagFCfriendly=1
- Choices:
    - [No, thanks.] -> nothing()
    - [Expello te, succube.] -> nothing()
 
### astiwihad

- Class: lore
- Caller: Unknown
- Requirements: flagFCfriendly=0
- Choices:
    - [No, thanks.] -> nothing()
    - [Nullam in me potestatem habes, Astiwihad.]  -> nothing()

* * *

## Easter eggs (rare collectibles)

### tormented-soul

- Class: easter-egg
- Caller: Unknown
- Requirements: none
- Choices:
    - [Hang up] -> nothing()
 
### ISP-change

- Class: easter-egg
- Caller: Unknown
- Requirements: none
- Choices:
    - [Literally FUCK YOUR OWN FACE (Hang up)] -> nothing()
