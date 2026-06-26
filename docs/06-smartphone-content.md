# 06: Smartphone Content

This document defines the Studio smartphone: the device, the rules that govern it, and the content it carries that is not a call. The two call catalogues live in their own canonical files, `PANVITIUM-CALLS-IN.md` and `PANVITIUM-CALLS-OUT.md`; this document owns the phone shell. It is to the phone what `05-email-content.md` is to the PC.

**Relationship to the other docs.** `00-lore-bible.md` owns the fiction (the cast in sec. 11, the two-layer rule in sec. 0 and sec. 4, the period and the Studio in sec. 8, the voice matrix in sec. 10). `05-email-content.md` owns the PC email system. This document and the two call catalogues own the phone. Where this and 05 both touch a character, they share the cast and the flags but never the same beat: email is the long, formal, clerical channel; the phone is the short, immediate, personal one (00 sec. 8).

* * *

## 1. The device

A smartphone of the period (circa 2015) sitting on the desk of the Studio, beside the PC.

The phone is, like the PC, primarily an incoming-content channel (00 sec. 10), with one addition the PC does not have: a keypad you can dial out from. Use the difference from email deliberately. The phone carries the household's frightened little pings, the adversary's sharp one-liners, the mundane noise that hides the live messages, and the handful of numbers you can call yourself.

**Two layers, on the phone too.** The household and the world never use occult vocabulary and grasp the truth in pieces only. The adversary speaks plainly because he shares the truth. No hidden-layer vocabulary (vibration, frequency, wave, field, energy, resonance, and the rest) appears anywhere a player can read it.
Hell is only seen through entities bound by your adversary or your own entities (as long as they're bound). Princes and sigils are silent.

* * *

## 2. System rules

These govern the smartphone:

- **Active play only, never offline.** A call rings only during active play. The phone is dark during Katabasis: while `inKatabasis` is set the sim runs no tick, you are under, and nothing rings. You read the backlog on return.
- **Ring window and miss.** Each incoming call rings for its stated ring window. Missing is opportunity-only.
- **Triggers.** Incoming calls fire randomly but some take into account existing flags ang gamestates. Outgoing calls are player-driven, with no pacing pressure, gated only by call cost and cooldown.
- **How numbers enter the phone.** Granted via email or hidden (the digits surface in content and you type them on the keypad). This is the single source of every `Source:` line in `PANVITIUM-CALLS-OUT.md`, so the call catalogue never depends on an email that does not exist.
- **Flags and resources are shared.** The phone reads and writes the same state as the PC: the resources, `totalSinLevel`, `totalSoulsObtained`, `katabasisCount`, `maleficiaOwned`, and the narrative flags defined in 05 (`flagFCfriendly` and the rest). New phone-only flags follow the ADR-023 additive-optional pattern. The phone never silently changes a flag the email arc owns.

## Effect verbs (shared by emails + calls)

`resource(kind, ±amt)` souls|gold|influence|maleficia|reprobates · `buff(field, ×m|+n, sec)` · `gamble(perTier)` draw via resolveTier · `grantContact(id)` · `scheduleEmail(id, delaySec?)` · `scheduleCall(id, withinSec?)` · `setFlag(key, val=1)` · `nothing()`

* * *

## 3. The phone cast (who reaches you here, and how)

- **The household.** Gideon by call, the acolytes by call. Servile, fretful, practical, pieces of the truth only.
- **The hands of Fausto.** In specific, Fausto's imvocations (Astiwihad, Succubus) and minions (his newspaper journalists, his PI) call. They want to cause your downfall.
- **The investigator, Stahl.** A single call exorcising in Latin. His arc stays mostly on email (05).
- **The fixer and the fence.** Mundane underworld help. Trusted-minion register: useful, discreet, and they grasp nothing of the work.
- **Unknown.** The afflicted caller (`dying-soul`), the counting (`wrong-number`), the breathing room (`the-hollow`), all anonymous, all brushing the truth and confirming none of it.

Who never reaches the phone: the Princes and the Goetia (Hell is silent), your invocations (email or the Lair only, so the Doppelganger and Midas stay on the PC), the parish clergy (their channel is email; the bulletins and Father Tom belong to 05), and Maren Holt (she has no idea you exist and is a parish line and an obituary, not a contact, 00 sec. 11).

* * *
