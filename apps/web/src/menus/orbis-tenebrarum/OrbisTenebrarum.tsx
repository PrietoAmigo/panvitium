// OrbisTenebrarum — the merged Indagatio × Emptio surface for Panvitium.
//
// Archetype:  full-surface program body (renders its own dark stage + Emptio ledger; NO titlebar/
//             close — the host shell supplies those). Designed to fill the PC desk as a FULLBLEED
//             program (see INTEGRATION.md), or be dropped inside a full-screen overlay.
// Data flow:  pure function of props. The search timer, the appends to `finds`, and the gold
//             debit on acquire all live in the store; this component only renders + emits intent.
//
// The globe is an orthographic canvas you can DRAG to spin (with inertia). Clicking a pin selects
// it; selecting (pin or ledger row) eases the globe to that relic; a search spins the world fast
// then settles on whatever surfaces.
//
// No external dependencies: the orthographic projection + graticule are computed in-file (the
// prototype's d3-geo/topojson/world-atlas continents are dropped in favour of a graticule sphere,
// which is the handoff's documented offline/degrade look — pins and all interaction are identical).

import { useEffect, useRef, type RefObject, type ReactElement } from 'react';
import { PixelSprite } from '../PixelRelic.js';
import { relicGrid } from '../pixelArt.js';
import { RARITY as RELIC_RARITY } from '../relics.js';
import { ORBIS_RARITY, ORBIS_TIER_FIND, coordForFind, formatCoord } from './orbis.data.js';
import { WORLD_LAND } from './orbis.land.js';
import type { OrbisFind, OrbisRarity, OrbisTenebrarumProps } from './orbis.types.js';

const RARITIES: readonly OrbisRarity[] = ['common', 'rare', 'profane', 'anathema'];

const DEG = Math.PI / 180;

/** Internal canvas resolution (px, square). CSS scales it to the space the stage leaves; the globe
 *  takes 92% of it, the rest is room for the horizon markers. */
const CANVAS_PX = 892;

/** The detail's relic sprite: one art pixel per 2 design px, its long side 116 px. */
const SPRITE_PIXEL = 2;
const SPRITE_LONG_SIDE = 116;

/** The colour of a find's owned ("bound") marker ring. */
const BOUND_COLOR = '#7ea878';
/** The colour of the Emptio progress ring and the search pulse. */
const TEAL = '#56b3a3';

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

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function angDelta(a: number, b: number): number {
  let d = (((b - a) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/**
 * Orthographic screen position for a `[lon, lat]` given the globe centre `(cLon, cLat)`, pixel
 * radius `R` and pixel centre `c`. Returns `null` when the point sits on the far hemisphere
 * (the globe's back, clipped) — exactly the role d3-geo's `clipAngle(90)` played.
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

/** Trace the front-facing graticule (meridians every 20°, parallels every 20°) into the path. */
function traceGraticule(
  ctx: CanvasRenderingContext2D,
  cLon: number,
  cLat: number,
  R: number,
  c: number,
): void {
  ctx.beginPath();
  for (let lon = -180; lon < 180; lon += 20) {
    let pen = false;
    for (let lat = -80; lat <= 80; lat += 3) {
      const p = project(lon, lat, cLon, cLat, R, c);
      if (p) {
        if (pen) ctx.lineTo(p[0], p[1]);
        else {
          ctx.moveTo(p[0], p[1]);
          pen = true;
        }
      } else pen = false;
    }
  }
  for (let lat = -80; lat <= 80; lat += 20) {
    let pen = false;
    for (let lon = -180; lon <= 180; lon += 3) {
      const p = project(lon, lat, cLon, cLat, R, c);
      if (p) {
        if (pen) ctx.lineTo(p[0], p[1]);
        else {
          ctx.moveTo(p[0], p[1]);
          pen = true;
        }
      } else pen = false;
    }
  }
}

/** Trace the front-facing coastlines (bundled Natural Earth 110m land) into the path, breaking the
 * pen at the horizon exactly as the graticule does. */
function traceLand(
  ctx: CanvasRenderingContext2D,
  cLon: number,
  cLat: number,
  R: number,
  c: number,
): void {
  ctx.beginPath();
  for (const ring of WORLD_LAND) {
    let pen = false;
    for (let i = 0; i < ring.length; i += 2) {
      const p = project(ring[i]!, ring[i + 1]!, cLon, cLat, R, c);
      if (p) {
        if (pen) ctx.lineTo(p[0], p[1]);
        else {
          ctx.moveTo(p[0], p[1]);
          pen = true;
        }
      } else pen = false;
    }
  }
}

const ROW_STEP = 1; // degrees of latitude per land strip

interface LandRow {
  lat: number;
  spans: ReadonlyArray<readonly [number, number]>;
}

/**
 * Per-latitude land longitude intervals, built once from WORLD_LAND by scanline. Antimeridian-
 * crossing edges are split at ±180 so the even–odd pairing of crossings stays correct. This is the
 * data the globe fills from: stable horizontal strips, with no per-ring winding or limb-closure
 * decisions that could invert (paint sea as land) while dragging.
 */
const LAND_ROWS: readonly LandRow[] = (() => {
  const edges: Array<readonly [number, number, number, number]> = [];
  for (const ring of WORLD_LAND) {
    const n = ring.length / 2;
    for (let i = 0; i < n; i += 1) {
      const lo1 = ring[2 * i]!;
      const la1 = ring[2 * i + 1]!;
      const lo2 = ring[2 * ((i + 1) % n)]!;
      const la2 = ring[2 * ((i + 1) % n) + 1]!;
      if (Math.abs(lo2 - lo1) > 180) {
        const dir = lo1 > 0 ? 1 : -1;
        const lo2u = lo2 + dir * 360;
        const t = (dir * 180 - lo1) / (lo2u - lo1);
        const latX = la1 + t * (la2 - la1);
        edges.push([lo1, la1, dir * 180, latX]);
        edges.push([-dir * 180, latX, lo2, la2]);
      } else {
        edges.push([lo1, la1, lo2, la2]);
      }
    }
  }
  const rows: LandRow[] = [];
  for (let lat = -89; lat <= 89; lat += ROW_STEP) {
    const xs: number[] = [];
    for (const [lo1, la1, lo2, la2] of edges) {
      if ((la1 <= lat && la2 > lat) || (la2 <= lat && la1 > lat)) {
        xs.push(lo1 + ((lat - la1) / (la2 - la1)) * (lo2 - lo1));
      }
    }
    xs.sort((p, q) => p - q);
    const spans: Array<readonly [number, number]> = [];
    for (let i = 0; i + 1 < xs.length; i += 2) spans.push([xs[i]!, xs[i + 1]!]);
    if (spans.length) rows.push({ lat, spans });
  }
  return rows;
})();

/**
 * Fill the visible land as projected horizontal strips. Each latitude row's land intervals are
 * clipped to that row's visible longitude window — for a horizontal strip that is always one clean
 * interval, so there is nothing to invert — then drawn as a thin band between lat ± ½ row. This
 * replaces the polygon limb-fill, which flipped to enclose ocean when a continent's hidden side
 * passed near the antipode. Caller fills the assembled path once.
 */
function fillLandBands(
  ctx: CanvasRenderingContext2D,
  cLon: number,
  cLat: number,
  R: number,
  c: number,
): void {
  const tph0 = Math.tan(cLat * DEG);
  const half = ROW_STEP / 2;
  ctx.beginPath();
  for (const row of LAND_ROWS) {
    const k = -tph0 * Math.tan(row.lat * DEG);
    if (k >= 1) continue; // whole row on the far hemisphere
    const hw = k <= -1 ? 180 : Math.acos(k) / DEG; // visible half-width in longitude
    const winLo = cLon - hw;
    const winHi = cLon + hw;
    for (const [A, B] of row.spans) {
      for (const shift of [-360, 0, 360]) {
        const a = Math.max(A, winLo + shift);
        const b = Math.min(B, winHi + shift);
        if (b - a <= 0.01) continue;
        const steps = Math.max(1, Math.ceil((b - a) / 2));
        let started = false;
        for (let q = 0; q <= steps; q += 1) {
          const p = project(a + ((b - a) * q) / steps, row.lat + half, cLon, cLat, R, c);
          if (!p) continue;
          if (started) ctx.lineTo(p[0], p[1]);
          else {
            ctx.moveTo(p[0], p[1]);
            started = true;
          }
        }
        for (let q = steps; q >= 0; q -= 1) {
          const p = project(a + ((b - a) * q) / steps, row.lat - half, cLon, cLat, R, c);
          if (!p) continue;
          if (started) ctx.lineTo(p[0], p[1]);
          else {
            ctx.moveTo(p[0], p[1]);
            started = true;
          }
        }
        if (started) ctx.closePath();
      }
    }
  }
}

/**
 * Imperative globe engine bound to a <canvas>. Reads the latest props each frame via a ref, so the
 * rAF loop and listeners are set up exactly once. Emits selection through `onSelect`.
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

    const W = canvas.width;
    const R = W * 0.46;
    const c = W / 2;

    let rafId = 0;

    // The far-side count is written only when it changes (it is read by a DOM span, not React).
    let shownBeyond = -1;
    const setBeyond = (n: number): void => {
      if (n === shownBeyond) return;
      shownBeyond = n;
      const el = overlays.beyond.current;
      if (el) el.textContent = beyondText(n);
    };

    const pinScreen = (f: OrbisFind): { x: number; y: number } | null => {
      const ll = coordForFind(f);
      const p = project(ll[0], ll[1], e.cLon, e.cLat, R, c);
      if (!p) return null;
      return { x: p[0], y: p[1] };
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

    const drawPins = (): void => {
      const u = W / 360;
      const { finds, selectedId, emptio } = snap.current;
      let sel: { x: number; y: number; rad: number; col: string } | null = null;
      let beyond = 0;
      for (const f of finds) {
        const rar = ORBIS_RARITY[f.rarity];
        const pos = pinScreen(f);
        if (!pos) {
          // Beyond the horizon: a small arrow on the rim, pointing the way to turn the world.
          beyond += 1;
          const ll = coordForFind(f);
          const dir = horizonDir(ll[0], ll[1], e.cLon, e.cLat);
          if (!dir) continue;
          const rr = R + 8 * u;
          ctx.save();
          ctx.translate(c + dir[0] * rr, c + dir[1] * rr);
          ctx.rotate(Math.atan2(dir[1], dir[0]));
          ctx.beginPath();
          ctx.moveTo(4.5 * u, 0);
          ctx.lineTo(-3 * u, -4 * u);
          ctx.lineTo(-3 * u, 4 * u);
          ctx.closePath();
          ctx.fillStyle = rgba(rar.color, f.acquired ? 0.45 : 0.9);
          ctx.fill();
          ctx.restore();
          continue;
        }
        const isSel = f.id === selectedId;
        let s = 1;
        const born = e.appear[f.id];
        if (born) {
          const t = (now() - born) / 450;
          if (t < 1) s = 0.3 + 0.7 * Math.max(0, t);
          else delete e.appear[f.id];
        }
        const rad = (isSel ? 7 : 5.5) * u * s;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, rad * 2.6, 0, 2 * Math.PI);
        ctx.fillStyle = rgba(rar.color, 0.16);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, rad, 0, 2 * Math.PI);
        ctx.fillStyle = f.acquired ? rgba(rar.color, 0.45) : rar.color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, rad, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(8,14,16,.7)';
        ctx.lineWidth = u;
        ctx.stroke();
        if (f.acquired) {
          // Already bound: a dotted ring in the owned green.
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, rad + 3.5 * u, 0, 2 * Math.PI);
          ctx.setLineDash([2 * u, 2 * u]);
          ctx.strokeStyle = rgba(BOUND_COLOR, 0.9);
          ctx.lineWidth = u;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (emptio && emptio.id === f.id) {
          // Being bought: the Emptio's progress, as a ring filling clockwise from the top, drawn
          // outside the selection ring so the two never overlap.
          const rr = rad + 8.5 * u;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, rr, 0, 2 * Math.PI);
          ctx.strokeStyle = rgba(TEAL, 0.22);
          ctx.lineWidth = 1.6 * u;
          ctx.stroke();
          const frac = Math.max(0, Math.min(1, emptio.fraction));
          if (frac > 0) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, rr, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * frac);
            ctx.strokeStyle = TEAL;
            ctx.lineWidth = 2 * u;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.lineCap = 'butt';
          }
        }
        if (isSel) sel = { x: pos.x, y: pos.y, rad, col: rar.color };
      }
      if (sel) {
        ctx.beginPath();
        ctx.arc(sel.x, sel.y, sel.rad + 5 * u, 0, 2 * Math.PI);
        ctx.strokeStyle = rgba(sel.col, 0.9);
        ctx.lineWidth = 2 * u;
        ctx.stroke();
      }
      // The selected find's name rides over its pin as DOM, so it can spill past the globe's edge
      // without being clipped by the canvas; it hides while the pin is on the far side.
      const label = overlays.label.current;
      if (label) {
        if (sel) {
          label.style.left = `${(sel.x / W) * 100}%`;
          label.style.top = `${((sel.y - sel.rad - 6 * u) / W) * 100}%`;
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
      const R2 = W * 0.46;
      ctx.clearRect(0, 0, W, W);
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, R2, 0, 2 * Math.PI);
      ctx.closePath();
      const og = ctx.createRadialGradient(c - R2 * 0.3, c - R2 * 0.35, R2 * 0.1, c, c, R2);
      og.addColorStop(0, '#17323d');
      og.addColorStop(0.55, '#0c1a20');
      og.addColorStop(1, '#050c0f');
      ctx.fillStyle = og;
      ctx.fill();
      ctx.clip();
      traceGraticule(ctx, e.cLon, e.cLat, R2, c);
      ctx.strokeStyle = 'rgba(210,200,170,.12)';
      ctx.lineWidth = W * 0.0013;
      ctx.stroke();
      // continents — filled teal as stable horizontal strips, then crisp visible coasts. The land
      // takes the same light as the sea: brightest toward the upper-left highlight.
      fillLandBands(ctx, e.cLon, e.cLat, R2, c);
      const lg = ctx.createRadialGradient(c - R2 * 0.34, c - R2 * 0.4, R2 * 0.05, c, c, R2 * 1.1);
      lg.addColorStop(0, 'rgba(72,120,98,.97)');
      lg.addColorStop(0.55, 'rgba(44,80,65,.96)');
      lg.addColorStop(1, 'rgba(24,44,36,.95)');
      ctx.fillStyle = lg;
      ctx.fill();
      traceLand(ctx, e.cLon, e.cLat, R2, c);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(126,182,150,.3)';
      ctx.lineWidth = W * 0.0016;
      ctx.stroke();
      ctx.restore();
      const sg = ctx.createRadialGradient(c, c, R2 * 0.55, c, c, R2);
      sg.addColorStop(0, 'rgba(0,0,0,0)');
      sg.addColorStop(0.8, 'rgba(0,0,0,0)');
      sg.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.beginPath();
      ctx.arc(c, c, R2, 0, 2 * Math.PI);
      ctx.fillStyle = sg;
      ctx.fill();
      const hg = ctx.createRadialGradient(
        c - R2 * 0.34,
        c - R2 * 0.4,
        R2 * 0.05,
        c - R2 * 0.34,
        c - R2 * 0.4,
        R2 * 0.95,
      );
      hg.addColorStop(0, 'rgba(180,220,230,.16)');
      hg.addColorStop(0.45, 'rgba(180,220,230,0)');
      ctx.beginPath();
      ctx.arc(c, c, R2, 0, 2 * Math.PI);
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(c, c, R2, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(216,182,88,.28)';
      ctx.lineWidth = W * 0.003;
      ctx.stroke();
      if (snap.current.searching) {
        const ph = Math.sin(now() / 170) * 0.5 + 0.5;
        ctx.beginPath();
        ctx.arc(c, c, R2 - W * 0.004, 0, 2 * Math.PI);
        ctx.strokeStyle = rgba(TEAL, 0.2 + 0.45 * ph);
        ctx.lineWidth = W * 0.011;
        ctx.stroke();
        hideOverlays();
      } else {
        drawPins();
      }
    };

    const hitTest = (cssX: number, cssY: number): void => {
      const s = W / canvas.getBoundingClientRect().width;
      const bx = cssX * s;
      const by = cssY * s;
      let best: OrbisFind | null = null;
      let bd = Infinity;
      for (const f of snap.current.finds) {
        const pos = pinScreen(f);
        if (!pos) continue;
        const d = Math.hypot(pos.x - bx, pos.y - by);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (best && bd < 28 * (W / 360)) onSelectRef.current(best.id);
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
      const k = 0.42;
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

/** The failure tiers find nothing: their odds segments are three greys, darkening with the loss. */
const FAIL_SEGMENT: Readonly<Record<string, string>> = {
  bad: '#5e5850',
  terrible: '#48433d',
  apocalyptic: '#35312d',
};

/** An odds-bar segment's colour: the rarity the tier reaches for, or a grey for a failure tier. */
function segmentColor(tier: string): string {
  const rarity = ORBIS_TIER_FIND[tier];
  return rarity ? ORBIS_RARITY[rarity].color : (FAIL_SEGMENT[tier] ?? '#3a3631');
}

const pct = (fraction: number): string =>
  `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;

function LockIcon(): ReactElement {
  return (
    <svg className="orbis-lock" width="10" height="11" viewBox="0 0 10 11" aria-hidden="true">
      <rect x="1" y="5" width="8" height="5.5" rx="1" fill="none" stroke="currentColor" />
      <path d="M3 5V3.5a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" />
    </svg>
  );
}

export function OrbisTenebrarum({
  finds,
  tierChances = [],
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
  const labelRef = useRef<HTMLDivElement | null>(null);
  const beyondRef = useRef<HTMLSpanElement | null>(null);
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
        <p className="orbis-eyebrow">Indagatio</p>
        <h2 className="orbis-title">Search the world for maleficia</h2>

        <div className="orbis-globe-wrap">
          <canvas
            ref={canvasRef}
            className="orbis-canvas"
            width={CANVAS_PX}
            height={CANVAS_PX}
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
        <p className="orbis-hint">
          drag to turn the world
          <span ref={beyondRef} />
        </p>

        <div className="orbis-cast-row">
          {/* LEFT — the default share of gold every Search pours into itself, flanked by the two
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

          <span className="orbis-cast-sep" aria-hidden="true" />

          {/* The gold the player holds */}
          <div className="orbis-meter">
            <span className="orbis-meter-label">Gold</span>
            <span className="orbis-gold-value">{gold}</span>
          </div>

          <span className="orbis-cast-sep" aria-hidden="true" />

          {/* The running countdown, or the idle duration estimate */}
          <div className="orbis-meter">
            <span className="orbis-meter-label">{searching ? 'Time left' : 'Duration'}</span>
            <span className={`orbis-meter-value${searching ? ' is-counting' : ''}`}>
              {searching ? (searchRemaining ?? searchDuration) : searchDuration}
            </span>
          </div>

          {/* RIGHT — begin the Search */}
          <button type="button" className="orbis-cast-btn" onClick={onCast} disabled={searching}>
            {searching ? 'Search underway' : 'Cast the Search'}
          </button>
        </div>

        {tierChances.length > 0 && (
          <div className="orbis-odds" aria-label="Search odds by outcome tier">
            <div className="orbis-odds-head">
              <span className="orbis-odds-title">Search odds</span>
              <span className="orbis-odds-note">colour shows the rarity each outcome seeks</span>
            </div>
            <div className="orbis-odds-bar" aria-hidden="true">
              {tierChances
                .filter((t) => t.share > 0)
                .map((t) => (
                  <span
                    key={t.tier}
                    className={`orbis-odds-seg tier-${t.tier}`}
                    style={{ flexGrow: t.share, background: segmentColor(t.tier) }}
                  />
                ))}
            </div>
            <ul className="orbis-odds-list">
              {tierChances.map((t) => (
                <li key={t.tier} className={`orbis-odds-row tier-${t.tier}`}>
                  <span className="orbis-odds-tier">{t.label}</span>
                  <span className="orbis-odds-chance">{t.chance}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
                className={`orbis-row${f.id === selectedId ? ' is-selected' : ''}${fraction !== null ? ' is-buying' : ''}${f.acquired ? ' is-owned' : ''}`}
                onClick={() => onSelect(f.id)}
              >
                <span className={`orbis-dot orbis-dot--${f.rarity}`} aria-hidden="true" />
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
