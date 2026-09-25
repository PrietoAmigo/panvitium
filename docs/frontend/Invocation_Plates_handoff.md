# Handoff: Invocation Plates (Panvitium)

## Overview
One painted plate per invocation (25, matching `packages/sim/src/invocations.data.ts`). Each plate is shown on the right side of that invocation's page in the Ars Goetia / Invocatio UI. The style is a fast, dry brush in a single yellow ochre on dark cave stone, like primal cave painting. The plates show concepts, not figures: Aurevora is a maw of gold, Astiwihad is a noose, and so on.

## About the design files
`Invocation Plates.dc.html` is a **design reference built in HTML**, not production code. Recreate it in `apps/web` (React 18 + TS strict + Vite), using the repo's patterns. Open the file in a browser (with `support.js` next to it) to see all plates. The `invocation` prop (`all` or an id) shows one plate full-width. The `captions` prop turns the name labels on or off.

## Fidelity
High-fidelity for the art direction, colour and composition. The strokes are **generated procedurally from a seed**, so the output is deterministic.

Pick one of two ways to ship it:
1. **Recommended: bake the art into static assets.** Render each plate once (open the file, set `invocation=<id>`, export an SVG/PNG of the `<svg>`), then ship `apps/web/src/assets/invocations/<id>.svg` or `.png`. This fits ADR-021 (per-room PNG layers). PNG at 2× (600×800) is the safest choice for filter performance.
2. Port the generator (`stroke()` / `sample()` / `rng()` in the logic class) into a `apps/web/src/art/brush.ts` util and a `<InvocationPlate id>` component that memoises its output. Keep it out of `packages/sim` (it is presentation only).

## Plate spec
- viewBox `0 0 300 400` (3:4 portrait). Displays at 100% of the right-hand column width, `height: auto`.
- Layers, bottom to top:
  1. Base fill `#17110d`.
  2. Stone texture: `feTurbulence fractalNoise` (baseFrequency e.g. `0.007 0.011`, 5 octaves, seed 11 / 27 / 63, cycled per plate) → `feDiffuseLighting` (lighting-color `#3a2e24` / `#372b22` / `#3d3026`, surfaceScale 3.5, distant light azimuth 220–250°, elevation 46–50°).
  3. Vignette: radial gradient at cx 45%, cy 40%, r 75%, from `#0b0706` at 0 opacity (0.4) to 0.85 opacity (1.0).
  4. Paint group with a wobble filter: `feTurbulence` 0.018, 2 octaves, seed 5 → `feDisplacementMap` scale 6.
- Paint colour: **`#d9a53f`** (the only colour). Per-bristle opacity is 0.5–1.0.
- Caption (optional): IM Fell English SC, 18px, letter-spacing .08em, `#c9b99c`, centred, 12px under the plate.

## Brush algorithm (if porting)
Each gesture is `{ p: [[x,y],…], w, dry?, splat?, lin?, n? }`:
- The centreline is a Catmull-Rom spline through `p` (or a polyline if `lin`), sampled about every 4 units.
- Effective width `w × 1.55` (unless `n` is set). Dry factor `dry + 0.15`, capped at 0.95.
- Bristle count `N = clamp(round(w / 1.3), 4, 48)`, or `n`. For bristle `u ∈ [-1, 1]`:
  - offset `u·w/2 ± 6%` jitter, narrowing by 30% along the length;
  - quadratic drift `±37.5%·w·t²`, so bristles fan out at the tail;
  - start trim `rand·0.06 + u²·rand·0.22`, end trim `rand·0.1 + |u|·rand·0.32 + rand·dry·0.35`;
  - stroke width `0.6 + rand²·5` (×1.3 if w > 25), round caps;
  - with probability `dry + |u|·0.3`, a random `strokeDasharray` on `pathLength = 100` for dry breaks.
- `splat` adds k droplets (r 0.8–3.6) scattered around the stroke's end. `D(x, y, rx, ry)` is a solid dab.
- RNG: mulberry32, seeded with `plateIndex × 997 + gestureIndex × 31 + 7`. Plate index is the order in `ORDER`. Changing the order reshuffles the strokes, so bake or pin the seeds.

## Roster and concepts (in catalog order)
familiar: a coiled creature with eyes · wendigo: antlers over a ribcage · blob: a slumped, dripping mass · empusa: a rising flame · kobold: a pickaxe with nuggets · imp: horns and a grin · banshee: a wailing mouth with falling hair · narcissus: a flower and its reflection · arachne: a web with a spider · upir: bat wings, fangs and drops · lamia: a coiling serpent · behemoth: a mass with tusks · harpy: a wing sweep and raking talons · plutus: a sack over a hoard · nightmare: a wild mane over a staring eye · fama: a mouth with spreading rings · lemure: rising wisps · midas: a crown over a touch-burst · aurevora: a maw of gold · doppelgaenger: mirrored crescents · succubus: enclosing wings with horns · specunitas: an enso ring around an eye · astiwihad: a noose · erinyes: three lashes · morpheus: a closed eye, a spiral and two sleepers.

The ids match the `INVOCATIONS` keys exactly (note `doppelgaenger`).

## Integration
- Map `InvocationDef.id` → asset. Show the plate in the invocation detail view's right column. Hide it (or show the stone background alone) for unknown ids.
- Plates are decorative: `alt=""` / `aria-hidden`. The invocation name already shows in the UI.
- No state or interactions.

## Files
- `Invocation Plates.dc.html`: the reference, holding all gesture data and the generator (logic class).
- `support.js`: the runtime needed to open the reference locally.
