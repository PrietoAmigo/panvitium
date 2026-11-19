// OrbisTenebrarum — the merged Indagatio × Emptio surface for Panvitium, in the "Dithered Orb"
// pixel-art dress (Claude Design).
//
// Archetype:  full-surface program body (renders its own dark stage + Emptio ledger; NO titlebar/
//             close — the host shell supplies those). Fills the PC desk as a FULLBLEED program.
// Data flow:  pure function of props. The search timer, the appends to `finds`, and the gold
//             debit on acquire all live in the store; this component only renders + emits intent.
//
// The globe is a low-resolution orthographic world (orbis.pixel.ts) drawn into a canvas of n×n art
// pixels and upscaled 3× nearest-neighbour; n follows the room the stage leaves, so the art pixel
// stays one size. Drag it to spin (with inertia); click a pin to select it; selecting (pin or ledger
// row) eases the globe to that relic; a search spins the world fast under a teal sweep.

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from 'react';
import { strings } from '@panvitium/shared';
import { PixelSprite } from '../PixelRelic.js';
import { relicGrid } from '../pixelArt.js';
import { RARITY as RELIC_RARITY } from '../relics.js';
import { ORBIS_RARITY, ORBIS_TIER_FIND, coordForFind, formatCoord } from './orbis.data.js';
import {
  ART_PX,
  GLOBE_DEFAULT_N,
  GLOBE_RADIUS,
  buildGlobeTables,
  drawArrow,
  drawBrackets,
  drawPin,
  drawProgress,
  globeSideFor,
  octantOf,
  renderGlobe,
  type GlobeTables,
} from './orbis.pixel.js';
import type { OrbisFind, OrbisRarity, OrbisTenebrarumProps } from './orbis.types.js';

const RARITIES: readonly OrbisRarity[] = ['common', 'rare', 'profane', 'anathema'];

/** The Search log's own copy (its heading, note and empty line). */
const LOG_COPY = strings.opera.searchLog;

const DEG = Math.PI / 180;

/** The detail's relic sprite: one art pixel per 2 design px, its long side 76 px. */
const SPRITE_PIXEL = 2;
const SPRITE_LONG_SIDE = 76;
/** A ledger row's relic icon: one art pixel per design px in a 24 px slot. */
const ROW_SPRITE_SIDE = 24;

/** A bound (owned) find's pin, dimmed out of its rarity. */
const BOUND_PIN = '#4d5a4a';

interface GlobeSnapshot {
  finds: readonly OrbisFind[];
  searching: boolean;
  selectedId: string | null;
  /** The relic an Emptio is buying, and how far along (0→1); null when none runs. */
  emptio: { id: string; fraction: number } | null;
}

/** DOM nodes the engine updates every frame: the selected find's label (positioned over its pin,
 *  so it is never clipped by the canvas) and the count of finds beyond the horizon. */
interface GlobeOverlays {
  label: RefObject<HTMLDivElement | null>;
  beyond: RefObject<HTMLSpanElement | null>;
}

/** "1 more lies beyond the horizon" / "3 more lie beyond the horizon"; empty when none do. */
function beyondText(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? ' · 1 more lies beyond the horizon' : ` · ${n} more lie beyond the horizon`;
}

interface Engine {
  cLon: number;
  cLat: number;
  vLon: number;
  vLat: number;
  target: readonly [number, number] | null;
  touched: boolean;
  dragging: boolean;
  appear: Record<string, number>;
  prevLen: number;
  prevSel: string | null;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function angDelta(a: number, b: number): number {
  let d = (((b - a) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/**
 * Orthographic position (art pixels) for a `[lon, lat]` given the globe centre `(cLon, cLat)`,
 * radius `R` and centre `c`. Returns `null` when the point sits on the far hemisphere.
 */
function project(
  lon: number,
  lat: number,
  cLon: number,
  cLat: number,
  R: number,
  c: number,
): [number, number] | null {
  const la = lon * DEG;
  const ph = lat * DEG;
  const la0 = cLon * DEG;
  const ph0 = cLat * DEG;
  const cosc = Math.sin(ph0) * Math.sin(ph) + Math.cos(ph0) * Math.cos(ph) * Math.cos(la - la0);
  if (cosc < 0) return null;
  const x = Math.cos(ph) * Math.sin(la - la0);
  const y = Math.cos(ph0) * Math.sin(ph) - Math.sin(ph0) * Math.cos(ph) * Math.cos(la - la0);
  return [c + R * x, c - R * y];
}

/**
 * The on-screen direction (unit vector, y down) from the globe's centre toward a `[lon, lat]` on the
 * far hemisphere: where to mark it on the rim. Null when the point sits dead behind the centre.
 */
function horizonDir(
  lon: number,
  lat: number,
  cLon: number,
  cLat: number,
): readonly [number, number] | null {
  const la = lon * DEG;
  const ph = lat * DEG;
  const la0 = cLon * DEG;
  const ph0 = cLat * DEG;
  const x = Math.cos(ph) * Math.sin(la - la0);
  const y = Math.cos(ph0) * Math.sin(ph) - Math.sin(ph0) * Math.cos(ph) * Math.cos(la - la0);
  const n = Math.hypot(x, y);
  if (n < 1e-6) return null;
  return [x / n, -y / n];
}

/**
 * Imperative globe engine bound to a <canvas>. Reads the latest props each frame via a ref, so the
 * rAF loop and listeners are set up exactly once; rebuilds its per-size tables whenever the canvas
 * side (in art pixels) changes. Emits selection through `onSelect`.
 */
function useOrbisGlobe(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  snapshot: GlobeSnapshot,
  onSelect: (id: string) => void,
  overlays: GlobeOverlays,
): void {
  const snap = useRef(snapshot);
  snap.current = snapshot;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const eng = useRef<Engine>({
    cLon: 20,
    cLat: 18,
    vLon: 0,
    vLat: 0,
    target: null,
    touched: false,
    dragging: false,
    appear: {},
    prevLen: 0,
    prevSel: null,
  });

  // Focus the globe on the newest find, or on a changed selection.
  useEffect(() => {
    const e = eng.current;
    const { finds, selectedId } = snapshot;
    if (finds.length > e.prevLen && finds.length > 0) {
      const nf = finds[finds.length - 1]!;
      e.appear[nf.id] = now();
      e.target = coordForFind(nf);
      e.vLon = 0;
      e.vLat = 0;
      e.touched = true;
    } else if (selectedId && selectedId !== e.prevSel) {
      const f = finds.find((x) => x.id === selectedId);
      if (f) {
        e.target = coordForFind(f);
        e.vLon = 0;
        e.vLat = 0;
        e.touched = true;
      }
    }
    e.prevLen = finds.length;
    e.prevSel = selectedId;
  }, [snapshot.finds, snapshot.selectedId, snapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const e = eng.current;

    let tables: GlobeTables | null = null;
    let image: ImageData | null = null;
    let words: Uint32Array | null = null;
    let landBuf: Uint8Array | null = null;
    let rafId = 0;

    /** (Re)build everything that depends on the canvas side. */
    const ensureSize = (): GlobeTables => {
      const n = canvas.width;
      if (!tables || tables.n !== n) {
        tables = buildGlobeTables(n);
        image = ctx.createImageData(n, n);
        words = new Uint32Array(image.data.buffer);
        landBuf = new Uint8Array(n * n);
      }
      return tables;
    };

    // The far-side count is written only when it changes (it is read by a DOM span, not React).
    let shownBeyond = -1;
    const setBeyond = (n: number): void => {
      if (n === shownBeyond) return;
      shownBeyond = n;
      const el = overlays.beyond.current;
      if (el) el.textContent = beyondText(n);
    };

    const pinAt = (f: OrbisFind, t: GlobeTables): { x: number; y: number } | null => {
      const ll = coordForFind(f);
      const p = project(ll[0], ll[1], e.cLon, e.cLat, t.R, t.c);
      if (!p) return null;
      return { x: Math.floor(p[0]), y: Math.floor(p[1]) };
    };

    const update = (): void => {
      if (snap.current.searching) {
        e.cLon += 1.6; // the world turns under the scrying
        e.touched = true;
        e.vLon = 0;
        e.vLat = 0;
        e.target = null;
        e.cLon = ((e.cLon % 360) + 360) % 360;
        return;
      }
      if (e.target) {
        const dl = angDelta(e.cLon, e.target[0]);
        e.cLon += dl * 0.14;
        e.cLat += (e.target[1] - e.cLat) * 0.14;
        if (Math.abs(dl) < 0.3 && Math.abs(e.target[1] - e.cLat) < 0.3) {
          e.cLon = e.target[0];
          e.cLat = e.target[1];
          e.target = null;
        }
      } else if (!e.dragging) {
        if (!e.touched) {
          e.cLon += 0.11; // gentle idle drift until first interaction
        } else {
          e.cLon += e.vLon;
          e.cLat += e.vLat;
          e.vLon *= 0.93;
          e.vLat *= 0.93;
          if (Math.abs(e.vLon) < 0.002) e.vLon = 0;
          if (Math.abs(e.vLat) < 0.002) e.vLat = 0;
        }
      }
      e.cLat = Math.max(-82, Math.min(82, e.cLat));
      e.cLon = ((e.cLon % 360) + 360) % 360;
    };

    const drawMarks = (t: GlobeTables): void => {
      const { finds, selectedId, emptio } = snap.current;
      let sel: { x: number; y: number; col: string } | null = null;
      let beyond = 0;
      const tNow = now();
      for (const f of finds) {
        const rar = ORBIS_RARITY[f.rarity];
        const pos = pinAt(f, t);
        if (!pos) {
          // Beyond the horizon: an arrowhead just outside the rim, pointing the way to turn.
          beyond += 1;
          const ll = coordForFind(f);
          const dir = horizonDir(ll[0], ll[1], e.cLon, e.cLat);
          if (!dir) continue;
          const rr = t.R + 5;
          drawArrow(
            ctx,
            t.c + dir[0] * rr,
            t.c + dir[1] * rr,
            octantOf(dir[0], dir[1]),
            f.acquired ? BOUND_PIN : rar.color,
          );
          continue;
        }
        // A fresh find flashes white for its first half-second on the world.
        const born = e.appear[f.id];
        let flash = false;
        if (born !== undefined) {
          const age = tNow - born;
          if (age < 450) flash = Math.floor(age / 75) % 2 === 0;
          else delete e.appear[f.id];
        }
        drawPin(ctx, pos.x, pos.y, flash ? '#f4efe0' : f.acquired ? BOUND_PIN : rar.color);
        if (emptio && emptio.id === f.id) drawProgress(ctx, pos.x, pos.y, emptio.fraction);
        if (f.id === selectedId) sel = { x: pos.x, y: pos.y, col: rar.color };
      }
      if (sel) drawBrackets(ctx, sel.x, sel.y, sel.col);
      // The selected find's name rides over its pin as DOM, so it can spill past the globe's edge
      // without being clipped by the canvas; it hides while the pin is on the far side.
      const label = overlays.label.current;
      if (label) {
        if (sel) {
          label.style.left = `${((sel.x + 0.5) / t.n) * 100}%`;
          label.style.top = `${((sel.y - 6) / t.n) * 100}%`;
          label.style.visibility = 'visible';
        } else {
          label.style.visibility = 'hidden';
        }
      }
      setBeyond(beyond);
    };

    const hideOverlays = (): void => {
      const label = overlays.label.current;
      if (label) label.style.visibility = 'hidden';
      setBeyond(0);
    };

    const draw = (): void => {
      const t = ensureSize();
      if (!image || !words || !landBuf) return;
      const searching = snap.current.searching;
      const ms = now();
      renderGlobe(
        t,
        e.cLon,
        e.cLat,
        words,
        landBuf,
        searching
          ? {
              // The rim pulse in four steps, and a sweep crossing the disc every 2.4 s.
              pulse: 0.25 + 0.15 * (Math.floor(((Math.sin(ms / 170) + 1) / 2) * 4) % 4),
              sweepX: Math.floor(((ms % 2400) / 2400) * (t.n + 6)) - 3,
            }
          : null,
      );
      ctx.putImageData(image, 0, 0);
      if (searching) hideOverlays();
      else drawMarks(t);
    };

    const hitTest = (cssX: number, cssY: number): void => {
      const t = ensureSize();
      const s = t.n / canvas.getBoundingClientRect().width;
      const bx = cssX * s;
      const by = cssY * s;
      let best: OrbisFind | null = null;
      let bd = Infinity;
      for (const f of snap.current.finds) {
        const pos = pinAt(f, t);
        if (!pos) continue;
        const d = Math.hypot(pos.x + 0.5 - bx, pos.y + 0.5 - by);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (best && bd < 6) onSelectRef.current(best.id);
    };

    // --- drag to rotate, with inertia + click discrimination ---
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastT = 0;
    let moved = false;
    const localPt = (ev: PointerEvent): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const onDown = (ev: PointerEvent): void => {
      e.dragging = true;
      e.touched = true;
      e.target = null;
      e.vLon = 0;
      e.vLat = 0;
      const p = localPt(ev);
      downX = lastX = p.x;
      downY = lastY = p.y;
      moved = false;
      lastT = now();
      canvas.style.cursor = 'grabbing';
      ev.preventDefault();
    };
    const onMove = (ev: PointerEvent): void => {
      if (!e.dragging) return;
      const p = localPt(ev);
      const dx = p.x - lastX;
      const dy = p.y - lastY;
      if (Math.abs(p.x - downX) + Math.abs(p.y - downY) > 4) moved = true;
      // Degrees per CSS px: one radius of drag turns the world about one radian.
      const k = 1 / (DEG * GLOBE_RADIUS * canvas.getBoundingClientRect().width || 1);
      e.cLon -= dx * k;
      e.cLat += dy * k;
      const t = now();
      const dt = Math.max(12, t - lastT);
      e.vLon = ((-dx * k * 16) / dt) * 0.5;
      e.vLat = ((dy * k * 16) / dt) * 0.5;
      lastX = p.x;
      lastY = p.y;
      lastT = t;
    };
    const onUp = (): void => {
      if (!e.dragging) return;
      e.dragging = false;
      canvas.style.cursor = 'grab';
      if (!moved) {
        e.vLon = 0;
        e.vLat = 0;
        hitTest(downX, downY);
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const loop = (): void => {
      update();
      draw();
      rafId = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * The globe's side in art pixels, measured from the room its area leaves (so the art pixel stays
 * `ART_PX` CSS px at any window size). Falls back to the default side where nothing can be measured.
 */
function useGlobeSide(area: RefObject<HTMLDivElement | null>): number {
  const [n, setN] = useState(GLOBE_DEFAULT_N);
  useEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setN(globeSideFor(r.width, r.height));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [area]);
  return n;
}

/** The failure tiers find nothing: their odds bars are three greys, darkening with the loss. */
const FAIL_SEGMENT: Readonly<Record<string, string>> = {
  bad: '#6a6359',
  terrible: '#534d45',
  apocalyptic: '#403b35',
};

/** An odds bar's colour: the rarity the tier reaches for, or a grey for a failure tier. */
function segmentColor(tier: string): string {
  const rarity = ORBIS_TIER_FIND[tier];
  return rarity ? ORBIS_RARITY[rarity].color : (FAIL_SEGMENT[tier] ?? '#3a3631');
}

const pct = (fraction: number): string =>
  `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;

function LockIcon(): ReactElement {
  return (
    <svg
      className="orbis-lock"
      width="10"
      height="12"
      viewBox="0 0 5 6"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M1 0h3v1h1v2h-1v-2h-3v2h-1v-2h1z M0 3h5v3h-5z" fill="currentColor" />
    </svg>
  );
}

function CoinIcon(): ReactElement {
  return (
    <svg
      className="orbis-coin"
      width="15"
      height="15"
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M1 0h3v1h1v3h-1v1h-3v-1h-1v-3h1z" fill="#cda23f" />
      <path d="M1 1h2v1h-1v1h-1z" fill="#f3dd8c" />
      <path d="M3 2h1v2h-2v-1h1z" fill="#8a6a22" />
    </svg>
  );
}

/** A search's mark in the log: the coin's 5×5 silhouette as a tiny world, land on a dark sea in the
 *  globe's own colours. */
function OrbIcon(): ReactElement {
  return (
    <svg
      className="orbis-orb"
      width="15"
      height="15"
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M1 0h3v1h1v3h-1v1h-3v-1h-1v-3h1z" fill="#2b5f66" />
      <path d="M1 1h2v1h-1v1h-1z M3 3h1v1h-1z" fill="#7cc79a" />
    </svg>
  );
}

export function OrbisTenebrarum({
  finds,
  tierChances = [],
  log,
  investmentPercent,
  investmentGold,
  gold,
  searching,
  searchDuration = '30:00',
  searchRemaining = null,
  emptioProgress = null,
  selectedId = null,
  canInvest = true,
  canDivest = true,
  onCast,
  onInvest,
  onDivest,
  onSelect,
  onAcquire,
}: OrbisTenebrarumProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const beyondRef = useRef<HTMLSpanElement | null>(null);
  const side = useGlobeSide(areaRef);
  useOrbisGlobe(canvasRef, { finds, searching, selectedId, emptio: emptioProgress }, onSelect, {
    label: labelRef,
    beyond: beyondRef,
  });

  const selected = finds.find((f) => f.id === selectedId) ?? null;
  // Only one Emptio may run at once (its own background channel): while a purchase is in flight, the
  // Acquire control is disabled for every relic, mirroring the sim's single-Emptio rule, and says
  // which relic is being bought.
  const emptioBusy = emptioProgress !== null;
  const buying = emptioProgress ? (finds.find((f) => f.id === emptioProgress.id) ?? null) : null;

  // Keep the selected row in view: picking a pin on the globe scrolls the ledger to its row.
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  const counts: Record<OrbisRarity, number> = { common: 0, rare: 0, profane: 0, anathema: 0 };
  for (const f of finds) counts[f.rarity] += 1;

  // The odds bars are drawn against the likeliest tier, so the longest bar fills its track.
  const maxShare = tierChances.reduce((m, t) => Math.max(m, t.share), 0);

  const acquireLabel = (f: OrbisFind): string => {
    if (f.acquired) return '◈ Bound';
    if (emptioProgress) {
      const at = pct(emptioProgress.fraction);
      if (emptioProgress.id === f.id) return `Emptio underway · ${at}`;
      return buying ? `Emptio busy: ${buying.name} ${at}` : 'Emptio underway';
    }
    return f.affordable ? 'Acquire' : 'Insufficient gold';
  };

  return (
    <div className="orbis-surface">
      <div className="orbis-stage">
        <header className="orbis-stage-head">
          <p className="orbis-eyebrow">Indagatio</p>
          <h2 className="orbis-title">Search the world for maleficia</h2>
        </header>

        <div className="orbis-stage-body">
          <div className="orbis-globe-wrap">
            <div className="orbis-globe-area" ref={areaRef}>
              <div className="orbis-globe" style={{ width: side * ART_PX, height: side * ART_PX }}>
                <canvas
                  ref={canvasRef}
                  className="orbis-canvas"
                  width={side}
                  height={side}
                  aria-label="Scrying globe — drag to rotate"
                />
                {selected && (
                  <div
                    ref={labelRef}
                    className={`orbis-pin-label orbis-pin-label--${selected.rarity}`}
                    aria-hidden="true"
                    style={{ visibility: 'hidden' }}
                  >
                    <span className="orbis-pin-label-name">{selected.name}</span>
                    <span className="orbis-pin-label-meta">
                      {ORBIS_RARITY[selected.rarity].label} {'·'}{' '}
                      {selected.acquired ? 'Bound' : selected.costLabel}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <p className="orbis-hint">
              drag to turn the world
              <span ref={beyondRef} />
            </p>
          </div>

          <div className="orbis-console">
            {tierChances.length > 0 && (
              <div className="orbis-odds orbis-panel" aria-label="Search odds by outcome tier">
                <div className="orbis-odds-head">
                  <span className="orbis-odds-title">Search odds</span>
                  <span className="orbis-odds-note">colour = rarity sought</span>
                </div>
                <ul className="orbis-odds-list">
                  {tierChances.map((t) => (
                    <li key={t.tier} className={`orbis-odds-row tier-${t.tier}`}>
                      <span className="orbis-odds-tier">{t.label}</span>
                      <span className="orbis-odds-track" aria-hidden="true">
                        {t.share > 0 && maxShare > 0 && (
                          <span
                            className="orbis-odds-fill"
                            style={
                              {
                                width: `${(t.share / maxShare) * 100}%`,
                                '--seg': segmentColor(t.tier),
                              } as CSSProperties
                            }
                          />
                        )}
                      </span>
                      <span className="orbis-odds-chance">{t.chance}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {log && (
              <section className="orbis-log orbis-panel" aria-label="Recent searches and purchases">
                {/* The legend names the two rites' marks once, so each line spends its width on
                    what happened rather than on the rite's name. */}
                <div className="orbis-log-head">
                  <span className="orbis-log-title">{LOG_COPY.heading}</span>
                  <span className="orbis-log-legend">
                    <span className="orbis-log-legend-item">
                      <OrbIcon />
                      {strings.opera.indagatio}
                    </span>
                    <span className="orbis-log-legend-item">
                      <CoinIcon />
                      {strings.opera.emptio}
                    </span>
                  </span>
                </div>
                {log.length === 0 ? (
                  <p className="orbis-log-empty">{LOG_COPY.empty}</p>
                ) : (
                  <ol className="orbis-log-list">
                    {log.map((e) => (
                      <li
                        key={e.key}
                        className={`orbis-log-row orbis-log-row--${e.rite} tier-${e.tier}`}
                      >
                        <span
                          className="orbis-log-rite"
                          role="img"
                          aria-label={e.action}
                          title={e.action}
                        >
                          {e.rite === 'emptio' ? <CoinIcon /> : <OrbIcon />}
                        </span>
                        <span className="orbis-log-tier">{e.tierLabel}</span>
                        {/* The detail gives way (ellipsis) before the source tag; the whole line
                            rides along as its hover title. */}
                        <span className="orbis-log-detail">
                          <span
                            className="orbis-log-text"
                            title={`${e.action} · ${e.tierLabel}: ${e.detail}${e.source ? ` (${e.source.title})` : ''}`}
                          >
                            {e.detail}
                          </span>
                          {e.source && (
                            <span className="orbis-log-source" title={e.source.title}>
                              {e.source.tag}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}

            <div className="orbis-cast-row">
              <div className="orbis-purse orbis-panel">
                {/* The default share of gold every Search pours into itself, flanked by the two
                    controls that move it: Divest lowers it, Invest raises it. */}
                <div className="orbis-invest-group">
                  <button
                    type="button"
                    className="orbis-divest-btn"
                    onClick={onDivest}
                    disabled={!canDivest}
                  >
                    Divest
                  </button>
                  <div className="orbis-meter orbis-meter--invest">
                    <span className="orbis-meter-label">Investment</span>
                    <span className="orbis-invest-value">
                      <span className="orbis-invest-pct">{investmentPercent}</span>{' '}
                      <span className="orbis-invest-gold">({investmentGold})</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="orbis-invest-btn"
                    onClick={onInvest}
                    disabled={!canInvest}
                  >
                    Invest
                  </button>
                </div>

                <div className="orbis-meters">
                  {/* The gold the player holds */}
                  <div className="orbis-meter">
                    <span className="orbis-meter-label">Gold</span>
                    <span className="orbis-gold">
                      <CoinIcon />
                      <span className="orbis-gold-value">{gold}</span>
                    </span>
                  </div>
                  {/* The running countdown, or the idle duration estimate */}
                  <div className="orbis-meter">
                    <span className="orbis-meter-label">
                      {searching ? 'Time left' : 'Duration'}
                    </span>
                    <span className={`orbis-meter-value${searching ? ' is-counting' : ''}`}>
                      {searching ? (searchRemaining ?? searchDuration) : searchDuration}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="orbis-cast-btn"
                onClick={onCast}
                disabled={searching}
              >
                {searching ? 'Search underway' : 'Cast the Search'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <aside className="orbis-ledger" aria-label="Emptio market">
        <div className="orbis-ledger-head">
          <div className="orbis-ledger-top">
            <h3 className="orbis-ledger-title">Emptio</h3>
            <span className="orbis-ledger-count">{finds.length} located</span>
          </div>
          <p className="orbis-ledger-sub">Obtain the located maleficia</p>
          <div className="orbis-legend">
            {RARITIES.map((r) => (
              <span key={r} className="orbis-legend-item">
                <span className={`orbis-swatch orbis-swatch--${r}`} aria-hidden="true" />
                {ORBIS_RARITY[r].label}
                <span className="orbis-legend-count">{counts[r]}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="orbis-list">
          {finds.map((f) => {
            const fraction =
              emptioProgress && emptioProgress.id === f.id ? emptioProgress.fraction : null;
            return (
              <button
                key={f.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(f.id, el);
                  else rowRefs.current.delete(f.id);
                }}
                type="button"
                className={`orbis-row orbis-row--${f.rarity}${f.id === selectedId ? ' is-selected' : ''}${fraction !== null ? ' is-buying' : ''}${f.acquired ? ' is-owned' : ''}`}
                onClick={() => onSelect(f.id)}
              >
                <span className="orbis-row-slot" aria-hidden="true">
                  {f.img ? (
                    <span className="orbis-row-sprite">
                      <PixelSprite
                        src={f.img}
                        grid={relicGrid(ROW_SPRITE_SIDE, 1)}
                        pixelSize={1}
                        rgb={RELIC_RARITY[f.rarity].rgb}
                        fallback={<span className={`orbis-dot orbis-dot--${f.rarity}`} />}
                      />
                    </span>
                  ) : (
                    <span className={`orbis-dot orbis-dot--${f.rarity}`} />
                  )}
                </span>
                <span className="orbis-row-body">
                  <span className="orbis-row-name">{f.name}</span>
                  {f.effect && <span className="orbis-row-effect">{f.effect}</span>}
                  {fraction !== null && (
                    <span
                      className="orbis-row-progress"
                      role="progressbar"
                      aria-label="Emptio in progress"
                      aria-valuenow={Math.round(fraction * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span
                        className="orbis-row-progress-fill"
                        style={{ width: `${(fraction * 100).toFixed(1)}%` }}
                      />
                    </span>
                  )}
                </span>
                {f.acquired ? (
                  <span className="orbis-row-bound">{'◈'} Bound</span>
                ) : fraction !== null ? (
                  <span className="orbis-row-cost is-buying">{pct(fraction)}</span>
                ) : (
                  <span className={`orbis-row-cost${f.affordable ? '' : ' is-locked'}`}>
                    {!f.affordable && <LockIcon />}
                    {f.costLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="orbis-detail">
            <div className="orbis-detail-head">
              {selected.img && (
                <span className={`orbis-detail-art orbis-detail-art--${selected.rarity}`}>
                  <span className="orbis-detail-sprite">
                    <PixelSprite
                      src={selected.img}
                      grid={relicGrid(SPRITE_LONG_SIDE, SPRITE_PIXEL)}
                      pixelSize={SPRITE_PIXEL}
                      rgb={RELIC_RARITY[selected.rarity].rgb}
                      fallback={null}
                    />
                  </span>
                </span>
              )}
              <span className="orbis-detail-id">
                <span className={`orbis-badge orbis-badge--${selected.rarity}`}>
                  {ORBIS_RARITY[selected.rarity].label}
                </span>
                <h4 className="orbis-detail-name">{selected.name}</h4>
                <span className="orbis-detail-coord">{formatCoord(coordForFind(selected))}</span>
              </span>
            </div>
            <p className="orbis-detail-desc">{selected.desc}</p>
            {selected.boon && <p className="orbis-detail-boon">{selected.boon}</p>}
            {selected.effect && <p className="orbis-detail-effect">{selected.effect}</p>}
            <div className="orbis-detail-buy">
              <span className="orbis-detail-price">
                <span className="orbis-detail-price-label">Price</span>
                <span className="orbis-detail-price-value">{selected.costLabel}</span>
              </span>
              <button
                type="button"
                className={`orbis-acquire ${selected.acquired ? 'is-owned' : selected.affordable && !emptioBusy ? 'is-affordable' : 'is-locked'}`}
                disabled={selected.acquired || !selected.affordable || emptioBusy}
                onClick={() => onAcquire(selected.id)}
              >
                {acquireLabel(selected)}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
