# PANVITIUM — INCOMING CALLS CATALOG (calls-in)

Canonical, single-source list of every call you can RECEIVE and the event it opens when answered.
One entry per incoming call, fixed format. Engine: each is a `CALL_TRIGGERS` row pointing at an
`INTERACTIONS` entry; copy lives in `strings` (`calls.<id>.caller|opening|choice.<choiceId>`).
A call RINGS for `ring window` seconds during active play (never offline). Missing/declining is
opportunity-only UNLESS `On miss` lists a consequence (rare, explicit). Numbers sheet-pinned.

## Effect verbs (shared by emails + calls)
`resource(kind, ±amt)` souls|gold|influence|maleficia|reprobates · `buff(field, ×m|+n, sec)` ·
`gamble(perTier)` draw via resolveTier · `grantContact(id)` · `scheduleEmail(id, delaySec?)` ·
`scheduleCall(id, withinSec?)` · `setFlag(key, val=1)` · `nothing()`

## Entry format
```
### <id>
- Caller:      <name | Unknown>
- Trigger:     <predicate and/or seeded cadence>
- Ring window: <seconds>
- On miss:     opportunity-only | <missConsequence effects>
- Opening:     <line heard on answering>
- Choices:     <Label [req: …] → effects>
- Notes:       <—>
```

---

### dying-soul
- Caller:      Unknown
- Trigger:     cadence(~rare) AND totalReprobates >= 25
- Ring window: 30
- On miss:     opportunity-only
- Opening:     A voice, wet and frightened: "Please — I know what you are. I'll give you anything. Just tell me how to make it stop."
- Choices:
  - [Name a price]    → gamble({ stellar:+resource(souls,3), good:+resource(souls,1), neutral:nothing, bad:resource(influence,-small) })
  - [Take it now]     → resource(souls, +1); resource(reprobates, -1)
  - [Say nothing]     → nothing()
- Notes:   "Say nothing" lets it ring out as if missed.

### enforcer  (the explicit exception)
- Caller:      Unknown
- Trigger:     flag.debt >= 1   (set by a prior choice that borrowed against the future)
- Ring window: 15
- On miss:     resource(gold, -<penalty>)   ← rare, content-justified missConsequence
- Opening:     "You borrowed. You knew the terms. I'm outside the terms now."
- Choices:
  - [Pay up]     [req: gold >= <due>] → resource(gold, -<due>); setFlag(debt, 0)
  - [Stall]      → gamble({ good:setFlag(debt,0), neutral:scheduleCall(enforcer, 120), bad:resource(gold,-<penalty2>) })
- Notes:   The one place "ignoring" bites; always seeded by an earlier player choice.

### wrong-number  (easter egg)
- Caller:      Unknown
- Trigger:     cadence(very rare)
- Ring window: 20
- On miss:     opportunity-only
- Opening:     Static. Then a child counting, slowly, in Latin. Then your own voice, a beat behind.
- Choices:
  - [Listen] → setFlag(heard-the-counting, 1)   (pure lore / achievement hook)
  - [Hang up] → nothing()
- Notes:   No mechanical reward; flavor + a collectible flag.
