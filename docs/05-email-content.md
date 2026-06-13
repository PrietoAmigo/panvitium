# 05 — Email Content

This document captures the high-level content and triggers for the email system. Each record states the sender name, the sender email, the date, the subject, the body of the email, the available answers (if applicable, and the effects of the answers) and the trigger of the email.
Theadte should be the real date but always 2015 instead of the current year.

Based on this document and the lore bible, you will define specific values for the sender email, the subject of the emails, the whole body of the email and the available answers.
Based on this document, the lore bible and the game code, you will define specific effects and values for the available answers (if applicable) and the trigger of the email.


## Household emails

### Gideon Reyes email #1
  Content: he tells you your funds almost ran out in your "absence" and that you should give him more capital to manage so next time this risk is reduced. He would happily manage more for the usual percentage. In this emails it should be read within lines that he manages the legitimate-looking part of the businesses and that's what's not liquidated when you do katabasis.
  Trigger: 2 mins after coming back from first katabasis.

### Gideon Reyes email #2
  Content: he tells you he has been hearing rumours the household staff are looting the house in your "absence", recommends a security service which other of his clients are using.
  trigger: 2 mins after coming back from second katabasis
### Gideon Reyes email #3
  Content: He tells you some of the investments you're doing and your latests business ideas are genius, almost if taking advice from other advisor - he jokingly says you please don't leave him.
  Trigger: 5 minutes after the first Plutus of the run has been invoked, if it is still active.

### Gideon Reyes email #4
  Content: He tells you that everything you own is suddenly booming unexpectedly, as if the stars aligned for you.
  Trigger: 5 minutes ater the Thirty Pieces of Silver maleficia is in your ownership

### Gideon Reyes email #5
  Content:

### Gideon Reyes email #6
  Content:
  Trigger:


## The world / commerce emails

### Newsletter email #1
  Content:
  Trigger:

### Newsletter email #2
  Content:
  Trigger:

### Newsletter email #3
  Content:
  Trigger:

### Newsletter email #4
  Content:
  Trigger:

### Newsletter email #5
  Content:
  Trigger:

### Newsletter email #6
  Content:
  Trigger:

### Newsletter email #7
  Content:
  Trigger:

### Newsletter email #8
  Content:
  Trigger:


## The Church emails

### Father Tom Brennan #1
  Content: He checks in on you, because you've not visited the church in a long time, you used to donate to the Church a lot of money and you forgot to set the periodic donation so it was not done while you were on katabasis. He's very warm in this email and genuinely want the best for you hoping everything's alright.
  Trigger: 12 mins after coming back from first katabasis.

### Father Tom Brennan #2
  Content: Thanking you for the most recent donation, he jokes it will be very helpful in the tax write-off but he tells you it's a joke and that the money really helped the parish do X, Y and Z for the good of the community. He tells you he heard some things about your conenctions to vice industry but he knos it's a lie and people want to strike the player down.
  Trigger: Avaritia lvl 2.

### Bishop Adelard Crane #3
  Content: he coldly thanks you for your contributions but establishes the red line - if your vice relations stand, you will not be welcome in the church anymore, no matter the economic contributions.
  Trigger: all sins lvl 2.

### Father Emil Stahl #4
  Content: He has been investigating you, he knows about the occult stuff you do, the vice worship, the deaths. He has brought to the attention of the authorities.
  Trigger: all sins lvl 3.

### Father Emil Stahl #5
  Content: He is terrified and irate. He does not want to believe what you're doing. He is determined to banish you and will gather the church against you with proof of what you've been doing. He prays for your soul.
  Trigger: 1 minute after you've had Panvitium (VC) running for at least 3 seconds.



## The adversary

### Fausto Cescru #1
  Content: Testing the waters, just wants you to answer to his email to analyze you. He's very close and friendly, telling you part of his story to bring your attention.
  Trigger: 7 mins after totalSinLevel>=10

### Fausto Cescru #1
  Content: Testing the waters, just wants you to answer to his email to analyze you. He's very close and friendly, telling you part of his story to bring your attention.
  Trigger: 7 mins after totalSinLevel>=20

### Fausto Cescru #1
  Content: Testing the waters, just wants you to answer to his email to analyze you. He's very close and friendly, telling you part of his story to bring your attention.
  Trigger: 7 mins after totalSinLevel>=30

### Fausto Cescru #1
  Content: This is the last sprint and he sees you far beyond where he currently is. All the resentment and anger are amplified to the max, he lets his unbridled fury take over this email, calls you low blood / peasant or similar, and actually ends the email with an ancient latin curse as his last resort.
  Trigger: 7 mins after totalSinLevel>=40
  Effect: the lating curse reduces your overall reprobate generation, influence gain and gold gain rates by 10%.
