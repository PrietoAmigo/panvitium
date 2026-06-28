# 06: Smartphone Content

This document defines the Studio smartphone: the device, the rules that govern it, and the content it carries that is not a call. The two call catalogues live in their own canonical files, `PANVITIUM-CALLS-IN.md` and `PANVITIUM-CALLS-OUT.md`; this document owns the phone shell. It is to the phone what `05-email-content.md` is to the PC.

**Relationship to the other docs.** `00-lore-bible.md` owns the fiction (the cast in sec. 11, the two-layer rule in sec. 0 and sec. 4, the period and the Studio in sec. 8, the voice matrix in sec. 10). `05-email-content.md` owns the PC email system. This document and the two call catalogues own the phone. Where this and 05 both touch a character, they share the cast and the flags but never the same beat: email is the long, formal, clerical channel; the phone is the short, immediate, personal one (00 sec. 8).

* * *

## 1. The device

A smartphone of the period (circa 2015) sitting on the desk of the Studio, beside the PC.

The phone is, like the PC, primarily an incoming-content channel (00 sec. 10), with one addition the PC does not have: a keypad you can dial out from. Use the difference from email deliberately.

**Two layers, on the phone too.** The household and the world never use occult vocabulary and grasp the truth in pieces only. The adversary speaks plainly because he shares the truth. No hidden-layer vocabulary (vibration, frequency, wave, field, energy, resonance, and the rest) appears anywhere a player can read it.
Hell is only seen through entities bound by your adversary or your own entities (as long as they're bound). Princes and sigils are silent.

* * *

## 2. System rules

These govern the smartphone:

- **Active play only, never offline.** A call rings only during active play. The phone is dark during Katabasis: while `inKatabasis` is set the sim runs no tick, you are under, and nothing rings. You read the backlog on return.
- **Triggers & cadence.** Incoming calls are paced, not bursty: **one call arrives roughly every 10 minutes** of eligible active play, drawn from a weighted bag (see `PANVITIUM-CALLS-IN.md` "Selection model"). Only calls whose Requirements are met are eligible, and a **recency cooldown** keeps the same call from recurring within 5 calls. Outgoing calls are player-driven, with no pacing pressure, gated only by call cost and cooldown.
- **Ring window and miss.** Each incoming call rings for a **15-second** window, then is missed. Missing — or declining, or walking out of the Studio mid-ring — is opportunity-only and costs nothing; there are no punitive incoming calls. A missed once-only call (lore, easter egg) may still ring again later; an *answered* one is consumed for good.
- **Where it rings, and how you answer.** A call only rings while you are standing in the Studio — the phone is on that desk. A Studio menu does **not** silence the line: the phone keeps ringing behind the PC, the Suasio scroll, or the dial-out keypad, so you hear it; close the menu and tap the phone to answer. Tapping the phone while it rings **answers the incoming call**, taking priority over dialling out.
- **How numbers enter the phone.** Granted via email or hidden (the digits surface in content and you type them on the keypad). This is the single source of every `Source:` line in `PANVITIUM-CALLS-OUT.md`, so the call catalogue never depends on an email that does not exist.
- **Flags and resources are shared.** The phone reads and writes the same state as the PC: the resources, `totalSinLevel`, `totalSoulsObtained`, `katabasisCount`, `maleficiaOwned`, and the narrative flags defined in 05. New phone-only flags follow the ADR-023 additive-optional pattern. The phone never silently changes a flag the email arc owns. The Fausto friendly/hostile branch is read from `flagFCThreatSent` (set when the threat reply to Fausto #1 is sent): `flagFCThreatSent=0` is the friendly branch, `=1` the hostile one.

## Effect verbs (shared by emails + calls)

`resource(kind, ±amt)` souls|gold|influence|maleficia|reprobates · `buff(field, ×m|+n, sec)` · `gamble(perTier)` draw via resolveTier · `grantContact(id)` · `scheduleEmail(id, delaySec?)` · `scheduleCall(id, withinSec?)` · `setFlag(key, val=1)` · `nothing()`

* * *

## 3. The phone cast (who reaches you here, and how)

- **The household.** Gideon by call, the acolytes by call. Servile, fretful, practical, pieces of the truth only.
- **The hands of Fausto.** In specific, Fausto's invocations (Astiwihad, Succubus) and minions (his newspaper journalist, Marina Zhao — `the-journalist`) call. They want to cause your downfall. The two invocation calls are mutually exclusive on the Fausto branch: Succubus reaches a *friendly*-branch player, Astiwihad a *hostile*-branch one.
- **The Church.** Father Emil Stahl (`the-ward`), once he has written to you first.
- **Mundane** help. Trusted-minion register: useful, discreet, and they grasp nothing of the work — e.g. **Mai**, your platforms/operations hand (`doing-nothing`, `ministry`, `social-platform`).
- **Unknown.** Withheld numbers (`a-name-to-burn`, the easter eggs `tormented-soul` / `ISP-change`, and the unbound-invocation lines).

Who never reaches the phone: the Princes and the Goetia (Hell is silent), your invocations (email or the Lair only, so the Doppelganger and Midas stay on the PC), the parish clergy (their channel is email; the bulletins and Father Tom belong to 05), and Maren Holt (she has no idea you exist and is a parish line and an obituary, not a contact, 00 sec. 11).

* * *

## 4. The incoming call, on screen (as built)

When a call arrives it does not pop a panel — it takes over the screen as **"the voice in the room."** The flow, and how it maps to the build:

- **Ringing (in the room).** The Studio backdrop crossfades to the lit "incoming call" plate and `smartphone_vibration.mp3` loops. This lives at the room level, so it reads (and is audible) even with a Studio menu open. It rings for 15 s, then misses.
- **Answering.** Tapping the phone raises a full-viewport stage. The caller's recording plays while the big caller name (and a "tap to skip" hint) shows; when the recording ends — or you tap to skip — the **response options** appear, stagger in, and you pick one. The pick lights, the rest dim, and the call fades out. (A second, "typed" mode — a typewriter line instead of a recording — exists in the component for any future fileless call, but every catalogued call today is a recording.)
- **Through the degradation pass.** The call's plates composite through the same uniform degradation/pixelation pass as the room (ADR-021); the message and options sit *above* that degraded scene, so the call never looks cleaner than the world it interrupts.

**Implementation status & peculiarities (important).** The calls-in **front-end is built**; the **effect engine is not**:

- Catalogue: `apps/web/src/menus/calls-in.data.ts`. Copy: `strings.phone.callIn.<id>`. Overlay: `SmartphoneCallIn`. Scheduler: `useIncomingCall`. Selection/eligibility: `game/callIn.ts`.
- **Choices apply no game state yet.** The buff/`effect` verbs in `PANVITIUM-CALLS-IN.md` are the spec for the pending `CALL_TRIGGERS → INTERACTIONS` engine; for now answering only resolves the call (same documented-stub posture as the email replies and the dial-out codes).
- **The scheduler is UI-level**, drawing from `Math.random`, **not** the sim's seeded RNG (ADR-011). It therefore does not touch the deterministic tick, the save, or the RNG stream — a save's sequence is unchanged whether or not a call rang. When the effect engine lands, the trigger/draw should move into the tick (so it is deterministic and offline-correct) and the per-session state below should be persisted (ADR-023 additive-optional).
- **Per-session state, not yet persisted:** the once-only "seen" set (consumed on **answer**, not on a miss) and the recency buffer (the last few callers, for the "no repeat within 5 calls" rule). Both reset each session today.
