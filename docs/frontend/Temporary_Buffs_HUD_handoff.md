# Handoff: Temporary Buffs HUD (option 2a, "Rings in columns")

## Overview
Right now the player has no quick way to see which temporary buffs are active. This adds a persistent readout of them to the left HUD column, between the Influence vessel (top-left) and the Desidia vessel (bottom-left). It covers two sources:
- **Maleficia consumables**: the four single-use relics tracked in `state.lifetime.maleficiaBuffs` (`hand_of_glory`, `black_salt_pouch`, `defixio`, `crossroads_dirt`). Each is `{ [id]: secondsRemaining }` with a 1-hour duration.
- **Call-in buffs**: `state.lifetime.callBuffs` (`CallBuff[]`: `{ field, factor, remainingSeconds }`), appended by `applyCallEffects` in `packages/sim/src/callBuffs.ts`.

Each active source is one circular **ring**. The ring empties as its timer runs down, has the relic art (or a multiplier glyph for calls) in the middle, and shows a short countdown beneath it. Hovering a ring opens a details card to its right.

## About the Design Files
The bundled `Buffs HUD.dc.html` is a **design reference built in HTML**. It is a prototype of the intended look and behaviour, not production code. Rebuild it in the existing `apps/web` React + Zustand app using its patterns: a new `ui/BuffsHud.tsx` plus a `ui/buffs-hud.css` sibling, following `DesidiaHud.tsx` / `desidia-hud.css`. The canvas also holds the rejected options (1a, 1b, 1c) and a recreation of the current HUD for context. **Implement only board 2a.**

## Fidelity
**High-fidelity.** Colours, type, sizes and spacing are final and use the existing HUD vocabulary (`.ig-hud-*`, `.desidia-hud-*`). The Influence/Gold and Desidia HUDs in the file are recreations of the current code. Do not change them.

## Placement & Mounting
- Mount `<BuffsHud />` in `App.tsx` next to the other HUDs, under the same visibility rule: `hudVisible && panel !== 'maleficia'`. It sits in the same column as Desidia, which also steps aside over the Loculi. Render nothing when no buffs are active.
- Container: `position: absolute; left: 45px; top: 246px; z-index: 85; pointer-events: none` (each ring re-enables `pointer-events: auto`). 45px is the Desidia padding-left (1.5rem) plus the readout margin-left (1.32rem), so the ring column lines up with the "Desidia" label. Use rem equivalents in CSS: `left: 2.82rem; top: ~15.4rem`.
- Available band on a 720px-tall viewport: y ≈ 240 (below the Influence vessel: 17.6px padding + 210px box) to y ≈ 572 (above the Desidia label, which starts ≈ 586). The container height is **326px**.
- Fade in like the siblings: `animation: fade-in 1.2s ease 0.15s both`.
- Consider anchoring from the bottom (above the Desidia HUD) or computing top from the Influence vessel if the viewport is short. The HUDs pin to the viewport, not the 16:9 stage.

## Layout: the column flow
- Container: `display: flex; flex-direction: column; flex-wrap: wrap; align-content: flex-start; gap: 10px 14px; height: 326px`.
- Rings stack top to bottom. When the column is full they wrap into a new column to the right.
- **Order**: maleficia first, then calls. Within each group, ascending by time remaining (soonest to expire first). The prototype also has a "time left" tweak that merges both groups into one list sorted by time.

## Components

### Ring tile (44px wide, one per active source)
- Wrapper: `position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; width: 44px; cursor: default; pointer-events: auto`.
- **Ring**: a 44×44 circle, `border-radius: 50%`, `filter: drop-shadow(0 4px 8px rgba(0,0,0,0.7))`.
  - Background is a conic countdown: `conic-gradient(<accent> 0 P%, rgba(231,216,180,0.14) P% 100%)`, where P = remaining / duration × 100. It starts at 12 o'clock and runs clockwise.
  - Accent: maleficia `#d8b658` (`--gold-leaf`), calls `oklch(0.74 0.09 20)` (a muted rose, new). For an sRGB fallback use about `#d89a95`.
- **Inner disc**: `position: absolute; inset: 2px; border-radius: 50%; background: rgba(10,8,7,0.86)`, content centred, `overflow: hidden`. The 2px of conic gradient left showing is the ring.
  - Maleficia: relic art at **30×30**, `object-fit: contain; image-rendering: pixelated`, from `/assets/panvitium/maleficia/<id>.png`. In production, prefer the Loculi's `PixelRelic` pixelation at a small art-pixel size so it matches the reliquary.
  - **Hand of Glory has no art.** Fall back to a text glyph like the calls do.
  - Calls: glyph text, Cinzel 700, 14px, in the call accent colour. It is the dominant multiplier: `×2`, `×3`, `×1.33`, or `+10%`-style if you prefer. The sample uses `×2`.
- **Countdown under the ring**: Cinzel 600, 10.5px, `font-variant-numeric: tabular-nums`, colour `#e7d8b4`, `text-shadow: 0 1px 4px rgba(0,0,0,0.95)`, `white-space: nowrap`. Short format: `≥1h → "1h 12m"`, `≥1m → "42m"`, otherwise `"37s"`.

### Details card (hover only)
- `position: absolute; left: 56px; top: 0; z-index: 3; width: 230px; padding: 10px 12px 11px; display: flex; flex-direction: column; gap: 4px; background: rgba(10,8,7,0.9); border: 1px solid rgba(216,182,88,0.3); box-shadow: 0 10px 24px rgba(0,0,0,0.6); pointer-events: none`. The border and ground are the `.hotspot-label` treatment.
- **Row 1**, space-between on the baseline:
  - Name: Cinzel 600, 11px, `letter-spacing: 0.14em`, uppercase, in the source accent (gold `#d8b658` / rose).
  - Kind: Cinzel 400, 9.92px (0.62rem), `letter-spacing: 0.2em`, uppercase, `#c9b489`. Reads `Maleficium` or `Call · <caller>`, where the caller is the last `·` segment of `strings.phone.callIn.calls[id].tag`, e.g. "an acolyte" or "Mai".
- **Effect lines**, one per effect: EB Garamond 15px, line-height 1.2. Buff colour `#e7d8b4`; debuff (a call factor below 1) `oklch(0.7 0.14 25)`, about `#d9665c`.
  - Maleficia: the effect clause from the catalog description, via `maleficiumView(id).effect` with the "Single-use:" prefix and "for an hour" stripped, e.g. "+10% reprobate generation".
  - Calls: the clause from `describeCallInEffects`, e.g. "Reprobate generation doubles" or "Reprobate generation halves".
- **Remaining line**: Cinzel 600, 12px, tabular-nums, `#e7d8b4`. Reads `"<formatDuration> remaining"`, e.g. "18m 4s remaining", using `formatDuration` from `game/format.ts` (the prototype matches it) and `strings.maleficia.buffRemaining`.

## Interactions & Behavior
- **Hover**: `mouseenter` on a ring shows its card; `mouseleave` hides it **immediately** (no delay, no fade). Only one card is open at a time. Nothing shows by default.
- Also show the card on `:focus-visible` if the rings are made focusable. Recommended: `button` elements with `aria-label="<name>, <effect>, <time> remaining"`.
- Once rings wrap into a second column, a first-column card may briefly cover second-column rings. This is accepted because the card only exists while hovered.
- **Live update**: the store ticks at 10 Hz. Rings and countdowns re-render from state; the conic P% follows `remaining / duration`. A ring disappears the tick its buff expires.
- **Grouping**: one ring per *source*, not per effect. A call that applies two `timedMul` effects (e.g. `social-platform`: influence regen ×2 plus reprobate generation ×0.5) is one ring with two effect lines.
  - `callBuffs` is flat, so the sim needs to record the source call id on each `CallBuff`, e.g. an optional `sourceId`. That is additive-optional (ADR-023). Alternatively, group entries appended in the same `applyCallEffects` call.
  - The same call answered twice shows as two rings.
- **Reduced motion**: nothing here animates beyond the fade-in; keep it.

## State / Data
- Selector: `useGameStore(s => s.state)`. Derive the view-model in a pure `game/buffs.ts` helper (unit-testable, like `maleficia.ts`) that returns `{ id, kind: 'maleficium' | 'call', name, caller?, img?, glyph?, effects: { text, debuff }[], remainingSec, durationSec }[]`.
- Durations: maleficia use a 3600s constant (the catalog's one-hour buffs). Calls use `durationSec` from `calls-in.data.ts`, which `CallBuff` doesn't store today; either add `durationSec` to `CallBuff` or look it up by source id.
- Local UI state: `hoveredId: string | null`.
- No RNG or sim-behaviour change. A save-schema change is needed only if you add `sourceId` / `durationSec` to `CallBuff`, which is additive-optional.

## Design Tokens
- `--gold-leaf #d8b658` (maleficia accent), `--candle-soft #c9822f`, `--parchment #e7d8b4` (text / buff), `--parchment-shadow #c9b489` (secondary text), `--void #0a0807` (card ground at 0.86–0.9 alpha).
- New: call accent `oklch(0.74 0.09 20)`, debuff text `oklch(0.7 0.14 25)`.
- Ring track `rgba(231,216,180,0.14)`; card border `rgba(216,182,88,0.3)`.
- Fonts: Cinzel (`--font-display`) and EB Garamond (`--font-body`), both already loaded in `index.html`.
- Shadows: ring `drop-shadow(0 4px 8px rgba(0,0,0,0.7))`; card `0 10px 24px rgba(0,0,0,0.6)`; text `0 1px 4px rgba(0,0,0,0.95)`.

## Assets
All from the repo, nothing new: `apps/web/public/assets/panvitium/maleficia/{black_salt_pouch,crossroads_dirt,defixio}.png` (Hand of Glory has none), plus the HUD frames and Studio plate for context only.

## Files
- `Buffs HUD.dc.html`: the prototype canvas. Board **2a** is the one to build. Open it in a browser; the logic class at the bottom holds the sample data and the view-model derivation (`tilesB2`).
- Source files it was recreated from: `apps/web/src/App.tsx`, `ui/InfluenceGoldHud.tsx`, `ui/DesidiaHud.tsx`, `ui/desidia-hud.css`, `styles/index.css`, `packages/sim/src/callBuffs.ts`, `packages/sim/src/maleficia.data.ts`, `menus/calls-in.data.ts`, `game/callIn.ts`, `game/maleficia.ts`.
