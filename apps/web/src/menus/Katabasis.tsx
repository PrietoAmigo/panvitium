import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { strings } from '@panvitium/shared';
import {
  SINS,
  sinLevel,
  MAX_SIN_LEVEL,
  SIGIL_IDS,
  sigilById,
  sigilVisible,
  eternalSinVisible,
  eternalSinRevealed,
  eternalProgress,
  ETERNAL_SIN_THRESHOLD,
  floor,
  isZero,
  bn,
  type Sin,
  type GameState,
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum } from '../game/format.js';

// ── Press-and-hold offering (delta-ramping) ──────────────────────────────────
// Souls are BigNum and grow without bound, so a fixed +1 per tick is useless late-game. Instead each
// step pours an exponentially rising *amount*: a tap moves one soul; the longer the hold, the bigger
// the step. Every step reads fresh state through the store action, so it clamps to the pool / bound.
const HOLD_BASE = 1;
const HOLD_GROWTH = 8;
const HOLD_RAMP_MS = 1000;
const HOLD_STEP_MS = 80;
const HOLD_MAX_STEP = 1e15;

function HoldButton({
  onStep,
  disabled = false,
  className = '',
  children,
  ariaLabel,
}: {
  onStep: (delta: number) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}): ReactElement {
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const lastRef = useRef(0);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
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
    rafRef.current = requestAnimationFrame(frame);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }, [disabled, frame, stop]);

  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      className={`kat-hold ${className}`}
      disabled={disabled}
      onPointerDown={begin}
      onPointerLeave={stop}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
    >
      {children}
    </button>
  );
}

function pips(level: number): string {
  let out = '';
  for (let i = 0; i < MAX_SIN_LEVEL; i++) out += i < level ? '\u25C6' : '\u25C7';
  return out;
}

/** One Prince's offering card — live Devotion + level, offering pours straight into `state.devotion`. */
function PrinceCard({ sin, state }: { sin: Sin; state: GameState }): ReactElement {
  const offer = useGameStore((s) => s.offer);
  const info = strings.sins[sin];
  const devotion = state.devotion[sin];
  const level = sinLevel(devotion);
  const maxed = level >= MAX_SIN_LEVEL;
  const poolEmpty = isZero(floor(state.souls));
  return (
    <div className="prince-card">
      <div className="prince-head">
        <span className="prince-name">{info.prince}</span>
        <span className="prince-sin">
          {info.latin} · {info.english}
        </span>
      </div>
      <span className="prince-pips" aria-label={`level ${level} of ${MAX_SIN_LEVEL}`}>
        {pips(level)}
      </span>
      <span className="prince-devotion">
        {formatBigNum(devotion)}
        {maxed ? ` · ${strings.katabasis.mastered}` : ''}
      </span>
      <HoldButton
        className="offer-hold"
        disabled={maxed || poolEmpty}
        onStep={(d) => offer(sin, d)}
        ariaLabel={`${strings.katabasis.holdOffer} — ${info.prince}`}
      >
        {strings.katabasis.holdOffer}
      </HoldButton>
    </div>
  );
}

/** The Eternal Sin (03 §8): the blacked-out ninth, offerable once every Cardinal Sin is maxed. */
function EternalSinCard({ state }: { state: GameState }): ReactElement {
  const offerEternal = useGameStore((s) => s.offerEternal);
  const revealed = eternalSinRevealed(state);
  const progress = eternalProgress(state);
  const poolEmpty = isZero(floor(state.souls));
  return (
    <div className={`prince-card eternal-card${revealed ? ' eternal-card--revealed' : ''}`}>
      <div className="prince-head">
        <span className="prince-name eternal-name">
          {revealed ? strings.eternal.name : strings.eternal.unknown}
        </span>
        <span className="prince-sin">
          {revealed ? strings.eternal.epithet : strings.eternal.ninth}
        </span>
      </div>
      <span className="prince-devotion">
        {formatBigNum(state.eternalDevotion)} / {formatBigNum(bn(ETERNAL_SIN_THRESHOLD))}
      </span>
      <div className="prince-progress eternal-progress">
        <span
          className="prince-progress-fill"
          style={{ width: `${(progress * 100).toFixed(2)}%` }}
        />
      </div>
      {revealed ? (
        <div className="prince-mastered eternal-mastered">{strings.eternal.complete}</div>
      ) : (
        <HoldButton
          className="offer-hold eternal-hold"
          disabled={poolEmpty}
          onStep={(d) => offerEternal(d)}
          ariaLabel={strings.katabasis.holdOffer}
        >
          {strings.katabasis.holdOffer}
        </HoldButton>
      )}
    </div>
  );
}

/** One visible sigil's card — bind/free souls live (recoverable, 02 §5). */
function SigilCard({ id, state }: { id: number; state: GameState }): ReactElement | null {
  const bindMore = useGameStore((s) => s.bindMore);
  const bindLess = useGameStore((s) => s.bindLess);
  const def = sigilById(id);
  if (!def || !sigilVisible(state, def)) return null;
  const current = state.sigilBindings[id] ?? bn(0);
  const poolEmpty = isZero(floor(state.souls));
  const name = strings.sigils.names[id] ?? def.name;
  const desc = strings.sigils.descriptions[id] ?? '';
  const bound = current.gt(0);
  return (
    <div className={`sigil-card${bound ? ' sigil-card--bound' : ''}`}>
      <div className="sigil-head">
        <span className="sigil-seal">{id}</span>
        <div className="sigil-meta">
          <span className="sigil-name">{name}</span>
          <span className="sigil-desc">{desc}</span>
        </div>
        <span className="sigil-bound">{formatBigNum(current)}</span>
      </div>
      <div className="sigil-actions">
        <HoldButton
          className="sigil-bind"
          disabled={poolEmpty}
          onStep={(d) => bindMore(id, d)}
          ariaLabel={`${strings.sigils.lock} — ${name}`}
        >
          {strings.sigils.lock}
        </HoldButton>
        <HoldButton
          className="sigil-free"
          disabled={isZero(current)}
          onStep={(d) => bindLess(id, d)}
          ariaLabel={`${strings.sigils.unlock} — ${name}`}
        >
          {strings.sigils.unlock}
        </HoldButton>
      </div>
    </div>
  );
}

/**
 * Katabasis — the demonic descent, in the designed full-screen two-page shell, wired to the real
 * live model: offering pours Devotion immediately, binding moves souls to seals immediately (both
 * recoverable until you rise), and Ascend commits the lifetime via the store. Rendered for the
 * `menu` phase; the recap and Eternal-Sin reveal remain their own views.
 */
export function Katabasis(): ReactElement {
  const state = useGameStore((s) => s.state);
  const confirm = useGameStore((s) => s.confirmKatabasis);
  const [page, setPage] = useState<'sins' | 'goetia'>('sins');
  if (!state) return <div className="katabasis" />;

  return (
    <div className="katabasis" role="dialog" aria-label={strings.katabasis.title}>
      <div className="kat-embers" aria-hidden="true" />
      <div className="kat-inner">
        <h1 className="kat-title">{strings.katabasis.title}</h1>
        <p className="kat-intro">{strings.katabasis.intro}</p>
        <p className="kat-pool">
          {strings.katabasis.pool} <strong>{formatBigNum(state.souls)}</strong>
        </p>

        <div className="kat-pager" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={page === 'sins'}
            className={'kat-tab' + (page === 'sins' ? ' kat-tab--active' : '')}
            onClick={() => setPage('sins')}
          >
            {strings.katabasis.pageSins}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={page === 'goetia'}
            className={'kat-tab' + (page === 'goetia' ? ' kat-tab--active' : '')}
            onClick={() => setPage('goetia')}
          >
            {strings.katabasis.pageSigils}
          </button>
        </div>

        {page === 'sins' ? (
          <div className="prince-grid">
            {SINS.map((sin) => (
              <PrinceCard key={sin} sin={sin} state={state} />
            ))}
            {eternalSinVisible(state) && <EternalSinCard state={state} />}
          </div>
        ) : (
          <div className="sigil-grid">
            {SIGIL_IDS.map((id) => (
              <SigilCard key={id} id={id} state={state} />
            ))}
          </div>
        )}

        <button type="button" className="kat-ascend" onClick={() => confirm()}>
          {strings.katabasis.confirm}
        </button>
      </div>
    </div>
  );
}
