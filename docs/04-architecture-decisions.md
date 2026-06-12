# 04 — Architecture Decision Records

This document captures the architectural decisions taken during the project's lifetime. Each record states the context, the decision, what it costs us, and what we rejected.

**Conventions.**
- `Accepted` — decision is in force and should be relied on.
- `Proposed` — direction agreed, but room remains to revise before code commits.
- `Deferred` — deliberate non-decision; date the conversation, not the resolution.
- `Superseded by ADR-NNN` — kept for history; do not act on.

If any of the records below should be downgraded from `Accepted` to `Proposed`, change the status line; do not delete the record.

---

## ADR-001: Frontend framework — React + TypeScript + Vite

**Status:** Accepted 2026-05-14

**Context.** The game is a single-page browser application with a three-room interactive UI, many menu panels, and a tick loop driving frequent state updates. The math surface (stacking sigil, sin, invocation, maleficium, and reprobate-subtype modifiers converging on single resource values) is where the project is most likely to regress under continuous tuning. A type system is not a nice-to-have on that surface.

**Decision.** React 18 + TypeScript (strict mode) + Vite as the dev/build toolchain.

**Consequences.**
- Mature ecosystem for menu components, animation, forms, accessibility.
- Vite's HMR keeps iteration fast even with large modifier graphs.
- Bundle size is acceptable for this scale; tree-shaking handled by Vite.
- TypeScript strictness will catch most modifier-math bugs at compile time.
- Re-render cost requires care for high-frequency counters — see ADR-003.

**Alternatives considered.**
- Svelte: smaller bundles, faster reactivity, but smaller game-adjacent ecosystem and less material for a solo developer to lean on.
- Solid: closer to bare metal, but the ecosystem and hiring surface are thin.
- Plain JS + Canvas: rejected — wastes the menu surface, which is the bulk of the UI.

---

## ADR-002: Room rendering — DOM-first, sprite-layer composition

**Status:** Accepted 2026-05-14 (rendering detail amended by ADR-021, 2026-05-22)

**Context.** Each room (Studio, Altar room, Invocation Room) is composed from many small sprite layers — decor, fixtures, active-invocation silhouettes, mood overlays (the red glow of *Panvitium* on the Studio window). Rooms are mostly static backgrounds with discrete click regions and modest per-layer animation needs (candle flicker, fireplace, silhouette idle loops).

**Decision.** Render rooms as a stack of positioned `<div>`s and `<img>`s, organized through a scene-graph abstraction (`Room` → `Layer[]`, each layer has position, z-index, click region, optional animation). PixiJS reserved as an explicit escape hatch if a future requirement (particles, hundreds of layers, frame-synchronized animation) demands it. **The rendering detail (pixelation strategy, asset resolution) is amended by ADR-021 — see that record for the current pipeline; this ADR retains the DOM-first scene-graph framework.**

**Consequences.**
- Fast iteration; layers are inspectable in browser DevTools.
- React handles click and hover natively; no bridge between Canvas and React menus.
- CSS keyframes cover candle flicker, fireplace crackle, *Panvitium* overlay pulses.
- The scene-graph abstraction means a future renderer swap touches one module, not every room.
- Performance ceiling is lower than Canvas — at hundreds of animated layers we would feel it. We are not near that ceiling.

**Alternatives considered.**
- PixiJS from day 1: rejected for now — adds setup cost and a React/Canvas bridge before we know we need the headroom.
- Phaser: rejected — the game-engine framing fights React's component model for the menu surface.
- Single PNG per room: rejected — user requirement is many small composable sprite layers.

**Amendment (ADR-021, 2026-05-22).** The `image-rendering: pixelated` decision and the implicit "sprite layers at *native pixel size*" framing are amended by ADR-021. Pixelation is now baked into high-resolution source assets via the GIMP recipe, layers are stored at a high base resolution (~1280×720), and rendering uses default/auto image rendering rather than `pixelated`. The DOM-first, positioned-layer, scene-graph composition described above is otherwise unchanged and remains in force.

---

## ADR-003: Client state management — Zustand

**Status:** Accepted 2026-05-14

**Context.** A 10 Hz tick loop writes to global game state. Many components subscribe to slices of that state — resource bars, panel contents, active-invocation rendering. React Context re-renders all subscribers on any change; that is the wrong shape for this access pattern.

**Decision.** Zustand for the global game store. Selector-based subscriptions so each component only re-renders on the slice it reads. UI-only state (open menus, hover, modals) stays in local component state.

**Consequences.**
- Tiny bundle, no boilerplate, idiomatic with React.
- Per-second tick writes do not cascade through unrelated components.
- Store is plain serializable JS, friendly to save/load.
- Immer can be added later if mutation patterns get unwieldy.

**Alternatives considered.**
- Redux Toolkit: overkill for one developer at this scale.
- React Context: wrong re-render shape for the tick loop.
- Jotai: atomic state model is a poor fit for a cohesive game-state object.
- MobX: mutable reactivity is harder to serialize cleanly.

---

## ADR-004: Tick loop — fixed-timestep RAF with accumulator

**Status:** Accepted 2026-05-14

**Context.** Toggles consume resources per second, action timers tick down, counters accumulate, and the player can background the tab or close the laptop and come back hours later. The loop must be deterministic, must survive tab throttling, and must compute offline progression on load.

**Decision.** A single `requestAnimationFrame` driver. Internal logical tick is 100 ms (10 Hz). An accumulator captures wall-clock delta and flushes whole ticks per frame, so a slow or backgrounded tab catches up correctly. Offline progression is computed on load as the same tick function called once with `delta = (Date.now() − lastSaveAt) / 1000` seconds, capped to a sane maximum.

**Consequences.**
- Deterministic: same inputs produce same outputs across machines.
- The offline-gain code path is the same as the online one — no duplicate logic to drift.
- 10 Hz is invisible to the player for accumulating counters and cheap for the CPU.
- Tick function must remain pure with respect to the store (no DOM access, no `Math.random` outside seeded RNG — see ADR-011).

**Alternatives considered.**
- `setInterval`: drifts; pauses or throttles in background tabs.
- Real-time wall-clock polling: loses the elegance of "online tick = offline tick."
- Variable timestep: introduces nondeterminism, complicates the test surface.

**Amendment (2026-06-01) — offline progression is uncapped.** The "capped to a sane maximum" clause is superseded: offline progression now accrues for the *full* elapsed wall-clock, however long the absence. The original cap existed so a long absence couldn't fast-forward unbounded time and warp the economy; in practice every offline term is safe under an unbounded delta *except one*. Income and the reprobate pools are linear in time; the apex `eᵗ` ramps (Panvitium, Aurevora) self-dispel via their `Number.isFinite` guards; Astiwihad's mass-suicide uses the geometric integration `1 − (1 − p)^Δt`, saturating at 1. The sole term that is exponential in time is the **Acedia time-compound bonus** `BASE^(offlineMinutes × L²)`. It is therefore the only thing now bounded: its `offlineMinutes` input saturates at the former seven-day cap (`ACEDIA_COMPOUND_CAP_SECONDS` in `apps/web/src/game/session.ts`), so the sloth bonus holds at its previous maximum while real time accrues without limit beyond it. The "online tick = offline tick" property, and the determinism and purity consequences above, are unchanged. (The earlier seven-day cap and the welcome-back recap's `capped` flag are removed.)

---

## ADR-005: Big-number arithmetic — break_infinity.js

**Status:** Accepted 2026-05-14

**Context.** Hard-spec numbers reach 8 billion (the Eternal Sin reveal threshold). Under stacking sigil bindings, sin skill multipliers, and the exponential growth of *Panvitium* gold cost, intermediate values can exceed `Number.MAX_SAFE_INTEGER` (9.007 × 10¹⁵). The systems doc explicitly anticipates this.

**Decision.** All gameplay resource values (souls, gold, influence, Devotion totals, sigil-bound counts, intermediate scaling factors) stored and computed as `Decimal` from break_infinity.js. Naturally-bounded integer counts (reprobate counts by subtype, acolytes, invocation counts) stay as plain `number`. A thin `BigNum` helper module wraps the most-used operations so the rest of the codebase doesn't read `a.add(b).mul(c)` everywhere.

**Consequences.**
- Operator-call syntax replaces infix arithmetic — discipline required, the helper module reduces friction.
- Arithmetic is 10× to 100× slower than native — negligible at our tick budget but worth knowing.
- Serialization needs explicit `toJSON` / `fromJSON` helpers in the save format.
- Range is effectively unbounded for any value this game will ever generate.

**Alternatives considered.**
- Plain `number`: rejected — design floor crosses MAX_SAFE_INTEGER once modifier stacking starts.
- BigInt: rejected — no fractional support; idle games need fractions for rates and multipliers.
- decimal.js: heavier; arbitrary precision we don't need.
- break_eternity.js: supports 10↑↑308; overkill — we are nowhere near needing it.

---

## ADR-006: Persistence — local-first, cloud-synced

**Status:** Accepted 2026-05-14

**Context.** Multi-user accounts are confirmed in phase 1. The game must still work offline as a first-class case — latency on every action would ruin the feel, and players will be on planes, trains, and patchy hotel Wi-Fi.

**Decision.** Game state writes to `localStorage` on every save event (debounced, every 10–30 seconds and on significant state changes). Logged-in users additionally push the save to the server on the same cadence and on `beforeunload` via `navigator.sendBeacon`. The server stores the latest accepted save plus a rolling history of the last ten accepted versions for recovery.

**Consequences.**
- The game is fully playable signed-out and offline.
- Cloud-save is a backup and cross-device feature, not a runtime dependency.
- Network failure never blocks gameplay.
- localStorage version field drives forward migration on load and rejection of unknown future versions (see ADR-023 for the evolution policy).
- Save blob size budget: 100 KB compressed is the hard ceiling; alert if approached.

**Alternatives considered.**
- Server-authoritative: kills offline play, raises latency on every action, complicates anti-cheat without solving it.
- Local-only: rejected by user requirement (accounts confirmed).
- IndexedDB: overkill for save sizes well under 100 KB.

---

## ADR-007: Backend stack — Node + Fastify + TypeScript

**Status:** Accepted 2026-05-14

**Context.** The backend serves accounts, authentication, save sync, and eventually leaderboards. Solo developer ergonomics matter — one language across the stack reduces context-switching cost.

**Decision.** Node 22 LTS + Fastify + TypeScript. Save schema and game-state types live in a shared workspace package consumed by both client and server, so the wire format is checked at compile time on both ends.

**Consequences.**
- One language across the codebase; shared types prevent drift.
- Fastify is fast, has built-in JSON schema validation via Ajv, and a mature plugin ecosystem.
- Small container footprint; trivial to deploy.
- Shares the same test runner (Vitest) as the frontend.

**Alternatives considered.**
- FastAPI / Python: language split costs more than it saves for one developer.
- Go: faster runtime, but no shared types with the frontend and slower iteration on schema changes.
- Hono: newer, smaller community.
- Express: slower; less ergonomic with TypeScript.

---

## ADR-008: Database — PostgreSQL 16

**Status:** Accepted 2026-05-14

**Context.** We need durable storage for users, sessions, save blobs, save history, and eventually leaderboard records and audit trails. Save blobs are opaque JSON; user records are relational.

**Decision.** PostgreSQL 16 in its own container. Schema-light approach: relational tables for users / sessions / metadata, JSONB columns for save blobs. Drizzle ORM for type-safe queries; raw SQL where Drizzle adds friction. Redis deferred until rate-limiting or session caching is a measured hotspot.

**Consequences.**
- Boring, reliable, well-understood; the right kind of choice for the data layer.
- JSONB columns absorb save-format evolution without DDL churn.
- Full SQL available for future leaderboard queries, analytics, replay tools.
- One stateful service to back up and restore (see ADR-018).

**Alternatives considered.**
- SQLite: multi-user/multi-process write contention complicates the story.
- MongoDB: no benefit at this shape; loses SQL.
- MySQL/MariaDB: acceptable, but PostgreSQL is stronger on JSON.

---

## ADR-009: Authentication — email magic links + Discord OAuth

**Status:** Accepted 2026-05-14

**Context.** The target audience (r/incremental_games) overlaps heavily with Discord. Password storage is a liability with non-trivial security surface. Signup friction directly affects whether players opt into accounts at all.

**Decision.** Two login paths: (a) email magic links (one-time signed tokens sent via Resend or self-hosted SMTP), (b) Discord OAuth. Sessions via signed HTTP-only `Secure` cookies with `SameSite=Lax`. No password hashes stored. Account recovery via the email on file.

**Consequences.**
- No password column means no password breach to suffer or disclose.
- Signup is one email or one Discord click.
- Cookie auth is simpler than JWT for a browser SPA — no token refresh dance, no localStorage exposure.
- Edge case: a player who loses access to their email is locked out; recovery flow needs design before launch.

**Alternatives considered.**
- Password + email: rejected — security surface not worth it for a game.
- Auth0 / Clerk: rejected — cost and vendor lock-in for a feature we can ship in a few hundred lines.
- Discord-only OAuth: rejected — excludes the non-Discord segment of the audience.

---

## ADR-010: Save synchronization — client-authoritative with monotonic-version conflict resolution

**Status:** Accepted 2026-05-14

**Context.** Cloud-save must not silently overwrite a player's progress when they play on a second device, when a flaky connection rolls a stale save back, or when the server crashes mid-write.

**Decision.** Each save carries `{ schemaVersion, saveVersion, lastTickAt, deviceId }`. The client submits a save with the current `saveVersion`. The server accepts only if the stored `saveVersion` is less than or equal to the submitted one. On rejection, the client receives the server's save and prompts the player with a chooser showing both summaries (in-game time, souls, sin levels). The server retains the last ten accepted saves per user for recovery.

**Consequences.**
- No silent overwrites; multi-device play is supported but the player is in the loop on divergence.
- Server crashes mid-write are recoverable from the version-history table.
- Client must handle the "your local save is older" UX gracefully.
- The chooser UI is its own design problem — design before exposing multi-device.

**Alternatives considered.**
- Server-authoritative: kills offline, raises latency, doesn't solve cheating.
- Last-write-wins: loses player progress without their knowledge.
- CRDT-style merge: too complex for a save with heavily derived state.

---

## ADR-011: Anti-tampering posture — minimal now, structured for later

**Status:** Accepted 2026-05-14

**Context.** Idle games are trivially client-cheatable. With no public leaderboards in scope yet, the cost of cheating is low. But the design (Eternal Sin → potential future Ladder) telegraphs that leaderboards are eventually coming, and ladder integrity is far harder to retrofit.

**Decision.** Phase 1: the server validates that incoming saves carry a monotonically increasing `lastTickAt`, that the wall-clock delta between submissions is plausible (no fake offline-progression of years), and that the schemaVersion is one the server recognizes. Save blobs are HMAC-signed by the server on storage so out-of-band edits are detectable on next load. Game RNG uses a seeded PRNG keyed to the save, so a replay validator can be added later without breaking determinism.

**Consequences.**
- The save format is forward-compatible with server-side replay validation.
- We do not ship a paranoid client (obfuscation, integrity checks) — the audience is technical and hostile UX would land badly.
- Public leaderboards are off-limits in this state. Do not expose one until replay validation lands.
- Determinism requirement falls on every randomized system from day 1 — RNG is injected, not global.

**Alternatives considered.**
- Full server-side simulation: extremely expensive; correct answer for a competitive ladder, wrong answer for phase 1.
- Obfuscated client: false security; antagonizes modders for no real gain.
- Nothing at all: leaves a structural hole that gets expensive to fix later.

---

## ADR-012: Testing — Vitest + Playwright

**Status:** Accepted 2026-05-14

**Context.** The game's correctness lives in math: probability tier normalization, sigil binding curves, the 180^X devotion ladder, the skill intensity formula, exponential *Panvitium* cost, offline gain integration, per-tier modifier composition. Math is exactly what regresses under continuous tuning, and tuning is what we will do most.

**Decision.** Vitest for unit tests against the pure-functional game-math package (`packages/sim`). Playwright for end-to-end: a full Katabasis, save/refresh, cloud-sync roundtrip, two-device divergence-and-chooser. CI runs unit tests on every push; e2e tests on PRs to `main` and on release tags.

**Consequences.**
- Tuning numbers is safe — every coefficient change runs through the suite.
- New sigils / opera get a one-time test pinning their math.
- The e2e suite catches save-format regressions before they hit users.
- `packages/sim` must remain framework-free so unit tests don't drag in React.

**Alternatives considered.**
- Jest: slower with TypeScript; Vitest aligns with the Vite toolchain.
- No tests: idle games eat you alive once the modifier graph grows.
- Only e2e: too slow to catch math regressions during a tuning session.

---

## ADR-013: Asset pipeline — Aseprite, per-room sprite layers

**Status:** Superseded by ADR-021 (2026-05-22)

> **Superseded by ADR-021.** Kept for history. The art direction has moved from authored pixel-art to *degraded-photoreal* source assets, and Aseprite is no longer the authoring tool (see ADR-021 and `01-vision-and-core-loop.md`, "Visual and tonal identity"). The per-room layer + JSON-manifest model described below survives in ADR-021; the pixel-art authoring assumptions do not. Do not act on this record's tool choice.

**Context.** Rooms are composed from many small sprite layers (confirmed phase-1 requirement). Layers need to be editable independently — a different artist or pass might touch the candelabra without touching the fireplace.

**Decision.** Aseprite (`.aseprite`) as authoring source, committed to the repo. Each room is a directory of layer PNGs at native pixel size, exported alongside a per-room JSON manifest defining position, z-order, click region, and any animation frames. Build step runs `oxipng` and emits the room manifests into `apps/web/public/rooms/`.

**Consequences.**
- Each sprite editable in isolation; non-overlapping art tasks parallelizable.
- Animation is per-layer (a flickering candle is a layer with frames); the manifest carries the animation metadata.
- The manifest is the single source of room layout — code does not hardcode positions.
- Sprite atlases deferred until layer count warrants the build complexity.

**Alternatives considered.**
- Single PNG per room: rejected by user.
- Sprite atlases from day 1: premature optimization at the current layer count.
- SVG: wrong aesthetic.

---

## ADR-014: Audio — Howler.js, stubbed now, populated later

**Status:** Accepted 2026-05-14

**Context.** Audio is half the feel of an idle game and should not be deferred to launch, but no audio direction has been set yet. The cost of deferring is having no slot for it in the architecture; the cost of starting now is wasted iterations on the wrong direction.

**Decision.** Reserve Howler.js as the audio library. Implement a thin `audio.play(event)` API stub from day 1, called at every architecturally significant moment (Katabasis, tier outcomes, *Panvitium* activation, invocation summon, maleficium acquisition). The stub does nothing until files exist.

**Consequences.**
- Audio events are wired throughout the codebase before there's any audio, so populating audio later is a content task, not a refactor.
- Visual direction can solidify before audio direction is locked.
- Swapping libraries later is a one-wrapper change.

**Alternatives considered.**
- Web Audio API direct: too low-level for the surface we need.
- Tone.js: overkill; we want playback, not synthesis.
- Defer entirely: leaves a structural hole.

---

## ADR-015: Repository layout — monorepo, pnpm workspaces

**Status:** Accepted 2026-05-14

**Context.** Solo developer; frontend, backend, shared types, and a pure-functional game-math package. Cross-cutting changes (save format evolution, shared type adjustments) are routine.

**Decision.** Single repository, pnpm workspaces:
- `apps/web` — React frontend.
- `apps/api` — Fastify backend.
- `packages/shared` — wire-format types, save schema, version migrations.
- `packages/sim` — pure-functional game math, framework-free, consumed by `apps/web` and exercised directly by tests.

**Consequences.**
- Cross-cutting changes land in one PR.
- Shared types prevent client/server drift.
- `packages/sim` is the testable core — most regressions are caught there before they reach the UI.
- pnpm is fast and disk-efficient.

**Alternatives considered.**
- Polyrepo: coordination cost not worth it for one developer.
- npm/yarn workspaces: slower.
- Nx / Turborepo: overkill at this size.

---

## ADR-016: Deployment — Docker Compose on own VPS, Caddy reverse proxy

**Status:** Accepted 2026-05-14

**Context.** Own VPS confirmed in phase 1. Traffic at launch is expected to be modest (low thousands of concurrent users at most). Operational simplicity matters more than scale headroom.

**Decision.** Single `docker-compose.prod.yml` on a single VPS (Hetzner CX22 class as a starting target). Services: `web` (Nginx serving the static SPA build), `api` (Fastify backend), `postgres`, `caddy` (HTTPS reverse proxy with automatic Let's Encrypt). Production env vars in a `.env.prod` file managed out-of-band; never committed.

**Consequences.**
- One machine, one compose file, one operator (the developer).
- HTTPS is automatic; certificates renew themselves.
- Horizontal scaling is a future problem, not a setup problem — when needed, split `postgres` out and put the app behind a load balancer.
- Caddy's small config means less to debug at 3 a.m.

**Alternatives considered.**
- Kubernetes: rejected at this scale.
- Traefik: acceptable, more configuration.
- Nginx as the reverse proxy: acceptable, but Caddy's auto-HTTPS is the killer feature.
- Managed PaaS (Fly.io, Railway): rejected — VPS confirmed.

---

## ADR-017: CI/CD — GitHub Actions → GHCR → webhook deploy

**Status:** Accepted 2026-05-14

**Context.** Automation needed but not enterprise-grade infrastructure. Solo developer; no review gates; deployment cadence will be irregular.

**Decision.** GitHub Actions on push to `main`: lint, typecheck, unit tests, build container images for `web` and `api`, push to GHCR (GitHub Container Registry). A small webhook receiver on the VPS pulls and redeploys via `docker compose pull && docker compose up -d` on a `release` branch update or a versioned tag. `main` does not auto-deploy to production; the release branch is the production gate.

**Consequences.**
- Free CI for public repos; cheap for private.
- GHCR avoids Docker Hub's pull-rate issues.
- Webhook receiver is ~30 lines and can be replaced with `watchtower` if it gets fiddly.
- Manual release gate prevents accidental `main` → production.

**Alternatives considered.**
- GitLab CI: acceptable, no migration reason today.
- CircleCI: paid; no value-add at this scale.
- Manual `rsync` deploys: works but the rebuild surface becomes inconsistent.

---

## ADR-018: Backups — nightly Postgres dump to S3-compatible storage

**Status:** Accepted 2026-05-14

**Context.** User saves are irreplaceable progress. VPS disks fail. Provider snapshots are tied to the provider account and are not sufficient on their own.

**Decision.** Nightly `pg_dump` from the `postgres` container, encrypted client-side with `age`, uploaded to Backblaze B2 (or Cloudflare R2). 30-day retention. Weekly restore test on a staging container that ingests the most recent dump and runs a smoke query.

**Consequences.**
- Worst-case data loss is 24 hours.
- "Backups never worked" — the otherwise-invisible failure mode — is caught weekly.
- B2/R2 cost at this volume is single-digit USD monthly.
- Encryption keys are out-of-band; losing them loses the backups.

**Alternatives considered.**
- VPS-provider snapshots only: belt-but-not-braces; tied to one account.
- No backups: negligent for user data.
- WAL streaming to a hot standby: premature at this scale.

---

## ADR-019: Observability — Dozzle, uptime monitor, PostHog later

**Status:** Accepted 2026-05-14

**Context.** Need to know when things break and have enough log access to debug when they do. Full SRE tooling (Grafana / Loki / Prometheus) is more than we need at this scale.

**Decision.** Dozzle as a long-running container exposing live container logs over an authenticated endpoint. External uptime monitoring via UptimeRobot free tier (HTTPS check every 5 minutes against the SPA and the API health endpoint). Self-hosted PostHog for product analytics when player-behavior questions become tactical. Error tracking (Sentry or equivalent) deferred until error volume justifies it.

**Consequences.**
- Logs available immediately when something is wrong.
- Outage alerts arrive within ~10 minutes of a real outage.
- No third-party analytics scripts on the player's browser until self-hosted PostHog ships.
- No GDPR / cookie-banner overhead until that point.

**Alternatives considered.**
- Grafana + Loki + Prometheus: overkill at this stage.
- Google Analytics: privacy concerns; defeated by ad-blockers; self-hosted PostHog is the better fit.
- No observability: untenable past the first real outage.

---

## ADR-020: Localization — English-only at launch, structure-aware

**Status:** Accepted 2026-05-14

**Context.** The grimoire-baroque tone depends on tight word choice — Latin terms, ecclesiastical cadence, careful flavour text. Translation is its own essay and is not in scope for launch. But hardcoded strings make later localization a refactor.

**Decision.** English-only at launch. All player-facing strings live in a single `packages/shared/strings.ts` module from day 1, keyed not concatenated. Latin terms (*Opera*, *Suasio*, *Panvitium*, *Vitium Compositum*, etc.) stay untranslated regardless of locale — they are the product's voice. No i18n framework yet.

**Consequences.**
- Adding a translation later means populating one module per locale, not refactoring.
- Copy edits stay in one file.
- Translators eventually need significant tone guidance — the Latin stays Latin.
- No bundle size cost from an i18n library we don't use.

**Alternatives considered.**
- Hardcoded strings in JSX: refactor-hostile once we want translations.
- i18next from day 1: premature.
- Never localize: closes a door for no benefit.

---

## ADR-021: Visual direction — degraded-photoreal source assets, GIMP pipeline

**Status:** Accepted 2026-05-22 (supersedes ADR-013; amends ADR-002)

**Context.** The visual identity has pivoted from authored pixel-art ("pixelart grimoire-baroque") to *lo-fi grimoire-baroque* — photographic and rendered source imagery passed through a uniform light-pixelation and colour-degradation pass, in the lineage of PS1-era and analog horror (the cursed-CD-ROM look). See `01-vision-and-core-loop.md`, "Visual and tonal identity." This invalidates the core assumption of ADR-013 (Aseprite as a pixel-art authoring source) and the rendering detail of ADR-002 (`image-rendering: pixelated` over native-resolution sprites). The room-as-layered-scene model from both ADRs is unaffected and retained.

**Decision.**
- **Source.** Room and prop imagery originates as photographs, 3D renders, or generated images — not hand-drawn pixels.
- **Composition.** Each room remains a stack of separable layers (decor, fixtures, active-invocation silhouettes, mood overlays), composited in GIMP and exported as PNG layers plus the per-room JSON manifest defined in ADR-013 (position, z-order, click region, animation frames). The manifest / layer / click-region model is retained wholesale; only the authoring tool and the asset nature change.
- **Degradation recipe (GIMP).** Every visual element — backgrounds, props, character and invocation sprites, and UI surfaces — passes through one identical recipe: GIMP *Pixelize* (Filters → Blur → Pixelize) at a fixed block size, then colour-depth reduction (Image → Mode → Indexed at a fixed palette size, or Colors → Posterize), then a fixed warm/dark grade. The recipe parameters are a single project-wide constant set, recorded once the first room is built (see open items).
- **Resolution.** Author and store at a high base (~1280×720) with the pixelation baked into the asset. Integer scaling is no longer load-bearing; the scene displays near 1:1.
- **Rendering.** `image-rendering: pixelated` is dropped — the pixelation is a property of the asset, not of runtime upscaling. Default/auto image rendering applies (amends ADR-002).

**Consequences.**
- The single-recipe rule is the load-bearing constraint: uniform fidelity across every element is what makes the look intentional. Mismatched fidelity (sharp background under a coarse sprite) reads as a bug — exactly the flaw in the early composited mockups.
- GIMP replaces Aseprite as the authoring tool; the `.aseprite` source-of-truth is dropped. The `oxipng` export and the per-room manifest build step survive.
- High-resolution PNG layers are heavier than native-res pixel sprites; the per-room asset-size budget grows, though still trivial at three rooms.
- Because the recipe is a fixed constant set, re-grading the whole game is a one-pass batch operation, not a re-draw — a GIMP script-fu / batch step can re-apply it across all layers.
- Sprite atlases remain deferred (as in ADR-013).

**Alternatives considered.**
- *Authored pixel-art (ADR-013, now superseded):* rejected — not resourcing a pixel artist, and the authored-pixel look was not the desired identity.
- *Photo-to-true-low-res indexed art:* rejected — over-converts; loses the soft degraded-photo feel in favour of crisp pixel clusters.
- *Straight photoreal, no degradation:* rejected — contradicts the lo-fi grimoire identity and the store positioning in `01-vision`.

---

## ADR-022: Modifier engine — single composition point for all derived multipliers

**Status:** Accepted 2026-05-27 (retroactively documented after implementation)

**Context.** Many independent sources affect many independent targets. Sin levels feed player efficiency and influence rate. Sin skills (intensity ∝ ln(devotion)²) feed gold rate, max influence, per-category efficiency, and tier-weight shifts. Equipped maleficia feed gold rate, influence rate, max influence, and tier-weight zeroing. Sigil bindings feed nearly every modifier dimension at some intensity. Acolytes and invocations will feed efficiency. Reprobate subtypes feed several rates (positive and negative). There is no realistic future where this graph gets simpler.

If each consumer (tick loop, action engine, probability resolver) reads sources directly, every new source means editing every consumer; every consumer drifts away from every other; and the test surface grows as the product of sources × consumers. The only design that survives is one composition point that every consumer reads from.

**Decision.** A single function, `computeModifiers(state: GameState): Modifiers`, in `packages/sim/src/modifiers.ts`, assembles the `Modifiers` bundle from every source. Consumers (the tick loop, `startAction`, `resolveAction`, future systems) consume only the bundle.

**The bundle shape grows over time.** Each field is a single scalar multiplier or a small structured value (e.g. `TierModifiers` for per-tier weights). New sources slot in as additional terms folded into existing fields, or new fields when a new dimension lands. The bundle is immutable per-call (functional return).

**Composition rule.** All effects compose multiplicatively unless a target's nature demands otherwise (e.g. tier-weight modifiers are multiplicative per-tier, but `Mark of Cain` zeroes Apocalyptic outright — a "lock" that overrides further multipliers). The default is `out *= source.contribution`; deviations are explicit and commented.

**Skill→effect coupling.** A Sin skill that "increases X" multiplies X by `1 + intensity`. A skill that "decreases X" multiplies X by `1 / (1 + intensity)`, which is asymptotic to 0 and never negative. This convention is fixed across the project; per-skill coefficients (the divisor inside `intensity`, per-Sin overrides) are tunable in the spreadsheet.

**Discipline.** No system reads `state.devotion` or `state.lifetime.maleficia` to derive a multiplier directly — that derivation must live in `computeModifiers`. Consumers are read-only with respect to the bundle. A test pinning `NEUTRAL_MODIFIERS` (all fields at 1, empty tier mul) guards against accidental dependency on a specific source.

**Consequences.**
- Adding a new source is a one-line change: `result.someField *= sourceContribution`. Adding a new dimension is a new field on `Modifiers` plus its initial value in `NEUTRAL_MODIFIERS`.
- Tests pin per-source contributions in isolation (e.g. "Leviathan 180 → suasioEfficiencyMul ≈ 5.1253") and per-target composition (e.g. "Avaritia 180 + Thirty Pieces of Silver → goldRateMul ≈ 15.376").
- The bundle is recomputed each tick. Cost is negligible at our budget (a handful of multiplications and one log per Sin).
- The bundle is **derived**, not persisted. The save format stores sources (Devotion, sigil bindings, equipped maleficia, etc.); the bundle is rebuilt on load.
- A consumer that wants only one field (e.g. `playerEfficiency(state)`) gets a thin helper that calls the engine and reads the field; this preserves the discipline that the bundle is the source of truth.

**Alternatives considered.**
- *Distribute the math across each consumer.* Rejected. Drift is the entire problem this ADR exists to solve.
- *Event-driven recomputation on state change.* Rejected. The tick loop is already the right cadence; on-change adds complexity for no measurable saving.
- *Per-source registries with a runtime composition step.* Rejected at this size — a single function is more honest and more debuggable; we can move to a registry pattern later if the source list ever exceeds ~50 distinct contributions.
- *Encode the bundle in the save.* Rejected. Storing derived data invites desynchronization between sources and effect; rebuilding on load is cheap and removes the entire class of bugs.

---

## ADR-023: Save schema evolution policy

**Status:** Accepted 2026-05-27

**Context.** The save schema (`packages/shared/src/save/state-schema.ts`) will evolve over the project's lifetime. Some changes are additive (a new optional field on `ActionTimer` for Emptio's target maleficium); some are breaking (a renamed field, a type change, a removed field, a non-optional addition). We need a clear rule for when each kind requires what.

Without a policy, ad-hoc decisions accumulate: a developer adds a non-optional field without a migration; a player's old save fails to load; the developer scrambles to write a migration retroactively under load. The cost of a written policy is one paragraph; the cost of skipping it is one bad night per user-base outage.

**Decision.**

**Additive optional fields do not bump `schemaVersion`.** A new optional field on an existing object is parsed cleanly by Zod from old saves (the field is simply absent), and TypeScript's `exactOptionalPropertyTypes` is honoured at the de/serialiser by *conditionally* including the field in the output object only when defined (never assigning `undefined` to the key). Example: adding `ActionTimer.target?: string` for the Emptio purchase target — old saves without a target field load as if `target` is absent; new saves with a target round-trip correctly. **No version bump.**

**The following changes DO require a `schemaVersion` bump and a migration file:**
- Renaming a field.
- Removing a field.
- Changing a field's type (string → number, string → enum, etc.).
- Adding a non-optional field.
- Changing the shape of a nested object (e.g. converting `maleficia: string[]` to `maleficia: Record<string, number>`).
- Tightening a Zod validator in a way that would reject previously-valid saves.

**Migration file layout.** Migrations live in `packages/shared/src/save/migrations/` as `v{from}-to-v{to}.ts`. Each exports a single function `migrate(input: SerializedGameStateVFrom): SerializedGameStateVTo`. A migration is pure, deterministic, and has its own unit test. The save-load path calls migrations in order until the input matches the current version. A save whose `schemaVersion` is *higher* than the runtime's current version is rejected with a user-visible message ("save is from a newer version of the game"); a save with an unknown lower version is rejected the same way.

**Versioning starts at v1.** The current schema is v1. There are no migrations yet. The `migrations/` directory contains a `_noop.ts` placeholder and its test, exercising the harness so the first real migration doesn't need to also build the harness.

**Consequences.**
- Most schema changes (adding new game systems, new state fields for new dynamics like reprobate accrual pools) are additive-optional and need no migration. The team's velocity stays high.
- Breaking changes are explicit, locally-scoped, and tested. A v1-to-v2 migration is a self-contained PR.
- The de/serializer becomes slightly more verbose because of the conditional-spread rule for optional fields, but the verbosity is local to one file and follows a single recipe.
- A regression suite of "old save loads cleanly" can be built by checking sample saves from each prior version into the repo and running the load path on them.
- A future "the save format is so different we can't migrate" decision (an apocalyptic rewrite) is explicitly *not* in scope here. If it happens, that becomes its own ADR superseding this one.

**Alternatives considered.**
- *Bump schemaVersion on every change.* Rejected — too much ceremony for additive-optional changes; migrations become trivial-but-numerous and lose meaning.
- *Never migrate; tolerate old saves with absent-field fallbacks in code.* Rejected — works for additive changes but accumulates implicit-defaults everywhere and breaks any rename or shape change. The policy here covers both worlds (the easy cases stay easy; the hard cases get explicit attention).
- *Use a "tolerant Zod schema" that accepts any superset.* Rejected — undermines the integrity check we need on the server side, where a malformed save should be flagged not silently coerced.

---

## ADR-024: Reprobates are a single pool — subtypes and the Vitium conversion mechanic removed

**Status.** Accepted [2026-06-07].

**Context.** The original design (03 §3) split reprobates into eight Sin-themed subtypes plus an
unconverted default, with a *conversion* mechanic that turned unconverted reprobates into subtypes
at a rate driven by Vitium Mercatura businesses and Vitium Compositum ceremonies. Each subtype
carried two effects: a per-Sin Vitium-gold boost and a secondary global-rate penalty
(offline/suicide/murder/generation/efficiency/gold/influence). This coupling reached into nearly
every sim module (`dynamics`, `modifiers`, `businesses`, `compositum`, `sigils`, `apex`,
`katabasis`), the save schema, and the web UI. In play it added bookkeeping and surface area without
proportionate depth, and it made the Vitium Mercatura / Vitium Compositum economies harder to reason
about and rebalance.

**Decision.** Collapse reprobates to a single undifferentiated pool. `lifetime.reprobates` becomes
one integer. Remove the `ReprobateSubtype` type, `SUBTYPE_OF_SIN`, the conversion pool,
`biasedSubtype`/`conversionBiasMul`, the eight per-subtype rate penalties, and the per-Sin
Vitium-gold boost. Re-anchor murder from a per-Choleric rate to a per-capita rate on the whole
population. Pogrom culls the pool (no target); Defixio curses the pool (no subtype). Vitium Mercatura
businesses become gold + generation only; the three ceremonies whose sole effect was conversion or a
subtype penalty (Outrage Cycle, Vegas, Crusade) are kept as compile-green stubs pending the Vitium
rework; subtype/conversion-keyed sigils and Specunitas are neutralized to an `inert` effect with
their catalog IDs preserved. The persisted shape changes (record → integer, two field removals), so
per ADR-023 this is a breaking change: bump `schemaVersion` 1 → 2 with a migration
(`migrations/v1-to-v2.ts`) that sums the old per-subtype counts into one integer, drops
`conversionPool`, and strips `defixio.target`.

**Consequences.**
- Large one-time churn (a root type change touches every consumer), but a markedly smaller and more
  legible model afterward. Net −55 tests as the subtype/conversion/penalty specs retire.
- Vitium Mercatura and Vitium Compositum need a redesign of the dimension conversion used to fill;
  that is deliberately separated into follow-up slices (the economy spreadsheet is authoritative for
  composition). Three ceremonies and a set of sigils sit inert in the meantime, flagged in the README.
- This is the project's first real save migration — a worked example of the ADR-023 breaking-change
  path (version bump + a self-contained, tested migration).

**Alternatives considered.**
- *Keep subtypes, simplify only the penalties.* Rejected — the conversion mechanic and per-Sin gold
  boost were the load-bearing coupling; trimming penalties alone leaves the complexity in place.
- *Keep the subtype field but always use one bucket.* Rejected — a half-measure that preserves the
  record shape (and its serialization/migration cost) while delivering none of the simplification.

---

## ADR-025: Vitium Mercatura → the Mercatus system + the Foedera coupling

**Status.** Accepted [2026-06-12]. Implements `vm-vc-redesign-spec.md`; the §1.5 clause table was
amended in session before implementation (the amended values below are authoritative and mirrored
on the `Vitium Mercatura` sheet).

**Context.** The legacy *Vitium Mercatura* was a 32-business catalog (eight Sins × four tiers) with
a build queue and flat per-business gold/generation emitters. After ADR-024 removed subtypes and the
conversion mechanic, what remained added bookkeeping without depth: income was flat and decoupled
from the population the game is about, build timers were dead time, and the two *Vitium* systems
(Mercatura, Compositum) no longer coupled at all — conversion had been their only bridge.

**Decision.** Replace the business system entirely with the **Mercatus** system: eight trades,
exactly one per Cardinal Sin, each a single integer **depth** `d ≥ 0`. Deepening is an instant gold
purchase (`investCost = floor(C0 × r^d)` on the trade's own cost curve; cap `10 × sinLevel`);
divesting refunds the Globals shutdown-recovery fraction (0.25, Vine #45 still applies) of the
**closed-form** cumulative cost — derived, never stored. Revenue is **demand-driven**
(`spendPerCapita × reprobates × (1 − e^(−a·d))`), composed at the exact tick site the legacy
`businessGoldPerSecond` held (`× vitiumMercaturaOutputMul × goldRateMul`); generation contributes
`genPerDepth × d` to the pool. On Katabasis all trades auto-divest into gold **before** the
remaining-gold roll. **Foedera** couple the two systems:
`tier = min(floor(min member depth / 10), 4)`; an active ceremony's per-second upkeep takes
`× (1 − 0.125 × tier)` on its **computed** cost (so Panvitium's eᵗ ramp is discounted — the
late-game payoff), and each member Sin's trade revenue takes `× (1 + 0.05 × tier)`, stacking
multiplicatively across active ceremonies sharing a Sin; a per-ceremony `foedusOptOut` flag
defaults all-on. Each trade carries one **signature clause** (§1.5 as amended): Gulae take ×1.25;
Luxuriae generation ×1.25; Avaritiae each depth bargains the next 0.5% cheaper (compounding —
effective ratio `r × 0.995`, refunds on the same basis); Tristitiae / Irae +0.825% per depth on the
suicide / murder rate multipliers; Acediae revenue exempt from the offline efficiency factor plus
+0.825% per depth on the offline gain rate; Vanagloriae +0.25% of **effective** max influence as
flat influence/s per full 10 depths (stepped); Superbiae depths ×1.25 dearer, its take and breeding
×1.33. Per ADR-023 the field removals (`businesses`, `buildQueue`) bump `schemaVersion` 2 → 3 with
a migration (`migrations/v2-to-v3.ts`): credit 25% of each owned business's frozen legacy build
cost as gold, fizzle the build queue without refund (matching the only prior teardown semantics),
drop both fields, and seed `mercatusDepths` by omission.

**Consequences.**

- Income now rides the population curve — no population, no take — which is the design point: the
  trades earn from the living damned, so growing and preserving reprobates matters to the economy.
- The Foedera give every ceremony a structural role even where its sheet effect is still a
  placeholder, and create the deep-trades-cheap-rituals late game intentionally.
- The 32 business name strings, the build-queue UI tab, and `startBuild`/`advanceBuilds`/
  `shutdownBusiness` retire; the email triggers re-key from owned-business counts to total depth.
- **Deliberately not done here ("Slice 3"):** the Vitium Compositum roster / effects rework. The
  sheet's canonical roster is nine ceremonies; the code still carries the four subtype-era pairs
  (*Outrage Cycle* effectless, *Loan Shark Op* / *No-babies Movement* / *Ethnocentric Revolt* with
  placeholder effects), and Vegas / Crusade have flat placeholder costs and incomes where the sheet
  specifies percentage-of-income semantics. Tracked in the README backlog.
- The 16 sigils neutralized to `inert` by ADR-024 now have natural retarget destinations (depths,
  penetration, Foedus tiers); the orphaned-sigils pass is unblocked. Tracked in the README backlog.

**Alternatives considered.**

- *Keep the catalog, re-tune the emitters.* Rejected — flat emitters stay decoupled from the
  population and the conversion-shaped hole between the two Vitium systems stays open.
- *Per-business penetration curves.* Rejected — 32 curves to tune against the sheet instead of
  eight; the per-Sin clause table delivers the same flavour variety at an eighth of the surface.

---

## ADR-026: Player offline efficiency — wired at 0.5×, with resume clock reconciliation

**Status.** Accepted [2026-06-12]. Amends the resume semantics described in ADR-004 (whose uncap
amendment stands unchanged).

**Context.** Globals row 8 ("Player base offline efficiency", 0.5×) has been on the sheet from the
start but never had a code counterpart — offline catch-up accrued at full rate. The Mercatus
Acediae signature clause (ADR-025) exempts that trade's revenue from "the ×0.5 offline efficiency
factor", which requires the factor to exist; the spreadsheet wins on numbers, so the gap is a
parity bug, not a choice to preserve. Separately, `tick` advances `lastTickAt` by the (scaled)
delta it consumed, so any offline scaling ≠ 1 desynchronized the logical clock from wall-clock:
harmlessly eating the overshoot when scaling > 1 (the Acedia compound), but **double-counting** the
unconsumed span on every reload at scaling < 1 — free gains, had the 0.5 shipped without the fix.

**Decision.** `resumeGame` scales the offline catch-up by `PLAYER_OFFLINE_EFFICIENCY = 0.5`,
composed with `offlineTimeMul` (Procrastination, Dolce Far Niente, Lemure, Mercatus Acediae's
per-depth lift) and the Acedia level compound exactly as before, and passes the factor to the tick
as a dependency (`offlineEfficiency`) so the Mercatus Acediae trade's revenue alone is divided back
to full wall-clock rate. After the catch-up tick, `lastTickAt` is reconciled to `now`: a resume, by
definition, catches the player up to the present, whatever the gains were scaled by.

**Consequences.**

- A global balance change: offline progression now runs at the half-rate base the spreadsheet
  always specified. Flagged for playtest.
- The latent clock bug is fixed in both directions and pinned in the session tests.
- Online ticks pass no `offlineEfficiency`, so live play and the per-second readouts are untouched.

---

## ADR-027: Vitium Compositum — the canonical nine, with percentage ceremonies

**Status.** Accepted [2026-06-12]. Implements the "Slice 3" rework registered as an open item by
ADR-025, per the revised economy template.

**Context.** After ADR-024 removed subtypes and conversion, four ceremonies survived only as
placeholders (*Outrage Cycle* effectless; *Loan Shark Op* / *No-babies Movement* / *Ethnocentric
Revolt* with improvised effects), and Vegas / Crusade carried flat placeholder costs and incomes
where the sheet had always intended percentage-of-income semantics. The revised template fixes the
canonical roster at nine and specifies every cost, output, and effect.

**Decision.** The four subtype-era pairs are **deleted from the catalog**; `advanceToggles`'
unknown-id path drops their ids from old saves without billing them (no migration needed — the
field shapes are unchanged, so no schema bump per ADR-023). The five subtype-era plumbing fields
(`flatGenerationPerSecond`, `flatBaseSuicideRatePerSecond`, `flatBaseMurderRatePerSecond`,
`populationGeneration`, `deathFractionPerSecond`) and their helpers are removed with them. The
pair ceremonies take their sheet effects as **multiplicative rate boosts** folded into the
modifier bundle: Bacchanal ×1.1 generation, Doom Gathering ×1.1 suicide, Enraging Broadcast ×1.1
murder, each while active; Charity's upkeep gains its missing 100 gold/s leg (100 g + 25 i → 200
g/s); Dolce Far Niente and Gala stand as coded. **Vegas and Crusade become percentage ceremonies**:
each second Vegas pays 50% of the current gold gain rate (in gold) and yields 1% of that rate as
influence; Crusade pays 50% of the current influence gain rate (in influence) and yields 1000%
(×10) of that rate as gold. The percentage base is computed by the tick **without any
percentage-VC outputs** — Vegas and Crusade can never feed each other or themselves — and passed
into `advanceToggles` (upkeep) and the income lines (output, riding `vitiumCompositumOutputMul`
and the resource rate multipliers like any ceremony income). The HUD's `perSecondRates` mirrors
the same composition.

**Consequences.**

- The roster, costs, outputs, and effects now match the sheet row for row; the VM sheet's Foedus
  opt-out flag table shrinks to nine with it.
- Old saves with retired ids self-heal on the first tick (dropped, unbilled, durations cleared).
- A late-game loop emerges by design: deep trades feed gold gain → Vegas converts a slice to
  influence → Crusade converts influence gain back to gold at ×10 — but since each measures the
  PRE-percentage base, the loop cannot compound on itself.
- The Foedera (ADR-025) apply unchanged: the percentage upkeeps take the per-tier discount on
  their computed per-second cost, exactly like Panvitium's ramp.

**Alternatives considered.**

- *Keep the four with re-imagined effects.* Rejected — the sheet is canonical and lists nine; the
  retired pairs' niches (gold income, murder/suicide pressure, birth suppression) are all covered
  by the survivors or the Mercatus clauses.
- *Percentage base measured post-output (self-referential).* Rejected — a fixed point that
  compounds Vegas→Crusade→Vegas would be the dominant strategy and numerically fragile.

---

## Open items not yet decided

These are deliberate non-decisions, dated for revisit.

- **Visual / art direction recipe constants** [2026-05-14; updated 2026-05-22] — direction and pipeline now resolved by ADR-021. Still open: the exact recipe constants (Pixelize block size, Indexed palette size, grade curve), animation count per layer, and whether UI / grimoire-page surfaces take the same block size as the rooms or a finer one. Will firm up as the first room is built.
- **Audio direction** [2026-05-14] — see ADR-014. The slot is reserved; the content is open.
- **Account-recovery flow** [2026-05-14] — see ADR-009. Magic-link auth leaves users locked out if their email is lost; resolve before launching accounts publicly.
- **Multi-device save chooser UI** [2026-05-14] — see ADR-010. The mechanism is decided; the in-game presentation is not.
- **Sentry or equivalent error tracking** [2026-05-14] — deferred until error volume justifies the integration.
- **Public ladder / Eternal Sin Ladder** [2026-05-14] — deliberately out of scope until ADR-011's anti-tampering posture has server-side replay validation.
- **Vitium Compositum "Slice 3" — roster & effects** [2026-06-12] — **resolved by ADR-027**
  [2026-06-12]: the four subtype-era pairs are retired, Vegas / Crusade carry the percentage
  semantics, the pair effects are the sheet's ×1.1 rate boosts.
- **Orphaned-sigils pass** [2026-06-12] — re-target the 16 sigils neutralized to `inert` by ADR-024
  (#1 Bael, #15 Eligos, #25 Glasya-Labolas, #27 Ronove, #33 Gaap, #37 Phenex, #39 Malphas,
  #41 Focalor, #43 Sabnock, #47 Vual, #53 Camio, #56 Gremory, #57 Ose, #59 Orias, #62 Volac,
  #64 Haures) onto the new Mercatus / Foedera surfaces (depths, penetration, invest costs, Foedus
  tiers) — needs sheet decisions per sigil.
- **Indagatio pre-acolyte UX** [2026-05-27] — Indagatio's baseline duration (1800 s, per spreadsheet) collides with the one-player-action-at-a-time rule before acolytes exist, so a solo player effectively locks their action queue for 30 minutes per search. The unblocking system is **acolyte delegation** — until that lands, the design tolerates the friction. Pinned here so we don't lower the baseline number reflexively when the real fix is the delegation system.
