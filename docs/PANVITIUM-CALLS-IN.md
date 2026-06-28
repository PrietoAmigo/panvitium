# PANVITIUM: INCOMING CALLS CATALOG (calls-in)

Canonical, single-source list of every call you can RECEIVE and the event it opens when answered. One entry per incoming call, fixed format. A call RINGS for a 15 s window during active play only (never offline; the phone is dark during Katabasis, see `06-smartphone-content.md`). Weights and magnitudes are sheet-pinned placeholders.

**Implementation status.** The calls-in *front-end* is built: the catalogue lives in `apps/web/src/menus/calls-in.data.ts`, the copy in `strings.phone.callIn.<id>`, selection/eligibility in `apps/web/src/game/callIn.ts`, the arrival scheduler in `useIncomingCall`, and answering raises the "voice in the room" overlay (`SmartphoneCallIn`). The *effect engine* is still pending — the planned `CALL_TRIGGERS → INTERACTIONS` wiring and the `-> effects` on every choice below are **not yet applied: answering a call changes no game state today** (the same documented-stub posture as the email replies). The choice effects below are the spec for that engine. See "Implementation notes" at the foot of this file for the flags, the cadence/recency settings, and the determinism caveat.

**Out of scope: sigils and Princes.** Sigils and the Princes are never interacted with from earth. They belong to the altar and the descent, not to a phone on a desk. So no call here frames a reward as binding a soul to a sigil, feeding a seal, or giving Devotion to a Prince. The phone speaks only of the mundane vice lines, the invocations, the household and its culling, the search, money, and standing.

* * *

## Selection model

**Cadence (as built).** A call arrives once every **10 minutes** of eligible active play — paced, not random bursts. It rings only while you are in the Studio (it keeps ringing, audibly, behind an open Studio menu); leaving the Studio or letting the 15 s window lapse misses it. A **recency cooldown** keeps the same call from recurring within 5 calls (the scheduler suppresses the last 4 callers from the draw; best-effort — it relaxes the cooldown rather than fall silent if too few calls are eligible).

When an incoming call fires (active play only), the caller is drawn from a weighted bag, all calls inside a same class have the same weight, but some could have requirements stopping them from being eligible. **Only calls whose Requirements are met are eligible**, and once-only calls already received are excluded; the bag is drawn as class buckets whose weights renormalise when a bucket empties (so the splits below hold over whatever is actually eligible):

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

**Ring window** is always 15 seconds, after which the call is missed (opportunity-only). Walking out of the Studio mid-ring also misses it.

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
    - [Press the advantage] -> buff(goldGainMul, ×1.33, 1 hour)
    - [Spend it on marketing] -> buff(reprobateGenMul, ×1.33, 1 hour)
    - [Let it go] -> nothing()

### eager-hands

- Class: buff-positive
- Caller: Acolyte
- Requirements: none
- Choices:
    - [Take the hungry ones] -> buff(reprobateGenMul, ×1.33, 1 hour)
    - [Take the frightened ones] -> buff(influenceGainMul, ×1.33, 1 hour)
    - [Let it go] -> nothing()

### a-good-find

- Class: buff-positive
- Caller: Acolyte
- Requirements: none
- Choices:
    - [Keep digging] -> buff(indagatioEfficiencyMul, ×2, 1 hour)
    - [Sell the rumour] -> buff(goldGainMul, ×1.25, 1 hour)
    - [Let it go] -> nothing()

### the-discipline-swells

- Class: buff-positive
- Caller: Gideon Reyes
- Requirements: none
- Choices:
    - [There could be something there...] -> buff(playerEfficiencyMul, ×1.33, 1 hour)
    - [I will apply to the acolytes] -> buff(acolyteEfficiencyMul, ×1.33, 1 hour)
    - [Let it go] -> nothing()
 
### doing-nothing

- Class: buff-positive
- Caller: Mai
- Requirements: none
    - [I will join them] -> buff(offlineRate, ×3.0, 8 hours).
    - [Kill them] -> Kills 10% current reprobates.
    - [Let it go] -> nothing()

* * *

## Tradeoff buffs (a strong buff bought with a real cost, 45)

### the-looting

- Class: buff-tradeoff
- Caller: Gideon Reyes
- Requirements: katabasisCount≥1
- Choices:
    - [Make an example] -> buff(acolyteEfficiencyMul, ×2.0, 1 hour); resource(influenceRegen, /1.5, 1 hour)
    - [Let it go] -> nothing()

### blood-in-the-cage

- Class: buff-tradeoff
- Caller: Acolyte
- Requirements: none
- Choices:
    - [Show me the money] -> buff(goldGainMul, ×2.0, 1 hour); resource(reprobates, -10)
    - [Let it go] -> nothing()

### the-shipment

- Class: buff-tradeoff
- Caller: Acolyte
- Requirements: none
- Choices:
    - [Flood a place] -> buff(reprobateGenMul, ×2, 1 hour); resource(gold, -33%)
    - [Let it go] -> nothing()

### a-name-to-burn

- Class: buff-tradeoff
- Caller: Acolyte
- Requirements: flagFCThreatSent=1
- Choices:
    - [Always, with everything] -> resource(gold, -100%); maxInfluence x 1.1 permanently.
    - [Let it go] -> nothing()

### parish

- Class: buff-tradeoff
- Caller: Acolyte
- Requirements: none
    - [Work behind the light] -> buff(reprobateGenMul, ×2.0, 1 hour); debuff(influenceRegenRate, -50%, 1 hour).
    - [Patronize] -> buff(reprobateGenMul, ×2.0, 1 hour); resource(gold, -<50%>).
    - [Let it go] -> nothing()
 
### ministry

- Class: buff-tradeoff
- Caller: Mai
- Requirements: none
    - [Let's push it] -> buff(influenceRegenRate, ×2.0, 1 hour); debuff(reprobateGenMul, -50%, 1 hour).
    - [Let them kill everyone] -> Kills 15% of current reprobates.
    - [Let it go] -> nothing()
 
### social-platform

- Class: buff-tradeoff
- Caller: Mai
- Requirements: none
    - [Keep these retards hooked] -> buff(influenceRegenRate, ×2.0, 1 hour); debuff(reprobateGenMul, -50%, 1 hour).
    - [New features!] -> buff(influenceRegenRate, ×2.0, 1 hour); resource(gold, -50%).
    - [Let it go] -> nothing()

* * *

## Lore (narrative, 9)

### the-ward

- Class: lore
- Caller: Father Emil Stahl
- Requirements: having received all three set-up emails — Parish bulletin #1 (`parish-1`), Parish bulletin #2 (`parish-2`), and Father Emil Stahl's second letter (`fr-stahl-2`). The inbox is a permanent, per-email "received" record (deduped, survives deletion, persists across Katabasis), so each one's presence in the inbox is its "received" flag; the call requires all three.
- Choices:
    - [Listen to the end] -> setFlag(heard-the-ward, 1)
    - [Hang up] -> nothing()
 
### the-journalist

- Class: lore
- Caller: Marina Zhao
- Requirements: katabasisCount≥5 and flagFCThreatSent=1
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
- Requirements: flagFCThreatSent=0
- Choices:
    - [No, thanks.] -> nothing()
    - [Expello te, succube.] -> nothing()
 
### astiwihad

- Class: lore
- Caller: Unknown
- Requirements: flagFCThreatSent=1
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
    - [Mmm... how much cheaper?] -> nothing()

* * *

## Implementation notes (flags, settings, peculiarities)

How the built calls-in front-end reconciles with this catalogue. The numbers are placeholders pending `Panvitium_Economy_Template.xlsx`; the behaviour is what currently ships.

**Catalogue parity.** All 18 entries above are wired, each a **recording** — `apps/web/public/assets/panvitium/music/<id>.mp3` (e.g. `the-cycle-turns.mp3`, `succubus.mp3`, `ISP-change.mp3`). There are **no typed calls** in the catalogue: the design prototype's typed lines (`dying-soul`, `fausto-feeler`) are not canonical and were dropped, though the overlay retains a typewriter mode for any future fileless call.

**Settings.**

- **Cadence:** one call per **10 minutes** of eligible active play (`GAP_MS` in `useIncomingCall`).
- **Ring window:** **15 s**, then missed (`RING_WINDOW_MS`).
- **Recency cooldown:** the same call rings at most **once every 5 calls** — the last 4 callers are excluded from the draw (`RECENT_WINDOW = 4`), best-effort (relaxed before it would starve the line).
- **Weights:** class buckets 49 % buff (25 positive / 24 tradeoff) / 50 % lore / 1 % easter egg (`CLASS_WEIGHT`), renormalised over non-empty buckets.

**Where it rings.** Studio only; it keeps ringing (audibly) behind an open Studio menu (PC, Suasio, dialer). Tapping the phone answers and takes priority over dialling out. Not in the title, not during Katabasis, not while another call is on the line.

**Flags (as implemented).**

- `katabasisCount` — read from top-level game state (gates `the-looting` ≥1, `the-journalist` ≥5).
- `flagFCThreatSent` — the Fausto branch (`lifetime.flagFCThreatSent`, set when the threat reply to Fausto #1 is sent). `flagFCThreatSent=0` is the friendly branch, `=1` the hostile one, so Succubus (`=0`) and Astiwihad / `a-name-to-burn` / `the-journalist` (`=1`) are mutually exclusive.
- Emails — `the-ward` is gated on `fr-stahl-2`, `parish-1`, and `parish-2` all sitting in the inbox (see its entry); inbox membership is the permanent per-email "received" record.
- `heard-the-ward` and other `setFlag(...)` effects are part of the pending effect engine and are **not** written yet.

**Once-only.** Lore and easter-egg calls are consumed on **answer** (not on a miss), so a missed once-only call can ring again; an answered one never does.

**Determinism (ADR-011).** The scheduler draws from `Math.random`, **not** the sim's seeded PRNG, and applies no effects — so it does not advance the RNG stream or alter the save. A save's sequence is identical whether or not a call rang. When the effect engine lands, the trigger/draw should move into the tick (deterministic + offline-correct) and the per-session "seen" set and recency buffer should be persisted (ADR-023 additive-optional).
