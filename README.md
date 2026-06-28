# Panvitium

A dark-themed incremental / idle game. The player — a human already damned — corrupts and culls
human souls to climb Hell's hierarchy across many descents (_Katabasis_).

Design documents and architecture decisions live alongside this repo in the project knowledge base
(`01`–`04`). This repository is the implementation, structured per **ADR-015** (pnpm monorepo). When
a number and a doc disagree, `Panvitium_Economy_Template.xlsx` wins; when a behaviour and a doc
disagree, the relevant ADR wins.

## Repository layout

```
panvitium/
├── apps/
│   ├── web/          # React SPA — the game itself (ADR-001/002/003)
│   └── api/          # Fastify backend — accounts, save sync (ADR-007/008/009)
├── packages/
│   ├── shared/       # Wire-format types, save schema, migrations (ADR-010/023)
│   └── sim/          # Pure-functional game math, framework-free (ADR-004/005/022)
├── compose.yaml          # Base dev stack: postgres + migrate + api + web
├── compose.override.yaml # Dev overrides: bind mounts, host ports, watch mode
├── Dockerfile
├── eslint.config.js
├── tsconfig.base.json
├── package.json
└── pnpm-workspace.yaml
```

`packages/sim` and `packages/shared` are **internal source packages** (ADR-015): their
`package.json` points `main`/`types` at `src/index.ts` and they emit no build output. The apps bundle
their source directly (`apps/web` via Vite, `apps/api` via tsup), and tests run against source. There
are no per-package `dist/` directories to keep in sync.

## Prerequisites

- **Node.js 22 LTS** — `.nvmrc` pins the major version (`nvm use` to switch)
- **pnpm 9.x** — enable via `corepack enable && corepack prepare pnpm@9.15.0 --activate`
- **Git**
- **Docker** (optional) — only needed for the full-stack dev environment and the API/database

## Setup

```bash
git clone <your-repo-url> panvitium
cd panvitium
pnpm install                       # installs deps and wires the Husky pre-commit hook
pnpm --filter @panvitium/web dev   # the game alone, at http://localhost:5173
```

The web app is fully playable on its own — it persists to `localStorage` and runs offline as a
first-class case (ADR-006). The API and database are only required for accounts and cross-device
cloud save, which the client now wires through end-to-end (sign-in, magic-link, automatic sync on
persist, and the ADR-010 conflict chooser).

## Common scripts

| Command             | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `pnpm dev`          | Run all packages in watch mode (parallel)                  |
| `pnpm build`        | Build the apps (`sim`/`shared` are typechecked, not built) |
| `pnpm typecheck`    | `tsc --noEmit` across all packages                         |
| `pnpm test`         | Run the full Vitest suite                                  |
| `pnpm lint`         | ESLint over the repo                                       |
| `pnpm lint:fix`     | ESLint with auto-fix                                       |
| `pnpm format`       | Format with Prettier                                       |
| `pnpm format:check` | Verify formatting without writing                          |

Per-app scripts of note: `pnpm --filter @panvitium/web e2e` (Playwright, against a preview build;
run `e2e:install` first to fetch the browser), and `pnpm --filter @panvitium/api db:generate` /
`db:migrate` (Drizzle migrations).

### Verification gate

Before every commit, the whole chain must be green — CI enforces the same set:

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
```

### Full-stack dev with Docker (optional)

```bash
docker compose up        # postgres + one-shot migrate + api (watch) + web (Vite dev)
```

Uses Compose v2 (`docker compose`, no `version:` key). Migrations run as a one-shot service that the
API waits on. On Debian/Ubuntu install Docker from the official apt repo — the distro package lacks
the v2 compose plugin.

## TypeScript strictness

`tsconfig.base.json` enables `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` on top of
`strict`. These are deliberately stricter than most React projects ship with — they catch real bugs
in the modifier-stacking math (ADR-001). Indexing an array or record yields `T | undefined`; handle
it. A leading underscore marks an intentionally unused binding. If a third-party type definition
becomes unbearably noisy, loosen one of those two flags rather than `strict` as a whole.

## Status

> **This section is the authoritative progress log** — what has shipped, the current test count,
> and what remains. It is updated with **every release tarball** (the README ships in the overlay
> whenever progress moves). The engineering skill intentionally does **not** track progress, to
> avoid drift; this is the single source of truth for "what's done / what's next."

**Current test count: 878** (sim 536 · shared 60 · api 20 · web 262).

> **Latest change — the Altar gate no longer freezes time (only the committed descent does).**
> Opening the in-room Altar to its full-screen gate (and the "Status Quo" Ledger behind it) used to
> suspend the tick the instant it appeared, because the store froze on any non-null `katabasisPhase`.
> It now keeps ticking there: the lifetime is still `inKatabasis === false` and the soul is not yet
> under, so suicides, Mercatus gold, and soul minting all keep landing while the player browses the
> gate. The trance begins only once the descent is **committed** (`beginKatabasis` sets
> `inKatabasis`) and the player is down among the Princes / Goetia seals; the recap and the launch
> title menu still freeze as before. `gameStore.advance` now keys its freeze off `inKatabasis` rather
> than the menu merely being open — no sim, save, or RNG change. A new web store test pins that the
> gate keeps ticking while the committed descent stays frozen.
>
> **Earlier change — the smartphone call-in system (Claude Design handoff, "incoming calls").** The
> Studio phone now _receives_ calls, not just dials out. During eligible active play in the Studio —
> even with a menu open, so you hear it ring behind the PC or the dialer — a call arrives roughly
> every **10 minutes** from a weighted bag: the room swaps to the "incoming call" plate and the phone
> vibrates on a 15 s ring window — missing it costs nothing (every incoming call is opportunity-only). Tapping the phone while it rings **answers**,
> taking priority over the dial-out pad, and raises a self-framed full-screen call stage — "the voice
> in the room" — that walks the design's FSM: a recording plays (`speaking`) or a typed line writes
> itself out with speech-cadence pauses (`type`), then the response options stagger in (`ready`);
> picking one lights it, dims the rest, and fades the call out (`done`/`fading`). A generation guard
> keeps a skipped call's stale audio/timer from revealing options into the next. The stage's plates
> render **through the degradation pass** (ADR-021), so the message + options sit above the same
> crushed/pixelated scene as the room. The **18 real calls** of `docs/PANVITIUM-CALLS-IN.md` are wired
> to their recordings in `music/`, joined from `strings.phone.callIn`; the per-class weighted draw
> (49 % buff / 50 % lore / 1 % easter egg) honours once-only lore + easter eggs, a recency cooldown
> (the same call never repeats within 5 calls), and each call's **requirements** (descents, the Fausto
> branch via `flagFCThreatSent` — which makes Succubus/Astiwihad mutually exclusive — and received
> emails). Like the dialer and the email replies, the **choice
> effect is a documented stub** awaiting the calls-in engine (`docs/PANVITIUM-CALLS-IN.md`) — answering
> changes no game state yet. Each take-option's sub-label is **generated from its structured effect**
> (`describeCallInEffects`): a small multiplier reads as "… increases", a ×2/×3 as "doubles"/"triples",
> and a cost is appended as "…, but …" — so the line under an option always reads out its real effect.
> Sim, save shape, and the RNG stream are untouched (the scheduler is UI-level, off `Math.random`).
> Twenty-five web tests pin the catalogue↔strings join, the requirement gate, the
> weighted/once-only/recency selection, the generated effect descriptions, and the stage's FSM, skip,
> and choose cadence.
>
> **Earlier change — Caedes cast time cut to 1 second (tuning override).** The entry cull now casts
> in **1 s** (was 10 s), so the opening Decimatio loop reads as briskly as Suggestion — a documented
> player-request override of the Decimatio sheet's 10 s baseline (mirrors the same override on
> Suggestion). Behaviour-only; the Decimatio UI's duration readout, the auto-repeat cadence, and the
> Imp/Upir background cull all follow the one number in `actions.data.ts`. Tests that pinned the 10 s
> cadence were retimed.
>
> **Earlier change — the Decimatio rite `caedis` → `caedes` (Latin-consistency rename).** The
> culling rite formerly identified as `caedis` (the genitive) is now `caedes` (the nominative),
> matching the other rite names (Decimatio, Purgatio). The rename is repo-wide — the action id and
> its derived identifiers (`CAEDES_WEIGHTS`, `resolveCaedes`, `caedesTierDelta`), the display string,
> the Imp/Upir autonomous-runner reference, every test, and the docs. The action id is persisted (in
> `autoRepeat`, the action queue, and acolyte delegations), so this is a save-shape concern: schema
> bumps to **v4** with a `v3-to-v4` migration that rewrites every persisted `caedis` occurrence to
> `caedes` (ADR-023 — old saves keep their queued rite, auto-repeat, and assigned acolytes). Two
> shared migration tests pin the rewrite and its no-op path.
>
> **Earlier change — Decimatio reborn as "The Breathing Dark" (Claude Design handoff).** The
> culling program's PC body is no longer a plain list of action rows; it is now a full-bleed, living
> liturgy — a breathing blood-red heart-glow, two drifting smoke banks, a vignette, and a
> heartbeat-pulsed **Decimatio** title over the creed _Pars pro toto cadat._ A single Reprobates KPI
> sits above three rite cards (**Caedes I / Pogrom II / Purgatio III**) carrying their real catalog
> costs (100 / 1,000 / 1,000,000 g, efficiency-scaled), durations (1s / 60s / 6 min), the acolyte
> stepper, and the
> auto-repeat toggle — all wired to the live store (`act`, `assignAcolyte`/`unassignAcolyte`,
> `toggleAutoRepeat`) with the same gating as before. Purgatio shows a sealed card until **Ira III**.
> The **Index Opervm** ledger is the real player outcome log filtered to this program's rites,
> re-skinned per tier (productive rolls read `{X} (+souls / −reprobates)`, the Church/Higher-Power
> tails read as the rite backfiring). `prefers-reduced-motion` stills the breathing/drift/glow. The
> sim, save shape, and RNG stream are untouched. Three web render tests pin the surface.
>
> **Earlier change — the offline recap reborn as "The Litany" (Claude Design handoff).** The
> welcome-back screen is no longer a centred card; it is now a full-bleed typographic title-card
> that renders the creed of Acedia — **PRAEMIUM _sine_ LABORE** ("reward without labor") —
> monumentally over the oxblood field, with the away-duration as an eyebrow above and a hairline
> tally of net gains at the foot. The store wiring and data contract are unchanged (`offlineRecap`
> read, `dismissOfflineRecap()` on the action); only the markup, copy, and styling changed.
> **Influence is intentionally dropped from the display** (still present in the payload); the tally
> shows Souls, Gold, and Reprobates only, with a blood-red minus for reprobate losses. Styles live
> in a sibling `welcome-back.css`; the old `.welcome-*` rules in `index.css` were removed.
>
> **Earlier change — log-scaled Devotion bars.** The Prince and Eternal (Semet/obelisk) offering
> bars are now **log-scaled** so they visibly fill as souls are poured. Because each Sin rank costs
> 180× the last (and the Eternal gate is ~8.4e9 souls), the old linear fill sat at near-zero for
> almost the whole rank and read as frozen. The new `sinLevelProgress` maps `log₁₈₀(devotion) −
level` within the current rank, and `eternalProgress` maps `log(devotion)/log(threshold)` toward
> the gate, so even small offerings move the bar (the geometric midpoint sits at 50%). Both are
> **display-only** — rank-ups and the reveal are still decided by the exact threshold crossings, so
> saves and the RNG stream are untouched. Five sim tests pin the curve.
>
> **Earlier change — the bound Upir figure (Claude Design handoff).** The **Upir** (a stackable Apex
> Gula shade) now composites into the **invocation room** whenever **at least one is bound** — a
> grounded figure standing on the **right side** of the red ritual circle (no float, no room-dim).
> It is staged like the Succubus but shifted right (`left` 31% → 41%), and carries her exact
> `shadowCast` eased a touch bigger (`length` 0.40 → 0.46, `thickness` 0.13 → 0.15) and 25% more
> opaque (`ink` 0.85 → 1.0, capped at the ceiling); the offset is relative to the feet, so the long
> directional shadow trails left across the floor and **follows the figure**. It is a single
> `BOUND_INVOCATION_VISUALS` entry (`degrade.data.ts`) picked up by `boundVisualsFor` — no engine,
> type, or component change — so the figure and its shadow crush/pixelate with the room at one
> fidelity. The figure art (`invocations/upir.png`) is already in the repo. One render-data test pins
> the visual (room match + the cast-shadow geometry).
>
> **Earlier change — delegated actions are free (acolytes & invocations).** Acolytes and autonomous
> invocation runners (the Familiar's Indagatio, the Imp's Caedes, the Succubus's Imperium, …) now
> carry out their delegated actions **without spending gold/influence** — the shared runner engine
> (`runner.ts`) no longer charges a per-cycle cost, acolyte assignment no longer pays up front, and a
> delegated channel never stalls on an empty treasury. Only the player's own cast still pays. (The
> per-second invocation _summon upkeep_ is unchanged — that is the price of staying active, not of
> performing an action.) Delegated runners remain subject to the Morpheus / Katabasis freeze, which
> short-circuits the tick before the runner steps. The now-dead `actionCycleCost` / `canAffordCycle` /
> `payCycle` helpers were removed; the runner, acolyte, invocation, and Morpheus-freeze tests pin the
> behaviour, and `docs/02` §3/§10 were updated to match.
>
> **Earlier change — the bound Succubus + a long directional cast shadow (Claude Design handoff).** The
> **Succubus** (the apex Luxuria invocation, `maxActive: 1`) now composites into the **invocation room**
> while bound — a grounded figure standing in the red ritual circle (no float, no room-dim), her feet
> at the centre of the circle. She carries a new **`shadowCast`**: a long, soft directional shadow that
> trails from her feet across the floor (an offset, tilted ellipse, densest at the feet and tapering
> along its length), distinct from `groundShadow`'s centred pool. It is a single `BOUND_INVOCATION_VISUALS`
> entry (`degrade.data.ts`) picked up by `boundVisualsFor`, with `shadowCast` plumbed through
> `BoundInvocationVisual` → `EngineSprite` → the degrade pass — so she and her shadow crush/pixelate
> with the room at one fidelity. The shadow reproduces the design's gradient verbatim, including its
> ~5px soft-edge blur (scaled to the render buffer), at the final tuned offset/angle. One render-data
> test pins the visual (room match + the cast-shadow geometry).

> **Earlier change — Doppelgänger tweaks (dominance, post-scare disappearance, instant plate).** Three
> follow-ups to the scare: (1) a bound **Doppelgänger now OVERRIDES every other figure in the Studio**
> — `boundVisualsFor` returns it as the sole figure, so Familiar/Specunitas don't render alongside it;
> (2) **once the jumpscare has fired the Doppelgänger figure is suppressed for good** (gated on
> `flagDoppelgaengerSeen`, passed through `RoomView`) — it never appears again even while still bound,
> and any co-bound Studio figure returns once it's gone; (3) the scare now **jumps straight to the
> picture with no black flash** — the plate is decoded ahead of time (`preloadImage`, fired when the
> scare arms) and `DegradedScene` seeds its image cache from that decode synchronously, so the canvas
> paints the plate on its first frame (the overlay's fade-in is dropped). Two render-data tests pin the
> override + post-scare suppression.

> **Earlier change — the Doppelgänger: bound display + a one-time jumpscare.** The **Doppelgänger**
> now composites into the Studio while bound — a grounded full-body figure standing on the parquet
> (no float, no room-dim), the only treatment a new **`groundShadow`** carries: a flat contact shadow
> pinned to the floor at its feet (a soft dark pool, drawn into the scene buffer so it crushes/pixelates
> with the frame). It is a single `BOUND_INVOCATION_VISUALS` entry (`degrade.data.ts`) picked up by
> `boundVisualsFor`, with `groundShadow` plumbed through `BoundInvocationVisual` → `EngineSprite` →
> the degrade pass (Claude Design handoff). Alongside it, a **one-time scare**: the first time ever a
> Doppelgänger is bound and the player enters the Studio, their next interaction (PC / phone / Suasio /
> the door) is replaced by a full-screen jumpscare — the `doppelganger_jumpscare.png` plate composited
> THROUGH the degradation pass, with `jumpscare.wav`, held for exactly 2s. It blocks all input and
> cannot be skipped, and fires only once: a permanent, save-synced `flagDoppelgaengerSeen`
> (additive-optional, ADR-023; set via the pure sim `markDoppelgaengerSeen`) gates it forever. Five
> tests pin it (the visual's room match + ground shadow, the flag's purity/idempotence + Katabasis
> survival, its save round-trip, and the store action).

> **Earlier change — three more bound-invocation displays + "still by default" figures (Claude Design
> handoffs).** Three designed figures now composite into their rooms while bound, the same way
> Morpheus appears over the altar: **Aurevora** seated cross-legged on the invocation circle
> (pre-mirrored art, no float/vignette), **Astiwihad** at the altar threshold cropped to head and
> upper torso, and **Specunitas** standing behind the studio desk (hip-cropped art, gentle focal
> dim). Each is a single `BOUND_INVOCATION_VISUALS` entry (`degrade.data.ts`) keyed by the sim's
> canonical id, picked up automatically by `boundVisualsFor`. Alongside it, **bound figures now hold
> perfectly still unless a movement is specified** (only Morpheus's `float` today): a new `still`
> flag on `EngineSprite` suppresses the idle bob/breathe, and `figureToSprite` sets it for every
> non-floating figure — so the **Familiar** (and the three new figures) sit motionless rather than
> idly bobbing. Three render-data tests pin the new visuals (room match + no float).

> **Latest change — the inbox is permanent mail history (email persistence fix).** `commitKatabasis`
> previously wiped `lifetime.inbox` (and the arm timers and Fausto flags) on every descent. Because
> `deliverEmails` dedups by inbox id, that wipe re-delivered any email whose trigger still held the
> first tick after a return — so a beat gated on a **monotonic** tally replayed each descent: Fausto
> #5's **door-knock** sounded after every katabasis instead of once when received, and the parish
> soul-threshold bulletins re-appeared; the sin-gated **curse letter** re-armed and re-laid its −67%
> debuff each run. The inbox, `emailArmedAt`, `flagFCThreatSent` and `flagFaustoCurse` now **carry
> across the descent**, so every email arrives at most once per game, the threat branch stays closed,
> and the curse holds until its letter is deleted ("as long as these words remain"). One sim test
> pins the carry-over; doc 05's "per run" framing is superseded by once-per-game delivery.

> **Latest change — Fausto's curse made visible (Claude Design handoff, "Vertigo").** The curse
> (`flagFaustoCurse`, laid by Fausto Cescru's fourth letter, lifted when it's deleted) was previously
> felt only in the numbers. It now has a **body**: an additive **"Vertigo"** layer folded into the
> degradation pass (`degrade.ts`, gated on a new `curseVertigo` knob the room view-model drives off
> the flag) — the room sways and breathes, vision doubles, a queasy chromatic split pulses, and the
> vignette closes to a tunnel, all eased in/out (~0.7s) from one scalar. When the curse is inactive
> the frame is byte-for-byte the normal look; `prefers-reduced-motion: reduce` drops the vestibular
> sub-effects and keeps only a steady tunnel vignette. The **carrier email now glows green** in the
> inbox list so the player can find — and break — the words holding the curse. The curse's economy
> bite was **deepened from ×0.67 to ×0.33** (a 67% cut) on gold, influence and reprobate generation.

> **Latest change — the smartphone dialer (Claude Design handoff, Direction A "Stock light").** The
> player's budget Android phone — the one mundane object on the Studio desk, the black slab lying
> between the rolled Suasio scroll and the PC — now opens a **dialer**. A new Studio hotspot (`phone`,
> "The Smartphone") opens a self-framed full-screen overlay (its own shell over the `.panel-overlay`,
> `role="dialog"` + `aria-label="Phone"`, not a `PanelShell`): a pixel-faithful stock-AOSP number pad —
> device bezel with speaker slit + camera dot, a light screen with a status bar, a code display with a
> blinking caret + backspace, the decorative "Add to contacts" row, the 12-key pad (digits + `ABC/DEF…`
> sub-letters, gated by `showKeyLetters`), the accent call button (`accentColor`, default AOSP green),
> a Lollipop nav bar, and an Android pill **toast**. The status-bar clock shows the **real device time**,
> formatted with the same `Intl.DateTimeFormat` (`hour`/`minute`) as the Emails client so the two read
> identically. Typing appends (capped at 18), backspace trims, and **Call** routes the trimmed code
> through `onDial`; a boon shows a green toast and clears the field, an info readout a blue toast (kept),
> and an unknown number a red **"Number does not exist"** toast (kept for editing). The valid-code
> **set** lives in the sim (`dialCode` / `PHONE_CODES`): currently the single recognized number `666`,
> which answers in the same error fashion with its own copy (**"you're retarded"**); the player-facing
> copy lives in shared `strings.phone`, and the integrator `PhoneDialer` maps the sim outcome to the
> toast. Real boon/info **effects** are a documented empty hook (`TODO(wire)`) awaiting the outgoing-call
> engine (`docs/PANVITIUM-CALLS-OUT.md`). Fourteen tests cover it: five in the sim (code classification,
> trimming, catalog integrity) and nine in the web (the labelled dialog + 12-key pad, the live clock,
> append/backspace, the 18-char cap, the empty-field no-op, and the boon/info/error toast-colour +
> field-clear behaviour).

> **Earlier change — the persistent Influence & Gold HUD (design handoff).** A top-left resource
> cluster now rides over the game: the carved **vessel** (Influence — its glass globe fills with
> pink/purple liquid to `influence / maxInfluence`) beside two numeric readouts (Influence above,
> Gold below), both formatted through `formatBigNum`. The vessel's liquid + carved frame are
> composited onto a low-res `<canvas>` upscaled with `image-rendering: pixelated` — the whole vessel
> reads as pixel art (spatial pixelation only, full colour kept); a persistent rAF loop tweens the
> displayed fill toward the live target for a smooth rise/fall. The HUD reads live state via the
> store (selecting the stable `state`, deriving in render per the Zustand guidance) and is mounted by
> `App`: shown in all three rooms and over the Maleficia shelf, the Ars Goetia book and the Suasio
> scroll, and hidden over the Altar gate, the PC desk and during a Katabasis (both the gate and an
> ongoing descent hold `katabasisPhase !== null`). The vessel art ships under
> `public/assets/panvitium/hud/`; four web render tests pin the cluster, the `value / max` readout
> and the canvas grid.

> **Earlier change — Emails: the authored content set + a real trigger/flag/effect engine (05).** The
> five provisional placeholder emails are replaced by the full authored catalog from
> `docs/05-email-content.md` — ~30 letters across the household steward (Gideon ×4), twelve world
> newsletters, the Church (Father Tom, the parish bulletins, Bishop Crane, Father Stahl), the
> adversary (Fausto Cescru ×5) and the madman (Reuben Marsh ×4), each with sender, address, subject,
> body and (where authored) multiple-choice **replies**. The sim engine grows from boolean predicates
> into three trigger kinds: **immediate** (soul thresholds, Sin-level / all-sins gates), **timed**
> (armed on first eligibility, delivered a fixed delay later — the "X minutes after the Nth katabasis
> / after Plutus / after a Sin threshold" beats, with an arm-time recorded on a new per-lifetime
> `emailArmedAt` map), and **random** newsletters (armed on a Mercatus-depth gate, delivered a
> _deterministic per-lifetime offset_ derived from a side hash so the shared mulberry32 stream stays
> byte-identical, ADR-011). **Reply effects** are now wired through `applyEmailReplyEffect`: Father
> Tom #2's cruel reply sets a permanent `flagFatherMad` (rerouting the Church/adversary arc), agreeing
> to meet Reuben mints +1 soul and sets `flagReubenDead` (idempotent — no double-mint), and Fausto #1's
> threat closes his friendly branch. **Fausto #4 lays a curse** (`flagFaustoCurse`) folded into
> `computeModifiers` as ×0.33 on gold, influence and reprobate generation, lifted the moment the email
> is deleted; **Fausto #5 cues a door-knock** SFX (`audio.play('email-knock')`) surfaced via a new
> `TickResult.emailsDelivered`. A monotonic, lifetime-spanning `totalSoulsObtained` (bumped in
> `mintSouls` and the Panvitium harvest) drives the soul-threshold beats. All new fields are
> additive-optional on the wire (ADR-023); the reading-pane date now always renders the year as 2015
> per the content doc. The doc's Fausto/Reuben Sin-level ladders (10/20/30/40, 5/15/25/35) are rescaled
> to fit the live MAX_SIN_LEVEL of 4 (total ≤ 32). Thirteen sim tests cover the trigger kinds, the
> reply effects, the curse and inbox bookkeeping; the save round-trip and UI tests are updated.

> **Earlier change — UI: the Indagatio + Emptio merge into "Orbis Tenebrarum" (Claude Design).** The
> two separate PC apps become one. The **Emptio** desktop app is removed (its tile, its `PcGroupId`
> member, and its `PC_GROUPS` entry are gone), and **Indagatio** is rebuilt as the delivered design:
> a draggable orthographic globe on the left is the Search (Cast spins the world while a search is
> underway, with inertia and a stable per-find pin position), and an **Emptio** market ledger on the
> right lists each located maleficium — rarity dot, name, one-line effect and pre-formatted cost —
> with a detail panel whose Acquire button is the buy. All data is the live model: the ledger reads
> `state.lifetime.emptioList` mapped through the `MALEFICIA` catalogue (name / effect from
> `invokingPower` / flavour / price from the live `prices` map), `acquired` and `affordable` come from
> `state.lifetime.maleficia` and gold, Cast runs `act('indagatio')`, Acquire runs `act('emptio', id)`,
> and the search duration reflects `categoryEfficiency`. The wrapper `IndagatioEmptioProgram` replaces
> the old `IndagatioGroup` / `EmptioGroup` (and the now-dead `AcolyteSummary`), and the program renders
> full-bleed inside the PC window via the `FULLBLEED` set. The globe is hand-rolled with no new
> dependencies — an in-file orthographic `project()` (back-hemisphere clipping) plus a graticule — and
> the continents are filled in teal to match the proposal, from a bundled, compressed Natural Earth
> 110m land outline (`orbis.land.ts`, ~50 KB, rounded to 0.1° with tiny islands dropped). The fill is
> rasterised as horizontal strips: at load the outline is scanned into per-latitude longitude
> intervals (`LAND_ROWS`, antimeridian edges split at ±180), and each frame every strip is clipped to
> its visible longitude window — one clean interval per row, so there is no winding or limb-closure to
> get wrong. This replaces an earlier polygon limb-fill that could invert (paint sea as land) while
> dragging, when a continent's hidden side passed near the antipode. The visible coasts are stroked on
> top, all projected with that same math, so the recognisable landmasses render without the d3-geo /
> topojson / world-atlas packages the design assumed (the install-free apply flow stays intact).
> Maleficia are pinned only on land: `orbis.land.ts` derives an `isLand` test and a spread of
> `LAND_POINTS` anchors (4° grid, Antarctic cap excluded) once from the same outline, and
> `coordForFind` snaps any sea coordinate to the nearest anchor while unlisted ids hash directly into
> the set (memoised per id so the pin loop stays cheap). Indagatio now scries in the **background**:
> `startAction` no longer counts it toward the single player-action slot (02 §3), so a search runs
> while the player still works Suasio/Decimatio/Emptio — and the slot-aware UI reads
> `actionQueue.find(t => t.actionId !== 'indagatio')` so a running search never disables those rites.
> The Cast control shows a live **time-left countdown** while a search runs; **Emptio** (which stays a
> foreground, slot-holding buy) no longer spins the globe and instead draws a **progress bar** on the
> maleficium row being acquired; and the `+N invoking power` line is shown only for relics that grant
> at least 1. Anathema and Profane swap colours so **Anathema reads red** and Profane purple across
> every maleficia surface — `ORBIS_RARITY` (globe pins + badges), the Orbis swatch/dot/badge CSS, and
> the Maleficia cabinet's inline ember palette (the legacy `.rarity-*` classes in `menus.css` follow
> suit). One acolyte-delegation control the old Indagatio screen carried is not in the new design
> (the underlying sim mechanic is untouched). Thirteen tests cover the globe stage + Cast control, the
> Emptio rows, the detail + Acquire callbacks, the search-disabled state, the live-wired merged
> surface, the bundled coastline dataset, on-land placement, the background-scry slot rule, the search
> countdown, the Emptio progress bar, the effect-line gating, and the swapped rarity colours. Test
> count 759 (web 193).

> **Prior change — UI tweak: full-bleed PC programs now fill the desk.** The two full-bleed
> programs (Emails and Depraedatio) were floating in the dark Ubuntu desk wallpaper with a padded
> border around them; they now fill the entire program area edge-to-edge so the desk behind is no
> longer visible. `.pc-app--fullbleed` drops the padding/centring and becomes a plain block that
> stretches its child; the Emails client root fills 100% × 100% (losing its floating size, rounded
> corners and shadow); and Depraedatio's grimoire now fills the whole window edge-to-edge over a dark
> surface — its wallpaper layer no longer reuses the Ubuntu desk's orange/purple radial glow, and the
> centred 880px card is gone, so no desk-like background shows around it (scrollbar hidden, content
> still scrollable). Pure style change — no test or behaviour change; count unchanged at 746.

> **Earlier change — UI: the Depraedatio "merged proposal" rework (Claude Design).** The Mercatus
> program (in the desk PC) is rebuilt from the delivered design: under one tab bar, **Vitium
> Mercatura** becomes a Sigil Grid of eight per-Sin cards — a vertical depth bar (depth / cap), the
> live revenue (gold/s) and reprobate generation (reprobates/s), the trade's standing effect, the
> next-depth gate, and Deepen / cut (−) / Sell-all — and **Vitium Compositum** becomes a Living
> Grimoire of rite rows (status dot, cost · effect, or a "Requires ·" gate) with the **Panvitium**
> altar beneath: a sealed, hatched teaser until every Sin reaches Level 3, then a pulsing panel whose
> "Unleash" keeps the real two-step confirmation (it cannot be turned off by hand and ramps each
> second). All wiring is the live model — `invest` / `divest` with `mercatusDepth` / `mercatusDepthCap`
> / `investCost` / `mercatusRevenuePerSecond` / `foedusRevenueMul` / `divestFraction`, the
> reprobate/s readout from `MERCATUS_GEN_PER_DEPTH × depth × mercatusGenerationClauseMul`, and the
> ceremonies via `activateCeremony` / `deactivateCeremony` / `compositumUnlocked` / `isToggleActive`.
> The program renders full-bleed inside the PC window (its own grimoire surface; the titlebar names
> it) via the `FULLBLEED` set. The old list components (`MercaturaList` / `CompositumSection` /
> `PanvitiumRow`) are replaced by `MercaturaGrid` / `CompositumGrimoire` / `PanvitiumPanel`; the
> design's demo-only Panvitium toggle is dropped. Two render-smoke tests cover the tab bar, the eight
> locked cards at a fresh start, and the tab switch to the rites plus the sealed gate. Test count 746
> (web 181).

> **Earlier change — UI: the Emails two-pane mail client + a persisted reply/delete mechanic (Claude
> Design).** The single-column inbox is replaced by the delivered desktop mail client: a (deliberately
> light, diegetic) Ubuntu-style program with a decorative folder rail, a middle inbox list (unread dot,
> sender, timestamp, answered `↩` marker, subject, snippet), and a reading pane (Reply / decorative
> Forward·Archive / Delete, an avatar + sender + date header, then the body). It renders full-bleed in
> the dark desk — a new `FULLBLEED` set in `PcWindow` drops the titled card for Emails, since the window
> titlebar already names it, which also mirrors the design's own dark backdrop framing a light window.
> Beyond the look, this lands the **full persisted machinery** for multiple-choice **replies** and
> **delete**, with the economy effects left as a documented empty hook for a later pass: `ReceivedEmail`
> gains additive-optional `answeredReply` + `deleted` (ADR-023, in state + save encode/decode); the sim
> gains `answerEmail` (records the choice, reads the message, runs the hook), `deleteEmail` (a
> hide-_flag_, not a removal, so a deleted email can't defeat the once-only delivery dedup and
> re-trigger), and `applyEmailReplyEffect` — a pure no-op today, the single place to wire real reply
> consequences. Avatars, snippets and dates are derived in the client (the catalog has none). Reply
> **content** is also left hanging: the catalog's five emails define no `replies` yet, so they render as
> plain, unanswerable mail until authored (the consuming type already accepts `replies` + `addr`). Seven
> tests cover the answer / delete / no-op-hook sim, the ADR-023 save round-trip, and the client
> (auto-open + read-on-display, delete-falls-back). Test count 744 (web 179).

> **Earlier change — UI: the Katabasis "Aether" sigil-binding sphere (Claude Design).** The Goetia
> sigil page (the old carved-slab grid) is replaced by the delivered "Aether" design: the player
> stands inside a spherical vault and looks outward at the 72 seals scattered on its surface (a
> golden-angle distribution, projected each frame). Drag to look around; centre a seal; **Focus** it
> to freeze the view and open a right-docked detail panel; **bind / unbind** souls with the held,
> ramping pour. Bound seals glow, unbound stay cold, the Semet seal stays sealed until its gate. The
> three handoff "pending" points are resolved against the live model: the pool is `state.souls`, the
> Semet gate is the real `sigilVisible` predicate (all Cardinal Sins ≥ Rank 2), and bindings read
> from / write to the persisted `state.sigilBindings` via the store's `bindMore` / `bindLess` /
> `unbindAll` (so they survive every descent); the panel's **Effect** shows the real
> `sigilStrength(def, bound)` per effect kind (%, flat/s, or invoking power), not the prototype's
> √×0.01 stub; and the HTML prototype is ported to React, the projection loop mutating the seal
> transforms/glow directly (no per-frame render). Per the brief, the design's own soul readout is
> dropped — the souls count comes from the shared Katabasis `Hud` (the Eight Princes treatment) — and
> the `#kat-degrade` pixelation + scanline/grain chrome is kept on the vault and seals. New
> `AetherSigils.tsx`; the dead slab grid (`SigilsPlace`/`SigilPanel` + mask helpers) is retired; the
> 72 seal PNGs ship under `katabasis/sigils/`. Seven tests cover the roman numbering, the real effect
> formula, and the render. Test count 739 (web 178).

> **Earlier change — UI: the Maleficia Shelf "Niches" rework (Claude Design).** The Maleficia shelf
> is rebuilt from the delivered "Niches" design: the wooden glass-specimen cabinet becomes a wall of
> carved **niches**, each owned maleficium recessed in a black alcove lit from within by its rarity
> ember (common → gold, rare → teal, profane → red, anathema → violet), ordered anathema → common.
> Clicking a niche opens a full-bleed **close-up** (the relic in an ember halo + rarity eyebrow, name,
> flavour, effect, the single-use **Use** rite for consumables, and the oracular **odds reveal**). The
> data contract is unchanged — same `{ items, onUse }`, fed by the existing `buildCabinet` adapter; no
> sim/save work. The drop-in component is inline-styled (the old `.mal-*` / `.oracle*` rules are now
> dead but retained, since `.rarity-*` is still used by Emptio). Mounted in a new near-frameless dark
> **`niche`** `PanelShell` variant (the carved wall paints its own background, so the wooden case is
> dropped); the close-up is bounded + scrollable so a full four-category reveal never clips. Five
> render-smoke tests pin the wiring. Test count 732 (web 171).

> **Earlier change — UI: the Opus Suasio scroll rework (Claude Design).** The Suasio menu is
> rebuilt from the delivered "Opus Suasio, the Honeyed Tongue" design as a self-framed, full-surface
> overlay (mounted by `App` like Ars Goetia / the PC / Katabasis — it no longer rides `PanelShell`'s
> parchment frame). It is an illuminated dark parchment with a drifting devotional-Latin backdrop and
> three temptation rows — Suggestion (☿), Logismoi (✴), Imperium (☉) — each an alchemical circle that
> fills into a live **progress ring + bar** while its rite is spoken, reconstructed from the real
> action queue (Suasio is cost-outcome, so a rite's duration is its `baseTimeSeconds` — no sim/save
> change). Per-rite verbs (Speak / Infiltrate / Command) and flicker status lines are keyed in
> `strings.ts` (Latin left untranslated, ADR-020); a **sealed** (locked) rite shows redacted Latin
> behind a blur with its Sin gate ("Requires Luxuria III") and offers no action; acolyte delegation is
> preserved per delegatable rite. New `.suasio-*` class block in `menus.css` (reduced-motion + mobile
> aware); the design artifact is archived under `docs/frontend/`. Five render-smoke tests pin the
> wiring. Test count 727 (web 166).

> **Earlier change — economy retune, slice 5 of 6: the 72-sigil respecification (ADR-029).** The
> sigil catalog is rewritten wholesale from the revised Sigils sheet — every one of the 72 carries
> its sheet effect, curve, and coefficient, and **no sigil is inert anymore** (the 16 ADR-024
> orphans revive; old saves' bindings wake up with the new effects, no schema bump). Highlights:
> Sitri #12 now owns a dedicated **VM generation** multiplier (Plutus/Vapula scale revenue only);
> Gusion #11 / Naberius #24 scale **VC ceremony effects** (incomes excluded); Orias #59 owns the
> **VC influence output** (Zagan keeps gold); Leraie #14 chains **murders into suicides** at the
> rate level; **Crocell ⇄ Furcas** swap (double-find ⇄ divestment refund); Amy #58 turns CURSED
> (−Indagatio & Emptio efficiency); Glasya #25 / Sabnock #43 / Ose #57 feed new flat murder /
> suicide / generation channels. New mechanics: **duplicate-output** sigils (Agares / Malphas /
> Focalor — positive tiers only), **Marax** offline action-timer speed, **Foras** accrual-window
> extension, **Zepar** offline generation, whole-tier-group sigils (Bael / Balam / Amdusias),
> **Gaap** inflating the maleficia enhancer stack, and **Semet** as the sigil-effect scaler
> (acyclic by construction). Also repaired: the economy template's sigil-coefficient formulas
> (broken `Globals!$B$22` refs from the row-21 deletion, re-pointed to `$B$21`). Test count 722
> (sim 494 · web 161).

> **Earlier change — economy retune, slice 4 of 6: the Sins remap (ADR-028).** The Sins &
> Devotion table is rewired to the revised sheet. **Gula**: the Insatiability skill now lifts
> player efficiency; each LEVEL strips a quarter of the negative tiers' weight (level 4 → the
> Opera cannot roll Bad/Terrible/Apocalyptic at all). **Luxuria** ×2 Suasio efficiency per level;
> **Ira** ×2 Decimatio efficiency per level, with its Retribution skill moving to invocation
> efficiency; **Tristitia**'s Resignation skill moves to acolyte efficiency, and BOTH old suicide
> couplings (the skill lift and the 2×-per-level doubling) are removed — despair now flows
> through the Mercatus Tristitiae clause, Doom Gathering, and the suicide sigils. The ×1.33
> Ira acolyte/invocation ladder is deleted. Test count unchanged at 718.

> **Earlier change — economy retune, slice 3 of 6: the Vitium Compositum rework (ADR-027).**
> The four subtype-era ceremonies (_Loan Shark Op_, _Outrage Cycle_, _No-babies Movement_,
> _Ethnocentric Revolt_) are **deleted** — the roster is the sheet's canonical nine, and old
> saves self-heal on the first tick (`advanceToggles` drops unknown ids unbilled). Their five
> plumbing fields and helpers go with them. **Vegas and Crusade become percentage ceremonies**:
> Vegas pays 50% of the current gold gain rate (in gold) and yields 1% of it as influence/s;
> Crusade pays 50% of the current influence gain rate and yields 1000% (×10) of it as gold/s —
> both measured against a base computed WITHOUT percentage-VC outputs, so the pair can never
> compound on itself. The pair ceremonies take their sheet effects as ×1.1 rate boosts folded
> into the modifier bundle (Bacchanal → generation, Doom Gathering → suicide, Enraging Broadcast
> → murder), and Charity gains its missing 100 gold/s upkeep leg (100 g + 25 i → 200 g/s). The
> VM sheet's Foedus opt-out table shrinks to nine. PC ceremony copy spells out the percentage
> costs and conversions. Test count 718 (sim 490 · web 161).

> **Earlier change — economy retune, slice 2 of 6 (action tier tables; audit
> `economy-audit-2026-06-12`).** All eight Opera tier distributions re-pinned to the revised
> template, and every effect cell with them. Headlines: **Imperium loses its fixed "player in
> control" Good** — it now rolls a full distribution (3.5% Stellar paying +3% of CURRENT SOULS,
> 3.5% Apocalyptic shedding half the flock) — Suggestion/Logismoi gain real Apocalyptic tails
> (mass apostasy, −50%), Logismoi Stellar pays +3% of the population and its Excellent
> `randint(20,58)` (owner answer #3), **Pogrom's culls shrink to 2.5/1/0.1%** but its Apocalyptic
> burns 66% gold AND half the flock, **Purgatio's culls become 25/10/1%** with Terrible burning
> ALL gold and Apocalyptic burning everything, Caedes' Apocalyptic softens to 33% gold + 25%
> flock, and Emptio gains real price tiers (Stellar free, Excellent 25% price, Good 50%,
> Bad a wasted attempt). Forecast deltas (Suggestion/Caedes) mirror the new effects;
> `resolveImperium` now takes the rolled tier. Test count 486 sim (+5).

> **Earlier change — economy retune, slice 1 of 6 (Globals & flat numbers; audit
> `economy-audit-2026-06-12`).** The repo adopts the revised economy template and pins the
> unambiguous number changes: base suicide / murder rates **0.0001 / 0.0002 per second** (were
> 0.00023 / 0.0001 — murder now outpaces despair), Vanagloria **×1.33** influence per level (was
> 1.5), the Acedia offline compound rebased to **`1.0000002^(seconds × L²)`** (was per-minute
> 1.00002 — ~1.7× gentler at the seven-day saturation), Solomon's Ring **×1.66** sigil effect,
> Purgatio at **1,000,000 gold / ~360 s** (was 10,000 / 3600 s), and the acolyte ladder rebuilt as
> **×1.5 from 110 with the first acolyte at 110 itself** (was ×2.2 with the first at 242).
> Sheet errata fixed per the owner's answers: Panvitium's cost formula re-pointed to the Base-VC
> rows (confirming the code's 1000·eᵗ / 100·eᵗ), Indagatio's Good weight 0.25 (sum now 1.0),
> Logismoi Excellent `randint(20,58)`, the vestigial conversion-rate Globals row deleted, the
> intensity-divisor prose corrected to 65.37. Maleficia prices and the action toggle gates were
> verified already sheet-accurate. Slices 2–6 (action tier tables, VC Slice 3, the Sins remap, the
> 72-sigil re-pin, invocation retouches incl. Imp → Caedes-efficiency contributor) remain per the
> audit.

> **Earlier change — documentation reconciliation (no code change).** The design docs and the ADR
> record are brought back in line with the shipped code: `03-content-catalog.md` §2.3 gains the
> **amended** signature-clause table (and loses two factual errors — Furcas #50 never touched the
> divest fraction, Sitri #12 never touched VM output); the ceremony table now states the honest
> code status (the four subtype-era pairs and the Vegas / Crusade percentage semantics await the
> "Slice 3" rework); `02-systems-and-mechanics.md` documents the 0.5 offline base;
> **ADR-025** (Mercatus + Foedera, save v3, amended clauses) and **ADR-026** (player offline
> efficiency wired at 0.5× + resume clock reconciliation) are recorded, with the **Vitium
> Compositum Slice 3** and the **orphaned-sigils pass** (16 inert sigils listed) registered as ADR
> open items and surfaced in `### Remaining` below. The stale "all 72 sigils wired" and
> subtype-era claims in this README are corrected in place.

> **Earlier change — Mercatus per-Sin signature clauses (slice 2, §1.5 table amended in
> session).** Each trade now carries one signature twist: **Gulae** patrons spend ×1.25;
> **Luxuriae** generation ×1.25; **Avaritiae** each depth bargains the next 0.5% cheaper — the discount
> COMPOUNDS per depth (effective cost ratio 1.6 × 0.995, refunds on the same basis); **Tristitiae** +0.825% suicide-rate mul per depth; **Irae** +0.825% murder-rate mul
> per depth; **Acediae** revenue exempt from the offline efficiency factor plus +0.825% offline
> gain rate mul per depth; **Vanagloriae** +0.25% of effective max influence as flat
> influence/s per full 10 depths (stepped); **Superbiae** depths ×1.25 dearer but its revenue
> and generation ×1.33. Per-trade cost/revenue/generation multipliers live in `mercatus.ts`
> (invest/cumulative curves are now sin-aware); the dynamics couplings are one line each in
> `computeModifiers`. **Globals row 8 ("Player base offline efficiency" 0.5×) is now actually
> wired**: `resumeGame` scales the offline catch-up by `PLAYER_OFFLINE_EFFICIENCY` and passes it
> as a tick dep so the Acediae trade's take alone is restored to full wall-clock rate — a global
> offline-economy change (offline gains now run at the half-rate base the spreadsheet always
> specified). Fixing that also fixed a latent clock bug: `resumeGame` now reconciles
> `lastTickAt` to wall-clock after the catch-up, so scaled offline time can neither double-count
> (mul < 1) nor silently eat the overshoot (Acedia compound > 1). No save-schema change.

> **Earlier change — Vitium Mercatura replaced by the Mercatus system + the Foedera coupling
> (vm-vc-redesign-spec).** The legacy business system (32-business catalog, build queue, flat
> emitters) is gone. In its place: eight trades, exactly one per Cardinal Sin (_Mercatus Gulae …
> Superbiae_), each a single integer **depth** — deepening is an instant gold purchase
> (`investCost(d) = floor(50 × 1.6^d)`, cap `10 × sinLevel`), divesting refunds the Globals
> shutdown-recovery fraction (0.25, Vine #45 still applies) of the closed-form cumulative cost.
> Revenue is **demand-driven** — `0.1 × reprobates × (1 − e^(−0.15·d))` per trade — composed at
> the exact site the old `businessGoldPerSecond` held (`× vitiumMercaturaOutputMul ×
goldRateMul`); generation contributes `0.02 × d` to the pool. On Katabasis all trades
> auto-divest into gold **before** the remaining-gold roll. **Foedera** couples Mercatūs to
> Vitium Compositum: `tier = min(floor(min member depth / 10), 4)` discounts an active ceremony's
> upkeep by `1 − 0.125 × tier` (incl. Panvitium's eᵗ ramp — the late-game payoff) and multiplies
> member-Sin trade revenue by `1 + 0.05 × tier` (active-only; shared Sins stack
> multiplicatively; per-VC `foedusOptOut` flag, default all-on). Save schema **bumped to v3**
> with a real migration (`v2-to-v3.ts`: credit 25% of owned build costs as gold, fizzle the
> build queue, drop both fields; `mercatusDepths` seeds empty). The Depraedatio panel's Mercatura
> tab is rebuilt as eight data-driven rows (roots meter, take/s, Deepen / Cut back / Sell off,
> Foedus badge); the in-flight tab is retired. The economy spreadsheet's `Vitium Mercatura`
> sheet now carries the constants block + per-VC opt-out flags. The §1.5 per-Sin signature
> clauses are **deliberately unshipped** (spec marks them optional, pending approval).

> **Earlier change — Altar commit gate redesigned as a ritual seal circle + a new Status Quo
> "Ledger" screen.** The prior slab-with-candles drop target is replaced (Claude Design handoff) by
> a full-screen seal: the central Goetic sigil _is_ the descend button, ringed by counter-rotating
> Latin script (`PER VITIA, AD SOLIUM`). The two-press commit safeguard is preserved — the first
> press arms the seal, the second commits the (irreversible) descent — and reduced-motion stills the
> ring, pulse, and embers. Beneath it sit two inscribed gates: **Turn away** (back to the Altar Room)
> and **Status quo**, which opens the new read-only **Ledger** — each Cardinal Sin's rank with its
> Skill and per-rank Level effects, then every _bound_ sigil's effect (effects only, no seal names or
> art; the Semet lock is respected). All wired to live state (`sinLevel`, `strings.sins`,
> `state.sigilBindings`); no static sample data. Ships the `seal-panvitium.png` glyph. The
> `buildAltar` view-model is retired from the gate but kept (still tested) for future reuse.

> **Earlier change — reprobate subtypes & the Vitium conversion mechanic removed.** Reprobates are
> now a single undifferentiated pool (`lifetime.reprobates` is one integer). The conversion pool,
> `biasedSubtype`, the eight per-subtype rate penalties, and the per-Sin Vitium-gold boost are gone;
> murder is re-anchored to a per-capita rate on the whole population; Pogrom culls the pool (no
> target) and Defixio curses the pool (no subtype). This **bumped the save schema to v2** with the
> project's first real migration (`migrations/v1-to-v2.ts`: sum old per-subtype counts, drop
> `conversionPool`, drop `defixio.target`). Three ceremonies whose only effect was conversion or a
> subtype penalty (**Outrage Cycle, Vegas, Crusade**) are kept as compile-green stubs, and the
> subtype/conversion-keyed sigils plus Specunitas are neutralized to an `inert` effect (IDs
> preserved) — both flagged for the forthcoming Vitium Mercatura / Vitium Compositum rework and an
> orphaned-sigils pass. The historical build-log rows below predate this change and are kept as a
> record; where they describe subtypes/conversion, the single-pool model above supersedes them.

**Phases 2 (infrastructure), 3 (gameplay), and 4 (content depth) are complete for code.** The
skeleton builds, tests, containerizes, and is CI-gated; the full core loop is implemented, tested,
and surfaced in the three-room UI.

Implemented gameplay (each slice pinned with Vitest):

- **Resources & probability** — gold/influence generation, the seven-tier outcome resolver (02 §2).
- **Opera** — _Suasio_, _Decimatio_, the action engine (`cost-outcome` / `time` efficiency modes).
- **Devotion & the modifier engine** — Cardinal Sin levels (`180^X`) and skill intensities, composed
  through a single `computeModifiers` point (ADR-022).
- **Katabasis** — the descent flow, offering menu, recap, and unspent-soul carry-over.
- **Reprobate dynamics** — fractional generation / suicide / murder pools over one undifferentiated
  reprobate pool (02 §9); murder is a per-capita cull of the whole population.
- **_Depraedatio_** — the _Vitium Mercatura_ **Mercatus** system (eight per-Sin trades with
  depth-driven, demand-coupled revenue) and _Vitium Compositum_ ceremony toggles, bound by the
  **Foedera** coupling.
- **Acolytes**, **invocations** (all 18 wired — autonomous-runner channel for the Familiar / Imp /
  Upir, static modifier-bundle contributions for the demonic court, per-tick or per-invoke
  side-effects for the apex entities), and **maleficia** (_Indagatio_ / _Emptio_).
- **Apex entities** — Astiwihad + Aurevora (per-tick effects in `apex.ts`), Erinyes + Morpheus
  (mutually-exclusive Katabasis-carryover apexes; Morpheus freezes the lifetime, Erinyes kills
  every reprobate at invoke), Specunitas (apex Vanagloria; effect retired with subtypes).
- **Sigils** — the 72-sigil recoverable prestige axis, with binding curves, Katabasis carry-over
  bonuses (gold / maleficia / reprobate), and the _Semet_ gate.
- **Achievements** — a static catalog evaluated each tick, with an unlock toast and a ledger panel.
- **Panvitium** — the namesake endgame ritual.
- **The Eternal Sin** — the ninth-Sin reveal (_Semet_), with the total runtime as the score.
- **Cloud save sync** — magic-link auth, automatic push on persist, ADR-010 conflict chooser.

### Economy-parity pass — `Panvitium_Economy_Template.xlsx`

Bringing each system's placeholder magnitudes and mechanics into exact agreement with the
spreadsheet, one gate-green slice per tarball. **Vitium Compositum is complete** (every named
ceremony plus the apex now matches the sheet):

| #   | Slice                      | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Globals base rates         | `BASE_GOLD_PER_SECOND` 10→2, `BASE_INFLUENCE_RATE` 0.025→0.01.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2   | Acolyte curve              | `maxAcolytes` ×2.2 threshold series anchored at 110; fresh game starts at 0 acolytes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3   | Emptio outcomes            | Neutral merged with Good (purchase at listed price); Apocalyptic bite 0.3→0.5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | Caedes Apocalyptic         | No-op → lose 66% gold + 50% reprobates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 5   | Suggestion effects         | Stellar mints reprobates; Excellent mints souls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6   | Indagatio ladder           | Good→rare+common, Neutral→common; Terrible loss 0.05→0.15, Apocalyptic 0.2→0.8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | Vitium Mercatura           | Full 32-business catalog (8 sins × 4 tiers) generated from tier specs + sheet costs/rates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 8   | Compositum base            | Outrage Cycle added; Loan Shark / Charity / Gala retuned to gold-income + conversion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9   | Compositum flat-rate       | No-babies (flat −generation), Doom (flat +suicide), Ethnocentric (flat +Choleric-murder).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10  | Compositum population      | Bacchanal → 10% of (Glutton+Degenerate)/s generation; Enraging Broadcast → % cull of population.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11  | Compositum penalty/offline | Vegas / Crusade flatly raise the opposite faction's subtype penalties; Dolce ×1.01 offline gain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 12  | Panvitium ritual           | Exponential `eᵗ` cost/conversion; conversion across all subtypes + soul harvest (∝ souls) + flat gen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 13  | Suasio Opera actions       | Sheet-specified Logismoi (Luxuria 2) + Imperium (Luxuria 3) added to the action catalog with their tier distributions and a new optional `unlock { sin, level }` gate + `actionUnlocked` helper + `startAction` guard (Suggestion/Caedes stay ungated). The Suasio scroll now holds all three temptations: Suggestion is always open; Logismoi/Imperium show their Luxuria gate until reached. Imperium's duration is a flagged placeholder (the sheet defers it). The Decimatio pair (Pogrom/Purgatio) is a separate slice.                                                      |
| 14  | Decimatio Opera actions    | Sheet-specified Pogrom (Ira 2) + Purgatio (Ira 3) added with their tier effects. Pogrom culls a chosen subtype (5/10/25% by tier, soul per death) via the existing action-`target` plumbing + a `startAction` subtype guard; Purgatio culls all subtypes (33/66/100%). New `cullSubtypeFraction` and `loseConvertedReprobatesFraction` population helpers; positive culls scale with efficiency (clamped ≤100%), the Church/gold losses are fixed. Sim core only — UI surfacing is deferred (see Remaining). Costs are flagged placeholders (sheet says "high"/"very high gold"). |
| 15  | Action delegation gating   | New optional `delegateUnlock { sin, level }` on the six Opera actions (the sheet's "toggle" levels: Suggestion/Caedes at Luxuria/Ira 1, Logismoi/Pogrom at 3, Imperium/Purgatio at 4). `isDelegatable` is now state-aware; acolyte assignment and the `AcolyteControls` UI honour it, so a rite can be cast by hand before it can be automated. Autonomous invocation runners (Familiar/Imp/Upir) stay gated by invocation possession, not the toggle level; Indagatio is always delegatable, Emptio never.                                                                       |

**Maleficia** — in progress (roster + gating done; effects pending):

| #   | Slice                 | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Maleficia roster      | Full 25-item catalog with sheet rarity / invoking power / stack caps (∞ where unbounded); costs normalized into per-rarity price bands (`MALEFICIUM_PRICE_RANGE`, exported for the later rolled-pricing slice).                                                                                                                                                                                                                                                                                                                                                                                                                           |
| M2  | Opera enhancers       | Ars Serpens (+33% Suasio), The Voynich Manuscript (+66% Suasio), Ritual Dagger (+33% Decimatio) folded into the efficiency muls as multiplicative `(1 + bonus)` factors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| M3  | Sigil enhancers       | Solomon's Ring (+50%) and Iron Nails (+1%/copy) scale every sigil's effect strength via `sigilEffectMultiplier`, threaded into `sigilModifierContributions` (modifier + tier sigils) and `sigilKatabasisBonus` (carry-over sigils).                                                                                                                                                                                                                                                                                                                                                                                                       |
| M4  | Rolled Emptio pricing | Each maleficium's price is rolled within its rarity band (`MALEFICIUM_PRICE_RANGE`) the moment it is surfaced by Indagatio, and persisted in a new additive-optional `lifetime.maleficiaPrices`; the draws are appended after the find logic so which items surface stays byte-identical. Emptio (and its UI) charge the rolled price, falling back to the catalog cost for pre-pricing saves; the map resets with the emptio list on Katabasis (preserved under Morpheus).                                                                                                                                                               |
| M5  | Hand of Glory (sim)   | Single-use generation buff: a new `activateMaleficium` consumes one Hand of Glory and adds an hour to `lifetime.handOfGloryRemaining` (additive-optional save field; repeat uses stack the timer). While the timer is live, `reprobateGenerationRateMul` is ×2 (+100% base generation); the tick decays it in real time and it resets on Katabasis. Sim core only — the cabinet "Use" affordance is deferred (see Remaining).                                                                                                                                                                                                             |
| M6  | Defixio (sim)         | Single-use sustained curse: `activateMaleficium('defixio')` consumes one copy and marks a pending curse in a new additive-optional `lifetime.defixio`. The first tick rolls the target uniformly among present subtypes (the only Defixio RNG draw, gated so an uncast game leaves the stream byte-identical), then culls that subtype at eᵗ per second (t = seconds the curse has run), minting a soul per death, until the subtype is exterminated — then the curse lifts. One curse at a time; resets on Katabasis. New `cullSubtypeCount` population helper. Sim only — shares the deferred cabinet "Use" affordance (see Remaining). |

**Invocation effects** — done (reconciled to the Invocatio sheet's Model: each invocation's
factor × the player's current action efficiency × the invocation-effect multiplier):

| #   | Slice                              | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Multiplier effects + Black Candles | Fama (influence), Harpy (→ Decimatio efficiency, retargeted off murder), Plutus (VM output) and Succubus (→ Suasio efficiency + gold cut, retargeted off generation) reworked to `factor × playerEff × invEff`. Black Candles (+5%/candle) folded into `invocationEfficiencyMul`, so it boosts every invocation that reads it (runners already; these passive effects now too).                                                        |
| I2  | Additive-to-base effects           | Nightmare → additive to base suicide rate (new `flatBaseSuicideRatePerSecond` bundle field, added in `dynamics` alongside the Doom toggle); Behemoth → additive Stellar weight (factor 0.0005, deferred past the tierAcc block for its `playerEff` dependency); Lemure → offline gain rate, retargeted off the wrong influence/Husk target (`flatInfluencePerSecond` now reserved for the Decarabia #69 sigil). All efficiency-scaled. |
| I3  | Lamia runner                       | Reclassified Lamia from a generation + Suasio-success modifier into an autonomous Suasio runner (`autonomous: { action: 'suggestion', efficiency: 0.05 }`), advanced by `runner.ts` like Familiar/Upir/Imp. Removed its `reprobateGenerationRateMul` and `categoryTierModifiers` contributions (and the dead `LAMIA_*` constants).                                                                                                     |

**Sigils** — in progress (completing the 72-Goetia catalog against the Sigils sheet; ~68 of 72 now
bindable, the rest pending their effect mechanics):

| #   | Slice                            | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Existing-field wiring            | Wired the sigils expressible via the existing modifier bundle with no new mechanic: Belial #68 (influence rate), Marax #21 (offline time mul), Murmur #54 (overall invocation effectiveness), Balam #51 (−Terrible weight), Cimejes #66 (maleficia Katabasis roll). Added `invocationEfficiencyMul` + `offlineTimeMul` to the sigil-targetable fields (both already in the bundle and consumed).                                                                                                                                                                                                         |
| S2  | Per-category tier/success        | New `categoryTier` SigilEffect variant (`{ category, tiers, direction }`) folded into `categoryTierModifiers` via `sigilCategoryTierContributions` (scaled by the Solomon's Ring / Iron Nails enhancers). Wired Agares #2 / Beleth #13 (Indagatio / Decimatio success), Botis #17 / Ipos #22 (−Suasio / −Decimatio bad outcomes), Astaroth #29 / Andras #63 (+Stellar for Indagatio / Emptio), Andromalius #72 (Emptio success) and Naberius #24 (Suasio success).                                                                                                                                       |
| S3  | Per-category action efficiency   | Added `indagatioEfficiencyMul` + `emptioEfficiencyMul` to the bundle and `categoryEfficiency`, completing the four-category Opera-efficiency surface (these are time-mode, so they scale action speed). Wired Bifrons #46 (Indagatio) and Seere #70 (Emptio).                                                                                                                                                                                                                                                                                                                                            |
| S4  | Per-Sin invocation effectiveness | New `invocationSin` SigilEffect variant + `sigilInvocationSinContributions` feeding a per-Sin `invocationSinEffectivenessMul` bundle map. `invEffFor(sin)` applies it to every efficiency-derived invocation effect (Fama/Harpy/Plutus/Succubus/Nightmare/Behemoth/Lemure) and the autonomous runners (via `def.sin`). Wired Samigina #4 (Tristitia), Barbatos #8 (Gula), Bune #26 (Vanagloria), Berith #28 (Superbia), Furfur #34 (Luxuria), Vepar #42 (Ira), Shax #44 (Avaritia), Alloces #52 (Acedia).                                                                                                |
| S5  | Subtype penalty reductions       | New `penaltyReduction` SigilEffect variant + `sigilPenaltyReductionByChannel`, dividing a penalty channel's per-count coefficient by `(1 + strength)` (never into a bonus). Wired Gaap #33 (Sigma influence), Malphas #39 (Celebrity gold), Gremory #56 (Degenerate suicide) and Volac #62 (Gambler generation). Vual #47 softens BOTH the Degenerate suicide and Choleric-murder dampening via a shared `degenerateDeathRates` channel applied to both muls in `computeModifiers`.                                                                                                                      |
| S6  | Flat generators                  | New `flatGen` SigilEffect variant + `sigilFlatGeneration`, feeding flat per-second resource into `flatGoldPerSecond` / `flatInfluencePerSecond` (accrued in the tick, scaled by the rate muls). Wired Haagenti #48 (gold/s) and Decarabia #69 (influence/s). Corrected the `log` binding curve from `log10` to `ln(1 + N)` to match the sheet yields exactly (only these two log sigils use it).                                                                                                                                                                                                         |
| S7  | Flat invoking power              | New `invokingPower` SigilEffect variant + `sigilInvokingPower` (rounded to int), added to `currentInvokingPower` on top of the maleficia total so it counts toward the invocation gates. Wired Andrealphus #65.                                                                                                                                                                                                                                                                                                                                                                                          |
| S8  | Cost reductions                  | New `costReduction` SigilEffect variant + `CostChannel` + `sigilCostReductionByChannel`, dividing a cost by `(1 + strength)` at its site (never an increase). Wired Paimon #9 (action influence costs), Amy #58 (Emptio gold), and Orobas #55 (invocation soul cost — discount may pierce the nominal minimum).                                                                                                                                                                                                                                                                                          |
| S9  | Conversion-bias sigils           | New `conversionBias` SigilEffect variant (`{ subtype }`) + `sigilConversionBiasContributions`, composed into the `conversionBiasMul` draw seam on top of the apex Specunitas bias — strictly multiplicative on existing source weights (cannot manufacture a conversion from a zero-source subtype). Wired Eligos #15 and Phenex #37, both biasing Celebrity conversion.                                                                                                                                                                                                                                 |
| S10 | Subtype-targeted murder rates    | New `murderBias` SigilEffect variant (`{ subtype }`) + `sigilMurderBiasContributions`, biasing the murder-victim draw in `removeOneVictim` (weight = count × bias) — the weighted path engages only when such a sigil is bound, so the no-bias RNG stream stays byte-identical. Wired Glasya-Labolas #25 (Celebrity), Sabnock #43 (Glutton), Camio #53 (Degenerate). Amdusias #67 (non-Choleric types) lifts the overall `cholericMurderRateMul`. Haures #64 biases the draw toward Cholerics — murders now draw across **all** subtypes, Cholerics included, so Cholerics are valid victims by default. |
| S11 | Nihilist suicide-rate sigils     | Added `nihilistSuicideMul` to the sigil-targetable fields and amplified the Nihilist-count suicide term in `computeModifiers` by `sc('nihilistSuicideMul')` (so it only lifts the rate when Nihilists are present, never from nothing). Wired Ronove #27 and Focalor #41, both increasing the Nihilist-driven suicide rate.                                                                                                                                                                                                                                                                              |

**Frontend — room & menu layer (design handoff integrated).** The Claude Design handoff has been
folded in as a compiling foundation, aligned to repo conventions (strict TS, explicit `.js` import
extensions, `import type`, Prettier):

- `apps/web/src/menus/` — the ported TypeScript menu layer: `RoomView`, `SummonedCreatures`,
  `PanelShell`, `AltarPanel`, `MaleficiaCabinet`, `SuasioPanel`, `PcWindow`, `ArsGoetiaBook`,
  `Katabasis`, the `useHold` ramp hook, the `types.ts` presentation shapes, the `menus.data.ts`
  **mock** catalogs, and `menus.css`. Typechecks under the workspace gate.
- `apps/web/public/assets/panvitium/` — the designed backdrops, invocation / maleficia art and
  textures, served by Vite at the runtime URL `/assets/panvitium/...`.
- `docs/frontend/` — the handoff's `INTEGRATION.md` wiring map and `Playspace.example.tsx`
  orchestration reference (kept out of `src`, so neither is typechecked or linted).
- **Wiring (the handoff's "Step 4") — in progress, one slice at a time:**
  - _W1 — room layer live._ `menus.css` is imported (after `index.css`, which it cleanly
    supersedes for the shared shell classes); `App` now renders the designed `menus/RoomView`
    driven by the store — door navigation, hotspot → panel, the Studio `panvitium` red glow
    (`activeToggles`), and the summoned creatures in the Invocation circle (active `invocations`,
    selected via a stable key so the room re-renders only when the set changes). The placeholder
    `apps/web/src/rooms/` shell is retired; `PanelId` now comes from `menus/types`. The existing
    HUD, panels and modals are untouched.
  - _W2 — Ars Goetia live._ The designed full-screen `ArsGoetiaBook` is now the `ars-goetia` panel,
    fed by a real `buildGoetia` view-model (`apps/web/src/game/invocations.ts`) mapping the sim
    invocation catalog + live state onto the presentation shape: invoking power, per-entry gate,
    soul cost, unlocked and bound count are all real, and Summon/Dispel call the store's
    `summon`/`banish` (so the W1 Invocation circle reflects them). Names come from the canonical
    strings; the design's art/lore is reused for the six illustrated entries with a graceful
    fallback (the Ars Goetia plate + a computed rank, omitted effect/lore) for the rest — nothing
    fabricated. Pinned by an adapter unit test.
  - _W3 — the Altar live._ The designed Altar ledger is now the `altar-menu` panel, fed by a real
    `buildAltar` view-model (`apps/web/src/game/altar.ts`): per-Prince Devotion totals + Sin levels
    (via `sinLevel`) and — newly surfaced — the **bound-sigils** list read from `state.sigilBindings`
    and named from the sigil catalog. The two-tap descend calls the store's `beginKatabasis`, which
    still opens the existing `KatabasisModal` (the designed full-screen descent is W4). Pinned by an
    adapter unit test.
  - _W4 — the descent live._ The designed full-screen two-page `menus/Katabasis` is now the descent
    `menu` phase (replacing the old `KatabasisMenu` markup), wired to the **real live model**:
    offering pours Devotion straight into `state.devotion` via `offer`, binding moves souls to seals
    via `bindMore`/`bindLess` (both recoverable until you rise), the Eternal-Sin card appears once
    every Cardinal Sin is maxed, and Ascend commits the lifetime via `confirmKatabasis`. The hold
    buttons ramp the per-step _amount_ (souls are BigNum, so a +1/tick hold can't scale). The recap
    and Eternal-Sin reveal remain their own views. `KatabasisModal` is slimmed to the phase
    orchestrator + those two views.
  - _W5 — Maleficia cabinet + Suasio scroll live._ `MaleficiaCabinet` now shows the player's **owned**
    maleficia (a `buildCabinet` view-model collapsing duplicate stackables into ×N), each merged from
    the sim catalog (name/rarity/description) with the design's specimen art + split flavour/effect;
    art-less items fall back to a text label. `SuasioPanel` fires the real **Suggestion** action via
    the store (`act`), with the live efficiency-scaled cost and a log of resolved Suggestion outcomes
    (filtered from the store log, described via `describeOutcome`); acolyte delegation to Suasio is
    preserved beneath it. Pinned by a cabinet adapter unit test.
  - _W6 — the PC live (menu-layer wiring complete)._ The designed `PcWindow` file-manager is now the
    full-screen `pc` overlay; each “executable” launches the **real** system body via the existing
    `PcGroupBody` (Depraedatio businesses + build queue, Decimatio / Indagatio actions, the Emptio
    market, the achievements ledger, and the global outcome log). The designed chrome wraps the
    real group components unchanged. With this, every diegetic panel and room is wired to real
    state; the `menus.data.ts` stand-ins survive only as design flavour (art/lore/rank) merged by
    the view-models, plus its now-unused PC/Sin/Sigil mock arrays and the superseded text panels
    (`PcPanel`, `ArsGoetiaPanel`, the old Suasio/Maleficia markup), which a later cleanup can drop.
  - _W7 — themed panel shells (fix)._ The three framed panels were rendering in the generic frame
    rather than the designed `PanelShell`, so they had lost their themed backgrounds. They now render
    via `PanelShell` with the right variant: the Altar in engraved **stone** (`altar-stone.png`,
    header-less), the Maleficia **cabinet** in wood, and the Suasio **scroll** in parchment. Ars
    Goetia, the PC and Katabasis keep their own full-screen shells. The PC window is **25% larger**
    (1050→1312 wide, 560→700 tall) and its program card's `max-width` is raised to match (840→1050), so
    the menus get more room while their contents — icons, text, buttons — keep their native sizes (the
    extra space shows as more file-grid columns and roomier panels, not a zoomed-in UI). The `vw`/`vh`
    caps are unchanged, so the window still shrinks to fit a small viewport. PC action rows
    (`.vitium-row`, `.pc-app-row`) gained horizontal breathing room so their buttons no longer jam
    against the bar's right edge, and the three deactivation buttons — business **Shutdown**, ceremony
    **End**, invocation **Dispel** — use a dedicated green `.opera-btn--stop` variant (a "turn this
    off" affordance, distinct from the blood-red BEGIN/Summon); cancel and sign-out buttons stay on the
    neutral `--secondary` style. **Gotcha:** both `index.css` and `menus.css` define `.opera-btn` and
    `.vitium-row`, and `menus.css` is imported last, so it wins the cascade _per property_ — the PC
    overrides for these (padding, the `--stop` colours) must live in `menus.css`; the same edits in
    `index.css` are silently overridden.
  - _W8 — render-loop fix._ The Maleficia shelf selected `buildCabinet(state)` _inside_ a Zustand
    selector, returning a fresh array each call — which makes `useSyncExternalStore` see an
    ever-changing snapshot and loop (“Maximum update depth exceeded”) when the cabinet mounts. Now it
    selects the stable `state` and builds in the render body. Guarded by an e2e step that opens the
    cabinet. (Other inline selectors were already safe — they return the actual `state.lifetime.*`
    arrays, not fresh ones.)
  - _Degradation pass + Ars Goetia rework._ The defining visual constraint (01) is in: each room's
    backdrop is now a `<canvas>` (`DegradedScene` over the framework-free `DegradePass` engine) that
    composites the plate, its baked props, and any summoned creatures through one uniform degradation
    recipe — so the whole diegetic frame reads at a single fidelity, while the chrome (hotspots, HUD,
    panels) layers above it and stays crisp. `DEFAULT_DEGRADE` is dialled to the shipped “Cursed
    CD-ROM” recipe (block 3 · levels 6 · dither · grade 0.12 · contrast 1.2 · black 0.08 · vignette
    0.1 · grain 0.03 · flicker 0.06 · scanlines 0.25 · aberration 1 · 24fps · uniform · idle bob);
    pass `settings` to override any knob. Room changes play the engine's fade-to-black curtain;
    creature idle motion is composited before the pass. `RoomView` feeds it `ROOM_PLATES` (the
    `*_complete.png` plates, props baked in) and `spriteFor` (summoned ids → canvas sprites), which
    settles the earlier furnish question — every room degrades its complete plate. **The Altar plate is
    dynamic**: it tracks the acolyte count via `altarPlateForAcolytes(n)` (clamped 0–4 →
    `backgrounds/altar_by_acolytes/169_altar_clean_{n}acolytes.png`), so the scene shows that many
    acolytes; `App` passes a stable `acolytes` count so it redraws only when one is gained or lost. The
    DOM `SummonedCreatures` and the crisp `ars_goetia` prop are retired (composited / baked in); the
    `.scene` CSS backdrop is superseded by the canvas. The **Ars Goetia** grimoire is the reworked
    prop-driven `ArsGoetiaBook` (takes a pre-formatted `invokingPower`); `buildGoetia` now yields
    `GoetiaEntry[]` + `invokingPower`, omitting `gate`/`effect`/`lore`/`illus` where absent so
    un-illustrated seals degrade to a text leaf. **Bound state restored** (it was dropped in the
    rework, leaving the menu blind to what was summoned): each entry now carries its `active` count,
    `atCap`, and `affordable`, so the index shows a `bound ×N` badge, the detail shows a Bound row,
    Summon is disabled at the cap / when unaffordable (labelled _Bound_ for a full apex), and Dispel
    only appears when something is actually bound. Orphaned by the earlier pass (cleanup):
    `SummonedCreatures.tsx`. **Runner stacking fixed**: the Normal-type runners (Imp/Upir/Lamia) are
    uncapped per the sheet, and `advanceInvocationRunners` now runs **one independent channel per
    summoned copy** (copy 0 keeps the bare timer key; extra copies get suffixed `id#k` keys), so N
    copies cull/persuade at ~N× the rate. Folding the count into efficiency wouldn't work — the
    per-cycle outcome is quantised at `max(1, floor(eff))`, so sub-unit gains would round away. The
    Familiar stays the lone capped runner (the "Special").
  - _PC/Suasio polish._ Confirmed acolyte **delegation works inside the PC**: Decimatio (`caedes`)
    and Indagatio (`indagatio`) render the `+`/− `AcolyteControls` (shown once you hold ≥1 acolyte)
    via `ActionRow`'s delegation slot. Removed the outcome **log from the Suasio scroll** (outcomes
    live in the PC's Logs program). Split the PC's **Depraedatio** program into three tabs — Vitium
    Mercatura (the businesses), Vitium Compositum (the ceremonies), and In Flight (builds under
    construction); the in-flight tab collapses identical builds into one counted row (“6× Street
    food stand”) showing the soonest completion, and the tab carries a live count. Each **Vitium
    Compositum** toggle now explains itself with two lines (`game/compositumText.ts`): a **Cost** line
    (the per-second upkeep, with "and rising" for Panvitium's ramp) and an **Expected outcomes** line
    that spells the effects out concretely — income, biased conversion with the favoured subtypes, the
    percentage breed/cull, the flat suicide/murder/birth shifts, the sharpened subtype penalties, the
    offline-gain boost — instead of the old vague verb.
  - _Ars Goetia types decoupled (no visual change)._ Per the focused Ars-Goetia export, moved
    `GoetiaEntry` / `ArsGoetiaBookProps` into a self-contained `ars-goetia.types.ts` so the grimoire
    no longer depends on the degradation layer's `types.ts`; `ArsGoetiaBook` and `buildGoetia` import
    from there, and the dead `GOETIA_PREVIEW` fixture was removed. The component itself is byte-
    identical to the prior version (only the type-import path differs) and reuses the existing
    `.goetia-*` / `.gb-*` CSS — so this is a pure refactor with no visual/behavioral change.
  - _Ars Goetia copy + Familiar fixes._ The **Familiar** is the base creature, not a ranked seal,
    so it now carries no roman numeral (index and leaf). Removed the decorative “— turn the
    leaf —” line from the index. Rewrote the book's intro so it nods to the conceit that everyone
    can name the famous kings, princes and presidents, but it is the unsung lesser spirits — the
    foot-soldiers and familiars — who actually do the daily work.
  - _Ars Goetia retouch._ A pass over the dark grimoire: the overlay is **blacker** (less of the
    room bleeds through). On the **index**, effect copy is gone — unlocked seals show just their
    name, locked seals show their **requirement in red**, so available vs. blocked reads at a
    glance; the list **paginates** at 10 per leaf with ‹ / › page-turners (hidden when it all fits).
    On the **detail leaf**, illustrations now load from `public/assets/panvitium/invocations-ars-
goetia/<id>.png` (book drawings, not the photorealistic creature art) with a text-plate fallback
    for any seal not yet drawn; the Effect value is no longer red; the duplicate name caption under
    the picture is removed; and the back control is a visible gold-outline **‹ back to index** pill.
  - _Ars Goetia dark restyle._ Reworked the grimoire's look to match the design screenshots: it no
    longer renders as a bright parchment open-book — it floats **light-on-dark** over the degraded
    room. Dropped the `open-book.png` plate, lightened the `.goetia-overlay` so the degraded room
    shows through, and recoloured every `.goetia-*` / `.gb-*` rule onto the palette: titles / names /
    intro / lore in parchment, ranks / stat-labels / illustration caption in gold, and the effect
    hints, the Effect value, the back link and the Summon button in blood-red (Dispel an outline).
    Layout, sizes and the prop-driven component are unchanged — this is the visual change the
    component/CSS exports never actually carried.
  - _Done._ The menu-layer wiring is complete: all three rooms and every diegetic panel (Ars Goetia,
    Altar, Katabasis, Maleficia cabinet, Suasio scroll, PC) now run on real state in their designed
    shells. Backdrops: the **Studio** uses its `studio_complete.png` plate as its base so the desk PC
    and Suasio scroll are drawn under their hotspots; the Invocation room and Altar use their clean
    plates. The remaining `*_complete.png` furnished plates ship and are styled (`.furnished
.scene-*`) but there's no furnish trigger for those two yet — turning them on as the player
    progresses is a design call. Hotspots are boxless: hovering reveals the label (and door glyph)
    without a highlight box. Note runtime art is served from `apps/web/public/assets/panvitium/`; the
    repo-root `assets/` tree is source/staging and unused at runtime. _Dead-weight cleanup done:_ the
    orphaned `useHold` hook, the superseded text panels (`PcPanel`, `ArsGoetiaPanel`) and their dead
    `PANELS` entries, and the unused `menus.data.ts` mock arrays (the `SINS` / `SIGILS` / `BUSINESSES`
    / `DECIMATIO` / `INDAGATIO` / `EMPTIO` / `ACHIEVEMENTS` stand-ins, `MAX_SIN_LEVEL` / `pips`, and
    the per-invocation `effect` copy) were removed, along with the now-orphaned `Sin`-adjacent types
    (`Sigil` / `Business` / `Achievement` / `LogLine`) and the dead sim imports they pulled in;
    `menus.data.ts` now carries only the live `ROOMS` config and the merged-in art/lore flavour. Gate
    stays green. What remains is the content backlog (art/lore for the un-illustrated invocations &
    maleficia, audio).
  - _Ars Goetia effect lines made authoritative._ The grimoire's per-invocation **Effect** line was
    reading hand-authored copy from `menus.data.ts` (`INVOCATION_BY_ID[id].effect`), which had gone
    stale and wrong: Harpy listed _Suasio_ (it's **Decimatio** efficiency), Behemoth listed _×2
    reprobate generation_ (it's a **+Stellar-chance** boost) and via a `\\u00D7` escape rendered the
    literal `\u00D72`, Upir was framed as a passive (it's a **Caedes runner**), Fama showed a
    hardcoded `+50%`, and Lamia/Imp/Succubus/Doppelgänger/Midas/&c. had **no** effect line at all.
    The fix extracts the (correct) sim-derived describe logic that the PC's Analytics → Invocations
    tab already used into a shared `apps/web/src/game/invocationEffect.ts` (`invocationEffectText`),
    and both the grimoire (`buildGoetia`) and the Analytics tab now call it — one source of truth, so
    the menu can't drift again. Runners read _Action · expected outcome (mean ± sd) · every cadence_;
    passives read their live modifier delta (computed for ≥1 copy, so the catalog reads meaningfully
    even before you summon the seal). Also fixed a latent moment-baseline bug in that describe logic:
    an absent tier-weight multiplier is the neutral **1**, not 0, so Behemoth no longer renders blank
    and Midas only reads _Apocalyptic locked_ when the Mark of Cain actually zeroes it. The static
    `effect` strings in `menus.data.ts` are now dead (kept only because the flavour type still
    requires the field) and can be dropped in a follow-up. Effect copy comes from the sim; lore/art
    stay flavour.

### Remaining

Economy-parity tracks still to reconcile against the spreadsheet:

- **Maleficia effects** — the enhancers (Opera-efficiency, sigil-amplifier, Black Candles, and the Anathema multipliers), invoking power, stack caps, **rolled Emptio pricing**, the **Hand of Glory generation buff**, and the **Defixio curse** (sim mechanics) are all done. The **single-use activation UI** (Phase 5 slice) has shipped: the Maleficia cabinet's detail view now carries a **Use** button + status readout (Hand of Glory's remaining buff time, Defixio's active target / "choosing its victim"), wired to a new `activateMaleficium` store action; selection is by id so consuming the last copy can't strand the detail view. The **oracular reveals** (Phase 5 slice) have also shipped: owning Obsidian Mirror / Hollow Effigy / The Dadu / Crossroads Dirt / Crow Feather surfaces a live Opera tier-distribution readout in that item's cabinet detail (a stacked odds bar per action, via a read-only `actionTierDistribution` sim helper that reuses the exact `resolveAction` composition). With this, Maleficia is complete — roster, gating, and every effect.
- **Opera actions** — all six are in the sim with sheet-accurate tiers, Sin-level **availability** gating, and Sin-level **delegation** gating (economy-parity 13–15). _Suasio_ (Suggestion / Logismoi / Imperium) is surfaced on the scroll, and the PC's _Decimatio_ program is complete: _Caedes_, _Pogrom_, and _Purgatio_, each gated by its Ira level. (Post-ADR-024 note: Pogrom culls the single pool — the old present-subtype picker and its no-delegation caveat retired with the subtypes.) Imperium's action time is now **decided at 10s** (the Suasio sheet had left it "Fill Time"; it was a flagged 60s placeholder). The Pogrom (1000) and Purgatio (1,000,000) gold costs are sheet-pinned.
- **Emails (PC program) — impact-feedback system** _(✓ shipped, content authored — 05)_. An inbox that
  surfaces the in-world consequences of the player's descent as incoming correspondence, so the player
  _feels_ the impact rather than reading it only as numbers. The full authored catalog (`docs/05-email-content.md`)
  is in: the household steward, twelve world newsletters, the Church arc, the adversary Fausto Cescru,
  and the madman Reuben Marsh, each with sender / address / subject / body and (where authored) replies.
  Engineering shape: an additive-optional `inbox` save field (ADR-023; resets per lifetime), a pure sim
  engine (`packages/sim/src/emails.ts`) with the trigger catalog + `deliverEmails(state, now)` run as the
  final tick step (so offline catch-up fills the inbox too), and `markEmailRead` / `markAllEmailsRead`
  helpers. Triggers are immediate / timed (armed on `emailArmedAt`) / random (deterministic offset, no
  shared-RNG consumption); replies carry real effects (`flagFatherMad`, `flagReubenDead` + a minted soul,
  Fausto's friendly-branch close and his ×0.33 curse, the door-knock SFX), driven by a monotonic
  `totalSoulsObtained`. Content lives in `strings.emails.catalog` keyed by id. Placed in the PC. New mail
  is surfaced by an unread-count **badge on the Emails tile** (via `unreadCount` + a generic `badges`
  prop on the PC window); there's no separate delivery toast yet, and no lair-level indicator on the PC prop.
- **Smartphone code terminal (studio desk) — [pending design].** A smartphone prop resting on the
  desk in the studio. Tapping it opens a dial-pad where the player enters codes formatted as
  telephone numbers; a recognised number triggers an effect — an easter egg, bonus/extra content, a
  snippet of additional game information or lore, or a gameplay **buff**. The code table and its
  effects are still to be specified. Engineering note: purely informational / easter-egg codes are
  UI-only, but any code that grants a buff or other gameplay effect needs a sim hook (and, if it
  should persist across ticks or sessions, an additive-optional save field per ADR-023).
- **Offline progression — uncap the catch-up** _(✓ shipped)_. The return recap shipped earlier (see
  the 5.4 track); the coupled **uncap** is now done too. `resumeGame` no longer clamps the elapsed
  wall-clock — offline progression accrues for the _full_ time away, however long. This reverses the
  original ADR-004 cap, which is **amended (2026-06-01)** to record the new intent: every offline term
  is safe under an unbounded delta (income / reprobate pools are linear, the apex `eᵗ` ramps self-dispel
  via their `Number.isFinite` guards, Astiwihad's mass-suicide geometric-integrates and saturates at 1)
  _except_ the **Acedia time-compound** `BASE^(offlineMinutes × L²)`, which is exponential in time. That
  one term is therefore the only thing still bounded — its `offlineMinutes` input saturates at the
  former seven-day point (`ACEDIA_COMPOUND_CAP_SECONDS`), so the sloth bonus holds at its prior maximum
  while real time accrues without limit beyond it. The recap's old `capped` flag (and the seven-day
  note) are removed. **Sync note:** the canonical ADR-004 in project knowledge should be updated to match
  the repo's amendment in `docs/04-architecture-decisions.md` — and the project-knowledge copies of
  the docs should pick up **ADR-025 / ADR-026** and the reconciled `02`/`03` from this pass.

**UI work — to be built with Claude Design.** Designed and built in Claude Design. The two items
below — Emails and the smartphone code terminal — are new in-world features whose scope is still being
specified (and may carry a small sim hook of their own). _(The Maleficia "Use" affordance, the PC's
Decimatio program, and the oracular reveals, formerly listed here, have shipped — see the
Maleficia-effects and Opera-actions bullets above. That clears all three of the surface-the-built-sim
items; the rest of this list is net-new features.)_

- **Emails (PC program).** _(✓ shipped — see the impact-feedback bullet above.)_ The inbox, sim
  triggers and save field are built; only content/trigger tuning and presentation polish remain (a
  Claude Design topic).
- **Smartphone code terminal.** The studio-desk dial-pad described above — its presentation and the
  telephone-number code-entry interaction are a Claude Design topic; buff-granting codes additionally
  need a small sim hook.

**Needs a spreadsheet / model decision (not a coding or design task).** Each item below is blocked
only on a number or mechanic being settled on the sheet; once it is, each is a straightforward slice:

- **The last 4 sigils** — _all resolved and shipped._ Haures #64 (Cholerics killable by default +
  Choleric-targeting murder bias), Ose #57 / Orias #59 (conversion re-roll toward the minority /
  majority subtype), and Vual #47 (softens the Degenerate suicide/murder penalties). See Status.
- **Imperium's action time** — _decided at 10s_ (the Suasio sheet had left it "Fill Time").
- **Placeholder sweep** — _audited and reconciled._ No value changes were needed (every flag was
  either stale or pointed to a magnitude the sheet doesn't pin); comments were corrected. See 5.5.

Blocked on inputs that don't live in a coding session (independent of the above):

- **Art & audio** — the designed room/menu layer and its plates have landed (`apps/web/src/menus/`
  - `public/assets/panvitium/`); what remains is wiring that layer to the store and any further art
    via the ADR-021 degraded-photoreal pipeline plus Howler audio content.
- **Final economy tuning** — any magnitudes not yet pinned to the sheet remain placeholders, flagged
  inline; the numbers are loaded from `Panvitium_Economy_Template.xlsx` (spreadsheet always wins).

## Phase 5 roadmap — surface, feel, and launch

> A **plan**, not a progress log. The `## Status` section above stays the authoritative record of what
> has shipped; this section sequences what comes next and reorganizes the `### Remaining` backlog into
> tracks. Each track ships the usual way — small, individually gate-green slices, one overlay tarball at
> a time (delivery convention in the `panvitium` skill, §4) — and as work lands it moves out of here and
> into `## Status`. Items that already carry a tested sim/mechanic are flagged _sim done_; items still
> waiting on a number, a model decision, or a design scope are flagged as such, because those gate _when_
> a slice can start, not how hard it is.

With Phases 2–4 and the bulk of the economy-parity pass closed, the game is mechanically complete and
playable end-to-end. Phase 5 turns that into a finished, launchable product: every built system gets a
player-facing surface, the world looks and sounds the way ADR-021 (degraded-photoreal art) and ADR-014
(Howler audio) intend, a cold-start player can find their footing, and the scaffolded stack
(ADR-016–019) actually runs in production. The six tracks below are ordered roughly by dependency and
risk — 5.1, 5.3, and 5.4 can run in parallel, 5.2 and 5.5 wait on decisions, and 5.6 gates on the others
being substantially done.

### 5.1 — Surface the built sim (Claude Design) — ✓ complete

_Three affordances whose mechanic was already implemented and tested, needing only their player
surface. All three have shipped (no new mechanic — the only sim addition was a read-only
`actionTierDistribution` helper for the reveals)._

- **The "Use" affordance** _(✓ shipped)_. A Use button plus a status readout in the
  Maleficia specimen-cabinet detail view, wired to the `activateMaleficium` store action, for the
  two consumables: **Hand of Glory** (remaining buff time) and **Defixio** (active curse's target,
  or "choosing its victim" before the roll). Selection is by id so consuming the last copy can't
  strand the detail view. Pinned by adapter + store unit tests; the Playwright e2e step is deferred to
  a machine with a browser (and would benefit from a localStorage save-seed helper).
- **Oracular reveals** _(✓ shipped)_. Owning an oracular item surfaces a live Opera tier-distribution
  readout in its cabinet detail — a stacked odds bar per action, computed by the read-only
  `actionTierDistribution` sim helper (so the odds always match an actual cast). Per the **catalog**
  (authoritative): Hollow Effigy → _Suasio_, The Dadu → _Decimatio_, Crossroads Dirt → _Emptio_, Crow
  Feather → _Indagatio_, Obsidian Mirror → all four. (The earlier README prose had Crossroads/Crow
  swapped — corrected here.) Pinned by `buildOracle` + `actionTierDistribution` unit tests.
- **Complete the PC's Decimatio program** _(✓ shipped)_. The PC's _Decimatio_ program now carries
  _Caedes_, _Pogrom_ (then with a present-subtype picker wiring `act('pogrom', subtype)`), and
  _Purgatio_, each gated by its Ira level; delegation was offered on Caedes/Purgatio but not Pogrom.
  _(Post-ADR-024: Pogrom culls the single pool; the picker and the delegation caveat retired with
  the subtypes.)_ Decimatio lives entirely in the PC, never on the Suasio scroll.
  Pinned by a `pogromTargets` adapter test; the Playwright e2e step is deferred to a machine with a
  browser.

**Done** — all three surfaces drive live store/sim reads and are pinned by unit/adapter tests; the
Playwright e2e steps are deferred to a browser-capable machine (they'd want a localStorage save-seed
helper to reach the required state, a small task of its own).

### 5.1b — Katabasis visual rework (Claude Design)

_A faithful rebuild of the Katabasis surface from a dedicated Claude Design handoff — the descent as
a cinematic sequence rather than a flat menu. Delivered in two gate-green slices, **both shipped**:
K1 (the descent) and K2 (the in-room altar → gate reconciliation)._

- **K1 — the cinematic descent** _(✓ shipped)_. The `menu` phase is now a full-screen flow: a commit
  **Altar gate** → an Abyss descent transition → the **Court of Spires** (the eight Princes under
  live lightning, with full-screen text takeovers bound to real `sinLevel` / `skillIntensity` /
  `devotionForLevel`) ⇄ the **Goetia** (all 72 seals carved in a basalt slab, molten where souls are
  bound, the _Semet_ #32 cell sealed until every Cardinal Sin is Rank 2) → an ascent transition → the
  **"You Rise"** recap → the **Semet** reveal (overlaid, so it never loses the player's place in the
  descent). All offering / binding drives the existing store actions — no sim or save change — and the
  whole flow is scoped under `.katabasis-flow` so its local palette can't disturb the app. New: a
  per-Prince lore block in `strings.sins`, the `IM Fell English SC` inscription face, and an
  ambient-score hook. The in-room `AltarPanel` still triggers `beginKatabasis()`, which now opens the
  full-screen gate as screen 0. Pinned by a `Katabasis.test.ts` render suite (altar gate, two-press
  arming, "You Rise" reading committed state, reveal-over-flow); all seven screens were visually
  verified against the handoff via Playwright. Runtime art (`katabasis{,2,3,_end}.png`,
  `sigil-slab-{dark,molten}.png`) is placed under `public/assets/panvitium/katabasis/` on apply.
- **K2 — in-room altar reconciliation** _(✓ shipped)_. Clicking the in-room Altar now goes straight
  to the full-screen gate (a new `{ type: 'altar' }` hotspot action → a new `openKatabasis` store
  action that opens the gate **without** the destructive teardown). The gate is the single point of
  no return: its two-press commit fires `beginKatabasis` (the teardown + freeze) and falls into the
  descent, while a new **"Turn away — climb back to the altar room"** affordance calls `closeKatabasis`
  for a clean exit (nothing has been torn down yet). The old intermediate stone-ledger panel
  (`AltarPanel` / the `altar-menu` panel) is removed; its per-Prince Devotion review is folded onto the
  gate as a compact "your standing" strip, reusing the tested `buildAltar` view-model. Pinned by an
  `openKatabasis` store test (opens the gate, no teardown) and three gate render tests (standing
  readout, turn-away returns to the room, commit enters Katabasis + descends); the full altar → gate →
  descend / turn-away flow was verified through the real UI via Playwright.

**Done** — both slices have shipped gate-green; what remains for the descent is the audio asset (5.3)
and an e2e step on a browser-capable machine.

### 5.2 — New diegetic features (Claude Design + a small sim hook)

_Net-new in-world systems already named in the backlog; **scope, triggers, and presentation are still to
be specified** — each needs a short design pass before it becomes a slice._

- **Emails (PC program) — impact-feedback** _(✓ shipped, content authored — 05)_. An inbox that surfaces
  the in-world consequences of the player's descent as incoming correspondence, so the player _feels_ the
  impact rather than only reading numbers. The authored catalog (`docs/05-email-content.md`) and its
  trigger / flag / reply-effect engine are in (immediate / timed / random triggers, reply consequences,
  the Fausto curse, the door-knock SFX), all on additive-optional save fields (ADR-023).
- **Smartphone code terminal (studio desk).** A smartphone prop on the studio desk that opens a dial-pad;
  a recognised telephone-number code triggers an easter egg, bonus content, a lore snippet, or a gameplay
  **buff**. Informational/easter-egg codes are UI-only; any buff-granting code needs a sim hook (and, if it
  should persist, an additive-optional save field per ADR-023). The code table and its effects are still
  to be specified.

**Done when** the scope is agreed in design, any sim hook lands with focused Vitest pins, and the surface
ships behind an e2e step.

### 5.3 — Art & audio (ADR-021 + ADR-014)

_The track gated on the `assets/` tree (which lives in the repo but outside a coding session) and the
single GIMP degrade recipe. The room/menu degraded-photoreal pipeline is already in; what remains is
content._

- **Illustration.** Draw the un-illustrated invocations and maleficia — both the Ars Goetia _book_
  drawings (`public/assets/panvitium/invocations-ars-goetia/<id>.png`, currently a text-plate fallback for
  un-drawn seals) and the photoreal specimen art for the Maleficia cabinet — through the one ADR-021
  degrade recipe, so the whole diegetic frame reads at a single fidelity.
- **Audio.** Bring up the Howler layer over the existing `audio.play(event)` stub (ADR-014): settle the
  event taxonomy, supply the asset set, and add a mute/volume control (which folds into the settings panel
  in 5.4).

**Done when** every catalog entry has art (no text-plate fallbacks remain) and the core events have sound.

### 5.4 — Onboarding & game feel

_Forward-looking — not yet in the backlog; **confirm scope before coding**. None of this is new gameplay;
it is the UX an idle game needs to keep a cold-start player past the first minutes._

- **First-run ramp.** A light guided opening — the first _Suasio_, the first Devotion threshold, the first
  _Katabasis_ — surfaced as gentle prompts rather than a heavy modal tutorial.
- **Help & glossary.** Tooltips on resources, the seven outcome tiers, and the modifier readouts; a short
  glossary that explains (without anglicizing) the Latin — _Opera_, _Suasio_, _Decimatio_, _Katabasis_,
  _Vitium Compositum_, and the rest.
- **Readability** _(✓ shipped)_. BigNum displays use **consistent short-scale suffixing**:
  `formatBigNum` reads as grouped integers below a million, then M / B / T / … / Dc suffixes, then
  compact scientific beyond the ladder for the astronomical endgame — so values stay legible deep into
  a run. **Per-second rate readouts** exist too: a read-only `perSecondRates(state)` sim helper mirrors
  the tick's income terms (zeroing while frozen mid-descent or under Morpheus), pinned by parity tests
  (the readout equals the gold the tick actually accrues over one second). These now surface in the
  **Analytics** program rather than the HUD (see below).
- **Analytics PC program** _(✓ shipped)_. The always-on readouts were pulled off the HUD entirely, and
  the HUD itself is gone — the PANVITIUM wordmark was removed from the screen too (its gold-leaf
  display-caps treatment is preserved, unmounted, in `Hud.tsx` / the `.game-name` rule for reuse).
  Everything moved into this on-demand PC program (between Emptio and Achievements). Four tabs:
  **Main** (default) folds the former Resources tab in and lists, in order: **Souls**, **Influence**,
  **Gold** (with `perSecondRates` and the influence cap), the **current player action** as a progress
  bar, **player action efficiency** as a labelled value, and the **vigil** clock; **Reprobates**
  (the population count plus `reprobateRates` generation / death rates — this also subsumes the old
  HUD reprobate count; the original tab's per-subtype and conversion readouts retired with
  ADR-024); **Acolytes** (a per-acolyte board showing
  each one's current action, remaining cycle time, and a progress bar); and **Invocations** (every
  bound invocation type, **one line each** — no per-copy detail, for performance). A type that
  **carries actions** (the autonomous runners: Familiar, Imp, Upir, Lamia) shows its **action**, the
  **expected outcome of one cycle** as `mean ± sd` per affected resource, and the **cadence**
  (`runnerCycleDuration` at the live channel efficiency). The expected outcome comes from a new pure
  sim helper `actionOutcomeForecast(state, actionId, eff, forcedTier?)`, which computes the first two
  moments in closed form from the live tier distribution (or a forced tier) × each tier's per-dimension
  delta moments (fixed amounts, `randint` ranges, %-of-population culls), combined via the law of total
  variance — no sampling, deterministic, and Monte-Carlo-validated against the real resolver in the sim
  tests so it can't drift. So the Imp's forced-Good Caedes reads _+1 soul, −1 reprobate · every 10s_
  (deterministic, sd 0), a Lamia's Suggestion reads e.g. _+0.61 ±0.52 reprobates, +0.15 souls · every
  5s_, and the Familiar's Indagatio reads its expected maleficia surfaced per cycle. The qualitative
  "culls reprobates" phrasing it replaced wasn't enough — outcomes are now always listed as an expected
  value with its deviation.
  A **passive** type shows its **live quantified total effect** at the current bound count — computed
  by diffing the real modifier bundle (`computeModifiers`) with vs without that invocation, so each
  contribution is isolated exactly (composition is multiplicative/additive). So Fama ×2 reads
  _+10% influence gain_, Midas _×3 gold · ×100 Apocalyptic chance_, Doppelgänger _+50% player
  efficiency · −50% influence_, etc.; entities whose effect isn't a modifier-bundle magnitude
  (the Katabasis apexes Erinyes/Morpheus, the per-tick apexes, the conversion-bias Specunitas) fall
  back to a qualitative line. The earlier expandable per-copy action bars were **removed** for
  performance (they were the heavy part — N live-updating bars at 10 Hz); `invocationRunnerEfficiency`
  and `invocationRunnerKey` remain exported (the sim's `advanceInvocationRunners` uses the former, so
  UI and sim can't drift). The HUD progress bars that remain — player and acolyte —
  run through one shared rule (`game/progress.ts → actionProgress`,
  built on the sim's `runnerCycleDuration`): the bar always fills **0 → 100%**; higher efficiency on a
  time-mode action makes it fill _faster_ (a smaller total) rather than starting partway, and
  cost-outcome actions keep a fixed duration. Reuses the existing `kat-tab` tab styling; the data all
  comes from already-tested sim helpers. The **PC Logs program is now player-only**: `OutcomeEvent`
  carries an additive-optional `source` tag (`'player' | 'acolyte' | 'invocation'`, transient — not
  persisted), the tick tags acolyte and invocation-runner outcomes accordingly, and the store folds
  only untagged (player) outcomes into the log — acolyte/invocation work has its own surfaces in the
  Analytics tabs. Signature Stellar/Apocalyptic pop-ups still fire from any source.
  carries an additive-optional `source` tag (`'player' | 'acolyte' | 'invocation'`, transient — not
  persisted), the tick tags acolyte and invocation-runner outcomes accordingly, and the store folds
  only untagged (player) outcomes into the log — acolyte/invocation work has its own surfaces in the
  Analytics tabs. Signature Stellar/Apocalyptic pop-ups still fire from any source.
- **Settings / options panel** _(partly shipped)_. A gear in the top-right opens a settings overlay.
  **Shipped:** local-first save tools — **export** (serialize the current game to a portable string via
  `serializeSaveBlob`), **import** (replace the game from a pasted save, validated through `parseSaveBlob`
  → `migrateSave`, written and re-loaded like the conflict chooser's adopt path), and a **guarded hard
  reset** (two-step confirm). Backed by `exportSave` / `importSave` store actions and round-trip +
  rejection tests. **Still to do in this panel:** audio controls (wait on the 5.3 art/audio track) and
  the `DegradePass` knobs (the engine already exposes them).
- **Return-from-away recap** _(✓ shipped)_. A welcome-back screen on resume showing the time away and
  the net souls / gold / influence / reprobates that accrued, replacing the old silent catch-up. Driven
  by a pure `offlineRecap(saved, resumed, now)` diff (separate from `resumeGame`, so its tests stay
  intact), threaded through `loadGame` into a store `offlineRecap` + `dismissOfflineRecap`, and mounted
  as `WelcomeBackModal`. Suppressed for absences under a minute and while frozen mid-descent; it carries
  a `capped` flag (pairs with the still-pending **uncap** decision in `### Remaining`). Pinned by
  `offlineRecap` unit tests.
- **Launch title menu** _(✓ shipped)_. A full-screen title screen on every launch (`TitleMenu`, gated by
  a new `titleOpen` store flag) carrying the gold-leaf **PANVITIUM** wordmark — the display-caps treatment
  preserved from the old in-game wordmark — the Latin motto _Per vitia, ad solium_, and four entries:
  **Continue**, **New Game** (confirm-guarded wipe via `hardReset`), **Settings** (the existing overlay,
  whose open-state was lifted into the store as `settingsOpen` so both the gear and the menu drive it),
  and **About**. The sim is frozen behind the menu exactly like the Katabasis trance: `advance` no-ops
  while `titleOpen`. **Music + entry transition** (`TitleSequence`): a looping menu track
  (`gnossienne_1.mp3`, played via a plain HTML5 `<audio>` element — no new dependency — at
  `/assets/panvitium/music/`, with an autoplay-after-first-gesture fallback for browser policy); on
  Continue the screen fades to black while the music fades out over the same window, the title is
  dismissed at full black, then the black fades out so the altar room rises slowly from darkness.
  `TitleSequence` lives in `App` so the timeline outlives the menu's unmount. Pinned by a `TitleMenu`
  render test and a store freeze test.
- **Notifications** _(declined)_. Considered folding the achievement toast, `TickResult.notices`, and sync
  status into one surface; the design call was to keep distinct signals in their own homes.

**Done when** a player starting from a cold save reaches their first _Katabasis_ unaided in playtest.

### 5.5 — Economy finalization

_Blocked on a number or a model decision on `Panvitium_Economy_Template.xlsx`, not on effort — once each
is settled it is a straightforward slice (the spreadsheet always wins on numbers and on a system's
composition)._

- **The last 4 sigils** _(✓ shipped, superseded twice)_. **Haures #64**, **Ose #57 / Orias #59**, and
  **Vual #47** landed with their subtype/conversion mechanics, were neutralized to `inert` by
  **ADR-024**, and now carry their revised-sheet effects per **ADR-029** — along with the other
  twelve orphans. No sigil is inert anymore.
- **Imperium's action time** _(✓ shipped)_. Decided at 10s (the _Suasio_ sheet had left it "Fill Time";
  was a flagged 60s placeholder).
- **Placeholder sweep** _(✓ shipped)_. Audited every inline-flagged magnitude against the sheet. The
  verdict: **no value changes were needed** — each flag was either stale (the value is already
  sheet-accurate, just mis-commented) or pointed to a magnitude the sheet doesn't pin. Reconciled the
  comments: the Choleric-murder base (0.001) is sheet-pinned (Globals); Bacchanal's 10% and Panvitium's
  costs / 0.01 conversion / eᵗ growth all derive from Globals; the invocation effect factors are the
  Invocatio sheet's Efficiency column. The genuinely unpinned tuning values (no sheet number, so they
  stay as-is) are the Acedia offline-compound base `1.00002`, the Panvitium churn multipliers
  (gen/suicide/murder while active, in `modifiers.ts`), and — at the time — the subtype
  secondary-effect magnitudes, since removed wholesale by ADR-024.

**Done when** no placeholder magnitudes remain flagged. **✓ Done** — the sweep above reconciled them.
(All 72 sigils _bind_ and **none are `inert`** — the orphaned-sigils pass shipped as **ADR-029**,
giving the 16 sigils that ADR-024 had neutralized their revised-sheet effects.)

> **Open question for the economy owner** — _closed by ADR-024:_ the per-subtype "Effect per unit"
> question is moot now that subtypes and their secondary rate effects are removed entirely.

### 5.6 — Production readiness & launch

_The scaffolded infrastructure (Phase 2) becomes a live service. Touches ADR-010/011/016–019/023; gates on
the other tracks being substantially done._

- **Deploy path.** Exercise it end-to-end: `main` builds/tests/publishes GHCR images, `release` is the
  deploy gate, and a webhook deploys onto the single VPS behind Caddy auto-HTTPS (ADR-016/017). No
  auto-deploy from `main`.
- **Backups.** Nightly `age`-encrypted `pg_dump` to B2/R2, with the weekly restore test actually running
  (ADR-018).
- **Observability.** Dozzle + UptimeRobot live now; self-hosted PostHog later (ADR-019).
- **Hardening before it bites.** Turn on HMAC-signed saves (ADR-011). The save-migration path
  (ADR-023) is already live and proven — two real migrations ship with unit tests (`v1→v2` ADR-024,
  `v2→v3` ADR-025; the schema is at **v3**) — so what remains is exercising a real migrated save
  through a production `pg_dump` → restore as part of the backup test (ADR-018).
- **Performance & accessibility.** Offline catch-up at large capped deltas, the `DegradePass` canvas cost,
  and keyboard / assistive-tech reach across the diegetic panels.
- **Beta → launch.** A closed beta cohort, then launch.

**Done when** the game runs on the VPS, survives a restore test, monitoring is green, and a beta cohort is
playing.

## License

Proprietary. All rights reserved.
