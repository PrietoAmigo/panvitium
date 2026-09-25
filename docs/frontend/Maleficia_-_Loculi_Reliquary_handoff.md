# Handoff: Loculi "Reliquary" + Maleficium Unveiling

## Overview
Replaces the boxed niche grid of the Loculi (Maleficia) panel with a frameless **Reliquary**: the Invocation Room darkens, the selected maleficium floats alone, large and pixel-art, in its rarity's light, with its effect set as a headline number; every other owned relic stands in a **procession** along the floor. Adds an **Unveiling** pop-up that plays whenever a maleficium is obtained (Emptio completes), for 1.5 s, dismissible by clicking anywhere.

Chosen option: **2a** in `Loculi Redesign.dc.html` (built on 1b). 1a in the same file is the faithful recreation of the current `MaleficiaCabinet.tsx`, for comparison. 1c/1d are unchosen explorations.

## About the Design Files
The bundled `.dc.html` is a **design reference built in HTML** — a prototype showing intended look and behaviour, not production code. Recreate it in `apps/web` (React + Zustand) using the repo's patterns: inline-styled component like the current `MaleficiaCabinet.tsx`, canvas pixelation like `InfluenceGoldHud.tsx`, rarity palette and strings already in place. It opens directly in a browser (needs `support.js`, which the design tool serves; if it doesn't open standalone, read the logic in the `<script data-dc-script>` block — the canvas helpers `pixelCanvas`, `PixelSprite`, `PixelGlow`, `PixelRays` are plain React and portable almost verbatim).

Asset paths in the prototype are `./apps/web/public/assets/panvitium/...`; in the app they are `/assets/panvitium/...` (`ASSET_BASE`).

## Fidelity
**High-fidelity.** Colours, type, sizes and timings are final. Layout was authored on the 1280×720 stage (`.stage` max width, 16:9).

## Where it plugs in
- `App.tsx` → `PANEL_SHELL.maleficia` currently `{ variant: 'niche', hideHeader: true }` wrapping content in `PanelShell` (`.panel-overlay` + `.panel--niche`). The Reliquary is **not a panel**: render it as a full-surface overlay (like Ars Goetia / Suasio), `position:absolute; inset:0; z-index:40`, with its own ✕ close. Influence/Gold HUD (`z-index:85`) and Desidia HUD stay visible above it, as today.
- `ui/panels.tsx` → `Loculi()` keeps feeding `buildCabinet(state)` items + `activateMaleficium` as `onUse`. Props contract of `MaleficiaCabinet` (`items`, `onUse`) is unchanged.
- The Unveiling mounts at App level (above the room/overlays, below system modals 90+ — suggest z-index 88) and is triggered by a store event when a maleficium is added to `lifetime.maleficia` (Emptio completion). It must not fire for Katabasis carry-over/loads.

## Screen 1 — Reliquary (Loculi)

Layer stack, bottom → top (stage 1280×720):
1. Room plate (already rendered by `RoomView` through the degradation pass — do not redraw; the prototype approximates it).
2. Dim: `rgba(4,3,3,.88)` full-bleed.
3. **Halo** (PixelGlow): 700×680 at left 290, top −40 (centred on the relic). Rarity ember colour, max alpha .5, falloff power 1.7, pulsing ±12% at 1.7 rad/s.
4. **Floor glow** (PixelGlow, static): 340×48 at left 470, top 458. Max alpha .7, power 1.2.
5. **Hero relic** (PixelSprite): box 420×360 at left 430, top 100; image fit `contain`, sized so its long side ≈ 380px. **Hero pixel size 3px** (i.e. grid = round(380/3) ≈ 127 art pixels on the long side). Bobs: translateY = round(sin(t·1.4)·2.5) × pixelSize (moves in whole art pixels). Hard pixel shadow `drop-shadow(0 {2·ps}px 0 rgba(0,0,0,.55))`.
6. Title "Loculi": top 34, centred; Cinzel 11px, letter-spacing .5em, uppercase, `#6a637a`.
7. Close ✕: top 15.2px, right 20.8px, 17.6px, `#b3acc4`, opacity .72 (1 on hover) — same as current `.panel--niche .panel-close--float`.
8. **Left column** (left 88, top 258, width 310, flex column gap 12):
   - Rarity label — Cinzel 12px, ls .45em, uppercase, ember colour. Text from `strings.maleficia.rarity[rarity]`.
   - Name — `h2` Cinzel 500, 40px, lh 1.08, ls .02em, `#efe9f7`, `text-wrap: balance`. (Keep the `×N` suffix from `buildCabinet`.)
   - Flavour (`desc`) — IM Fell English italic 18px, lh 1.5, `#a39bb4`, margin-top 4.
9. **Right column** (left 900, top 258, width 300, flex column gap 6):
   - Label — "Effect", or "Single-use · effect" for consumables. Cinzel 11px, ls .4em, uppercase, `#6a637a`.
   - Headline number — Cinzel 600, 68px, lh 1, ember colour, `text-shadow: 0 0 28px <wash>`.
   - Remainder — Cinzel 17px, ls .04em, lh 1.4, `#cfc6de`.
   - If `use` present: status line (existing `use.status`, IM Fell italic 13px `#9a7d6a`) + Use button exactly as today: Cinzel 12px ls .18em uppercase `#e6e0f0`, bg `rgba(124,20,23,.18)`, 1px `#7c1417`, radius 3, padding 10×20; disabled → opacity .55, not-allowed.
   - **Effect parsing:** strip trailing `.`; strip leading `Single-use: `; match `^([+-]?[\d.,]+%?)\s+(.*)$` → headline = group 1 (replace ASCII `-` with `−` U+2212), remainder = group 2. No match → no headline, whole string as remainder. Better long-term: expose a structured `{value, label}` from the sim/view-model instead of parsing copy.
10. Counter: bottom 136, centred; `"III  ·  XIII"` (selected index / total, Roman — reuse the Ars Goetia integer→Roman converter). Cinzel 11px, ls .35em, `#6a637a`.
11. Floor line: left/right 130, bottom 40, 1px, `rgba(255,255,255,.07)`.
12. **Procession** (left/right 130, bottom 41; flex row, centred, align-items flex-end, gap 18). One button per owned item (ordered anathema → common, stable within tier — same `RANK` sort as today):
    - Sprite box 58×58, pixel size = procession pixel size (**3px**, user-tuned; prototype default was 4).
    - Below: 24×4 marker bar in ember colour, opacity 1 when selected else 0; gap 8.
    - Unselected opacity .42 (hover → 1); selected opacity 1 and lifted `translateY(-10px)`. Transitions: opacity .2s, transform .2s ease.
    - `title` = item name.
    - If >13 items, let the row scroll horizontally (hidden scrollbar, like `.niche-grid-scroll`) and keep the selected item in view with `scrollLeft` (never `scrollIntoView`).
13. Arrows ‹ › : left 70 / right 70, bottom 60, Cinzel 26px, `#6a637a` (hover `#e6e0f0`). Wrap around. Also bind ←/→ keys while open; Esc closes.

Empty state: keep existing `strings.maleficia.empty` behaviour.
Default selection on open: first item (the rarest), or the most recently obtained if the Unveiling just played.

## Screen 2 — Unveiling (on obtain)

Full stage overlay, `cursor:pointer`, background `rgba(3,2,4,.94)`.
- **Rays** (PixelRays) full-bleed: low-res buffer (1280/(2·ps) × 720/(2·ps)), origin above top-centre (x = W/2, y = −0.28H). Per-pixel intensity = two rotating angular sine bands (`sin(ang·11 + t·.22)^6·.6 + sin(ang·6 − t·.15 + 1.3)^10·.5`) × cone (|ang| < .75 rad) × distance falloff + a soft core glow behind the relic; ramps in over 1.2 s; 46 rising 1-pixel motes (ember + 60 brightness). Quantised to 6 alpha levels with 4×4 Bayer dithering, max alpha .55. Upscaled `image-rendering: pixelated`.
- Halo (PixelGlow): 650×620 at left 315, top −60; max alpha .55, power 1.8, pulsing.
- Relic (PixelSprite, reveal mode): box 460×340 at left 410, top 56, long side ≈ 400px, hero pixel size 3.
- "Maleficium obtained": top 30, centred; Cinzel 11px, ls .5em, uppercase, `#6a637a` (new copy — add to `strings.maleficia`).
- Text block, top 420, centred column:
  - `◆ {Rarity} ◆` — Cinzel 12px, ls .5em, uppercase, ember.
  - Name — Cinzel 500, 52px, lh 1.05, ls .03em, `#efe9f7`, margin-top 12.
  - Flavour — IM Fell italic 19px, lh 1.5, `#a39bb4`, width 640, margin-top 12.
  - Effect row (baseline, gap 14, margin-top 18): headline Cinzel 600 38px ember + `text-shadow 0 0 22px <wash>`; remainder Cinzel 17px `#cfc6de`, nowrap.
- Countdown bar: bottom 0, full width, 3px; track `rgba(255,255,255,.05)`, fill ember, width 0 → 100% over 1.5 s linear.

**Timing**
- t=0: overlay appears (opacity 1). Relic reveal: grid steps `[3,5,8,12,18,26,38,54,76, full]` (only those < full), **70 ms per step** (~0.7 s), then a white flash (`rgba(255,240,225,·)` composited `source-atop`, only on the sprite's pixels) decaying linearly over **350 ms**.
- t=1.5 s, or on any click: fade out (opacity → 0, `.3s ease`), then unmount at +300 ms. Clicking during the fade does nothing.
- Queue: if several maleficia arrive together, play them one after another (each 1.5 s) — or collapse to the rarest; decide with design. Don't overlap.
- `prefers-reduced-motion` (`usePrefersReducedMotion`): skip the reveal steps and flash, show the relic at full resolution, rays static (no rotation/motes), keep the 1.5 s hold and fade.
- Purely presentational: no sim/RNG/save impact.

## Pixel-art pipeline (`pixelCanvas`)
Same principle as `InfluenceGoldHud` (low-res canvas, upscaled nearest-neighbour), applied per sprite with a fixed on-screen pixel size so every relic reads at one chunkiness:
1. `grid = round(displayLongSide / pixelSize)`; target w/h keep aspect.
2. Downscale by repeated halving (quality) then one smoothed draw to w×h (+1px padding if outlined).
3. Alpha threshold: `a < 110 → 0`, else 255 (hard pixel edges).
4. Colour crush: round each RGB channel to multiples of 26.
5. Rarity outline: every transparent pixel 4-adjacent to an opaque one becomes the rarity ember colour at alpha 210.
6. Display the canvas with `width/height:100%; object-fit:contain; image-rendering:pixelated` (only `pixelated` — `crisp-edges` after it breaks Chromium, per the existing comment).
Cache the result per (src, grid, options); precompute procession sprites once per open.

`PixelGlow`: buffer = size/(2·ps); radial `max(0, 1−d)^power`, 5 alpha levels via 4×4 Bayer (`[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5]/16`).

## State
- `selectedIndex` (Reliquary), reset/seeded on open.
- Unveiling: `queue: string[]` of maleficium ids, `current`, `fading`; timers cleared on unmount.
- Trigger: subscribe to additions in `lifetime.maleficia` (diff previous vs next in the store, or have `startAction('emptio')` completion emit an event).

## Design tokens
Rarity (from `MaleficiaCabinet.tsx`, unchanged):
- common — ember `#caa85f`, wash `rgba(202,168,95,.22)`, ring `rgba(202,168,95,.30)`
- rare — `#54b39b`, `rgba(84,179,155,.22)`, `rgba(84,179,155,.32)`
- profane — `#9a6fe0`, `rgba(154,111,224,.26)`, `rgba(154,111,224,.34)`
- anathema — `#c2403f`, `rgba(194,64,63,.26)`, `rgba(194,64,63,.34)`

Neutrals: `#efe9f7` (titles), `#e6e0f0`, `#cfc6de` (effect text), `#b3acc4`, `#a39bb4` (flavour), `#6a637a` (labels), blood `#7c1417`.
Fonts (already loaded in `index.html`): Cinzel 500/600, IM Fell English (italic), EB Garamond.
Pixel sizes (user-tuned): hero 3px, procession/glows/rays 3px.

## Assets
`/assets/panvitium/maleficia/*.png` (transparent PNGs, existing) via `menus.data.ts` `MALEFICIA[].img`. Items without art: fall back to the current text label treatment.

## Files
- `Loculi Redesign.dc.html` — option **2a** (top section) is the spec; 1a = current UI recreation; 1b/1c/1d = explorations. Logic helpers are in the `<script data-dc-script>` block.
