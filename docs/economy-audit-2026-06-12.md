# Panvitium — Economy Template Audit (2026-06-12)

> **Status (2026-06-17): ALL SIX SLICES ARE LANDED.** A line-by-line reconciliation against the
> current code found every numeric mismatch and ⚠ retouch in this audit already implemented:
> - **Slice 1 (Globals/flat):** suicide 0.0001/s, murder 0.0002/s, Vanagloria ×1.33/lvl, Acedia
>   `1.0000002^(s·L²)`, Solomon's Ring ×1.66, Galdrabók ×1.15, Purgatio 1,000,000 g, Indagatio
>   300 s, acolyte ×1.5 ladder (first at 110), the four maleficia price bands.
> - **Slice 2 (action tiers):** Logismoi/Imperium/Caedes/Pogrom/Purgatio distributions re-pinned;
>   Imperium is a full distribution (0.035 Stellar/Apocalyptic); Purgatio Terrible/Apocalyptic shed
>   100% gold (+ reprobates) — all in `actions.data.ts` / `actions.ts`.
> - **Slice 3 (Vitium Compositum):** roster is the canonical nine; Vegas/Crusade percentage
>   cost/output semantics and the four pair effects (±10%) all wired in `compositum.data.ts`.
> - **Slice 4 (Sins remap):** Gula −25%/lvl negative-tier reduction, Luxuria/Ira ×2 category
>   efficiency, Tristitia→acolytes, Ira→invocations; the orphaned per-level suicide doubling removed.
> - **Slice 5 (sigils):** all 72 carry effects with per-sigil coefficients/curves; the 16 revivals
>   and the re-targets (incl. the Crocell/Furcas swap and Amy's negative sign) are present.
> - **Slice 6 (invocations):** Specunitas ×2 influence, Lamia→Logismoi, Succubus→Imperium,
>   Harpy→Pogrom, Nightmare 5e-05, Thirty Pieces of Silver +0.001%/current-gold.
>
> The "Questions back to you" were resolved in code's favour (Imp stayed an autonomous forced-Good
> Caedes runner; Logismoi Excellent/Good differentiated to `randint(20,58)`/`randint(10,29)`; the
> 65.37 divisor stands). **The per-row ✗/⚠ tables below are the original 2026-06-12 snapshot — trust
> the code and this banner over them.** This audit is effectively closed; kept for history.

**Scope.** The newly uploaded `Panvitium_Economy_Template.xlsx` audited sheet-by-sheet against the
current repo (post Mercatus/Foedera, clauses, and doc-reconciliation slices; gate green at 709
tests). Convention: **the spreadsheet always wins** on numbers and on a system's composition.
Legend: ✓ code matches sheet · ✗ numeric mismatch (straightforward fix) · ⚠ system retouch
(needs a designed slice) · ❓ sheet erratum / question back to you.

---

## 1. Globals

| Row | Sheet | Code | Verdict |
|---|---|---|---|
| Base gold gain 2/s | 2 | `BASE_GOLD_PER_SECOND = 2` | ✓ |
| Base max influence 100 / gain 0.005 | 100 / 0.005 | matches | ✓ |
| **Base suicide rate 0.0001/s** | 0.0001 | `BASE_SUICIDE_RATE_PER_SECOND = 0.00023` | ✗ |
| **Base murder rate 0.0002/s** | 0.0002 | `BASE_MURDER_RATE_PER_SECOND = 0.0001` | ✗ |
| Offline efficiency 0.5 | 0.5 | `PLAYER_OFFLINE_EFFICIENCY = 0.5` (wired, ADR-026) | ✓ |
| Acolyte 0.33 / Invocation 0.05 eff | — | matches | ✓ |
| Remaining gold/maleficia/reprobate 5% | 0.05 | matches | ✓ |
| Shutdown recovery 0.25 | 0.25 | `DIVEST_FRACTION = 0.25` | ✓ |
| Devotion base 180 / Semet 8,398,080,000 | — | matches (`8×180⁴`) | ✓ |
| Base VC costs/outputs 100/10/100/10 | — | matches as the formula bases | ✓ |
| **Base VC conversion rate 0.01** | 0.01 | conversion removed (ADR-024) | ❓ vestigial row — delete from sheet? |

## 2. Sins & Devotion — **major retouch** ⚠

The skill column (intensity-driven) and per-level column have been **remapped**:

| Sin | Sheet skill (intensity) | Sheet per-level | Code today | Verdict |
|---|---|---|---|---|
| Gula | + online player eff | **−25% Bad/Terrible/Apocalyptic chance per level (additive; 0% at L4)** | per-level = ×2 player efficiency (`2^gulaLvl`) | ⚠ per-level effect replaced |
| Luxuria | + reprobate generation | **×2 Suasio efficiency per level** + unlocks | Suasio eff driven by *Tristitia intensity*; no per-level ×2 | ⚠ remapped |
| Avaritia | + gold gain | +12.5% remaining gold %/lvl | matches | ✓ |
| Tristitia | **+ acolyte efficiency** | +12.5% remaining reprobate %/lvl | skill → Suasio eff + suicide; per-level `2^lvl` **suicide doubling** not on sheet | ⚠ remapped; suicide doubling orphaned |
| Ira | **+ invocation efficiency** | **×2 Decimatio efficiency per level** + unlocks | skill → Decimatio eff; per-level ×1.33 acolyte+invocation | ⚠ remapped |
| Acedia | + offline player eff | compound **`1.0000002^(s·L²)`, s in seconds** | `1.00002^(minutes·L²)` ≈ `1.00000033^s` | ✗ base & unit changed (~1.7× slower growth on sheet) |
| Vanagloria | + max influence | **×1.33 influence gain /lvl** | `1.5^vanagloriaLvl` | ✗ 1.5 → 1.33 |
| Superbia | + Stellar chance | +12.5% remaining maleficia chance/lvl | matches (`0.125`) | ✓ |

❓ **Sheet-internal inconsistency:** row 2 prose says intensity divisor `0.6537`; the formulas (and
code) use `65.37`. Confirm 65.37 stands and fix the prose.

## 3. Suasio / Decimatio (actions) — numbers changed, plus toggles ✓

- **Action toggles** (Suggestion/Caedes at L1, Logismoi/Pogrom at L3, Imperium/Purgatio at L4):
  already in code and matching the sheet's gates. ✓
- **Costs/durations:** Suggestion 5s/5infl ✓ · Logismoi 5s/25infl ✓ · Imperium 10s/100infl ✓ ·
  Caedes 10s/100g ✓ · Pogrom ~60s/1000g ✓ · **Purgatio 1,000,000 gold (code: 10,000)** ✗ —
  duration "~360s" needs verification against code.
- **Tier distributions — broadly retuned** ✗: Logismoi sheet `0.01/0.15/0.3/0.3/0.17/0.069/0.001`
  vs code `0.025/0.2/…`; **Imperium now has a full distribution incl. 0.035 Stellar (+3% current
  souls!) and 0.035 Apocalyptic** vs code's fixed-outcome zeros — that is a ⚠ retouch (Imperium is
  no longer "player in control"); Caedes/Pogrom/Purgatio weights all shifted; Purgatio Terrible =
  **lose 100% gold**, Apocalyptic = **lose 100% gold and reprobates** (new severities). Every
  effect cell needs a row-by-row re-pin (e.g. Suggestion Terrible −9%, Logismoi Excellent and Good
  both `randint(10,29)` — ❓ confirm the duplicate is intentional).

## 4. Indagatio & Emptio

- **Indagatio time 300s** — code 1800s (the old ADR open item "1800s collides with the solo queue"
  is hereby resolved by retune). ✗
- Emptio time 60s — verify vs code. Indagatio weights `0.001/0.049/0.2/0.5/0.15/0.049/0.001`
  **sum to 0.95** ❓ (renormalisation handles it, but confirm the missing 0.05 is intentional).
- Effects ladder (anathema/profane/rare/common by tier) — matches the code's shape; Terrible −15% /
  Apocalyptic −80% gold ✓.

## 5. Maleficia

- **Thirty Pieces of Silver: "gold gain +0.001% per current gold"** — code: flat ×3. ⚠ retouch
  (scaling with held gold is a new mechanic; needs an overflow-safe formulation).
- **Solomon's Ring ×1.66 sigil effect** — code ×1.5. ✗
- **Galdrabók ×1.15 murder** — not in the code constant set I can see; verify/add. ✗/⚠
- Witch Ladder/Adder Stone/Poppet ×1.05, Black Candles +5% (cap 5), Iron Nails +1%+1pw,
  Ars Serpens ×1.33, Ritual Dagger ×1.33, Voynich ×1.66, Codex ×3, Spear ×3, Mark of Cain ×3 ✓
  (match the code constants).
- **Prices:** sheet Anathema `randint(66666,93456)`, Profane `(6666,23754)`, Rare `(1000,3333)`,
  Common `(100,1000)` — verify against `MALEFICIUM_PRICE_RANGE` (not extracted in this pass). ✗?
- Stack caps and invoking-power column: spot checks ✓; full sweep belongs to the fix slice.

## 6. Invocatio — several retouches ⚠

- **Specunitas (Vanagloria Apex): "×2 influence gain/s"** — re-targeted from its neutralized
  conversion-bias effect. ⚠ (resolves one ADR-024 orphan).
- **Lamia → applies to *Logismoi*** (code: runs *Suggestion*). ⚠
- **Succubus: "action efficiency applies to *Imperium*", eff 0.99, cost 99% current gold gain/s**
  — code models Succubus as a Suasio-efficiency + gold-drain modifier pair. ⚠
- **Harpy: applies to *Pogrom*** (code: boosts all Decimatio efficiency). ⚠
- **Imp: "efficiency applies to Caedes"** — code runs Caedes autonomously at forced-Good; confirm
  whether the runner model stays. ❓
- Aurevora: "eats 10 gold/s rising exponentially; one tenth applied as player-eff increase" —
  reconcile the exact ramp vs code's `eᵗ` drain/boost pair. ❓
- Efficiency column: Familiar 0.01, Lemure 0.025 ✓, Plutus/Upir/Imp/Harpy/Lamia/Fama 0.05 ✓,
  Behemoth 5e-05 ✓, Nightmare 5e-05 vs code `NIGHTMARE_SUICIDE_FACTOR = 0.05` ✗ (×1000 apart).
- Gates/costs (invoking power, Sin level, per-second costs incl. **Fama 25% current gold/s**,
  Morpheus 90% souls & gold) — full row-by-row verification belongs to the fix slice.

## 7. Vitium Mercatura

Constants block, clause table, Foedus parameters, opt-out flags: **all match the shipped code
exactly** (the sheet carries the blocks written in the clause slice). ✓

## 8. Vitium Compositum — the "Slice 3" the backlog predicted ⚠

The sheet now specifies the canonical nine with full costs/outputs/effects:

| Ceremony | Sheet | Code | Verdict |
|---|---|---|---|
| Charity | 100g+25i cost → **200 gold out** | re-verify def | ✗ verify |
| Gala | 250g cost → **20 influence out** | re-verify def | ✗ verify |
| Bacchanal | 100g+10i; **+10% online generation** | re-verify magnitude | ✗ verify |
| Dolce Far Niente | free; +1% offline gold & generation | `offlineGainBoost 0.01` scales the whole catch-up (gold+gen+everything) | ≈✓ (note: code is broader than the sheet text) |
| Enraging Broadcast | 25i; **+10% murder** | re-verify (flat vs mul) | ✗ verify |
| Doom Gathering | 100g+10i; **+10% suicide** | re-verify | ✗ verify |
| **Vegas** | cost **50% current gold gain/s** → **1% current gold gain/s as influence** | flat 1000g cost / 100 infl out placeholder | ⚠ percentage semantics |
| **Crusade** | cost **50% current influence gain/s** → **1000% current influence gain/s as gold** | flat 100i cost / 1000g out placeholder | ⚠ percentage semantics |
| Panvitium | cost `10×B15·eᵗ` / `10×B16·eᵗ` | 1000·eᵗ gold / 100·eᵗ influence | ❓ **sheet erratum**: B15/B16 now point at *Devotion base* and *Semet cost* (1800·eᵗ gold, 8.4e10·eᵗ influence!) — almost certainly stale references that meant the Base VC cost rows (B17/B18 → 1000/100, which the code has). Confirm and fix the sheet formula. |
| **Roster** | nine ceremonies | thirteen in code | ⚠ retire Loan Shark Op / Outrage Cycle / No-babies Movement / Ethnocentric Revolt (mind saved `activeToggles`; the VM opt-out flag table still lists 13 and shrinks with them) |

## 9. Acolytes

- **Threshold ladder: 110, then ×1.5 (110 → 165 → 247.5 → 371.25 → …, rounded), first acolyte at
  110** — code: ×2.2 ladder anchored at 110 with the *first* at 242. ✗ (both growth factor and
  the first-unlock semantics changed).
- Per-acolyte efficiency 0.33 ✓. Room-background notes are a UI/art concern (5.3).

## 10. Sigils — full respecification ⚠ (the orphaned-sigils pass, delivered)

The sheet now defines **all 72** with `curve` (sqrt/log/linear semantics per the header note) and
`base coeff`. Headlines:

- **All 16 inert sigils get effects**: #1 Bael (−Opera negative chance), #15 Eligos (offline
  influence), #25 Glasya-Labolas (flat murder, log 0.001), #27 Ronove (+suicide), #33 Gaap
  (+maleficia effect %, log 0.01), #37 Phenex (−Emptio negative), #39 Malphas (duplicate Suasio
  output), #41 Focalor (duplicate Decimatio output), #43 Sabnock (flat suicide, log), #47 Vual
  (+Suasio Stellar), #53 Camio (+remaining reprobate %, log 1), #56 Gremory (+Suasio positive),
  #57 Ose (flat generation, log 0.3), #59 Orias (+VC influence output), #62 Volac (−Indagatio
  negative), #64 Haures (+Decimatio Stellar).
- **Re-targets of currently-wired sigils**: #12 Sitri → *VM reprobate generation* (code: succubus
  effectiveness); #30 Forneus → *invoking power, flat log 0.5* (code: offline influence — which
  moves to #15 Eligos); **#49 Crocell ⇄ #50 Furcas swap** (Crocell → Indagatio-finds-2, Furcas →
  shutdown recovery — the new sheet matches what `03` always claimed); #2 Agares → *duplicate
  Indagatio output* (code: Indagatio tier bias); #14 Leraie → *a murder triggers a suicide*
  (code: murder-gold); #58 Amy → **negative** Indagatio/Emptio efficiency (the old sign question,
  now answered: it is a cursed sigil).
- **Coefficients**: sheet sqrt entries sit at `0.0001` (Paimon 5e-05, Foras 2.5e-05) and log
  entries at per-sigil values (0.01–3); the code catalog carries a near-uniform `0.001`. A
  systematic coefficient re-pin is needed across all 72 — order-of-magnitude differences are the
  norm, not the exception.

## 11. Prob Tiers

Authoring template only (weights zeroed, renormalisation formulas). Nothing to reconcile. ✓

---

## Proposed fix sequencing (each its own gate-green slice)

1. ~~**Globals & flat numbers** — suicide/murder bases, Vanagloria 1.33, Acedia compound
   (base+unit), Solomon's Ring 1.66, Purgatio cost, Indagatio 300s, acolyte ladder, maleficia
   prices. Mostly constants + test re-pins.~~ **DONE (2026-06-17)** — all values match the sheet;
   the stale comments that still described the pre-fix numbers were corrected.
2. ~~**Action tier tables** — all eight distributions and effect cells re-pinned to the sheet
   (incl. the Imperium full-distribution retouch).~~ **DONE** — `actions.data.ts` / `actions.ts`.
3. ~~**VC Slice 3** — roster retirement (with `activeToggles` care), percentage upkeeps/outputs for
   Vegas/Crusade, the four pair effects re-verified at 10%/1%.~~ **DONE** — `compositum.data.ts`.
4. ~~**Sins remap** — the skill/per-level retargeting (Gula negative-chance ladder, Luxuria/Ira ×2
   category efficiency, Tristitia→acolytes, Ira→invocations; remove the orphaned suicide
   doubling).~~ **DONE** — `constants.ts` / `modifiers.ts`.
5. ~~**Sigils re-pin** — the 16 revivals, the re-targets, and the full 72-coefficient/curve sweep.~~
   **DONE** — all 72 in `sigils.data.ts`.
6. ~~**Invocation retouches** — Specunitas, Lamia/Harpy/Succubus re-targets, Nightmare factor,
   Silver's per-gold scaling (with Maleficia oddballs).~~ **DONE** — `invocations.data.ts` /
   `modifiers.ts`.

## Questions back to you (blocking the relevant slices)

1. Panvitium's sheet cost formula references Globals B15/B16 (Devotion base / Semet cost) — stale
   row references for B17/B18 (Base VC costs)? Code currently implements 1000·eᵗ / 100·eᵗ.
2. Indagatio weights sum to 0.95 — intentional (renormalised) or a typo?
3. Logismoi Excellent and Good both `randint(10,29)` — intentional?
4. Globals row 21 "Base VC conversion rate" — vestigial post-ADR-024; delete?
5. Skill-intensity divisor: prose says 0.6537, formulas say 65.37 — confirm 65.37.
6. Imp: keep the autonomous forced-Good Caedes runner, or change to a Caedes-efficiency
   contributor as the sheet's wording suggests?
