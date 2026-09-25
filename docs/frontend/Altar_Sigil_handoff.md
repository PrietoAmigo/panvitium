# Handoff: Altar sigil (in-room Katabasis trigger + Status Quo shortcut)

## Overview
This replaces the full-screen **Altar gate** (`AltarGate` in `apps/web/src/menus/Katabasis.tsx`: title, lone sigil, "Unfocus" / "Status quo" buttons) with a small overlay **inside the Altar Room**. When the player clicks the altar, the Katabasis sigil shows up vibrating over the room, and the words "STATUS QUO" appear at the bottom of the stage. The room is **not** darkened or replaced.

## About the Design Files
`Altar Sigil.dc.html` is a **design reference built in HTML**. It is a prototype of the intended look and behavior, not production code. Recreate it in the Panvitium web app (`apps/web`, React + Zustand, class-based CSS in `menus.css`) using that codebase's existing patterns. Wherever possible, reuse the classes and keyframes that already exist (`kat-seal-*`, `transit*`, `ledger*`). The prototype inlines them only because of how it was authored.

## Fidelity
**High-fidelity.** Every visual value comes from `menus.css` (the `.katabasis-flow` altar-gate / sigil / transit / ledger rules). Two deliberate changes: the seal's glow is a slightly darker red (see Tokens), and the "STATUS QUO" label style is new.

## Behavior (state machine)
Add a local phase to the Altar Room layer (App or RoomView):

```
off ──click altar──▶ shown ──click sigil──▶ armed ──click sigil──▶ DESCEND
 ▲                    │  └─click STATUS QUO──▶ ledger (Status Quo page)
 │                    │
 └──── idle timeout (4 s) ── fade 0.5 s ──────┘  (from shown OR armed)
```

- **off → shown**: clicking the altar hotspot (`{x:37,y:48,w:26,h:35}` %) no longer calls `openKatabasis()` right away. It shows the overlay and starts the idle timer. Clicking the altar again while shown restarts the timer.
- **shown**: the sigil is centred on the stage and runs the idle animations. "STATUS QUO" sits at the bottom.
- **shown → armed** (click the sigil): "STATUS QUO" is removed and the sigil switches to the armed animations (bigger and shaking harder, the same as the current `.kat-seal-wrap.is-armed`). The idle timer restarts.
- **armed → descend** (click the sigil again): this triggers Katabasis. In production, call `openKatabasis()` followed by `beginKatabasis()` (or add a store action that does both), then play the existing `Transition kind="descending"` ("Katabasis" / "You lie still upon the altar; the soul slips and goes through the worn path.") and go on to the statues, the same way `AltarGate.onDescend` does now. The prototype returns to the room after the transition only as a stand-in.
- **STATUS QUO click**: opens the Status Quo page (the existing `Ledger`). Its "Return to the altar" button must now go back to the **Altar Room** (close the Katabasis flow), because the gate screen no longer exists.
- **Idle timeout**: if neither the sigil nor STATUS QUO is clicked for **4000 ms** (the same value as the current auto-disarm), the whole overlay fades out (opacity 1→0, 0.5 s ease) and the phase returns to `off`. This applies in both `shown` and `armed`.
- Clicking a door hotspot cancels the overlay immediately.
- The overlay layer uses `pointer-events: none`, and only the sigil button and the STATUS QUO button take pointer events, so the room hotspots keep working.
- Fade-in when the overlay appears: opacity 0→1, 0.35 s ease.
- Honour `prefers-reduced-motion`: drop the vibration keyframes and keep the static glow.

The `AltarGate` component, "Unfocus", and the gate's title/fog/embers are no longer reached from the room. Remove them, or keep them unused.

## Layout / components (inside `.stage`, 16:9, max 1280 px)

### Sigil
- Wrapper: `position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width/height: min(360px, 46vh); display:grid; place-items:center;` (the same as `.kat-seal-wrap`), with z-index above the hotspots.
- Button: no background or border. `transition: transform .28s cubic-bezier(.2,.7,.3,1)`, hover `scale(1.06)`, active `scale(.95)`.
- Scale span: idle `kat-seal-pulse 3.4s ease-in-out infinite`; armed `kat-seal-pulse-armed 1s ease-in-out infinite` (scale 1.55↔1.78).
- Glyph `<img src="/assets/panvitium/katabasis/seal-panvitium.png">`: `width: clamp(150px, 30vw, 240px)`.
  - idle: `kat-seal-vibe 0.12s linear infinite, kat-seal-breathe 3.4s ease-in-out infinite`
  - armed: `kat-seal-vibe-strong 0.07s linear infinite, kat-seal-breathe-armed 1s ease-in-out infinite`
- aria-labels: "Press the sigil" (idle) and "Confirm the descent — there is no return" (armed).

### STATUS QUO label (new)
- A full-width row at `bottom: 2.4rem` with the text centred, and a `<button>` inside it.
- Copy: `Status Quo`, rendered uppercase.
- Cinzel 600, 1.05rem, letter-spacing .22em (add `padding-left: calc(1.2rem + .22em)` to keep it optically centred), padding .6rem 1.2rem, no background or border.
- Colour `#ffd9cf`; text-shadow `0 0 18px rgba(140,24,22,.9), 0 2px 6px #000`.
- Hover: colour `#fff1ea`, text-shadow `0 0 22px rgba(255,90,60,.85), 0 0 8px rgba(255,90,60,.5), 0 2px 6px #000`; transition .18s.
- Entrance: `kat-sq-in .7s ease both` (opacity 0→1, letter-spacing .36em→.22em).

### Room
The room is unchanged: the degraded canvas plate, hotspots and door glyphs as they are today. **No dim or scrim** is added under the sigil.

## Design tokens / keyframes
Darker seal glow. These replace the colours in `kat-seal-breathe` and `kat-seal-breathe-armed`:

```css
@keyframes kat-seal-breathe {
  0%,100% { filter: drop-shadow(0 0 12px rgba(215,50,30,.8)) drop-shadow(0 0 28px rgba(195,35,22,.4)); }
  50%     { filter: drop-shadow(0 0 24px rgba(230,70,42,1)) drop-shadow(0 0 50px rgba(205,45,28,.75)); }
}
@keyframes kat-seal-breathe-armed {
  0%,100% { filter: drop-shadow(0 0 28px rgba(230,70,42,1)) drop-shadow(0 0 64px rgba(205,40,25,.9)); }
  50%     { filter: drop-shadow(0 0 46px rgba(240,90,55,1)) drop-shadow(0 0 110px rgba(215,50,30,.95)); }
}
@keyframes kat-sq-in  { from { opacity:0; letter-spacing:.36em } to { opacity:1; letter-spacing:.22em } }
@keyframes kat-ov-in  { from { opacity:0 } to { opacity:1 } }
@keyframes kat-ov-out { from { opacity:1 } to { opacity:0 } }
```
`kat-seal-vibe`, `kat-seal-vibe-strong`, `kat-seal-pulse` and `kat-seal-pulse-armed` stay exactly as they are in `menus.css`.

Because the overlay now lives in the room layer, which sits outside `.katabasis-flow`, move or duplicate the needed `kat-seal-*` rules so they aren't scoped only to `.katabasis-flow`.

## State
- `altarSigil: 'off' | 'shown' | 'armed' | 'fading'`, local UI state (not persisted, no save change).
- One idle timeout and one fade timeout, both cleared on every transition and on unmount.
- The Status Quo page and the descent keep using the existing store (`katabasisPhase`, `openKatabasis`, `beginKatabasis`, `closeKatabasis`). Opening Status Quo straight from the room needs an entry point into the flow on the `ledger` screen, for example `openKatabasis({ screen: 'ledger' })`.

## Tests to update
`apps/web/src/menus/Katabasis.test.ts` currently asserts `.altar-title`, two `.altar-action` buttons, and the gate → ledger → gate round trip. Retarget these at the new room overlay: altar click shows the sigil and STATUS QUO; sigil click arms it and hides STATUS QUO; a second click begins the descent; STATUS QUO opens the ledger; the ledger's back button returns to the room; the idle timeout hides everything (use fake timers).

## Assets
- `assets/seal-panvitium.png` (from `apps/web/public/assets/panvitium/katabasis/seal-panvitium.png`)
- `assets/altar_0acolytes.png` (from `…/backgrounds/altar_by_acolytes/169_altar_clean_0acolytes.png`). Used in the prototype only; production uses the degraded canvas.

## Files
- `Altar Sigil.dc.html`: the interactive prototype (room + overlay + descent transition + Status Quo page with sample data). Open it in a browser.
