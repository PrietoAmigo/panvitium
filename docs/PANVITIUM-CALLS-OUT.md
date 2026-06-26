# PANVITIUM: OUTGOING CALLS CATALOG (calls-out)

Canonical, single-source list of every call you can PLACE and the event it opens. One entry per dialable number, fixed format. Engine: each is a `CONTACTS` row `{ id, number, interactionId, callCost?, cooldownSeconds?, reusable, hidden? }` resolving to an `INTERACTIONS` entry; copy lives in `strings` (`calls.<id>.caller|opening|choice.<choiceId>`). Outgoing calls are player-driven, with no pacing pressure, gated only by cooldown / maximum times. Numbers sheet-pinned.

**How a number enters your phone.** Two ways, all owned by `06-smartphone-content.md`:

- **Granted.** An email.

- **Hidden.** The digits surface somewhere in the phone's own content (a corrupted voicemail, a line scrawled in the Notes app). You type them on the keypad; a correct hidden number reveals the contact thereafter.

- Calls out do not have a direct cost.


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
