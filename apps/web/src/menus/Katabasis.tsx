import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import { strings } from '@panvitium/shared';
import {
  SINS,
  sinLevel,
  skillIntensity,
  devotionForLevel,
  MAX_SIN_LEVEL,
  GULA_NEGATIVE_TIER_REDUCTION_PER_LEVEL,
  LUXURIA_LOGOS_EFF_PER_LEVEL,
  REMAINING_GOLD_PER_AVARITIA_LEVEL,
  REMAINING_REPROBATE_PER_TRISTITIA_LEVEL,
  REMAINING_MALEFICIA_PER_SUPERBIA_LEVEL,
  sigilById,
  sigilVisible,
  totalBound,
  remainingGoldFraction,
  remainingReprobateFraction,
  remainingMaleficiaChance,
  sigilKatabasisBonus,
  sigilStrengthMul,
  sigilEffectMulFor,
  eternalSinVisible,
  eternalSinRevealed,
  eternalProgress,
  gameRuntimeMs,
  floor,
  isZero,
  gt,
  type BigNum,
  type Sin,
  type GameState,
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';
import { AetherSigils, effectDisplay, toRoman } from './AetherSigils.js';
import { boonLabel, useHoldPour } from './katabasisShared.js';
import { RedCloud } from './RedCloud.js';
import { ALTAR_SIGIL_SRC } from './AltarSigil.js';
import { playExstinctio, prefersReducedMotion } from './exstinctio.js';
import { snapshotRoom, type RoomSnapshot, type StageRect } from './roomSnapshot.js';
import { KATABASIS_MUSIC_VOLUME, useAmbientScore } from './katabasisMusic.js';

// Runtime art for the descent — served by Vite from apps/web/public. The four lightning frames and
// the two carved-slab layers are placed here on apply (they live at the repo root + the design zip).
const ASSET = '/assets/panvitium/katabasis';
const LIGHTNING_INTENSITY = 8; // 0..10; production value — a strike roughly every ~0.3–1.5s.

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

// ── Geometry: statue hotspots over the painted frame (fractions) ─────────────
// The end-state obelisk is a CSS column (`.obelisk`): it runs from the top down to the hell floor.
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

// ── Imperative lightning: sharp strikes that flash the bright frames, then snap to dark ──────────
function Lightning({ intensity }: { intensity: number }): ReactElement {
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);
  const cRef = useRef<HTMLDivElement>(null);
  const wRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef(-1);

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
      strike();
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

// ── The Prince's inscription ("Katabasis statue text" handoff, direction A1 · Carved) ────────────
// Clicking a statue raises no menu: the dark closes in around that Prince, so the storm's strikes
// light only him and what stands near him, and his words are cut into the dark beside him, on
// whichever side of him has the room. The statue itself is the pour: once his words are up,
// pressing and holding him pours Devotion through the hold ramp.

/** The gap between a statue's hotspot edge and its inscription, as a fraction of the scene width. */
const INSCRIPTION_GAP = 0.03;

/** Cut as Roman capitals: upper case, with V for U (Beelzebub → BEELZEBVB, Gula → GVLA). */
export function inscribe(text: string): string {
  return text.toUpperCase().replace(/U/g, 'V');
}

/** An inscription's epithet line: upper case, its words parted by interpuncts. */
export function interpunct(text: string): string {
  return text.toUpperCase().split(/\s+/).join(' · ');
}

/** The side of its statue a Prince's inscription is cut on: the side with more of the scene. */
export function inscriptionSide(sin: Sin): 'left' | 'right' {
  return STATUE_POS[sin].x < 0.5 ? 'right' : 'left';
}

/**
 * The darkness's falloff: clear over the statue, then closing in through several steps so the black
 * arrives by degrees rather than at an edge (a strike still reaches, faintly, the Princes beside
 * him), and whole beyond.
 */
const PRINCE_DARKNESS_FALLOFF = [
  'transparent 36%',
  'rgba(0, 0, 0, 0.15) 47%',
  'rgba(0, 0, 0, 0.38) 58%',
  'rgba(0, 0, 0, 0.6) 69%',
  'rgba(0, 0, 0, 0.78) 80%',
  'rgba(0, 0, 0, 0.92) 91%',
  '#000 100%',
].join(', ');

/**
 * The darkness that closes in around the chosen Prince, laid over the storm: an ellipse around his
 * statue, wider and taller than his hotspot, clear for its inner 36% and black past its edge. A
 * strike lights the scene beneath it, so only the clear ground near him flashes.
 */
export function princeDarkness(sin: Sin): string {
  const p = STATUE_POS[sin];
  const rx = Math.max(p.w * 1.5, 0.14);
  const ry = p.h * 0.78;
  // Rounded to 0.01% so the inline style reads clean (0.62 - 0.04 is 57.99999999999999% raw).
  const at = (v: number): string => `${Number((v * 100).toFixed(2))}%`;
  return `radial-gradient(ellipse ${at(rx)} ${at(ry)} at ${at(p.x)} ${at(p.y - 0.04)}, ${PRINCE_DARKNESS_FALLOFF})`;
}

/** Carved text for the eye, with the plain words kept for a screen reader. */
function Carved({ cut, plain }: { cut: string; plain: string }): ReactElement {
  return (
    <>
      <span aria-hidden="true">{cut}</span>
      <span className="ins-sr">{plain}</span>
    </>
  );
}

/** Each line is cut in left to right, one after another (40 ms apart). */
const cutDelay = (i: number): CSSProperties => ({ animationDelay: `${i * 40}ms` });

function PrinceInscription({
  sin,
  state,
  pouring,
}: {
  sin: Sin;
  state: GameState;
  pouring: boolean;
}): ReactElement {
  const info = strings.sins[sin];
  const devotion = state.devotion[sin];
  const level = sinLevel(devotion);
  const maxed = level >= MAX_SIN_LEVEL;
  const intensity = skillIntensity(devotion);
  const p = STATUE_POS[sin];
  const side = inscriptionSide(sin);
  const place: CSSProperties =
    side === 'right'
      ? { left: pct(p.x + p.w / 2 + INSCRIPTION_GAP) }
      : { right: pct(1 - (p.x - p.w / 2) + INSCRIPTION_GAP) };
  const devotionFigure = (
    <span className={`ins-dev${pouring ? ' is-pour' : ''}`}>{formatBigNum(devotion)}</span>
  );

  return (
    <div className={`inscription inscription--${side}`} style={place} data-sin={sin}>
      <div className="ins-line ins-epithet" style={cutDelay(0)}>
        <Carved cut={interpunct(info.epithet)} plain={info.epithet} />
      </div>
      <div className="ins-line ins-name" style={cutDelay(1)}>
        <Carved cut={inscribe(info.prince)} plain={info.prince} />
      </div>
      <div className="ins-line ins-sin" style={cutDelay(2)}>
        <Carved cut={inscribe(info.latin)} plain={info.latin} />
      </div>
      <div className="ins-line ins-rank" style={cutDelay(3)}>
        <Pips level={level} max={MAX_SIN_LEVEL} />
        <span className="ins-rankword">
          {maxed ? 'Mastered' : `Rank ${toRoman(level) || '0'} of ${toRoman(MAX_SIN_LEVEL)}`}
        </span>
      </div>

      <div className="ins-line ins-divider" style={cutDelay(4)} aria-hidden="true">
        <span>{'◆'}</span>
      </div>

      <div className="ins-line ins-lore" style={cutDelay(5)}>
        <div className="ins-head">
          <span className="ins-skill">{info.skill}</span>
          <span className="ins-dot" aria-hidden="true">
            {' · '}
          </span>
          <span className="ins-intensity">
            intensity <span className="v">{intensity.toFixed(2)}</span>
          </span>
        </div>
        <div className="ins-body">{info.skillEffect}</div>
      </div>
      <div className="ins-line ins-lore" style={cutDelay(6)}>
        <div className="ins-head ins-skill">Per rank</div>
        <div className="ins-body ins-body--dim">{info.levelEffect}</div>
      </div>

      <div
        className="ins-line ins-divider ins-divider--last"
        style={cutDelay(7)}
        aria-hidden="true"
      >
        <span>{'◆'}</span>
      </div>

      {maxed ? (
        <>
          <div className="ins-line ins-devotion" style={cutDelay(8)}>
            {devotionFigure}
            <span className="ins-toward">Devotion paid</span>
          </div>
          <div className="ins-line ins-sated" style={cutDelay(9)}>
            It is sated. The rank is yours, and cannot be unmade.
          </div>
        </>
      ) : (
        <div className="ins-line ins-devotion" style={cutDelay(8)}>
          {devotionFigure}
          <span className="ins-toward">
            of {formatBigNum(devotionForLevel(level + 1))} Devotion toward Rank {toRoman(level + 1)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── The Eternal: the obelisk at the Court's centre (end-state only) ──────────────────────────────
// Once all eight Princes are mastered the ended scene IS the feeding screen (Claude Design "Red
// Cloud"): no modal, meter, title or verb. Holding the obelisk pours souls through the same ramp as
// the HoldButton, and the cloud thinning is the only response. Pouring does nothing on an empty pool.
function EternalHold({ state }: { state: GameState }): ReactElement {
  const offerEternal = useGameStore((s) => s.offerEternal);
  const { begin, stop } = useHoldPour((d) => offerEternal(d), poolEmpty(state));
  return (
    <button
      type="button"
      className="obelisk"
      onPointerDown={begin}
      onPointerLeave={stop}
      aria-label="Offer souls"
    />
  );
}

/**
 * The Ninth named (Semet, Peccatum Æternum, the runtime), raised over the cleared Court a beat
 * after the pour that crossed the threshold. It has one way out: Accept rises at once (Anabasis).
 */
function SemetScreen({
  state,
  onAccept,
}: {
  state: GameState;
  onAccept: () => void;
}): ReactElement {
  return (
    <div
      className="takeover takeover--eternal takeover--semet"
      role="dialog"
      aria-label={strings.eternal.name}
    >
      <div className="takeover-body takeover-body--solo">
        <div className="tk-info-col">
          <h1 className="reveal-name">{strings.eternal.name}</h1>
          <div className="reveal-subtitle">{`Peccatum \u00C6ternum`}</div>
          <div className="reveal-time">
            <span className="reveal-time-label">{strings.eternal.runtimeLabel}</span>
            <span className="reveal-time-value">{formatDuration(gameRuntimeMs(state))}</span>
          </div>
          <button type="button" className="reveal-accept" onClick={onAccept}>
            {strings.eternal.accept}
          </button>
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
  onAccept,
}: {
  state: GameState;
  ended: boolean;
  showCaption: boolean;
  onAccept: () => void;
}): ReactElement {
  const offer = useGameStore((s) => s.offer);
  // The Prince whose words are up. Once all eight are mastered no statue stands to be chosen.
  const [sel, setSel] = useState<Sin | null>(null);
  const chosen = ended ? null : sel;
  const chosenMaxed = chosen !== null && sinLevel(state.devotion[chosen]) >= MAX_SIN_LEVEL;
  // Holding the chosen statue pours into his Sin through the hold ramp (a tap pours a little). A
  // mastered Prince takes nothing more, and an empty pool gives nothing.
  const { holding, begin, stop } = useHoldPour(
    (d) => {
      if (chosen !== null) offer(chosen, d);
    },
    chosen === null || chosenMaxed || poolEmpty(state),
  );
  const turnAway = (): void => {
    stop();
    setSel(null);
  };
  // Escape turns away, as a click anywhere off the statue does.
  useEffect(() => {
    if (chosen === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      stop();
      setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chosen, stop]);
  const named = ended && eternalSinRevealed(state);
  // The cloud's density: solid on arrival, thinning along the Eternal's log curve, clear at the name.
  const density = Math.min(1, Math.max(0, 1 - eternalProgress(state)));

  return (
    <div className={`scene hell${ended ? ' hell--ended' : ''}`}>
      {ended ? (
        <>
          {/* The Court comes into focus as the cloud thins: its blur falls from 9px to none. */}
          <div
            className="bg-end"
            style={{
              backgroundImage: `url(${ASSET}/katabasis_end.png)`,
              filter: `url(#kat-degrade) blur(${(density * 9).toFixed(2)}px)`,
            }}
          />
          <RedCloud density={density} />
        </>
      ) : (
        <>
          <div
            className="bg-silhouette"
            style={{ backgroundImage: `url(${ASSET}/katabasis3.png)` }}
          />
          {/* The storm rages on while a Prince speaks, but the dark closing in around him lets
              its strikes light only the ground near him. */}
          <Lightning intensity={LIGHTNING_INTENSITY} />
          {chosen !== null && (
            <div
              key={chosen}
              className="kat-darkness"
              style={{ backgroundImage: princeDarkness(chosen) }}
            />
          )}
        </>
      )}

      <div className="kat-degrade-chrome" aria-hidden="true" />

      {/* The ended scene carries no title: the painting and the cloud are the whole of it. */}
      {showCaption && !ended && chosen === null && (
        <div className="hell-caption">
          <div className="t">The Court of Spires</div>
          <div className="s">Bow before the Princes.</div>
        </div>
      )}

      <div className="statue-field">
        {/* Behind the statues: a click anywhere off the chosen Prince turns away from him. */}
        {chosen !== null && (
          <button type="button" className="statue-away" aria-label="Turn away" onClick={turnAway} />
        )}
        {/* Once all eight are mastered the Princes are only the painting: no statue opens. */}
        {!ended &&
          SINS.map((sin) => {
            const p = STATUE_POS[sin];
            const lvl = sinLevel(state.devotion[sin]);
            const info = strings.sins[sin];
            const isChosen = sin === chosen;
            const style: CSSProperties = {
              left: pct(p.x),
              top: pct(p.y),
              width: pct(p.w),
              height: pct(p.h),
            };
            return (
              <button
                key={sin}
                type="button"
                className={`statue${lvl >= MAX_SIN_LEVEL ? ' statue--maxed' : ''}${isChosen ? ' statue--chosen' : ''}`}
                style={style}
                onClick={() => setSel(sin)}
                onPointerDown={() => {
                  if (isChosen) begin();
                }}
                onPointerLeave={() => {
                  if (isChosen) stop();
                }}
                aria-label={`${info.prince} \u2014 ${info.english}`}
                aria-pressed={isChosen}
              >
                {!isChosen && (
                  <span className="statue-tag">
                    {info.prince}
                    <span className="pip">
                      <Pips level={lvl} max={MAX_SIN_LEVEL} />
                    </span>
                  </span>
                )}
              </button>
            );
          })}

        {ended && !named && <EternalHold state={state} />}
      </div>

      {chosen !== null && (
        <PrinceInscription key={chosen} sin={chosen} state={state} pouring={holding} />
      )}
      {named && <SemetScreen state={state} onAccept={onAccept} />}
    </div>
  );
}

// ── The descent / ascent interstitial (Exstinctio, "Katabasis Transitions" round 2) ─────────────
/** How long each interstitial holds, both directions ("Katabasis transitions" handoff). */
export const TRANSIT_HOLD_MS = 5000;

/**
 * Exstinctio: Katabasis on the way down, Anabasis on the way up, each with its Latin line beneath.
 * On the way down the room the player stands in (read back from the pass by `snapshotRoom`) loses
 * its light in the order of its weakness, the armed seal goes out over it in three steps, the last
 * candles fall out of the frame as embers, and the word gathers the light the room loses. On the way
 * up embers rise into the candles and the light spreads back, brightest first, while the word gives
 * its light back; the type then lifts off the lit room. The frames are drawn by `exstinctio.ts`
 * into a canvas laid exactly over the room's stage. After the first-descent cinematic (which has
 * already shown the soul leave the body) the descent opens on the void instead: only the type.
 *
 * Neither can be skipped: no click, button or key ends it early; it holds for exactly
 * `TRANSIT_HOLD_MS`. Under reduced motion it holds one still frame.
 */
function Transition({
  kind,
  onDone,
}: {
  kind: 'descending' | 'ascending';
  onDone: () => void;
}): ReactElement {
  const down = kind === 'descending';
  const dir = down ? 'down' : 'up';
  // Read once, at mount: the transit is a fixed 5 s piece.
  const [fromVoid] = useState(() => down && useGameStore.getState().firstDescentPlaying);
  const [still] = useState(prefersReducedMotion);
  // With no way to skip, the timer is the only exit: a re-render handing in a fresh `onDone` must
  // not restart it, so it is armed once per mount and reads the latest callback through a ref.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const t = setTimeout(() => done.current(), TRANSIT_HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  // Read the room back before the browser paints and before the pass draws its next frame, so the
  // first frame is the room as it stood (the seal's glow still in it) and lies exactly over it.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapRef = useRef<RoomSnapshot | null | undefined>(undefined);
  const [rect, setRect] = useState<StageRect | null>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Read once per mount: React's development double-run of effects would otherwise read it again
    // after the room has repainted without the seal's glow.
    if (snapRef.current === undefined) snapRef.current = snapshotRoom();
    const snap = snapRef.current;
    if (!snap) return;
    setRect(snap.rect);
    // Going down, the player reads the room once more after the pass has repainted it without the
    // seal's light, and runs the extinction on that.
    return playExstinctio(
      canvas,
      snap.image,
      dir,
      still,
      down ? () => snapshotRoom()?.image ?? null : undefined,
    );
  }, [dir, down, still]);

  const frameStyle: CSSProperties | null = rect
    ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, transform: 'none' }
    : null;
  return (
    <div className="scene transit transit--exstinctio" data-dir={dir}>
      <div className="exst-frame" {...(frameStyle ? { style: frameStyle } : {})}>
        {!fromVoid && <canvas ref={canvasRef} className="exst-canvas" aria-hidden="true" />}
        <div className="exst-scan" aria-hidden="true" />
        <div className="exst-vignette" aria-hidden="true" />
        {down && !fromVoid && (
          // The armed seal the player just pressed, crisp chrome over the room as it was; it goes
          // out in three steps as the room's light begins to die.
          <div className="exst-seal" aria-hidden="true">
            <div className="altar-sigil-wrap">
              <span className="altar-sigil-btn is-armed">
                <span className="altar-sigil-scale">
                  <img
                    className="altar-sigil-glyph"
                    src={ALTAR_SIGIL_SRC}
                    alt=""
                    draggable={false}
                  />
                </span>
              </span>
            </div>
          </div>
        )}
        {!down && <div className="exst-scrim" aria-hidden="true" />}
        <div className="transit-stack">
          <div className="transit-word">{down ? 'Katabasis' : 'Anabasis'}</div>
          <div className="transit-rule" aria-hidden="true" />
          <div className="transit-sub">{down ? 'exspes in ima' : 'Auctus ex imis'}</div>
        </div>
      </div>
    </div>
  );
}

// The seal's art in the public asset tree \u2014 seal number `id` (1..72) \u2192 `sigils/NN.png` (zero-padded),
// the same scheme the Aether vault projects. Used by the Ledger to set a small glyph beside each name.
const sealSrc = (id: number): string => `${ASSET}/sigils/${String(id).padStart(2, '0')}.png`;

// Vanagloria's influence-rate lift per level mirrors the literal in the modifier engine
// (`1.33 ** vanagloriaLvl`, modifiers.ts). Kept local so the ledger reads the same factor.
const VANAGLORIA_INFLUENCE_PER_LEVEL = 1.33;

// The live numeric magnitude of a Sin's per-rank (Level) effect, in its natural unit, matching the
// sim exactly. Returns '' while the rank contributes nothing (Rank 0).
// Units differ by Sin: the multiplicative efficiency ladders read '×N', the descent carry-over
// fractions read the rank's marginal '+X%', Gula strips the negative tiers ('−X%'), Acedia
// doubles the Desidia cap each rank ('×N' the base, ADR-033), and Ira counts the acolytes its
// ranks grant ('+N', one per rank: `maxAcolytes`, ADR-042).
function sinLevelEffectValue(sin: Sin, level: number): string {
  if (level <= 0) return '';
  switch (sin) {
    case 'gula':
      return `−${Math.round(Math.min(1, GULA_NEGATIVE_TIER_REDUCTION_PER_LEVEL * level) * 100)}%`;
    case 'luxuria':
      return `×${LUXURIA_LOGOS_EFF_PER_LEVEL ** level}`;
    case 'ira':
      return `+${level}`;
    case 'vanagloria':
      return `×${(VANAGLORIA_INFLUENCE_PER_LEVEL ** level).toFixed(2)}`;
    case 'avaritia':
      return `+${(REMAINING_GOLD_PER_AVARITIA_LEVEL * level * 100).toFixed(1)}%`;
    case 'tristitia':
      return `+${(REMAINING_REPROBATE_PER_TRISTITIA_LEVEL * level * 100).toFixed(1)}%`;
    case 'superbia':
      return `+${(REMAINING_MALEFICIA_PER_SUPERBIA_LEVEL * level * 100).toFixed(1)}%`;
    case 'acedia':
      return `×${2 ** level}`; // Desidia cap doubles per rank (ADR-033)
  }
}

// One Cardinal Sin's row in the Ledger: Latin/English name, rank pips, Prince + souls devoted, and
// the two effect lines (the always-on Skill, and the per-rank Level effect) — each carries its live
// magnitude (the Skill's +X% intensity bonus, the rank's natural-unit value) beside the nominal
// effect. Dormant (Rank 0) sins dim their level row, matching the handoff.
function SinLedgerCard({ sinKey, state }: { sinKey: Sin; state: GameState }): ReactElement {
  const info = strings.sins[sinKey];
  const devotion = state.devotion[sinKey];
  const level = sinLevel(devotion);
  const dormant = level === 0;
  // Souls still needed to reach the next Level (null once the Sin is mastered at the cap).
  const soulsToNext =
    level >= MAX_SIN_LEVEL ? null : devotionForLevel(level + 1).sub(floor(devotion));
  // Every Sin skill couples as ×(1 + intensity) in the engine, so its live magnitude is +intensity%.
  const skillValue = `+${(skillIntensity(devotion) * 100).toFixed(1)}%`;
  const levelValue = sinLevelEffectValue(sinKey, level);
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
        <span className="ls-devoted">{formatBigNum(devotion)} devoted souls</span>
        {soulsToNext !== null && (
          <span className="ls-tonext">
            {' '}
            <span aria-hidden="true">&middot;</span> {formatBigNum(soulsToNext)} to next level
          </span>
        )}
      </div>
      <div className="ledger-sin-effects">
        <div className="ledger-eff">
          <span className="ls-tag">Skill</span>
          <span className="ls-txt">
            <span className="ls-skill">{info.skill}</span>: {info.skillEffect}{' '}
            <b className="ls-now">{skillValue}</b>
          </span>
        </div>
        <div className="ledger-eff is-lvl">
          <span className="ls-tag is-lvl">Level {toRoman(level) || '0'}</span>
          <span className="ls-txt">
            {info.levelEffect}
            {levelValue && (
              <>
                {' '}
                <b className="ls-now">{levelValue}</b>
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The Ledger ("Status Quo") — the player's current standing, reached from STATUS QUO beneath the
 * in-room altar sigil (pre-commit: the lifetime keeps ticking). Read-only:
 * each Cardinal Sin's rank + skill/level effects, then every BOUND sigil's effect (effects only — no
 * seal names, no art, per the design). All wired to live state: Sin levels via `sinLevel`, the
 * eight Princes' lore from `strings.sins`, bound sigils from `state.sigilBindings` (visible + souls
 * bound), and a derived summary. Sealed sigils (Semet, until every Sin is Rank ≥ 2) never surface.
 */
function Ledger({ state, onBack }: { state: GameState; onBack: () => void }): ReactElement {
  // Total Sin Level = the sum of every Cardinal Sin's rank.
  const totalSinLevel = useMemo(
    () => SINS.reduce((acc, key) => acc + sinLevel(state.devotion[key]), 0),
    [state.devotion],
  );
  // Total Souls bound = every soul currently bound across all sigils.
  const totalSoulsBound = useMemo(() => totalBound(state), [state]);

  // What a descent right now would KEEP — the three carry-over fractions the commit rolls against,
  // inclusive of the Avaritia/Tristitia/Superbia levels AND the bound carry-over sigils (Purson,
  // Camio, Cimejes; scaled by the relics and Semet). Same inputs `commitKatabasis` uses, so the Ledger
  // previews the real stakes: the altar sigil shows nothing, but here the player sees exactly how
  // much survives the plunge.
  const carryover = useMemo(() => {
    const mul = sigilStrengthMul(state);
    return {
      gold: remainingGoldFraction(state, sigilKatabasisBonus(state, 'gold', mul)),
      reprobates: remainingReprobateFraction(state, sigilKatabasisBonus(state, 'reprobate', mul)),
      maleficia: remainingMaleficiaChance(state, sigilKatabasisBonus(state, 'maleficia', mul)),
    };
  }, [state]);
  const asPct = (f: number): string => `${(f * 100).toFixed(1)}%`;

  // Bound sigils — name + current effect, sorted most-bound first. A seal appears only once it has
  // souls bound and is visible (Semet stays sealed until the gate opens). The effect text comes from
  // the authoritative `strings.sigils.descriptions` (its ↑/↓ direction arrows kept, the live
  // magnitude shown beside them); the souls-bound count is the binding itself.
  const boundSigils = useMemo(() => {
    const rows: Array<{
      id: number;
      name: string;
      effect: string;
      text: string;
      bound: BigNum;
    }> = [];
    for (let id = 1; id <= 72; id++) {
      const v = state.sigilBindings[id];
      if (v === undefined || isZero(v)) continue;
      const def = sigilById(id);
      if (def && !sigilVisible(state, def)) continue;
      const text = boonLabel(strings.sigils.descriptions[id] ?? 'A seal of the lesser key.');
      const name = strings.sigils.names[id] ?? def?.name ?? `Seal ${id}`;
      const effect = effectDisplay(def, v, def ? sigilEffectMulFor(state, def) : 1);
      rows.push({ id, name, effect, text, bound: v });
    }
    rows.sort((a, b) => (gt(b.bound, a.bound) ? 1 : gt(a.bound, b.bound) ? -1 : a.id - b.id));
    return rows;
  }, [state]);

  // Unbound sigils — every visible seal with no souls allocated, shown by seal number. Only the effect
  // *text* surfaces here: the live magnitude and the souls-bound count are both 0 by definition, so
  // showing them would be noise. Sealed seals (Semet, until the gate opens) stay hidden as elsewhere.
  const unboundSigils = useMemo(() => {
    const rows: Array<{ id: number; name: string; text: string }> = [];
    for (let id = 1; id <= 72; id++) {
      const v = state.sigilBindings[id];
      if (v !== undefined && !isZero(v)) continue;
      const def = sigilById(id);
      if (def && !sigilVisible(state, def)) continue;
      const text = boonLabel(strings.sigils.descriptions[id] ?? 'A seal of the lesser key.');
      const name = strings.sigils.names[id] ?? def?.name ?? `Seal ${id}`;
      rows.push({ id, name, text });
    }
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
            The disgrace Cardinal Sins now exert, and the effects of every sigil by bound souls.
          </p>
        </div>

        {/* The Souls total — the run's headline resource, given its own big red KPI above the six
            standing readouts (moved here from the PC's Analytics program). */}
        <div className="ledger-souls">
          <div className="ledger-souls-num">{formatBigNum(state.souls)}</div>
          <div className="ledger-souls-lab">{strings.resources.souls}</div>
        </div>

        <div className="ledger-summary">
          <div className="ls-stat">
            <div className="ls-num">{totalSinLevel}</div>
            <div className="ls-lab">Total Sin Level</div>
          </div>
          <div className="ls-stat">
            <div className="ls-num">{boundSigils.length}</div>
            <div className="ls-lab">sigils bound</div>
          </div>
          <div className="ls-stat">
            <div className="ls-num">{formatBigNum(totalSoulsBound)}</div>
            <div className="ls-lab">sigil-bound souls</div>
          </div>
        </div>

        {/* What a descent right now would carry back — the three commit-side carry-over rolls, so the
            player knows the stakes before pressing the seal. */}
        <div className="ledger-summary ledger-summary--carryover">
          <div className="ls-stat">
            <div className="ls-num ember">{asPct(carryover.gold)}</div>
            <div className="ls-lab">gold kept on descent</div>
          </div>
          <div className="ls-stat">
            <div className="ls-num ember">{asPct(carryover.reprobates)}</div>
            <div className="ls-lab">reprobates kept</div>
          </div>
          <div className="ls-stat">
            <div className="ls-num ember">{asPct(carryover.maleficia)}</div>
            <div className="ls-lab">maleficia kept (each)</div>
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
        </div>
        {boundSigils.length === 0 ? (
          <p className="ledger-sigils-empty">No seals burn yet.</p>
        ) : (
          <div className="ledger-sigils">
            {boundSigils.map((g) => (
              <div className="ledger-sigil" key={g.id}>
                <span className="ls-seal">
                  <img className="ls-seal-img" src={sealSrc(g.id)} alt="" aria-hidden="true" />
                  <span className="ls-roman">{toRoman(g.id)}</span>
                </span>
                <span className="ls-name">{g.name}</span>
                <span className="ls-effect">
                  {g.text} <b className="ls-now">{g.effect}</b>
                </span>
                <span className="ls-bound">
                  <b>{formatBigNum(g.bound)}</b> souls bound
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="ledger-section-head">
          <h2>Unbound Sigils</h2>
          <div className="ls-rule" aria-hidden="true" />
          <div className="ls-count">no souls allocated</div>
        </div>
        {unboundSigils.length === 0 ? (
          <p className="ledger-sigils-empty">
            Every seal within reach already burns. Nothing waits unbound.
          </p>
        ) : (
          <div className="ledger-sigils">
            {unboundSigils.map((g) => (
              <div className="ledger-sigil is-unbound" key={g.id}>
                <span className="ls-seal">
                  <img className="ls-seal-img" src={sealSrc(g.id)} alt="" aria-hidden="true" />
                  <span className="ls-roman">{toRoman(g.id)}</span>
                </span>
                <span className="ls-name">{g.name}</span>
                <span className="ls-effect">{g.text}</span>
              </div>
            ))}
          </div>
        )}
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
          <span className="claw up">{'\u25B4'}</span> to the Princes
        </span>
      </button>
    );
  }
  return (
    <div className="floor floor--split">
      <button type="button" className="floor-half floor-crawl" onClick={onGoetia}>
        <span className="floor-lead">Crawl back</span>
        <span className="floor-sub">
          <span className="claw down">{'\u25BE'}</span> to the sealed Demons
        </span>
      </button>
      {/* Armed by the first press, the rise keeps its words: only its glow and pulse change. */}
      <button
        type="button"
        className={`floor-half floor-rise${riseArmed ? ' is-armed' : ''}`}
        onClick={onRise}
      >
        <span className="floor-lead">Fall upwards</span>
        <span className="floor-sub">
          <span className="claw up">{'\u25B4'}</span> Anabasis
        </span>
      </button>
    </div>
  );
}

type Screen = 'ledger' | 'descending' | 'statues' | 'sigils' | 'ascending';

/** A descent reopened from a save lands among the Princes with no transit: the score rises over this. */
export const SCORE_RESUME_MS = 1500;

/**
 * The ambient score's course on each screen: the volume it heads for and how long it takes to get
 * there. It rises across the whole descent transit, from silence at the commit, and is full the
 * moment the Princes appear; it falls across the whole Anabasis, from full at the rise, and is gone
 * the moment the room returns (the flow closes and the score stops with it). A descent reopened
 * from a save (`openedOn` the Princes) has no transit, so the score rises there over
 * `SCORE_RESUME_MS`. The Ledger (pre-commit) is silent.
 */
function scoreCourse(screen: Screen, openedOn: Screen): { target: number; ms: number } {
  switch (screen) {
    case 'descending':
      return { target: KATABASIS_MUSIC_VOLUME, ms: TRANSIT_HOLD_MS };
    case 'ascending':
      return { target: 0, ms: TRANSIT_HOLD_MS };
    case 'statues':
    case 'sigils':
      return {
        target: KATABASIS_MUSIC_VOLUME,
        ms: openedOn === 'descending' ? 0 : SCORE_RESUME_MS,
      };
    case 'ledger':
      return { target: 0, ms: 0 };
  }
}

/**
 * Katabasis — the cinematic demonic descent (02 §6/§10), rebuilt from the Claude Design handoff and
 * wired to the real live model. It opens from the Altar Room's sigil ("Altar sigil" handoff): on the
 * Ledger (STATUS QUO, pre-commit), or already committed on the descent. The internal screen
 * (`descending → statues ⇄ sigils → ascending`) is local; offering pours Devotion through the store
 * immediately, binding moves souls to the seals (recoverable until you rise), and the ascent
 * transition commits the lifetime via `confirmKatabasis`, which lands straight back in the room (no
 * recap screen, ADR-043). Rendered for the `menu` phase.
 */
export function Katabasis(): ReactElement {
  const state = useGameStore((s) => s.state);
  const entry = useGameStore((s) => s.katabasisEntry);
  const confirm = useGameStore((s) => s.confirmKatabasis);
  const close = useGameStore((s) => s.closeKatabasis);

  // Before the commit (`inKatabasis === false`) the only screen is the Ledger. Once committed, the
  // altar sigil's descent plays the Exstinctio transition first; a save written mid-Katabasis and
  // reopened resumes on the Princes, where the player was. Lazy init: mount-time state only.
  const [screen, setScreen] = useState<Screen>(() =>
    state?.inKatabasis !== true ? 'ledger' : entry === 'descent' ? 'descending' : 'statues',
  );
  const [caption, setCaption] = useState(false);
  const [riseArmed, setRiseArmed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Ambient score: it plays the whole time you are down in Katabasis, rising with the descent and
  // falling with the Anabasis (see `scoreCourse`).
  const [openedOn] = useState(screen);
  const course = scoreCourse(screen, openedOn);
  useAmbientScore(audioRef, course.target, course.ms);

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
  const rise = (): void => {
    setRiseArmed(false);
    setScreen('ascending');
  };
  const armOrRise = (): void => {
    if (riseArmed) rise();
    else setRiseArmed(true);
  };

  const inHell = screen === 'statues' || screen === 'sigils';
  // Once Semet is named the Princes' scene holds only the Semet screen, whose Accept is the rise.
  const semetUp = screen === 'statues' && eternalSinRevealed(state);

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

      {screen === 'ledger' && <Ledger state={state} onBack={() => close()} />}
      {screen === 'descending' && <Transition kind="descending" onDone={arrive} />}
      {screen === 'ascending' && <Transition kind="ascending" onDone={() => confirm()} />}

      {screen === 'statues' && (
        <StatuesPlace state={state} ended={ended} showCaption={caption} onAccept={rise} />
      )}
      {screen === 'sigils' && <AetherSigils state={state} onModalChange={setModalOpen} />}

      {inHell && <Hud souls={state.souls} />}
      {inHell && !modalOpen && !semetUp && (
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
