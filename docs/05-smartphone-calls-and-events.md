# 05 — Email, the Smartphone, and Interactive Events

> Two channels, both event-bearing. **Email** (on the PC) is the _written_ channel: feedback, lore,
> easter eggs, numbers to dial, and — crucially — conversations you can **answer**, where answering
> can trigger events and the thread is kept. **The phone** is the _voice_ channel, **calls only**:
> calls you receive (timed; they fizzle if you don't pick up) and calls you place (to numbers email
> gave you, plus hidden lore numbers). Both resolve into one shared **Choice/effect** core.
>
> This doc defines the device mechanics and the data frame. The message/call _content_ (copy +
> what each choice does) is the next deliverable. Numbers are placeholders for the economy sheet;
> all player-facing copy is keyed in `strings` by id (ADR-020), like the existing email engine.

## 0. The two channels, and how they divide

Panvitium already has an **email** engine (`packages/sim/src/emails.ts`): `EmailTrigger
{id, trigger(state)}` fires a `ReceivedEmail {id, receivedAt, readAt}` once when a predicate flips,
`deliverEmails` runs in the tick, `unreadCount` drives a badge, and copy lives in `strings` by id.
Today those emails are one-way. This doc makes email **two-way and threaded**, and adds the phone as
a **new, voice-only device**.

The split is by medium, not by importance — **both channels carry events**:

- **Email = written.** Read on the PC. Async, persistent (emails don't expire). Some are pure
  flavor; some report consequences; some hand you a number; some you can **answer**, and answering
  can trigger an event and continue a conversation thread.
- **Phone = voice.** A new device. **Calls only — no texts are ever sent or received on it.** You
  **receive** calls (timed; pick up before the ring window ends or it fizzles) and you **place**
  calls (to numbers you got by email, or to hidden numbers you discover).

## 1. Email — the written channel

### 1.1 Kinds of email

A single `EmailDef` covers all of these by which optional fields it carries; the "kind" is mostly a
content/flavor tag for filtering and presentation:

- **Easter egg** — hidden flavor; may set a flag, grant an achievement, or reveal a **hidden number**
  (§3.2). No economic effect.
- **Consequence / informative** — the existing one-way feedback: the World reacting to what you do
  (newsletters as corruption spreads, complaints, class-actions).
- **Lore** — worldbuilding; one-way.
- **Info + number** — informative _and_ grants a dialable **Contact** (`grants: contactId`). The hook
  into the phone.
- **Answerable** — carries **replies** (a `Choice[]`); answering can trigger an event _and_ continue
  a thread.

These compose: an email can be lore _and_ grant a number, or answerable _and_ grant a number.

### 1.2 Answering, and threads

An answerable email's reply is a `Choice` (§4). Picking one:

- applies its `effect` (resource delta, timed buff, tier gamble, **grant a number**, **schedule an
  incoming call**, set a flag, etc. — answering an email can trigger anything a call can),
- records `repliedChoice` on the email,
- and typically makes a **follow-up email eligible** — the sender writes back.

**Threading is conversation-by-trigger.** Each email may carry a `threadId`; the UI groups a
`threadId` into one conversation (received beats + your chosen replies shown inline). Follow-ups are
just ordinary catalog emails whose `trigger` reads the flag your reply set (e.g. _"replied `accept`
to `mara-1`"_). So a conversation is a chain of flag-gated emails — no new engine, just the trigger
predicates you already use, reading reply flags. A thread ends when no follow-up is eligible.

## 2. The phone — the voice channel

### 2.1 Receiving calls (timed)

An incoming call **rings** for a bounded window. You **Answer** (open the interaction now) or it
**fizzles** into a missed call when the window elapses; **Decline** is the same as not answering.

- **Default: missing/declining costs nothing** — only the upside is lost.
- **But a specific call MAY declare a consequence** (`missConsequence`) applied on fizzle/decline —
  used sparingly and only when the content calls for it (a threat you ignored, a deadline you
  blew). This is the explicit exception, not the rule.
- Calls **do not ring while offline** — they're an active-play beat. A call may re-ring later or
  expire forever, per its def.

### 2.2 Placing calls

You **dial a number** to open its interaction on your own initiative. Dialable numbers come from two
places (§3): numbers **granted by email**, and **hidden numbers** you discover. A contact may carry a
`callCost` and a `cooldownSeconds`; one-shot contacts burn after the call resolves, recurring ones
stay.

## 3. Numbers

### 3.1 Granted numbers — the loop

```
email (PC)  ──grants──▶  Contact (a number)
       Contact  ──you dial when ready──▶  call interaction (choices)
       interaction  ──resolves to──▶  resources · timed buff · tier-gamble · ANOTHER number/email
```

A number is a key. Email hands it over; the phone is where you turn it. The map of numbers you
assemble is a set of levers you pull on demand.

### 3.2 Hidden numbers — lore / easter eggs

A set of Contacts marked `hidden` are **not** granted by email and **don't appear** in the contacts
list. You learn them by reading — a lore email, an item description, a degraded scrap of flavor names
a number — and you **type it on the keypad**. Dialing the right digits unlocks an easter-egg
interaction (and reveals the contact thereafter). This rewards close reading and gives lore a
mechanical payoff. The keypad therefore accepts free entry, resolving typed digits against both known
and hidden contacts.

## 4. The shared Choice / effect core

Email replies and call interactions use the **same** primitive, so authoring a decision is identical
regardless of channel:

```
Choice {
  id
  requirement?(state): bool                 // gate on resources / Sin level / a flag
  effect(state, rng): { state, event }       // mirrors resolveAction; returns an OutcomeEvent
}
InteractionDef { id; prompt(strings key); choices: Choice[]; expirySeconds? }   // used by calls
// answerable emails carry `replies: Choice[]` inline
```

A `Choice.effect` draws only on primitives you have or are adding for rites:

- **Instant resource delta** — souls / gold / influence / maleficia / reprobates.
- **Timed modifier** — into the shared temporary-effect layer that `computeModifiers` folds in
  (ADR-022); a buff is just a contributor that expires.
- **Tier gamble** — `resolveTier` for variance (great vs backfire).
- **Flags / unlocks** — `grantContact(id)`, `scheduleEmail(id)` / `scheduleCall(id)`,
  `setFlag(key)`. This is how answering an email "triggers an event": its reply can ring your phone,
  open a thread, or arm a future consequence.

Every choice returns an `OutcomeEvent`, so resolutions flow through the existing log and signature
pop-ups for free.

## 5. State (all additive-optional — ADR-023 safe)

Extend the email entry; add the phone's state:

- **`inbox: ReceivedEmail[]`** — each entry gains optional `threadId`, `repliedChoice`. (No expiry:
  emails persist.) The existing one-way emails are unaffected.
- **`flags: Record<string, number>`** — story / conversation / discovery flags (reply taken, thread
  beat reached, hidden number found). Drives thread follow-ups and easter-egg gating.
- **`contacts: Contact[]`** — `{ id, addedAt, lastCalledAt | null }`. Granted or discovered numbers.
- **`pendingCalls: IncomingCall[]`** — normally 0–1: `{ id, interactionId, ringingSince, ringSeconds }`.
- **`callLog: CallLogEntry[]`** — `{ id, interactionId, direction: 'in' | 'out', at, outcome }`,
  outcome ∈ answered | declined | missed | placed.

Old saves load untouched: absent arrays/maps default empty, new email fields optional.

## 6. Catalogs (sim-side; numbers on the sheet, copy in strings)

- **`EMAILS: Record<id, EmailDef>`** — `{ id, trigger(state), kind?, threadId?, grants?: contactId,
  replies?: Choice[] }`. Supersedes the flat `EMAIL_TRIGGERS` (a plain feedback email is just one
  with no `replies`/`grants`). Follow-ups are entries whose `trigger` reads a reply flag.
- **`INTERACTIONS: Record<id, InteractionDef>`** — call scenarios.
- **`CONTACTS: Record<id, ContactDef>`** — `{ id, number, interactionId, callCost?, cooldownSeconds?,
  reusable, hidden? }`.
- **`CALL_TRIGGERS`** — what can ring and when (predicate and/or seeded cadence), each with an
  `interactionId`, a ring window, and an optional `missConsequence`.

## 7. Tick & resolution (pure, deterministic)

In the tick, alongside `deliverEmails` (now also delivering flag-gated thread follow-ups):

- **Roll incoming calls** on a seeded cadence (run seed + monotonic counter; reproducible, testable)
  and/or fixed predicates.
- **Age pending calls**: a ring window that elapses → **missed**; apply `missConsequence` only if the
  call declares one, else lapse harmlessly.

Resolution helpers, each mirroring `resolveAction` (`{ state, OutcomeEvent }`):

- `replyToEmail(state, emailId, choiceId, rng)` — apply the reply, record `repliedChoice`, arm
  follow-ups.
- `answerCall` / `declineCall` / `placeCall(contactId)` / `dialNumber(numberString)` (keypad entry,
  resolves known + hidden) / `replyToInteraction(interactionId, choiceId)`.

## 8. Pacing & idle-safety (ADR)

**The phone is an active-play layer; missing a call is opportunity-only by default.** A call may
declare an explicit `missConsequence`, used sparingly. Calls never ring offline.

- **Incoming calls**: rare, seeded, short ring window during active play; one active ring at a time so
  nothing stacks or repeatedly interrupts.
- **Placing calls**: player-driven; gated only by `callCost` / `cooldownSeconds`.
- **Emails**: persistent, accrue offline, read at leisure; threads advance only when you reply, so a
  conversation waits for you.
- **Cadence target**: roughly one incoming call worth answering per several minutes of active play.

**Offline recap**: may note missed calls as flavor; they've already lapsed (and applied any declared
consequence). Attention is rewarded; inattention is, by default, untaxed.

## 9. UI surface

- **Email (PC)** — extend the existing inbox to group **threads** (a conversation reads top to bottom,
  your chosen replies inline) and to show **reply buttons** on answerable emails. Everything else
  about the PC inbox stays.
- **Phone (new device)**, sibling to `PcWindow`:
  - **Ringing overlay** — caller name or "Unknown" + **Answer / Decline**, on a timer ring.
  - **Keypad + contacts** — known contacts to dial (with cost/cooldown state) and **free numeric
    entry** for hidden numbers.
  - **Call log** — recents (in/out, answered/missed/declined/placed). Missed-call badge.

Choice tooltips can reuse `actionOutcomeForecast` so a gamble reads as **mean ± sd**, consistent with
the rest of the UI.

## 10. Worked examples (shape only — content is next)

- **Answerable email + thread.** `mara-1` arrives (answerable, `threadId: 'mara'`): _[Hear her out]_
  / _[Delete]_. "Hear her out" sets `flag mara=1` and **schedules an incoming call** (event triggered
  by an email reply). `mara-2` is a catalog email gated on `flag mara>=1` — the thread continues.
- **Info + number → outgoing call.** A consequence email grants the **fixer** number. In the phone it's
  a recurring contact (gold cost, cooldown). Dialing: _[Buy silence]_ (defuse a future event) /
  _[Buy a name]_ (`grantContact` a one-shot lead).
- **Hidden number.** A lore email's body names a number that "should not be dialed." Typing it on the
  keypad opens an easter-egg interaction and reveals the contact.
- **Timed incoming call with teeth (the exception).** A `CALL_TRIGGER` with a `missConsequence`: an
  enforcer calls; ignore it and a small penalty lands. Rare, and always content-justified.

## 11. Shares with Rites

The temporary-effect layer (timed modifiers folded into `computeModifiers`) and the cooldown map are
the same plumbing the active-Rites idea needs. Build once; email replies, call choices, and rites all
ride it.

## 12. Locked decisions & next deliverables

**Locked:** the phone is a **new, voice-only device** (no texts). **Email is two-way and threaded**,
and **answering emails can trigger events**. Dialable numbers come from **email grants** and a set of
**hidden lore numbers**. **Missing a call is opportunity-only by default**, with rare, explicit
per-call `missConsequence` exceptions.

**Next, in order:**

1. **Email content + threads + number grants** — author the `EMAILS` catalog: the kinds above, the
   answerable threads (reply chains via flags), and which emails `grant` numbers. The bulk of the
   "email contents" pass.
2. **Call / interaction catalog** — `INTERACTIONS` + `CONTACTS` (incl. `hidden`) + `CALL_TRIGGERS`
   (incl. any `missConsequence`), with sheet-pinned magnitudes and ring windows.
3. **Pacing pass** — tune incoming-call cadence and ring windows against the economy.
