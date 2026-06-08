import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { strings } from '@panvitium/shared';
import {
  SINS,
  sinLevel,
  skillIntensity,
  devotionForLevel,
  MAX_SIN_LEVEL,
  sigilById,
  sigilVisible,
  eternalSinVisible,
  eternalSinRevealed,
  eternalProgress,
  ETERNAL_SIN_THRESHOLD,
  floor,
  isZero,
  bn,
  add,
  sub,
  div,
  gt,
  type BigNum,
  type Sin,
  type GameState,
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum } from '../game/format.js';

// Runtime art for the descent — served by Vite from apps/web/public. The four lightning frames and
// the two carved-slab layers are placed here on apply (they live at the repo root + the design zip).
const ASSET = '/assets/panvitium/katabasis';
const AMBIENT_SRC = '/assets/panvitium/music/katabasis_ambient.mp3';
const LIGHTNING_INTENSITY = 8; // 0..10; production value — a strike roughly every ~0.3–1.5s.

// ── Press-and-hold pour (exponential ramp) ───────────────────────────────────
// A tap pours a little; the longer the hold, the faster souls flow. Each tick reads fresh state
// through `onStep`, so the store clamps to the available pool / bound. Constants from the handoff.
const HOLD_BASE = 8;
const HOLD_GROWTH = 22;
const HOLD_RAMP_MS = 550;
const HOLD_STEP_MS = 60;
const HOLD_MAX_STEP = 2.5e9;

function HoldButton({
  onStep,
  disabled = false,
  variant = 'blood',
  children,
  ariaLabel,
}: {
  onStep: (delta: number) => void;
  disabled?: boolean;
  variant?: 'blood' | 'ash';
  children: ReactNode;
  ariaLabel?: string;
}): ReactElement {
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const lastRef = useRef(0);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const [holding, setHolding] = useState(false);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    setHolding(false);
  }, []);

  const frame = useCallback((now: number) => {
    if (now - lastRef.current >= HOLD_STEP_MS) {
      lastRef.current = now;
      const held = now - startRef.current;
      const amt = Math.min(
        HOLD_MAX_STEP,
        Math.max(HOLD_BASE, Math.floor(HOLD_BASE * Math.pow(HOLD_GROWTH, held / HOLD_RAMP_MS))),
      );
      onStepRef.current(amt);
    }
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  const begin = useCallback(() => {
    if (disabled) return;
    stop();
    const now = performance.now();
    startRef.current = now;
    lastRef.current = now - HOLD_STEP_MS; // one step immediately on press
    setHolding(true);
    rafRef.current = requestAnimationFrame(frame);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }, [disabled, frame, stop]);

  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      className={`hold-btn${variant === 'ash' ? ' hold-btn--ash' : ''}${holding ? ' is-holding' : ''}`}
      disabled={disabled}
      onPointerDown={begin}
      onPointerLeave={stop}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-label">{children}</span>
    </button>
  );
}

function Pips({ level, max }: { level: number; max: number }): ReactElement {
  const out: ReactElement[] = [];
  for (let i = 0; i < max; i++) {
    out.push(
      <span key={i} className={i < level ? '' : 'off'}>
        {i < level ? '\u25C6' : '\u25C7'}
      </span>,
    );
  }
  return <span className="pips">{out}</span>;
}

const pct = (v: number): string => `${v * 100}%`;
const poolEmpty = (state: GameState): boolean => isZero(floor(state.souls));

// ── Geometry: statue / obelisk hotspots over the painted frame (fractions) ───
interface Pos {
  x: number;
  y: number;
  w: number;
  h: number;
}
const STATUE_POS: Record<Sin, Pos> = {
  gula: { x: 0.083, y: 0.62, w: 0.135, h: 0.74 },
  luxuria: { x: 0.218, y: 0.58, w: 0.085, h: 0.78 },
  avaritia: { x: 0.347, y: 0.6, w: 0.09, h: 0.78 },
  tristitia: { x: 0.466, y: 0.58, w: 0.09, h: 0.8 },
  ira: { x: 0.567, y: 0.6, w: 0.085, h: 0.78 },
  acedia: { x: 0.69, y: 0.58, w: 0.085, h: 0.8 },
  vanagloria: { x: 0.792, y: 0.55, w: 0.08, h: 0.86 },
  superbia: { x: 0.93, y: 0.58, w: 0.09, h: 0.8 },
};
const ETERNAL_POS: Pos = { x: 0.5, y: 0.55, w: 0.115, h: 0.78 };

// ── Geometry: the 72-seal grid over the slab (10×8), fractions of the slab ────
const SG = {
  cols: 10,
  rows: 8,
  left: 0.145,
  right: 0.861,
  top: 0.108,
  bottom: 0.892,
  cellW: 0.074,
  cellH: 0.1,
};
const cellX = (c: number): number => SG.left + (SG.right - SG.left) * (c / (SG.cols - 1));
const cellY = (r: number): number => SG.top + (SG.bottom - SG.top) * (r / (SG.rows - 1));
const idCol = (id: number): number => (id - 1) % SG.cols;
const idRow = (id: number): number => Math.floor((id - 1) / SG.cols);
const SEMET_ID = 32;

// Concise boon per seal (the design handoff's GOETIA_DESC, derived from sim/sigils.ts effects).
// Used only as a fallback where `strings.sigils.descriptions` has no authoritative entry yet, so
// every seal reads meaningfully in the panel. '↑'/'↓' = raise/soften. Effect accuracy is deferred.
const GOETIA_BOON: Record<number, string> = {
  1: 'Conversion rate \u2191',
  2: 'Indagatio fortune \u2191',
  3: 'Profane finds \u2191',
  4: 'Tristitia invocations \u2191',
  5: 'Influence gain \u2191',
  6: 'Gold gain \u2191',
  7: 'Reprobate generation \u2191',
  8: 'Gula invocations \u2191',
  9: 'Influence costs \u2193',
  10: 'The Familiar grows stronger',
  11: 'Terrible outcomes \u2193',
  12: 'The Succubus grows stronger',
  13: 'Decimatio fortune \u2191',
  14: 'Gold per Choleric kill',
  15: 'Celebrity conversion \u2191',
  16: 'Reprobate generation \u2193',
  17: 'Suasio mishaps \u2193',
  18: 'Acolyte efficiency \u2191',
  19: 'Offline gold \u2191',
  20: 'Gold kept on descent \u2191',
  21: 'Offline time \u2191',
  22: 'Decimatio mishaps \u2193',
  23: 'Choleric murder rate \u2191',
  24: 'Suasio success \u2191',
  25: 'Murder favours Celebrities',
  26: 'Vanagloria invocations \u2191',
  27: 'Nihilist suicide \u2191',
  28: 'Superbia invocations \u2191',
  29: 'Stellar Indagatio \u2191',
  30: 'Offline influence \u2191',
  31: 'Apocalyptic outcomes \u2193',
  32: 'All carried on descent \u2191',
  33: 'Sigma influence penalty \u2193',
  34: 'Luxuria invocations \u2191',
  35: 'Maximum influence \u2191',
  36: 'Rare finds \u2191',
  37: 'Celebrity conversion \u2191',
  38: 'Maleficia kept on descent \u2191',
  39: 'Celebrity gold penalty \u2193',
  40: 'Decimatio efficiency \u2191',
  41: 'Nihilist suicide \u2191',
  42: 'Ira invocations \u2191',
  43: 'Murder favours Gluttons',
  44: 'Avaritia invocations \u2191',
  45: 'Shutdown refund \u2191',
  46: 'Indagatio efficiency \u2191',
  47: 'Degenerate death penalty \u2193',
  48: 'Flat gold generation',
  49: 'Reprobate suicide rate \u2191',
  50: 'Double Indagatio find',
  51: 'Terrible outcomes \u2193',
  52: 'Acedia invocations \u2191',
  53: 'Murder favours Degenerates',
  54: 'Invocation efficiency \u2191',
  55: 'Invocation soul cost \u2193',
  56: 'Degenerate suicide penalty \u2193',
  57: 'Convert toward the minority',
  58: 'Emptio gold cost \u2193',
  59: 'Convert toward the majority',
  60: 'Vitium Mercatura output \u2191',
  61: 'Vitium Compositum output \u2191',
  62: 'Gambler generation penalty \u2193',
  63: 'Stellar Emptio \u2191',
  64: 'Cholerics murder Cholerics',
  65: 'Invoking power \u2191',
  66: 'Maleficia kept on descent \u2191',
  67: 'Choleric murder rate \u2191',
  68: 'Influence gain \u2191',
  69: 'Flat influence generation',
  70: 'Emptio efficiency \u2191',
  71: 'Suasio efficiency \u2191',
  72: 'Emptio fortune \u2191',
};

/** 0..1 aperture strength from the souls bound — bigger binds open a wider, hotter molten hole. */
function maskStrength(bound: BigNum): number {
  const n = floor(bound).toNumber();
  if (!Number.isFinite(n)) return 1;
  if (n <= 0) return 0;
  return Math.min(1, Math.log10(Math.max(10, n)) / 9);
}

/** CSS mask revealing the molten layer only at bound cells (one soft aperture per bound seal). */
function moltenMask(bound: Array<{ id: number; v: BigNum }>): string {
  if (!bound.length) return 'radial-gradient(circle at -10% -10%, #000 0, transparent 0)';
  return bound
    .map(({ id, v }) => {
      const cx = (cellX(idCol(id)) * 100).toFixed(2);
      const cy = (cellY(idRow(id)) * 100).toFixed(2);
      const s = maskStrength(v);
      const rx = (4.6 + s * 1.4).toFixed(2);
      const ry = (6.2 + s * 1.8).toFixed(2);
      return `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, #000 58%, rgba(0,0,0,0.35) 78%, transparent 100%)`;
    })
    .join(', ');
}

// ── Imperative lightning: sharp strikes that flash the bright frames, then snap to dark ──────────
function Lightning({ intensity, paused }: { intensity: number; paused: boolean }): ReactElement {
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);
  const cRef = useRef<HTMLDivElement>(null);
  const wRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef(-1);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // When a takeover opens, calm the storm to black behind the scrim.
  useEffect(() => {
    if (!paused) return;
    [aRef.current, bRef.current, cRef.current, wRef.current].forEach((el) => {
      if (!el) return;
      el.style.transition = 'opacity 320ms ease';
      el.style.opacity = '0';
    });
  }, [paused]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fades: Array<ReturnType<typeof setTimeout>> = [];

    const pop = (el: HTMLDivElement | null, peak: number, fadeMs: number): void => {
      if (!el) return;
      el.style.transition = 'none';
      el.style.opacity = String(peak);
      void el.offsetWidth; // commit the hard ON
      el.style.transition = `opacity ${fadeMs}ms cubic-bezier(.2,.0,.1,1)`;
      el.style.opacity = '0';
    };

    const strike = (): void => {
      const all = [aRef.current, bRef.current, cRef.current];
      let idx = Math.floor(Math.random() * all.length);
      if (idx === lastRef.current) idx = (idx + 1) % all.length;
      lastRef.current = idx;
      const layer = all[idx] ?? null;
      const peak = 0.74 + Math.random() * 0.26;
      pop(layer, peak, 150 + Math.random() * 110);
      pop(wRef.current, 0.3 + Math.random() * 0.32, 100);
      if (Math.random() < 0.6) {
        fades.push(
          setTimeout(
            () => {
              pop(layer, peak * 0.85, 120);
              pop(wRef.current, 0.22, 80);
            },
            60 + Math.random() * 70,
          ),
        );
      }
      if (Math.random() < 0.4) {
        fades.push(
          setTimeout(
            () => {
              const other = all[(idx + 1 + Math.floor(Math.random() * 2)) % all.length] ?? null;
              pop(other, peak * 0.9, 130);
            },
            150 + Math.random() * 120,
          ),
        );
      }
    };

    const loop = (): void => {
      if (!alive) return;
      if (!pausedRef.current) strike();
      const span = 1500 - intensity * 150;
      const gap = Math.max(220, span * 0.4 + Math.random() * span);
      timer = setTimeout(loop, gap);
    };
    timer = setTimeout(loop, 280);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      fades.forEach(clearTimeout);
    };
  }, [intensity]);

  return (
    <>
      <div
        className="bg-strike"
        ref={aRef}
        style={{ backgroundImage: `url(${ASSET}/katabasis.png)` }}
      />
      <div
        className="bg-strike"
        ref={bRef}
        style={{ backgroundImage: `url(${ASSET}/katabasis2.png)` }}
      />
      <div
        className="bg-strike"
        ref={cRef}
        style={{ backgroundImage: `url(${ASSET}/katabasis3.png)` }}
      />
      <div className="bg-whiteflash" ref={wRef} />
    </>
  );
}

// ── Full-screen Prince takeover (text only — room reserved for future lore) ──────────────────────
function PrinceModal({
  sin,
  state,
  onClose,
}: {
  sin: Sin;
  state: GameState;
  onClose: () => void;
}): ReactElement {
  const offer = useGameStore((s) => s.offer);
  const info = strings.sins[sin];
  const devotion = state.devotion[sin];
  const level = sinLevel(devotion);
  const maxed = level >= MAX_SIN_LEVEL;
  const intensity = skillIntensity(devotion);
  const base = devotionForLevel(level);
  const next = devotionForLevel(Math.min(level + 1, MAX_SIN_LEVEL));
  const span = sub(next, base);
  const prog =
    maxed || isZero(span) ? 1 : Math.max(0, Math.min(1, div(sub(devotion, base), span).toNumber()));

  return (
    <div className="takeover" role="dialog" aria-label={info.prince} onClick={onClose}>
      <div className="takeover-body takeover-body--solo" onClick={(e) => e.stopPropagation()}>
        <button className="takeover-close" onClick={onClose} aria-label="Turn away">
          {'\u2715'}
        </button>
        <div className="tk-info-col">
          <div className="tk-eyebrow">{info.epithet}</div>
          <h1 className="tk-name">{info.prince}</h1>
          <div className="tk-sin">
            {info.latin} <span>&middot;</span> {info.english}
          </div>
          <div className="tk-rankline">
            <Pips level={level} max={MAX_SIN_LEVEL} />
            <span className="tk-rankword">
              {maxed ? 'Mastered' : `Rank ${level} of ${MAX_SIN_LEVEL}`}
            </span>
          </div>

          <div className="tk-rule" />

          <div className="tk-stats">
            <div className="tk-stat">
              <span className="k">Devotion paid</span>
              <span className="v ember">{formatBigNum(devotion)}</span>
            </div>
            <div className="tk-stat">
              <span className="k">Skill intensity</span>
              <span className="v">{intensity.toFixed(2)}</span>
            </div>
          </div>

          {!maxed && (
            <div className="tk-meter">
              <div className="tk-meter-track">
                <span className="tk-meter-fill" style={{ width: pct(prog) }} />
              </div>
              <div className="tk-meter-cap">
                <span>Toward Rank {level + 1}</span>
                <span>
                  {formatBigNum(devotion)} / {formatBigNum(next)}
                </span>
              </div>
            </div>
          )}

          <div className="tk-lore">
            <div className="h">{info.skill}</div>
            <div className="b">{info.skillEffect}</div>
          </div>
          <div className="tk-lore">
            <div className="h">Per rank</div>
            <div className="b dim">{info.levelEffect}</div>
          </div>

          {maxed ? (
            <div className="tk-mastered">It is sated. The rank is yours, and cannot be unmade.</div>
          ) : (
            <div className="tk-actions">
              <HoldButton
                onStep={(d) => offer(sin, d)}
                disabled={poolEmpty(state)}
                ariaLabel={`Offer souls to ${info.prince}`}
              >
                Hold to pour out Devotion
              </HoldButton>
              <div className="tk-note">Devotion is permanent. There is no taking it back.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── The Eternal — the Ninth, the centre column (end-state only) ──────────────────────────────────
function EternalModal({ state, onClose }: { state: GameState; onClose: () => void }): ReactElement {
  const offerEternal = useGameStore((s) => s.offerEternal);
  const revealed = eternalSinRevealed(state);
  const prog = eternalProgress(state);
  return (
    <div
      className="takeover takeover--eternal"
      role="dialog"
      aria-label={strings.eternal.ninth}
      onClick={onClose}
    >
      <div className="takeover-body takeover-body--solo" onClick={(e) => e.stopPropagation()}>
        <button className="takeover-close" onClick={onClose} aria-label="Turn away">
          {'\u2715'}
        </button>
        <div className="tk-info-col">
          <div className="tk-eyebrow">Above the eight, and below them</div>
          <h1
            className="tk-name tk-name--eternal"
            style={{ color: revealed ? 'var(--eternal)' : '#6a605c' }}
          >
            {revealed ? strings.eternal.name : strings.eternal.unknown}
          </h1>
          <div className="tk-sin tk-sin--eternal">
            {revealed ? `Peccatum \u00C6ternum \u00B7 The Eternal Sin` : strings.eternal.ninth}
          </div>

          <div className="tk-rule" />

          <div className="tk-stats">
            <div className="tk-stat">
              <span className="k">Offered to the column</span>
              <span className="v ember">{formatBigNum(state.eternalDevotion)}</span>
            </div>
            <div className="tk-stat">
              <span className="k">To speak its name</span>
              <span className="v">{formatBigNum(bn(ETERNAL_SIN_THRESHOLD))}</span>
            </div>
          </div>
          <div className="tk-meter">
            <div className="tk-meter-track">
              <span className="tk-meter-fill tk-meter-fill--eternal" style={{ width: pct(prog) }} />
            </div>
            <div className="tk-meter-cap">
              <span>The column drinks</span>
              <span>{(prog * 100).toFixed(1)}%</span>
            </div>
          </div>

          <div className="tk-lore">
            <div className="b dim">
              It has no name you can yet read &mdash; yet it takes what you give. Something stood
              always above the eight, in the place you would not look.
            </div>
          </div>

          {revealed ? (
            <div className="tk-mastered tk-mastered--eternal">{strings.eternal.complete}</div>
          ) : (
            <div className="tk-actions">
              <HoldButton
                onStep={(d) => offerEternal(d)}
                disabled={poolEmpty(state)}
                ariaLabel="Offer souls to the Ninth"
              >
                Hold to feed the column
              </HoldButton>
              <div className="tk-note">There was never another prince. There was only you.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── The Princes: a black void torn open by lightning (or the steady end-state) ───────────────────
function StatuesPlace({
  state,
  ended,
  showCaption,
  onModalChange,
}: {
  state: GameState;
  ended: boolean;
  showCaption: boolean;
  onModalChange: (open: boolean) => void;
}): ReactElement {
  const [sel, setSel] = useState<Sin | 'eternal' | null>(null);
  const open = (key: Sin | 'eternal'): void => {
    setSel(key);
    onModalChange(true);
  };
  const close = (): void => {
    setSel(null);
    onModalChange(false);
  };

  return (
    <div className={`scene hell${ended ? ' hell--ended' : ''}`}>
      {ended ? (
        <>
          <div className="bg-end" style={{ backgroundImage: `url(${ASSET}/katabasis_end.png)` }} />
          <div className="end-glow" />
        </>
      ) : (
        <>
          <div
            className="bg-silhouette"
            style={{ backgroundImage: `url(${ASSET}/katabasis3.png)` }}
          />
          <Lightning intensity={LIGHTNING_INTENSITY} paused={sel !== null} />
        </>
      )}

      <div className="kat-degrade-chrome" aria-hidden="true" />

      {showCaption && (
        <div className="hell-caption">
          <div className="t">{ended ? 'The Court Made Whole' : 'The Court of Spires'}</div>
          <div className="s">
            {ended
              ? 'The eight are sated. The Ninth stands revealed in the centre.'
              : 'Eight Princes wait in the lightning. Give, and be raised.'}
          </div>
        </div>
      )}

      <div className="statue-field">
        {SINS.map((sin) => {
          const p = STATUE_POS[sin];
          const lvl = sinLevel(state.devotion[sin]);
          const info = strings.sins[sin];
          const style: CSSProperties = {
            left: pct(p.x),
            top: pct(p.y),
            width: pct(p.w),
            height: pct(p.h),
          };
          return (
            <button
              key={sin}
              className={`statue${lvl >= MAX_SIN_LEVEL ? ' statue--maxed' : ''}`}
              style={style}
              onClick={() => open(sin)}
              aria-label={`${info.prince} \u2014 ${info.english}`}
            >
              <span className="statue-tag">
                {info.prince}
                <span className="pip">
                  <Pips level={lvl} max={MAX_SIN_LEVEL} />
                </span>
              </span>
            </button>
          );
        })}

        {ended && (
          <button
            className="obelisk"
            style={{
              left: pct(ETERNAL_POS.x),
              top: pct(ETERNAL_POS.y),
              width: pct(ETERNAL_POS.w),
              height: pct(ETERNAL_POS.h),
            }}
            onClick={() => open('eternal')}
            aria-label="The Ninth"
          >
            <span className="obelisk-flame" aria-hidden="true" />
            <span className="obelisk-tag">The Eternal Sin</span>
          </button>
        )}
      </div>

      {sel !== null && sel !== 'eternal' && <PrinceModal sin={sel} state={state} onClose={close} />}
      {sel === 'eternal' && <EternalModal state={state} onClose={close} />}
    </div>
  );
}

// ── The seal inscription panel (slides from the right; text only) ────────────────────────────────
function SigilPanel({
  id,
  state,
  locked,
  onClose,
}: {
  id: number;
  state: GameState;
  locked: boolean;
  onClose: () => void;
}): ReactElement {
  const bindMore = useGameStore((s) => s.bindMore);
  const bindLess = useGameStore((s) => s.bindLess);
  const def = sigilById(id);
  const name = strings.sigils.names[id] ?? def?.name ?? `Seal ${id}`;
  const desc = strings.sigils.descriptions[id] ?? GOETIA_BOON[id] ?? 'A seal of the lesser key.';
  const bound = state.sigilBindings[id] ?? bn(0);
  const has = !isZero(bound);
  const strength = floor(bound).sqrt();
  const lit = !locked && has;

  return (
    <aside className="panel panel--sigil" role="dialog" aria-label={name}>
      <button className="panel-close" onClick={onClose} aria-label="Close">
        {'\u2715'}
      </button>

      <div className="sigil-numplate">
        {locked && id === SEMET_ID ? '\u2014' : `No. ${id} of LXXII`}
      </div>
      <div className="panel-eyebrow panel-eyebrow--center">Seal of the Goetia</div>
      <h2 className="sigil-name">{locked && id === SEMET_ID ? 'A seal unread' : name}</h2>
      <div className={`sigil-state${lit ? ' is-lit' : ''}`}>
        {locked ? 'Sealed' : lit ? 'Bound \u00B7 the carving burns' : 'Cold \u00B7 unbound'}
      </div>

      <div className="panel-rule" />

      {locked ? (
        <div className="lore-block">
          <div className="h">Sealed</div>
          <div className="b dim">
            The carving will not resolve. It answers only when every Cardinal Sin stands at Rank 2
            or higher. Keep offering above; return when the eight have risen.
          </div>
        </div>
      ) : (
        <>
          <div className="lore-block">
            <div className="h">Boon while bound</div>
            <div className="b">{desc}</div>
          </div>

          <div className="panel-rule" />

          <div className="stat-row">
            <span className="k">Souls bound</span>
            <span className="v ember">{formatBigNum(bound)}</span>
          </div>
          <div className="stat-row">
            <span className="k">Effect magnitude</span>
            <span className="v">
              {'\u221A'} {formatBigNum(strength)}
            </span>
          </div>
          <div className="lore-block lore-block--note">
            <div className="b dim sigil-sqrt-note">
              The seal drinks the square root of what you give it &mdash; spread your souls across
              many, not all into one.
            </div>
          </div>

          <div className="panel-actions">
            <div className="row">
              <HoldButton
                onStep={(a) => bindMore(id, a)}
                disabled={poolEmpty(state)}
                ariaLabel={`Bind souls to ${name}`}
              >
                Hold to bind
              </HoldButton>
              <HoldButton
                variant="ash"
                onStep={(a) => bindLess(id, a)}
                disabled={!has}
                ariaLabel={`Unbind souls from ${name}`}
              >
                Hold to unbind
              </HoldButton>
            </div>
            <div className="offer-note">
              Bindings persist through every descent. Unbind to reclaim the souls.
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

// ── The Goetia: seventy-two seals carved into a slab of black basalt ─────────────────────────────
function SigilsPlace({ state }: { state: GameState }): ReactElement {
  const [sel, setSel] = useState<number | null>(null);

  const boundCells: Array<{ id: number; v: BigNum }> = [];
  for (let id = 1; id <= 72; id++) {
    const v = state.sigilBindings[id];
    const def = sigilById(id);
    const semetLocked = def ? !sigilVisible(state, def) : false;
    if (v !== undefined && !isZero(v) && !semetLocked) boundCells.push({ id, v });
  }
  const mask = moltenMask(boundCells);

  const cells: ReactElement[] = [];
  for (let id = 1; id <= 72; id++) {
    const def = sigilById(id);
    const semetLocked = def ? !sigilVisible(state, def) : false;
    const v = state.sigilBindings[id];
    const lit = v !== undefined && !isZero(v) && !semetLocked;
    const active = sel === id;
    const name = strings.sigils.names[id] ?? def?.name ?? String(id);
    cells.push(
      <button
        key={id}
        className={`sigil-cell${lit ? ' sigil-cell--bound' : ''}${active ? ' sigil-cell--active' : ''}${semetLocked ? ' sigil-cell--locked' : ''}`}
        style={{
          left: pct(cellX(idCol(id))),
          top: pct(cellY(idRow(id))),
          width: pct(SG.cellW),
          height: pct(SG.cellH),
        }}
        onClick={() => setSel(active ? null : id)}
        aria-label={`Seal ${id} \u2014 ${semetLocked ? '\u2014' : name}`}
      >
        <span className="sigil-cell-glow" aria-hidden="true" />
        <span className="sigil-cell-mark">
          {semetLocked ? `${id} \u00B7 \u2014` : `${id} \u00B7 ${name}`}
        </span>
      </button>,
    );
  }

  const selDef = sel !== null ? sigilById(sel) : undefined;
  const selLocked = sel !== null && selDef ? !sigilVisible(state, selDef) : false;

  return (
    <div className="scene goetia">
      <div className="cavern-glow" aria-hidden="true" />

      <div className="goetia-head">
        <div className="eyebrow">Clavicula Salomonis</div>
        <div className="t">The Lesser Key</div>
        <div className="s">
          Seventy-two seals cut into the black stone. Bind your souls; the carving takes fire.
        </div>
      </div>

      <div className="slab-wrap">
        <div className="slab-frame">
          <img
            className="slab-img"
            src={`${ASSET}/sigil-slab-dark.png`}
            alt="The seventy-two seals carved in stone"
          />
          <img
            className="slab-molten"
            src={`${ASSET}/sigil-slab-molten.png`}
            alt=""
            style={{ maskImage: mask, WebkitMaskImage: mask }}
          />
          <div className="slab-torch" aria-hidden="true" />
          <div className="slab-edge" aria-hidden="true" />
          <div className="kat-degrade-chrome" aria-hidden="true" />
          {cells}
        </div>
      </div>

      <div className="goetia-count">
        <span className="flame-dot" aria-hidden="true" />
        {boundCells.length} <span className="of">of 72 seals burning</span>
      </div>

      {sel !== null && (
        <SigilPanel id={sel} state={state} locked={selLocked} onClose={() => setSel(null)} />
      )}
    </div>
  );
}

// ── The descent / ascent interstitial (Abyss style — the locked production transition) ───────────
function Transition({
  kind,
  onDone,
}: {
  kind: 'descending' | 'ascending';
  onDone: () => void;
}): ReactElement {
  const down = kind === 'descending';
  useEffect(() => {
    const t = setTimeout(onDone, down ? 4200 : 3600);
    return () => clearTimeout(t);
  }, [down, onDone]);
  return (
    <div className="scene transit transit--abyss" data-dir={down ? 'down' : 'up'} onClick={onDone}>
      <div className="tr-abyss" aria-hidden="true" />
      <div className="transit-vignette" aria-hidden="true" />
      <div className="transit-word">{down ? 'Katabasis' : 'Ascensus'}</div>
      <div className="transit-sub">
        {down
          ? 'You lie still upon the altar; the soul slips its body and goes down to settle its accounts.'
          : 'The accounts are settled. You fall upwards, toward the light you betrayed.'}
      </div>
      <button type="button" className="transit-skip" onClick={onDone}>
        Click anywhere to continue
      </button>
    </div>
  );
}

// ── The full-screen Altar commit gate (screen 0 of the flow) ─────────────────────────────────────
const EMBER_SEEDS = Array.from({ length: 22 }, () => ({
  left: Math.random() * 100,
  delay: Math.random() * 9,
  dur: 7 + Math.random() * 7,
  size: 1.5 + Math.random() * 2.5,
  drift: (Math.random() * 2 - 1) * 40,
}));

function AmbientEmbers(): ReactElement {
  return (
    <div className="ambient-embers" aria-hidden="true">
      {EMBER_SEEDS.map((e, i) => (
        <span
          key={i}
          className="amb-ember"
          style={
            {
              left: `${e.left}%`,
              width: e.size,
              height: e.size,
              '--drift': `${e.drift}px`,
              animation: `amb-rise ${e.dur}s ease-in ${e.delay}s infinite`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ── The Altar commit gate (screen 0): the ritual seal circle ─────────────────────────────────────
// A redesign of the prior slab-with-candles drop target (Claude Design handoff). The central Goetic
// sigil IS the descend button, ringed by counter-rotating Latin script. The two-press safeguard
// from the prior gate is preserved on the seal: the first press arms it, the second commits the
// (irreversible) descent; it auto-disarms after a few seconds. "Turn away" routes back to the real
// Altar Room (the room layer) via the store's close action — the prototype's in-screen altar-room
// overlay is intentionally not ported. "Status quo" opens the Ledger (below).
const SEAL_SRC = `${ASSET}/seal-panvitium.png`;
const RING_PHRASE = 'PER VITIA, AD SOLIUM';
const RING_RADIUS = 118; // matches the #kat-ring-path arc radius

function AltarGate({
  onDescend,
  onTurnAway,
  onStatusQuo,
}: {
  onDescend: () => void;
  onTurnAway: () => void;
  onStatusQuo: () => void;
}): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  // Whole phrases evenly spaced around the ring — computed from measured text so a phrase is never
  // clipped at the seam. Defaults to 2 (opposite each other) when measurement is unavailable
  // (jsdom, or before the webfont loads).
  const [phraseCount, setPhraseCount] = useState(2);
  // Two-press commit safeguard: the first press arms the seal, the second descends. Auto-disarms.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  useLayoutEffect(() => {
    let cancelled = false;
    const build = (): void => {
      const svg = svgRef.current;
      if (!svg || cancelled) return;
      const NS = 'http://www.w3.org/2000/svg';
      const measure = (s: string): number => {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('class', 'kat-seal-text');
        t.style.visibility = 'hidden';
        t.textContent = s;
        svg.appendChild(t);
        let len = 0;
        try {
          // jsdom (tests) doesn't implement SVG text measurement — fall back to the default count.
          len = typeof t.getComputedTextLength === 'function' ? t.getComputedTextLength() : 0;
        } catch {
          len = 0;
        }
        svg.removeChild(t);
        return len;
      };
      const circumference = 2 * Math.PI * RING_RADIUS;
      const phraseLen = measure(RING_PHRASE);
      const gapUnit = measure('\u00B7 ');
      if (!phraseLen || !gapUnit) return; // measurement unavailable — keep the default of 2
      const n = Math.max(1, Math.floor(circumference / (phraseLen + 4 * gapUnit)));
      if (!cancelled) setPhraseCount(n);
    };
    if (document.fonts?.ready) void document.fonts.ready.then(build);
    build();
    return () => {
      cancelled = true;
    };
  }, []);

  const ticks = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r1 = 150;
    const r2 = i % 4 === 0 ? 138 : 144;
    return (
      <line
        key={i}
        className="kat-seal-tick"
        x1={190 + Math.cos(a) * r1}
        y1={190 + Math.sin(a) * r1}
        x2={190 + Math.cos(a) * r2}
        y2={190 + Math.sin(a) * r2}
        strokeWidth={i % 4 === 0 ? 1.4 : 0.7}
      />
    );
  });

  const phrases = Array.from({ length: phraseCount }, (_, i) => (
    <text key={i} className="kat-seal-text" textAnchor="middle">
      <textPath href="#kat-ring-path" startOffset={`${((i + 0.5) / phraseCount) * 100}%`}>
        {RING_PHRASE}
      </textPath>
    </text>
  ));

  const press = (): void => {
    if (armed) {
      setArmed(false);
      onDescend();
    } else {
      setArmed(true);
    }
  };

  return (
    <div className="scene altar-gate">
      <div className="altar-fog" aria-hidden="true" />
      <AmbientEmbers />
      <div className="altar-inner">
        <h1 className="altar-title">Katabasis</h1>

        <div className={`kat-seal-wrap${armed ? ' is-armed' : ''}`}>
          <div className="kat-seal-core" aria-hidden="true" />
          <svg className="kat-seal-svg" viewBox="0 0 380 380" ref={svgRef} aria-hidden="true">
            <defs>
              <path
                id="kat-ring-path"
                d="M 190,190 m -118,0 a 118,118 0 1,1 236,0 a 118,118 0 1,1 -236,0"
              />
            </defs>
            <circle
              className="kat-seal-stroke"
              cx="190"
              cy="190"
              r="170"
              strokeWidth="1"
              opacity="0.5"
            />
            <g className="kat-seal-spin">
              <circle className="kat-seal-stroke" cx="190" cy="190" r="150" strokeWidth="1.4" />
              {ticks}
            </g>
            <circle
              className="kat-seal-stroke"
              cx="190"
              cy="190"
              r="132"
              strokeWidth="0.8"
              opacity="0.7"
            />
            <g className="kat-seal-spin-rev">{phrases}</g>
            <circle className="kat-seal-stroke" cx="190" cy="190" r="92" strokeWidth="1.2" />
          </svg>
          <button
            type="button"
            className="kat-seal-btn"
            onClick={press}
            aria-label={
              armed ? 'Confirm the descent \u2014 there is no return' : 'Press the seal to descend'
            }
          >
            <img className="kat-seal-glyph" src={SEAL_SRC} alt="" draggable={false} />
          </button>
        </div>

        <div className={`kat-seal-hint${armed ? ' is-armed' : ''}`}>
          {armed
            ? 'Press the seal again \u2014 there is no return.'
            : 'Press the seal to begin the descent.'}
        </div>

        <div className="altar-actions">
          <button type="button" className="altar-action" onClick={onTurnAway}>
            <span className="altar-action-label">Turn away</span>
            <span className="altar-action-sub">climb back to the altar room</span>
          </button>
          <button type="button" className="altar-action" onClick={onStatusQuo}>
            <span className="altar-action-label">Status quo</span>
            <span className="altar-action-sub">the ledger of Devotion</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Split a boon string's trailing direction arrow off so the ledger can colour it separately. */
function splitBoon(desc: string): { text: string; dir: string } {
  const trimmed = desc.trimEnd();
  const last = trimmed.slice(-1);
  if (last === '\u2191' || last === '\u2193') {
    return { text: trimmed.slice(0, -1).trimEnd(), dir: last };
  }
  return { text: trimmed, dir: '' };
}

// One Cardinal Sin's row in the Ledger: Latin/English name, rank pips, Prince + epithet, and the
// two effect lines (the always-on Skill, and the per-rank Level effect). Dormant (Rank 0) sins dim
// their level row, matching the handoff.
function SinLedgerCard({ sinKey, state }: { sinKey: Sin; state: GameState }): ReactElement {
  const info = strings.sins[sinKey];
  const level = sinLevel(state.devotion[sinKey]);
  const dormant = level === 0;
  return (
    <div className={`ledger-sin${dormant ? ' is-dormant' : ''}`}>
      <div className="ledger-sin-top">
        <div className="ledger-sin-name">
          <span className="ls-latin">{info.latin}</span>
          <span className="ls-eng">{info.english}</span>
        </div>
        <Pips level={level} max={MAX_SIN_LEVEL} />
      </div>
      <div className="ledger-sin-prince">
        {info.prince} <span aria-hidden="true">&middot;</span>{' '}
        <span className="ls-epithet">{info.epithet}</span>
      </div>
      <div className="ledger-sin-effects">
        <div className="ledger-eff">
          <span className="ls-tag">Skill</span>
          <span className="ls-txt">
            <span className="ls-skill">{info.skill}</span> &mdash; {info.skillEffect}
          </span>
        </div>
        <div className="ledger-eff is-lvl">
          <span className="ls-tag is-lvl">Level {level}</span>
          <span className="ls-txt">{info.levelEffect}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The Ledger ("Status Quo") — the player's current standing, reached from the Altar gate. Read-only:
 * each Cardinal Sin's rank + skill/level effects, then every BOUND sigil's effect (effects only — no
 * seal names, no art, per the design). All wired to live state: Sin levels via `sinLevel`, the
 * eight Princes' lore from `strings.sins`, bound sigils from `state.sigilBindings` (visible + souls
 * bound), and a derived summary. Sealed sigils (Semet, until every Sin is Rank ≥ 2) never surface.
 */
function Ledger({ state, onBack }: { state: GameState; onBack: () => void }): ReactElement {
  // Total Devotion = the sum offered across the eight Princes (not the Eternal column).
  const totalDevotion = useMemo(
    () => SINS.reduce((acc, key) => add(acc, state.devotion[key]), bn(0)),
    [state.devotion],
  );
  const seated = SINS.filter((key) => sinLevel(state.devotion[key]) >= 1).length;

  // Bound sigils — effects only, sorted most-bound first. A seal appears only once it has souls
  // bound and is visible (Semet stays sealed until the gate opens). Effect text + arrow come from
  // the authoritative `strings.sigils.descriptions`, falling back to the local boon table.
  const boundSigils = useMemo(() => {
    const rows: Array<{ id: number; text: string; dir: string; bound: BigNum }> = [];
    for (let id = 1; id <= 72; id++) {
      const v = state.sigilBindings[id];
      if (v === undefined || isZero(v)) continue;
      const def = sigilById(id);
      if (def && !sigilVisible(state, def)) continue;
      const desc =
        strings.sigils.descriptions[id] ?? GOETIA_BOON[id] ?? 'A seal of the lesser key.';
      const { text, dir } = splitBoon(desc);
      rows.push({ id, text, dir, bound: v });
    }
    rows.sort((a, b) => (gt(b.bound, a.bound) ? 1 : gt(a.bound, b.bound) ? -1 : a.id - b.id));
    return rows;
  }, [state]);

  return (
    <div className="scene ledger">
      <div className="ledger-wrap">
        <button type="button" className="ledger-back" onClick={onBack}>
          <span className="ls-arrow" aria-hidden="true">
            {'\u2190'}
          </span>{' '}
          Return to the altar
        </button>

        <div className="ledger-masthead">
          <div className="ledger-eyebrow">Status Quo</div>
          <h1 className="ledger-title">The Ledger</h1>
          <p className="ledger-dek">
            The Devotion owed each Prince and the rank it buys you, the powers your Sins now exert,
            and the effects of every sigil bound to your soul.
          </p>
        </div>

        <div className="ledger-summary">
          <div className="ls-stat">
            <div className="ls-num">{formatBigNum(totalDevotion)}</div>
            <div className="ls-lab">Total Devotion</div>
          </div>
          <div className="ls-stat">
            <div className="ls-num">{seated} / 8</div>
            <div className="ls-lab">Princes Seated</div>
          </div>
          <div className="ls-stat">
            <div className="ls-num">{boundSigils.length}</div>
            <div className="ls-lab">Sigils Bound</div>
          </div>
        </div>

        <div className="ledger-section-head">
          <h2>Cardinal Sins</h2>
          <div className="ls-rule" aria-hidden="true" />
          <div className="ls-count">levels &amp; effects</div>
        </div>
        <div className="ledger-sins">
          {SINS.map((key) => (
            <SinLedgerCard key={key} sinKey={key} state={state} />
          ))}
        </div>

        <div className="ledger-section-head">
          <h2>Bound Sigils</h2>
          <div className="ls-rule" aria-hidden="true" />
          <div className="ls-count">effects only</div>
        </div>
        {boundSigils.length === 0 ? (
          <p className="ledger-sigils-empty">
            No seals burn yet. Bind souls to the Goetia and their effects will surface here.
          </p>
        ) : (
          <div className="ledger-sigils">
            {boundSigils.map((g) => (
              <div className="ledger-sigil" key={g.id}>
                <span className="ls-effect">
                  {g.text}
                  {g.dir && <span className="ls-dir"> {g.dir}</span>}
                </span>
                <span className="ls-bound">
                  <b>{formatBigNum(g.bound)}</b> souls
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="ledger-sigils-note">
          A sigil shows here only once enough souls are bound for it to bite.
        </p>
      </div>
    </div>
  );
}

// ── Persistent HUD (soul pool) + the hell-floor crawl/rise band ──────────────────────────────────
function Hud({ souls }: { souls: BigNum }): ReactElement {
  return (
    <div className="kat-hud">
      <div className="soul-meter">
        <span className="lbl">Souls</span>
        <span className="val">{formatBigNum(souls)}</span>
      </div>
    </div>
  );
}

function HellFloor({
  onGoetia,
  onPrinces,
  onRise,
  screen,
  riseArmed,
}: {
  onGoetia: () => void;
  onPrinces: () => void;
  onRise: () => void;
  screen: 'statues' | 'sigils';
  riseArmed: boolean;
}): ReactElement {
  if (screen === 'sigils') {
    return (
      <button type="button" className="floor floor--single" onClick={onPrinces}>
        <span className="floor-lead">Crawl back</span>
        <span className="floor-sub">
          <span className="claw up">{'\u25B4'}</span> up to the Princes in the lightning
        </span>
      </button>
    );
  }
  return (
    <div className="floor floor--split">
      <button type="button" className="floor-half floor-crawl" onClick={onGoetia}>
        <span className="floor-lead">Crawl back</span>
        <span className="floor-sub">
          <span className="claw down">{'\u25BE'}</span> down to the seals of the Goetia
        </span>
      </button>
      <button
        type="button"
        className={`floor-half floor-rise${riseArmed ? ' is-armed' : ''}`}
        onClick={onRise}
      >
        <span className="floor-lead">{riseArmed ? 'Let go your grip' : 'Fall upwards'}</span>
        <span className="floor-sub">
          <span className="claw up">{'\u25B4'}</span>{' '}
          {riseArmed
            ? 'press again \u2014 rise from Katabasis'
            : 'rise from Katabasis, back to the world'}
        </span>
      </button>
    </div>
  );
}

type Screen = 'altar' | 'ledger' | 'descending' | 'statues' | 'sigils' | 'ascending';

/**
 * Katabasis — the cinematic demonic descent (02 §6/§10), rebuilt from the Claude Design handoff and
 * wired to the real live model. The internal screen (`altar → descending → statues ⇄ sigils →
 * ascending`) is local; offering pours Devotion through the store immediately, binding moves souls to
 * the seals (recoverable until you rise), and the ascent transition commits the lifetime via
 * `confirmKatabasis`. Rendered for the `menu` phase; the recap + Eternal-Sin reveal are their own views.
 */
export function Katabasis(): ReactElement {
  const state = useGameStore((s) => s.state);
  const confirm = useGameStore((s) => s.confirmKatabasis);
  const begin = useGameStore((s) => s.beginKatabasis);
  const close = useGameStore((s) => s.closeKatabasis);

  const [screen, setScreen] = useState<Screen>('altar');
  const [caption, setCaption] = useState(false);
  const [riseArmed, setRiseArmed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Ambient score — plays the whole time you are down in Katabasis, gentle fade in/out.
  const inKatabasis =
    screen === 'descending' ||
    screen === 'statues' ||
    screen === 'sigils' ||
    screen === 'ascending';
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!a.src) {
      a.src = AMBIENT_SRC;
      a.onerror = () => {};
    }
    const target = inKatabasis ? 0.4 : 0;
    if (target > 0) {
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    }
    let raf = 0;
    const ramp = (): void => {
      const d = target - a.volume;
      if (Math.abs(d) < 0.03) {
        a.volume = target;
        if (target === 0) a.pause();
        return;
      }
      a.volume = Math.max(0, Math.min(1, a.volume + (d > 0 ? 0.035 : -0.05)));
      raf = requestAnimationFrame(ramp);
    };
    ramp();
    return () => cancelAnimationFrame(raf);
  }, [inKatabasis]);

  // Auto-disarm the rise after the two-press window.
  useEffect(() => {
    if (!riseArmed) return;
    const t = setTimeout(() => setRiseArmed(false), 4000);
    return () => clearTimeout(t);
  }, [riseArmed]);

  if (!state) return <div className="katabasis-flow" />;

  const ended = eternalSinVisible(state);

  const arrive = (): void => {
    setScreen('statues');
    setCaption(true);
    setTimeout(() => setCaption(false), 5200);
  };
  const crawlToGoetia = (): void => {
    setRiseArmed(false);
    setScreen('sigils');
  };
  const crawlToPrinces = (): void => {
    setRiseArmed(false);
    setScreen('statues');
  };
  const armOrRise = (): void => {
    if (riseArmed) {
      setRiseArmed(false);
      setScreen('ascending');
    } else {
      setRiseArmed(true);
    }
  };

  const inHell = screen === 'statues' || screen === 'sigils';

  return (
    <div className="katabasis-flow" role="dialog" aria-label={strings.katabasis.title}>
      <audio ref={audioRef} loop preload="auto" aria-hidden="true" />

      {/* Backdrop degrade filter (Option B): block pixelation + posterise + tone crush. The R/G/B
          transfer curves are IDENTICAL, so it changes resolution + contrast only and never shifts
          hue — i.e. the full room treatment minus the red palette tint. Referenced from menus.css
          as `filter: url(#kat-degrade)` on the scene backdrop layers. The 3px cell ≈ the rooms'
          block:3; raise the feComposite/feMorphology sizes together for chunkier pixels. */}
      <svg className="kat-degrade-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <filter
          id="kat-degrade"
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feFlood x="1" y="1" width="1" height="1" floodColor="#fff" floodOpacity="1" />
          <feComposite width="3" height="3" />
          <feTile result="cellGrid" />
          <feComposite in="SourceGraphic" in2="cellGrid" operator="in" />
          <feMorphology operator="dilate" radius="1.5" />
          <feComponentTransfer>
            <feFuncR type="discrete" tableValues="0 0.13 0.27 0.42 0.58 0.75 1" />
            <feFuncG type="discrete" tableValues="0 0.13 0.27 0.42 0.58 0.75 1" />
            <feFuncB type="discrete" tableValues="0 0.13 0.27 0.42 0.58 0.75 1" />
          </feComponentTransfer>
        </filter>
      </svg>

      {screen === 'altar' && (
        <AltarGate
          onDescend={() => {
            begin(); // commit: tear down the lifetime + freeze, then fall
            setScreen('descending');
          }}
          onTurnAway={() => close()}
          onStatusQuo={() => setScreen('ledger')}
        />
      )}
      {screen === 'ledger' && <Ledger state={state} onBack={() => setScreen('altar')} />}
      {screen === 'descending' && <Transition kind="descending" onDone={arrive} />}
      {screen === 'ascending' && <Transition kind="ascending" onDone={() => confirm()} />}

      {screen === 'statues' && (
        <StatuesPlace
          state={state}
          ended={ended}
          showCaption={caption}
          onModalChange={setModalOpen}
        />
      )}
      {screen === 'sigils' && <SigilsPlace state={state} />}

      {inHell && <Hud souls={state.souls} />}
      {inHell && !modalOpen && (
        <HellFloor
          screen={screen}
          riseArmed={riseArmed}
          onGoetia={crawlToGoetia}
          onPrinces={crawlToPrinces}
          onRise={armOrRise}
        />
      )}
    </div>
  );
}
