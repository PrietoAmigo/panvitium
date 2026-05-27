import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import {
  SINS,
  sinLevel,
  devotionForLevel,
  floor,
  sub,
  gte,
  ZERO,
  MAX_SIN_LEVEL,
  type GameState,
  type Sin,
} from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum } from '../game/format.js';

/** Four pips, `level` of them filled — the Sin's 0..4 progress at a glance. */
function levelPips(level: number): string {
  let out = '';
  for (let i = 0; i < MAX_SIN_LEVEL; i++) out += i < level ? '●' : '○';
  return out;
}

/** One Prince's offering card: current level/Devotion and a button to reach the next level. */
function PrinceCard({ sin, state }: { sin: Sin; state: GameState }): ReactElement {
  const offer = useGameStore((s) => s.offerToNextLevel);
  const info = strings.sins[sin];
  const devotion = state.devotion[sin];
  const level = sinLevel(devotion);
  const maxed = level >= MAX_SIN_LEVEL;
  const needed = maxed ? ZERO : sub(devotionForLevel(level + 1), devotion);
  const affordable = !maxed && gte(floor(state.souls), needed);

  return (
    <div className="prince-card">
      <div className="prince-head">
        <span className="prince-name">{info.prince}</span>
        <span className="prince-sin">
          {info.latin} · {info.english}
        </span>
      </div>
      <div className="prince-pips" aria-label={`level ${level} of ${MAX_SIN_LEVEL}`}>
        {levelPips(level)}
      </div>
      <div className="prince-devotion">{formatBigNum(devotion)}</div>
      {maxed ? (
        <div className="prince-mastered">{strings.katabasis.mastered}</div>
      ) : (
        <button
          type="button"
          className="opera-btn prince-offer"
          disabled={!affordable}
          onClick={() => offer(sin)}
        >
          {strings.katabasis.offer} {formatBigNum(needed)} → {strings.katabasis.level} {level + 1}
        </button>
      )}
    </div>
  );
}

function KatabasisMenu(): ReactElement {
  const state = useGameStore((s) => s.state);
  const notice = useGameStore((s) => s.notice);
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
        {notice !== null && <p className="opera-notice">{notice}</p>}
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

/** The carved-in-stone, full-screen Katabasis flow (02 §6/§10). */
export function KatabasisModal(): ReactElement | null {
  const phase = useGameStore((s) => s.katabasisPhase);
  if (phase === 'menu') return <KatabasisMenu />;
  if (phase === 'recap') return <KatabasisRecapView />;
  return null;
}
