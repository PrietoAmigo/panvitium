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
import { ORBIS_RARITY, coordForFind } from './orbis.data.js';
import { WORLD_LAND } from './orbis.land.js';
import type { OrbisFind, OrbisRarity, OrbisTenebrarumProps } from './orbis.types.js';

const RARITIES: readonly OrbisRarity[] = ['common', 'rare', 'profane', 'anathema'];

const DEG = Math.PI / 180;

interface GlobeSnapshot {
  finds: readonly OrbisFind[];
  searching: boolean;
  selectedId: string | null;
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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Imperative globe engine bound to a <canvas>. Reads the latest props each frame via a ref, so the
 * rAF loop and listeners are set up exactly once. Emits selection through `onSelect`.
 */
function useOrbisGlobe(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  snapshot: GlobeSnapshot,
  onSelect: (id: string) => void,
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
      const { finds, selectedId } = snap.current;
      let sel: { x: number; y: number; rad: number; name: string; col: string } | null = null;
      for (const f of finds) {
        const pos = pinScreen(f);
        if (!pos) continue;
        const rar = ORBIS_RARITY[f.rarity];
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
        if (isSel) sel = { x: pos.x, y: pos.y, rad, name: f.name, col: rar.color };
      }
      if (sel) {
        ctx.beginPath();
        ctx.arc(sel.x, sel.y, sel.rad + 5 * u, 0, 2 * Math.PI);
        ctx.strokeStyle = rgba(sel.col, 0.9);
        ctx.lineWidth = 2 * u;
        ctx.stroke();
        ctx.font = `600 ${22 * u}px Cinzel, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(sel.name).width;
        const lx = sel.x;
        const ly = sel.y - sel.rad - 22 * u;
        roundRect(ctx, lx - tw / 2 - 10 * u, ly - 13 * u, tw + 20 * u, 26 * u, 6 * u);
        ctx.fillStyle = 'rgba(8,12,14,.86)';
        ctx.fill();
        ctx.strokeStyle = rgba(sel.col, 0.4);
        ctx.lineWidth = u;
        ctx.stroke();
        ctx.fillStyle = '#e7d8b4';
        ctx.fillText(sel.name, lx, ly);
      }
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
      // continents — filled teal as stable horizontal strips, then crisp visible coasts
      fillLandBands(ctx, e.cLon, e.cLat, R2, c);
      ctx.fillStyle = 'rgba(40,72,60,.95)';
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
        ctx.strokeStyle = rgba('#56b3a3', 0.2 + 0.45 * ph);
        ctx.lineWidth = W * 0.011;
        ctx.stroke();
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

export function OrbisTenebrarum({
  finds,
  gold,
  searching,
  searchDuration = '30:00',
  searchRemaining = null,
  emptioProgress = null,
  selectedId = null,
  onCast,
  onSelect,
  onAcquire,
}: OrbisTenebrarumProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useOrbisGlobe(canvasRef, { finds, searching, selectedId }, onSelect);

  const selected = finds.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="orbis-surface">
      <div className="orbis-stage">
        <p className="orbis-eyebrow">Indagatio</p>
        <h2 className="orbis-title">Search the world for maleficia</h2>

        <div className="orbis-globe-wrap">
          <canvas
            ref={canvasRef}
            className="orbis-canvas"
            width={720}
            height={720}
            aria-label="Scrying globe — drag to rotate"
          />
          <span className="orbis-hint" aria-hidden="true">
            drag to turn the world
          </span>
        </div>

        <div className="orbis-cast-row">
          <div className="orbis-meter orbis-meter--right">
            <span className="orbis-meter-label">Gold</span>
            <span className="orbis-gold-value">{gold}</span>
          </div>
          <button type="button" className="orbis-cast-btn" onClick={onCast} disabled={searching}>
            Cast the Search
          </button>
          <div className="orbis-meter">
            <span className="orbis-meter-label">{searching ? 'Time left' : 'Duration'}</span>
            <span className={`orbis-meter-value${searching ? ' is-counting' : ''}`}>
              {searching ? (searchRemaining ?? searchDuration) : searchDuration}
            </span>
          </div>
        </div>

        {searching && <p className="orbis-status">Scrying the world&rsquo;s corners&hellip;</p>}
      </div>

      <aside className="orbis-ledger" aria-label="Emptio market">
        <div className="orbis-ledger-head">
          <h3 className="orbis-ledger-title">Emptio</h3>
          <p className="orbis-ledger-sub">Obtain the located maleficia</p>
          <div className="orbis-legend">
            {RARITIES.map((r) => (
              <span key={r} className="orbis-legend-item">
                <span className={`orbis-swatch orbis-swatch--${r}`} aria-hidden="true" />
                {ORBIS_RARITY[r].label}
              </span>
            ))}
          </div>
        </div>

        <div className="orbis-list">
          {finds.map((f) => {
            const buying =
              emptioProgress && emptioProgress.id === f.id ? emptioProgress.fraction : null;
            return (
              <button
                key={f.id}
                type="button"
                className={`orbis-row${f.id === selectedId ? ' is-selected' : ''}${buying !== null ? ' is-buying' : ''}`}
                onClick={() => onSelect(f.id)}
              >
                <span className={`orbis-dot orbis-dot--${f.rarity}`} aria-hidden="true" />
                <span className="orbis-row-body">
                  <span className="orbis-row-name">{f.name}</span>
                  {f.effect && <span className="orbis-row-effect">{f.effect}</span>}
                  {buying !== null && (
                    <span
                      className="orbis-row-progress"
                      role="progressbar"
                      aria-label="Emptio in progress"
                      aria-valuenow={Math.round(buying * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span
                        className="orbis-row-progress-fill"
                        style={{ width: `${(buying * 100).toFixed(1)}%` }}
                      />
                    </span>
                  )}
                </span>
                <span className="orbis-row-cost">{f.costLabel}</span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="orbis-detail">
            <span className={`orbis-badge orbis-badge--${selected.rarity}`}>
              {ORBIS_RARITY[selected.rarity].label}
            </span>
            <h4 className="orbis-detail-name">{selected.name}</h4>
            <p className="orbis-detail-desc">{selected.desc}</p>
            {selected.effect && <p className="orbis-detail-effect">{selected.effect}</p>}
            <button
              type="button"
              className={`orbis-acquire ${selected.acquired ? 'is-owned' : selected.affordable ? 'is-affordable' : 'is-locked'}`}
              disabled={selected.acquired || !selected.affordable}
              onClick={() => onAcquire(selected.id)}
            >
              {selected.acquired
                ? '\u25C8 Bound'
                : selected.affordable
                  ? `Acquire \u00B7 ${selected.costLabel}`
                  : 'Insufficient gold'}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
