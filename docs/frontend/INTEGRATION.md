# Panvitium — Menu & Room Overlay · Integration Guide

This package contains the **room playspace and menu layer** built in the prototype,
ready to fold into your `apps/web` React + TypeScript app. It's an *overlay*: copy
the files to the indicated paths, wire a handful of state seams, and delete the
mock data.

> The prototype was a single standalone HTML page using in-browser Babel and
> **mock data**. Everything visual/interactive is production-faithful; the only
> real work is replacing the stand-in catalogs with your sim/store.

---

## What's in the box

```
handoff/
├─ INTEGRATION.md            ← you are here
├─ Panvitium Rooms.html      ┐
├─ *.jsx  styles.css …       │  RUNNABLE REFERENCE — open the HTML in a browser to
├─ assets/                   ┘  see the target behaviour. (Mock data; not for prod.)
└─ port/                     ← DROP-IN for apps/web
   ├─ Playspace.example.tsx     example orchestration (router glue, minus Tweaks/HUD)
   └─ menus/
      ├─ types.ts               presentation types
      ├─ menus.data.ts          ⚠ MOCK catalogs — replace with sim/store selectors
      ├─ menus.css              all menu + room styles (asset paths already fixed)
      ├─ PanelShell.tsx         framed overlay (scroll / stone / cabinet variants)
      ├─ RoomView.tsx           backdrop + scene prop + hotspots
      ├─ SummonedCreatures.tsx  invocations standing in the circle
      ├─ AltarPanel.tsx         stone devotion ledger → triggers descent
      ├─ MaleficiaCabinet.tsx   wooden display case + close-up
      ├─ SuasioPanel.tsx        temptation scroll + log
      ├─ PcWindow.tsx           Ubuntu-style file manager of ritual programs
      ├─ ArsGoetiaBook.tsx      full-screen open grimoire (index → detail leaf)
      ├─ Katabasis.tsx          full-screen demonic two-page descent
      ├─ useHold.ts             press-and-hold-with-ramp hook
      └─ index.ts               barrel export
```

---

## Step 1 — Assets

Copy everything under `handoff/assets/` into your web app's static dir:

```
apps/web/public/assets/panvitium/
├─ backgrounds/   invocation.png, invocation_complete.png, altar.jpg,
│                 altar_complete.png, studio.png, studio_complete.png
├─ invocations/   imp.png, upir.png, harpy.png, fama.png, nightmare.png, behemoth.png
├─ items/         ars_goetia.png
├─ maleficia/     22 item PNGs
├─ parchment.jpg  stone-slab2.jpg  altar-stone.png  wood-case.jpg  open-book.png
```

All code references these at the **runtime URL `/assets/panvitium/...`** (Vite
serves `public/` at the root). If you keep art somewhere else, change the single
`ASSET_BASE` constant in `menus.data.ts` and the texture/background `url()`s at
the top & bottom of `menus.css`.

> The `backgrounds/*` files are the same clean/complete plates you already had in
> the repo — reuse your existing copies if you prefer.

## Step 2 — Source files

Copy `port/menus/` → `apps/web/src/menus/` and import the stylesheet once
(e.g. from your room screen or `main.tsx`):

```ts
import './menus/menus.css';
```

`Playspace.example.tsx` shows the full wiring. Either adapt it into your existing
room screen or use it as the reference for the integration points below.

## Step 3 — Rooms & hotspots

`ROOMS` in `menus.data.ts` carries the three room defs and their hotspot
rectangles (percentages of the 16:9 `.stage`). These rects are **re-tuned to land
on the real plates** (doors, bookcase, altar, desk, scroll, the book) — port them
into your existing `rooms.ts` verbatim, or just use this `ROOMS`.

The `.stage` element is the fixed 16:9 canvas the percentages resolve against;
`.scene` paints the backdrop. Both live in `menus.css`.

## Step 4 — Wiring to real state  ⚠ the actual work

Each component renders from `menus.data.ts` mock arrays and uses local `useState`.
Swap these for your sim/store. The seams (all marked `TODO(wire)` in code):

| Component | Replace mock → with real |
|---|---|
| **HUD** (yours) | Souls / Gold / Influence / Reprobates from store |
| `RoomView` / `Playspace` | `summoned` list, `signature` (a ritual is running) |
| `ArsGoetiaBook` | `INVOCATIONS` unlocked/gates + bound count; `onSummon`/`onDispel` → your invocation actions (one bound at a time; cleared on leaving the room) |
| `AltarPanel` | per-Prince devotion + level; bound sigils list; `onDescend` opens `<Katabasis/>` |
| `Katabasis` | seed `pool` from banked souls; commit `poured` (Prince levels) + `bound` (sigils) to the sim on **Ascend** |
| `MaleficiaCabinet` | owned maleficia (your `packages/sim` catalog already has names/rarities/effects) |
| `SuasioPanel` | `Tempt` → real Suasio action; append resolved outcome to the log |
| `PcWindow` → `PcProgram` | Depraedatio businesses, Decimatio/Indagatio actions, Emptio market, achievements, log feed |

Because your `packages/sim` already holds the authoritative catalogs
(`maleficia.ts`, invocations, sigils, businesses…), most of this is repointing the
`import` in `menus.data.ts` at real selectors and deleting the stand-in arrays.
Keep `types.ts` as the adapter shape, or map your entities to it.

## Step 5 — Drop the prototype-only bits

- **Tweaks panel** (`tweaks-panel.jsx`, the `useTweaks` calls) — dev scaffolding, not shipped.
- **Mock HUD numbers**, the `EDITMODE` tweak defaults, the data-URI `backgrounds.css`.

---

## Notes & gotchas

- **No scrollbars by design.** The Altar, Maleficia, Ars Goetia and Katabasis are
  fixed-layout; Maleficia hides its overflow bar (`scrollbar-width:none`). If you
  add many more items, paginate rather than re-enabling a bar.
- **Fonts.** The menus use *Cinzel*, *EB Garamond*, *IM Fell English / SC*
  (manuscript) and *Ubuntu / Ubuntu Mono* (the PC). Load these (you're free to
  self-host); the prototype pulled them from Google Fonts.
- **Full-screen shells.** Ars Goetia, the PC and Katabasis render their own
  `position:fixed` overlay and intentionally do **not** use `PanelShell`.
- **Hold-to-pour.** `useHold` ramps the repeat rate; it uses pointer events and
  `touch-action:none`, so it works on touch too.
- The class vocabulary in `menus.css` matches the component `className`s 1:1, so
  you can restyle by class without touching TSX.

Open `Panvitium Rooms.html` side-by-side while integrating — it's the canonical
reference for how each screen should look and behave.
