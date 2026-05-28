---
name: panvitium
description: >-
  Engineering conventions, locked stack decisions, build roadmap, and delivery workflow for
  Panvitium — a dark incremental/idle game built as a TypeScript pnpm monorepo (Vite+React+Zustand
  web, Fastify+Drizzle+Postgres API, a framework-free sim core, a shared types/save-schema package).
  Use whenever working on the Panvitium codebase in ANY way: implementing build steps or gameplay
  systems, writing or editing code in apps/web, apps/api, packages/sim, or packages/shared, tuning
  the economy spreadsheet, or making an architectural choice. Trigger even when the user only says
  "next step", "continue the build", or names game concepts like Katabasis, Opera, Suasio, sigils,
  reprobates, Devotion, invocations, Panvitium, the Eternal Sin, or Semet — it carries the ADR
  decisions (incl. the ADR-022 modifier-composition point and the ADR-023 save-evolution policy),
  the overlay-tarball delivery convention, the verification gate, and hard-won gotchas that prevent
  drift between sessions.
---

# Panvitium — engineering skill

Panvitium is a dark, grim-baroque incremental/idle game. The player is a damned human who corrupts
and culls souls across many lifetimes (*Katabasis*) to climb Hell's hierarchy.

**Division of authority.** The four design docs in project knowledge are the source of truth for
*what the game is*; this skill owns *how it is built*.

- `01-vision-and-core-loop.md` — premise, tone, core loop, pacing.
- `02-systems-and-mechanics.md` — every system (resources, probability tiers, Opera, Devotion, sigils, Katabasis, saves).
- `03-content-catalog.md` — the working surface: Princes/Sins, Opera actions, reprobate subtypes, maleficia, the 72 sigils, endgame.
- `04-architecture-decisions.md` — the ADRs (ADR-001…023). **Consult an ADR before changing anything it governs**; cite the ADR number when you do.

Read the design docs for content/mechanics questions. Read this skill for stack, conventions, workflow, and gotchas. The numbers themselves live in `Panvitium_Economy_Template.xlsx`.

---

## 1. The locked stack (do not drift)

These are decided. The generic instinct (Next.js, Prisma, Express, global RNG, plain `number`) is
**wrong here** — follow the ADRs, not the default.

| Area | Decision | ADR |
|---|---|---|
| Frontend | React 18 + TypeScript (strict) + Vite (pinned to 5 to match Vitest 2.1) | 001 |
| Rooms | DOM-first positioned sprite layers, scene-graph; **not** Canvas/Pixi (escape hatch only) | 002 / 021 |
| Client state | Zustand, selector subscriptions; UI-only state stays local | 003 |
| Tick loop | Single RAF driver, 100 ms (10 Hz) logical tick, accumulator; offline = same tick, big capped delta | 004 |
| Big numbers | `break_infinity.js` `Decimal` for unbounded values via the `BigNum` wrapper; plain `number` for bounded counts | 005 |
| Persistence | Local-first `localStorage` (debounced, 15 s autosave + beforeunload/visibility) + cloud sync for logged-in users | 006 |
| Backend | Node 22 LTS + Fastify 5 + TypeScript; shared types package | 007 |
| Database | PostgreSQL 16 + Drizzle ORM; JSONB save blobs; **not** Prisma/Mongo | 008 |
| Auth | Email magic links + Discord OAuth; signed HTTP-only cookies; **no password column** | 009 |
| Save sync | Client-authoritative; monotonic `saveVersion`; chooser on divergence; 10-version history | 010 |
| Anti-tamper | Minimal now, structured for later; **seeded PRNG from day 1**, injected not global; HMAC-signed saves | 011 |
| Modifier engine | **One** `computeModifiers(state)` in `packages/sim/src/modifiers.ts` assembles every derived multiplier; consumers read the bundle, never the sources | 022 |
| Save evolution | Additive-optional fields don't bump `schemaVersion`; renames/removals/type-changes/non-optional-adds do + need a migration | 023 |
| Testing | Vitest (unit, against `packages/sim`) + Playwright (`@playwright/test`, e2e on PRs to main + tags) | 012 |
| Art pipeline | Degraded-photoreal source via a single GIMP recipe; per-room PNG layers + JSON manifest. Supersedes Aseprite/pixel-art (ADR-013) | 021 |
| Audio | Howler.js, stubbed via `audio.play(event)` from day 1 | 014 |
| Repo | pnpm monorepo (pnpm 9.15.0) | 015 |
| Deploy | Docker Compose on a single VPS, Caddy reverse proxy (auto-HTTPS) | 016 |
| CI/CD | GitHub Actions → GHCR → webhook deploy; `main` builds/tests/publishes images, `release` is the deploy gate | 017 |
| Backups | Nightly `pg_dump`, `age`-encrypted, to B2/R2; weekly restore test | 018 |
| Observability | Dozzle + UptimeRobot now; self-hosted PostHog later | 019 |
| i18n | English-only at launch; strings keyed in `packages/shared/strings.ts`; **Latin terms stay untranslated** | 020 |

---

## 2. Monorepo layout and package boundaries

```
panvitium/
├── apps/web/          # React SPA — the game
├── apps/api/          # Fastify backend — accounts, save sync
├── packages/shared/   # wire-format types, save schema (Zod), migrations — imported by BOTH web and api
└── packages/sim/      # pure-functional game math — the testable core
```

Hard boundaries:

- **`packages/sim` must stay framework-free.** No React, no DOM, no `fetch`, no `Date.now()` inside `tick`. This is what lets Vitest exercise it directly and keeps the math regression-proof (ADR-012/015). If sim needs the time, it is passed in.
- **`packages/shared` is the single wire contract.** Anything crossing the client/server boundary (save schema, auth/save-sync request/response types) lives here so it is compile-checked on both ends. Never duplicate these types in web or api. Contracts are **Zod** schemas; Fastify validates against them via `fastify-type-provider-zod` (see §5).

**Internal-source-package model (load-bearing).** `packages/sim` and `packages/shared` ship **no build
output** — their `package.json` `main`/`types` point straight at `src/index.ts` and their `build`
script is `tsc --noEmit`. Only the apps build: `apps/web` via Vite, `apps/api` via **tsup with
`noExternal: [/^@panvitium\//]`** so sim+shared source is inlined into one self-contained bundle.
This is why cross-package typecheck works **without** TS project references. Don't add per-package
`dist/`. Vitest resolves the workspace packages to source via `resolve.alias` in each app/package
`vitest.config.ts`.

---

## 3. Build roadmap and current state

**Phases 2 (infrastructure) and 3 (gameplay systems) are COMPLETE.** The skeleton builds, tests,
containerizes, and is CI-gated; the full core loop is implemented, tested, and surfaced in the rooms.

**Phase 2 — infrastructure (done):** pnpm monorepo + strict TS + lint/format/Husky; `packages/sim`
foundations (`BigNum`, seeded RNG, `GameState`, `tick`); `packages/shared` save schema v1 (Zod) +
ADR-010 envelope + migrator + auth/save-sync contracts; `apps/web` skeleton (Vite/React/Zustand,
`useGameLoop`, three rooms, HUD); `apps/api` skeleton (Fastify/Drizzle, users/sessions/saves,
magic-link + session auth, injected repos); dev Docker compose; GitHub Actions CI + GHCR images;
Playwright e2e smoke.

**Phase 3 — gameplay systems (done).** Shipped as ~18 coherent slices, each gate-green and committed,
each pinning its math with Vitest. In order:

- **sim-economy** — gold/influence generation, the seven-tier probability resolver (multiplicative per-tier weights renormalized to 1.0, 02 §2), Devotion levels (`sinLevel = floor(log_180(devotion))`, so `180^X` Devotion = level X) and per-Sin skill intensities (`ln(x)²/SKILL_INTENSITY_DIVISOR`).
- **suasio-loop, playable-loop** — Opera action engine (one-shot + `cost-outcome`/`time` efficiency modes), the player action slot, tier resolution wired to outcomes.
- **katabasis-core / katabasis-ui / offer-arbitrary** — descent flow, the Katabasis menu (offer arbitrary Devotion amounts per Prince), the recap, unspent-soul carry-over, lifetime reset.
- **pc-groups, error-boundary** — the Win95 PC ledger groups (Depraedatio/Decimatio/Indagatio/Emptio/logs); a save-aware error boundary.
- **modifier-engine (ADR-022)** + **mods-category-tiers** — the single `computeModifiers` composition point; Sin-skill and maleficia contributions wired across every modifier dimension incl. per-category efficiency and per-tier weights.
- **indagatio-emptio** — maleficia discovery (`Indagatio`, `time` mode) → Emptio list → purchase (`Emptio`, `time` mode, per-target gold cost), stack rules.
- **reprobate-dynamics** — the four fractional accrual pools (generation/suicide/murder/conversion), floored-on-integer-apply; `biasedSubtype` draws from active Vitium throughput; each death mints 1 soul.
- **vitium-mercatura** — sin-themed businesses (separate `buildQueue`, multiple concurrent builds, not player-slot, not delegable), shutdown refund folded into the Katabasis gold roll.
- **acolytes** — `maxAcolytes = max(1, 1 + floor(log10(maxInfluence/BASE)))` on post-modifier influence; auto-recruit; lowest-idle assignment, LIFO unassign; 33% baseline efficiency; parallel queue slots; lost only at Katabasis.
- **vitium-compositum** — multi-Sin ceremony toggles; upkeep deducted **before** income; auto-deactivate when unpayable; `TickResult.notices` surfaces it.
- **invocations** — invoking-power gates (sum of maleficia `invokingPower`), visible at ≥ half required IP, soul-cost summon, `maxActive` caps; effect magnitudes live in `modifiers.ts`.
- **panvitium** — the namesake toggle in `COMPOSITA`: all-8-Sins-L3 gate, `manualDeactivateForbidden`, exponential duration-scaled cost (`costGrowthPerSecond ** secondsActive`, `Number.isFinite` guard), enormous gen/suicide/murder muls, red Studio window.
- **eternal-sin reveal** — top-level `eternalDevotion` + `startedAt`; `offerEternal` gated on all-Sins-maxed; reveal at `ETERNAL_SIN_THRESHOLD`; Semet credits screen with runtime score; game continues post-reveal.

Test counts at Phase 3 close: **sim 248, shared 34, api 11, web 45 = 338**.

### What's NOT done yet (Phase 4 candidates)

- **Sigils** — the 72-sigil system (the recoverable Devotion axis) is **not implemented**; the Katabasis menu still shows "sigil binding arrives with the modifier engine." `bindSigil`/`unbindAllSigils`/`totalBound` exist in sim but no per-sigil effects are wired into `computeModifiers`, and there's no binding UI. Semet is sigil #32.
- **Achievements** — data hooks exist (the "Long Burn" 60 s reads `toggleDurations`; "Semet" reads the reveal) but no achievement system.
- **Remaining invocation families** — autonomous-channel (Familiar, Imp), periodic-kill (Upir, Astiwihad), dispel-condition (Aurevora), Katabasis-modifying apexes (Erinyes, Morpheus). Plutus → `vitiumMercaturaOutputMul` is a one-liner (the field already exists).
- **Web↔API save-sync client** — the web app still does **not** call the API; the sync client + ADR-010 conflict-chooser UI are unbuilt.
- **Art / audio** — rooms are still CSS-placeholder scenes; the GIMP-degraded layers (ADR-021) and Howler audio content are unpopulated.
- **Economy numbers** — most live as in-code placeholders; load from `Panvitium_Economy_Template.xlsx` when tuning (spreadsheet always wins over docs/code for numbers).

Roughly one or two coherent slices per session. Each ends with a green verification gate and a commit.

---

## 4. Delivery and workflow conventions

The codebase lives on the user's machine and on a **private** GitHub repo (proprietary license).
Claude has no push access — Claude produces files; the user commits and pushes.

**Deliver each step as one consolidated overlay tarball**, never a patch on a patch. Build and verify
the whole step in the sandbox first, then package only the files that step touched.

- **Overlay tarballs have NO wrapping folder.** Paths are relative to the repo root (`packages/sim/…`, `compose.yaml`, `pnpm-lock.yaml`). The user downloads the tarball **into the repo root** and extracts there so files overwrite in place. (Step 1's bootstrap was the one exception — it wrapped everything in `panvitium/`, which caused a nested-folder mess. No wrappers thereafter.)
- **Extract with `tar -xf <exact-filename>`** — no `z` flag; the platform may serve the archive already-decompressed, and `-xf` auto-detects either way. `*.tar` / `*.tar.gz` are gitignored.
- **Always ship the updated `pnpm-lock.yaml`** when dependencies change, so the user's install matches the verified resolution.
- After shipping, it's worth confirming a changed file actually landed (a quick `cat`) before relying on it — a path/filename mismatch silently no-ops the overlay.
- **The verification gate** must be green before suggesting a commit. Run it in the sandbox and tell the user to run it too:
  ```bash
  pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
  ```
- **Commit messages** are conventional and tagged with the step while in a plan: `feat(api): … (step 5/8)`.
- `main` runs CI and publishes images; `release` triggers deploys. Don't auto-deploy from `main` (ADR-017).

**Sandbox can't run everything.** Docker builds/`compose up` and Playwright's browser are often
unreachable in the sandbox (no daemon; the browser CDN is blocked). De-risk what you can without them
— e.g. `pnpm --filter=@panvitium/api deploy --prod` then boot the bundle to hit `/health`; validate
compose with a YAML parse; `playwright test --list` to compile specs — and tell the user plainly that
the Docker/e2e run itself needs testing on their machine.

When scaffolding a step, **read the relevant SKILL.md first** (`frontend-design` for `apps/web`,
`docker-deployment` for Docker, `webapp-testing` for Playwright) — they encode environment constraints
not in training data.

---

## 5. Coding conventions and hard-won gotchas

These cost real debugging once already. Honor them.

**break_infinity is a *floating-point* bignum.** It buys range, not exactness (ADR-005). `180^4`
computes to `1049760000.0000002`. Resources are natural numbers (02 §1), so **floor before any integer
comparison** — affordability checks, Devotion thresholds (`180^X`), reveal thresholds. When a gotcha
like this is found, **pin it in a test**.

**Strict TypeScript is on, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.**
Indexing an array/record yields `T | undefined` — handle it. A **leading underscore marks an
intentionally unused binding** (tsc honors it; ESLint `no-unused-vars` is configured to match). ESLint
is the non-type-checked `recommended` config, scoped with react-hooks rules only for `apps/web`.
`verbatimModuleSyntax` is on, so use `import type` for type-only imports. Internal imports use explicit
`.js` extensions (`./bignum.js`).

**RNG is seeded, deterministic, and injected — never `Math.random`** (ADR-011). The state is a single
serializable integer in `GameState`. Within a `tick`, build an imperative `Rng` from it, draw, then
write its advanced `state` back. A fresh `Rng` from a saved state continues the exact same sequence.

**`tick(state, delta)` is pure.** No DOM, no `Math.random`, no input mutation; returns a new state. The
*same* function serves the live 10 Hz loop and offline catch-up (one call, big capped delta) — never
fork the logic (ADR-004).

**Derive, don't store, anything computable.** Sin *levels* (from Devotion totals), Skill *intensities*,
and max acolytes (from influence) are computed on demand so they can't drift.

**All derived multipliers go through `computeModifiers` (ADR-022) — never read sources directly.** One
function in `packages/sim/src/modifiers.ts` assembles the `Modifiers` bundle (gold/influence/maxInfluence
rates, player/suasio/decimatio efficiency, `tierWeightMul`, gen/suicide/murder rates,
`vitiumMercaturaOutputMul`, `acolyteEfficiencyMul` [0.33 baseline]). Consumers (tick, action engine)
read only the bundle. Composition is **multiplicative**; "increase X" → `× (1 + intensity)`, "decrease
X" → `× 1/(1 + intensity)` (asymptotic to 0, never negative). The bundle is **derived, not persisted** —
rebuilt from sources on load. New source = fold a term into a field; new dimension = new field +
`NEUTRAL_MODIFIERS` baseline. Effect *magnitudes* (maleficia, invocation muls) live here; catalog *data*
(gates, costs) lives in its own module. **Locks apply last:** Mark of Cain zeroes Apocalyptic after all
multipliers (incl. Midas ×100). The tier-weight block is built as accumulating products per tier so
contributions compose, then the lock overrides.

**Save schema evolution follows ADR-023.** Additive *optional* fields do **not** bump `schemaVersion`
(still v1): make them `.optional()` in the Zod schema; the **serializer omits them when empty/zero**
(conditional spread — never assign `undefined`, honoring `exactOptionalPropertyTypes`) so a fresh game's
wire form matches the prior version; the **deserializer defaults them** when absent. This is how every
Phase 3 field landed (pools, businesses, buildQueue, toggleDurations, eternalDevotion, startedAt).
Renames, removals, type changes, non-optional adds, or nested-shape changes **do** bump the version and
need a `migrations/v{from}-to-v{to}.ts` (pure, tested). A higher-than-current `schemaVersion` is rejected.

**Reprobate dynamics run on four fractional pools** (02 §9): generation/suicide/murder/conversion. Each
tick adds `rate × delta` to the pool, then drains whole integers (`while pool ≥ 1`), so sub-1
contributions are never lost. Pools are part of the save. `biasedSubtype` weights subtypes by **active
Vitium throughput** (business + Compositum conversion rates), **not** by Sin level — falls back to
unconverted `'reprobate'`. Every death mints exactly 1 soul (1 person, 1 soul — never changes).

**Toggles (Vitium Compositum) deduct upkeep BEFORE income**, so a toggle never earns on a tick it can't
afford; an unpayable toggle **auto-deactivates** that tick (no partial, no refund) and pushes a notice
through `TickResult.notices`. `Panvitium` lives in `COMPOSITA` with three special flags:
`manualDeactivateForbidden` (deactivateToggle refuses it — it ends only by running dry),
`costGrowthPerSecond` (cost = `base × growth ** secondsActive`, with a `Number.isFinite` guard so a
runaway ramp deactivates instead of overflowing), tracked via `toggleDurations`.

**Acolytes:** `maxAcolytes = max(1, 1 + floor(log10(maxInfluence / BASE_MAX_INFLUENCE)))` on the
**post-modifier** influence cap; auto-recruited (no cost, no delay, additive — never recreated mid-life);
assigned lowest-idle-first, unassigned LIFO; **lost only at Katabasis** (no refusal/cooldown — that was
removed). They run in parallel queue slots at 33% × player efficiency baseline.

**Invocations** gate on **invoking power** (sum of equipped maleficia `invokingPower`; sigils add later)
plus an optional Sin level; an entry is **visible at ≥ half** the required IP (02 §12). Soul cost =
`max(floor(fraction × pool), minimum)`, or free for apex entities (which carry `maxActive: 1`). The
`invocations` map is reset to `{}` on Katabasis.

**The Eternal Sin (ADR/03 §8) is top-level, not lifetime.** `eternalDevotion` and `startedAt` sit on
`GameState` (not `lifetime`) so they survive Katabasis. `eternalSinRevealed` is **derived** from
`eternalDevotion ≥ ETERNAL_SIN_THRESHOLD`; the store's one-shot reveal flag is set only on the
before/after crossing transition. Runtime score = `lastTickAt − startedAt` (no `Date.now()` in sim).

**Fastify + Zod bridge.** Use `fastify-type-provider-zod@4` — v6 requires Zod 4 and the repo is on Zod
3. The provider strictly types response status codes: declaring a `200` schema makes `reply.code(401/422)`
and `{ error }` returns type-errors. The skeleton therefore validates **inputs** (`body`/`querystring`)
and **omits response schemas**; add a typed error envelope later if response contracts are wanted.

**API production image.** `pnpm -C apps/api build` (tsup, two entries: `index` + `migrate`) then
`pnpm --filter=@panvitium/api deploy --prod` → pruned non-root runtime (`node dist/index.js`). Prod
migrations run the **bundled `src/migrate.ts`** (drizzle-orm's programmatic migrator) because the pruned
image has no drizzle-kit; **dev** migrations use `drizzle-kit migrate`. Both share the
`__drizzle_migrations` journal, so they're interchangeable. `drizzle-kit generate` (authoring) needs no
DB; `migrate` does. The web prod image builds the SPA and serves it from `nginx:alpine` with SPA fallback.

**Docker dev (ADR-016).** `compose.yaml` (base: postgres + one-shot `migrate` + api + web, healthchecks,
`depends_on` with `service_healthy` / `service_completed_successfully`) + `compose.override.yaml` (dev:
bind-mount `./:/app` with an **anonymous volume on every `node_modules`** path so host/Linux deps don't
clash, plus host ports). Compose **v2** (`docker compose`, no `version:` key). Migrations run as the
one-shot service, **not** in a `CMD`. On Debian, install Docker from the **official apt repo** — the
distro package lacks the v2 compose plugin.

**Prettier scope.** `docs/` is in `.prettierignore` (the design docs are hand-authored and synced with
project knowledge — don't let the formatter churn them), as is `apps/api/drizzle/` (generated). CI's
`format:check` enforces the same set, so an ignore must exist in both worlds.

**Playwright e2e** is `@playwright/test` (TS), run against a `vite preview` production build via the
config's `webServer`. Selectors come from accessible names (hotspot `aria-label`s, dialog roles).
Validate specs compile with `playwright test --list` even when no browser is available.

**The Latin is the product's voice — never anglicize or "correct" it.** *Opera, Suasio, Decimatio,
Depraedatio, Invocatio, Indagatio, Emptio, Vitium Mercatura, Vitium Compositum, Panvitium, Katabasis*
and the Prince/Sin/sigil names are deliberate (ADR-020). Treat the theology seriously (grim-baroque,
not parody). The displayed resource label is **"Souls"** (not "Hellsouls"). When unsure of a term,
check `03-content-catalog.md`.

---

## 6. Quick reference: GameState shape

`packages/sim` owns `GameState` (the gameplay core). `packages/shared` wraps it in the save envelope
(`schemaVersion`, `saveVersion`, `lastTickAt`, `deviceId` — ADR-010).

**Top-level** (persists across Katabasis): `souls` (BigNum), `devotion` (per-Sin BigNum totals),
`eternalDevotion` (BigNum), `sigilBindings` (sigil id → bound BigNum), `lifetime` (below), `rngState`
(serializable integer), `lastTickAt` (logical clock), `startedAt` (game-creation clock, for the score).

**`lifetime`** (reset on Katabasis): `gold` / `influence` / `maxInfluence` (BigNum); `reprobates`
(per-subtype integer counts); `acolytes` (`{id, assignedAction, remainingSeconds}[]`); `invocations`
(id → count); `maleficia` (string[], duplicates for stackables); `emptioList` (string[]); `activeToggles`
(string[]); `toggleDurations` (id → seconds active, for Panvitium's ramp); `actionQueue`
(`{actionId, remainingSeconds, target?}[]`); `businesses` (id → count); `buildQueue`
(`{businessId, remainingSeconds}[]`); and the four reprobate-dynamics pools `generationPool`,
`suicidePool`, `murderPool`, `conversionPool` (numbers).

Most `lifetime` extension fields are **additive-optional on the wire** (ADR-023): absent/empty/zero
round-trips identically to a pre-feature save. `schemaVersion` is still **v1** — no migrations exist yet
(the `migrations/` dir holds a `_noop` placeholder + harness).

Derived, never stored: Sin levels, skill intensities, the entire `Modifiers` bundle, max acolytes,
reveal state. Recompute from sources on load.
