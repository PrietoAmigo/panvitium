# 05a — Email Content Pass (batch 1) + the Choice/effect vocabulary

> Companion to `05 — Email, the Smartphone, and Interactive Events`. This pins the shared
> **effect vocabulary** every reply and call choice draws from, then authors the first batch of email
> content: one-way flavor/consequence, lore, an easter egg that seeds a hidden number, two emails that
> grant dialable numbers, and one full **answerable thread**.
>
> Plumbing: each email is a `EMAILS` catalog entry `{ id, trigger, kind?, threadId?, grants?, replies? }`;
> all copy (sender / subject / body / reply labels) lives in `strings` keyed by the email id (ADR-020).
> Trigger predicates read live state. This is **batch 1**, not the whole catalog.

## 1. The Choice/effect vocabulary (pinned)

A reply or call choice carries `requirement?(state)` and an `effect(state, rng) → { state, event }`.
The effect is built from these verbs only — one agreed list, so email and call content stay
interchangeable:

| verb | shape | meaning |
|---|---|---|
| `resource` | `(kind, amount)` | instant delta; kind ∈ souls \| gold \| influence \| maleficia \| reprobates. `amount` may be flat or a `gamble` result. |
| `buff` | `(field, op, seconds)` | timed modifier into the temp-effect layer folded by `computeModifiers` (ADR-022). `op` = ×m or +n on a bundle field. |
| `gamble` | `(perTier)` | draw a tier via `resolveTier`; map each tier to a resource/buff outcome. The variance verb. |
| `grantContact` | `(contactId)` | add a dialable number to Contacts. |
| `scheduleEmail` | `(emailId, delaySec?)` | arm/deliver a follow-up email (thread continuation). |
| `scheduleCall` | `(interactionId, withinSec?)` | make the phone ring — an event triggered from email. |
| `setFlag` | `(key, value=1)` | story / thread / discovery flag (read by later triggers). |
| `nothing` | `()` | pure flavor / decline; may still advance a thread by an implicit flag. |

Threading rule of thumb: an answerable reply sets a flag (or `scheduleEmail`s directly); follow-up
emails `trigger` on that flag. A thread ends when nothing is eligible.

## 2. Email catalog — batch 1

Format per entry: **id** · _kind_ · trigger — then sender / subject / body, and (if interactive)
replies with their effects.

---

**`first-harvest`** · _consequence_ · trigger: `mintedSoulsLifetime >= 1`
- **From:** Accounts, Below
- **Subject:** Deposit logged
- **Body:** One soul received in good order and entered against your name. The balance is yours; the
  rank is not — not yet. Continue. We are patient, and we are counting.
- _one-way._

**`parish-bulletin`** · _consequence / informative_ · trigger: `influence >= 1000`
- **From:** The Parish Bulletin
- **Subject:** A word on the season's troubles
- **Body:** Neighbours, it has been a heavy season — more drink than is wise, more debt than is kind,
  a greyness in good people we cannot name. We are sure it will pass, as all weather passes. Keep to
  one another. Keep the lamps lit.
- _one-way. (Your work, seen from below and mistaken for weather.)_

**`seal-price`** · _lore_ · trigger: `boundSigils >= 1`
- **From:** (unsigned)
- **Subject:** On the binding
- **Body:** You will have felt it close. Understand what you have done: a seal does not borrow a
  soul, it keeps one. It remembers the shape of what you fed it, and it will not give the shape back.
  Bind freely. Only do not expect the ledger to run backwards.
- _one-way._

**`do-not-dial`** · _easter egg_ · trigger: `firstApocalypticOutcome === true`
- **From:** [sender withheld]
- **Subject:** _(no subject)_
- **Body:** if you are reading this it already has your address. do not write back. and whatever you
  do, do not call the long number — 0 6 6 · 6 1 3 · 1 3 0 7. if the line is dead, good. if it answers,
  you were never the one dialing.
- _one-way, but it **seeds a hidden number** (the digits are in the body; not granted). Dialing them
  on the keypad reaches hidden contact `the-hollow` (call catalog, §5)._

**`the-fixer`** · _info + number_ · trigger: `businessCount >= 1`
- **From:** an old associate
- **Subject:** When they come asking
- **Body:** They always come — auditors, widows, the curious. When they do, you'll want this number.
  He's discreet, he's expensive, and he has never once failed me. Use it sparingly. He remembers who
  calls too often.
- **Effect on read:** `grantContact('fixer')`.

**`the-appraiser`** · _info + number_ · trigger: `maleficiaOwned >= 1`
- **From:** Cassian, antiquary
- **Subject:** Curios
- **Body:** Word is you've been turning up curiosities — the old, ugly, useful kind. I value such
  things, and on a good day I relieve their owners of them for coin. My line is below. Bring me
  something that shouldn't exist.
- **Effect on read:** `grantContact('appraiser')`.

---

### The Mara thread (answerable; demonstrates threading + event trigger + handoff to a call)

**`mara-1`** · _answerable_ · `threadId: 'mara'` · trigger: `anySinLevel >= 2`
- **From:** M.
- **Subject:** An arrangement
- **Body:** I've watched your ledger grow. Talent like yours oughtn't climb unsponsored — it's so
  slow, and the slow ones are forgotten. I can shorten the road, for a consideration. Reply, and
  we'll talk terms.
- **Replies:**
  - **[Hear her out]** → `setFlag('mara', 1)`; `scheduleEmail('mara-2', 30)`
  - **[Delete]** → `nothing` _(thread sleeps; `mara-1` may re-arm later if you wish)_

**`mara-2`** · _answerable_ · `threadId: 'mara'` · trigger: `flag.mara >= 1`
- **From:** M.
- **Subject:** Terms
- **Body:** A tithe, then — a measure of what you've gathered, paid once, and my patronage is yours
  for this life. When you mean to agree, don't write it down. Say it aloud. The line is below.
- **Replies:**
  - **[Agree — pay the tithe]** → `resource('souls', -<tithe>)`; `grantContact('mara-line')`;
    `setFlag('mara', 2)` _(now you must call to seal it)_
  - **[Refuse]** → `setFlag('mara', -1)`; `scheduleEmail('mara-cold')`

**`mara-cold`** · _consequence_ · `threadId: 'mara'` · trigger: `flag.mara == -1`
- **From:** M.
- **Subject:** As you like
- **Body:** A pity. The offer doesn't keep, and neither do I. Climb the slow way — most do, and most
  arrive as nobody. We won't speak again this life.
- _one-way. Thread closes._

## 3. Numbers introduced this batch

- **Granted by email:** `fixer` (`the-fixer`), `appraiser` (`the-appraiser`), `mara-line` (`mara-2`,
  on agreeing).
- **Hidden (discovered by reading + keypad):** `the-hollow` (digits hidden in `do-not-dial`).

## 4. Summary

| id | kind | trigger | grants | thread | interactive |
|---|---|---|---|---|---|
| `first-harvest` | consequence | first soul minted | — | — | no |
| `parish-bulletin` | consequence | influence ≥ 1000 | — | — | no |
| `seal-price` | lore | first sigil bound | — | — | no |
| `do-not-dial` | easter egg | first Apocalyptic outcome | (hidden `the-hollow`) | — | no |
| `the-fixer` | info+number | first business | `fixer` | — | no |
| `the-appraiser` | info+number | first maleficium | `appraiser` | — | no |
| `mara-1` | answerable | any Sin L2 | — | mara | yes |
| `mara-2` | answerable | flag.mara ≥ 1 | `mara-line` | mara | yes |
| `mara-cold` | consequence | flag.mara = −1 | — | mara | no |

## 5. Handoffs to the call catalog (deliverable #2)

Two call interactions are referenced here and belong in the next pass:

- **`mara-line` → interaction `mara-pact`** (outgoing, one-shot): dialing the number Mara gave seals
  the pact. _[Speak the words]_ → `buff('playerEfficiencyMul', ×1.25, <long>)`; `setFlag('mara', 3)`;
  contact burns. The email→number→call loop, completed by voice.
- **`the-hollow`** (hidden, outgoing): typing the `do-not-dial` digits opens an easter-egg
  interaction — pure lore + a small flag/achievement, content-justified. Whether it bites is a
  content call; default is opportunity-only per the locked ADR.

## 6. strings layout (per email id)

```
emails.<id>.from
emails.<id>.subject
emails.<id>.body
emails.<id>.reply.<choiceId>     // answerable only
```

This mirrors the existing email strings convention; the sim references only ids, so all copy above
can be revised without touching code.

## 7. Next

- Batch 2 of emails (more consequence/lore/easter-egg variety; another thread or two).
- The **call / interaction catalog** (`mara-pact`, `the-hollow`, the `fixer`/`appraiser` call
  interactions, incoming `CALL_TRIGGERS`).
- A pacing/trigger tuning pass once the economy sheet settles.
