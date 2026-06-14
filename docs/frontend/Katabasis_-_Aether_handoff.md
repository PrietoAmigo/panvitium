# Handoff: Katabasis — Sigil Binding Screen ("Aether")

## Overview
This is a replacement for the **sigil screen in Katabasis** (the descent/prestige layer of *panvitium*). The player is positioned **inside a spherical vault**, looking outward at the 72 seals of the Goetia carved into the surrounding dark. They **drag to look around** the sphere, **center a seal**, **Focus** it (which locks the view and opens a detail panel), and **bind / unbind souls** to it. Bound seals glow; unbound seals are dim. A live soul pool sits top-left, and an "Unbind all" action reclaims every allocation at once.

The interaction goal is deliberate friction: seals are found by *looking*, not by scanning a list. Binding is a held, ramping pour rather than a numeric input.

---

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing the intended look, motion, and interaction model. **They are not production code to copy directly.**

The task is to **recreate this screen inside the existing Katabasis codebase** (`apps/web` — React + TypeScript) using its established components, state store, and styling patterns. The HTML/JS here is a faithful spec of behavior and visuals; the projection math and interaction logic can be ported close to 1:1, but the data wiring, persistence, and effect formulas must come from the real game (see **Pending Work** below).

The prototype is authored as a "Design Component" (`.dc.html`) — a single self-contained file with an inline `<style>`/markup template plus a `class Component` of logic. The `support.js` runtime is only needed to open the prototype standalone in a browser; **do not ship it** — it has no place in the React app.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, glow treatments, motion timing, and interaction flow are all intentional and specified below to exact values. Recreate the UI pixel-faithfully using the codebase's existing primitives where they exist (buttons, panels), but preserve the specific visual treatment of the sphere, the seal glow filters, and the binding flow.

---

## How to view the prototype
Open `Katabasis — Aether.dc.html` in a browser (it loads `support.js` from the same folder and the seal art from `assets/sigils/`). Drag anywhere to rotate. Center a seal until the bottom bar names it, click **Focus**, then press-and-hold **Hold to bind**.

---

## Screens / Views

There is **one screen** with two states: **Browsing** (default) and **Focused** (a seal is open).

### State A — Browsing (default)
- **Purpose**: Look around the sphere and locate a seal.
- **Layout**: Full-viewport stage. Seals are positioned in 3D and projected to 2D each frame. Persistent HUD overlays sit in the corners; a browse bar is centered along the bottom.
- The sphere **auto-rotates slowly** when idle and carries **momentum** after a drag (inertia that eases back to the idle drift).

### State B — Focused (panel open)
- **Purpose**: Read a seal's boon and bind/unbind souls.
- **Trigger**: Click **Focus** while a seal is centered.
- **Behavior**: Rotation **freezes**, a radial **scrim** dims the field, the focused seal brightens at center, the browse bar is replaced by a **detail panel** docked right.
- **Exit**: **✕ Release** button, clicking the scrim, or pressing **Esc** — rotation resumes.

---

## Components (exact specs)

### Stage / Vault background
- `position: fixed; inset: 0;` cursor `grab` (→ `grabbing` while dragging). `touch-action: none`.
- Background: two stacked radial gradients —
  - `radial-gradient(circle at 50% 50%, rgba(230,162,60,.10), transparent 34%)` (warm center glow)
  - `radial-gradient(circle at 50% 50%, #140d08 0%, #0a0806 54%, #050403 92%)` (dark falloff)
- **Curvature rings** (purely decorative, non-interactive), centered, `border-radius: 50%`:
  - `46vmin` — `border: 1px solid rgba(201,162,39,.06)`
  - `78vmin` — `border: 1px solid rgba(201,162,39,.045)`
  - `120vmin` — `border: 1px solid rgba(201,162,39,.03)`
- **Enclosure vignette** (over seals, non-interactive): `radial-gradient(circle at 50% 50%, transparent 50%, rgba(5,4,3,.5) 84%, rgba(4,3,2,.92) 100%)`.
- **Top & bottom HUD scrims** (gradient fades so corner text stays legible): top `160px` tall `linear-gradient(180deg, rgba(5,4,3,.86), rgba(5,4,3,.3) 55%, transparent)`; bottom `150px` tall, mirrored.

### Seals (the 72 sigils)
- Each is an `<img>` from `assets/sigils/NN.png` (zero-padded `01`–`72`), `64px`, `object-fit: contain`, centered, pointer-events none.
- Positioned on a unit sphere via a **Fibonacci/golden-angle distribution** (see Projection below). Index `i` (0–71) maps to seal number `i+1`.
- **Glow states** are CSS `filter`s (exact values — these are the visual language of bound vs. unbound):
  - **Cold / unbound** (`COLD`): `none`
  - **Bound / lit** (`LIT`): `brightness(1.15) sepia(.55) saturate(3) hue-rotate(-10deg) drop-shadow(0 0 9px rgba(230,162,60,.9)) drop-shadow(0 0 18px rgba(160,30,34,.5))`
  - **Centered (browse focus)** (`FOCUS`): `brightness(1.2) drop-shadow(0 0 8px rgba(230,162,60,.6))`
  - **Selected (panel open)** (`SELGLOW`): `brightness(1.25) drop-shadow(0 0 14px rgba(230,162,60,.95)) drop-shadow(0 0 30px rgba(160,30,34,.6))`
  - **Sealed / locked** (`SEALED`): `brightness(.42) grayscale(.55) contrast(.9)`
- Per-frame each seal also gets opacity (depth fade, `0.2`–`1.0`) and a scale (`0.6 + z*0.66`). Seals behind the viewer (`z < 0.14`) or off-screen are hidden (`opacity: 0`).

### Soul pool readout (top-left)
- Container at `top: 26px; left: 30px`, flex row, `align-items: baseline; gap: 9px`, non-interactive.
- Number `#souls`: **Cinzel 600, 30px**, color `#e6a23c`, `text-shadow: 0 0 24px rgba(230,162,60,.32)`, `font-variant-numeric: tabular-nums`.
- Label "souls unbound": **Fragment Mono, 11px**, `letter-spacing: .16em`, `text-transform: uppercase`, color `rgba(231,216,180,.5)`.

### Seals-burning counter (top-right)
- At `top: 30px; right: 30px`. **Fragment Mono, 11.5px**, color `rgba(231,216,180,.46)`. Format: `<count> / 72 seals burning`, where the count number is `#e6a23c`.

### Hint line (bottom-left)
- `#hint` at `bottom: 30px; left: 30px`. **Fragment Mono, 11.5px**, `rgba(231,216,180,.34)`. Text: "drag to look about you · focus a seal to read & bind it". **Fades to opacity 0** (transition `.6s`) on first interaction (drag).

### Browse bar (bottom-center) — State A
- `#browsebar`, centered (`left: 50%; translateX(-50%)`), `bottom: 24px`. Flex row, `align-items: center; gap: 13px`, `padding: 7px 9px 7px 15px`, `background: rgba(9,6,5,.94)`, `border: 1px solid rgba(201,162,39,.24)`, `border-radius: 8px`, `backdrop-filter: blur(3px)`, `box-shadow: 0 8px 32px rgba(0,0,0,.5)`.
- **Seal number** `#no`: **Fragment Mono, 9px**, `#c9822f`. **Roman numeral only**, e.g. `№ XLIV`.
- **Seal name** `#name`: **Cinzel, 16px**, `#e7d8b4`, line-height 1.1.
- `#bstate`: EB Garamond italic, 12px, `#e6a23c` — currently rendered **empty** for normal seals (kept as a hook for "sealed" state text). Glow already conveys bound/unbound, so no status string is shown.
- **Unbind all** button `#unbindall`: **Cinzel 10.5px**, uppercase, `letter-spacing: .1em`, color `#cdbf9c`, `background: rgba(40,29,18,.55)`, `border: 1px solid #5a4632`, `border-radius: 5px`, `padding: 8px 13px`. **Disabled (opacity .3, pointer-events none) unless ≥1 seal is bound.**
- **Focus** button `#focusbtn`: **Cinzel 10.5px**, uppercase, `letter-spacing: .12em`, color `#e7d8b4`, `background: rgba(124,20,23,.85)` (oxblood red), `border: 1px solid #a01e22`, `border-radius: 5px`, `padding: 8px 15px`. **Disabled unless a seal is centered.**
- When the panel opens, the whole browse bar is hidden (`display: none`).

### Detail panel (right) — State B
- `#panel`, `right: 34px`, vertically centered (`top: 50%; translateY(-50%)`), `width: 300px`, `padding: 16px 20px`, `border-radius: 11px`.
- Background `linear-gradient(168deg, rgba(20,13,9,.98), rgba(9,6,5,.98))`, `border: 1px solid rgba(201,162,39,.32)`, `box-shadow: 0 24px 80px rgba(0,0,0,.62)`. Toggled via `display: none/block`.
- **✕ Release** `#panel-close` (top-right of panel): Fragment Mono 10px uppercase, `rgba(231,216,180,.55)`, bordered `rgba(201,162,39,.25)`, radius 5px, padding `5px 9px`.
- **Seal number** `#p-no`: Fragment Mono 9.5px, `#c9822f`, roman numeral (`№ XLIV`).
- **Seal name** `#p-name`: **Cinzel 600, 21px**, `#e7d8b4`.
- Hairline divider: `1px` `rgba(201,162,39,.18)`.
- **Boon block**:
  - Label `#p-boonlabel`: Fragment Mono 9.5px, `letter-spacing: .2em`, uppercase, `rgba(201,130,47,.8)`. Reads "Boon while bound" (or "Sealed" for a locked seal).
  - Value `#p-boon`: **EB Garamond 16px**, line-height 1.5, `rgba(231,216,180,.9)`. The boon text per seal (see `BOON` map in the logic).
- **Stats block** `#p-stats`:
  - Row "Souls bound" / `#p-bound`: labels **EB Garamond 14.5px** `rgba(231,216,180,.62)` (`white-space: nowrap`); value EB Garamond 600 16px `#e6a23c`, tabular-nums.
  - Row "Effect" / `#p-eff`: same label style; value EB Garamond 600 16px `#d8b658`. **Displayed as a percentage**, e.g. `+12.4%` (see Pending — the coefficient is a placeholder).
  - **Hold to unbind** `#less`: Cinzel 11.5px uppercase, `#cdbf9c`, `background: rgba(40,29,18,.7)`, `border: 1px solid #5a4632`, radius 6px, `padding: 12px 8px`, `flex: 1`. Disabled unless this seal has souls bound.
  - **Hold to bind** `#more`: Cinzel 11.5px uppercase, `#e7d8b4`, `background: #7c1417`, `border: 1px solid #a01e22`, radius 6px, `flex: 1`. Label switches to "No souls" and disables when the pool is empty.
  - Footnote: EB Garamond italic 12px, `rgba(231,216,180,.4)`: "Bindings persist through every descent. Unbind to reclaim the souls."

---

## Interactions & Behavior

### Look / rotate
- **Drag** anywhere on the stage to rotate (yaw + pitch). Pitch is clamped to ±90° (`±1.5708 rad`).
- **Idle auto-rotation**: slow yaw drift (~`0.0014`/frame target) when not dragging.
- **Momentum**: on release, velocity continues and decays (`vYaw *= 0.95`, `vPitch *= 0.9` per frame), easing back toward the idle drift.
- Drag sensitivity: `0.0044 rad` per px in both axes.
- **Important**: pointerdown on the browse bar or panel must NOT start a drag (the prototype checks `e.target.closest('#browsebar') || closest('#panel')`). Without this guard, `setPointerCapture` on the stage swallows button clicks — this was a real bug that was fixed; preserve the guard when porting.

### Centering / focus detection
- Each frame, among seals facing the viewer (`z > 0.55`), the one nearest screen-center is the **focus** candidate. When it changes, the browse bar updates (number/name) and glows update.
- **Focus** is only enabled when a seal is centered.

### Focus → panel
- Clicking **Focus** sets `selected = focus`, freezes the loop (it still runs but skips integration while `selected >= 0`), shows scrim + panel, hides browse bar, raises the selected seal's z-index, applies `SELGLOW`.
- **Release** (✕ / scrim click / Esc) clears `selected`, hides scrim + panel, restores browse bar, resumes rotation.

### Binding (hold-to-pour)
- **Press and hold** "Hold to bind" / "Hold to unbind". Amount **ramps** the longer you hold:
  - `HOLD_BASE = 8` (applied immediately on press)
  - ramp: `amount = clamp(BASE, floor(BASE * HOLD_GROWTH^(heldMs / HOLD_RAMP_MS)), HOLD_MAX_STEP)`
  - `HOLD_GROWTH = 22`, `HOLD_RAMP_MS = 550`, applied every `HOLD_STEP_MS = 60ms`, capped at `HOLD_MAX_STEP = 2.5e9` per step.
- **Bind** moves souls pool → seal (clamped to available pool). **Unbind** moves seal → pool. Pool, count, panel stats, and glow all refresh after each step.
- Releasing the button (pointerup/leave/cancel, or a global pointerup) stops the ramp.

### Unbind all
- `#unbindall` sums every binding back into the pool, clears all bindings, refreshes. Disabled when nothing is bound.

### Locked seal (Semet / seal #32 in the prototype)
- `locked(id)` → seal is rendered with the `SEALED` filter, name shows "A seal unread", and the panel shows a "Sealed" message with **no bind controls**. Unlocks when `semetUnlocked` is true. **In the real game this is the "all Cardinal Sins ≥ Rank 2" gate — wire to the real predicate.**

### Number formatting
- `fmt()` renders large numbers as `1,234` below 1e6, then suffixes `M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc`, then exponential beyond. Match the game's existing number formatter instead if one exists.

---

## State Management
State the screen needs (names from the prototype):
- `pool: number` — unbound souls available. **Seam**: `this.props.souls`. → bind to the real soul balance.
- `bnd: Record<sealId, number>` — souls bound per seal (1-indexed, 1–72). → **must be the persisted save state**, not local.
- `focus: number` — index (0–71) currently centered; `-1` if none. Transient/UI.
- `selected: number` — index open in the panel; `-1` if none. Transient/UI.
- `semetUnlocked: boolean` — locked-seal gate. **Seam**: `this.props.semetUnlocked`.
- Transient render state: `yaw, pitch, vYaw, vPitch, drag` — pure view state, not persisted.

Transitions: center→Focus (lock), bind/unbind (pool↔bnd, with √-scaled effect), release (unlock), unbind-all (bnd→pool).

---

## Design Tokens

### Colors
| Token | Value | Use |
|---|---|---|
| Vault black | `#070504` / `#050403` / `#0a0806` / `#140d08` | backgrounds |
| Gold (primary) | `#e6a23c` | soul count, bound glow, accents |
| Gold (deep) | `#d8b658` | effect value |
| Gold-amber (label) | `#c9822f` / `rgba(201,130,47,.8)` | seal numbers, boon label |
| Brass line | `rgba(201,162,39,*)` (.03–.32) | rings, borders, dividers |
| Parchment text | `#e7d8b4` | seal names, primary text |
| Parchment dim | `rgba(231,216,180,.34–.62)` | labels, hints |
| Oxblood (primary btn) | `#7c1417` / `rgba(124,20,23,.85)`, border `#a01e22` | Focus, Hold-to-bind |
| Umber (secondary btn) | `rgba(40,29,18,.55–.7)`, border `#5a4632`, text `#cdbf9c` | Unbind, Unbind all |
| Crimson glow | `rgba(160,30,34,*)` | bound-seal drop-shadow |

### Typography
- **Cinzel** (500/600/700) — display: seal names, soul count, button labels.
- **EB Garamond** (regular + italic) — body: boon text, stat labels/values, footnotes, hint flavor.
- **Fragment Mono** — technical: seal numbers, counters, micro-labels (uppercase, wide letter-spacing).
- Sizes are listed per-component above. Roman numerals used for all seal numbers.

### Radius / shadow
- Radii: `5px` (small buttons), `6px` (panel buttons), `8px` (browse bar), `11px` (panel).
- Shadows: browse bar `0 8px 32px rgba(0,0,0,.5)`; panel `0 24px 80px rgba(0,0,0,.62)`.
- `backdrop-filter: blur(3px)` on the browse bar.

### Motion
- Button state transitions: `opacity .15s, background .12s, transform .06s`; press feedback `transform: scale(.96)`.
- Hint fade: `.6s`. Rotation: idle drift + momentum decay (constants above).

---

## Projection (the sphere math — port closely)
- 72 unit-sphere directions via golden-angle spiral: for `i` in `0..71`, `y = 1 - (i/(N-1))*2`, `r = sqrt(1-y²)`, `θ = goldenAngle*i`, `dir = (cos θ·r, y, sin θ·r)`.
- Camera basis from `yaw`/`pitch`: forward `f`, right `r`, up `u` (Gram-Schmidt as in code). Per seal: `z = dir·f` (depth), screen `sx = focal·(dir·r)/z`, `sy = -focal·(dir·u)/z`, with `focal = 520`.
- Cull `z < 0.14` (behind) and off-screen; depth-fade opacity `0.2 + clamp((z-0.14)/0.3)*0.8`; scale `0.6 + min(1,z)*0.66`; z-index `z*100`.
- Runs in a `requestAnimationFrame` loop. In React, drive this with a ref + rAF in `useEffect` (don't re-render React per frame — mutate the DOM/transform directly as the prototype does, or use a canvas/WebGL layer).

---

## Assets
- `assets/sigils/01.png` … `72.png` — the 72 Goetia seal images, zero-padded, transparent PNG, drawn at 64px. Already present in the repo asset pipeline for Katabasis; the prototype references them with a `?v=3` cache-buster you can drop.
- Fonts loaded from Google Fonts (Cinzel, EB Garamond, Fragment Mono). Use the codebase's existing font loading; these three families are the spec.

---

## ⚠ Pending Work (must be resolved during implementation)

These three items are **not done** in the prototype and are the core of turning it into the real screen:

### 1. Wire to live game state (currently stubbed)
The prototype runs on placeholder values via props:
- `souls` (the pool) defaults to a stub — bind it to the **real soul balance** in the Katabasis store.
- `semetUnlocked` defaults to `false` — replace with the **real gate** (all Cardinal Sins at Rank ≥ 2) that controls the locked seal.
- **Bindings (`bnd`) are local to the component** and evaporate on unmount. They must read from and **write back to the persisted save state**, and survive across descents (the UI already promises "Bindings persist through every descent").

### 2. Effect magnitude is a placeholder formula
The panel's **Effect** percentage uses a **representative coefficient** (`√(bound) × 0.01`), *not* the real per-seal math. Each seal's boon scales differently in the sim. Plug in the **actual per-seal effect formula** from the game so the displayed `+%` matches what binding actually does. The boon **text** (`BOON` map) is correct and sim-derived; only the magnitude number is a stand-in.

### 3. Port from HTML prototype to React/TSX
This is a standalone Design Component, **not** React. It must be reimplemented in `apps/web` (`Katabasis.tsx` or a new child component) using the codebase's component, state, and styling conventions. The projection loop and interaction logic port nearly 1:1; the chrome (buttons, panel) should reuse existing primitives where they exist. Decide how it mounts/replaces the current sigil screen.

*(Secondary, optional)* Touch tuning for small screens (pinch/zoom, momentum feel) and an optional "jump to a bound seal" affordance were discussed but intentionally left out — hunt-by-drag is the intended friction. Confirm with the designer before adding navigation shortcuts.

---

## Files in this bundle
- `Katabasis — Aether.dc.html` — the design prototype (markup + inline styles + logic class). **Primary spec.**
- `support.js` — runtime needed only to open the prototype in a browser. **Do not ship.**
- `assets/sigils/01.png`–`72.png` — the 72 seal images.
- `README.md` — this document.
