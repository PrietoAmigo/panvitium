import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { strings } from '@panvitium/shared';
import {
  SINS,
  sinLevel,
  skillIntensity,
  devotionForLevel,
  floor,
  sub,
  div,
  isZero,
  MAX_SIN_LEVEL,
  ETERNAL_SIN_THRESHOLD,
  eternalSinVisible,
  eternalSinRevealed,
  eternalProgress,
  gameRuntimeMs,
  SIGIL_IDS,
  sigilById,
  sigilVisible,
  sigilStrength,
  bn,
  type GameState,
  type Sin,
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';

/** Four pips, `level` of them filled — the Sin's 0..4 progress at a glance. */
function levelPips(level: number): string {
  let out = '';
  for (let i = 0; i < MAX_SIN_LEVEL; i++) out += i < level ? '\u25CF' : '\u25CB';
  return out;
}

// ── Press-and-hold offering ──────────────────────────────────────────────────
// One button, held down, pours souls in at an exponentially rising rate: a quick tap moves a single
// soul; the longer the hold, the larger each step. Each step reads fresh state through the store
// action, so it naturally clamps to the available pool (offering) or to what is bound (freeing).
const HOLD_BASE = 1; // souls on the first step (a tap)
const HOLD_GROWTH = 8; // multiply the per-step amount…
const HOLD_RAMP_MS = 1000; // …for every second the button stays down
const HOLD_STEP_MS = 80; // ~12 steps a second
const HOLD_MAX_STEP = 1e15; // keep a single step well under MAX_SAFE_INTEGER

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
    lastRef.current = now - HOLD_STEP_MS; // fire one step immediately on press
    rafRef.current = requestAnimationFrame(frame);
    // Anchor release on the window: a button that becomes disabled mid-hold (pool drained) would
    // not itself fire pointerup, which would otherwise leave the loop spinning on no-op steps.
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }, [disabled, frame, stop]);

  // Tidy up if the component unmounts mid-hold (e.g. page flip or descent).
  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      className={`hold-btn ${className}`}
      disabled={disabled}
      onPointerDown={begin}
      onPointerLeave={stop}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
    >
      {children}
    </button>
  );
}

/**
 * One Prince's offering card. Offering is continuous: any amount raises the skill intensity, and a
 * level is reached naturally once cumulative Devotion crosses its 180^X threshold (02 §4).
 */
function PrinceCard({ sin, state }: { sin: Sin; state: GameState }): ReactElement {
  const offer = useGameStore((s) => s.offer);
  const info = strings.sins[sin];
  const devotion = state.devotion[sin];
  const level = sinLevel(devotion);
  const maxed = level >= MAX_SIN_LEVEL;
  const pool = floor(state.souls);

  const lower = devotionForLevel(level);
  const upper = devotionForLevel(level + 1);
  const span = sub(upper, lower);
  const ratio =
    maxed || isZero(span)
      ? 1
      : Math.max(0, Math.min(1, div(sub(devotion, lower), span).toNumber()));

  return (
    <div className="prince-card">
      <div className="prince-head">
        <span className="prince-name">{info.prince}</span>
        <span className="prince-sin">
          {info.latin} · {info.english}
        </span>
      </div>
      <div className="prince-stats">
        <span className="prince-pips" aria-label={`level ${level} of ${MAX_SIN_LEVEL}`}>
          {levelPips(level)}
        </span>
        <span className="prince-skill">
          {strings.katabasis.skill} {skillIntensity(devotion).toFixed(2)}
        </span>
      </div>
      <div className="prince-devotion">
        {formatBigNum(devotion)}
        {maxed ? '' : ` / ${formatBigNum(upper)}`}
      </div>
      {maxed ? (
        <div className="prince-mastered">{strings.katabasis.mastered}</div>
      ) : (
        <>
          <div className="prince-progress">
            <span
              className="prince-progress-fill"
              style={{ width: `${(ratio * 100).toFixed(1)}%` }}
            />
          </div>
          <HoldButton
            className="offer-hold"
            disabled={isZero(pool)}
            onStep={(d) => offer(sin, d)}
            ariaLabel={`${strings.katabasis.holdOffer} — ${info.prince}`}
          >
            {strings.katabasis.holdOffer}
          </HoldButton>
        </>
      )}
    </div>
  );
}

/**
 * The Eternal Sin card (03 §8). Appears below the eight Princes once every Cardinal Sin is maxed —
 * a blacked-out ninth, offerable but unnamed, until cumulative offering reaches the threshold and
 * Semet is revealed. Offering it raises the reveal screen the moment it crosses.
 */
function EternalSinCard({ state }: { state: GameState }): ReactElement {
  const offerEternal = useGameStore((s) => s.offerEternal);
  const revealed = eternalSinRevealed(state);
  const progress = eternalProgress(state);
  const pool = floor(state.souls);
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
      <div className="prince-devotion">
        {formatBigNum(state.eternalDevotion)} / {formatBigNum(bn(ETERNAL_SIN_THRESHOLD))}
      </div>
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
          disabled={isZero(pool)}
          onStep={(d) => offerEternal(d)}
          ariaLabel={strings.katabasis.holdOffer}
        >
          {strings.katabasis.holdOffer}
        </HoldButton>
      )}
    </div>
  );
}

/**
 * One bound sigil's row: name, current bound souls + live effect strength, and the two hold buttons.
 * Binding is recoverable (02 §5) — holding Bind pours souls in, holding Free draws them back out,
 * both at the exponential hold rate.
 */
function SigilRow({ id, state }: { id: number; state: GameState }): ReactElement | null {
  const bindMore = useGameStore((s) => s.bindMore);
  const bindLess = useGameStore((s) => s.bindLess);
  const def = sigilById(id);
  if (!def || !sigilVisible(state, def)) return null;
  const current = state.sigilBindings[id] ?? bn(0);
  const pool = floor(state.souls);
  const strength = sigilStrength(def, current);
  const name = strings.sigils.names[id] ?? def.name;
  return (
    <div className="sigil-row">
      <div className="sigil-meta">
        <span className="sigil-name">{name}</span>
        <span className="sigil-effect">{strings.sigils.descriptions[id] ?? ''}</span>
      </div>
      <div className="sigil-bound">
        {formatBigNum(current)}
        {strength > 0 ? <span className="sigil-strength"> · +{strength.toFixed(2)}</span> : null}
      </div>
      <div className="sigil-actions">
        <HoldButton
          className="sigil-lock"
          disabled={isZero(pool)}
          onStep={(d) => bindMore(id, d)}
          ariaLabel={`${strings.sigils.lock} — ${name}`}
        >
          {strings.sigils.lock}
        </HoldButton>
        <HoldButton
          className="sigil-unlock"
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

/** The sigil-binding page (02 §5) — the recoverable prestige axis. */
function SigilPanel({ state }: { state: GameState }): ReactElement {
  return (
    <div className="sigil-panel">
      <h2 className="sigil-heading">{strings.sigils.heading}</h2>
      <p className="sigil-intro">{strings.sigils.intro}</p>
      <div className="sigil-list">
        {SIGIL_IDS.map((id) => (
          <SigilRow key={id} id={id} state={state} />
        ))}
      </div>
    </div>
  );
}

type KatabasisPage = 'sins' | 'sigils';

function KatabasisMenu(): ReactElement {
  const state = useGameStore((s) => s.state);
  const confirm = useGameStore((s) => s.confirmKatabasis);
  const [page, setPage] = useState<KatabasisPage>('sins');
  if (!state) return <div className="katabasis" />;

  return (
    <div className="katabasis" role="dialog" aria-label={strings.katabasis.title}>
      <div className="katabasis-inner">
        <h1 className="katabasis-title">{strings.katabasis.title}</h1>
        <p className="katabasis-intro">{strings.katabasis.intro}</p>
        <div className="katabasis-pool">
          {strings.katabasis.pool}: <strong>{formatBigNum(state.souls)}</strong>
        </div>

        <div className="kat-pager" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={page === 'sins'}
            className={`kat-tab${page === 'sins' ? ' kat-tab--active' : ''}`}
            onClick={() => setPage('sins')}
          >
            {strings.katabasis.pageSins}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={page === 'sigils'}
            className={`kat-tab${page === 'sigils' ? ' kat-tab--active' : ''}`}
            onClick={() => setPage('sigils')}
          >
            {strings.katabasis.pageSigils}
          </button>
        </div>

        {page === 'sins' ? (
          <>
            <div className="prince-grid">
              {SINS.map((sin) => (
                <PrinceCard key={sin} sin={sin} state={state} />
              ))}
            </div>
            {eternalSinVisible(state) && (
              <>
                <p className="eternal-herald">{strings.eternal.herald}</p>
                <EternalSinCard state={state} />
              </>
            )}
          </>
        ) : (
          <SigilPanel state={state} />
        )}

        <div className="kat-nav">
          <button
            type="button"
            className="kat-arrow"
            disabled={page === 'sins'}
            onClick={() => setPage('sins')}
          >
            ‹ {strings.katabasis.prev}
          </button>
          <button
            type="button"
            className="kat-arrow"
            disabled={page === 'sigils'}
            onClick={() => setPage('sigils')}
          >
            {strings.katabasis.next} ›
          </button>
        </div>

        <div className="katabasis-actions">
          <button type="button" className="opera-btn" onClick={() => confirm()}>
            {strings.katabasis.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="recap-row">
      <span className="recap-label">{label}</span>
      <span className="recap-value">{value}</span>
    </div>
  );
}

function KatabasisRecapView(): ReactElement {
  const recap = useGameStore((s) => s.recap);
  const close = useGameStore((s) => s.closeRecap);
  if (!recap) return <div className="katabasis recap" />;

  return (
    <div className="katabasis recap" role="dialog" aria-label={strings.katabasis.recapTitle}>
      <div className="recap-inner">
        <h1 className="recap-title">{strings.katabasis.recapTitle}</h1>
        <RecapRow label={strings.katabasis.soulsCarried} value={formatBigNum(recap.soulsCarried)} />
        <RecapRow label={strings.katabasis.goldKept} value={formatBigNum(recap.goldKept)} />
        <RecapRow
          label={strings.katabasis.reprobatesKept}
          value={recap.reprobatesKept.toLocaleString('en-US')}
        />
        <RecapRow
          label={strings.katabasis.maleficiaKept}
          value={String(recap.maleficiaKept.length)}
        />
        <RecapRow
          label={strings.katabasis.maleficiaLost}
          value={String(recap.maleficiaLost.length)}
        />
        <button type="button" className="opera-btn recap-rise" onClick={() => close()}>
          {strings.katabasis.rise}
        </button>
      </div>
    </div>
  );
}

/**
 * The Eternal-Sin reveal (03 §8, 01) — the credits roll. A black screen: the name Semet, the
 * closing Latin verse, and the total runtime as the score. The game continues afterward; this is a
 * milestone, not a wall. Dismissed via the store flag (revealed-ness itself persists in state).
 */
function EternalRevealModal(): ReactElement {
  const state = useGameStore((s) => s.state);
  const dismiss = useGameStore((s) => s.dismissEternalReveal);
  const runtime = state ? gameRuntimeMs(state) : 0;
  return (
    <div className="eternal-reveal" role="dialog" aria-label={strings.eternal.name}>
      <div className="eternal-reveal-inner">
        <p className="eternal-reveal-kicker">{strings.eternal.revealKicker}</p>
        <h1 className="eternal-reveal-name">{strings.eternal.name}</h1>
        <p className="eternal-reveal-gloss">{strings.eternal.gloss}</p>
        <blockquote className="eternal-reveal-verse">{strings.eternal.verse}</blockquote>
        <div className="eternal-reveal-score">
          <span className="eternal-reveal-score-label">{strings.eternal.scoreLabel}</span>
          <span className="eternal-reveal-score-value">{formatDuration(runtime)}</span>
        </div>
        <button
          type="button"
          className="opera-btn eternal-reveal-dismiss"
          onClick={() => dismiss()}
        >
          {strings.eternal.dismiss}
        </button>
      </div>
    </div>
  );
}

/** The carved-in-stone, full-screen Katabasis flow (02 §6/§10) plus the Eternal-Sin reveal. */
export function KatabasisModal(): ReactElement | null {
  const phase = useGameStore((s) => s.katabasisPhase);
  const eternalReveal = useGameStore((s) => s.eternalReveal);
  // The reveal supersedes everything the moment the threshold is crossed.
  if (eternalReveal) return <EternalRevealModal />;
  if (phase === 'menu') return <KatabasisMenu />;
  if (phase === 'recap') return <KatabasisRecapView />;
  return null;
}
