// OrbisTenebrarum — the merged Indagatio × Emptio surface for Panvitium.
//
// Archetype:  full-surface program body (renders its own dark stage + Emptio ledger; NO titlebar/
//             close — the host shell supplies those). Designed to fill the PC desk as a FULLBLEED
//             program (see INTEGRATION.md), or be dropped inside a full-screen overlay.
// Data flow:  pure function of props. The 2.6s search timer, the appends to `finds`, and the gold
//             debit on acquire all live in the store; this component only renders + emits intent.
//
// Requires:   d3-geo, topojson-client, world-atlas  (+ @types/d3-geo, @types/topojson-client)
//             pnpm add d3-geo topojson-client world-atlas
//             pnpm add -D @types/d3-geo @types/topojson-client
//
// The globe is an orthographic canvas you can DRAG to spin (with inertia). Clicking a pin selects
// it; selecting (pin or ledger row) eases the globe to that relic; a search spins the world fast
// then settles on whatever surfaces.

import { useEffect, useRef, type RefObject, type ReactElement } from 'react';
import { geoOrthographic, geoPath, geoGraticule10, geoDistance, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import { ORBIS_RARITY, coordForFind } from './orbis.data.js';
import type { OrbisFind, OrbisRarity, OrbisTenebrarumProps } from './orbis.types.js';

const RARITIES: readonly OrbisRarity[] = ['common', 'rare', 'profane', 'anathema'];

type TopoArg = Parameters<typeof feature>[0];
type LandFeature = ReturnType<typeof feature>;

interface GlobeSnapshot {
  finds: readonly OrbisFind[];
  searching: boolean;
  selectedId: string | null;
}

interface Engine {
  cLon: number; cLat: number; vLon: number; vLat: number;
  target: readonly [number, number] | null;
  touched: boolean; dragging: boolean;
  appear: Record<string, number>;
  projection: GeoProjection | null;
  land: LandFeature | null;
  prevLen: number; prevSel: string | null;
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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
    cLon: 20, cLat: 18, vLon: 0, vLat: 0,
    target: null, touched: false, dragging: false,
    appear: {}, projection: null, land: null, prevLen: 0, prevSel: null,
  });

  // Focus the globe on the newest find, or on a changed selection.
  useEffect(() => {
    const e = eng.current;
    const { finds, selectedId } = snapshot;
    if (finds.length > e.prevLen && finds.length > 0) {
      const nf = finds[finds.length - 1]!;
      e.appear[nf.id] = now();
      e.target = coordForFind(nf); e.vLon = 0; e.vLat = 0; e.touched = true;
    } else if (selectedId && selectedId !== e.prevSel) {
      const f = finds.find((x) => x.id === selectedId);
      if (f) { e.target = coordForFind(f); e.vLon = 0; e.vLat = 0; e.touched = true; }
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
    e.projection = geoOrthographic().clipAngle(90).precision(0.5);
    const path = geoPath(e.projection, ctx);

    let alive = true;
    let rafId = 0;

    // Continents — code-split so the atlas isn't in the initial chunk. Falls back to a graticule globe.
    import('world-atlas/land-110m.json')
      .then((mod) => {
        if (!alive) return;
        const topo = ((mod as { default?: unknown }).default ?? mod) as unknown as TopoArg;
        e.land = feature(topo, (topo as TopoArg).objects['land']!);
      })
      .catch(() => { /* offline — graticule only */ });

    const pinScreen = (f: OrbisFind): { x: number; y: number; visible: boolean } | null => {
      const ll = coordForFind(f);
      const visible = geoDistance([ll[0], ll[1]], [e.cLon, e.cLat]) < Math.PI / 2;
      const p = e.projection!([ll[0], ll[1]]);
      if (!p) return null;
      return { x: p[0], y: p[1], visible };
    };

    const update = (): void => {
      if (snap.current.searching) {
        e.cLon += 1.6; // the world turns under the scrying
        e.touched = true; e.vLon = 0; e.vLat = 0; e.target = null;
        e.cLon = ((e.cLon % 360) + 360) % 360;
        return;
      }
      if (e.target) {
        const dl = angDelta(e.cLon, e.target[0]);
        e.cLon += dl * 0.14;
        e.cLat += (e.target[1] - e.cLat) * 0.14;
        if (Math.abs(dl) < 0.3 && Math.abs(e.target[1] - e.cLat) < 0.3) {
          e.cLon = e.target[0]; e.cLat = e.target[1]; e.target = null;
        }
      } else if (!e.dragging) {
        if (!e.touched) {
          e.cLon += 0.11; // gentle idle drift until first interaction
        } else {
          e.cLon += e.vLon; e.cLat += e.vLat;
          e.vLon *= 0.93; e.vLat *= 0.93;
          if (Math.abs(e.vLon) < 0.002) e.vLon = 0;
          if (Math.abs(e.vLat) < 0.002) e.vLat = 0;
        }
      }
      e.cLat = Math.max(-82, Math.min(82, e.cLat));
      e.cLon = ((e.cLon % 360) + 360) % 360;
    };

    const drawPins = (W: number, c: number): void => {
      const u = W / 360;
      const { finds, selectedId } = snap.current;
      let sel: { x: number; y: number; rad: number; name: string; col: string } | null = null;
      for (const f of finds) {
        const pos = pinScreen(f);
        if (!pos || !pos.visible) continue;
        const rar = ORBIS_RARITY[f.rarity];
        const isSel = f.id === selectedId;
        let s = 1;
        const born = e.appear[f.id];
        if (born) {
          const t = (now() - born) / 450;
          if (t < 1) s = 0.3 + 0.7 * Math.max(0, t); else delete e.appear[f.id];
        }
        const rad = (isSel ? 7 : 5.5) * u * s;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, rad * 2.6, 0, 2 * Math.PI); ctx.fillStyle = rgba(rar.color, 0.16); ctx.fill();
        ctx.beginPath(); ctx.arc(pos.x, pos.y, rad, 0, 2 * Math.PI); ctx.fillStyle = f.acquired ? rgba(rar.color, 0.45) : rar.color; ctx.fill();
        ctx.beginPath(); ctx.arc(pos.x, pos.y, rad, 0, 2 * Math.PI); ctx.strokeStyle = 'rgba(8,14,16,.7)'; ctx.lineWidth = u; ctx.stroke();
        if (isSel) sel = { x: pos.x, y: pos.y, rad, name: f.name, col: rar.color };
      }
      if (sel) {
        ctx.beginPath(); ctx.arc(sel.x, sel.y, sel.rad + 5 * u, 0, 2 * Math.PI);
        ctx.strokeStyle = rgba(sel.col, 0.9); ctx.lineWidth = 2 * u; ctx.stroke();
        ctx.font = `600 ${22 * u}px Cinzel, serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(sel.name).width;
        const lx = sel.x; const ly = sel.y - sel.rad - 22 * u;
        roundRect(ctx, lx - tw / 2 - 10 * u, ly - 13 * u, tw + 20 * u, 26 * u, 6 * u);
        ctx.fillStyle = 'rgba(8,12,14,.86)'; ctx.fill();
        ctx.strokeStyle = rgba(sel.col, 0.4); ctx.lineWidth = u; ctx.stroke();
        ctx.fillStyle = '#e7d8b4'; ctx.fillText(sel.name, lx, ly);
      }
    };

    const draw = (): void => {
      const W = canvas.width; const R = W * 0.46; const c = W / 2;
      ctx.clearRect(0, 0, W, W);
      ctx.save();
      ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI); ctx.closePath();
      const og = ctx.createRadialGradient(c - R * 0.3, c - R * 0.35, R * 0.1, c, c, R);
      og.addColorStop(0, '#17323d'); og.addColorStop(0.55, '#0c1a20'); og.addColorStop(1, '#050c0f');
      ctx.fillStyle = og; ctx.fill(); ctx.clip();
      if (e.projection) {
        e.projection.scale(R).translate([c, c]).rotate([-e.cLon, -e.cLat]);
        ctx.beginPath(); path(geoGraticule10());
        ctx.strokeStyle = 'rgba(210,200,170,.12)'; ctx.lineWidth = W * 0.0013; ctx.stroke();
        if (e.land) {
          ctx.beginPath(); path(e.land);
          ctx.fillStyle = 'rgba(40,72,60,.95)'; ctx.fill();
          ctx.strokeStyle = 'rgba(126,182,150,.3)'; ctx.lineWidth = W * 0.0016; ctx.stroke();
        }
      }
      ctx.restore();
      const sg = ctx.createRadialGradient(c, c, R * 0.55, c, c, R);
      sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.8, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI); ctx.fillStyle = sg; ctx.fill();
      const hg = ctx.createRadialGradient(c - R * 0.34, c - R * 0.4, R * 0.05, c - R * 0.34, c - R * 0.4, R * 0.95);
      hg.addColorStop(0, 'rgba(180,220,230,.16)'); hg.addColorStop(0.45, 'rgba(180,220,230,0)');
      ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI); ctx.fillStyle = hg; ctx.fill();
      ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI); ctx.strokeStyle = 'rgba(216,182,88,.28)'; ctx.lineWidth = W * 0.003; ctx.stroke();
      if (snap.current.searching) {
        const ph = Math.sin(now() / 170) * 0.5 + 0.5;
        ctx.beginPath(); ctx.arc(c, c, R - W * 0.004, 0, 2 * Math.PI);
        ctx.strokeStyle = rgba('#56b3a3', 0.2 + 0.45 * ph); ctx.lineWidth = W * 0.011; ctx.stroke();
      } else {
        drawPins(W, c);
      }
    };

    const hitTest = (cssX: number, cssY: number): void => {
      const W = canvas.width;
      const s = W / canvas.getBoundingClientRect().width;
      const bx = cssX * s; const by = cssY * s;
      let best: OrbisFind | null = null; let bd = Infinity;
      for (const f of snap.current.finds) {
        const pos = pinScreen(f);
        if (!pos || !pos.visible) continue;
        const d = Math.hypot(pos.x - bx, pos.y - by);
        if (d < bd) { bd = d; best = f; }
      }
      if (best && bd < 28 * (W / 360)) onSelectRef.current(best.id);
    };

    // --- drag to rotate, with inertia + click discrimination ---
    let downX = 0, downY = 0, lastX = 0, lastY = 0, lastT = 0, moved = false;
    const local = (ev: PointerEvent): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const onDown = (ev: PointerEvent): void => {
      e.dragging = true; e.touched = true; e.target = null; e.vLon = 0; e.vLat = 0;
      const p = local(ev); downX = lastX = p.x; downY = lastY = p.y; moved = false; lastT = now();
      canvas.style.cursor = 'grabbing'; ev.preventDefault();
    };
    const onMove = (ev: PointerEvent): void => {
      if (!e.dragging) return;
      const p = local(ev); const dx = p.x - lastX; const dy = p.y - lastY;
      if (Math.abs(p.x - downX) + Math.abs(p.y - downY) > 4) moved = true;
      const k = 0.42;
      e.cLon -= dx * k; e.cLat += dy * k;
      const t = now(); const dt = Math.max(12, t - lastT);
      e.vLon = (-dx * k * 16) / dt * 0.5; e.vLat = (dy * k * 16) / dt * 0.5;
      lastX = p.x; lastY = p.y; lastT = t;
    };
    const onUp = (): void => {
      if (!e.dragging) return;
      e.dragging = false; canvas.style.cursor = 'grab';
      if (!moved) { e.vLon = 0; e.vLat = 0; hitTest(downX, downY); }
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const loop = (): void => { update(); draw(); rafId = requestAnimationFrame(loop); };
    loop();

    return () => {
      alive = false;
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
          <canvas ref={canvasRef} className="orbis-canvas" width={720} height={720} aria-label="Scrying globe — drag to rotate" />
          <span className="orbis-hint" aria-hidden="true">drag to turn the world</span>
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
            <span className="orbis-meter-label">Duration</span>
            <span className="orbis-meter-value">{searchDuration}</span>
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
          {finds.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`orbis-row${f.id === selectedId ? ' is-selected' : ''}`}
              onClick={() => onSelect(f.id)}
            >
              <span className={`orbis-dot orbis-dot--${f.rarity}`} aria-hidden="true" />
              <span className="orbis-row-body">
                <span className="orbis-row-name">{f.name}</span>
                <span className="orbis-row-effect">{f.effect}</span>
              </span>
              <span className="orbis-row-cost">{f.costLabel}</span>
            </button>
          ))}
        </div>

        {selected && (
          <div className="orbis-detail">
            <span className={`orbis-badge orbis-badge--${selected.rarity}`}>{ORBIS_RARITY[selected.rarity].label}</span>
            <h4 className="orbis-detail-name">{selected.name}</h4>
            <p className="orbis-detail-desc">{selected.desc}</p>
            <p className="orbis-detail-effect">{selected.effect}</p>
            <button
              type="button"
              className={`orbis-acquire ${selected.acquired ? 'is-owned' : selected.affordable ? 'is-affordable' : 'is-locked'}`}
              disabled={selected.acquired || !selected.affordable}
              onClick={() => onAcquire(selected.id)}
            >
              {selected.acquired ? '\u25C8 Bound' : selected.affordable ? `Acquire \u00B7 ${selected.costLabel}` : 'Insufficient gold'}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
