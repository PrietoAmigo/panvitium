# Handoff: Orbis Tenebrarum — merged **Indagatio × Emptio**

A visual rework that **merges the Indagatio and Emptio menus into one surface.** Indagatio
("searching out") and Emptio ("purchase") were two separate PC programs; the fiction now unifies
them: **scry the world for maleficia, then bind the relics that surface.** A draggable orthographic
globe is the search; discovered maleficia glow as pins on the world and list in an adjoining Emptio
market where gold acquires them.

> Built against `docs/frontend/DESIGNING_FOR_PANVITIUM.md`: presentational, prop-driven, flavour vs
> mechanics split, keyed by canonical maleficium ids.

---

## Files (drop into `apps/web/src/menus/`)

| File | What it is |
| --- | --- |
| `OrbisTenebrarum.tsx` | The component. The globe is a canvas engine (drag-to-rotate, inertia, search-spin, pins) wrapped in a `useOrbisGlobe` hook; the Emptio ledger + detail are plain JSX. **This is the deliverable.** |
| `orbis.types.ts` | Presentation shapes — the contract the integrator fills (`OrbisFind`, `OrbisTenebrarumProps`). |
| `orbis.data.ts` | Flavour: rarity → colour, and the globe coordinate map (`coordForFind`). Stand-in; safe to tune. |
| `orbis.css` | One stylesheet, reuses the grimoire palette + Cinzel / EB Garamond / IM Fell. Import once after the base sheet. |
| `index.ts` | Barrel. |

---

## Dependencies to add

The globe uses d3's orthographic projection + the world-atlas land outline:

```sh
pnpm --filter @panvitium/web add d3-geo topojson-client world-atlas
pnpm --filter @panvitium/web add -D @types/d3-geo @types/topojson-client
```

- `world-atlas/land-110m.json` is **lazy-imported** inside the globe effect, so it code-splits out of
  the initial chunk. If the import fails (offline), the globe degrades to a graticule sphere — pins
  and interaction still work.
- No CDN, no `fetch` to a network atlas (the prototype used a CDN; this uses the bundled package).

---

## Archetype

**Full-surface program body.** It renders its own dark stage + ledger but **no titlebar or close** —
the host shell supplies those. Two clean ways to mount it:

1. **As a PC fullbleed program** (recommended). It replaces the old `Indagatio` and `Emptio` tiles
   with one. In `PcWindow.tsx`: collapse the two `EXECUTABLES` entries into a single program (e.g.
   `{ id: 'Indagatio', color: '#2c7bbe', glyph: '?' }`), add that id to the `FULLBLEED` set, and have
   `renderProgram('Indagatio')` return `<OrbisTenebrarum … />`. It fills `.pc-app--fullbleed`.
2. **As a full-screen overlay**, wrapped in your own `.panel-overlay` + titlebar (like Ars Goetia /
   Katabasis), if you'd rather it open from a room hotspot than from the PC.

It expects a sized parent (it's `height: 100%`, min 600px). The globe stage is fixed at 360px; the
ledger is 372px; the rest flexes.

---

## Per-component contract

```
Component:        OrbisTenebrarum
Archetype:        full-surface body (host supplies titlebar/close); fill PC fullbleed or an overlay
Props (data in):
  finds: OrbisFind[]      REAL  — the Emptio list (discovered maleficia), in discovery order.
                                  Each: id (canonical), name, rarity, effect, desc, costLabel
                                  (PRE-FORMATTED price), acquired, affordable. coord is FLAVOUR/optional.
  gold: string           REAL  — treasury, PRE-FORMATTED by the app's bignum formatter.
  searching: boolean     REAL  — true while an Indagatio cycle runs. Integrator owns the timer.
  searchDuration: string REAL  — Indagatio cycle length, PRE-FORMATTED (default '30:00').
  selectedId: string|null UI   — which find is inspected (lift it, or keep it local — see below).
Callbacks (out):
  onCast()               — begin Indagatio.
  onSelect(id)           — inspect a find (globe pin click OR ledger row click both fire this).
  onAcquire(id)          — buy via Emptio.
Local UI state:   none required. selectedId can live in the store or in a tiny wrapper useState.
IDs keyed by:     canonical maleficium id (ars_serpens, obsidian_mirror, …).
Assets:           none authored. Globe land = world-atlas package. Pins are drawn (rarity-coloured).
Placeholders:     orbis.data.ts MALEFICIA_COORDS + costLabel formatting are stand-ins; see below.
A11y:             canvas has aria-label; ledger is role-list of <button>s; rows/buttons are real buttons.
```

### Real vs flavour

- **REAL (from sim / store):** every name, rarity, effect, desc, price, the gold balance, the
  Indagatio duration, the `searching` flag, `acquired`, and `affordable`. Wire these straight from
  the maleficia catalog (`packages/sim`) and the store; `gold`/`costLabel` come **already formatted**
  by the app's number formatter — the component never calls `toLocaleString`.
- **FLAVOUR (design-supplied, safe to change):** the globe **coordinates** (Indagatio has no real
  geography — `coordForFind` maps id → a stable `[lon, lat]`, with a hash fallback for any id not in
  the table), the rarity **colours**, the eyebrow/title/“Scrying…” copy.

---

## Wiring sketch

```tsx
import { OrbisTenebrarum, type OrbisFind } from './menus/orbis-tenebrarum';
import './menus/orbis-tenebrarum/orbis.css';

function IndagatioEmptioProgram(): ReactElement {
  const list   = useGameStore((s) => s.state?.lifetime.emptioList ?? []);
  const prices = useGameStore((s) => s.state?.lifetime.maleficiaPrices);
  const gold   = useGameStore((s) => (s.state ? floor(s.state.lifetime.gold) : ZERO));
  const searching = useUnderway();          // true while any timed action holds the slot
  const act    = useGameStore((s) => s.act);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const finds: OrbisFind[] = list.map((id) => {
    const def = MALEFICIA[id]!;             // canonical catalog entry
    const price = prices?.[id] ?? def.cost;
    return {
      id,
      name: def.name,
      rarity: def.rarity,
      effect: def.effect,
      desc: def.desc,
      costLabel: `${formatGold(price)} g`,  // app formatter — TODO(wire)
      acquired: isOwned(id),                 // TODO(wire): from inventory
      affordable: gold.gte(price),           // TODO(wire): bignum compare
    };
  });

  return (
    <OrbisTenebrarum
      finds={finds}
      gold={formatGold(gold)}
      searching={searching}
      selectedId={selectedId}
      onCast={() => act('indagatio')}
      onSelect={setSelectedId}
      onAcquire={(id) => act('emptio', id)}
    />
  );
}
```

Notes:
- **The component is the source of truth for nothing.** It never runs the 2.6s search timer or
  mutates `finds` — your store flips `searching`, appends the found id to `emptioList`, and sets
  `acquired` on purchase; the globe reacts (it spins while `searching`, eases to the newest find when
  the list grows, and to `selectedId` when it changes).
- **Press-and-hold isn't used here** (Indagatio is a single cast, Emptio a single buy), so the
  large-number hold-ramp guidance doesn't apply — but prices are still passed as formatted strings.
- Grep for `TODO(wire)` in the sketch above for the seams; the component file has none — it's already
  decoupled.

---

## Behaviour reference (so QA knows what's intended)

- **Drag** the globe to spin it; release throws it with light inertia. Idle drift stops once touched.
- **Click a pin** or a **ledger row** → selects that relic (globe eases to centre it, detail panel
  opens). Both paths call `onSelect`.
- **Cast the Search** while `searching` is false → globe spins fast with a teal rim-pulse; when your
  store appends the found maleficium, the spin settles on its pin and the pin drops in.
- **Acquire** is enabled only when `affordable` and not `acquired`; bought relics read “◈ Bound” and
  dim their pin.
