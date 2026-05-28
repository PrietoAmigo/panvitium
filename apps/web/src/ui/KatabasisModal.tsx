import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import {
  SINS,
  sinLevel,
  skillIntensity,
  devotionForLevel,
  floor,
  sub,
  div,
  gte,
  isZero,
  MAX_SIN_LEVEL,
  ETERNAL_SIN_THRESHOLD,
  eternalSinVisible,
  eternalSinRevealed,
  eternalProgress,
  gameRuntimeMs,
  bn,
  type GameState,
  type Sin,
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';

/** Four pips, `level` of them filled — the Sin's 0..4 progress at a glance. */
function levelPips(level: number): string {
  let out = '';
  for (let i = 0; i < MAX_SIN_LEVEL; i++) out += i < level ? '●' : '○';
  return out;
}

/** Fixed quick-offer amounts; players can stack these to reach any total, down to a single soul. */
const QUICK_AMOUNTS: { label: string; amount: number }[] = [
  { label: '+1', amount: 1 },
  { label: '+10', amount: 10 },
  { label: '+100', amount: 100 },
  { label: '+1K', amount: 1000 },
];

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
          <div className="prince-offer-row">
            {QUICK_AMOUNTS.map((q) => (
              <button
                key={q.label}
                type="button"
                className="offer-chip"
                disabled={!gte(pool, q.amount)}
                onClick={() => offer(sin, q.amount)}
              >
                {q.label}
              </button>
            ))}
            <button
              type="button"
              className="offer-chip offer-all"
              disabled={isZero(pool)}
              onClick={() => offer(sin, state.souls)}
            >
              {strings.katabasis.offerAll}
            </button>
          </div>
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
        <div className="prince-offer-row">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q.label}
              type="button"
              className="offer-chip"
              disabled={!gte(pool, q.amount)}
              onClick={() => offerEternal(q.amount)}
            >
              {q.label}
            </button>
          ))}
          <button
            type="button"
            className="offer-chip offer-all"
            disabled={isZero(pool)}
            onClick={() => offerEternal(state.souls)}
          >
            {strings.katabasis.offerAll}
          </button>
        </div>
      )}
    </div>
  );
}

function KatabasisMenu(): ReactElement {
  const state = useGameStore((s) => s.state);
  const confirm = useGameStore((s) => s.confirmKatabasis);
  const close = useGameStore((s) => s.closeKatabasis);
  if (!state) return <div className="katabasis" />;

  return (
    <div className="katabasis" role="dialog" aria-label={strings.katabasis.title}>
      <div className="katabasis-inner">
        <h1 className="katabasis-title">{strings.katabasis.title}</h1>
        <p className="katabasis-intro">{strings.katabasis.intro}</p>
        <div className="katabasis-pool">
          {strings.katabasis.pool}: <strong>{formatBigNum(state.souls)}</strong>
        </div>
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
        <p className="katabasis-deferred">{strings.katabasis.sigilsDeferred}</p>
        <div className="katabasis-actions">
          <button type="button" className="opera-btn" onClick={() => confirm()}>
            {strings.katabasis.confirm}
          </button>
          <button type="button" className="opera-btn error-reset" onClick={() => close()}>
            {strings.katabasis.notYet}
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
