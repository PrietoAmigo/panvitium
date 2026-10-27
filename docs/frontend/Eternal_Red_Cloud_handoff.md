# Handoff: The Eternal feeding screen, "Red Cloud" (option 4a)

## Overview
This replaces `EternalModal` in `apps/web/src/menus/Katabasis.tsx`, the takeover where the player pours souls into the central monolith once all eight Cardinal Sins are mastered (`eternalSinVisible(state)`).

The new screen has **no modal, no meter, no percentage, no title and no churning verb**. The player stands inside a drifting red cloud over the end-state art (`katabasis_end.png`). Holding the monolith pours souls through the existing hold ramp. As `eternalProgress(state)` rises from 0 to 1, the cloud thins and the blurred Court comes into focus. At 1 the scene is fully clear.

The reveal state (`eternalSinRevealed`, the "Semet / Peccatum Æternum / Time" block) is out of scope. Keep the current behaviour, or ask the designer.

## About the design files
`Monolith Feed.dc.html` is a **design reference built in HTML**, not production code. Recreate it inside the existing Panvitium web app (React + Zustand, `menus.css` scoped under `.katabasis-flow`), following the repo's patterns and the ADRs. The file is a canvas showing several explored turns. **Only `#4a` ("Thinning") is the chosen direction.** The other turns (1a–4c and "Current") are history. Open the file next to `support.js` in a browser to see it live.

## Fidelity
High fidelity. Colors, timings and the density curve below are final. The prototype's own soul formatting is a stand-in; use `formatBigNum`.

## Where it lives
- Inside `StatuesPlace`, when `ended === true`, clicking the invisible `.obelisk` hotspot currently opens `EternalModal`. **Replace that flow.** The ended scene itself becomes the feeding screen: render the cloud layers over `.bg-end` permanently (density driven by progress), and make the obelisk hotspot the hold target.
- Remove the `.end-glow` layer from the ended scene. The designer does not want added glows.
- Keep `kat-hud` (Souls) visible.
- Make sure `HellFloor` doesn't intercept the obelisk; it can stay.
- The close (✕) button in the mock exists only because the mock is a takeover. With no modal there is nothing to close, so drop it.

## Layer stack (bottom → top), 1280×720 reference frame
1. **Court art**: `/assets/panvitium/katabasis/katabasis_end.png`, `background-size: cover; background-position: 47.5% 100%`, `filter: url(#kat-degrade) blur(Bpx)`, with the element inset −20px on every side so the blur doesn't show edges. `B = density × 9` (px).
2. **Red wash**: solid `#5a0a0a`, `mix-blend-mode: multiply`, `opacity = density × 0.55`.
3. **Cloud layer A**: noise canvas (see below), drifting **left → right only**, linear, **7 s** per tile.
4. **Cloud layer B**: second noise field (different seed), drifting left → right at **4 s** per tile. Opacity also breathes `0.5 → 0.85 → 0.5` over 3 s ease-in-out, infinite.
5. **Vignette**: `radial-gradient(ellipse at 50% 36%, transparent 38%, rgba(0,0,0,.5) 100%)` (same as `.hell::after`).
6. **Scanlines**: same as `.kat-degrade-chrome` (`repeating-linear-gradient(to bottom, rgba(0,0,0,.24) 0 1px, transparent 1px 3px)`, multiply). Keep the existing grain `::before`.
7. **Hold target**: invisible button over the obelisk, about x 540–680px, full height at 1280×720. In production, use percentages (x ≈ 42.2%, w ≈ 10.9%) or reuse `ETERNAL_POS`. No hover visual; cursor pointer only.
8. **HUD**: existing `kat-hud`.

`density = 1 − eternalProgress(state)`, clamped to [0, 1].

## Cloud rendering (performance-critical)
**Do not use a live SVG `feTurbulence` filter.** An earlier version did and dropped to about 13 fps.
- Generate each noise field **once** on mount: a 320×180 Float32Array of 4-octave value noise (cells 64/32/16/8 px, amplitudes 1, .5, .25, .125, normalised), with **x-wrapped grid indices** so it tiles horizontally without a seam. The prototype has a seeded LCG implementation (`makeNoise`) in the DC's logic class; copy it.
- Paint into a `<canvas width="640" height="180">` (the tile drawn twice side by side). Each pixel is `rgb(158,15,13)` with `alpha = clamp(3·n + i, 0, 1)`, where `i = −2.6 + density × 3.6`.
  - density 1 → solid cloud; about 0.5 → broken wisps; 0 → fully clear.
- Display the canvas at `3920×1040` CSS px (`top: −160px; left: 0`) so the browser's bilinear upscale softens it. Animate `transform: translateX(-1960px) → translateX(0)`, linear, infinite. One tile = 1960 px, so the loop is seamless.
- **Repaint only when `i` changes** (while pouring, at most every 60 ms hold step) and only that screen's two canvases. The drift is pure compositor transform. Use `will-change: transform` (plus opacity on layer B).
- Scale the 1960/3920/1040 px values to the viewport (they assume 720 px height; use `vh`-relative or measure the scene).
- Reduced motion: stop both drift animations and the breathe, but keep the density.

## Interaction
- Pointer-down on the obelisk → `HoldButton`-equivalent ramp, unchanged from `katabasisShared.tsx`: step every 60 ms, `amt = min(2.5e9, max(8, floor(8 · 22^(held/550))))`, which calls `offerEternal(d)`. Stop on pointerup or pointercancel (window listeners) and on pointerleave.
- Disabled when the soul pool is empty (`poolEmpty`). There's no visible disabled state; the hold simply does nothing.
- There's no text feedback while holding. The cloud thinning is the only response. **Remove `ETERNAL_HOLD_VERBS` and the verb churn from this screen.**
- The density follows the real log curve (`eternalProgress`), so early pours visibly thin the cloud and late ones clear the last wisps.

## State
No new store state. Everything derives from `eternalProgress(state)`. Local: hold RAF refs (reuse the HoldButton internals, or factor out a `useHoldPour(onStep)` hook so a non-button element can be the target).

## Copy rules from the designer
- Don't label this screen "The Ninth" or "Semet".
- No meters, progress bars, percentages, rungs or numbers apart from the Souls HUD.
- No drawn shapes, polygons or added glows. Every effect comes from the painting, the cloud or the camera.

## Design tokens used
- Cloud color `rgb(158,15,13)`; wash `#5a0a0a` (multiply)
- Existing `.katabasis-flow` palette unchanged (`--ash #c9c4bc`, `--faint #6a635c`, etc.)
- Fonts: unchanged (the HUD uses Cinzel and IM Fell English SC)

## Assets
- `apps/web/public/assets/panvitium/katabasis/katabasis_end.png` (already in the repo)
- Noise is generated at runtime, so there's no asset.

## Files
- `Monolith Feed.dc.html`: the design canvas; open `#4a`. The logic class contains `makeNoise`, `paintFog` and the hold ramp.
- `support.js`: runtime needed to open the .dc.html locally.
- Source being replaced: `apps/web/src/menus/Katabasis.tsx` (`EternalModal`, `StatuesPlace` ended branch), `apps/web/src/menus/menus.css` (`.takeover--eternal`, `.tk-*`, `.end-glow`).
