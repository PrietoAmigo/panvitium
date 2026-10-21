# PANVITIUM: OUTGOING CALLS CATALOG (calls-out)

Canonical, single-source list of every call you can PLACE and the event it opens. One entry per dialable number, fixed format. Engine: each is a `CONTACTS` row `{ id, number, interactionId, callCost?, cooldownSeconds?, reusable, hidden? }` resolving to an `INTERACTIONS` entry; copy lives in `strings` (`calls.<id>.caller|opening|choice.<choiceId>`). Outgoing calls are player-driven, with no pacing pressure, gated only by cooldown / maximum times. Numbers sheet-pinned.

**How a number enters your phone.** Two ways, all owned by `06-smartphone-content.md`:

- **Granted.** An email.

- **Hidden.** The digits surface somewhere in the game's own content (a corrupted voicemail, a line scrawled in the Notes app, a subliminal plate). You type them on the keypad; a correct hidden number reveals the contact thereafter.

- Calls out do not have a direct cost.

**Implementation status.** The first outgoing call (`the-rectory`) is built on a minimal engine; the `CONTACTS` / `INTERACTIONS` shape above is still the target for the rest. As built:

- **Sim.** `CALL_OUTS` in `packages/sim/src/phone.ts` holds `{ id, number, oneShot }`. The dialer submits through the store's `dial`, which calls the sim's `dialNumber`: a call-out number connects and records the call in the permanent top-level `callsPlaced` list (additive-optional, ADR-023; carried across Katabasis; persisted at once). A one-shot line dialled again after it was placed rings out unanswered (an `info` toast with its own copy keyed by the number). What a call sets in motion keys off `callsPlaced` (an email's `eligible`), so the call itself applies no other state. No RNG is drawn.
- **Stage.** A connected call closes the dialer and plays on the incoming-call stage (`SmartphoneCallIn`, labelled "Outgoing call"). Its structural row lives in `apps/web/src/menus/calls-out.data.ts` (`{ id, audio, recording?, skippable?, choices }`), its copy in `strings.phone.callOut.calls.<id>` (`title`, `tag`, `line`, `choices`). A call is a conversation in beats, shared with the incoming calls: a choice may carry a `next` beat (the caller's next recording, or a silence) with its own choices, and a beat with no choices ends the call. A recording plays `music/<recording>.mp3`; if it is missing or cannot play, the stage writes out that beat's typed `line` (its transcript) instead.
- **Choices.** Outgoing-call choices carry no effects yet: the call's work is done when it connects.


## Entry format

```
### <id>
- Number:      <digits>
- Source:      <granted by mail| hidden (found in <06 source>)>
- Type:        one-shot | recurring (cooldown <sec>)
- Requirement: <predicate | none>
- Opening:     <line heard when they pick up>
- Choices:     <Label [req: ...] -> effects>
- Notes:       <text | none>
```

* * *

### gideon

- Number: granted by email
- Source: Gideon's email after first katabasis
- Type: recurring (once per katabasis)
- Requirement: none
- Opening: "What do you need?"
- Choices:
    - [Draw on the book] -> 1.1 goldGainMultiplier until next katabasis
    - [Have the house watched] -> +10% gold, reprobates and maleficia remaining on next katabasis.
    - [Hang up] -> nothing(), does not consume the single Gideon call per Katabasis

### noise

### the-rectory

- Number: 982079
- Source: hidden (the code plates: `sublcode_1` shows 982 gouged into plaster, `sublcode_2` shows 079 written in blood on parchment, two of the random subliminal flashes, read in that order). They flash only from Father Stahl's first letter (`fr-stahl-1`) until his call (`the-ward`) has been answered, each ten times likelier than any other plate meanwhile, and held 160 ms (the other plates 100 ms). The plates are Clare Ashby's last days surfacing as the player's own flashbacks; see `00-lore-bible.md` §11.
- Type: one-shot (dialled again: "The rectory line rings out. No one answers.")
- Requirement: none. It connects at any point in the game, however early.
- Caller shown: the number, "982 079".
- Opening (Fr. Anselm Greaves, pastor emeritus of St. Dymphna's; `father_anselm_1.mp3`): "Father Anselm speaking."
- Choices:
    - [Scratches on a wall, tells you something?] -> Father Anselm answers (`father_anselm_2.mp3`): "I take it you're a journalist, I already had my decent share of you long time ago. Let me rest, please."
        - [Apologies. In case you have more information, here's my email [...]] -> the call ends.
- Effect: connecting the call arms Father Greaves's letter (`fr-greaves-1`, "Ashby file", 3 minutes later, `05-email-content.md`), whose arrival (with the Imperium rite unlocked) opens the Imperium answer to Father Stahl's call (`the-ward`, `PANVITIUM-CALLS-IN.md`). Nothing on the call itself applies state.
- Notes: the letter arrives whenever the call is placed: early in the game, or after `the-ward` has already been answered (then it only tells the story, for the next playthrough). The call is skippable like any incoming call. The number keeps working after the plates stop: a player who wrote it down can still dial it, then only for the story.
