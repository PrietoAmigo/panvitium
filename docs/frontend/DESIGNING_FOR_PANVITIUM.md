# Designing for Panvitium — a frontend handoff guide

_For Claude Design. The goal of this document is to make the things you produce drop into the
Panvitium codebase with as little rewiring as possible. Everything below comes from integrating a
real handoff: where it went smoothly, and where it needed rework. Follow it and a handoff becomes
mostly "place the files, point a few props at real state" instead of "rebuild each component."_

---

## 1. What you are designing into

Panvitium is a dark incremental/idle game built as a TypeScript monorepo. The frontend lives in
`apps/web` and is **React 18 + TypeScript (strict) + Zustand + Vite**. The game logic is **not** in
the frontend — it lives in `packages/sim` (a pure functional core: the catalogs, the economy, the
tick) and is surfaced through a Zustand store (`apps/web/src/store/gameStore.ts`). Display copy lives
in a shared strings table (`packages/shared`).

The single most important consequence: **the sim is the source of truth for every number, gate,
name, level, and cost.** Your job is the _look_ and the _interaction shape_ — the rooms, the panels,
the framing, the flavour. The integrator's job is to feed your components real values from the sim.
Design accordingly and the seam between the two is clean.

The world is three rooms — `invocation`, `altar`, `studio` — each with clickable hotspots that either
walk to another room or open a panel. The panels are the diegetic menus (the Ars Goetia grimoire, the
Altar, the Katabasis descent, the Maleficia cabinet, the Suasio scroll, the PC).

---

## 2. The golden rule: presentational and prop-driven

**A component should receive its data through props and render it. It should not import mock catalogs,
hold game data in local state, or compute game values itself.**

Last handoff, every component imported its own stand-in arrays (`SINS`, `MALEFICIA`, `SIGILS`, …) and
read from them directly. Each one then had to be rewritten to accept that data as a prop before it
could show real values. If instead each component had taken, say, `sins: Sin[]` and `boundSigils:
BoundSigil[]` as props, integration would have been a one-line wiring step.

Concretely:

- Components take **data in, callbacks out**. `<AltarPanel sins={…} boundSigils={…} onDescend={fn}/>`,
  not `<AltarPanel/>` that reaches into a mock.
- Keep a `types.ts` of the **presentation shapes** your components consume (this was done well last
  time — keep doing it). These are the contract the integrator fills.
- Use your mock catalogs only to **render a preview** of the component in isolation, and keep them in
  one obviously-named file (`menus.data.ts`) so they're easy to identify and delete. Treat them as a
  storybook fixture, never as the component's real source.
- Don't subscribe to global state inside a presentational component, and don't build derived
  arrays/objects to hand to children inside a state selector — let the integrator own that. (On the
  Zustand side, a selector that returns a freshly-built array on every call causes an infinite render
  loop; keeping components prop-driven keeps that hazard out of your output entirely.)

---

## 3. Component archetypes: say which shell each screen wears

There are exactly two kinds of screen, and **every screen you design must declare which it is.** This
was the single biggest source of a visible bug last time — a panel shipped without saying it needed a
themed shell, so it rendered in a plain frame and lost its background.

**(a) Framed panels** render _inside_ the shared `PanelShell`, which supplies the themed backdrop,
the dialog framing, and the close affordance. `PanelShell` takes a `variant`:

| Variant     | Backdrop                | Used by             |
| ----------- | ----------------------- | ------------------- |
| `stone`     | engraved tombstone slab | the Altar           |
| `cabinet`   | dim wooden display case | the Maleficia shelf |
| `scroll`    | aged parchment          | the Suasio scroll   |

A framed panel's component renders **only its body** (the content that goes inside the shell). It must
**not** draw its own overlay/background. In the handoff, state plainly: _"renders inside `<PanelShell
variant="stone" hideHeader />`."_ If you invent a new variant, ship its CSS in the stylesheet and name
it in the handoff.

**(b) Full-screen overlays** render their _own_ shell — their own `.panel-overlay`, titlebar/close,
and background. The Ars Goetia grimoire, the Katabasis descent, and the PC file-manager are these.
These are self-contained; they don't use `PanelShell`. Say so explicitly: _"full-screen; renders its
own shell; takes `onClose`."_

Rooms are a third, simpler case: a backdrop plus positioned hotspots (see §7).

---

## 4. Separate flavour from mechanics

Your output carries **flavour** the game has nowhere else: illustrations, lore, rank numerals, the
exact wording of a scroll. The sim carries **mechanics**: real names, gates, costs, levels, counts,
outcomes. The integrator merges them. Make that merge easy and safe:

- **Use the canonical IDs.** Key everything by the same ids the sim uses, so a merge is a lookup, not
  a guess:
  - invocations: lowercase ids (`imp`, `upir`, `harpy`, `fama`, `nightmare`, `behemoth`, …)
  - sins: the eight keys `gula luxuria avaritia tristitia ira acedia vanagloria superbia`
  - sigils: the numbers `1`–`72`
  - maleficia: their string ids (`ars_serpens`, `ritual_dagger`, …)
  - rooms: `invocation altar studio`; panels: `ars-goetia altar-menu maleficia suasio pc`
- **Do not invent or hard-code mechanical values.** Gates, soul costs, Devotion thresholds, effect
  magnitudes, level math — these come from the sim and change with economy tuning. If a prototype
  needs a number to render, mark it clearly as a placeholder (a comment, or a `placeholder: true`
  flag) so it's obvious it must be replaced, and never reimplement a game rule (e.g. "level = base +
  floor(poured / 60)" was a guess that diverges from the real `sinLevel` curve).
- **Don't reword final copy.** The app has a canonical strings table; where a label already exists
  there, the integrator will use it. Keep your placeholder copy clearly placeholder, and reserve your
  authored prose for genuinely new flavour (intros, lore) — and flag that too, so it can be
  reconciled with the rest of the writing.
- **Cover the full roster, or mark the gaps.** Last time the design illustrated 6 of 18 invocations
  and 22 of 25 maleficia. That's fine — but the integrator had to invent fallbacks. Make it explicit:
  ship art for everything you can, list which ids are illustrated, and design the component so a
  missing illustration degrades gracefully (a text label, a generic seal) rather than breaking.

A good mental model: your component should render correctly given _real data it has never seen_,
including ids you didn't illustrate and numbers larger than your mock used.

---

## 5. Interaction patterns: assume the numbers are huge

Resources in Panvitium are **big numbers** (an explicit bignum type) — souls, gold, and influence can
grow far past ordinary integers. Design interactions that survive that:

- **Press-and-hold to pour/spend must ramp the _amount_, not just the cadence.** A control that adds
  `+1` per tick (even at an accelerating tick rate) is unusable once a player has 10^20 souls. Either
  ramp the per-step amount exponentially, or — better — expose the step as a callback the integrator
  drives: `onStep(delta: number)`. Don't bake "+1" into the component.
- **Don't display raw numbers; expect a formatter.** Values arrive already formatted as strings (the
  app abbreviates large magnitudes). Your component shows the string it's given; it shouldn't
  `toLocaleString` a number itself.
- **Two-tap / arm-then-confirm** for destructive or committal actions (the descent is committal) is a
  good pattern and integrated cleanly — keep using it. Keep the confirm state local; it's UI-only.

---

## 6. State and data flow

- Components are **pure functions of their props** plus local _UI-only_ state (which tab is open,
  whether a button is armed, which item is selected). That kind of state stays in the component.
- **Game state never lives in the component.** No counters of souls, no "owned" sets, no Devotion
  totals held in `useState`. Those come from props each render.
- Callbacks are how the component asks the game to change: `onSummon(id)`, `onDescend()`,
  `onTempt()`, `onStep(delta)`. Name them for the intent, and let the integrator bind them to store
  actions.

This keeps the component trivially testable, makes the integrator's wiring a thin adapter, and avoids
the state-subscription hazards entirely.

---

## 7. Styling conventions

- **Reuse the app's class vocabulary.** The handoff stylesheet shared class names with the existing
  app (`.app`, `.hud`, `.stage`, `.scene`, `.hotspot`, `.panel`, …), which let it cleanly supersede
  the placeholders when imported after the base stylesheet. Keep doing this — don't rename shared
  classes.
- **One stylesheet, imported once.** Ship a single CSS file the integrator imports a single time.
  Avoid inlining large data-URI assets into CSS.
- **Asset paths are absolute and served from `public/`.** Use a single `ASSET_BASE` constant
  (`/assets/panvitium`) and reference everything as `url('/assets/panvitium/…')` or
  `` `${ASSET_BASE}/…` ``. Vite serves these at runtime; never use relative `../assets` paths or
  bundler imports for these plates.
- **Ship variant classes for every shell** you reference (`.panel--stone`, `.panel--cabinet`,
  `.panel--scroll`, and any new ones), and the full-screen shell classes for the overlays.
- **Alternate room/asset states need a defined trigger.** You can ship a "clean" and a "complete"
  (`*_complete.png`, styled via `.furnished .scene-*`) plate per room — but if you do, **tell the
  integrator when each state applies.** Last time the furnished plates shipped with no rule for when a
  room becomes furnished, so they went unused. Either drive it from a prop (`furnished: boolean`) and
  say what game condition should set it, or leave it out.

---

## 8. TypeScript and code conventions

The repo is strict. Matching these up front avoids a pass of mechanical fixes:

- **`strict` mode**, including `exactOptionalPropertyTypes` (don't pass `undefined` to an optional
  prop — omit it, e.g. `{...(flag ? { hideHeader: true } : {})}`) and `noUncheckedIndexedAccess`
  (indexing an array/record yields `T | undefined`; guard it — `const m = items[i]; if (m) {…}`).
- **`verbatimModuleSyntax`**: type-only imports must use `import type { Foo }`.
- **Relative imports carry an explicit `.js` extension** (`./types.js`, `../game/altar.js`) even
  though the source is `.ts/.tsx`. This is the repo convention; match it.
- **React 18 with the automatic JSX runtime** — you don't need to `import React`. Components are
  functional; export them named.
- **No `localStorage`/`sessionStorage`** or other browser-storage APIs in components; state is lifted.
- **Prettier** formats the repo. Don't fight it; the integrator runs `--write`, but matching its
  defaults (2-space, single quotes, trailing commas, ~100 cols) keeps diffs small.
- Provide a **barrel `index.ts`** that re-exports the components and the presentation types.

---

## 9. Accessibility and test hooks

The app is checked with end-to-end tests that select elements by their **accessible name**, so stable
semantics matter:

- Dialogs use `role="dialog"` with an `aria-label` (the panel title). `PanelShell` does this for
  framed panels; full-screen overlays must do it themselves.
- Every icon-only or glyph button (close, nav arrows, hold buttons) needs an `aria-label`.
- Keep hotspot and door **labels human-readable and stable** ("The Altar", "To the Invocation Room",
  "Maleficia Shelf"). Tests and players both rely on them; renaming one silently breaks a test.

---

## 10. Handoff packaging

The last handoff's shape was genuinely good — keep it:

- A `port/` directory of the **TypeScript** components (already strict, already `import type`, already
  `.js` extensions), ready to drop into `apps/web/src/menus/`.
- A `types.ts` of presentation shapes and a barrel `index.ts`.
- The single stylesheet, with variant/shell classes.
- The assets under the `assets/` tree mirroring `public/assets/panvitium/…`.
- An `INTEGRATION.md` that maps each piece. Make that map richer than prose — a table per component is
  ideal:

  | Component | Shell | Props in | Callbacks out | Real vs flavour | Notes |
  | --- | --- | --- | --- | --- | --- |
  | `AltarPanel` | `PanelShell variant="stone" hideHeader` | `sins`, `boundSigils` | `onDescend` | levels/Devotion real; copy is flavour | two-tap descend |
  | `Katabasis` | full-screen (own shell) | — (live model) | offer/bind/ascend | all mechanics real | hold ramps amount |

  For every prop, say whether it's **real** (comes from the sim/store) or **flavour** (you supply it),
  and mark each wiring seam with a `TODO(wire)` in the code so they're greppable.

---

## 11. A per-component contract (copy this into the handoff)

For each component, fill in:

```
Component:        <name>
Archetype:        framed panel (PanelShell variant=___ , hideHeader?) | full-screen overlay | room view
Props (data in):  <name: Type>  — for each, REAL (from sim/store) or FLAVOUR (design-supplied)
Callbacks (out):  <onX(args)>   — the intent each expresses
Local UI state:   <what stays inside the component>
IDs keyed by:     <invocation id | sin key | sigil number | maleficium id | …>
Assets:           <list>, all under /assets/panvitium/…; fallback when an id has no art: <how>
Placeholders:     <any number/label that is a stand-in and MUST be replaced>
A11y:             <roles, aria-labels, stable text labels>
```

---

## 12. Anti-patterns that caused rework last time

A short list to check against before shipping:

- A component that **imports its mock catalog and renders from it directly** (instead of taking props).
- A framed panel that **doesn't say which `PanelShell` variant** it needs — or draws its own
  background when it should use the shell.
- A hold/press control that adds a **fixed `+1`** per step (breaks at large magnitudes).
- **Reimplementing a game rule** in the component (level curves, cost formulas) instead of taking the
  computed value as a prop.
- **Invented mechanical numbers** (gates, costs) presented as if final, with no placeholder marker.
- **Shipping alternate visual states** (furnished rooms) with **no trigger** for when they apply.
- IDs that **don't match the sim's** (so the merge can't be a lookup).
- Type-only imports without `import type`; relative imports without `.js`; passing `undefined` to
  optional props.

---

_If you follow §2 (prop-driven), §3 (declare the shell), and §4 (flavour vs mechanics keyed by real
ids), the rest is mostly mechanical. Those three are where the time goes._
