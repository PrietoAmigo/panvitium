# PANVITIUM — OUTGOING CALLS CATALOG (calls-out)

Canonical, single-source list of every call you can PLACE and the event it opens. One entry per
dialable number, fixed format. Engine: each is a `CONTACTS` row `{ id, number, interactionId,
callCost?, cooldownSeconds?, reusable, hidden? }` resolving to an `INTERACTIONS` entry; copy lives in
`strings` (`calls.<id>.caller|opening|choice.<choiceId>`). A number is either GRANTED by an email or
HIDDEN (digits found in flavor, typed on the keypad). Outgoing calls are player-driven — no pacing
pressure — gated only by cost/cooldown. Numbers sheet-pinned.

## Effect verbs (shared by emails + calls)
`resource(kind, ±amt)` souls|gold|influence|maleficia|reprobates · `buff(field, ×m|+n, sec)` ·
`gamble(perTier)` draw via resolveTier · `grantContact(id)` · `scheduleEmail(id, delaySec?)` ·
`scheduleCall(id, withinSec?)` · `setFlag(key, val=1)` · `nothing()`

## Entry format
```
### <id>
- Number:      <digits | —>
- Source:      <granting email id | hidden (found in <email id>)>
- Type:        one-shot | recurring (cooldown <sec>)
- Call cost:   <resource amount | —>
- Requirement: <predicate | —>
- Opening:     <line heard when they pick up>
- Choices:     <Label [req: …] → effects>
- Notes:       <—>
```

---

### fixer
- Number:      —
- Source:      the-fixer (email)
- Type:        recurring (cooldown 300)
- Call cost:   gold <fee>
- Requirement: —
- Opening:     "You have my number, so you have a problem. Don't narrate it. Tell me what you want gone."
- Choices:
  - [Buy silence] → resource(gold, -<fee>); setFlag(scrutiny-defused, 1)
  - [Buy a name]  [req: gold >= <fee2>] → resource(gold, -<fee2>); grantContact(<one-shot-lead>)
  - [Hang up]     → nothing()
- Notes:   "Buy a name" is how the contact web grows; each lead is a fresh one-shot calls-out entry.

### appraiser
- Number:      —
- Source:      the-appraiser (email)
- Type:        recurring (cooldown 120)
- Call cost:   —
- Requirement: —
- Opening:     "Cassian. You found something, or you wouldn't be calling. Describe it. Lie and I'll know."
- Choices:
  - [Sell a curio] [req: maleficiaOwned >= 1] → resource(maleficia, -1); gamble({ stellar:resource(gold,+huge), good:resource(gold,+big), neutral:resource(gold,+fair), bad:resource(gold,+poor) })
  - [Ask what sells] → setFlag(appraiser-tip, 1)   (hints next worthwhile Indagatio target)
  - [Hang up]        → nothing()
- Notes:   The diegetic Emptio-by-phone; sell rate is tier-drawn.

### mara-pact
- Number:      —
- Source:      mara-line (granted by email mara-2 on Agree)
- Type:        one-shot
- Call cost:   —
- Requirement: flag.mara >= 2
- Opening:     She doesn't say hello. "You called. Then you mean it. Say the words, and don't stop halfway."
- Choices:
  - [Speak the words] → buff(playerEfficiencyMul, ×1.25, <long>); setFlag(mara, 3)   (contact burns)
  - [Say nothing]     → nothing()
- Notes:   Completes the email→number→call loop. Burns on sealing; until then you may call again.

### the-hollow   (hidden / easter egg)
- Number:      066·613·1307
- Source:      hidden (found in email do-not-dial)
- Type:        one-shot
- Call cost:   —
- Requirement: —  (must be typed on the keypad; reveals contact thereafter)
- Opening:     It picks up before it rings. No voice. Only the sound of a room you have never been in, breathing.
- Choices:
  - [Listen]  → setFlag(answered-the-hollow, 1)   (lore / achievement; opportunity-only by default)
  - [Hang up] → nothing()
- Notes:   Whether it ever bites is a content call; default is harmless lore per the locked ADR.
