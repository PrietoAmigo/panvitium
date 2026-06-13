# Handoff: Maleficia Shelf — “Niches” rework

## Overview
A visual rework of the **Maleficia Shelf** panel in Panvitium. The shelf is now a
wall of carved **niches**: each owned maleficium sits in a recessed alcove in the
black, lit from within by the colour of its rarity. Clicking a niche opens a
full-bleed close-up (large relic in an ember halo, with name, rarity, flavour,
effect, the single-use **Use** rite, and the oracular **odds reveal**). Items are
shown **ordered by rarity**, anathema → common.

This replaces the previous “glass specimen cabinet” look. Nothing about the data
or game logic changes — only the presentation of the existing
`MaleficiaCabinet` component.

## About the design files
The files in this bundle are **design references / a drop-in implementation**, not
a throwaway prototype:

- `MaleficiaCabinet.tsx` — a **production-ready, drop-in replacement** for
  `apps/web/src/menus/MaleficiaCabinet.tsx`. It keeps the exact same public
  contract (`{ items, onUse }`), imports your real `strings` and your
  `Maleficium` / `OracleGroup` / `Rarity` types, and is styled entirely with
  inline styles (no CSS file needed).
- `Maleficia — Niches.dc.html` — the original design source (HTML prototype) the
  component was built from, for visual reference. The `*.dc.html` format is our
  design tool’s; it is **reference only**, not meant to ship.

The task on your side is to drop the `.tsx` in, confirm it compiles against your
types, and adjust the panel chrome (see **Integration** below).

## Fidelity
**High-fidelity.** Exact colours, typography, spacing and interactions are
specified below and already encoded in `MaleficiaCabinet.tsx`.

## Screens / views

### 1. The niche grid (default)
- **Purpose:** browse owned maleficia; pick one to inspect.
- **Layout:** `display:grid; grid-template-columns: repeat(6, 1fr); gap:10px`
  inside a panel with `padding:22px 24px 28px` and a dark radial background
  (`radial-gradient(140% 90% at 50% 0%, #131119 0%, #09080c 60%, #040305 100%)`).
- **Niche cell (button):**
  - `height:138px`, `border-radius:5px`, `border:1px solid rgba(0,0,0,.7)`,
    `overflow:hidden`, column layout, content bottom-aligned.
  - Background `linear-gradient(180deg,#0c0b10,#070609)`.
  - **Carved-alcove shadow (the key effect):**
    `box-shadow: inset 0 9px 20px rgba(0,0,0,.95), inset 0 -22px 26px <rarity-wash>, inset 0 1px 0 rgba(255,255,255,.04)`
    — a deep top shadow (carved into the wall) plus the rarity ember rising from
    the floor of the niche.
  - **Relic image:** `max 74×84px`, `object-fit:contain`, `opacity:.9`,
    `filter: drop-shadow(0 4px 8px rgba(0,0,0,.8)) drop-shadow(0 0 6px <rarity-ember>)`.
    Items with no art (`img === ''`) fall back to a dashed-border text label.
  - **Bottom plate:** name (IM Fell English, 10.5px, `#b3acc4`) + a rarity dot
    (`<rarity-ember>`) and the rarity word (Cinzel, 7.5px, `.14em`, uppercase,
    `#6a637a`). The name already carries the `×N` stack count (baked in by
    `buildCabinet`).
  - **Markers:** single-use items show a red dot top-left (`#c2403f`, glowing);
    oracular items show a teal `✦` (`#54b39b`) top-left.
  - **Hover:** ember intensifies and spills outward —
    `box-shadow: inset 0 9px 20px rgba(0,0,0,.9), inset 0 -30px 34px <wash>, 0 0 18px <wash>`
    and `border-color: <rarity-ring>`.

### 2. The close-up (overlay on select)
- **Purpose:** inspect one maleficium and act on it.
- **Layout:** absolutely positioned over the panel (`position:absolute; inset:0`),
  dark scrim (`radial-gradient(circle at 36% 45%, rgba(10,8,14,.86), rgba(3,2,4,.97))`),
  centred. Inner row: `display:flex; gap:76px; max-width:720px`.
  - **Left (relic), `flex:0 0 196px`, `height:280px`:** the relic at up to
    168×248px with `drop-shadow(0 0 18px <ember>)`, behind it a soft ember disc
    (228px, `radial-gradient(circle, <wash>, transparent 66%)`) and a 248px ring
    (`1px solid <ring>`).
  - **Right (text), `flex:1`:** “‹ back to the niches” link; rarity eyebrow
    (Cinzel 10px, `.3em`, `<ember>`); name (Cinzel 25px, `#e6e0f0`); flavour
    (IM Fell English italic 15.5px, `#a39bb4`); effect (Cinzel 13.5px, `<ember>`,
    with a top rule). The **76px gap keeps all text/buttons clear of the relic’s
    glow circle** — this was an explicit requirement; keep it.
  - **Use rite (consumables only — `item.use` present):** optional status line
    (italic, `#9a7d6a`) above a button. Button: Cinzel 12px uppercase, text
    `#e6e0f0`, `background rgba(124,20,23,.18)`, `border 1px solid #7c1417`. When
    `use.enabled === false`, render disabled (opacity .55, not-allowed).
  - **Odds reveal (oracular only — `item.reveal` present):** caption
    (`strings.maleficia.oracleCaption`), a tier legend, then per category a row
    per action with a 7-segment odds bar (segment width = `pct*100%`, colour by
    tier id — see tokens). Mirrors the previous cabinet’s `OracleReveal`, restyled.

## Interactions & behavior
- **Select:** click a niche → `setSel(item.id)` → overlay.
- **Close:** “‹ back to the niches” → `setSel(null)`.
- **Use:** click the Use button → `onUse?.(item.id)` (same handler the panel
  already wires for Hand of Glory / Defixio). Selection is tracked **by id**, so
  consuming the last copy of the open item can’t leave the detail pointing at a
  different specimen.
- **Hover:** per-niche ember bloom + ring border (handlers in the component).
- No animations are required. (The HTML reference uses a subtle ember-pulse and a
  fade-in on the overlay; both are optional polish — re-add with CSS keyframes if
  wanted. They were intentionally left out of the `.tsx` to keep it dependency-free.)

## State management
- Local only: `const [sel, setSel] = useState<string | null>(null)`.
- No new store fields, selectors, or sim work. `items` come from the existing
  `buildCabinet(state)` adapter; `onUse` is the existing activation callback.
- Display order is derived (`[...items].sort(by rarity rank desc)`) — purely
  presentational. Remove the sort if you’d rather preserve acquisition order.

## Design tokens

**Rarity → ember (hue per tier):**
| rarity   | ember     | wash (glow)             | ring (hover border)     |
|----------|-----------|-------------------------|-------------------------|
| common   | `#caa85f` | `rgba(202,168,95,.22)`  | `rgba(202,168,95,.30)`  |
| rare     | `#54b39b` | `rgba(84,179,155,.22)`  | `rgba(84,179,155,.32)`  |
| profane  | `#c2403f` | `rgba(194,64,63,.26)`   | `rgba(194,64,63,.34)`   |
| anathema | `#9a6fe0` | `rgba(154,111,224,.26)` | `rgba(154,111,224,.34)` |

**Outcome-tier colours (odds bars), best → worst:**
`stellar #e8c75a · excellent #9fbf7a · good #6aa37e · neutral #7a7388 · bad #b0742e · terrible #9c2f24 · apocalyptic #7c1417`

**Surfaces:** panel bg `radial-gradient(140% 90% at 50% 0%, #131119, #09080c 60%, #040305)`;
niche bg `linear-gradient(180deg,#0c0b10,#070609)`; overlay scrim
`radial-gradient(circle at 36% 45%, rgba(10,8,14,.86), rgba(3,2,4,.97))`.

**Type:** display `Cinzel`; flavour/labels `IM Fell English` / `IM Fell English SC`;
body `EB Garamond`. (All already loaded in the app.) Key sizes: niche name 10.5px,
rarity tag 7.5px, detail name 25px, flavour 15.5px, effect 13.5px.

**Geometry:** niche `138px` tall, `5px` radius, `10px` grid gap, 6 columns;
detail relic column `196px` wide / `280px` tall, **`76px` gap** to text, content
`max-width 720px`.

## Assets
No new assets. The component uses `item.img` exactly as `buildCabinet` supplies it
(the design art under `apps/web/public/assets/panvitium/maleficia/*.png`). Items
whose `img` is `''` render the text fallback, as today.

## Integration
1. **Replace** `apps/web/src/menus/MaleficiaCabinet.tsx` with the bundled file.
   Imports already match (`strings` from `@panvitium/shared`; `Maleficium`,
   `OracleGroup`, `Rarity` from `./types.js`). Confirm `Rarity` is exported from
   `types.ts` (it is).
2. **Panel chrome:** the old cabinet was wrapped by `PanelShell variant="cabinet"`
   (the wooden display-case frame; see `App.tsx` → `panelChrome.maleficia`). The
   niches paint their **own** dark background, so the wooden frame will fight it.
   Either switch `maleficia` to a plain framed variant, or keep `hideHeader` and
   give it a neutral/dark shell. Pick whichever matches the room’s other panels.
3. **Old CSS is now dead:** the `.mal-cabinet`, `.mal-case*`, `.mal-detail*`,
   `.rarity-*`, `.oracle*` rules in `menus.css` are no longer referenced by this
   component. Safe to delete once the swap is verified (leave them if other panels
   reuse `.rarity-*` / `.oracle*`).
4. The existing test `e2e/smoke.spec.ts` opens the dialog by the “Maleficia Shelf”
   button and asserts no render loop — unaffected; this is a pure presentation swap.

## Files
- `MaleficiaCabinet.tsx` — drop-in replacement component (this is the deliverable).
- `Maleficia — Niches.dc.html` — original design source (HTML), visual reference only.
