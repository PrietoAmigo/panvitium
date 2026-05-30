import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { gameRuntimeMs } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';
import { Katabasis } from '../menus/Katabasis.js';

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

/**
 * The carved-in-stone, full-screen Katabasis flow (02 §6/§10) plus the Eternal-Sin reveal. The menu
 * phase renders the designed two-page descent (`menus/Katabasis`); the recap and reveal are their
 * own views.
 */
export function KatabasisModal(): ReactElement | null {
  const phase = useGameStore((s) => s.katabasisPhase);
  const eternalReveal = useGameStore((s) => s.eternalReveal);
  // The reveal supersedes everything the moment the threshold is crossed.
  if (eternalReveal) return <EternalRevealModal />;
  if (phase === 'menu') return <Katabasis />;
  if (phase === 'recap') return <KatabasisRecapView />;
  return null;
}
