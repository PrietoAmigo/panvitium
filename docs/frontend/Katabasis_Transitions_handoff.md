# Handoff: Katabasis / Anabasis transitions

## Overview
Rework of the descent and ascent interstitials in the Katabasis flow (`Transition` in `apps/web/src/menus/Katabasis.tsx`, styles under `/* SCREEN · Descent / Ascent transition (Abyss) */` in `apps/web/src/menus/menus.css`).

- Descent: title **Katabasis**, with **exspes in ima** beneath it.
- Ascent: title **Anabasis** (was "Ascensus"), with **Auctus ex imis** beneath it.
- The long italic sentence at the bottom is removed from both.
- "Click anywhere to continue" is removed. Both screens hold for exactly **5 s** and **cannot be skipped**.

## About the Design Files
`Katabasis Transitions.dc.html` is an HTML design reference, not production code. Recreate it in the existing React component and `menus.css`, following the patterns already in the codebase (classes scoped under `.katabasis-flow`, `@media (prefers-reduced-motion: no-preference)` gating for animations).

## Fidelity
High fidelity. Colors, fonts and the abyss treatment come from the current production CSS. The only changes are the ones listed in this README.

## Screens

### Descent (`kind="descending"`) and Ascent (`kind="ascending"`)
- Root: `.scene.transit.transit--abyss`, with `data-dir="down"` or `data-dir="up"`. Full-bleed, flex-centred, `background: #050204`. **Remove the `onClick={onDone}`.**
- `.tr-abyss` and `.transit-vignette`: unchanged gradients.
- New centred column (e.g. `.transit-stack`): `position: relative; z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 26px`. It contains the three elements below.
  1. `.transit-word`: styles unchanged (Cinzel 700, `clamp(2rem, 6vw, 3.6rem)`, `letter-spacing: .3em`, uppercase, `#ff5a3a`, breathe and word-in animations). Add `line-height: 1` and `padding-left: .3em` so the letter-spacing stays optically centred.
  2. `.transit-rule` (new): `width: 64px; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,90,58,.6), transparent)`.
  3. `.transit-sub` (restyled): no longer absolutely positioned at `bottom: 16vh`. Font `var(--font-inscribe)` (IM Fell English SC), not italic, `font-size: 22px` (≈1.375rem), `letter-spacing: .42em; padding-left: .42em`, `color: #b3aaa2`, `text-shadow: 0 0 18px rgba(255,50,28,.35)`, `text-align: center`.
- Delete the `.transit-skip` button and its CSS.

### Copy
| | word | sub |
|---|---|---|
| descending | Katabasis | exspes in ima |
| ascending | Anabasis | Auctus ex imis |

IM Fell English SC renders lowercase as small caps. Keep the source strings exactly as written above.

## Interactions & Behavior
- **Duration:** `setTimeout(onDone, 5000)` for both directions (was 4200 / 3600).
- **No skip:** no click handler, no button, no keyboard skip.
- Animations (inside `prefers-reduced-motion: no-preference`):
  - `.tr-abyss` down: `kat-abyss-down 5s cubic-bezier(.5,.05,.4,1) both` (was 4s). Up: `kat-abyss-up 5s cubic-bezier(.3,.1,.3,1) both` (was 3.4s). Keyframes unchanged.
  - `.transit-word`: unchanged (`kat-word-breathe 4s infinite` plus `kat-word-in` or `kat-word-in-up`, 1.4s ease).
  - `.transit-rule`: `kat-rule-in 1.2s ease .7s both`, where `from { transform: scaleX(0); opacity: 0 }` and `to { transform: scaleX(1); opacity: 1 }`.
  - `.transit-sub`: `kat-sub-in 1.8s cubic-bezier(.2,.6,.2,1) .9s both`. Update the keyframe to `from { opacity: 0; letter-spacing: .9em }` and `to { opacity: 1; letter-spacing: .42em }`.
- With reduced motion, everything shows statically and the 5 s hold still applies.

## State Management
No change. `screen === 'descending'` calls `arrive` after the timeout, and `screen === 'ascending'` calls `confirm()`. Update any tests that click the transit to skip it, or that assume 4200 / 3600 ms (`Katabasis.test.ts`, e2e), to wait 5000 ms instead.

## Design Tokens (existing `.katabasis-flow` scope)
- Ember `#ff5a3a`; sub text `#b3aaa2` (new, sits between `--bone` #d6cfc6 and `--dim` #8f8780); background `#050204`
- Fonts: Cinzel (display) and IM Fell English SC (`--font-inscribe`), already loaded in `apps/web/index.html`

## Assets
None.

## Files
- `Katabasis Transitions.dc.html`: design reference. The top row shows the reworked screens (1a, 1b) and the bottom row shows the current production screens.
