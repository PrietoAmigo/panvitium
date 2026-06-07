# 05 — Email content catalog (impact-feedback correspondence)

_Draft content spec for the **Emails (Opera menu)** feature flagged `[pending design]` in the README.
This document owns the **copy and the triggers**; presentation is a Claude Design topic and the sim
hooks behind reply-effects are flagged per entry (ADR-023). Intended home in the repo:
`docs/05-email-content.md`._

The emails are the game's **impact-feedback layer**: the world reacting to what you have done, so the
player *feels* the corruption rather than only reading it as numbers. Tone is the product's standard —
**grim-baroque, treated seriously, never parody** (`01-vision-and-core-loop.md`). The Church and a
Higher Power remain rare and are flavour, not a system to fight; nothing here turns the inbox into a
combat surface. The dread is that the world is closing in around a man it cannot prove anything about.

> **Constraint honoured throughout:** no reprobate-subtype is referenced in any trigger or any body.
> Triggers key off durable state — souls, gold, influence, Devotion/Sin levels, `katabasisCount`,
> businesses owned, maleficia owned, active invocations, achievements, the Panvitium toggle, the
> Eternal Sin reveal, and game runtime.

---

## Contacts and threads index

A first email from a sender **grants** their `contactId`; later emails in that arc carry the `Thread`
and grant nothing. A granted contact is what lets the arc continue and lets a reply route back.

| contactId | Who they are | threadId |
|---|---|---|
| `vesper` | _The Vesper Ledger_ — a local evening digest the player is "subscribed" to | `t-vesper` (loose) |
| `corven` | **Silas Corven** — a rival damned soul gathering souls of his own | `t-rival` |
| `halloway` | **Wren Halloway** — a paranoid stranger who has pieced together the pattern | `t-watcher` |
| `meridian` | **Dana Reyes, Meridian & Crowe LLP** — class-action counsel for those your holdings ruined | `t-classaction` |
| `vance` | **Della Vance** — a private investigator hired by someone whose life you destroyed | `t-pi` |
| `aldwin` | **Fr. Aldwin Mercer** — a parish priest who suspects; escalates to the Curia | `t-church` |
| `vigil` | One of the faithful who keeps vigil over your sleeping body | `t-vigil` (loose) |

## Trigger vocabulary

Readable predicates the integrator maps onto the store. `&&` chains; thread follow-ups also gate on the
prior entry being **read** (or replied a specific way).

- `souls >= N` — current pool (carries across Katabasis).
- `gold >= N`, `influence >= N`, `maxInfluence >= N` — lifetime resources.
- `sinLevel(<sin>) >= L` — derived Cardinal-Sin level (1–4). `sinsAtLeast(L, count)` — at least `count` Sins ≥ L.
- `businessesOwned >= N` — sum of `lifetime.businesses` counts (Vitium Mercatura presence in the world).
- `maleficiaOwned >= N`, `owns('<maleficiumId>')`.
- `invocationActive('<id>')`, `activeToggle('panvitium')`.
- `katabasisCount >= N`, `gameAgeDays >= N`.
- `achievementUnlocked('<id>')`, `eternalSinRevealed`.

**Counters that don't exist yet** (flagged in Notes where used): a cumulative *souls-harvested-ever* and
a *Decimatio-kills-ever* tally would make several "impact" triggers cleaner than the proxies below. Each
would be an additive-optional top-level field (ADR-023) with a round-trip pin in `save.test.ts`.

## Reply-effect vocabulary

Effects on `answerable` replies. Most are flavour-only or touch existing resource fields; anything that
introduces a lasting modifier needs a sim hook and (if persistent) an additive-optional save field.

- `gold -= N` / `gold -= P%`, `influence ±= N`, `souls -= N` (a loss "taken, not harvested" — mirrors
  the existing Church/Higher-Power loss pattern in `actions.ts`, mints nothing).
- `lose('<maleficiumId>')` — the Church seizes an item (mirrors the Terrible-tier maleficium loss).
- `timedModifier(field, mul, seconds)` — **needs a sim hook**: a generic timed-modifier channel folded
  into `computeModifiers` plus an additive-optional `lifetime.mailModifiers` field (ADR-023).
- `setFlag('<id>')` — a sticky narrative flag gating later entries; additive-optional `lifetime.mailFlags`.
- `grantCode('<number>')` — surfaces a code for the studio smartphone terminal (the other pending
  system); UI-only unless the code itself grants a buff.
- `openFollowUp('<id>')` / `closeThread` / `grantContact('<id>')` — inbox-state only.
- `none` — flavour only. Used deliberately and often; honesty about scope beats inventing systems.

---

## Entry format
```
### <id>
- Kind:    consequence | lore | easter-egg | info+number | answerable
- Trigger: <state predicate>
- Thread:  <threadId | none>
- From:    <sender>
- Subject: <subject>
- Grants:  <contactId | none>
- Replies: <answerable only: Label → effects>
- Body:    <copy>
- Notes:   <none>
```

---

## The Vesper Ledger — subscribed digest (consequence / info+number)

### vesper-01
- Kind:    consequence
- Trigger: businessesOwned >= 3
- Thread:  t-vesper
- From:    The Vesper Ledger — Evening Digest
- Subject: Three quiet closures on the east side
- Grants:  vesper
- Replies: —
- Body:    Neighbours describe the block as "thinner" this season. Two family businesses shuttered without notice; a third changed hands to a holding company no one in the ward can name. There is no story here, our editor insists — only a column of for-lease signs and a smell off the canal that the council promises to look into. We print it because someone asked us to keep count.
- Notes:   First subscriber touch; establishes the digest as the player's mirror. none.

### vesper-02
- Kind:    info+number
- Trigger: souls >= 50
- Thread:  t-vesper
- From:    The Vesper Ledger — Obituaries
- Subject: This week's notices (a longer column than usual)
- Grants:  none
- Replies: —
- Body:    The notices run two pages tonight. The parish clerk records the ward's deaths up by a figure he will only describe as "above the mean for the month," and asks that families file early as the office is overwhelmed. We have stopped printing causes. They had begun to rhyme.
- Notes:   The "figure" should render a real number derived from recent harvest (souls delta over a window) — info+number's reason to exist. Cleaner with a souls-harvested-ever counter (flagged above). none.

### vesper-03
- Kind:    consequence
- Trigger: sinLevel('avaritia') >= 2
- Thread:  t-vesper
- From:    The Vesper Ledger — Markets
- Subject: A record quarter, and an empty high street
- Grants:  none
- Replies: —
- Body:    One ledger in the ward posts its best return on record. Every other ledger posts foreclosure. Analysts call it "remarkable consolidation." Pensioners call it the thing that took the house. The firm declined to comment; its registered address is a stairwell.
- Notes:   none

### vesper-04
- Kind:    info+number
- Trigger: katabasisCount >= 3
- Thread:  t-vesper
- From:    The Vesper Ledger — Year in Review
- Subject: The ward, in numbers we can no longer explain
- Grants:  none
- Replies: —
- Body:    Deaths, up. Bankruptcies, up. Departures, up. Births, the same as always — the only line that does not move. We had meant this to be a hopeful issue. Instead we print the totals and leave the rest of the page white, the way the printer left it when he walked out mid-shift and did not come back.
- Notes:   Render running totals across lifetimes (katabasisCount, cumulative figures). info+number. none.

---

## Silas Corven — the rival (consequence / answerable)

### rival-01
- Kind:    answerable
- Trigger: souls >= 100
- Thread:  t-rival
- From:    Silas Corven
- Subject: We are feeding in the same pasture
- Grants:  corven
- Replies:
    - "I don't know you." → setFlag('corven_denied'); none
    - "Whose are you?" → openFollowUp('rival-03'); none
    - [ignore] → none
- Body:    You will not have heard of me, and that is to your credit and mine. I keep the same hours you do. I lie down on the same kind of stone and I rise the same way, lighter by what I gathered while the rest of the street slept. I have watched your column of the dead grow beside mine for a season now. It is good work. It is also my work, in a county that was never large enough for two of us.
- Notes:   First peer to recognise the player as a peer. none.

### rival-02
- Kind:    consequence
- Trigger: katabasisCount >= 1 && read('rival-01')
- Thread:  t-rival
- From:    Silas Corven
- Subject: I let you keep the small ones
- Grants:  none
- Replies: —
- Body:    You went down for a while — I felt the pasture go quiet on your side of the hedge. While you settled your accounts I settled mine, and three you had been ripening came to me ripe. I left you the small ones. Consider it a courtesy between professionals. The next time you lie still that long, I will not be so generous, and the stone does not care which of us is lying on it.
- Notes:   Lands after a descent — frames Katabasis downtime as a real-world exposure. none.

### rival-03
- Kind:    answerable
- Trigger: sinsAtLeast(3, 1)
- Thread:  t-rival
- From:    Silas Corven
- Subject: A division of the ground
- Grants:  none
- Replies:
    - "Take the river wards. I'll keep the hill." → influence -= 200; setFlag('corven_pact'); none
    - "I divide nothing." → setFlag('corven_war'); timedModifier('goldRate', 0.85, 1800)
    - "Come and take it." → setFlag('corven_war'); timedModifier('goldRate', 0.7, 3600)
- Body:    I am proposing peace, which is the most expensive thing I own. You keep the high ground, I keep the water, and neither of us reaches across the line for what is breathing on the other side. Refuse and we will both spend our harvest poisoning each other's, and the only winners will be the Princes we are both climbing toward — who would so enjoy watching two of their better servants ruin one another over a parish.
- Notes:   War replies impose a temporary drag (needs timedModifier hook). Pact spends influence and gates a later softer Corven beat. none.

### rival-04
- Kind:    consequence
- Trigger: souls >= 1000
- Thread:  t-rival
- From:    Silas Corven
- Subject: I have been to your altar
- Grants:  none
- Replies: —
- Body:    I walked past your Lair on Sunday. I know the look of a worn channel when I see one, the air bends over it like heat off a road. Yours is older than mine. Whoever cut it was not working from any book I have read, and I have read the ones that are kept in lead. I am not threatening you. I am telling you that you are not the first to lie on that stone, and the ones before you did not all rise.
- Notes:   Ties to the canon "not all the stains are yours." Pairs with lore-prior. none.

---

## Wren Halloway — the paranoid (consequence / lore / answerable)

### watcher-01
- Kind:    consequence
- Trigger: businessesOwned >= 5
- Thread:  t-watcher
- From:    a concerned reader
- Subject: I have been reading the obituaries
- Grants:  halloway
- Replies: —
- Body:    You don't know me. I read the deaths page every morning, have for years, it's a habit, my wife said it was morbid before she — anyway. Six weeks ago I started circling the ones near the new businesses. The pen's run out twice. I'm not saying anything. I'm not the kind of person who says things. I'm just writing it down so that someone, somewhere, has it written down. That's all. That's all this is.
- Notes:   He is a nobody and he is correct, which is the horror. none.

### watcher-02
- Kind:    consequence
- Trigger: souls >= 200
- Thread:  t-watcher
- From:    Wren Halloway
- Subject: I counted them
- Grants:  none
- Replies: —
- Body:    I made a chart. I know how that sounds. The deaths track the closures and the closures track YOU, you specifically, I can see the shape of you in it even though there's no name anywhere, there's never a name, that's the cleverest part. I haven't slept properly. I drove past the house with the candles in it. There were people kneeling. At three in the morning. Kneeling. Tell me I'm wrong. I am begging you to tell me I'm wrong.
- Notes:   The "house with the candles" is the player's Lair / the faithful's vigil. none.

### watcher-03
- Kind:    answerable
- Trigger: katabasisCount >= 2
- Thread:  t-watcher
- From:    Wren Halloway
- Subject: I know you read these
- Grants:  none
- Replies:
    - "You're unwell. Get help." → setFlag('watcher_gaslit'); none
    - "You have no idea what you're looking at." → setFlag('watcher_provoked'); openFollowUp('watcher-04')
    - [ignore] → none
- Body:    The little dot turns grey when you've read it. You read every one. So you're real, and you're listening, and that means I'm not — I'm not the thing my brother says I am. I don't want money. I don't want you caught. I think it's too late for caught. I just want one person who is doing this to admit, to me, in writing, that it is being done. Then I'll stop. I promise I'll stop. I just need it to be true out loud, once.
- Notes:   Provoking him is the worse choice narratively; it accelerates his unravelling. none.

### watcher-04
- Kind:    lore
- Trigger: katabasisCount >= 4
- Thread:  t-watcher
- From:    Wren Halloway
- Subject: the man who sleeps
- Grants:  none
- Replies: —
- Body:    i found out about the stone. there's a man who lies on it and doesn't die and doesn't wake and the kneeling people feed him through the days he's under. they think he's a saint. a SAINT. i went to the door. i was going to — i don't know what i was going to. one of them looked at me and i recognised the look. it was the look you give furniture. i ran. i'm sorry for emailing so much. you're the only one who knows what i know. isn't that funny. you and me.
- Notes:   Reveals he understands the Katabasis without the word for it. Lore-tier dread. none.

### watcher-05
- Kind:    consequence
- Trigger: read('watcher-04') && (sinLevel('ira') >= 2 || katabasisCount >= 5)
- Thread:  t-watcher
- From:    Halloway, M. (sister)
- Subject: Re: the man who sleeps — please stop
- Grants:  none
- Replies: —
- Body:    This is Wren's sister. I'm going through his accounts. He hasn't been seen in eleven days and the police have stopped returning my calls, which they were so eager to take at first. His flat is full of charts about you — I assume it's you; there are a lot of these — and I am asking you, whoever you are, with whatever's left of you: if you know where he is, tell me. He was not well. He was not dangerous. He was just keeping count of something nobody else would. I think he was right about it. I think that's why no one will look.
- Notes:   The payoff is ambiguous and off-screen — never a depicted method, only an absence. The world has closed over him. none.

---

## Meridian & Crowe LLP — the class action (consequence / answerable)

### class-01
- Kind:    consequence
- Trigger: businessesOwned >= 8
- Thread:  t-classaction
- From:    Meridian & Crowe LLP — Dana Reyes
- Subject: NOTICE: putative class action — your holdings
- Grants:  meridian
- Replies: —
- Body:    This firm represents a class of three hundred and growing, comprising the surviving customers, families, and creditors of entities in which you hold a controlling, if carefully obscured, interest. You will not find your name on the filing. Our clients found it anyway. They have stopped expecting their money. What they want now is for a court to write down, on paper that cannot be unprinted, what was done to them and by whom. We intend to give them that. Service of process to follow.
- Notes:   "Three hundred and growing" can scale with businessesOwned. none.

### class-02
- Kind:    answerable
- Trigger: read('class-01') && gold >= 5000
- Thread:  t-classaction
- From:    Meridian & Crowe LLP — Dana Reyes
- Subject: Settlement window (it closes Friday)
- Grants:  none
- Replies:
    - "Settle in full." → gold -= 40%; setFlag('class_settled'); closeThread
    - "I'll see you in court." → setFlag('class_litigating'); openFollowUp('class-03')
    - "This goes away. Quietly." → gold -= 10%; setFlag('class_buried'); timedModifier('influenceRate', 0.8, 3600); openFollowUp('class-03')
- Body:    My clients have authorised a number. It is large. It is also less than what discovery will cost you in exposure, and discovery is a lamp my clients are very much looking forward to switching on. Pay it and the lamp stays off. Don't, and we depose everyone who ever signed for you, and we ask each of them the same simple question until one of them answers it. You strike me as a person who has never once been asked a simple question to your face. Friday.
- Notes:   "Buried" is the dark path — cheaper in gold, costlier in attention; the timedModifier needs the hook. The buried route still opens class-03 (it doesn't vanish; it festers). none.

### class-03
- Kind:    consequence
- Trigger: sinLevel('avaritia') >= 3 && (flag('class_litigating') || flag('class_buried'))
- Thread:  t-classaction
- From:    Meridian & Crowe LLP — Dana Reyes
- Subject: The lead plaintiff would like you to know her name
- Grants:  none
- Replies: —
- Body:    Her name is Mara. She is sixty-one. She cleaned offices for forty years to buy one small flat outright, and your "carefully obscured interest" took it in fourteen months by a method our forensic accountant calls elegant and the rest of us call what it is. She does not expect to live to see the verdict; the stress, her cardiologist says. She asked me to write to you directly so that there would be, on the record, one moment where you could not pretend she was a number. There. You cannot. Whatever happens to this case — and things do happen to my cases lately, witnesses move, files corrupt — you have now read her name.
- Notes:   Acknowledges the dark routes' reach ("things do happen to my cases") without depicting them. none.

---

## Della Vance — the private investigator (consequence / answerable)

### pi-01
- Kind:    consequence
- Trigger: katabasisCount >= 2 && businessesOwned >= 5
- Thread:  t-pi
- From:    Vance Investigations
- Subject: (no subject)
- Grants:  vance
- Replies: —
- Body:    I'll be direct, because the client paid for direct. A woman whose life ended the day yours started touching it has retained me to find out what you are. Not who — she's past who. What. I've worked grief cases for nineteen years and I know the difference between a man who got rich and a man who left a hole shaped like other people. You're the second kind. This is the only message I'll send for free. I am very good at my job, and I have just begun.
- Notes:   The client is deliberately unnamed here; "someone whose life you destroyed." none.

### pi-02
- Kind:    consequence
- Trigger: souls >= 500
- Thread:  t-pi
- From:    Della Vance
- Subject: Your timeline (a draft)
- Grants:  none
- Replies: —
- Body:    Attached, in spirit, is a calendar. I won't send the file — you'd only learn what I have from how I've redacted it. But I want you to know it exists. Every closure, every notice, every quiet death within a mile of your interests, arranged by date. The pattern has a rhythm. There are gaps in the rhythm, regular ones, days where everything you touch goes still at once — as though you simply weren't there. I am extremely curious about those days. I think they are the truest thing about you.
- Notes:   The "gaps" are the Katabasis windows. She is closing on the central secret without the vocabulary for it. none.

### pi-03
- Kind:    answerable
- Trigger: read('pi-02') && sinsAtLeast(3, 1)
- Thread:  t-pi
- From:    Della Vance
- Subject: Coffee. Somewhere public. Your choice.
- Grants:  none
- Replies:
    - "I've nothing to say to you." → none
    - "Name your price." → gold -= 25%; setFlag('vance_paid'); none
    - "Drop it. While you can." → setFlag('vance_threatened'); openFollowUp('pi-04')
    - "Come to the house. We'll talk properly." → setFlag('vance_invited'); timedModifier('apocalypticGuard', 1.0, 0); openFollowUp('pi-04')
- Body:    I'd like to sit across from you once. Somewhere with windows and witnesses, so neither of us does anything we'd regret. I'm not wired and I'm not stupid; this isn't a sting. It's professional courtesy. I've taken apart men who run from me and men who threaten me and men who try to buy me, and they all break the same way eventually. The ones I never quite finish are the ones who agree to meet and just — look at me, calmly, like they've already decided how it ends. Don't be one of those. It unsettles me, and I charge extra for unsettled.
- Notes:   "Name your price" only delays her. "Come to the house" is the villain-protagonist trap option: narratively dark, mechanically risky — flagged as raising her file's danger and intended to couple with an Apocalyptic-leaning consequence, not a clean win. The `timedModifier('apocalypticGuard', 1.0, 0)` is a placeholder marker for that coupling and needs design + a hook. none.

### pi-04
- Kind:    consequence
- Trigger: sinsAtLeast(3, 3) || flag('vance_threatened') || flag('vance_invited')
- Thread:  t-pi
- From:    Della Vance
- Subject: I wrote it all down, and I made copies
- Grants:  none
- Replies: —
- Body:    Whatever you're planning — and I can hear you planning, it's a sound, a kind of patience — understand that the file is no longer only with me. It's with a colleague, a journalist, a man at a diocese who asked questions I didn't expect a priest to ask. If I go still the way your "gaps" go still, three envelopes open at once. I didn't want it to be like this. The client only wanted to understand. But I've understood, now, more than she paid for, and a person can't un-understand a thing like you. So here we are. Careful with me. I've made myself expensive to silence.
- Notes:   Connects the PI thread to the Church thread (the diocese contact) and the class action (the journalist) — the web tightening. none.

---

## The Church — Fr. Aldwin Mercer, then the Curia (lore / consequence / answerable)

### church-01
- Kind:    lore
- Trigger: businessesOwned >= 5
- Thread:  t-church
- From:    Fr. Aldwin Mercer, St. Brigid's
- Subject: A note from your parish, though I doubt you attend
- Grants:  aldwin
- Replies: —
- Body:    You won't know me, but I have buried a great many of your neighbours this year, and I have begun to feel I am working for someone. The diocese teaches that evil is mostly absence — a turning-away, a cold spot where warmth should be. I no longer fully believe that. The cold spots in this parish have an address. I am praying for you. Not as a courtesy. As a man bails a boat. I wanted you to know that someone has noticed, and that the someone wishes you no harm, which I understand may disappoint you more than a curse would.
- Notes:   The Church begins as flavour for the player's mounting Terrible-tier exposure (`01` canon). none.

### church-02
- Kind:    answerable
- Trigger: read('church-01') && sinsAtLeast(2, 3)
- Thread:  t-church
- From:    Fr. Aldwin Mercer, St. Brigid's
- Subject: The door is open later than you'd think
- Grants:  none
- Replies:
    - "Pray for someone who wants it." → none
    - "Your God doesn't bargain. I do." → setFlag('aldwin_mocked'); openFollowUp('church-03')
    - "Hear my confession." → souls -= 50%; lose(random anathema); setFlag('confessed'); none
- Body:    I keep the side door unlocked past compline. I am not naive; I know what unlocks in a person and what does not. But I have sat with men at the very end who spent their whole lives certain they were beyond it, and I have watched the certainty come off them like a coat in a warm room. You are not at the end. That is the only advantage you have over them, and you are spending it. Come, or don't. The candle's lit regardless, and it costs the parish nothing to leave it burning for one more soul who thinks he doesn't have one.
- Notes:   "Confess" is a deliberately punishing route — a partial unwinding of the run that mirrors the canonical Church loss (souls taken, an anathema item seized, mints nothing). It must be unmistakably costly so it reads as a genuine, almost-unthinkable choice, not a trap. none.

### church-03
- Kind:    consequence
- Trigger: sinsAtLeast(3, 3) || flag('aldwin_mocked')
- Thread:  t-church
- From:    Officium, Paenitentiaria Apostolica
- Subject: De homine qui in lapide dormit
- Grants:  none
- Replies: —
- Body:    Father Mercer has been reassigned, for his health. His correspondence comes to us now. We will not write as he did; we do not bail boats. We catalogue. There is a file, very old, kept where the public files are not, concerning a stone in your county and the names of those recorded lying upon it across more years than one body should allow. You have added yourself to a list, and the list is the kind that ends. We are patient in a way you have mistaken for absence. Vade. Dum licet.
- Notes:   The escalation: institutional, Latin, and aware of the altar's lineage (ties to rival-04 and lore-prior). May fire the canonical "undo recent corruption" effect as a consequence; flag the magnitude for design. Closing Latin: roughly "Go. While you may." none.

### church-04
- Kind:    consequence
- Trigger: eternalSinRevealed || sinsAtLeast(4, 2)
- Thread:  t-church
- From:    (sender withheld)
- Subject: —
- Grants:  none
- Replies: —
- Body:    The Curia has closed its file. Not because the matter was settled — because it was taken from them, by an office that does not answer to the Curia and does not keep files, having no need of them. You will not be written to again. What attends to you now does not correspond. You wanted rank. You are about to learn precisely how high the notice of you has travelled, and how little comfort there is at that height. The candle at St. Brigid's went out on its own. No one had touched it.
- Notes:   The Higher-Power overtone (`01` Apocalyptic canon) — the most threatening beat, deliberately near the Eternal Sin. No reply; correspondence itself has ended. none.

---

## The faithful — vigil over your sleeping body (lore)

### vigil-01
- Kind:    lore
- Trigger: katabasisCount >= 1
- Thread:  t-vigil
- From:    one who keeps the vigil
- Subject: while you were under
- Grants:  vigil
- Replies: —
- Body:    You were gone four days this time. We turned you, and wet your lips, and kept the room at the heat you like. The Hendricks boy tried to take the brass from the east wall and we put him out; the rest of what wandered off, we could not stop, and I am sorry for the ledgers and the smaller relics. We do not ask what you do down there. We only ask that you keep choosing to come back up, because the room is colder on the days we are not sure you will. The candle wants tending. So, I think, do you.
- Notes:   Grounds the premise's vigil and the per-lifetime estate loss in a human voice. none.

### vigil-02
- Kind:    lore
- Trigger: maleficiaOwned >= 3 && katabasisCount >= 3
- Thread:  t-vigil
- From:    one who keeps the vigil
- Subject: the things on the shelf
- Grants:  none
- Replies: —
- Body:    The newest one came home wrong. It does not sit where you set it. In the mornings it has turned to face the altar, and twice it has been warm, though nothing in this room is ever warm but you. The eldest of us says the shelf is older than the faith and remembers tenants we don't, and that the items know an owner from a caretaker the way a dog does. We dust them at arm's length. We pray over the ones with names. Some of them, the eldest will not pray over at all, and will not say why.
- Notes:   Atmosphere over the maleficia cabinet; ties to "the stains that aren't yours." none.

---

## Easter-eggs (sparing, straight-faced-adjacent)

### egg-prior
- Kind:    easter-egg
- Trigger: owns('codex_gigas') || katabasisCount >= 6
- Thread:  none
- From:    delivery failed — message returned to sender
- Subject: Returned mail: see transcript
- Grants:  none
- Replies: —
- Body:    Your message could not be delivered. The address has been closed for longer than this service has existed. The original text is appended below for your records: "i can hear you on the stone above me. you took it warm. i left it warm for whoever takes it from you. dial the number under the altar when your hands stop being yours. — the one before." [the rest of the transcript is unrenderable]
- Notes:   The "number under the altar" is the studio smartphone-terminal hook. A genuine code can be revealed here via grantCode; keep it UI-only unless the code grants a buff (then it needs a sim hook). A prior-tenant easter-egg that stays in the grim register. none.

### egg-chain
- Kind:    easter-egg
- Trigger: gameAgeDays >= 2
- Thread:  none
- From:    a friend (you have no friends)
- Subject: FWD: FWD: FWD: do not break the chain
- Grants:  none
- Replies: —
- Body:    This prayer has been forwarded since before the printing press. Send it to seven souls and the seven souls are yours. Break the chain and what you have gathered scatters at the next descent, as it always has, as it always will, ask anyone who stopped. You, of all readers, know this is not superstition. You have simply never had seven friends. We thought of you anyway. We always think of you.
- Notes:   The single permitted note of dark comedy ("you have no friends") — restrained, still menacing. No mechanical effect; flavour. Could surface a code via grantCode if desired. none.

---

## Engineering flags (collected)

For the integrator, the reply-effects and triggers above that imply work beyond existing systems:

1. **Timed-modifier channel** (used by `rival-03`, `class-02`, `pi-03`): a generic
   `timedModifier(field, mul, seconds)` folded into `computeModifiers`, backed by an additive-optional
   `lifetime.mailModifiers` field (ADR-023), with a `save.test.ts` round-trip pin.
2. **Narrative flags** (`setFlag` / `flag(...)` in triggers): an additive-optional `lifetime.mailFlags`
   (string[]) — most flags are lifetime-scoped; `corven_pact`/`confessed` may want to be top-level if
   they should survive Katabasis. Decide per flag.
3. **Cumulative counters** for cleaner "impact" triggers: souls-harvested-ever and Decimatio-kills-ever,
   both additive-optional top-level, both pinned.
4. **The `pi-03` "come to the house" coupling** and the **`church-03` "undo recent corruption"**
   consequence are intentionally underspecified magnitudes here — they should be tuned alongside the
   Terrible/Apocalyptic outcome canon, not invented in copy. `apocalypticGuard` is a placeholder marker,
   not a real field.
5. **`grantCode`** depends on the smartphone-terminal feature (the other `[pending design]` item); the
   email and the dial-pad share one code table.
