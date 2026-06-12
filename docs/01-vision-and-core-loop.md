# 01 - Vision and Core Loop


## Genre and reference points

- **Genre:** incremental / idle, with strong probability-driven outcomes and a multi-layered prestige system.
- **Tonal references:** Catholic / *Lesser Key of Solomon* aesthetic. *Cult of the Lamb*'s villain-protagonist framing, occult horror in the vein of *Inscryption* and *Masters of Madness* .
- **Visual identity:** **lo-fi grimoire-baroque**. Photographic and rendered source imagery passed through a single, uniform light-pixelation and colour-degradation pass. Heavy ink-and-altar feel, ornate framing, deep blacks and altar-candle reds, carrying the soft graininess of a cursed CD-ROM. Not clean authored pixel-art, not flat-vector minimalism, and not crisp HD photorealism, but *degraded* photoreal.
- **Audience:** the r/incremental_games crowd. Patient, math-curious, tolerant of grim themes.
- **Store target:** Steam-able. The content sits at the edge of mainstream-store-acceptable; should be kept on the right side of that line by treating the theology seriously rather than crudely.

## Premise

The player is a single human soul, alive on Earth, and already damned. There is no verdict to await and no posthumous arrival to climb toward. You do not wait for death to find your place in Hell's hierarchy; you take it while you still breathe, and you go on taking it higher. The climb is done living, by lying on the altar and descending again and again to settle your accounts below. Death, when it finally comes, changes nothing, because by then the soul is already the thing it has become. Rank is bought with the souls of corrupted humans who died unrepentant: these souls belong to you, since you did the work of their corruption, and most of the time you had a hand in their deaths as well.

You did not make the altar. You found it, and built your Lair, a mansion, around it. It is a crude block of stone, older than the parish, older than the faith that named the parish, its inscriptions worn past reading, its symbols half-matching the sigils of the Goetia and half-matching nothing anyone living can name. Channels this strong are vanishingly rare and undocumented, which is why the Church has no idea it exists; another finder would have misread it, or been taken, or died on it, where you alone could read its highest use. Others used it before you, and not all the stains are yours. What it is, beneath the lore, is a road worn smooth: a channel down to the courts of the Princes, walked so many times it never fully closes. Lying upon it you fall into a deep trance (katabasis) that lasts months, the body in near-stasis, barely breathing, minimum heartrate, while the soul descends to settle its accounts. You spend what you have gathered: souls bound to the sigils of the Goetia, souls offered to the Princes to climb their regard. Then you rise, on the same altar, augmented in soul and wasted in flesh from the long months without food or movement.

You return because you choose to, and each descent leaves you stronger. It is the finest arrangement a damned soul could ask for: a ladder climbed at your own pace, a hierarchy that rewards precisely the appetites you already have. Knowing a months-long absence would rot everything you hold, you sell it all to cash before going under: your trusted minion safeguards what he can, the unfaithful acolytes desert and loot, and you wake to a clean slate and rebuild from nothing. Your reprobates have scattered and must be won again.

And so you climb, until there is nothing left to climb. When every Prince has had their due and every Cardinal Sin stands at its height, a quieter thought arrives, so faint you might descend a hundred times without hearing it: why give them the souls at all? The Princes stood above you only because you handed them what you earned. The hierarchy you have spent so many descents ascending is one you have been funding. Your overtaking begins.

The fiction is grim-baroque, not satirical. Latin and pseudo-ecclesiastical vocabulary is the product's voice, and demonological detail (the Eight Princes, the Goetia sigils, the maleficia) is treated with the seriousness of a medieval grimoire even when the underlying mechanic is an incremental-game number.


## Player fantasy

- **You are a deliberate, methodical evildoer.** Not a comic-villain "muahaha"; the tone is closer to a discreet, patient corruptor.
- **You give Devotion to powers above you.** The Princes and sigil-demons are not abstract upgrade trees, but they do not bargain either: they are silent powers you serve and rise by, never negotiate with. Hell has no voice.
- **You are a student of vice.** Each Cardinal Sin is a school of corruption with its own pacing, economy, and tone.

# Visual and tonal identity

**Lo-fi grimoire-baroque.** Imagine a photograph of a 16th-century chapel interior, or a rendered baroque room, run through a degrading pass until it sits at the edge of legibility: block-pixelated just enough to read as artefact, its palette crushed toward deep blacks, candle-orange, blood-red, and gold-leaf accents. The reference is not clean authored pixel-art but the lo-fi degraded image of PS1-era and analog horror: a cursed CD-ROM, a half-corrupted scan. Inked, ornate, ritual, but soft and grainy rather than crisp. UI surfaces still read as grimoire pages: aged-paper panels, ornate framing of vines and angels-turned-demons, rubricated initials, crossed lines under tables, degraded to the same fidelity as the rooms. No flat material design, no clean HD illustration.

**The defining constraint is uniformity.** Every visual element, room backgrounds, props, character and invocation sprites, and UI surfaces, passes through the *same* degradation recipe: the same pixelation block size, the same colour-depth reduction, the same grade. A single fidelity across the whole frame is what makes the look intentional rather than broken. Mismatched fidelity, a sharp background under a coarse sprite, reads as an error, not a style, and is the one failure mode to guard against.

The three-room playspace (see `02-systems-and-mechanics.md` §12) is rendered as lightly-pixelated side-elevation interiors. Movement is minimal: it's a stage, not a platformer.

## The world does not know it's you

The Earth in *Panvitium* is the real Earth, circa 2015, populated by ordinary, distractible humans. You operate as a person of means from a mansion Lair, corrupting and culling on a global scale through three means at once: the businesses you own and run, the invocations you set upon chosen people, and your own hand. The Church and a Higher Power exist and occasionally act, but **they are deliberately rare**, and at the start, with the Lair freshly built, no one is onto you at all. Suspicion is an arc that builds across the long game; the named cast lives in `05-lore-bible.md`.

- **Terrible** outcomes can manifest as Church involvement, an inquisitor figure, a parish priest, a confessor, undoing some of the player's recent corruption. The Church is an instrument of the Higher Powers, does not know the altar exists, and is weather for most of the game, escalating into active opposition only at the endgame.
- **Apocalyptic** outcomes can manifest as direct Higher-Power intervention, the player struck down, a city saved, heavy losses on your side.


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
   │  → +1 SOUL each             │
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

Some steps are gated by **probability tiers** (Stellar to Apocalyptic). The player is constantly choosing which actions to take given their current sin loadout, sigil bindings, resources and risk tolerance.

## Prestige loop (the Katabasis menu)

On Katabasis, the player enters the **Katabasis menu**, where unspent souls are allocated along two axes:

- **Sigil binding** (tactical, recoverable). Souls bound to a sigil grant a passive effect. They can be re-bound on each Katabasis, a re-allocation, not a sacrifice. Sigils affect almost all aspects of the game.
- **Devotion offering** (strategic, permanent, irreversible). souls offered to a Prince permanently raise the Cardinal Sin level associated with that Prince. This is the long-term meta-progression.

**Souls left unspent carry over** when coming back as a usable resource for invocations.

The two systems are deliberately in tension: every soul offered to a Prince is one that cannot be bound to a sigil, and vice versa. The player rebalances this allocation every Katabasis.

## The Katabasis recap

When coming back, the player is shown a recap screen rendered as a black page with white text appearing, naming and numbering the resources that remain available after the katabasis, this would be gold and maleficia kept safe by the acolytes who did not desert, gold and maleficia that were not robbed (chances for this are increased via sigils), reprobates which remain identified (chances for this are increased via sigils)...

After confirmation, you carry on with zero reprobates, starting gold, starting influence, current Devotion levels permanently in effect, current Sigil bindings active, and any unallocated souls in the pool. These values can be modified by sigils which affect resources lost on katabasis.

## Time and pacing model

Idle (offline) time is **uncapped**, and the player can leave the game running for arbitrary real-time periods.

| Layer | Real-time scale | What happens |
|---|---|---|
| **Action** | Seconds | A single Opera action resolves on its outcome tier. |
| **Lifetime** | Tens of minutes to days | Katabasis intervals. |
| **Sigil meta** | A few katabases | Experimenting with different sigil bindings to specialise a build. |
| **Devotion meta** | Many katabases | Climbing each Prince's Cardinal Sin level toward the cap (level 4). Time-to-cap is what defines "endgame." |

## After the Eternal Sin

When the eighth Sin reaches Level 4 and the player has offered the Eternal Sin's threshold of souls (see `03-content-catalog.md` §8), the reveal screen plays: a black page, white text, the total runtime, the Latin closing flavour. The reveal is a milestone and a credits roll.

The Steam achievement set (when it exists; see `03-content-catalog.md` §7) carries one terminal achievement at this point, named for the act of becoming the Sin you have been climbing toward. Earning it does not transition the game out of its post-reveal state; it simply lights up.

## What this game is not

- **Not a clicker.** Active clicking has a place, but the game's spine is probability tuning and sin-build optimization, not click rate.
- **Not a morality tale.** No redemption path, no "good ending," no "are you sure?" friction. Damnation is the premise, not a twist.
- **Not a parody.** Comic relief lives in flavour text at most, and sparcely; the systemic tone is straight-faced.
- **Not a real-time strategy game.** Reprobates are abstract populations and probability inputs, not units the player commands directly. Acolytes are the closest thing to agents and are deliberately limited.
- **Not an antagonist-driven game.** The Church and Higher Power are flavour for rare bad outcomes for most of the game, not a faction you besiege. The one exception is the endgame, when the Church's investigator turns the local clergy active against you (see `05-lore-bible.md`).
