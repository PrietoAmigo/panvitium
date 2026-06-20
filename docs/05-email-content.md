# 05: Email Content

This document captures the content and triggers for the email system. Each record states the sender
name, the sender email, the date, the subject, the body, the available answers (with their effects,
where applicable) and the trigger.

**Date rule.** Every email's displayed date is the real date on which it is received, with the year
always rendered as 2015. In each record the date is written as a token, `{received date · year →
2015}`, to be resolved at runtime.

**Spacing rule (per sender).** Body whitespace characterises the writer, so the inbox reads like real
mail. The reading pane renders bodies with `white-space: pre-wrap`, so in the strings catalog a blank
line between paragraphs is `\n\n` and a plain line break (e.g. before a sign-off) is `\n`. Senders who
care about how a letter looks — the steward Gideon, the parish and the clergy, the newsletter
publications, and above all the fastidious aristocrat Fausto — are written with a greeting, paragraph
breaks at natural beats, and a blank line before the sign-off. Reuben Marsh, a barely-literate mason
who cares for none of it, is left as a single unbroken run-on block per letter (which also keeps his
sentence-initial acrostics — KATABASIS, OBSIDIAN, WAKE UP — contiguous and easy to read off). The
blockquote bodies below are reference prose; the authored spacing lives in the strings catalog.

**Voice and the two layers (per the lore bible §0, §4, §10).** The household and the world know
nothing and never use occult vocabulary. The parish is oblique and never about the player directly.
The bishop and the investigator know more than they say and sharpen toward the endgame. The
adversary speaks the truth plainly because he shares it. The madman has only the symptoms. No
hidden-layer vocabulary (vibration, frequency, wave, field, energy, resonance, and the rest) appears
anywhere a player can read it.

---

## Implementation notes (flags, derived values, hooks)

Triggers and effects below reference the following. New persisted fields follow the ADR-023
additive-optional pattern.

- **`katabasisCount`**: existing. "Return from the Nth katabasis" is the surface tick after
  `katabasisCount` increments to N. "X mins after" counts surface time after that moment.
- **`totalSinLevel`**: the sum of the eight Cardinal-Sin levels (each `sinLevel` floored). "All
  sins lvl N" means every one of the eight Cardinal Sins is at level N or higher.
- **`totalSoulsObtained`**: a monotonic, never-decreasing running total of every soul ever minted
  across the whole game (spans lifetimes). Drives the parish soul thresholds. Add as an
  additive-optional field if not already present.
- **"Per run"**: once per current lifetime (the world emails reset their one-shot eligibility on
  each Katabasis).
- **Plutus**: the `plutus` invocation (static modifier-bundle contribution on Vitium Mercatura
  output). "First Plutus of the run" is the first transition of `lifetime.invocations.plutus` from 0
  to greater than 0 this lifetime. "Still active" means it is greater than 0 at fire time.
- **Thirty Pieces of Silver**: the `thirty_pieces_of_silver` maleficium (×3 gold gain). "In your
  ownership" means it is present in `lifetime.maleficia`.
- **Panvitium (VC)**: the `panvitium` Vitium Compositum toggle (every Sin at Level 3). "Running for
  at least 3 seconds" means it has been continuously active for 3 seconds or more.
- **`flagFatherMad`**: default 0. Set to 1 by Father Tom Brennan #2, Answer (2).
- **`flagFCfriendly`**: default 0. Set to 1 if Fausto Cescru #1 is left unanswered (its threat reply
  is never sent) by the time the #2 gate is first evaluated. Sending the threat reply locks it at 0.
- **`flagReubenDead`**: default 0. Set to 1 (and +1 soul minted) by Reuben Marsh #2 Answer (2) or
  Reuben Marsh #3 Answer (2).
- **`flagFaustoCurse`**: default false. New. Set true on receipt of Fausto Cescru #4. While true,
  reprobate generation rate, influence gain rate and gold gain rate are each multiplied by 0.67 (a
  33% reduction). The debuff is shown in the HUD. Deleting Fausto #4 sets it false and clears the
  debuff. Add as an additive-optional field.
- **Door-knock SFX**: a one-shot sound played on receipt of Fausto Cescru #5 (Howler, per ADR-014).

---

## Household emails

### Gideon Reyes #1
- **From:** Gideon Reyes, `g.reyes@reyes-stewardship.com`
- **Date:** {received date · year → 2015}
- **Subject:** Welcome home, and a frank word about the float
- **Body:**
  > Welcome back. I will be blunt, because you pay me to be: while you were away the cash ran
  > perilously close to the bone, closer than I am comfortable with. The visible holdings I steward,
  > the shops, the property, the dull legitimate book, kept the lights on and the staff paid, which
  > is precisely why they are the part that survives a long absence. The rest of what you keep your
  > own counsel on does not survive you being unreachable, and that is your affair, not mine. My
  > proposal is simple: hand me a larger share to manage on the usual percentage, and the next time
  > you vanish for months the floor under you sits higher. Think on it. Glad you are home.
  > Gideon
- **Answers:** none.
- **Trigger:** 2 minutes after returning from the first katabasis (`katabasisCount` reaches 1).

### Gideon Reyes #2
- **From:** Gideon Reyes, `g.reyes@reyes-stewardship.com`
- **Date:** {received date · year → 2015}
- **Subject:** A delicate matter about the house
- **Body:**
  > A delicate one. I have had word, more than once now, that the household helps itself while you
  > are away. Silver, small valuables, the odd thing that never makes it onto a list. I will not put
  > names in an email I do not control. Several of my clients in your bracket use Hearthstone
  > Protective: discreet, bonded, and they ask no questions about what is behind which door. I can
  > make the introduction today if you want the house watched the next time you travel. Your call,
  > as ever.
  > Gideon
- **Answers:** none.
- **Trigger:** 2 minutes after returning from the second katabasis (`katabasisCount` reaches 2).

### Gideon Reyes #3
- **From:** Gideon Reyes, `g.reyes@reyes-stewardship.com`
- **Date:** {received date · year → 2015}
- **Subject:** Whoever it is, don't let them poach you
- **Body:**
  > I have to say it: your last few calls have been inspired. The timing on the new ventures, the way
  > the legitimate book is suddenly throwing off cash like it never has, it is the cleanest run I
  > have seen from you. Either you have found yourself a second advisor you are not telling me about,
  > or you have gotten frightening good at this. Whoever is whispering in your ear, do not you dare
  > let them poach you off me. I would be lost without the percentage, and the company.
  > Gideon
- **Answers:** none.
- **Trigger:** 5 minutes after the first Plutus of the run is invoked, fired only if `plutus` is
  still active at that moment.

### Gideon Reyes #4
- **From:** Gideon Reyes, `g.reyes@reyes-stewardship.com`
- **Date:** {received date · year → 2015}
- **Subject:** I have stopped asking questions
- **Body:**
  > I do not know what you did, and I have decided not to ask. Everything, and I mean everything, is
  > up. The shops, the property, the side of the book that usually limps, all of it printing money
  > this month as though the stars lined up over your head and agreed you had earned it. I have
  > stopped trying to explain it to the accountant and started simply enjoying it. Keep doing
  > whatever it is.
  > Your humble and slightly bewildered steward,
  > Gideon
- **Answers:** none.
- **Trigger:** 5 minutes after the Thirty Pieces of Silver maleficium enters your ownership.

---

## The world / commerce emails

Twelve subscribed newsletters and reactive messages that surface the player's impact on the world,
mixed with mundane noise and a few that have nothing to do with the player, for variety. Each fires
**randomly, at most once per run (lifetime)**. Where an eligibility gate is noted, the email only
enters the random pool once that condition holds, so it lands as a consequence of what the player has
built. None carry mechanical effects unless stated.

### Newsletter #1: Markets (impact)
- **From:** Cinder & Vale Research, `brief@cindervale-research.com`
- **Date:** {received date · year → 2015}
- **Subject:** The quiet money is in vice
- **Body:**
  > Weekly note. The sin trades lead the tape again: gaming, lending, and private leisure outpacing
  > the broad market for a fifth straight week, with a cluster of privately held operators rumoured
  > to be behind the move. Analysts cannot name the buyers; the flows are off exchange and patient.
  > Our read: where appetite is the product, the cycle never turns. Positioned accordingly.
- **Answers:** none.
- **Trigger:** random, once per run; eligible once you own at least one Avaritia (Mammon) business of
  tier 3 or higher.

### Newsletter #2: Class action (impact)
- **From:** Hollis, Renner & Pratt LLP, `claims@hrp-massaction.com`
- **Date:** {received date · year → 2015}
- **Subject:** Were you or a loved one harmed? You may be entitled to compensation
- **Body:**
  > Legal notice. Our firm is investigating a major processed and fast food operator for knowingly
  > engineering its products to be over consumed, and for the downstream harm to its customers'
  > health. If you or someone you know suffered as a result, you may qualify to join a class action.
  > No fee unless we recover. Time limits apply.
- **Answers:** none.
- **Trigger:** random, once per run; eligible once you own at least one Gula (Beelzebub) business of
  tier 3 or higher.

### Newsletter #3: Public health bulletin (impact, news framing)
- **From:** County Health Dispatch, `dispatch@countyhealth.org`
- **Date:** {received date · year → 2015}
- **Subject:** Overdose deaths climb for the eleventh straight quarter
- **Body:**
  > Public bulletin. The county coroner reports another record quarter for fatal overdoses,
  > concentrated in prescription sedatives and pain medication. Officials note that a small number of
  > high volume clinics and pharmacies sit far outside the normal range, but name no parties pending
  > review. Families are urged to secure medication and to seek help. Resources are listed below.
- **Answers:** none.
- **Trigger:** random, once per run; eligible once you own at least one Acedia (Belphegor) business
  of tier 2 or higher.

### Newsletter #4: Local weekly (mundane variety)
- **From:** The Riverside Almanac, `editor@riverside-almanac.com`
- **Date:** {received date · year → 2015}
- **Subject:** Fair results, a record squash, and a note on the footbridge
- **Body:**
  > This week: congratulations to the Pelham family, whose squash took first at the county fair at a
  > frankly alarming forty one pounds. The relay team placed third at regionals; well run, all. The
  > footbridge by the mill is closed for repair through the month, so plan the long way round. Lost:
  > a grey terrier answering to Biscuit, last seen near the canal. Be kind to one another.
- **Answers:** none.
- **Trigger:** random, once per run.

### Newsletter #5: Broker (commerce opening)
- **From:** Aldous Pike, Acquisitions, `apike@pike-acquisitions.com`
- **Date:** {received date · year → 2015}
- **Subject:** Off market, discreet, yours first
- **Body:**
  > A mutual acquaintance suggested you appreciate opportunity that others find distasteful. A
  > private nightlife and adult entertainment group one county over is quietly distressed; the family
  > wants out fast and clean, no press. The figures are better than they have any right to be, for a
  > buyer who is not squeamish about the trade. I show this to three people. You are the first. Say
  > the word.
- **Answers:** none.
- **Trigger:** random, once per run.
- *Author note: designed as a corruption opening the player recognises. No mechanical effect wired
  yet; a future hook could surface a discounted business or an Emptio listing on engagement.*

### Newsletter #6: Culture / outrage digest (impact)
- **From:** PARSE Daily, `team@parsedaily.com`
- **Date:** {received date · year → 2015}
- **Subject:** The internet has decided. Again.
- **Body:**
  > Today's cycle: a daytime personality's old footage resurfaced, the pile on hit critical mass by
  > lunch, three sponsors fled by dinner, and a tearful apology video is already past four million
  > views. By tomorrow no one will remember the cause, only the appetite for the next one. The
  > outrage machine is the only thing in this country that never sleeps, and business has never been
  > better for the people who feed it.
- **Answers:** none.
- **Trigger:** random, once per run; eligible once you own at least one Vanagloria (Rosier) business
  of tier 2 or higher.

### Newsletter #7: Charity appeal (mundane variety)
- **From:** Brightwater Children's Fund, `give@brightwaterfund.org`
- **Date:** {received date · year → 2015}
- **Subject:** A warm coat is a small thing. To a child it is everything.
- **Body:**
  > Winter is coming early this year, and our coat drive is short by two hundred. For the price of a
  > coffee you can keep a child warm on the walk to school. We are a small fund, and every gift
  > reaches a child in the county directly. Thank you for caring. However you can help, it matters.
- **Answers:** none.
- **Trigger:** random, once per run.

### Newsletter #8: Wealth letter (commerce opening)
- **From:** Meridian Private, The Quiet Letter, `letter@meridian-private.com`
- **Date:** {received date · year → 2015}
- **Subject:** For clients who prefer not to be seen
- **Body:**
  > This month: why visible wealth is a liability, and how our clients structure theirs to be neither
  > here nor there. We do not advertise, we do not appear in rankings, and our best clients like it
  > that way. If your affairs have grown complicated enough to need this letter, you already know who
  > to call. Discretion is the only product worth paying for.
- **Answers:** none.
- **Trigger:** random, once per run.
- *Author note: a quieter bait than #5; corruption as commerce, no mechanical effect wired.*

### Newsletter #9: Regional crime wire (impact)
- **From:** The Aldermoor Courier, Morning Wire, `wire@aldermoor-courier.com`
- **Date:** {received date · year → 2015}
- **Subject:** Violent incidents up sharply; a quiet boom in the trade behind them
- **Body:**
  > Morning wire. Reported assaults and weapons seizures are up across the county for the third month
  > running, and a regional fight promotion is under scrutiny after a death in the cage. Off the
  > record, two distributors are doing the best business of their careers and saying nothing about
  > it. Our editorial asks the question no one wants asked: who profits when a place turns mean?
- **Answers:** none.
- **Trigger:** random, once per run; eligible once you own at least one Ira (Satan) business of tier
  2 or higher.

### Newsletter #10: Attention culture (impact)
- **From:** Loop Weekly, `hello@loopweekly.com`
- **Date:** {received date · year → 2015}
- **Subject:** We cannot put it down (and neither can you)
- **Body:**
  > The numbers are in and they are obscene: average daily watch time crossed five hours this
  > quarter, a new record, with one platform quietly capturing most of the gain. Designers call it
  > engagement. Everyone else calls it not being able to stop. Whatever you call it, a great many
  > people did very little else this week, and someone made a fortune from exactly that.
- **Answers:** none.
- **Trigger:** random, once per run; eligible once you own at least one Acedia (Belphegor) business
  of tier 3 or higher.

### Newsletter #11: Discipline letter (impact)
- **From:** ASCEND, the discipline letter, `coach@ascend-letter.com`
- **Date:** {received date · year → 2015}
- **Subject:** Comfort is the enemy. Day 47.
- **Body:**
  > Most men are asleep at the wheel of their own lives. Not you, because you opened this. The
  > clinics are full of men finally optimising, the schools are full of men finally grinding, and the
  > ones who laugh at us are the ones we left behind. Pain is just weakness leaving. Reply ASCEND to
  > lock in next quarter at the founder rate.
- **Answers:** none.
- **Trigger:** random, once per run; eligible once you own at least one Superbia (Lucifer) business
  of tier 2 or higher.

### Newsletter #12: Seismic watch (eerie variety, not about the player)
- **From:** Regional Micro Seismic Watch, `bulletin@geomonitor-network.org`
- **Date:** {received date · year → 2015}
- **Subject:** Tremor swarm with no mapped fault, and a second cluster abroad
- **Body:**
  > Volunteer bulletin. Our sensors logged a small swarm of micro tremors under the county this
  > month, none above 2.1 on the Richter scale, all from a point with no fault on any map we hold.
  > Odder still, a colleague in Spain reports a near identical swarm under no fault either, the two
  > clusters keeping a strange sort of time with one another. Probably instrument error at both ends.
  > Probably. We will keep watching.
- **Answers:** none.
- **Trigger:** random, once per run.
- *Author note: brushes the truth (two epicentres for the two descenders) and never confirms it. No
  banned soul vocabulary used; "tremor", "epicentre" and "Richter" are ordinary seismology terms.*

---

## The Church emails

### Father Tom Brennan #1
- **From:** Fr. Tom Brennan, `frtom@sacredheart-parish.org`
- **Date:** {received date · year → 2015}
- **Subject:** It has been an age, my friend
- **Body:**
  > My friend, it has been an age. I notice these things, you know: an empty pew where a familiar
  > face used to be, and I worry, the way a man in my line is prone to. Your standing gift lapsed
  > while you were away, which I would never have mentioned except that it is the one thing that made
  > me wonder if something were wrong. The parish misses your kindness, but I miss the man more than
  > the giving, and I want you to know that. Whatever has kept you, I hope it is nothing heavy, and
  > that you are well. Come by when you can. The kettle is always on.
  > Fr. Tom
- **Answers:**
  - (1) "Of course, Father. You can count with me in every sense, I will keep on my contributions. I
    hope everything is fine. Best.". No mechanical effect.
- **Trigger:** 12 minutes after returning from the first katabasis (`katabasisCount` reaches 1).

### Parish Newsletter #1
- **From:** Sacred Heart Parish, `bulletin@sacredheart-parish.org`
- **Date:** {received date · year → 2015}
- **Subject:** Weekly bulletin: hard months, and a little grace
- **Body:**
  > Sacred Heart Parish, weekly bulletin. It would be untrue to say these have been easy months.
  > Costs are up, hands are fewer, and the old chapel stays cold no matter what we feed the boiler.
  > And yet there is grace to report: Maren Holt, who sits with our dying up at the county hospital,
  > has brought more than a few hard passings to something like peace this season, and those souls
  > are safe now, past all trouble. We hold to that. Mass times unchanged. The pantry needs tinned
  > goods. God keep you.
- **Answers:** none.
- **Trigger:** reaching 1,000,000 `totalSoulsObtained`.

### Father Tom Brennan #2
- **From:** Fr. Tom Brennan, `frtom@sacredheart-parish.org`
- **Date:** {received date · year → 2015}
- **Subject:** Bless you, and pay the whispers no mind
- **Body:**
  > Bless you, truly. The gift came through and it has already done real good: the boiler in the old
  > chapel is finally fit to replace, the pantry shelves are full for the first time since spring,
  > and the after school room has a roof that no longer weeps when it rains. I will make the
  > obligatory joke about your accountant loving the write off, and then I will tell you it was a
  > joke, because I know why you really give. I will be honest with you, since we are friends: I have
  > heard the whispers, the ugly ones, that you have a hand in unsavoury trades. I do not believe a
  > word of it. Men who climb as high as you do always draw the small and the envious, who would
  > rather pull a good man into the mud than look at their own feet. Pay them no mind. You have a
  > friend in me.
  > Fr. Tom
- **Answers:**
  - (1) "Thank YOU, Father. I would do anything to keep this Parish standing. As you know the evil is
    always lurking, the lies will not stop me from bringing good to this world. TY&KR.". No
    mechanical effect.
  - (2) "you're such a dumb cunt ahahah". Effect: set `flagFatherMad = 1`.
- **Trigger:** Avaritia (Mammon) reaches level 2.

### Bishop Adelard Crane #3
- **From:** Bishop Adelard Crane, `a.crane@aldermoor-diocese.org`
- **Date:** {received date · year → 2015}
- **Subject:** A courtesy, and a line money does not move
- **Body:**
  > We have not met, and I will keep this brief and plain, as my office requires. Your contributions
  > to Sacred Heart have been noted, and the diocese is grateful for them in the ordinary way. I must
  > be equally plain about a line that money does not move. It is the settled view of people I trust
  > that your fortune is bound up in trades this Church cannot bless, and were that to remain so, no
  > gift, of any size, would purchase you a welcome in our pews or our company. I tell you this as a
  > courtesy, not a threat. You would do well to consider where your house truly stands.
  > Yours in Christ,
  > Adelard Crane
- **Answers:** none.
- **Trigger:** all sins level 2 and `flagFatherMad = 0`.

### Father Emil Stahl #4
- **From:** Fr. Emil Stahl, `e.stahl@aldermoor-diocese.org`
- **Date:** {received date · year → 2015}
- **Subject:** This is not an inquiry
- **Body:**
  > You do not know me. I have known you for some time. I will not insult either of us by pretending
  > this is an inquiry. I know the nature of the things you keep, and the rites you keep them for. I
  > know the trades your wealth truly springs from, and I know that wherever your interests reach,
  > people die in numbers a place this size should not produce. I have set it all down, carefully,
  > and I have placed it before those who answer to the law and those who answer to God. You will
  > hear from both. I would say repent, but I no longer think you capable of it.
  > Fr. Emil Stahl
- **Answers:** none.
- **Trigger:** (all sins level 3 and `flagFatherMad = 0`) **or** (all sins level 2 and `flagFatherMad
  = 1`).

### Parish Newsletter #2
- **From:** Sacred Heart Parish, `bulletin@sacredheart-parish.org`
- **Date:** {received date · year → 2015}
- **Subject:** Weekly bulletin: be the rock the storm breaks against
- **Body:**
  > Sacred Heart Parish, weekly bulletin. There is no soft way to say it: the world outside these
  > doors has gone strange and mean this year, and many of you have felt it in your own homes. We
  > will not pretend otherwise, and we will not be moved by it either. A parish is a rock the storm
  > breaks against, and that is the whole of our job in a season like this. Our thanks again to Maren
  > Holt, whose work for the hospital and for us has been a steady light, sitting with those at the
  > end and seeing them safely out. Hold to one another. We will weather this.
- **Answers:** none.
- **Trigger:** reaching 10,000,000 `totalSoulsObtained`.

### Father Emil Stahl #5
- **From:** Fr. Emil Stahl, `e.stahl@aldermoor-diocese.org`
- **Date:** {received date · year → 2015}
- **Subject:** I have stood in the street and watched it
- **Body:**
  > God forgive me, I did not want to believe it of any living soul, and now I have stood in the
  > street and watched it and I cannot unsee it. This is you. The madness loose in this city tonight,
  > the appetite in every gutter, all of it pours from one source, and I know its name and its
  > address. I am done building a quiet case. I am gathering everyone who will listen, with
  > everything I have, and we are coming for the thing you have made of yourself. I will not stop.
  > And though it will do no good, I pray for your soul, because someone must.
  > Stahl
- **Answers:**
  - (1) "It's pandemonium, but specifically it's panvitium. The latter could be considered a subset
    of the former. You're welcome.". No mechanical effect.
- **Trigger:** the Panvitium (VC) toggle has been continuously active for at least 3 seconds.

### Parish Newsletter #3
- **From:** Sacred Heart Parish, `bulletin@sacredheart-parish.org`
- **Date:** {received date · year → 2015}
- **Subject:** Weekly bulletin: what are we for, if not this
- **Body:**
  > Sacred Heart Parish, weekly bulletin. We have lost more of our own this year, good people who
  > slid into the bottle, the pill, the screen, the easy ruin, and did not climb back out. It forces
  > the hard question on a parish: what are we for, if not to stand between a soul and that long
  > fall. We do not have a clever answer. We have only the old one, that grace is real and the
  > Greater Good is worth the keeping, and we will go on saying so into the dark. A word of thanks,
  > finally, to our new friend and benefactor Fausto Cescru, whose generosity and steady counsel have
  > carried us through a season we could not have weathered alone. God keep you all.
- **Answers:** none.
- **Trigger:** reaching 100,000,000 `totalSoulsObtained` and `flagFatherMad = 1`.

---

## The adversary

### Fausto Cescru #1
- **From:** Fausto Cescru, `fausto.cescru@cescru.es`
- **Date:** {received date · year → 2015}
- **Subject:** I have decided to notice you
- **Body:**
  > I do not write to strangers, and you will understand that this letter is itself a thing very few
  > men living have ever been handed. My house has held a certain road for nine generations: teacher
  > to heir, blood to blood, a library no eyes but ours have ever read, a fortune spent without one
  > word of complaint on the privilege of the climb. In all of that time I have never once met my
  > equal, and now, against every expectation I had of the world, it appears that I may have. You have
  > not earned your place beside me, that much is plain to anyone of breeding, yet here you stand at it
  > regardless, and that interests me rather more than I will say twice. So you will tell me who you
  > are. Write to me, and promptly, for I am not a man who is kept waiting by anyone. Your silence I
  > will take as the deference it so plainly is, and we will speak again.
  > Fausto Cescru
- **Answers:**
  - (1) "I will use your blood as catalyst for my next katabasis, torment your soul and end your
    lineage, you unworthy speck of shit :)". Effect: lock `flagFCfriendly = 0` permanently (the
    friendly branch closes; #2 and #3 never fire; the arc routes to #4 and #5).
- **Trigger:** 7 minutes after `totalSinLevel >= 10`.
- **Effect (no answer):** if the threat reply above is never sent, set `flagFCfriendly = 1`.

### Fausto Cescru #2
- **From:** Fausto Cescru, `fausto.cescru@cescru.es`
- **Date:** {received date · year → 2015}
- **Subject:** I will make something of you
- **Body:**
  > I am impressed, and you should grasp how rarely I permit myself the word. What you have built, and
  > in how little time, would have cost my house a full generation and a treasury to match it. I will
  > be direct, because men of rank do not haggle and I never learned how. I am offering to raise you.
  > I hold knowledge gathered across lifetimes and no heir living worthy to receive it, and you, for
  > all your low beginnings, are very nearly worthy of the gift. Come and take your place beneath my
  > hand, and I will spare you the centuries of error that I have already paid for in full. Do not
  > mistake any part of this for a request. Men like me do not extend the offer twice, and men like
  > you do not refuse it and go on prospering.
  > Fausto
- **Answers:** none.
- **Trigger:** 7 minutes after `totalSinLevel >= 20` and `flagFCfriendly = 1`.

### Fausto Cescru #3
- **From:** Fausto Cescru, `fausto.cescru@cescru.es`
- **Date:** {received date · year → 2015}
- **Subject:** You will tell me how you do it
- **Body:**
  > Since you will not take what I held out to you, you will hand me something in its place instead. I
  > have watched you closely: the vanishings, the fortune sunk into the ground and risen again, and
  > your cycles turning over in a fraction of the time any inheritance on earth permits. No bloodline
  > moves that quickly. You hold an instrument and I
  > have decided that I will know what it is. So you will tell me by what means you descend, and you
  > will not make me ask a third time. I have been patient with you as a king is patient with a clever
  > servant, which is to say only for as long as the cleverness keeps amusing him. Do not mistake that
  > patience for a thing that lasts.
  > Fausto
- **Answers:** none.
- **Trigger:** 7 minutes after `totalSinLevel >= 30` and `flagFCfriendly = 1`.

### Fausto Cescru #4
- **From:** Fausto Cescru, `fausto.cescru@cescru.es`
- **Date:** {received date · year → 2015}
- **Subject:** Take this with you
- **Body:**
  > Enough. I have spent upon you a courtesy that your blood was never owed, and you have answered it
  > with silence and the low cunning of the gutter you crawled out of. Do you imagine a man of my
  > house cannot see you climbing your way up a stair my line bled nine generations
  > to mount? You are base blood. You found a thing in the dirt that was meant for better men than
  > you, and you rode it up without earning a single step of the ascent. I will not stoop to beg a
  > guttersnipe for his trick. I will do what my name has done to upstarts since before your
  > grandfathers were filth on a road. Take this with you, then, since you have taken everything else
  > that was ever mine:
  >
  > Qui hanc epistulam legit aut tenet, maledictus esto. Marcescat sanguis eius, deficiant manus
  > eius, et aurum eius in cinerem vertatur. Quamdiu haec verba manent, manet maledictio.
- **Answers:** none.
- **Trigger:** 7 minutes after `totalSinLevel >= 40`.
- **Effect:** on receipt, set `flagFaustoCurse = true`. While true, reprobate generation rate,
  influence gain rate and gold gain rate are each multiplied by 0.67 (a 33% reduction). The debuff is
  shown in the HUD as an active curse. **Deleting this email** sets `flagFaustoCurse = false` and
  removes the debuff.
- *Author note (translation, not shown to the player): "Whoever reads or holds this letter, be
  cursed. Let his blood wither, let his hands fail, and let his gold turn to ash. As long as these
  words remain, the curse remains." The final line is the in fiction tell that deleting the email
  lifts it.*

### Fausto Cescru #5
- **From:** Fausto Cescru, `fausto.cescru@cescru.es`
- **Date:** {received date · year → 2015}
- **Subject:** Little pig
- **Body:**
  > Then I'll huff, and I'll puff...
- **Answers:** none.
- **Trigger:** reaching 1,000,000,000 `totalSoulsObtained` and (`flagFatherMad = 1` or
  `flagReubenDead = 0`, either or both).
- **Effect:** on receipt, play a door-knocking sound once.

---

## The madman

### Reuben Marsh #1
- **From:** Reuben Marsh, `reubenmarsh.mason@gmail.com`
- **Date:** {received date · year → 2015}
- **Subject:** about your bottom room what i built
- **Body:**
  > Know what, I done your bottom room, the one with the black shiny floor and them white posts. All
  > this time I kept me mouth shut, but the thing down there won't leave me be. There was a funny old
  > stone set in that floor, sir, and the cuts on it weren't like no stone I ever cut in me life. At
  > night that shape comes back in me head, bits of it I shouldn't even be able to mind. Believe me, I
  > ain't a soft sort of man, I lay brick and I sleep sound, mostly. A pull comes off that stone, a
  > sideways sort of feeling, like the floor's been tipped up the wrong way. Strange dreams ever
  > since, same room every time, going down and down and never back up. I only write cos I reckon you,
  > of all folk, might know what got put in your house. Sorry to bother a big busy man, write us back
  > if any of this means owt to you, and pardon a daft old mason for fretting.
  > Reuben Marsh
- **Answers:** none.
- **Trigger:** 39 minutes after `totalSinLevel >= 5`.
- *Author note: the first letters of the sentences spell **KATABASIS**.*

### Reuben Marsh #2
- **From:** Reuben Marsh, `reubenmarsh.mason@gmail.com`
- **Date:** {received date · year → 2015}
- **Subject:** i touched it and im sorry i had to tell someone
- **Body:**
  > Ok, I'll just say it, I put me bare hand flat on the stone to feel the cut of them carvings. Before
  > that day I never once dreamed the same thing twice, and now I dream the one room every single
  > night. Something's down there and it's awake and it waits, and it counts, sir, counts and counts. I
  > can't put the dreams down in a letter proper, the words just slide off them like water off a slate.
  > Down is the only way they ever go, always down, the steps wore smooth on the going-down side. I
  > started writing on the wall under me wallpaper at home, and don't ask me why cos I can't stop. A
  > black slab, smooth like a still pond, and a man stood up on top of it what I reckon is you. Never
  > mind a daft old man's nerves, just tell me, did you stick a dark thing under your house?
  > Reuben Marsh
- **Answers:**
  - (1) "If you contact me again I'll call the police.". No mechanical effect.
  - (2) "You're right about everything, let's meet and I'll explain.". Effect: +1 soul (mint 1), set
    `flagReubenDead = 1`.
- **Trigger:** 39 minutes after `totalSinLevel >= 15`.
- *Author note: the first letters of the sentences spell **OBSIDIAN**, the coded easter egg, and the
  "black slab" line foreshadows the obsidian monolith that pays off in #4.*

### Reuben Marsh #3
- **From:** Reuben Marsh, `reubenmarsh.mason@gmail.com`
- **Date:** {received date · year → 2015}
- **Subject:** theres others, i been mapping it
- **Body:**
  > I been at this with pins and a big map and I'm not mad, whatever you lot think. There's others
  > like you, sir, bad spots I call them, places the wrong feeling pours out of, and I found two more
  > besides your house. One of them sits over in Spain, a proper powerful fella by the size of him,
  > near as strong on me readings as you are, near enough that I felt him before I ever found him on
  > the paper. Did you know the biggest shake there ever was happened over in Chile, donkey's years
  > back, and they reckon the ground down there still ain't sat quiet even now. Soft ground shakes
  > worse than hard ground, see, me old foreman learnt me that, a soft patch rings like a hit bucket
  > while the hard stuff barely passes it on. I could go on about this for hours, and me wife, God
  > rest her, used to let me. Anyhow. That Spanish one is the only other I'd put near as strong as you,
  > and I thought you ought to know you ain't the only door left stood open.
  > Reuben Marsh
- **Answers:**
  - (1) "Stop writing to me. Go pester your Spanish friend and leave me out of your maps.". No
    mechanical effect.
  - (2) "You're right about everything, let's meet and I'll explain.". Effect: +1 soul (mint 1), set
    `flagReubenDead = 1`.
- **Trigger:** 39 minutes after `totalSinLevel >= 25`, while `flagReubenDead = 0`.

### Reuben Marsh #4
- **From:** Reuben Marsh, `reubenmarsh.mason@gmail.com`
- **Date:** {received date · year → 2015}
- **Subject:** i cant carry your room anymore
- **Body:**
  > When I shut me eyes I'm down in your bottom room, on the down side of the stone, going under with
  > all the rest. And I seen what you do at the bottom of it, you get on your knees at a black post and
  > you bite at it, teeth and nails, working it into a shape. Knelt over the eight of them you are, the
  > eight with crowns on, chewing that black stone into the shape of your own self stood up over the
  > lot of them. Eight chairs and a ninth one that's you, and the biting is how you climb up, I see it,
  > I see it. Unforgivable, the whole of it, and you're the near dark, the big one, so I wrote off to
  > the other fella to come and stop you. Pray forgive a broke old man, but I can't hold your room in
  > me head one more night, God keep the three of us.
  > Reuben
- **Answers:** none.
- **Trigger:** 39 minutes after `totalSinLevel >= 35`, while `totalSoulsObtained <= 1,000,000,000`
  and `flagReubenDead = 0`.
- *Author note: the first letters of the sentences spell **WAKE UP**, the one sanctioned and
  deniable brush at the fourth wall (he could mean himself). The content states the obsidian gnawing,
  the eight Princes, and the ninth that is the player (Semet), all on the surface, never confirmed.*
