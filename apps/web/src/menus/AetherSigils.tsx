import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import {
  sigilById,
  sigilVisible,
  sigilStrength,
  floor,
  isZero,
  bn,
  type GameState,
  type BigNum,
  type SigilDef,
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum } from '../game/format.js';
import { HoldButton, SEMET_ID, GOETIA_BOON } from './katabasisShared.js';

// ─────────────────────────────────────────────────────────────────────────────
// "Aether" — the sigil-binding screen of the Katabasis, ported from the Claude
// Design handoff. The player stands inside a spherical vault and looks outward
// at the 72 seals of the Goetia scattered on its surface (a golden-angle
// distribution). Drag to look around; centre a seal; Focus it to freeze the
// view and open a detail panel; bind/unbind souls with a held, ramping pour.
//
// This resolves the handoff's three pending points against the real game:
//   1) Live state — the pool is `state.souls`, the Semet gate is the real
//      `sigilVisible` predicate (all Cardinal Sins ≥ Rank 2), and bindings read
//      from / write to the persisted `state.sigilBindings` via the store's
//      bind/unbind actions, so they survive every descent.
//   2) Effect magnitude — the panel shows the real `sigilStrength(def, bound)`
//      (coefficient × curve magnitude), formatted per effect kind, not the
//      prototype's √×0.01 stand-in.
//   3) The port itself — reimplemented in React: the rAF projection loop mutates
//      the seal transforms/opacity/glow directly (no per-frame React render);
//      only the infrequent focus change and the panel are React state.
//
// Per the integration brief, the design's own "souls unbound" readout is NOT
// drawn here — the souls count comes from the shared Katabasis `Hud` (the Eight
// Princes treatment). The Katabasis degrade/pixelation filter (`#kat-degrade`)
// is kept on the vault and seals, with the scanline/grain `kat-degrade-chrome`
// over the field.
// ─────────────────────────────────────────────────────────────────────────────

const ASSET = '/assets/panvitium/katabasis';

// Glow filters — the visual language of bound vs unbound. Verbatim from the design tokens.
const LIT =
  'brightness(1.15) sepia(.55) saturate(3) hue-rotate(-10deg) drop-shadow(0 0 9px rgba(230,162,60,.9)) drop-shadow(0 0 18px rgba(160,30,34,.5))';
const FOCUS_GLOW = 'brightness(1.2) drop-shadow(0 0 8px rgba(230,162,60,.6))';
const SELGLOW =
  'brightness(1.25) drop-shadow(0 0 14px rgba(230,162,60,.95)) drop-shadow(0 0 30px rgba(160,30,34,.6))';
const SEALED = 'brightness(.42) grayscale(.55) contrast(.9)';
const COLD = 'none';

// Projection / interaction constants (ported 1:1 from the prototype).
const N = 72;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FOCAL = 520;
const PITCH_CLAMP = 1.5708; // ±90°
const DRAG_SENS = 0.0044; // rad per px
const IDLE_DRIFT = 0.0014;
const CULL_Z = 0.14;
const CENTER_Z = 0.55; // a seal counts as "centred" only when this far toward the viewer

const SEMET_DEF = sigilById(SEMET_ID);

/** The 72 unit-sphere directions (golden-angle spiral). Index i → seal number i+1. Constant. */
const DIRS: ReadonlyArray<{ x: number; y: number; z: number }> = Array.from(
  { length: N },
  (_, i) => {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GOLDEN_ANGLE * i;
    return { x: Math.cos(th) * r, y, z: Math.sin(th) * r };
  },
);

const ROMAN: ReadonlyArray<[number, string]> = [
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];
/** Roman numeral for a seal number (1..72) → e.g. 44 → "XLIV". */
export function toRoman(n: number): string {
  let out = '';
  let v = n;
  for (const [val, sym] of ROMAN) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out;
}

const FLAT_UNIT: Record<string, string> = {
  gold: 'gold/s',
  influence: 'influence/s',
  generation: 'reprobates/s',
  suicideRate: 'suicides/s',
  murderRate: 'murders/s',
};

/** A small flat magnitude, shown plainly (e.g. "62" or "0.04"). */
function fmtFlat(s: number): string {
  if (s >= 10) return formatBigNum(bn(Math.round(s)));
  return s.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * The real per-seal effect at the current binding (pending point #2). `sigilStrength` is the bare
 * strength the sim applies: a fraction for the multiplier / chance / percentage-point sigils (shown
 * as +X.X%), a flat per-second amount for the generators (Haagenti, Decarabia, …), or rounded
 * invoking power. The boon *text* already says what the seal does; this is its magnitude.
 */
export function effectDisplay(def: SigilDef | undefined, bound: BigNum): string {
  if (!def) return '\u2014';
  const s = sigilStrength(def, bound);
  const e = def.effect;
  if (e.kind === 'flatGen') return `+${fmtFlat(s)} ${FLAT_UNIT[e.resource] ?? '/s'}`;
  if (e.kind === 'invokingPower') return `+${Math.round(s)} invoking power`;
  return `+${(s * 100).toFixed(1)}%`;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** A seal's display name (falls back to the sim def name). */
function sealName(idx: number): string {
  const id = idx + 1;
  const def = sigilById(id);
  return strings.sigils.names[id] ?? def?.name ?? `Seal ${id}`;
}
/** The browse bar's roman seal number (or an em dash when nothing is centred). */
function browseNoText(idx: number): string {
  return idx >= 0 ? `\u2116 ${toRoman(idx + 1)}` : '\u2014';
}
/** The browse bar's seal name line (handles "nothing centred" and the sealed Semet seal). */
function browseNameText(idx: number, semetUnlocked: boolean): string {
  if (idx < 0) return 'Look upon the seals';
  if (idx + 1 === SEMET_ID && !semetUnlocked) return 'A seal unread';
  return sealName(idx);
}

export function AetherSigils({
  state,
  onModalChange,
}: {
  state: GameState;
  /** Reports the focused (panel-open) state up, so the parent hides the floor nav — as Princes do. */
  onModalChange?: (open: boolean) => void;
}): ReactElement {
  const bindMore = useGameStore((s) => s.bindMore);
  const bindLess = useGameStore((s) => s.bindLess);
  const unbindAll = useGameStore((s) => s.unbindAll);

  // selected drives the panel + freezes the loop. Focus (the centred seal) is NOT React state — it
  // changes constantly during a drag, so it lives in focusRef and is painted to the browse bar by
  // direct DOM, to avoid re-rendering on every frame.
  const [selected, setSelected] = useState(-1);
  const [interacted, setInteracted] = useState(false);

  // Live mirrors the rAF loop and pointer handlers read without re-subscribing.
  const stateRef = useRef(state);
  stateRef.current = state;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const focusRef = useRef(-1);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const sealRefs = useRef<(HTMLImageElement | null)[]>([]);
  // Browse-bar elements, updated imperatively when the centred seal changes (no React re-render).
  const bbNoRef = useRef<HTMLDivElement | null>(null);
  const bbNameRef = useRef<HTMLDivElement | null>(null);
  const focusBtnRef = useRef<HTMLButtonElement | null>(null);
  // Last glow filter written per seal — so we only touch style.filter (a paint) when it changes,
  // not every frame.
  const glowRef = useRef<string[]>([]);

  // Pure view state (never persisted): yaw/pitch + their momentum, and the drag latch.
  const yaw = useRef(0);
  const pitch = useRef(0);
  const vYaw = useRef(0.0022);
  const vPitch = useRef(0);
  const drag = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  /** Set every seal's glow from current refs — used when the loop is frozen (panel open). */
  const relight = (): void => {
    const st = stateRef.current;
    const semet = SEMET_DEF ? sigilVisible(st, SEMET_DEF) : true;
    const sel = selectedRef.current;
    for (let i = 0; i < N; i++) {
      const el = sealRefs.current[i];
      if (!el) continue;
      const id = i + 1;
      const locked = id === SEMET_ID && !semet;
      const v = st.sigilBindings[id];
      const lit = v !== undefined && !isZero(v);
      const glow = locked
        ? SEALED
        : i === sel
          ? SELGLOW
          : lit
            ? LIT
            : i === focusRef.current
              ? FOCUS_GLOW
              : COLD;
      if (glowRef.current[i] !== glow) {
        el.style.filter = glow;
        glowRef.current[i] = glow;
      }
    }
  };

  // The projection loop. Mutates DOM transforms/opacity/glow directly; React only learns about the
  // (infrequent) focus change. Frozen while a seal is open in the panel.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let raf = 0;
    const loop = (): void => {
      if (selectedRef.current >= 0) {
        raf = requestAnimationFrame(loop);
        return;
      }
      if (!drag.current) {
        yaw.current += vYaw.current;
        pitch.current += vPitch.current;
        vYaw.current *= 0.95;
        vPitch.current *= 0.9;
        if (Math.abs(vYaw.current) < 0.0006) vYaw.current += (IDLE_DRIFT - vYaw.current) * 0.04;
        if (Math.abs(vPitch.current) < 0.0004) vPitch.current *= 0.6;
        pitch.current = clamp(pitch.current, -PITCH_CLAMP, PITCH_CLAMP);
      }
      const cyaw = Math.cos(yaw.current);
      const syaw = Math.sin(yaw.current);
      const cp = Math.cos(pitch.current);
      const sp = Math.sin(pitch.current);
      // Camera basis: forward f, right r, up u = f × r.
      const fx = syaw * cp;
      const fy = sp;
      const fz = cyaw * cp;
      const rx = cyaw;
      const rz = -syaw;
      const ux = fy * rz - fz * 0;
      const uy = fz * rx - fx * rz;
      const uz = fx * 0 - fy * rx;
      const hw = stage.clientWidth / 2 + 74;
      const hh = stage.clientHeight / 2 + 74;
      const st = stateRef.current;
      const semet = SEMET_DEF ? sigilVisible(st, SEMET_DEF) : true;
      const sel = selectedRef.current;
      let bestDist = 1e9;
      let bestIdx = -1;
      for (let i = 0; i < N; i++) {
        const el = sealRefs.current[i];
        if (!el) continue;
        const d = DIRS[i]!;
        const z = d.x * fx + d.y * fy + d.z * fz;
        if (z < CULL_Z) {
          if (el.style.opacity !== '0') {
            el.style.opacity = '0';
            el.style.zIndex = '0';
          }
          continue;
        }
        const x = d.x * rx + d.z * rz;
        const yv = d.x * ux + d.y * uy + d.z * uz;
        const sx = (FOCAL * x) / z;
        const sy = (-FOCAL * yv) / z;
        if (sx < -hw || sx > hw || sy < -hh || sy > hh) {
          if (el.style.opacity !== '0') {
            el.style.opacity = '0';
            el.style.zIndex = '0';
          }
          continue;
        }
        const fade = clamp((z - CULL_Z) / 0.3, 0, 1);
        const scale = 0.6 + Math.min(1, z) * 0.66;
        el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) scale(${scale.toFixed(3)})`;
        el.style.opacity = (0.2 + fade * 0.8).toFixed(3);
        el.style.zIndex = String((z * 100) | 0);
        const id = i + 1;
        const locked = id === SEMET_ID && !semet;
        const v = st.sigilBindings[id];
        const lit = v !== undefined && !isZero(v);
        const glow = locked
          ? SEALED
          : i === sel
            ? SELGLOW
            : lit
              ? LIT
              : i === focusRef.current
                ? FOCUS_GLOW
                : COLD;
        if (glowRef.current[i] !== glow) {
          el.style.filter = glow;
          glowRef.current[i] = glow;
        }
        if (z > CENTER_Z) {
          const dd = sx * sx + sy * sy;
          if (dd < bestDist) {
            bestDist = dd;
            bestIdx = i;
          }
        }
      }
      if (bestIdx !== focusRef.current) {
        focusRef.current = bestIdx;
        // Update the browse bar by direct DOM — the centred seal changes constantly while dragging,
        // so routing this through React state would re-render the whole sphere every few frames.
        if (bbNoRef.current) bbNoRef.current.textContent = browseNoText(bestIdx);
        if (bbNameRef.current) bbNameRef.current.textContent = browseNameText(bestIdx, semet);
        if (focusBtnRef.current) focusBtnRef.current.disabled = bestIdx < 0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Re-glow when the panel opens/closes (loop is frozen then) or a binding changes.
  useEffect(relight, [selected, state]);

  // Esc releases the focused seal.
  useEffect(() => {
    if (selected < 0) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSelected(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  // Hide the floor nav while a seal is open (the design's dimmed, focused state).
  useEffect(() => {
    onModalChange?.(selected >= 0);
  }, [selected, onModalChange]);
  useEffect(() => () => onModalChange?.(false), [onModalChange]);

  // ── pointer / drag ──
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (selectedRef.current >= 0) return;
    const t = e.target as HTMLElement;
    // Don't start a drag from the chrome — setPointerCapture would otherwise swallow the clicks.
    if (t.closest('.aether-browsebar') || t.closest('.aether-panel')) return;
    drag.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.style.cursor = 'grabbing';
    if (!interacted) setInteracted(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!drag.current || selectedRef.current >= 0) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    yaw.current -= dx * DRAG_SENS;
    pitch.current = clamp(pitch.current + dy * DRAG_SENS, -PITCH_CLAMP, PITCH_CLAMP);
    vYaw.current = -dx * DRAG_SENS;
    vPitch.current = dy * DRAG_SENS;
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    drag.current = false;
    e.currentTarget.style.cursor = 'grab';
  };

  // ── derived (real state) ──
  const semetUnlocked = SEMET_DEF ? sigilVisible(state, SEMET_DEF) : true;
  let burning = 0;
  for (let id = 1; id <= N; id++) {
    const v = state.sigilBindings[id];
    if (v === undefined || isZero(v)) continue;
    if (id === SEMET_ID && !semetUnlocked) continue;
    burning++;
  }
  const anyBound = burning > 0;
  const poolZero = isZero(floor(state.souls));

  // The browse bar mounts/refreshes from the live focusRef; the loop keeps it current via direct DOM.
  const fi = focusRef.current;

  return (
    <div
      className="scene aether"
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={(e) => {
        if (drag.current && e.buttons === 0) endDrag(e);
      }}
    >
      {/* vault backdrop — carries the Katabasis pixelation filter (kat-degrade) */}
      <div className="aether-vault" aria-hidden="true">
        <span className="aether-ring aether-ring--1" />
        <span className="aether-ring aether-ring--2" />
        <span className="aether-ring aether-ring--3" />
      </div>
      <div className="aether-vignette" aria-hidden="true" />
      <div className="aether-scrim-top" aria-hidden="true" />
      <div className="aether-scrim-bottom" aria-hidden="true" />

      {/* the 72 seals — projected & lit every frame by the rAF loop above */}
      <div className="aether-seals" aria-hidden="true">
        {Array.from({ length: N }, (_, i) => (
          <img
            key={i}
            ref={(el) => {
              sealRefs.current[i] = el;
            }}
            className="aether-seal"
            src={`${ASSET}/sigils/${String(i + 1).padStart(2, '0')}.png`}
            alt=""
            style={{ opacity: 0 }}
          />
        ))}
      </div>

      {/* the Katabasis degrade chrome (scanlines + grain), as on the other descent scenes */}
      <div className="kat-degrade-chrome" aria-hidden="true" />

      <div className="aether-count">
        <span className="ember">{burning}</span> / 72 seals burning
      </div>

      <div className={`aether-hint${interacted ? ' is-gone' : ''}`}>
        drag to look about you &middot; focus a seal to read &amp; bind it
      </div>

      {/* ── State A: the browse bar (a seal is centred but not yet opened) ── */}
      {selected < 0 && (
        <div className="aether-browsebar">
          <div className="bb-text">
            <div className="bb-no" ref={bbNoRef}>
              {browseNoText(fi)}
            </div>
            <div className="bb-name" ref={bbNameRef}>
              {browseNameText(fi, semetUnlocked)}
            </div>
          </div>
          <button
            type="button"
            className="aether-btn aether-btn--ash"
            disabled={!anyBound}
            onClick={() => unbindAll()}
          >
            Unbind all
          </button>
          <button
            type="button"
            ref={focusBtnRef}
            className="aether-btn aether-btn--blood"
            disabled={fi < 0}
            onClick={() => {
              if (focusRef.current >= 0) setSelected(focusRef.current);
            }}
          >
            Focus
          </button>
        </div>
      )}

      {/* ── State B: focused — scrim + docked detail panel ── */}
      {selected >= 0 && (
        <>
          <div
            className="aether-focus-scrim"
            aria-hidden="true"
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelected(-1);
            }}
          />
          <SealPanel
            idx={selected}
            state={state}
            locked={selected + 1 === SEMET_ID && !semetUnlocked}
            poolZero={poolZero}
            onBind={(a) => bindMore(selected + 1, a)}
            onUnbind={(a) => bindLess(selected + 1, a)}
            onClose={() => setSelected(-1)}
          />
        </>
      )}
    </div>
  );
}

/** The right-docked close-up: read the seal's boon and bind/unbind souls. */
function SealPanel({
  idx,
  state,
  locked,
  poolZero,
  onBind,
  onUnbind,
  onClose,
}: {
  idx: number;
  state: GameState;
  locked: boolean;
  poolZero: boolean;
  onBind: (amount: number) => void;
  onUnbind: (amount: number) => void;
  onClose: () => void;
}): ReactElement {
  const id = idx + 1;
  const def = sigilById(id);
  const name = strings.sigils.names[id] ?? def?.name ?? `Seal ${id}`;
  const boon = strings.sigils.descriptions[id] ?? GOETIA_BOON[id] ?? 'A seal of the lesser key.';
  const bound = state.sigilBindings[id] ?? bn(0);
  const has = !isZero(bound);

  return (
    <aside className="aether-panel" role="dialog" aria-label={locked ? 'A seal unread' : name}>
      <button type="button" className="ap-close" onClick={onClose} aria-label="Release">
        {'\u2715'} Release
      </button>
      <div className="ap-no">
        {'\u2116'} {toRoman(id)}
      </div>
      <h3 className="ap-name">{locked ? 'A seal unread' : name}</h3>
      <div className="ap-rule" />

      {locked ? (
        <div className="ap-boon">
          <div className="ap-boonlabel">Sealed</div>
          <p className="ap-boontext">
            The carving will not resolve. It answers only when every Cardinal Sin stands at Rank 2
            or higher.
          </p>
        </div>
      ) : (
        <>
          <div className="ap-boon">
            <div className="ap-boonlabel">Boon while bound</div>
            <p className="ap-boontext">{boon}</p>
          </div>

          <div className="ap-stats">
            <div className="ap-stat">
              <span className="ap-k">Souls bound</span>
              <span className="ap-v ember">{formatBigNum(bound)}</span>
            </div>
            <div className="ap-stat">
              <span className="ap-k">Effect</span>
              <span className="ap-v gold">{effectDisplay(def, bound)}</span>
            </div>
          </div>

          <div className="ap-actions">
            <HoldButton
              variant="ash"
              onStep={onUnbind}
              disabled={!has}
              ariaLabel={`Unbind souls from ${name}`}
            >
              Hold to unbind
            </HoldButton>
            <HoldButton onStep={onBind} disabled={poolZero} ariaLabel={`Bind souls to ${name}`}>
              {poolZero ? 'No souls' : 'Hold to bind'}
            </HoldButton>
          </div>
          <p className="ap-foot">
            Bindings persist through every descent. Unbind to reclaim the souls.
          </p>
        </>
      )}
    </aside>
  );
}
