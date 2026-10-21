# Handoff: Analytics program rework (PC → Analytics)

## Overview
Redesign of the PC's **Analytics** program (`apps/web/src/ui/Analytics.tsx`, opened via `PcWindow`). Same three tabs (Main / Actions / Risk) and the same data; the goal is better at-a-glance scanning and clear hierarchy. Visual register: a mundane, printed-report-style corporate BI tool — deliberately **not** the Depraedatio/Counting House skin (no sidebar, no rounded cards, no teal).

## About the Design Files
The files here are **design references built in HTML** — prototypes showing intended look and behaviour, not production code. Recreate them in the existing `apps/web` stack (Vite + React + Zustand), reading real values from the store/selectors that `Analytics.tsx` already uses. Values in the mock are sample data.

- `Analytics v3.dc.html` — the target design. Open directly in a browser (needs `support.js` beside it).
- `Analytics (current).dc.html` — recreation of the current page, for diffing.

## Fidelity
**High-fidelity.** Recreate colours, type, spacing and rules exactly. Implement as a CSS block scoped under a new class (e.g. `.an-*`) in `styles/index.css`, following the repo's existing class-based convention.

## Shell (unchanged)
Keep the existing PC window chrome and the 48px titlebar (`‹ Files`, mono "Analytics" label, round close). The Analytics app **replaces the Ubuntu-aubergine desk + floating dark card** and fills the whole window body (like Depraedatio's full-bleed mode).

## Layout
- App body: `display:flex; flex-direction:column; background:#f6f5f1; color:#16181d; font-family:'IBM Plex Sans Condensed'`.
- **Header** (fixed, non-scrolling): `padding:0 32px; border-bottom:2px solid #16181d; display:flex; justify-content:space-between; align-items:flex-end; gap:24px`.
  - Left: tab row, `gap:28px`. Each tab is a bare button: 0.95rem / 600, `padding:18px 0 12px; margin-bottom:-2px; border-bottom:4px solid`. Active: text `#16181d`, bar `#2f4fb0`. Inactive: text `#6c6f76`, bar transparent.
  - Right: per-tab subtitle in JetBrains Mono 0.66rem, `#6c6f76`, `padding-bottom:14px`, nowrap.
    - Main: "Resources, flows and the reprobate population"
    - Actions: "Everything acting on your behalf, right now"
    - Risk: existing `riskIntro` string ("The odds of every outcome of every action, as they stand right now.")
  - **Risk tab only renders when the Risk algos contract is owned** (current gating).
- **Scroll area**: `flex:1; overflow-y:auto; padding:28px 32px 48px`; inner content `max-width:1080px; margin:0 auto`.

### Shared primitives
- **Section heading (h2)**: 0.78rem / 600, `margin:0 0 10px`. Optional suffix span in JetBrains Mono 400 `#6c6f76`, e.g. "· per second".
- **Ruled table**: CSS grid with `column-gap:0`, `border-top:1px solid #16181d`. Spacing between columns comes from `padding-left:32px` on every non-first cell (so row rules are continuous — do not use column-gap).
  - Header cells: 0.7rem, `#6c6f76`, `padding:8px 0`, `border-bottom:1px solid #d8d6cf`. Numeric columns right-aligned.
  - Body cells: `padding:12px 0`, `border-bottom:1px solid #e6e4dd`. Label cells 0.92rem / 500. Numeric cells JetBrains Mono 0.82rem `#3d4048`, right-aligned, nowrap, tabular-nums.
- **KPI block**: `padding-top:12px; border-top:1px solid #16181d; gap:6px`. Label 0.78rem/600; value 3.2rem / 500, line-height 1, letter-spacing −0.03em, tabular-nums; optional cap (JetBrains Mono 0.74rem `#6c6f76`, e.g. "of 2,000"); net line JetBrains Mono 0.78rem/500 `#2f4fb0` ("+1.95/s net").
- **Progress bar**: 10px tall, square corners, track `#e6e4dd`, fill `#2f4fb0`.

## Screens
### Main
1. KPI row: `grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); column-gap:40px; row-gap:24px`. Three KPIs: **Influence** (value, cap "of {max}", net), **Gold** (value, net), **Reprobates** (value, net).
2. Below, `grid-template-columns:minmax(0,2fr) minmax(0,1fr); gap:40px`; vertical gap to KPIs 36px.
   - **Flows · per second** — ruled table, columns `minmax(0,1fr) auto auto auto`: (blank) / Generation / Upkeep / **Net**. Net header is `#16181d` 600; Net cells 0.86rem / 600 `#2f4fb0`. Rows: Gold, Influence, Reprobates.
   - **Reprobate deaths · per second** — flex column, border-top `#16181d`. Rows "By murder", "By suicide" (values JetBrains Mono 0.82rem `#b3261e`), then a **Total** row (600, no bottom border).

### Actions
1. Top row `grid-template-columns:minmax(220px,1fr) minmax(0,2fr); gap:40px; align-items:end`:
   - KPI: **Player action efficiency** "2.3×".
   - Player in-flight rite: top rule, header line "Player · {action}" (0.78rem/600) + "{n} left" (mono 0.78rem), then progress bar. Hide or show "idle" when no rite is running.
2. **Acolytes** — ruled table, columns `auto auto minmax(0,1fr) auto minmax(120px,260px)`: Acolyte / Efficiency (right) / Action / Remaining (right) / Progress. Idle acolytes: all text `#9a9ca2`, action "idle", remaining "–", empty bar. Keep the existing `noAcolytes` empty state.
3. **Invocations · total effect, all copies** — `repeat(auto-fit,minmax(220px,1fr))`, column-gap 0, top rule. Each item: `padding:12px 32px 12px 0`, bottom rule `#e6e4dd`; name 0.92rem/600, effect mono 0.78rem `#3d4048` (existing effect strings).

### Risk
- Ruled grid `minmax(120px,1fr) repeat(7,minmax(70px,auto))`, `min-width:720px`, wrapper `overflow-x:auto`. Header row bottom border is `1px solid #16181d` (stronger).
- Tier headers 0.7rem/600, right-aligned, `padding:8px 10px`. Colour by tier: Stellar/Excellent/Good `#2f4fb0`; Neutral/Bad `#3d4048`; Terrible/Apocalyptic `#b3261e`. Cells use the same tier colour.
- Group label rows (Logos, Indagatio, Emptio…) span all columns: 0.7rem/600 `#6c6f76`, `padding:16px 0 6px`, bottom rule `#d8d6cf`.
- Action rows: name 0.92rem/500; cells JetBrains Mono 0.82rem, `padding:10px`, bottom rule `#e6e4dd`.
- **Likeliest outcome highlight**: the max cell in each row gets `font-weight:600; background:#e9e7df`. (Mock exposes this as a toggle, default on.)
- Percent formatting: `0%` for zero, `<0.1%` below 0.05, else one decimal.

## Interactions & state
- Local state: `tab: 'main' | 'actions' | 'risk'`; fall back to `main` if Risk becomes unavailable.
- Tabs are `role="tab"` buttons inside `role="tablist"`; no transitions.
- All values are live from the store at the existing tick rate; progress widths update per tick.
- Number formatting: rates below 10/s should show 2 decimals (e.g. "+1.95/s") — today `fmtRate` rounds small rates to "+0/s". Large values use thousands separators.

## Design tokens
- Paper `#f6f5f1` · Ink `#16181d` · Secondary text `#3d4048` · Muted `#6c6f76` · Disabled `#9a9ca2`
- Rule strong `#16181d` · Rule header `#d8d6cf` · Rule row / bar track `#e6e4dd` · Highlight `#e9e7df`
- Positive / accent `#2f4fb0` · Negative `#b3261e`
- Fonts: IBM Plex Sans Condensed (400/500/600/700), JetBrains Mono (400/500/600) — Google Fonts
- Type scale: 3.2rem KPI · 0.95rem tab · 0.92rem body · 0.82–0.86rem numerics · 0.78rem headings/labels · 0.7rem table headers · 0.66rem subtitle
- Spacing: 32px page/column padding · 40px block gaps · 36px section stack · 12px row padding
- Radius: 0 everywhere in the app body. No shadows.

## Assets
None new. Background `studio_complete.png` in the mock is just the room behind the PC.

## Files
- `Analytics v3.dc.html` — target design (logic class at bottom holds the sample data + formatting rules)
- `Analytics (current).dc.html` — current-state reference
- Source in repo: `apps/web/src/ui/Analytics.tsx`, `apps/web/src/menus/PcWindow.tsx`, `apps/web/src/styles/index.css`, `packages/shared/src/strings.ts`
