# PANVITIUM EMAIL CATALOG

Canonical, single-source list of every email and email event. One entry per email, fixed format.
Engine: each entry is an `EMAILS` row `{ id, trigger, kind, threadId?, grants?, replies? }`; all copy
lives in `strings` keyed by id (`emails.<id>.from|subject|body|reply.<choiceId>`). The sim references
ids only, so copy here can change without touching code. Numbers in effects are sheet-pinned.

Theme guardrails: human corruption here is adult and non-sexual. Greed, debt, addiction, despair,
pride, bribery, financial and political leverage, infernal politics. No minors, nothing sexual, no
self-harm methods. Katabasis is a descent and a return, never a death; you are owed neither death nor
ending until the last descent that does not let you rise.

## Effect verbs (shared by emails and calls)
`resource(kind, ±amt)` souls|gold|influence|maleficia|reprobates · `buff(field, ×m|+n, sec)` ·
`gamble(perTier)` draw via resolveTier · `grantContact(id)` · `scheduleEmail(id, delaySec?)` ·
`scheduleCall(id, withinSec?)` · `setFlag(key, val=1)` · `nothing()`

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

### first-harvest
- Kind:    consequence
- Trigger: mintedSoulsLifetime >= 1
- Thread:  none
- From:    Accounts, Below
- Subject: Deposit logged
- Grants:  none
- Body:    One soul received in good order and entered against your name. It will not be returned, and it will not be mourned by the only court that could have saved it. The balance is yours. The rank is not, not yet. Keep feeding the ledger. It is the only thing down here that loves you, and only for exactly as long as you fill it.
- Notes:   none

### parish-bulletin
- Kind:    consequence
- Trigger: influence >= 1000
- Thread:  none
- From:    The Parish Bulletin
- Subject: A word on the season's troubles
- Grants:  none
- Body:    Neighbours, it has been a heavy season. More drink than is wise, more debt than is kind, and a greyness in good people that none of us can put a name to. Three more empty chairs at the table this month, and no one will say the fourth name aloud. We tell ourselves it will pass, the way weather passes. Keep close to one another. Keep the lamps lit, and keep counting heads.
- Notes:   Your work, seen from below and mistaken for weather.

### seal-price
- Kind:    lore
- Trigger: boundSigils >= 1
- Thread:  none
- From:    (unsigned)
- Subject: On the binding
- Grants:  none
- Body:    You will have felt it close. Understand what you have done. A seal does not borrow a soul, it swallows one, and it keeps the shape forever, awake and aware, pressed flat inside the metal where no prayer has ever reached. Bind as many as you like. Only never imagine the ledger runs backward, and never put a seal to your ear in the dark, because some of them have learned to say your name, and they say it the way you used to say it, before.
- Notes:   none

### do-not-dial
- Kind:    easter-egg
- Trigger: firstApocalypticOutcome == true
- Thread:  none
- From:    [sender withheld]
- Subject: (no subject)
- Grants:  none (seeds HIDDEN number 066.613.1307 → calls-out `the-hollow`)
- Body:    if you are reading this it already has your address. do not write back. and whatever else you do, do not call the long number. 0 6 6 . 6 1 3 . 1 3 0 7. if the line is dead, be grateful and forget it. if it answers, understand that you were never the one holding the phone, and that you never have been, and that the dialing was only ever a courtesy it extended to you.
- Notes:   Digits are in the body, not granted. Player types them on the keypad to reach `the-hollow`.

### the-fixer
- Kind:    info+number
- Trigger: businessCount >= 1
- Thread:  none
- From:    an old associate
- Subject: When they come asking
- Grants:  fixer  [on read]
- Body:    They always come. Auditors, widows, the ones who loved what you ruined and want to stand close enough to see whether you feel it. When they do, you will want this number. He is discreet, he is expensive, and in thirty years he has never failed me or left anything behind that a coroner could read aloud. Use him sparingly. He keeps a count of who calls too often, and the last name on that list is always, eventually, the next job.
- Notes:   none

### the-appraiser
- Kind:    info+number
- Trigger: maleficiaOwned >= 1
- Thread:  none
- From:    Cassian, antiquary
- Subject: Curios
- Grants:  appraiser  [on read]
- Body:    Word is you have been turning up curiosities. The old, ugly, useful kind, the sort that go quiet when you watch them and start again when you look away. I value such things, and on a good day I take them off your hands for coin before they take something off yours that you cannot put back. My line is below. Bring me something that should not exist. Do not ask what I do with it after, and do not come back asking where it went.
- Notes:   none

### mara-1
- Kind:    answerable
- Trigger: anySinLevel >= 2
- Thread:  mara
- From:    M.
- Subject: An arrangement
- Grants:  none
- Replies:
  - [Hear her out] → setFlag(mara, 1); scheduleEmail(mara-2, 30)
  - [Delete]       → nothing()
- Body:    I have watched your ledger grow. Talent like yours should not climb unsponsored. It is so slow that way, and the slow ones are forgotten, and forgotten is the worst thing you can be down here. Worse than punished, because the punished are at least still owned. I can shorten the road. There is a consideration. Reply now, before you find the nerve to think better of it.
- Notes:   [Delete] lets the thread sleep; mara-1 may re-arm later.

### mara-2
- Kind:    answerable
- Trigger: flag.mara >= 1
- Thread:  mara
- From:    M.
- Subject: Terms
- Grants:  mara-line  [on reply: Agree]
- Replies:
  - [Agree, pay the tithe] → resource(souls, -<tithe>); grantContact(mara-line); setFlag(mara, 2)
  - [Refuse]               → setFlag(mara, -1); scheduleEmail(mara-cold)
- Body:    A tithe, then. A measure of what you have gathered, paid once, and my patronage is yours for the whole of this life. When you mean to agree, do not write it down, and do not say it anywhere you can hear yourself clearly. Say it aloud to the line below. They prefer it in your own voice. They keep that too, alongside everything else of yours they are already keeping.
- Notes:   Agreeing grants the number; the pact is sealed by CALLING it (calls-out `mara-pact`).

### mara-cold
- Kind:    consequence
- Trigger: flag.mara == -1
- Thread:  mara
- From:    M.
- Subject: As you like
- Grants:  none
- Body:    A pity, and a waste of the one favour I was going to do you. The offer does not keep, and neither do I. Climb the slow way then, and arrive at the bottom as no one, in a crowd of no ones, each of them certain right up to the floor that they were going to be the exception. We will not speak again this life. We may speak in the next, when there is less of you to negotiate with.
- Notes:   Thread closes.

---
## Batch 2

### rank-notice
- Kind:    consequence
- Trigger: hierarchyRank increased
- Thread:  none
- From:    Office of Precedence, Below
- Subject: Your standing, revised
- Grants:  none
- Body:    You have moved up one place. Do not mistake this for warmth. The seat you have taken belonged to someone who climbed exactly as you climb, who is now somewhere beneath the floor you are standing on, and who would not lift a finger to spare you, because nobody down here remembers having been spared. Your new quota is attached. It is larger than the last. They are always larger, and there is no number at which they stop.
- Notes:   Fires on rank-up; pairs with a higher quota.

### audit-below
- Kind:    consequence
- Trigger: gold >= 1e6 AND mintedSoulsLifetime low-relative
- Thread:  none
- From:    Reconciliation, Below
- Subject: Discrepancy
- Grants:  none
- Body:    Your coin grows faster than your souls. We have seen the shape of it in a thousand files thicker than yours. An operator who has begun to enjoy the means and quietly mislaid the end, who has started telling himself the gold is the work. Correct the ratio. We do not carry discrepancies and we do not warn twice. We resolve them, and the resolution is never the operator's idea, and it is never quick.
- Notes:   Nudge when gold outpaces souls; veiled threat, no mechanical bite by default.

### competitor-obit
- Kind:    consequence
- Trigger: cadence(rare) AND hierarchyRank >= 3
- Thread:  none
- From:    Office of Precedence, Below
- Subject: A vacancy
- Grants:  none
- Body:    One of your betters has been retired. Quietly, completely, the way it is always done, with no notice given and none owed to a thing that is no longer accruing. There is a gap in the order now, and gaps are filled by whoever happens to be standing nearest when the floor opens under the one above. Stand near. Do not grieve him. He had no grief in him to spend on you, and he had a great deal more practice than you at not feeling it.
- Notes:   Flavor plus an ambition hook toward the apex.

### casino-ruin
- Kind:    consequence
- Trigger: ownsBusiness(avaritia)
- Thread:  none
- From:    (no name)
- Subject: I wanted to thank you
- Grants:  none
- Body:    I do not know if this reaches anyone real. I wanted to say that your place took all of it. The house, the marriage, the years, the way my wife used to look at me before she stopped looking at all. And I kept walking back in, grateful, every single night, and I would walk back in tonight if the doors were open. That is the part I cannot forgive, and it is not you. You only built the room and left the door wide. I am the one who keeps coming through it. I think I always will be, even now, even after.
- Notes:   Adult gambling ruin; the consequence of a Vitium Mercatura business.

### loan-collapse
- Kind:    consequence
- Trigger: ownsBusiness(avaritia) AND businessCount >= 3
- Thread:  none
- From:    Hollis and Crane, Receivers
- Subject: Notice of class action (preliminary)
- Grants:  none
- Body:    We represent four hundred and eleven households foreclosed under instruments traced directly to your enterprises. The interest was lawful. The despair was not actionable, and the funerals less so, though we counted those as well, because someone had to. We are filing regardless, knowing you will not see us coming and that we will not win, because someone in this world should put your name on a page beside the word ruin while there is still a court that pretends to care. Consider it a prayer with a docket number.
- Notes:   The grown-up cousin of the existing `class-action`. No bite by default.

### overdose-vigil
- Kind:    consequence
- Trigger: reprobateSuicidesLifetime >= 50
- Thread:  none
- From:    A neighbourhood list you never joined
- Subject: Candles, Friday, the old bridge
- Grants:  none
- Body:    We are lighting candles Friday for the ones we lost this year, and there were so many this year that we ran out of room on the list and started over at the top in smaller writing. Bring a coat. Bring a name, even one that nobody is left to claim. We read them all out into the dark, every one, and the dark has felt different lately when we do it. Closer. Attentive. Like something on the far side of it is keeping the list too, and is satisfied with the length.
- Notes:   Adult, non-graphic, no methods; the human cost of high suicide rates.

### katabasis-rote
- Kind:    lore
- Trigger: firstKatabasis == true
- Thread:  none
- From:    (unsigned)
- Subject: After the first descent
- Grants:  none
- Body:    So you went down, all the way down, and you climbed back up into your life and found that most of what you had earned stayed at the bottom. Good. Now you understand the only honest thing about this work. You did not die. Death would be a mercy and an ending, and you are owed neither, not yet, not for a long time. You descend. You are scoured of everything except what you have become. You rise, and you do it again, and again, until the one descent that keeps you. Carry that knowledge down with you. It is the only luggage that survives the trip.
- Notes:   Katabasis is descent and return, not death; corrected per design.

### eternal-sin
- Kind:    lore
- Trigger: hierarchyRank >= 6
- Thread:  none
- From:    (unsigned)
- Subject: Semet
- Grants:  none
- Body:    They will tell you the climb has a summit. It does not. At the top there is only the Sin that has learned to need no victim, because it has learned to feed on itself without end and to call the hunger holy. They name it Semet. Almost no one ever sees it. They spend every descent and every life on the stair and arrive at the last as fuel for someone who did. Pray you are not one of the almost everyone. Then remember what you are now, and that nothing on this stair has ever once answered a prayer except by getting closer.
- Notes:   Endgame and apex lore (the Eternal Sin).

### first-tongue
- Kind:    lore
- Trigger: suasioActionsLifetime >= 10
- Thread:  none
- From:    (unsigned)
- Subject: On suggestion
- Grants:  none
- Body:    The whisper is older than the knife. A knife ends one body and leaves a mess that someone has to kneel down and explain. A whisper, set in the right ear at the right hour, ends a marriage, a man, a bloodline, and is thanked for it at the graveside by the people it emptied. Learn the difference between telling a soul what to do and letting it believe the rot was its own idea all along. Only the second kind walks to you on its own feet, and only the willing ones keep their flavour all the way down.
- Notes:   Suasio flavor.

### the-quota
- Kind:    lore
- Trigger: cadence(rare)
- Thread:  none
- From:    Accounts, Below
- Subject: Re: your figures
- Grants:  none
- Body:    A reminder that the dead are not the point. The dead are only inventory, counted once and shelved and forgotten by everyone including themselves. The point is the ratio of the saved to the spent, and you are spending well, and every soul you leave standing is collected instead by someone slower than you and far less merciful, if mercy is even the word, which down here it is not. Frame it as kindness if it helps you rest. We have already filed it under appetite. The file is thick. Your name is on the spine.
- Notes:   Cold bureaucratic flavor.

### chain-letter
- Kind:    easter-egg
- Trigger: cadence(very rare)
- Thread:  none
- From:    a stranger forwarding a stranger
- Subject: FWD: FWD: FWD: do not break the chain
- Grants:  none (sets flag heard-the-chain)
- Body:    this prayer has travelled through nine hells and come back each time wearing a different face. send it to nine of the damned within the hour or the thing you love most will be entered against your name and collected at our leisure, slowly, where you can watch. (you have no one you love. it was noted, in red, a long time ago. send it anyway. we like watching you sit there trying to think of a single name.)
- Notes:   Pure flavor; sets a collectible flag.

### sent-from-yourself
- Kind:    easter-egg
- Trigger: firstApocalypticOutcome == true AND cadence(rare)
- Thread:  none
- From:    you
- Subject: don't
- Grants:  none (sets flag met-yourself)
- Body:    I am writing from later. From much further down than you have gone yet, far enough that I have stopped being sure which of us is the copy. I will not tell you what you do next, because you will do it anyway, and then you will sit exactly where I am sitting and write this out word for word and finally understand. Only this. When the long number answers, and it answers, do not give it your real name. That is the one thing I got right, and it was not enough, and nothing down here ever is. love, you.
- Notes:   Uncanny; nods at `the-hollow`. Flag only.

### the-launderer
- Kind:    info+number
- Trigger: gold >= 1e5
- Thread:  none
- From:    a referral
- Subject: Clean
- Grants:  launderer  [on read]
- Body:    Coin with a smell on it is worth less than coin without, and yours reeks from clear across the room. I take the smell off. My rate is a percentage you will resent and pay anyway, because the alternative is explaining to people far less reasonable than I am where it all came from. The number is below. Do not bring me anything you cannot explain twice the same way, and do not, under any circumstance, bring me anything still warm.
- Notes:   Grants an Emptio/gold-cleaning contact.

### the-broker
- Kind:    info+number
- Trigger: influence >= 5000
- Thread:  none
- From:    no signature, expensive paper
- Subject: Leverage
- Grants:  broker  [on read]
- Body:    Powerful people bury things. Debts, bribes, the deals they swore to a God they do not believe in that they never made, the one night that would end them entirely if it ever found daylight. I sell the shovels, and for the right number, the maps. If you want a man in your pocket for the rest of his life, call. I never sell you the worst of what I hold on anyone. I keep the worst of it for myself, against the day I need them more than you can pay.
- Notes:   Adult financial and political kompromat, never sexual. Grants `broker`.

### the-notary
- Kind:    info+number
- Trigger: hierarchyRank >= 2
- Thread:  none
- From:    a clerk who should not
- Subject: Signatures
- Grants:  notary  [on read]
- Body:    There is a stamp on my desk that turns a lie into a record, and a record into a truth that no court will ever dig beneath. I am not supposed to lend it. I am also, very much, supposed to keep my mother breathing in a bed I have no honest way to pay for. You can see the whole arrangement already. The number is below. The discretion runs both directions, and so does the leverage, so do not get clever with me. I have nothing left to lose, and that makes me far more dangerous than you.
- Notes:   A corrupt official; unlock and fast-track favors. Grants `notary`.

### the-undertaker
- Kind:    info+number
- Trigger: cholericMurdersLifetime >= 10
- Thread:  none
- From:    (a single dot)
- Subject: .
- Grants:  undertaker  [on read]
- Body:    Some problems walk, and talk, and will not stop doing either no matter how reasonably you ask them to. I make problems stop. Cleanly, finally, with no story left over for anyone to find and tell. I do not ask who, and I do not ask why, and I never keep the names, because names are the rope the dead use to climb back. Call only when you have decided all the way down to the floor of yourself, because I do not undo a thing, and I have never once forgotten a client.
- Notes:   Euphemistic and non-graphic; ties to the Decimatio fantasy already in-game. Grants `undertaker`.

### judge-1
- Kind:    answerable
- Trigger: flag.broker-used >= 1
- Thread:  judge
- From:    a number you were handed
- Subject: please
- Grants:  none
- Replies:
  - [Name a favour] → setFlag(judge, 1); scheduleEmail(judge-2, 20)
  - [Reassure him]  → nothing()
- Body:    I know what you have. I know to the hour what it does to me the moment it moves. I am not going to insult either of us by pretending I still have a choice in any of this. Tell me what you want. Tell me it ends after. Lie to me about that last part if you need to, I am asking you to, because I would rather be lied to gently than sit here one more night listening to the truth in my own voice.
- Notes:   Adult financial and bribery kompromat. [Reassure him] sleeps the thread.

### judge-2
- Kind:    answerable
- Trigger: flag.judge >= 1
- Thread:  judge
- From:    the judge
- Subject: re: please
- Grants:  judge-line  [on reply: Demand]
- Replies:
  - [Demand the ruling] → resource(influence, +<inf>); setFlag(judge, 2); grantContact(judge-line)
  - [Bleed him slowly]  → setFlag(judge, 3)
- Body:    A ruling I can do. A ruling I can survive afterward is the harder thing, but I can manage it once. Do not ask for it in writing. Do not ask for it twice. And do not let yourself forget for one comfortable minute that the world turns, and that I will be on the receiving end of an arrangement exactly like this one some night, with your name gone cold in my hand and not one reason left to be kind about it.
- Notes:   [Bleed him slowly] makes him a recurring contact instead of a one-off (calls-out judge-line).

### rival-1
- Kind:    answerable
- Trigger: hierarchyRank >= 4
- Thread:  rival
- From:    BELPHE (the rest is scorched)
- Subject: A proposal between equals
- Grants:  none
- Replies:
  - [Parley] → scheduleCall(rival-parley, 90)
  - [Refuse] → setFlag(rival, -1); scheduleEmail(rival-threat, 30)
- Body:    We are climbing the same stair, and it was cut for one. I propose the unobvious thing. We agree, between us, who falls, and it is neither of us, and we divide what is left of the slower ones while they are still warm enough to be worth dividing. Or we do not, and one of us writes the other's vacancy notice and signs it gladly and sleeps fine. Your call. Literally. The line is open, and I am patient, but only in the way of a thing that knows it has already won.
- Notes:   Infernal politics. [Parley] rings the phone (calls-in `rival-parley`).

### rival-threat
- Kind:    consequence
- Trigger: flag.rival == -1
- Thread:  rival
- From:    (no header survived)
- Subject: noted
- Grants:  none
- Body:    Noted. You will find I am patient the way the floor is patient with the man who keeps pacing it, certain he is on his way somewhere. Climb well. Climb fast. Climb out in front of me, where I can watch the back of your neck. I will be the gap you do not feel open until you are already through it and falling, and I will not hurry on the way down, because there is no bottom to this, and we are going to have so very long to talk.
- Notes:   Thread closes with a standing threat (flavor; no mechanical bite by default).

### penitent-1
- Kind:    answerable
- Trigger: cadence(rare) AND totalReprobates >= 100
- Thread:  penitent
- From:    one of yours
- Subject: I think I want to stop
- Grants:  none
- Replies:
  - [Whisper]     → buff(conversionRateMul, ×1.05, <med>); setFlag(penitent, 1)
  - [Let them go] → resource(souls, -1); setFlag(let-one-go, 1)
- Body:    I do not know how I got your address. I do not know how I got like this, hollowed all the way out and grateful for the room it made. I keep almost praying. I get as far as the first word and then something in me closes the door so gently that I thank it on the way past. If you are who I have become afraid you are, tell me it is too late for me. Tell me, and I will believe you the way I have believed every other thing you ever put in my mouth, and I will stay, and I will stop reaching for the light that almost remembered my name.
- Notes:   Adult repentance arc, no methods. [Let them go] loses the soul but flags a hidden mercy.

### charity-front
- Kind:    consequence
- Trigger: activeToggle(charity) == true
- Thread:  none
- From:    Civic Recognition Committee
- Subject: With our deepest gratitude
- Grants:  none
- Body:    On behalf of a grateful community we wish to honour your foundation's tireless generosity this year. The new wing will carry your name in carved granite above the door, where the grateful will read it on their way in and bless you for it without ever once suspecting. We are certain the good you do is its own reward. But granite outlasts the truth, and the truth, in your particular case, would not fit on any wall they could afford to build.
- Notes:   Irony; flavor reward for running the Charity Compositum toggle.

### recruiter-below
- Kind:    answerable
- Trigger: hierarchyRank >= 5
- Thread:  recruiter
- From:    A Department That Does Not Post Openings
- Subject: We have been reading
- Grants:  none
- Replies:
  - [Hear the offer] → setFlag(recruiter, 1); scheduleEmail(recruiter-2, 45)
  - [Not yet]        → nothing()
- Body:    Your file crossed a desk it is not meant to reach until you are far lower and far emptier than you are now. Someone read it twice, which almost never happens. They want to skip several of your descents and bring you up early, before you have quite finished becoming the thing the climb makes of everyone in the end. There is a price. It is not coin and it is not souls. It is the part of you that still flinches. Reply if you want to know whether you have any of that left to sell.
- Notes:   Apex-path hook; the price is deliberately unnamed (a future deep-pact thread).

---
## Batch 3 (threats to life and altar; crazies, investigators, rivals)

### the-prophet
- Kind:    easter-egg
- Trigger: cadence(rare) AND influence >= 2000
- Thread:  none
- From:    a name that is only numbers
- Subject: I SAW WHAT YOU ARE
- Grants:  none (sets flag prophet-found-you)
- Body:    i did not want to write to you. i was told to. you are the grey smear over the town now, the thing the photographs cannot hold still, i see you when i close my eyes and pray and i see you when i open them and do not. i know about the locked room. i know how you lie naked on the stone. i am going to come to your house and i am going to put my hands on the stone and break it and pour salt into the channel cut down its middle, and then there will be one less mouth in the world, and the rest of us can finally sleep through a whole night.
- Notes:   Crazy. Threat to the altar and your life.

### nail-letter
- Kind:    easter-egg
- Trigger: cadence(rare)
- Thread:  none
- From:    (no sender; an attachment failed to load)
- Subject: yours
- Grants:  none
- Body:    the second drawer of your desk sticks. i fixed it for you. you are welcome. the photographs of the woman are where you left them, but i turned the top one face down, because she was looking at me and i did not care for it. i have been keeping your house warm for the night you finally understand that it is also mine. i counted everything in it. you have less than you think, and soon you will have exactly what i decide to leave you. do not change the locks. i made the new keys last week. i am very, very good with my hands.
- Notes:   Crazy stalker. Threat to your home and belongings. "the woman" is a generic adult.

### the-journalist
- Kind:    answerable
- Trigger: influence >= 222
- Thread:  vance
- From:    M. Vance, freelance
- Subject: Comment before we run it
- Grants:  none
- Replies:
  - [Deny everything]         → setFlag(press, 1); nothing()
  - [Feed her a smaller name] → resource(influence, +<inf>); grantContact(<one-shot-lead>); setFlag(press, 2)
  - [Make a call about her]   → setFlag(press-threatened, 1)
- Body:    I have spent fourteen months on you. I have the shell companies, the pattern under the foreclosures, the names that turn up once in your orbit and then never turn up anywhere again. I do not yet have the thing underneath all of it, the thing that makes the rest finally make sense, but I am close enough now to smell it, and it smells like a church basement and cold tallow. This is your one courtesy call. Comment, or do not. We run Sunday. I have already mailed sealed copies to three people who publish the moment I go quiet, so please, by all means, make me go quiet. I would genuinely like to watch you try.
- Notes:   Investigator. You can deny, redirect, or threaten her life. She has a dead-man's switch.

### the-detective
- Kind:    consequence
- Trigger: cholericMurdersLifetime >= 25
- Thread:  none
- From:    a retired number
- Subject: I am the one who kept the file
- Grants:  none
- Body:    They closed it. I did not. Eleven of them across nine years, and every one a road that runs straight to you and then stops being a road at all. I am old now, and I do not sleep, and I have nothing left that anyone could take from me, which I am reliably told is the most dangerous thing a man can become, and I have decided at last to find out whether that is true. I am not going to arrest you. You and I are well past that. I am going to be standing in your kitchen one of these nights, the file in one hand and the other thing in the other, and we are going to close it together, finally, the way it should have been closed a long time ago.
- Notes:   Investigator turned vigilante. Direct threat to your life. Non-graphic.

### rival-altar-covet
- Kind:    answerable
- Trigger: boundSigils >= 10
- Thread:  rival-altar
- From:    a peer you have not met
- Subject: The stone you lie on
- Grants:  none
- Replies:
  - [Refuse]      → setFlag(rival-altar, -1); scheduleEmail(rival-altar-threat, 60)
  - [Name a price] → setFlag(rival-altar, 1); scheduleCall(rival-altar-parley, 120)
- Body:    your blood will make a good catalyst for my next katabasis on your altar
- Notes:   Rival covets the altar. Threat to altar and life. Refusing arms `rival-altar-threat`.

### rival-altar-threat
- Kind:    consequence
- Trigger: flag.rival-altar == -1
- Thread:  rival-altar
- From:    (the same hand, closer now)
- Subject: as promised
- Grants:  none
- Body:    You were warned, and a warning is a courtesy I do not spend twice on the same person. I know the room. I know the precise hour you are weakest at the stone, which is the hour you feel strongest at it, the one just after a good harvest when you let yourself believe the climb has finally become yours to keep. I will come then. I will take the stone, and I will take the hand you reach toward it with, and I will leave you all the rest, on purpose, so that you live on to remember the trade you were too proud to make like a gentleman. The altar was never going to be yours forever. Nothing down here is forever, except the falling, and you have so much of that still ahead of you.
- Notes:   Follow-up. Threat to altar and to your hand/life. Closes the covet thread.

### rival-we-see-you
- Kind:    consequence
- Trigger: hierarchyRank >= 3 AND boundSigils >= 5
- Thread:  none
- From:    no return path
- Subject: third window from the left
- Grants:  none
- Body:    We have known about it for longer than you have had it lit.
- Notes:   Rival. They know you have the altar. Surveillance menace, no overt life threat yet.

### rival-your-life
- Kind:    consequence
- Trigger: hierarchyRank >= 5
- Thread:  none
- From:    a colleague in the descent
- Subject: a date
- Grants:  none
- Body:    I have chosen the night you die.
- Notes:   Rival. Direct threat to your life. Dying drops you to the foot of the stair (Katabasis-consistent setback), not death proper.

### rival-i-descend-too
- Kind:    consequence
- Trigger: hierarchyRank >= 6
- Thread:  none
- From:    someone built exactly like you
- Subject: do not bother
- Grants:  none
- Body:    By now you will have started thinking about removing me. I am writing to spare you the wasted effort and the wasted life it would cost you, because I keep an altar of my own, older than yours, and I have died more times than you have managed to live. Each descent I come back up a little less interruptible. I climb back at my leisure and I find you exactly where I left you, slower, softer, one whole life poorer for the attempt. You can only postpone me. We are going to be doing this to one another for a very long time, you and I, and I have roughly four centuries of a head start.
- Notes:   Rival capstone. Has their own altar, does Katabasis, cannot be permanently killed. Existential, perpetual threat. Ties to corrected Katabasis lore.
