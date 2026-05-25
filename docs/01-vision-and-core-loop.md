# 01 — Vision and Core Loop


## Genre and reference points

- **Genre:** incremental / idle, with strong probability-driven outcomes and a multi-layered prestige system.
- **Tonal references:** Catholic / *Lesser Key of Solomon* aesthetic. *Cult of the Lamb*'s villain-protagonist framing, occult horror in the vein of *Inscryption* and *Masters of Madness* .
- **Visual identity:** **lo-fi grimoire-baroque** — photographic and rendered source imagery passed through a single, uniform light-pixelation and colour-degradation pass. Heavy ink-and-altar feel, ornate framing, deep blacks and altar-candle reds, carrying the soft graininess of a cursed CD-ROM. Not clean authored pixel-art, not flat-vector minimalism, and not crisp HD photorealism — *degraded* photoreal.
- **Audience:** the r/incremental_games crowd. Patient, math-curious, tolerant of grim themes.
- **Store target:** Steam-able. The content sits at the edge of mainstream-store-acceptable; should be kept on the right side of that line by treating the theology seriously rather than crudely.

## Premise

The player is a single human soul, alive on Earth, and already damned. They know — and the game accepts as a given — that they are going to Hell when they finally die. The only remaining variable is rank: how high in Hell's hierarchy they will sit when they at last arrive. Rank is bought with the souls of corrupted humans who died unrepentant, these souls belong to you as you put the effort in the corruption of the human, and most of the time you're also involved in their deceasement.

You did not make the altar. You built your Lair around it. It is a crude block of stone, older than the parish, older than the faith that named the parish — its inscriptions worn past reading, its symbols half-matching the sigils of the Goetia and half-matching nothing anyone living can name. Others used it before you; not all the stains are yours. What it is, beneath the lore, is a road worn smooth: a channel down to the courts of the Princes, walked so many times it never fully closes. Lying upon it you fall into a deep trance (katabasis) — the body remains, barely breathing and still, minimum heartrate — while the soul descends to settle its accounts. You spend what you have gathered: souls bound to the sigils of the Goetia, souls offered to the Princes to climb their regard. Then you rise, on the same altar.
You return because you choose to — each descent leaves you stronger. It is the finest arrangement a damned soul could ask for: a ladder climbed at your own pace, a hierarchy that rewards precisely the appetites you already have. The faithful keep vigil over your sleeping body and guard what they can of your estate; the rest assume you gone and scatter with whatever they can carry. Your businesses have gone bankrupt as noone tended to them, your corrupted reprobates are gone.

And so you climb — until there is nothing left to climb. When every Prince has had their due and every Cardinal Sin stands at its height, a quieter thought arrives, so faint you might descend a hundred times without hearing it: why give them the souls at all? The Princes stood above you only because you handed them what you earned. The hierarchy you have spent so many lives ascending is one you have been funding. Your overtaking begins.

The fiction is grim-baroque, not satirical. Latin and pseudo-ecclesiastical vocabulary is the product's voice, and demonological detail (the Eight Princes, the Goetia sigils, the maleficia) is treated with the seriousness of a medieval grimoire even when the underlying mechanic is an incremental-game number.


## Player fantasy

- **You are a deliberate, methodical evildoer.** Not a comic-villain "muahaha"; the tone is closer to a discreet, patient corruptor.
- **You are negotiating with powers above you.** Princes and sigil-demons are not abstract upgrade trees — they are entities you bargain with.
- **You are a student of vice.** Each Cardinal Sin is a school of corruption with its own pacing, economy, and tone.

# Visual and tonal identity

**Lo-fi grimoire-baroque.** Imagine a photograph of a 16th-century chapel interior, or a rendered baroque room, run through a degrading pass until it sits at the edge of legibility — block-pixelated just enough to read as artefact, its palette crushed toward deep blacks, candle-orange, blood-red, and gold-leaf accents. The reference is not clean authored pixel-art but the lo-fi degraded image of PS1-era and analog horror: a cursed CD-ROM, a half-corrupted scan. Inked, ornate, ritual — but soft and grainy rather than crisp. UI surfaces still read as grimoire pages: aged-paper panels, ornate framing of vines and angels-turned-demons, rubricated initials, crossed lines under tables — degraded to the same fidelity as the rooms. No flat material design, no clean HD illustration.

**The defining constraint is uniformity.** Every visual element — room backgrounds, props, character and invocation sprites, and UI surfaces — passes through the *same* degradation recipe: the same pixelation block size, the same colour-depth reduction, the same grade. A single fidelity across the whole frame is what makes the look intentional rather than broken. Mismatched fidelity — a sharp background under a coarse sprite — reads as an error, not a style, and is the one failure mode to guard against.

The three-room playspace (see `02-systems-and-mechanics.md` §10) is rendered as lightly-pixelated side-elevation interiors. Movement is minimal: it's a stage, not a platformer.

## The world does not know it's you

The Earth in *Panvitium* is the real Earth — populated by ordinary, distractible humans. The Church and a Higher Power exist and occasionally act, but **they are deliberately rare**:

- **Terrible** outcomes can manifest as Church involvement — an inquisitor figure, a parish priest, a confessor — undoing some of the player's recent corruption.
- **Apocalyptic** outcomes can manifest as direct Higher-Power intervention — the player struck down, a city saved - heavy losses on your side.


## Core loop

```
   ┌─────────────────────────────┐
   │  Spend RESOURCES via OPERA  │
   │  to corrupt humans into     │
   │  REPROBATES                 │
   └──────────────┬──────────────┘
                  │
                  ▼
   ┌─────────────────────────────┐
   │  Cull / drive REPROBATES    │
   │  to die unrepentant         │
   │  → +1 SOUL each         │
   └──────────────┬──────────────┘
                  │
                  ▼
   ┌─────────────────────────────┐
   │  Spend RESOURCES in life    │
   │  on INVOCATIONS and         │
   │           OPERA             │
   │  to amplify the loop        │
   └──────────────┬──────────────┘
                  │
                  ▼
              KATABASIS
                  │
                  ▼
            KATABASIS MENU
                  │
                  ▼
         (continue lifetime)
```

Some steps are gated by **probability tiers** (Stellar → Apocalyptic). The player is constantly choosing which actions to take given their current sin loadout, sigil bindings, resources and risk tolerance.

## Prestige loop (the Katabasis menu)

On Katabasis, the player enters the **Katabasis menu**, where unspent souls are allocated along two axes:

- **Sigil binding** (tactical, recoverable). Souls bound to a sigil grant a passive effect. They can be re-bound on each Katabasis — it is a re-allocation, not a sacrifice. Sigils affect almost all aspects of the game.
- **Devotion offering** (strategic, permanent, irreversible). souls offered to a Prince permanently raise the Cardinal Sin level associated with that Prince. This is the long-term meta-progression.

**Souls left unspent carry over** when coming back as a usable resource for invocations.

The two systems are deliberately in tension: every soul offered to a Prince is one that cannot be bound to a sigil, and vice versa. The player rebalances this allocation every Katabasis.

## The Katabasis recap

When coming back, the player is shown a recap screen rendered as a black page with white text appearing, naming and numbering the resources that remain available after the katabasis, this would be gold and maleficia stored by faithful acolytes, gold and maleficia that were not robbed (chances for this are increased via sigils), reprobates which remain identified (chances for this are increased via sigils)...

After confirmation, you carry on with zero reprobates, starting gold, starting influence, current Devotion levels permanently in effect, current Sigil bindings active, and any unallocated souls in the pool. These values can be modified by sigils which affect resources lost on katabasis.

## Time and pacing model

Idle (offline) time is **uncapped** — the player can leave the game running for arbitrary real-time periods.

| Layer | Real-time scale | What happens |
|---|---|---|
| **Action** | Seconds | A single Opera action resolves on its outcome tier. |
| **Lifetime** | Tens of minutes to days | Katabasis intervals. |
| **Sigil meta** | A few katabases | Experimenting with different sigil bindings to specialise a build. |
| **Devotion meta** | Many katabases | Climbing each Prince's Cardinal Sin level toward the cap (level 4). Time-to-cap is what defines "endgame." |

## What this game is not

- **Not a clicker.** Active clicking has a place, but the game's spine is probability tuning and sin-build optimization, not click rate.
- **Not a morality tale.** No redemption path, no "good ending," no "are you sure?" friction. Damnation is the premise, not a twist.
- **Not a parody.** Comic relief lives in flavour text at most, and sparcely; the systemic tone is straight-faced.
- **Not a real-time strategy game.** Reprobates are abstract populations and probability inputs, not units the player commands directly. Acolytes are the closest thing to agents and are deliberately limited.
- **Not an antagonist-driven game.** The Church and Higher Power exist but are *flavour for rare bad outcomes*, not a system to fight.
